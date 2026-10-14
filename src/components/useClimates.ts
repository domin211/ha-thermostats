"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Climate, ControlRequest, StatesResponse } from "@/lib/types";

const POLL_MS = 5000;
const HOLD_MS = 9000; // keep optimistic values while HA catches up

type Override = { target?: number; state?: string; until: number };

export function useClimates(initial: StatesResponse | null) {
  const [data, setData] = useState<StatesResponse | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/climates", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json as StatesResponse);
      setError(null);
      setFetchError(false);
    } catch (e) {
      setError((e as Error).message);
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (alive) timer.current = setTimeout(loop, POLL_MS);
    };
    timer.current = setTimeout(loop, initial ? POLL_MS : 0);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, initial]);

  const climates = useMemo<Climate[]>(() => {
    const now = Date.now();
    return (data?.climates ?? []).map((c) => {
      const o = overrides[c.id];
      if (!o || o.until < now) return c;
      return {
        ...c,
        target: o.target ?? c.target,
        state: o.state ?? c.state,
        action: o.state === "off" ? "off" : c.action,
      };
    });
  }, [data, overrides]);

  const send = useCallback(
    async (req: ControlRequest) => {
      const until = Date.now() + HOLD_MS;
      setOverrides((prev) => {
        const next = { ...prev };
        for (const id of req.entityIds) {
          next[id] = {
            ...next[id],
            until,
            ...(req.action === "set_temperature" ? { target: req.temperature } : { state: req.mode }),
          };
        }
        return next;
      });
      setBusy((n) => n + 1);
      try {
        const res = await fetch("/api/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setError(null);
        setTimeout(refresh, 1200);
      } catch (e) {
        setError((e as Error).message);
        setOverrides((prev) => {
          const next = { ...prev };
          for (const id of req.entityIds) delete next[id];
          return next;
        });
      } finally {
        setBusy((n) => n - 1);
      }
    },
    [refresh],
  );

  return { data, climates, error, fetchError, busy: busy > 0, send, refresh };
}

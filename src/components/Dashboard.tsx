"use client";

import { useMemo, useState } from "react";
import {
  AREAS,
  areaOf,
  displayName,
  groupRooms,
  isHeating,
  isOn,
  KIND_LABEL,
  reading,
} from "@/lib/areas";
import type { AreaKey, Climate, ControlRequest, StatesResponse } from "@/lib/types";
import { Modes, Power, Reading, Setpoint, Status } from "./Controls";
import { useClimates } from "./useClimates";

type Filter = "all" | "on" | "heating" | "fault";
type Send = (r: ControlRequest) => void;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on", label: "On" },
  { key: "heating", label: "Heating" },
  { key: "fault", label: "Faults" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function matches(c: Climate, q: string, f: Filter) {
  if (f === "on" && !isOn(c)) return false;
  if (f === "heating" && !isHeating(c) && c.action !== "cooling") return false;
  if (f === "fault" && reading(c).kind === "ok") return false;
  if (!q) return true;
  const hay = norm(`${c.name} ${displayName(c)} ${c.id}`);
  return norm(q).split(/\s+/).every((t) => hay.includes(t));
}

function clock(iso?: string) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function Dashboard({ initial }: { initial: StatesResponse | null }) {
  const { data, climates, error, busy, send } = useClimates(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [area, setArea] = useState<AreaKey | "all">("all");

  const byArea = useMemo(() => {
    const m: Record<AreaKey, Climate[]> = { rooms: [], common: [], wellness: [], staff: [], ac: [] };
    for (const c of climates) m[areaOf(c)].push(c);
    return m;
  }, [climates]);

  const stats = useMemo(
    () => ({
      total: climates.length,
      on: climates.filter(isOn).length,
      heating: climates.filter(isHeating).length,
      faults: climates.filter((c) => reading(c).kind === "fault").length,
    }),
    [climates],
  );

  const readOnly = data?.readOnly ?? false;
  const guardedSend: Send = (r) => {
    if (readOnly) return;
    send(r);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <div className="brand-name">Climate control</div>
            <div className="brand-sub">
              <span className={`led ${error ? "led-err" : data?.source === "live" ? "led-ok" : "led-mock"}`} />
              {error ? "Connection problem" : data?.source === "live" ? "Home Assistant, live" : "Demo data"}
              <span className="sep">·</span>
              <span className="mono">{clock(data?.fetchedAt)}</span>
              {busy && <span className="sep">· sending</span>}
            </div>
          </div>
        </div>
        <dl className="stats">
          <div><dt>Zones</dt><dd>{stats.total}</dd></div>
          <div><dt>On</dt><dd>{stats.on}</dd></div>
          <div className="stat-heat"><dt>Heating</dt><dd>{stats.heating}</dd></div>
          <div className={stats.faults ? "stat-fault" : ""}><dt>Faults</dt><dd>{stats.faults}</dd></div>
        </dl>
        <form action="/api/logout" method="post" className="logout">
          <button type="submit" className="btn btn-ghost">Lock</button>
        </form>
      </header>

      {(error || readOnly) && (
        <div className={`notice${error ? " notice-err" : ""}`} role="status">
          {error ? error : "Read-only mode. Changes are disabled on this server."}
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
          <input
            type="search"
            placeholder="Find a room or zone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search zones"
          />
        </div>
        <div className="seg" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-active" : ""} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="areas" aria-label="Areas">
        <button type="button" className={area === "all" ? "is-active" : ""} onClick={() => setArea("all")}>
          Everything
        </button>
        {AREAS.map((a) => (
          <button key={a.key} type="button" className={area === a.key ? "is-active" : ""} onClick={() => setArea(a.key)}>
            <span className="code">{a.code}</span>
            {a.label}
            <span className="count">{byArea[a.key].length}</span>
          </button>
        ))}
      </nav>

      <main>
        {AREAS.filter((a) => area === "all" || area === a.key).map((a) => {
          const all = byArea[a.key];
          const shown = all.filter((c) => matches(c, q, filter));
          if (shown.length === 0 && (q || filter !== "all")) return null;
          return (
            <section key={a.key} className="area" id={a.key}>
              <AreaHeader code={a.code} label={a.label} list={all} send={guardedSend} isAc={a.key === "ac"} readOnly={readOnly} />
              {a.key === "rooms" ? (
                <div className="grid grid-rooms">
                  {groupRooms(shown).map((g) => (
                    <article key={g.room} className="card room">
                      <header className="card-head">
                        <span className="room-no">{String(g.room).padStart(2, "0")}</span>
                        <span className="room-label">Room</span>
                      </header>
                      {g.zones.map(({ kind, climate }) => (
                        <ZoneRow key={climate.id} c={climate} label={KIND_LABEL[kind]} send={guardedSend} />
                      ))}
                    </article>
                  ))}
                </div>
              ) : a.key === "ac" ? (
                <div className="grid grid-ac">
                  {shown.map((c) => (
                    <AcCard key={c.id} c={c} send={guardedSend} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-zones">
                  {shown.map((c) => (
                    <article key={c.id} className="card zone">
                      <ZoneRow c={c} label={displayName(c)} send={guardedSend} wide />
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>
      <footer className="foot">
        <span>Readings above 60 °C are treated as sensor faults.</span>
        <span className="mono">{stats.total} zones</span>
      </footer>
    </div>
  );
}

function ZoneRow({ c, label, send, wide }: { c: Climate; label: string; send: Send; wide?: boolean }) {
  const heating = isHeating(c);
  return (
    <div className={`zone-row${heating ? " is-heating" : ""}${c.state === "off" ? " is-off" : ""}${wide ? " zone-row-wide" : ""}`}>
      <div className="zone-meta">
        <span className="zone-name" title={`${c.name} · ${c.id}`}>{label}</span>
        <Status c={c} />
      </div>
      <div className="zone-now">
        <Reading c={c} />
      </div>
      <div className="zone-ctl">
        <Setpoint c={c} send={send} compact />
        <Power c={c} send={send} />
      </div>
    </div>
  );
}

function AcCard({ c, send }: { c: Climate; send: Send }) {
  return (
    <article className={`card ac${c.state !== "off" ? " is-on" : ""}`}>
      <header className="ac-head">
        <div className="zone-meta">
          <span className="zone-name">{displayName(c)}</span>
          <Status c={c} />
        </div>
        <Power c={c} send={send} onMode={c.modes.includes("cool") ? "cool" : "heat"} />
      </header>
      <div className="ac-body">
        <div>
          <div className="label">Room</div>
          <Reading c={c} size="lg" />
        </div>
        <div className="ac-set">
          <div className="label">Target</div>
          {c.target !== null || c.state !== "off" ? <Setpoint c={c} send={send} /> : <span className="muted small">Set when on</span>}
        </div>
      </div>
      <Modes c={c} send={send} />
      {c.fanMode && <div className="ac-fan small muted">Fan {c.fanMode.replace(/_/g, " ")}</div>}
    </article>
  );
}

function AreaHeader({
  code,
  label,
  list,
  send,
  isAc,
  readOnly,
}: {
  code: string;
  label: string;
  list: Climate[];
  send: Send;
  isAc: boolean;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(21);
  const ids = list.map((c) => c.id);
  const on = list.filter(isOn).length;
  const heating = list.filter(isHeating).length;

  const confirmSend = (msg: string, r: ControlRequest) => {
    if (window.confirm(`${msg}\n\nThis affects ${ids.length} zones in ${label.toLowerCase()}.`)) send(r);
  };

  return (
    <div className="area-head">
      <div className="area-title">
        <span className="area-code">{code}</span>
        <h2>{label}</h2>
        <span className="area-sum">
          {on}/{list.length} on{heating ? <> · <b className="heat-txt">{heating} heating</b></> : null}
        </span>
      </div>
      <div className="area-actions">
        <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={readOnly}>
          Group
          <svg viewBox="0 0 12 12" aria-hidden className={open ? "chev is-open" : "chev"}><path d="M3 4.5 6 7.5 9 4.5" /></svg>
        </button>
      </div>
      {open && (
        <div className="bulk">
          <button type="button" className="btn" onClick={() => confirmSend(`Turn off all ${label.toLowerCase()}?`, { action: "set_hvac_mode", entityIds: ids, mode: "off" })}>
            All off
          </button>
          {!isAc && (
            <button type="button" className="btn" onClick={() => confirmSend(`Switch all ${label.toLowerCase()} to heat?`, { action: "set_hvac_mode", entityIds: ids, mode: "heat" })}>
              All on
            </button>
          )}
          <div className="bulk-set">
            <button type="button" className="step" onClick={() => setTemp((t) => Math.max(5, t - 0.5))} aria-label="Lower group setpoint">
              <svg viewBox="0 0 12 12" aria-hidden><path d="M2 6h8" /></svg>
            </button>
            <span className="setpoint-value">{temp.toFixed(1)}</span>
            <button type="button" className="step" onClick={() => setTemp((t) => Math.min(32, t + 0.5))} aria-label="Raise group setpoint">
              <svg viewBox="0 0 12 12" aria-hidden><path d="M2 6h8M6 2v8" /></svg>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                confirmSend(`Set all ${label.toLowerCase()} to ${temp.toFixed(1)} °C?`, {
                  action: "set_temperature",
                  entityIds: list.filter((c) => c.state !== "off" || !isAc).map((c) => c.id),
                  temperature: temp,
                })
              }
            >
              Set all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AREAS,
  areaOf,
  displayName,
  groupRooms,
  isAc,
  isHeating,
  isOn,
  KIND_LABEL,
  MODE_LABEL,
  reading,
} from "@/lib/areas";
import type { AreaKey, Climate, ControlRequest, StatesResponse } from "@/lib/types";
import { Dial, FanRing, ToneIcon, toneOf } from "./Dial";
import { useClimates } from "./useClimates";

type Filter = "all" | "on" | "heating" | "fault";
type Send = (r: ControlRequest) => void;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on", label: "On" },
  { key: "heating", label: "Active" },
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

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "--" : v.toFixed(1));

export function statusLine(c: Climate): string {
  const r = reading(c);
  const now = r.kind === "ok" ? `${r.value.toFixed(1)}°` : r.kind === "fault" ? "Fault" : "--°";
  if (c.unavailable) return "Unavailable";
  if (c.state === "off") return `${now} · Off`;
  if (c.action === "heating") return `${now} · Heating`;
  if (c.action === "cooling") return `${now} · Cooling`;
  if (c.action === "idle" || c.state === "heat") return `${now} · Idle`;
  return `${now} · ${MODE_LABEL[c.state] ?? c.state}`;
}

function tileLine(c: Climate): string {
  if (c.unavailable) return "Unavailable";
  if (c.state === "off") return "Off";
  const set = c.target !== null ? `${fmt(c.target)}°` : MODE_LABEL[c.state] ?? c.state;
  if (c.action === "heating") return `${set} · Heating`;
  if (c.action === "cooling") return `${set} · Cooling`;
  if (isAc(c)) return `${set} · ${MODE_LABEL[c.state] ?? c.state}`;
  return `${set} · Idle`;
}

function DialCenter({ c, big }: { c: Climate; big?: boolean }) {
  const r = reading(c);
  return (
    <>
      {r.kind === "ok" ? (
        <span className="dial-num">{big ? r.value.toFixed(1) : Math.round(r.value * 10) / 10}</span>
      ) : r.kind === "fault" ? (
        <span className="dial-fault">Sensor<br />fault</span>
      ) : (
        <span className="dial-num dial-num-none">--</span>
      )}
      <ToneIcon c={c} />
    </>
  );
}

export function Dashboard({ initial }: { initial: StatesResponse | null }) {
  const { data, climates, error, busy, send } = useClimates(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [area, setArea] = useState<AreaKey | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

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
    if (!readOnly) send(r);
  };
  const open = openId ? climates.find((c) => c.id === openId) ?? null : null;

  const tile = (c: Climate, label: string) => (
    <button key={c.id} type="button" className="tile" onClick={() => setOpenId(c.id)}>
      <Dial c={c} center={<DialCenter c={c} />} arc={{ value: (() => { const r = reading(c); return r.kind === "ok" ? r.value : null; })(), min: 10, max: 30 }} />
      <span className="tile-name">{label}</span>
      <span className={`tile-sub tone-${toneOf(c)}`}>{tileLine(c)}</span>
    </button>
  );

  return (
    <div className="shell">
      <header className="top">
        <div className="top-row">
          <div>
            <div className="eyebrow">
              <span className={`dot ${error ? "dot-err" : data?.source === "live" ? "dot-ok" : "dot-mock"}`} />
              {error ? "Connection problem" : data?.source === "live" ? "Home Assistant" : "Demo data"}
              {busy && " · Sending"}
            </div>
            <h1 className="large-title">Thermostat</h1>
          </div>
          <form action="/api/logout" method="post">
            <button type="submit" className="pill-btn">Lock</button>
          </form>
        </div>
        <div className="summary">
          <span><b>{stats.on}</b> of {stats.total} on</span>
          <span className="tone-heat"><b>{stats.heating}</b> heating</span>
          {stats.faults > 0 && <span className="tone-fault"><b>{stats.faults}</b> sensor faults</span>}
        </div>
      </header>

      {(error || readOnly) && (
        <div className={`banner${error ? " banner-err" : ""}`} role="status">
          {error ?? "Read-only mode. Changes are disabled on this server."}
        </div>
      )}

      <div className="controls">
        <label className="search">
          <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
          <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search zones" />
        </label>
        <div className="segmented" role="tablist" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-on" : ""} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="chips" aria-label="Areas">
        <button type="button" className={area === "all" ? "is-on" : ""} onClick={() => setArea("all")}>All areas</button>
        {AREAS.map((a) => (
          <button key={a.key} type="button" className={area === a.key ? "is-on" : ""} onClick={() => setArea(a.key)}>
            {a.label}
          </button>
        ))}
      </nav>

      <main>
        {AREAS.filter((a) => area === "all" || area === a.key).map((a) => {
          const all = byArea[a.key];
          const shown = all.filter((c) => matches(c, q, filter));
          if (shown.length === 0 && (q || filter !== "all")) return null;
          return (
            <section key={a.key} className="section">
              <SectionHead label={a.label} list={all} send={guardedSend} ac={a.key === "ac"} readOnly={readOnly} />
              {a.key === "rooms" ? (
                <div className="rooms">
                  {groupRooms(shown).map((g) => (
                    <div key={g.room} className="room">
                      <div className="room-title">Room {g.room}</div>
                      <div className="dials">
                        {g.zones.map(({ kind, climate }) => tile(climate, KIND_LABEL[kind]))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dials dials-flat">{shown.map((c) => tile(c, displayName(c)))}</div>
              )}
            </section>
          );
        })}
      </main>

      <footer className="foot">Readings above 60° are shown as sensor faults. Design after “Apple Thermostat” by Takistar.</footer>

      {open && <Detail c={open} send={guardedSend} readOnly={readOnly} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle${on ? " is-on" : ""}`} onClick={onChange} disabled={disabled}>
      <span />
    </button>
  );
}

function Detail({ c, send, onClose, readOnly }: { c: Climate; send: Send; onClose: () => void; readOnly: boolean }) {
  const [pending, setPending] = useState<number | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = "";
      if (t.current) clearTimeout(t.current);
    };
  }, [onClose]);

  const target = pending ?? c.target;
  const on = c.state !== "off" && !c.unavailable;
  const canSet = on && target !== null && !readOnly;
  const commit = (v: number, delay: number) => {
    setPending(v);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      send({ action: "set_temperature", entityIds: [c.id], temperature: v });
      setTimeout(() => setPending(null), 600);
    }, delay);
  };
  const bump = (d: 1 | -1) => {
    if (target === null) return;
    commit(Math.min(c.max, Math.max(c.min, Math.round((target + d * (c.step || 0.5)) * 10) / 10)), 650);
  };
  const r = reading(c);
  const ac = isAc(c);
  const onMode = ac ? (c.modes.includes("cool") ? "cool" : c.modes.find((m) => m !== "off") ?? "heat") : "heat";
  const fanLevels = ["low", "low_mid", "mid", "medium", "mid_high", "high", "turbo"];
  const fanIdx = c.fanMode ? fanLevels.indexOf(c.fanMode) : -1;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={displayName(c)}>
      <div className="sheet-inner">
        <div className="sheet-bar">
          <button type="button" className="back" onClick={onClose}>
            <svg viewBox="0 0 12 20" aria-hidden><path d="M10 2 2 10l8 8" /></svg>
            Back
          </button>
        </div>
        <h2 className="sheet-title">{displayName(c)}</h2>
        <p className="sheet-sub">{statusLine(c)}</p>

        <div className="big-dial">
          <Dial
            c={c}
            size="lg"
            value={pending}
            onDrag={canSet ? (v, done) => commit(v, done ? 150 : 100000) : undefined}
            center={
              <>
                <span className="dial-label">{on ? "Set to" : "Off"}</span>
                <span className="dial-num dial-num-lg">{on ? fmt(target) : "--"}</span>
                <ToneIcon c={c} />
              </>
            }
          />
        </div>
        <div className="steppers">
          <button type="button" className="round-btn" onClick={() => bump(-1)} disabled={!canSet || target! <= c.min} aria-label="Lower">
            <svg viewBox="0 0 20 20" aria-hidden><path d="M4 10h12" /></svg>
          </button>
          <div className="now">
            <span className="now-label">Now</span>
            <span className={`now-val${r.kind === "fault" ? " tone-fault" : ""}`}>
              {r.kind === "ok" ? `${r.value.toFixed(1)}°` : r.kind === "fault" ? "Sensor fault" : "--°"}
            </span>
          </div>
          <button type="button" className="round-btn" onClick={() => bump(1)} disabled={!canSet || target! >= c.max} aria-label="Raise">
            <svg viewBox="0 0 20 20" aria-hidden><path d="M4 10h12M10 4v12" /></svg>
          </button>
        </div>

        <div className="group">
          <div className="row">
            <span>Power</span>
            <Toggle on={on} label="Power" disabled={readOnly || c.unavailable} onChange={() => send({ action: "set_hvac_mode", entityIds: [c.id], mode: on ? "off" : onMode })} />
          </div>
          {ac && (
            <div className="row row-stack">
              <span>Mode</span>
              <div className="segmented segmented-full" role="radiogroup" aria-label="Mode">
                {c.modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={c.state === m}
                    className={c.state === m ? "is-on" : ""}
                    disabled={readOnly || c.unavailable}
                    onClick={() => c.state !== m && send({ action: "set_hvac_mode", entityIds: [c.id], mode: m })}
                  >
                    {MODE_LABEL[m] ?? m}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {ac && c.fanMode && (
          <div className="fan-block">
            <FanRing levels={fanIdx >= 0 ? 6 : 6} active={fanIdx >= 0 ? Math.max(1, Math.round(((fanIdx + 1) / fanLevels.length) * 6)) : 6} label={c.fanMode === "auto" ? "Auto" : c.fanMode.replace(/_/g, " ")} />
            <span className="tile-sub">Fan speed</span>
          </div>
        )}

        <div className="group">
          <div className="row"><span>Current</span><span className="row-val">{r.kind === "ok" ? `${r.value.toFixed(1)}°C` : r.kind === "fault" ? `Fault (${r.raw}°)` : "No reading"}</span></div>
          <div className="row"><span>Target</span><span className="row-val">{c.target === null ? "--" : `${c.target.toFixed(1)}°C`}</span></div>
          <div className="row"><span>Range</span><span className="row-val">{c.min}° – {c.max}°</span></div>
          <div className="row"><span>Entity</span><span className="row-val mono">{c.id}</span></div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ label, list, send, ac, readOnly }: { label: string; list: Climate[]; send: Send; ac: boolean; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(21);
  const ids = list.map((c) => c.id);
  const on = list.filter(isOn).length;
  const ask = (msg: string, r: ControlRequest) => {
    if (window.confirm(`${msg}\n\nThis affects ${r.entityIds.length} zones.`)) send(r);
  };
  return (
    <>
      <div className="section-head">
        <h2>{label}</h2>
        <span className="section-count">{on}/{list.length} on</span>
        <button type="button" className="pill-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={readOnly}>
          {open ? "Done" : "Edit all"}
        </button>
      </div>
      {open && (
        <div className="group group-bulk">
          <button type="button" className="row row-btn" onClick={() => ask(`Turn off all ${label.toLowerCase()}?`, { action: "set_hvac_mode", entityIds: ids, mode: "off" })}>
            <span>Turn all off</span><span className="chev">›</span>
          </button>
          {!ac && (
            <button type="button" className="row row-btn" onClick={() => ask(`Switch all ${label.toLowerCase()} to heat?`, { action: "set_hvac_mode", entityIds: ids, mode: "heat" })}>
              <span>Turn all on</span><span className="chev">›</span>
            </button>
          )}
          <div className="row">
            <span>Set all to</span>
            <div className="mini-step">
              <button type="button" onClick={() => setTemp((v) => Math.max(5, v - 0.5))} aria-label="Lower group setpoint">−</button>
              <span>{temp.toFixed(1)}°</span>
              <button type="button" onClick={() => setTemp((v) => Math.min(32, v + 0.5))} aria-label="Raise group setpoint">+</button>
              <button
                type="button"
                className="apply"
                onClick={() =>
                  ask(`Set all ${label.toLowerCase()} to ${temp.toFixed(1)}°?`, {
                    action: "set_temperature",
                    entityIds: list.filter((c) => !ac || (c.state !== "off" && c.target !== null)).map((c) => c.id),
                    temperature: temp,
                  })
                }
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

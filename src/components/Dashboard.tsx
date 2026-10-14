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
import type { ZoneKind } from "@/lib/areas";
import type { AreaKey, Climate, ControlRequest, StatesResponse } from "@/lib/types";
import { Dial, ToneIcon, toneOf } from "./Dial";
import { useClimates } from "./useClimates";

type Filter = "all" | "on" | "heating" | "fault";
type Send = (r: ControlRequest) => void;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Vše" },
  { key: "on", label: "Zapnuté" },
  { key: "heating", label: "Topí" },
  { key: "fault", label: "Poruchy" },
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
  const now = r.kind === "ok" ? `${r.value.toFixed(1)}°` : r.kind === "fault" ? "Porucha" : "--°";
  if (c.unavailable) return "Nedostupné";
  if (c.state === "off") return `${now} · Vypnuto`;
  if (isHeating(c)) return `${now} · Topí`;
  if (c.action === "cooling") return `${now} · Chladí`;
  if (c.action === "idle" || c.state === "heat") return `${now} · Nečinný`;
  return `${now} · ${MODE_LABEL[c.state] ?? c.state}`;
}

function tileLine(c: Climate): string {
  if (c.unavailable) return "Nedostupné";
  if (c.state === "off") return "Vypnuto";
  if (isHeating(c)) return "Topí";
  if (c.action === "cooling") return "Chladí";
  if (isAc(c)) return MODE_LABEL[c.state] ?? c.state;
  return "Nečinný";
}

/** Rooms with both a bathroom and a WC thermostat (14, 15) get one combined "Koupelna" dial. */
function mergeBath(zones: { kind: ZoneKind; climate: Climate }[]): { kind: ZoneKind; climate: Climate; ids?: string[] }[] {
  const bath = zones.find((z) => z.kind === "bath");
  const wc = zones.find((z) => z.kind === "wc");
  if (!bath || !wc) return zones;
  const b = bath.climate;
  const w = wc.climate;
  const heating = isHeating(b) || isHeating(w);
  const merged: Climate = {
    ...b,
    state: b.state !== "off" || w.state !== "off" ? (b.state !== "off" ? b.state : w.state) : "off",
    action: heating ? "heating" : b.action ?? w.action,
    min: Math.max(b.min, w.min),
    max: Math.min(b.max, w.max),
  };
  return [...zones.filter((z) => z !== bath && z !== wc), { kind: "bath", climate: merged, ids: [b.id, w.id] }];
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
    if (!readOnly) send(r);
  };

  const tile = (c: Climate, label: string) => <Tile key={c.id} c={c} label={label} send={guardedSend} readOnly={readOnly} />;

  return (
    <div className="shell">
      <header className="top">
        <div className="top-row">
          <div>
            <div className="eyebrow">
              <span className={`dot ${error ? "dot-err" : data?.source === "live" ? "dot-ok" : "dot-mock"}`} />
              {error ? "Chyba připojení" : data?.source === "live" ? "Home Assistant" : "Ukázková data"}
              {busy && " · Odesílám"}
            </div>
            <h1 className="large-title">Termostaty</h1>
          </div>
          <form action="/api/logout" method="post">
            <button type="submit" className="pill-btn">Zamknout</button>
          </form>
        </div>
        <div className="summary">
          <span><b>{stats.on}</b> z {stats.total} zapnuto</span>
          <span className="tone-heat"><b>{stats.heating}</b> topí</span>
          {stats.faults > 0 && <span className="tone-fault"><b>{stats.faults}</b> poruch čidel</span>}
        </div>
      </header>

      {(error || readOnly) && (
        <div className={`banner${error ? " banner-err" : ""}`} role="status">
          {error ?? "Režim jen pro čtení. Změny jsou na tomto serveru vypnuté."}
        </div>
      )}

      <div className="controls">
        <label className="search">
          <svg viewBox="0 0 16 16" aria-hidden><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
          <input type="search" placeholder="Hledat" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hledat zóny" />
        </label>
        <div className="segmented" role="tablist" aria-label="Filtr">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-on" : ""} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="chips" aria-label="Oblasti">
        <button type="button" className={area === "all" ? "is-on" : ""} onClick={() => setArea("all")}>Všechny oblasti</button>
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
                      <div className="room-title">Pokoj {g.room}</div>
                      <div className="dials">
                        {mergeBath(g.zones).map((z) =>
                          z.ids ? (
                            <Tile key={z.climate.id} c={z.climate} ids={z.ids} label="Koupelna" send={guardedSend} readOnly={readOnly} />
                          ) : (
                            tile(z.climate, KIND_LABEL[z.kind])
                          ),
                        )}
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

      <footer className="foot">Hodnoty nad 60 °C jsou zobrazeny jako porucha čidla. Design podle „Apple Thermostat“ od Takistar.</footer>

    </div>
  );
}

const SHORT: Record<string, string> = { off: "Vyp", heat: "Topit", cool: "Chladit", dry: "Sušit", auto: "Auto", fan_only: "Vent", heat_cool: "T/Ch" };

function Tile({ c, label, send, readOnly, ids }: { c: Climate; label: string; send: Send; readOnly: boolean; ids?: string[] }) {
  const targets = ids ?? [c.id];
  const [pending, setPending] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);

  const r = reading(c);
  const target = pending ?? c.target ?? Math.min(c.max, Math.max(c.min, 21));
  const canSet = !readOnly;
  const ac = isAc(c);

  const commit = (v: number, delay: number) => {
    setPending(v);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      send({ action: "set_temperature", entityIds: targets, temperature: v });
      setTimeout(() => setPending(null), 1500);
    }, delay);
  };
  const bump = (d: 1 | -1) => {
    if (target === null) return;
    commit(Math.min(c.max, Math.max(c.min, Math.round((target + d * (c.step || 0.5)) * 10) / 10)), 700);
  };

  const nowTxt = r.kind === "ok" ? `${r.value.toFixed(1)}°` : r.kind === "fault" ? "porucha" : "--°";
  let big: React.ReactNode;
  let small: React.ReactNode;
  if (dragging && target !== null) {
    big = <span className="dial-num">{fmt(target)}</span>;
    small = <span className="dial-small">nyní {nowTxt}</span>;
  } else if (r.kind === "fault") {
    big = <span className="dial-fault">Porucha<br />čidla</span>;
    small = target !== null ? <span className="dial-small">nastaveno {fmt(target)}°</span> : null;
  } else {
    big = <span className={`dial-num${r.kind === "none" ? " dial-num-none" : ""}`}>{r.kind === "ok" ? r.value.toFixed(1) : "--"}</span>;
    small = target !== null ? <span className={`dial-small${pending !== null ? " is-pending" : ""}`}>nastaveno {fmt(target)}°</span> : null;
  }

  return (
    <div className="tile">
      <Dial
        c={c}
        value={target}
        onDrag={
          canSet
            ? (v, done) => {
                setDragging(!done);
                if (done) commit(v, 0);
                else {
                  if (t.current) clearTimeout(t.current);
                  setPending(v);
                }
              }
            : undefined
        }
        center={
          <>
            {big}
            {small}
            <span className="dial-icon"><ToneIcon c={c} /></span>
          </>
        }
      />
      <div className="tile-ctl">
        <button type="button" className="mini-round" onClick={() => bump(-1)} disabled={!canSet || target! <= c.min} aria-label={`${label}: snížit`}>
          <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10" /></svg>
        </button>
        <button type="button" className="mini-round" onClick={() => bump(1)} disabled={!canSet || target! >= c.max} aria-label={`${label}: zvýšit`}>
          <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10M10 5v10" /></svg>
        </button>
      </div>
      <span className="tile-name" title={`${c.name} · ${c.id}`}>{label}</span>
      <span className={`tile-sub tone-${toneOf(c)}`}>{tileLine(c)}</span>
      {ac && (
        <div className="modes-mini" role="radiogroup" aria-label={`${label}: režim`}>
          {c.modes
            .filter((m) => m !== "off")
            .sort((a, b) => ["auto", "heat_cool", "cool", "heat", "dry", "fan_only"].indexOf(a) - ["auto", "heat_cool", "cool", "heat", "dry", "fan_only"].indexOf(b))
            .map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={c.state === m}
              className={c.state === m ? "is-on" : ""}
              disabled={readOnly}
              onClick={() => c.state !== m && send({ action: "set_hvac_mode", entityIds: [c.id], mode: m })}
            >
              {SHORT[m] ?? m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHead({ label, list, send, ac, readOnly }: { label: string; list: Climate[]; send: Send; ac: boolean; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(21);
  const ids = list.map((c) => c.id);
  const on = list.filter(isOn).length;
  const ask = (msg: string, r: ControlRequest) => {
    if (window.confirm(`${msg}\n\nTýká se zón: ${r.entityIds.length}.`)) send(r);
  };
  return (
    <>
      <div className="section-head">
        <h2>{label}</h2>
        <span className="section-count">{on}/{list.length} zapnuto</span>
        <button type="button" className="pill-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)} disabled={readOnly}>
          {open ? "Hotovo" : "Upravit vše"}
        </button>
      </div>
      {open && (
        <div className="group group-bulk">
          <button type="button" className="row row-btn" onClick={() => ask(`Vypnout vše v sekci ${label}?`, { action: "set_hvac_mode", entityIds: ids, mode: "off" })}>
            <span>Vypnout vše</span><span className="chev">›</span>
          </button>
          {!ac && (
            <button type="button" className="row row-btn" onClick={() => ask(`Zapnout topení v celé sekci ${label}?`, { action: "set_hvac_mode", entityIds: ids, mode: "heat" })}>
              <span>Zapnout vše</span><span className="chev">›</span>
            </button>
          )}
          <div className="row">
            <span>Nastavit vše na</span>
            <div className="mini-step">
              <button type="button" onClick={() => setTemp((v) => Math.max(5, v - 0.5))} aria-label="Snížit teplotu skupiny">−</button>
              <span>{temp.toFixed(1)}°</span>
              <button type="button" onClick={() => setTemp((v) => Math.min(32, v + 0.5))} aria-label="Zvýšit teplotu skupiny">+</button>
              <button
                type="button"
                className="apply"
                onClick={() =>
                  ask(`Nastavit celou sekci ${label} na ${temp.toFixed(1)} °C?`, {
                    action: "set_temperature",
                    entityIds: list.filter((c) => !ac || (c.state !== "off" && c.target !== null)).map((c) => c.id),
                    temperature: temp,
                  })
                }
              >
                Použít
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

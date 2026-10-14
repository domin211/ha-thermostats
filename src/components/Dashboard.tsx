"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AREAS, ROOM_AREAS, areaOf, displayName, groupRooms, isAc, isHeating, isOn, KIND_LABEL, reading } from "@/lib/areas";
import type { RoomGroup, ZoneKind } from "@/lib/areas";
import type { AreaKey, Climate, ControlRequest, StatesResponse } from "@/lib/types";
import { Dial, ToneIcon } from "./Dial";
import { useClimates } from "./useClimates";

type Filter = "all" | "on" | "heating" | "fault";
type Send = (r: ControlRequest) => void;

const STEP = 1;

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

const whole = (v: number) => Math.round(v);

/** Combine several thermostats into one dial. First entity supplies the reading and target. */
function combine(list: Climate[], average = false): Climate {
  const [b, ...rest] = list;
  const all = [b, ...rest];
  const valid = all.map(reading).flatMap((r) => (r.kind === "ok" ? [r.value] : []));
  const current = average ? (valid.length ? Math.round((valid.reduce((x, y) => x + y, 0) / valid.length) * 10) / 10 : null) : b.current;
  const heating = all.some(isHeating);
  const anyOn = all.find((c) => c.state !== "off");
  return {
    ...b,
    state: anyOn ? anyOn.state : "off",
    current,
    action: heating ? "heating" : b.action,
    min: Math.max(...all.map((c) => c.min)),
    max: Math.min(...all.map((c) => c.max)),
  };
}

interface Zone {
  key: string;
  label: string;
  climate: Climate;
  ids: string[];
}
interface Group {
  key: string;
  title: string;
  zones: Zone[];
}

const czPlural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/** Turn room groups into display groups: room 1 is the office, rooms 14 + 15 are one physical room. */
function buildGroups(groups: RoomGroup[]): Group[] {
  const out: Group[] = [];
  const g14 = groups.find((g) => g.room === 14);
  const g15 = groups.find((g) => g.room === 15);
  for (const g of groups) {
    if (g.room === 15 && g14) continue;
    if (g.room === 14 || (g.room === 15 && !g14)) {
      const zones = [...(g14?.zones ?? []), ...(g15?.zones ?? [])];
      const rooms = zones.filter((z) => z.kind === "room").map((z) => z.climate);
      // bathroom reading comes from 14_koupelna, so sort it first
      const baths = zones
        .filter((z) => z.kind !== "room")
        .map((z) => z.climate)
        .sort((a, b) => (a.id === "climate.14_koupelna" ? -1 : b.id === "climate.14_koupelna" ? 1 : a.id.localeCompare(b.id)));
      const z: Zone[] = [];
      if (rooms.length) z.push({ key: "14r", label: "Pokoj", climate: combine(rooms), ids: rooms.map((c) => c.id) });
      if (baths.length) z.push({ key: "14b", label: "Koupelna", climate: combine(baths), ids: baths.map((c) => c.id) });
      out.push({ key: "r14", title: "Pokoj 14", zones: z });
      continue;
    }
    const office = g.room === 1;
    out.push({
      key: `r${g.room}`,
      title: office ? "Kancelář" : `Pokoj ${g.room}`,
      zones: g.zones.map(({ kind, climate }: { kind: ZoneKind; climate: Climate }) => ({
        key: climate.id,
        label: office && kind === "room" ? "Kancelář" : KIND_LABEL[kind],
        climate,
        ids: [climate.id],
      })),
    });
  }
  return out;
}

function clock(iso?: string) {
  return iso ? new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) : "";
}

export function Dashboard({ initial }: { initial: StatesResponse | null }) {
  const { data, climates, error, busy, send } = useClimates(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [area, setArea] = useState<AreaKey | "all">("all");

  const byArea = useMemo(() => {
    const m = Object.fromEntries(AREAS.map((a) => [a.key, [] as Climate[]])) as Record<AreaKey, Climate[]>;
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

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-meta">
          <span className={`dot ${error ? "dot-err" : data?.source === "live" ? "dot-ok" : "dot-mock"}`} />
          <span>{error ? "Chyba připojení" : data?.source === "live" ? "Home Assistant" : "Ukázková data"}</span>
          {data?.fetchedAt && !error && <span className="hero-time">aktualizováno {clock(data.fetchedAt)}</span>}
          {busy && <span className="hero-time">· odesílám</span>}
        </div>
        <h1 className="hero-title">Termostaty</h1>
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-num">{stats.heating}</span>
            <span className="stat-label">{czPlural(stats.heating, "topí", "topí", "topí")}</span>
          </div>
          <div className="stat">
            <span className="stat-num stat-neutral">{stats.on}</span>
            <span className="stat-label">zapnuto z {stats.total}</span>
          </div>
          {stats.faults > 0 && (
            <div className="stat">
              <span className="stat-num stat-fault">{stats.faults}</span>
              <span className="stat-label">{czPlural(stats.faults, "porucha čidla", "poruchy čidel", "poruch čidel")}</span>
            </div>
          )}
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
        <button type="button" className={area === "all" ? "is-on" : ""} onClick={() => setArea("all")}>Vše</button>
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
          if (shown.length === 0) return null;
          const on = all.filter(isOn).length;
          return (
            <section key={a.key} className="section">
              <div className="section-head">
                <h2>{a.label}</h2>
                <span className="section-count">{on}/{all.length} zapnuto</span>
              </div>
              {ROOM_AREAS.includes(a.key) ? (
                <div className="rooms">
                  {buildGroups(groupRooms(shown)).map((g) => (
                    <div key={g.key} className="room">
                      <div className="room-title">{g.title}</div>
                      <div className="dials">
                        {g.zones.map((z) => (
                          <Tile key={z.key} c={z.climate} ids={z.ids} label={z.label} send={guardedSend} readOnly={readOnly} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : a.key === "corridors" ? (
                <div className="dials dials-flat">
                  {(
                    [
                      ["Červené chodby", /^climate\.cervena_/],
                      ["Modré chodby", /^climate\.modra_/],
                    ] as const
                  ).map(([label, re]) => {
                    const members = shown.filter((c) => re.test(c.id));
                    if (!members.length) return null;
                    return <Tile key={label} c={combine(members, true)} ids={members.map((c) => c.id)} label={label} send={guardedSend} readOnly={readOnly} />;
                  })}
                </div>
              ) : (
                <div className="dials dials-flat">
                  {shown.map((c) => (
                    <Tile key={c.id} c={c} ids={[c.id]} label={displayName(c)} send={guardedSend} readOnly={readOnly} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>

    </div>
  );
}

const SHORT: Record<string, string> = { off: "Vyp", heat: "Topit", cool: "Chladit", dry: "Sušit", auto: "Auto", fan_only: "Vent", heat_cool: "T/Ch" };
const MODE_ORDER = ["off", "auto", "heat_cool", "cool", "heat", "dry", "fan_only"];

function Tile({ c, label, send, readOnly, ids }: { c: Climate; label: string; send: Send; readOnly: boolean; ids: string[] }) {
  const [pending, setPending] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);

  const r = reading(c);
  const lo = Math.ceil(c.min);
  const hi = Math.floor(c.max);
  const target = pending ?? (c.target !== null ? whole(c.target) : Math.min(hi, Math.max(lo, 21)));
  const ac = isAc(c);

  const commit = (v: number, delay: number) => {
    setPending(v);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      send({ action: "set_temperature", entityIds: ids, temperature: v });
      setTimeout(() => setPending(null), 1500);
    }, delay);
  };
  const bump = (d: 1 | -1) => commit(Math.min(hi, Math.max(lo, target + d * STEP)), 700);

  let big: React.ReactNode;
  let small: React.ReactNode;
  const nowTxt = r.kind === "ok" ? `${r.value.toFixed(1)}°` : r.kind === "fault" ? "porucha" : "--°";
  if (dragging) {
    big = <span className="dial-num">{target}°</span>;
    small = <span className="dial-small">nyní {nowTxt}</span>;
  } else if (r.kind === "fault") {
    big = <span className="dial-fault">Porucha<br />čidla</span>;
    small = <span className="dial-small">nastaveno {target}°</span>;
  } else {
    big = <span className={`dial-num${r.kind === "none" ? " dial-num-none" : ""}`}>{r.kind === "ok" ? r.value.toFixed(1) : "--"}</span>;
    small = <span className={`dial-small${pending !== null ? " is-pending" : ""}`}>nastaveno {target}°</span>;
  }

  return (
    <div className="tile">
      <Dial
        c={{ ...c, min: lo, max: hi, step: STEP }}
        value={target}
        onDrag={
          readOnly
            ? undefined
            : (v, done) => {
                setDragging(!done);
                if (done) commit(v, 0);
                else {
                  if (t.current) clearTimeout(t.current);
                  setPending(v);
                }
              }
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
        <button type="button" className="mini-round" onClick={() => bump(-1)} disabled={readOnly || target <= lo} aria-label={`${label}: snížit`}>
          <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10" /></svg>
        </button>
        <button type="button" className="mini-round" onClick={() => bump(1)} disabled={readOnly || target >= hi} aria-label={`${label}: zvýšit`}>
          <svg viewBox="0 0 20 20" aria-hidden><path d="M5 10h10M10 5v10" /></svg>
        </button>
      </div>
      <span className="tile-name" title={ids.join(", ")}>{label}</span>
      {ac && (
        <div className="modes-mini" role="radiogroup" aria-label={`${label}: režim`}>
          {[...c.modes]
            .sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b))
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

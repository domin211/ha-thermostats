import type { AreaKey, Climate } from "./types";

export const FAULT_LIMIT = 60;

export const AREAS: { key: AreaKey; label: string; code: string }[] = [
  { key: "rooms", label: "Guest rooms", code: "A" },
  { key: "common", label: "Common areas", code: "B" },
  { key: "wellness", label: "Wellness", code: "C" },
  { key: "staff", label: "Staff & offices", code: "D" },
  { key: "ac", label: "Air conditioning", code: "E" },
];

const WELLNESS = /^climate\.(vatna|sprchy_.*|pred_saunou|zchl_baz|bazen_.*|sauna|zchlazovaci_bazen)$/;
const STAFF = /^climate\.(satna_personal.*|kancelar|1|1_wc)$/;
const ROOM = /^climate\.(\d+)(?:_(pokoj|koupelna|wc))?$/;

export const isAc = (c: Climate) => c.modes.some((m) => m !== "off" && m !== "heat");

export function areaOf(c: Climate): AreaKey {
  if (isAc(c)) return "ac";
  if (WELLNESS.test(c.id)) return "wellness";
  if (STAFF.test(c.id)) return "staff";
  if (ROOM.test(c.id)) return "rooms";
  return "common";
}

export type ZoneKind = "room" | "bath" | "wc";

export function roomInfo(c: Climate): { room: number; kind: ZoneKind } | null {
  const m = ROOM.exec(c.id);
  if (!m) return null;
  const n = Number(m[1]);
  const suffix = m[2];
  // climate.2 = room, climate.2_wc = its bathroom (friendly name "Koupelna 2")
  let kind: ZoneKind = "room";
  if (suffix === "koupelna") kind = "bath";
  else if (suffix === "wc") kind = /koupeln/i.test(c.name) ? "bath" : "wc";
  return { room: n, kind };
}

export const KIND_LABEL: Record<ZoneKind, string> = { room: "Room", bath: "Bath", wc: "WC" };
const KIND_ORDER: Record<ZoneKind, number> = { room: 0, bath: 1, wc: 2 };

export interface RoomGroup {
  room: number;
  zones: { kind: ZoneKind; climate: Climate }[];
}

export function groupRooms(list: Climate[]): RoomGroup[] {
  const map = new Map<number, RoomGroup>();
  for (const c of list) {
    const info = roomInfo(c);
    if (!info) continue;
    const g = map.get(info.room) ?? { room: info.room, zones: [] };
    g.zones.push({ kind: info.kind, climate: c });
    map.set(info.room, g);
  }
  for (const g of map.values()) g.zones.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return [...map.values()].sort((a, b) => a.room - b.room);
}

const PRETTY: Record<string, string> = {
  "climate.cervena_chodba_priz": "Red corridor, ground floor",
  "climate.cervena_chodba_patro": "Red corridor, first floor",
  "climate.cervena_schodiste": "Red staircase",
  "climate.modra_chodba_prizemi": "Blue corridor, ground floor",
  "climate.modra_chodba_patro": "Blue corridor, first floor",
  "climate.modra_schodiste": "Blue staircase",
  "climate.bazen_p": "Pool, right",
  "climate.bazen_l": "Pool, left",
  "climate.zchl_baz": "Plunge pool",
  "climate.zchlazovaci_bazen": "Plunge pool water",
  "climate.pred_saunou": "Sauna anteroom",
  "climate.sprchy_z": "Showers, women",
  "climate.sprchy_m": "Showers, men",
  "climate.wc_z": "WC, women",
  "climate.wc_m": "WC, men",
  "climate.vchod": "Entrance",
  "climate.sal": "Hall",
  "climate.schody": "Stairs",
  "climate.kancelar": "Office",
  "climate.satna_personal": "Staff changing room",
  "climate.satna_personal_wc": "Staff WC",
  "climate.satna_personal_spr": "Staff shower",
  "climate.kancelar_moje": "My office",
  "climate.kancl_dole": "Office, downstairs",
  "climate.kuchyne": "Kitchen",
  "climate.klimatizace_bar": "Bar",
};

export function displayName(c: Climate): string {
  if (PRETTY[c.id]) return PRETTY[c.id];
  const n = c.name;
  // Turn SHOUTING names into sentence case, keep accents.
  if (n === n.toUpperCase() && /[A-Z]/.test(n)) {
    const s = n.toLowerCase().replace(/,/g, ", ").replace(/\s+/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return n;
}

export type Reading =
  | { kind: "ok"; value: number }
  | { kind: "fault"; raw: number }
  | { kind: "none" };

export function reading(c: Climate): Reading {
  if (c.current === null) return { kind: "none" };
  if (c.current > FAULT_LIMIT || c.current < -30) return { kind: "fault", raw: c.current };
  return { kind: "ok", value: c.current };
}

export const isOn = (c: Climate) => c.state !== "off" && !c.unavailable;
export const isHeating = (c: Climate) => c.action === "heating";

export const MODE_LABEL: Record<string, string> = {
  off: "Off",
  heat: "Heat",
  cool: "Cool",
  dry: "Dry",
  auto: "Auto",
  fan_only: "Fan",
  heat_cool: "H/C",
};

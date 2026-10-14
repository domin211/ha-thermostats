import type { AreaKey, Climate } from "./types";

export const FAULT_LIMIT = 60;

export const AREAS: { key: AreaKey; label: string; code: string }[] = [
  { key: "rooms", label: "Pokoje", code: "A" },
  { key: "common", label: "Společné prostory", code: "B" },
  { key: "wellness", label: "Wellness", code: "C" },
  { key: "staff", label: "Personál a kanceláře", code: "D" },
  { key: "ac", label: "Klimatizace", code: "E" },
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

export const KIND_LABEL: Record<ZoneKind, string> = { room: "Pokoj", bath: "Koupelna", wc: "WC" };
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
  "climate.cervena_chodba_priz": "Červená chodba, přízemí",
  "climate.cervena_chodba_patro": "Červená chodba, patro",
  "climate.cervena_schodiste": "Červené schodiště",
  "climate.modra_chodba_prizemi": "Modrá chodba, přízemí",
  "climate.modra_chodba_patro": "Modrá chodba, patro",
  "climate.modra_schodiste": "Modré schodiště",
  "climate.vatna": "Vatna",
  "climate.bazen_p": "Bazén P",
  "climate.bazen_l": "Bazén L",
  "climate.zchl_baz": "Ochlazovací bazén",
  "climate.zchlazovaci_bazen": "Ochlazovací bazén, voda",
  "climate.pred_saunou": "Před saunou",
  "climate.sauna": "Sauna",
  "climate.sprchy_z": "Sprchy Ž",
  "climate.sprchy_m": "Sprchy M",
  "climate.wc_z": "WC Ž",
  "climate.wc_m": "WC M",
  "climate.wc": "WC",
  "climate.vchod": "Vchod",
  "climate.sal": "Sál",
  "climate.schody": "Schody",
  "climate.bar": "Bar",
  "climate.pizza": "Pizza",
  "climate.kuchyn": "Kuchyně",
  "climate.kancelar": "Kancelář",
  "climate.1": "Kancelář",
  "climate.1_wc": "Koupelna kancelář",
  "climate.satna_personal": "Šatna personál",
  "climate.satna_personal_wc": "Šatna personál WC",
  "climate.satna_personal_spr": "Šatna personál sprcha",
  "climate.kancelar_moje": "Moje kancelář",
  "climate.kancl_dole": "Kancelář dole",
  "climate.kuchyne": "Kuchyně",
  "climate.klimatizace_bar": "Bar",
  "climate.denis_air": "Denis Air",
};

export function displayName(c: Climate): string {
  if (PRETTY[c.id]) return PRETTY[c.id];
  const n = c.name
    .replace(/^Pokoj (\d+)$/i, "Pokoj $1")
    .replace(/^(?:Koupelna (\d+)|(\d+) Koupelna)$/i, (_, a, b) => `Koupelna ${a ?? b}`)
    .replace(/^(?:WC (\d+)|(\d+) WC)$/i, (_, a, b) => `WC ${a ?? b}`);
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
export const isHeating = (c: Climate) => {
  if (c.action === "heating") return true;
  if (c.action) return false;
  const r = reading(c);
  return c.state === "heat" && r.kind === "ok" && c.target !== null && r.value < c.target;
};

export const MODE_LABEL: Record<string, string> = {
  off: "Vypnuto",
  heat: "Topení",
  cool: "Chlazení",
  dry: "Odvlhčení",
  auto: "Auto",
  fan_only: "Ventilátor",
  heat_cool: "Topení/chlazení",
};

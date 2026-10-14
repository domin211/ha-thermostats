import "server-only";
import snapshot from "./snapshot.json";
import type { Climate, ControlRequest, StatesResponse } from "./types";

interface HaState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;

function toClimate(s: HaState): Climate {
  const a = s.attributes ?? {};
  return {
    id: s.entity_id,
    name: String(a.friendly_name ?? s.entity_id).replace(/\s+&$/, "").trim(),
    state: s.state,
    modes: Array.isArray(a.hvac_modes) ? (a.hvac_modes as string[]) : ["off", "heat"],
    current: num(a.current_temperature),
    target: num(a.temperature),
    min: num(a.min_temp) ?? 7,
    max: num(a.max_temp) ?? 35,
    step: num(a.target_temp_step) ?? 0.5,
    action: typeof a.hvac_action === "string" ? a.hvac_action : null,
    fanMode: typeof a.fan_mode === "string" ? a.fan_mode : null,
    lastChanged: s.last_changed ?? null,
    unavailable: s.state === "unavailable" || s.state === "unknown",
  };
}

const config = () => {
  const url = process.env.HA_URL?.replace(/\/+$/, "");
  const token = process.env.HA_TOKEN;
  return url && token ? { url, token } : null;
};

export const isReadOnly = () => process.env.HA_READ_ONLY === "1";

// In-memory mock store so the UI is fully usable without Home Assistant.
const g = globalThis as unknown as { __mockStates?: HaState[] };
const mockStates = () =>
  (g.__mockStates ??= structuredClone(snapshot as unknown as HaState[]));

export async function getClimates(): Promise<StatesResponse> {
  const cfg = config();
  if (!cfg) {
    return {
      source: "mock",
      readOnly: isReadOnly(),
      fetchedAt: new Date().toISOString(),
      climates: mockStates().map(toClimate),
    };
  }
  const res = await fetch(`${cfg.url}/api/states`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Home Assistant odpověděl ${res.status}`);
  const all = (await res.json()) as HaState[];
  return {
    source: "live",
    readOnly: isReadOnly(),
    fetchedAt: new Date().toISOString(),
    climates: all.filter((s) => s.entity_id.startsWith("climate.")).map(toClimate),
  };
}

export async function control(req: ControlRequest): Promise<void> {
  const ids = req.entityIds.filter((id) => /^climate\.[a-z0-9_]+$/.test(id));
  if (ids.length === 0) throw new Error("Žádné platné entity");
  if (isReadOnly()) throw new Error("Režim jen pro čtení: změny jsou vypnuté");

  const cfg = config();
  if (!cfg) {
    for (const s of mockStates()) {
      if (!ids.includes(s.entity_id)) continue;
      if (req.action === "set_temperature") s.attributes.temperature = req.temperature;
      else {
        s.state = req.mode;
        s.attributes.hvac_action = req.mode === "off" ? "off" : "idle";
      }
    }
    return;
  }

  const [service, body] =
    req.action === "set_temperature"
      ? ["set_temperature", { entity_id: ids, temperature: req.temperature }]
      : ["set_hvac_mode", { entity_id: ids, hvac_mode: req.mode }];

  const res = await fetch(`${cfg.url}/api/services/climate/${service}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Home Assistant odpověděl ${res.status}`);
}

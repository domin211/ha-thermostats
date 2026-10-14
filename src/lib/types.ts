export type HvacMode =
  | "off"
  | "heat"
  | "cool"
  | "auto"
  | "dry"
  | "fan_only"
  | "heat_cool";

export interface Climate {
  id: string;
  name: string;
  state: string;
  modes: string[];
  current: number | null;
  target: number | null;
  min: number;
  max: number;
  step: number;
  action: string | null;
  fanMode: string | null;
  lastChanged: string | null;
  unavailable: boolean;
}

export type AreaKey = "rooms" | "common" | "wellness" | "staff" | "ac";

export interface StatesResponse {
  source: "live" | "mock";
  readOnly: boolean;
  fetchedAt: string;
  climates: Climate[];
}

export type ControlRequest =
  | { action: "set_temperature"; entityIds: string[]; temperature: number }
  | { action: "set_hvac_mode"; entityIds: string[]; mode: string };

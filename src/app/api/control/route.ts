import { NextResponse } from "next/server";
import { control } from "@/lib/ha";
import type { ControlRequest } from "@/lib/types";

export const dynamic = "force-dynamic";

function parse(body: unknown): ControlRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const ids = Array.isArray(b.entityIds) ? b.entityIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0 || ids.length > 200) return null;
  if (b.action === "set_temperature" && typeof b.temperature === "number" && b.temperature >= 5 && b.temperature <= 35) {
    return { action: "set_temperature", entityIds: ids, temperature: Math.round(b.temperature * 2) / 2 };
  }
  const modes = ["off", "heat", "cool", "auto", "dry", "fan_only", "heat_cool"];
  if (b.action === "set_hvac_mode" && typeof b.mode === "string" && modes.includes(b.mode)) {
    return { action: "set_hvac_mode", entityIds: ids, mode: b.mode };
  }
  return null;
}

export async function POST(req: Request) {
  const parsed = parse(await req.json().catch(() => null));
  if (!parsed) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    await control(parsed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

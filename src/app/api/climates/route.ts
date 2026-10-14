import { NextResponse } from "next/server";
import { getClimates } from "@/lib/ha";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getClimates(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

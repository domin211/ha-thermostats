"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/session";

const attempts = new Map<string, { n: number; t: number }>();

export async function login(_: { error?: string } | undefined, form: FormData) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const a = attempts.get(ip);
  const now = Date.now();
  if (a && now - a.t < 60_000 && a.n >= 8) return { error: "Příliš mnoho pokusů. Počkejte minutu." };

  const ok = await checkPassword(String(form.get("password") ?? ""));
  if (!ok) {
    attempts.set(ip, a && now - a.t < 60_000 ? { n: a.n + 1, t: a.t } : { n: 1, t: now });
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Nesprávné heslo." };
  }
  attempts.delete(ip);
  const proto = h.get("x-forwarded-proto") ?? "http";
  (await cookies()).set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  redirect("/");
}

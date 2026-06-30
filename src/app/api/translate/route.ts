import type { NextRequest } from "next/server";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Перевод на русский через публичный gtx-эндпоинт Google (без ключа).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").slice(0, 5000);
    const to = String(body?.to || "ru");
    if (!text.trim()) return Response.json({ text: "" });
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return Response.json({ text: "", error: "translate_failed" }, { status: 502 });
    const data = await r.json();
    const translated = (data?.[0] || []).map((p: any[]) => p?.[0] || "").join("");
    return Response.json({ text: translated });
  } catch (e) {
    return fail(e);
  }
}

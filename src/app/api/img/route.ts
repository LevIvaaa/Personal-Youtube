import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Прокси картинок: браузер может не тянуть Google CDN напрямую (блокировщики/сеть).
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new Response(null, { status: 400 });
  let url: URL;
  try { url = new URL(u); } catch { return new Response(null, { status: 400 }); }
  const allowed = /(^|\.)(ggpht\.com|googleusercontent\.com|ytimg\.com|youtube\.com)$/i.test(url.hostname);
  if (!allowed || url.protocol !== "https:") return new Response(null, { status: 403 });
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return new Response(null, { status: r.status });
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: { "Content-Type": r.headers.get("content-type") || "image/jpeg", "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

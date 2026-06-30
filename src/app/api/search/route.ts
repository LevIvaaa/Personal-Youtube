import type { NextRequest } from "next/server";
import * as yt from "@/lib/youtube";
import { recordEvent } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (!q) return Response.json({ items: [] });
    await recordEvent({ type: "search", query: q });
    let items = await yt.search(q, { maxResults: 24 });
    const hydrated = await yt.hydrateVideos(items.map((v) => v.id));
    items = items.map((v) => ({ ...v, ...(hydrated[v.id] || {}) }));
    return Response.json({ items });
  } catch (e) {
    return fail(e);
  }
}

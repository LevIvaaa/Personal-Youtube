import * as yt from "@/lib/youtube";
import { getHistory } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getHistory(200);
    const ids = items.map((v) => v.id);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    const dur: Record<string, any> = {};
    const results = await Promise.all(chunks.map((c) => yt.hydrateVideos(c).catch(() => ({}))));
    for (const r of results) Object.assign(dur, r);
    const out = items.map((v) => {
      const full = dur[v.id] || {};
      const duration = full.duration ?? v.duration ?? null;
      return { ...v, duration, views: full.views ?? null, isShort: duration != null && duration <= 60 };
    });
    return Response.json({ items: await yt.enrichChannelThumbs(out) });
  } catch (e) {
    return fail(e);
  }
}

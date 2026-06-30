import type { NextRequest } from "next/server";
import * as yt from "@/lib/youtube";
import { recordEvent } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body?.raw || "").trim();
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    const directIds: { id: string; title: string }[] = [];
    const toResolve: string[] = [];
    for (const line of lines) {
      if (/^(channel\s*id|идентификатор)/i.test(line)) continue;
      if (line.includes(",")) {
        const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const idCell = cells.find((c) => /^UC[\w-]{20,}$/.test(c));
        if (idCell) { directIds.push({ id: idCell, title: cells[cells.length - 1] || idCell }); continue; }
      }
      toResolve.push(line);
    }

    const resolved: { id: string; title?: string; thumbnail?: string }[] = [];
    for (const ref of toResolve.slice(0, 100)) {
      const ch = await yt.resolveChannel(ref);
      if (ch?.id) resolved.push(ch);
    }

    const allIds = [...new Set([...directIds.map((d) => d.id), ...resolved.map((r) => r.id)])];
    const info: Record<string, any> = {};
    for (let i = 0; i < allIds.length; i += 50) {
      try { Object.assign(info, await yt.channelsInfo(allIds.slice(i, i + 50))); } catch { /* ignore */ }
    }

    const seen = new Set<string>();
    const channels: { id: string; title: string; thumbnail: string }[] = [];
    for (const d of [...directIds, ...resolved]) {
      if (!d.id || seen.has(d.id)) continue;
      seen.add(d.id);
      const merged = { id: d.id, title: info[d.id]?.title || (d as any).title || d.id, thumbnail: info[d.id]?.thumbnail || (d as any).thumbnail || "" };
      await recordEvent({ type: "subscribe", channel: merged });
      channels.push(merged);
    }
    return Response.json({ imported: channels.length, requested: lines.length, unresolved: toResolve.length - resolved.length, channels });
  } catch (e) {
    return fail(e);
  }
}

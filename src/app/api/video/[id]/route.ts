import type { NextRequest } from "next/server";
import * as yt from "@/lib/youtube";
import { buildRelated } from "@/lib/recommender";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [video, related] = await Promise.all([yt.videoDetails(params.id), buildRelated(params.id)]);
    let channel = null;
    if (video?.channelId) {
      try { channel = (await yt.channelsInfo([video.channelId]))[video.channelId] || null; } catch { /* ignore */ }
    }
    return Response.json({ video, related, channel });
  } catch (e) {
    return fail(e);
  }
}

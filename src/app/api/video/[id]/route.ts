import type { NextRequest } from "next/server";
import * as yt from "@/lib/youtube";
import { buildRelated } from "@/lib/recommender";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [video, related] = await Promise.all([yt.videoDetails(params.id), buildRelated(params.id)]);
    return Response.json({ video, related });
  } catch (e) {
    return fail(e);
  }
}

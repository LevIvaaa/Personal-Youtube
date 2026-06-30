import type { NextRequest } from "next/server";
import { playlistVideos } from "@/lib/playlists";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const name = req.nextUrl.searchParams.get("name") || "";
    if (!name) return Response.json({ items: [] });
    return Response.json({ items: await playlistVideos(name) });
  } catch (e) {
    return fail(e);
  }
}

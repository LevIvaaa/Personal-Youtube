import { playlistVideos, WATCH_LATER } from "@/lib/playlists";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ items: await playlistVideos(WATCH_LATER, 100) });
  } catch (e) {
    return fail(e);
  }
}

import { listPlaylists } from "@/lib/playlists";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ playlists: await listPlaylists() });
  } catch (e) {
    return fail(e);
  }
}

import * as yt from "@/lib/youtube";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ items: await yt.enrichChannelThumbs(await yt.trending({ maxResults: 32 })) });
  } catch (e) {
    return fail(e);
  }
}

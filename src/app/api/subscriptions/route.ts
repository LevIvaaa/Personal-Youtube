import * as yt from "@/lib/youtube";
import { getSubscriptions } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const subs = await getSubscriptions();
    const missing = subs.filter((s) => !s.thumbnail).map((s) => s.id);
    if (missing.length) {
      try {
        const info = await yt.channelsInfo(missing);
        subs.forEach((s) => { if (info[s.id]?.thumbnail) s.thumbnail = info[s.id].thumbnail!; });
      } catch { /* без аватарок ок */ }
    }
    return Response.json({ channels: subs });
  } catch (e) {
    return fail(e);
  }
}

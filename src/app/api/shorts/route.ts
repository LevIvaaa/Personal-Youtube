import { shortsRow } from "@/lib/recommender";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ items: await shortsRow({ limit: 48 }) });
  } catch (e) {
    return fail(e);
  }
}

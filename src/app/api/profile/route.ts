import { getProfileStats } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getProfileStats());
  } catch (e) {
    return fail(e);
  }
}

import { getLikes } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ items: await getLikes() });
  } catch (e) {
    return fail(e);
  }
}

import { resetProfile } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await resetProfile();
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

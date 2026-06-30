import type { NextRequest } from "next/server";
import { recordEvent, getProfileStats } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    await recordEvent(body || {});
    const stats = await getProfileStats();
    return Response.json({ ok: true, interests: stats.interests });
  } catch (e) {
    return fail(e);
  }
}

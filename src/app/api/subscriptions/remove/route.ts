import type { NextRequest } from "next/server";
import { recordEvent } from "@/lib/profile";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    await recordEvent({ type: "unsubscribe", channelId: body?.channelId });
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

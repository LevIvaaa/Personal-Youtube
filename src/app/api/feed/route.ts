import type { NextRequest } from "next/server";
import { feedPage } from "@/lib/recommender";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(24, Number(sp.get("limit")) || 16);
    const sessionId = sp.get("session") || "";
    return Response.json(await feedPage({ sessionId, limit }));
  } catch (e) {
    return fail(e);
  }
}

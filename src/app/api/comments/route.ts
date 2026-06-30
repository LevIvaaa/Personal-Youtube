import type { NextRequest } from "next/server";
import * as yt from "@/lib/youtube";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("videoId") || "";
    if (!id) return Response.json({ items: [] });
    return Response.json({ items: await yt.comments(id, 24) });
  } catch (e) {
    return fail(e);
  }
}

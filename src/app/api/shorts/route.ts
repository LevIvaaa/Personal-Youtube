import type { NextRequest } from "next/server";
import { shortsRow } from "@/lib/recommender";
import { fail } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const exclude = (req.nextUrl.searchParams.get("exclude") || "").split(",").map((s) => s.trim()).filter(Boolean);
    return Response.json({ items: await shortsRow({ limit: 48, exclude }) });
  } catch (e) {
    return fail(e);
  }
}

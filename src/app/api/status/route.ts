import * as yt from "@/lib/youtube";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ configured: yt.isConfigured(), region: process.env.REGION_CODE || "RU" });
}

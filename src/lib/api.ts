// Общие хелперы для route-хендлеров.
export const runtime = "nodejs";

export function fail(e: any): Response {
  if (e?.code === "NO_API_KEY") {
    return Response.json({ error: "NO_API_KEY", message: "Не задан YOUTUBE_API_KEY в .env" }, { status: 503 });
  }
  console.error("API error:", e?.message || e);
  return Response.json({ error: e?.code || "ERROR", message: e?.message || "Ошибка" }, { status: 500 });
}

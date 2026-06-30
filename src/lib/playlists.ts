import { prisma } from "./db";
import * as yt from "./youtube";

export const WATCH_LATER = "Watch later";

export async function listPlaylists() {
  const grouped = await prisma.playlistItem.groupBy({ by: ["playlist"], _count: { _all: true } });
  // первый ролик каждого плейлиста для обложки
  const out = [];
  for (const g of grouped) {
    const first = await prisma.playlistItem.findFirst({ where: { playlist: g.playlist }, orderBy: { addedAt: "desc" } });
    out.push({
      name: g.playlist,
      title: g.playlist === WATCH_LATER ? "Смотреть позже" : g.playlist,
      count: g._count._all,
      thumbVideoId: first?.videoId || null,
    });
  }
  // Watch later первым
  out.sort((a, b) => (a.name === WATCH_LATER ? -1 : b.name === WATCH_LATER ? 1 : b.count - a.count));
  return out;
}

export async function playlistVideos(name: string, limit = 100) {
  const rows = await prisma.playlistItem.findMany({ where: { playlist: name }, orderBy: { addedAt: "desc" }, take: limit });
  const ids = rows.map((r) => r.videoId);
  const map: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 50) {
    try { Object.assign(map, await yt.hydrateVideos(ids.slice(i, i + 50))); } catch { /* ignore */ }
  }
  // сохраняем порядок плейлиста; для отсутствующих строим минимальную карточку
  return rows.map((r) => map[r.videoId] || { id: r.videoId, title: "", thumbnail: `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg` }).filter(Boolean);
}

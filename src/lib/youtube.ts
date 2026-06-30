// Клиент YouTube Data API v3 с in-memory кэшем (бережём дневную квоту).
const API_BASE = "https://www.googleapis.com/youtube/v3";

const KEY = () => process.env.YOUTUBE_API_KEY || "";
const REGION = () => process.env.REGION_CODE || "RU";
const LANG = () => process.env.RELEVANCE_LANGUAGE || "ru";

export type Video = {
  id: string;
  title: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnail: string;
  categoryId?: string | null;
  tags?: string[];
  views?: number | null;
  likes?: number | null;
  duration?: number | null;
  description?: string;
};

export type ChannelInfo = { id: string; title?: string; thumbnail?: string; subscribers?: string };

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

function cacheKey(endpoint: string, params: Record<string, string | number>) {
  return endpoint + "?" + Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
}

class ApiError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function call(
  endpoint: string,
  params: Record<string, string | number>,
  { ttlMs = 1000 * 60 * 30 }: { ttlMs?: number } = {}
): Promise<any> {
  if (!KEY()) throw new ApiError("Не задан YOUTUBE_API_KEY", "NO_API_KEY");
  const ck = cacheKey(endpoint, params);
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;

  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("key", KEY());

  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason || json?.error?.message || String(res.status);
    throw new ApiError(`YouTube API: ${reason}`, reason);
  }
  if (cache.size > 800) cache.clear();
  cache.set(ck, { at: Date.now(), data: json });
  return json;
}

function pickThumb(thumbnails: any = {}): string {
  return (
    thumbnails?.medium?.url || thumbnails?.high?.url || thumbnails?.default?.url || thumbnails?.standard?.url || ""
  );
}
function decodeHtml(str = ""): string {
  return str
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function parseDuration(iso?: string): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}
function mapSearchItem(item: any): Video {
  const s = item.snippet || {};
  return {
    id: item.id?.videoId,
    title: decodeHtml(s.title),
    channelId: s.channelId,
    channelTitle: decodeHtml(s.channelTitle),
    publishedAt: s.publishedAt,
    thumbnail: pickThumb(s.thumbnails),
    categoryId: null,
    views: null,
    duration: null,
  };
}
function mapVideoItem(item: any): Video {
  const s = item.snippet || {};
  return {
    id: item.id,
    title: decodeHtml(s.title),
    channelId: s.channelId,
    channelTitle: decodeHtml(s.channelTitle),
    publishedAt: s.publishedAt,
    thumbnail: pickThumb(s.thumbnails),
    categoryId: s.categoryId || null,
    tags: s.tags || [],
    views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
    duration: parseDuration(item.contentDetails?.duration),
    description: decodeHtml(s.description || ""),
  };
}

export async function searchPaged(
  query: string,
  { maxResults = 20, order = "relevance", type = "video", pageToken = "" } = {}
): Promise<{ items: Video[]; nextPageToken: string | null }> {
  const params: Record<string, string | number> = {
    part: "snippet", q: query, type, maxResults, order,
    regionCode: REGION(), relevanceLanguage: LANG(), safeSearch: "none",
    videoEmbeddable: type === "video" ? "true" : "any",
  };
  if (pageToken) params.pageToken = pageToken;
  const data = await call("search", params);
  return {
    items: (data.items || []).map(mapSearchItem).filter((v: Video) => v.id),
    nextPageToken: data.nextPageToken || null,
  };
}
export async function search(query: string, opts = {}): Promise<Video[]> {
  return (await searchPaged(query, opts)).items;
}

export async function trendingPaged({ maxResults = 24, categoryId = "", pageToken = "" } = {}): Promise<{ items: Video[]; nextPageToken: string | null }> {
  const params: Record<string, string | number> = {
    part: "snippet,statistics,contentDetails", chart: "mostPopular", maxResults, regionCode: REGION(),
  };
  if (categoryId) params.videoCategoryId = categoryId;
  if (pageToken) params.pageToken = pageToken;
  const data = await call("videos", params, { ttlMs: 1000 * 60 * 60 });
  return { items: (data.items || []).map(mapVideoItem), nextPageToken: data.nextPageToken || null };
}
export async function trending(opts = {}): Promise<Video[]> {
  return (await trendingPaged(opts)).items;
}

export async function hydrateVideos(ids: string[]): Promise<Record<string, Video>> {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return {};
  const data = await call("videos", { part: "snippet,statistics,contentDetails", id: unique.join(",") });
  const map: Record<string, Video> = {};
  for (const item of data.items || []) map[item.id] = mapVideoItem(item);
  return map;
}
export async function videoDetails(id: string): Promise<Video | null> {
  return (await hydrateVideos([id]))[id] || null;
}

const uploadsCache = new Map<string, string | null>();
export async function uploadsPlaylistId(channelId: string): Promise<string | null> {
  if (uploadsCache.has(channelId)) return uploadsCache.get(channelId)!;
  const data = await call("channels", { part: "contentDetails", id: channelId }, { ttlMs: 1000 * 60 * 60 * 24 });
  const pl = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  uploadsCache.set(channelId, pl);
  return pl;
}
export async function channelUploads(channelId: string, { maxResults = 12, pageToken = "" } = {}): Promise<{ items: Video[]; nextPageToken: string | null }> {
  const playlistId = await uploadsPlaylistId(channelId);
  if (!playlistId) return { items: [], nextPageToken: null };
  const params: Record<string, string | number> = { part: "snippet,contentDetails", playlistId, maxResults };
  if (pageToken) params.pageToken = pageToken;
  const data = await call("playlistItems", params, { ttlMs: 1000 * 60 * 30 });
  const items: Video[] = (data.items || [])
    .map((it: any) => ({
      id: it.contentDetails?.videoId || it.snippet?.resourceId?.videoId,
      title: decodeHtml(it.snippet?.title),
      channelId: it.snippet?.videoOwnerChannelId || it.snippet?.channelId,
      channelTitle: decodeHtml(it.snippet?.videoOwnerChannelTitle || it.snippet?.channelTitle),
      publishedAt: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt,
      thumbnail: pickThumb(it.snippet?.thumbnails),
      categoryId: null, views: null, duration: null,
    }))
    .filter((v: Video) => v.id && v.title !== "Private video" && v.title !== "Deleted video");
  return { items, nextPageToken: data.nextPageToken || null };
}

export async function channelsInfo(channelIds: string[]): Promise<Record<string, ChannelInfo>> {
  const unique = [...new Set(channelIds)].filter(Boolean).slice(0, 50);
  if (!unique.length) return {};
  const data = await call("channels", { part: "snippet,statistics", id: unique.join(",") }, { ttlMs: 1000 * 60 * 60 * 24 });
  const map: Record<string, ChannelInfo> = {};
  for (const item of data.items || []) {
    map[item.id] = { id: item.id, title: item.snippet?.title, thumbnail: pickThumb(item.snippet?.thumbnails), subscribers: item.statistics?.subscriberCount };
  }
  return map;
}

export async function relatedVideos(video: Video, { maxResults = 20 } = {}): Promise<Video[]> {
  const titleWords = (video?.title || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join(" ");
  const q = `${titleWords} ${video?.channelTitle || ""}`.trim() || video?.title || "";
  const items = await search(q, { maxResults: maxResults + 5 });
  return items.filter((v) => v.id !== video?.id).slice(0, maxResults);
}

export async function resolveChannel(input: string): Promise<ChannelInfo | null> {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let id: string | null = null, handle: string | null = null, username: string | null = null;
  if (/^UC[\w-]{20,}$/.test(raw)) id = raw;
  else if (/youtube\.com\/channel\/(UC[\w-]+)/i.test(raw)) id = raw.match(/channel\/(UC[\w-]+)/i)![1];
  else if (/youtube\.com\/@([\w.\-]+)/i.test(raw)) handle = raw.match(/@([\w.\-]+)/i)![1];
  else if (/youtube\.com\/(?:c|user)\/([\w.\-]+)/i.test(raw)) username = raw.match(/\/(?:c|user)\/([\w.\-]+)/i)![1];
  else if (raw.startsWith("@")) handle = raw.slice(1);
  try {
    if (id) return (await channelsInfo([id]))[id] || { id, title: id };
    if (handle) {
      const data = await call("channels", { part: "snippet", forHandle: handle }, { ttlMs: 1000 * 60 * 60 * 24 });
      const it = data.items?.[0];
      if (it) return { id: it.id, title: decodeHtml(it.snippet?.title), thumbnail: pickThumb(it.snippet?.thumbnails) };
    }
    if (username) {
      const data = await call("channels", { part: "snippet", forUsername: username }, { ttlMs: 1000 * 60 * 60 * 24 });
      const it = data.items?.[0];
      if (it) return { id: it.id, title: decodeHtml(it.snippet?.title), thumbnail: pickThumb(it.snippet?.thumbnails) };
    }
  } catch { /* fallback */ }
  try {
    const data = await call("search", { part: "snippet", q: raw.replace(/^@/, ""), type: "channel", maxResults: 1 });
    const it = data.items?.[0];
    if (it) return { id: it.snippet?.channelId, title: decodeHtml(it.snippet?.channelTitle || it.snippet?.title), thumbnail: pickThumb(it.snippet?.thumbnails) };
  } catch { /* ignore */ }
  return null;
}

export type Comment = { id: string; author: string; avatar: string; text: string; likes: number; publishedAt: string };
export async function comments(videoId: string, maxResults = 20): Promise<Comment[]> {
  try {
    const data = await call("commentThreads", { part: "snippet", videoId, maxResults, order: "relevance", textFormat: "plainText" }, { ttlMs: 1000 * 60 * 30 });
    return (data.items || []).map((it: any) => {
      const s = it.snippet?.topLevelComment?.snippet || {};
      return {
        id: it.id,
        author: decodeHtml(s.authorDisplayName || ""),
        avatar: s.authorProfileImageUrl || "",
        text: decodeHtml(s.textDisplay || s.textOriginal || ""),
        likes: Number(s.likeCount || 0),
        publishedAt: s.publishedAt,
      };
    });
  } catch {
    return []; // комментарии могут быть отключены
  }
}

export function isConfigured(): boolean {
  return !!KEY();
}
export { ApiError };

// Тонкий клиент YouTube Data API v3 с дисковым кэшем,
// чтобы беречь дневную квоту (search.list стоит 100 единиц из 10000).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "data", "cache");

const API_BASE = "https://www.googleapis.com/youtube/v3";

const KEY = () => process.env.YOUTUBE_API_KEY || "";
const REGION = () => process.env.REGION_CODE || "RU";
const LANG = () => process.env.RELEVANCE_LANGUAGE || "ru";

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cacheKey(endpoint, params) {
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  // Простой безопасный для файловой системы ключ
  return `${endpoint}__${Buffer.from(parts).toString("base64url")}.json`;
}

function readCache(file, ttlMs) {
  try {
    const full = path.join(CACHE_DIR, file);
    const stat = fs.statSync(full);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(file, data) {
  ensureCacheDir();
  try {
    fs.writeFileSync(path.join(CACHE_DIR, file), JSON.stringify(data));
  } catch {
    /* кэш не критичен */
  }
}

async function call(endpoint, params, { ttlMs = 1000 * 60 * 30 } = {}) {
  if (!KEY()) {
    const err = new Error("NO_API_KEY");
    err.code = "NO_API_KEY";
    throw err;
  }
  const ck = cacheKey(endpoint, params);
  const cached = readCache(ck, ttlMs);
  if (cached) return cached;

  const url = new URL(`${API_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", KEY());

  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    const reason = json?.error?.errors?.[0]?.reason || json?.error?.message || res.status;
    const err = new Error(`YouTube API: ${reason}`);
    err.code = reason;
    err.status = res.status;
    throw err;
  }
  writeCache(ck, json);
  return json;
}

// ---- Высокоуровневые методы ----

export async function search(query, { maxResults = 20, order = "relevance", type = "video" } = {}) {
  const { items } = await searchPaged(query, { maxResults, order, type });
  return items;
}

// Поиск с поддержкой постраничной выдачи (для бесконечной ленты).
export async function searchPaged(query, { maxResults = 20, order = "relevance", type = "video", pageToken } = {}) {
  const params = {
    part: "snippet",
    q: query,
    type,
    maxResults,
    order,
    regionCode: REGION(),
    relevanceLanguage: LANG(),
    safeSearch: "none",
    videoEmbeddable: type === "video" ? "true" : "any",
  };
  if (pageToken) params.pageToken = pageToken;
  const data = await call("search", params);
  return {
    items: (data.items || []).map(mapSearchItem).filter((v) => v.id),
    nextPageToken: data.nextPageToken || null,
  };
}

export async function trending({ maxResults = 24, categoryId } = {}) {
  const { items } = await trendingPaged({ maxResults, categoryId });
  return items;
}

// Тренды с пагинацией (дёшево: 1 единица квоты).
export async function trendingPaged({ maxResults = 24, categoryId, pageToken } = {}) {
  const params = {
    part: "snippet,statistics,contentDetails",
    chart: "mostPopular",
    maxResults,
    regionCode: REGION(),
  };
  if (categoryId) params.videoCategoryId = categoryId;
  if (pageToken) params.pageToken = pageToken;
  const data = await call("videos", params, { ttlMs: 1000 * 60 * 60 });
  return {
    items: (data.items || []).map(mapVideoItem),
    nextPageToken: data.nextPageToken || null,
  };
}

// Плейлист загрузок канала (нужен, чтобы дёшево тянуть его свежие видео).
const uploadsPlaylistCache = new Map();
export async function uploadsPlaylistId(channelId) {
  if (uploadsPlaylistCache.has(channelId)) return uploadsPlaylistCache.get(channelId);
  const data = await call(
    "channels",
    { part: "contentDetails", id: channelId },
    { ttlMs: 1000 * 60 * 60 * 24 }
  );
  const pl = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  uploadsPlaylistCache.set(channelId, pl);
  return pl;
}

// Свежие видео канала через uploads-плейлист — всего 1 единица квоты за 50 видео.
export async function channelUploads(channelId, { maxResults = 25, pageToken } = {}) {
  const playlistId = await uploadsPlaylistId(channelId);
  if (!playlistId) return { items: [], nextPageToken: null };
  const params = { part: "snippet,contentDetails", playlistId, maxResults };
  if (pageToken) params.pageToken = pageToken;
  const data = await call("playlistItems", params, { ttlMs: 1000 * 60 * 30 });
  const items = (data.items || [])
    .map((it) => ({
      id: it.contentDetails?.videoId || it.snippet?.resourceId?.videoId,
      title: decodeHtml(it.snippet?.title),
      channelId: it.snippet?.videoOwnerChannelId || it.snippet?.channelId,
      channelTitle: decodeHtml(it.snippet?.videoOwnerChannelTitle || it.snippet?.channelTitle),
      publishedAt: it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt,
      thumbnail: pickThumb(it.snippet?.thumbnails),
      categoryId: null,
      views: null,
      duration: null,
    }))
    .filter((v) => v.id && v.title !== "Private video" && v.title !== "Deleted video");
  return { items, nextPageToken: data.nextPageToken || null };
}

// Разрешить @handle / URL / название / UC-id в объект канала {id,title,thumbnail}.
export async function resolveChannel(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  // прямой channelId
  let id = null;
  let handle = null;
  let username = null;

  if (/^UC[\w-]{20,}$/.test(raw)) id = raw;
  else if (/youtube\.com\/channel\/(UC[\w-]+)/i.test(raw)) id = raw.match(/channel\/(UC[\w-]+)/i)[1];
  else if (/youtube\.com\/@([\w.\-]+)/i.test(raw)) handle = raw.match(/@([\w.\-]+)/i)[1];
  else if (/youtube\.com\/(?:c|user)\/([\w.\-]+)/i.test(raw)) username = raw.match(/\/(?:c|user)\/([\w.\-]+)/i)[1];
  else if (raw.startsWith("@")) handle = raw.slice(1);

  try {
    if (id) {
      const info = await channelsInfo([id]);
      return info[id] || { id, title: id };
    }
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
  } catch {
    /* упадём в поиск ниже */
  }

  // последний шанс — поиск канала по тексту (дорого: 100 единиц)
  try {
    const data = await call("search", { part: "snippet", q: raw.replace(/^@/, ""), type: "channel", maxResults: 1 });
    const it = data.items?.[0];
    if (it) return { id: it.snippet?.channelId, title: decodeHtml(it.snippet?.channelTitle || it.snippet?.title), thumbnail: pickThumb(it.snippet?.thumbnails) };
  } catch {
    /* ignore */
  }
  return null;
}

// Подтянуть статистику/длительность для списка id (videos.list дёшево: 1 ед.)
export async function hydrateVideos(ids) {
  const unique = [...new Set(ids)].slice(0, 50);
  if (!unique.length) return {};
  const data = await call("videos", {
    part: "snippet,statistics,contentDetails",
    id: unique.join(","),
  });
  const map = {};
  for (const item of data.items || []) map[item.id] = mapVideoItem(item);
  return map;
}

export async function videoDetails(id) {
  const map = await hydrateVideos([id]);
  return map[id] || null;
}

export async function relatedVideos(video, { maxResults = 20 } = {}) {
  // search?relatedToVideoId официально отключён, поэтому берём связку
  // канал + ключевые слова из названия как прокси «похожих».
  const titleWords = (video?.title || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join(" ");
  const q = `${titleWords} ${video?.channelTitle || ""}`.trim() || video?.title || "";
  const items = await search(q, { maxResults: maxResults + 5 });
  return items.filter((v) => v.id !== video?.id).slice(0, maxResults);
}

export async function channelsInfo(channelIds) {
  const unique = [...new Set(channelIds)].filter(Boolean).slice(0, 50);
  if (!unique.length) return {};
  const data = await call(
    "channels",
    { part: "snippet,statistics", id: unique.join(",") },
    { ttlMs: 1000 * 60 * 60 * 24 }
  );
  const map = {};
  for (const item of data.items || []) {
    map[item.id] = {
      id: item.id,
      title: item.snippet?.title,
      thumbnail: pickThumb(item.snippet?.thumbnails),
      subscribers: item.statistics?.subscriberCount,
    };
  }
  return map;
}

// ---- мапперы ----

function pickThumb(thumbnails = {}) {
  return (
    thumbnails?.medium?.url ||
    thumbnails?.high?.url ||
    thumbnails?.default?.url ||
    thumbnails?.standard?.url ||
    ""
  );
}

function mapSearchItem(item) {
  const id = item.id?.videoId;
  const s = item.snippet || {};
  return {
    id,
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

function mapVideoItem(item) {
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
    views: item.statistics?.viewCount ?? null,
    likes: item.statistics?.likeCount ?? null,
    duration: parseDuration(item.contentDetails?.duration),
  };
}

function decodeHtml(str = "") {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// PT1H2M3S -> секунды
function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const [, h, mi, s] = m;
  return (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0);
}

export function isConfigured() {
  return !!KEY();
}

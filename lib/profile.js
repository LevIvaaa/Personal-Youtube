// Личный профиль рекомендаций: интересы, история, лайки, аффинити каналов.
// Хранится локально в data/profile.json (в git не попадает).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const SEED_PATH = path.join(DATA_DIR, "profile.seed.json");

const EMPTY = {
  interests: {},
  channels: {},
  categories: {},
  watchHistory: [],
  likes: [],
  dislikes: [],
  searches: [],
  notInterested: [],
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
  } catch {
    // Первый запуск — берём seed как старт
    try {
      cache = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
      delete cache._comment;
    } catch {
      cache = structuredClone(EMPTY);
    }
    save();
  }
  // гарантируем все поля
  cache = { ...structuredClone(EMPTY), ...cache };
  return cache;
}

function save() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(cache, null, 2));
}

export function getProfile() {
  return load();
}

function bump(obj, key, amount) {
  if (!key) return;
  obj[key] = (obj[key] || 0) + amount;
}

// Слова из текста -> кандидаты в интересы
function keywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

// Регистрируем событие взаимодействия и обновляем веса.
export function recordEvent(event) {
  const p = load();
  const { type } = event;

  if (type === "watch") {
    const { video, watchSeconds = 0 } = event;
    if (!video?.id) return p;
    const ratio = video.duration ? Math.min(1, watchSeconds / video.duration) : 0.3;
    const weight = 0.5 + ratio * 1.5; // 0.5..2 в зависимости от досмотра

    bump(p.channels, video.channelId, weight);
    bump(p.categories, video.categoryId, weight);
    for (const w of keywords(video.title).slice(0, 6)) bump(p.interests, w, weight * 0.4);

    p.watchHistory.unshift({
      id: video.id,
      title: video.title,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      categoryId: video.categoryId,
      thumbnail: video.thumbnail,
      watchSeconds: Math.round(watchSeconds),
      duration: video.duration,
      watchedAt: event.at || new Date().toISOString(),
    });
    p.watchHistory = dedupeById(p.watchHistory).slice(0, 200);
  }

  if (type === "like") {
    const { video } = event;
    if (!video?.id) return p;
    if (!p.likes.find((v) => v.id === video.id)) {
      p.likes.unshift({ id: video.id, title: video.title, channelTitle: video.channelTitle, thumbnail: video.thumbnail });
    }
    bump(p.channels, video.channelId, 3);
    bump(p.categories, video.categoryId, 2);
    for (const w of keywords(video.title).slice(0, 6)) bump(p.interests, w, 1);
  }

  if (type === "unlike") {
    const { videoId } = event;
    p.likes = p.likes.filter((v) => v.id !== videoId);
  }

  if (type === "dislike") {
    const { video } = event;
    if (!video?.id) return p;
    bump(p.channels, video.channelId, -2);
    if (!p.dislikes.includes(video.id)) p.dislikes.push(video.id);
  }

  if (type === "notInterested") {
    const { videoId, channelId } = event;
    if (videoId && !p.notInterested.includes(videoId)) p.notInterested.push(videoId);
    if (channelId) bump(p.channels, channelId, -3);
  }

  if (type === "search") {
    const { query } = event;
    if (query) {
      p.searches.unshift({ q: query, at: new Date().toISOString() });
      p.searches = p.searches.slice(0, 100);
      for (const w of keywords(query)) bump(p.interests, w, 0.6);
    }
  }

  if (type === "addInterest") {
    bump(p.interests, (event.term || "").toLowerCase(), event.weight || 3);
  }

  if (type === "removeInterest") {
    delete p.interests[(event.term || "").toLowerCase()];
  }

  decayIfNeeded(p);
  save();
  return p;
}

function dedupeById(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

// Лёгкое «забывание» старых интересов, чтобы профиль не закостенел.
let lastDecay = 0;
function decayIfNeeded(p) {
  const now = Date.now();
  if (now - lastDecay < 1000 * 60 * 60) return; // не чаще раза в час
  lastDecay = now;
  for (const obj of [p.interests, p.channels, p.categories]) {
    for (const k of Object.keys(obj)) {
      obj[k] *= 0.98;
      if (Math.abs(obj[k]) < 0.05) delete obj[k];
    }
  }
}

export function topInterests(n = 8) {
  const p = load();
  return Object.entries(p.interests)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term, weight]) => ({ term, weight }));
}

export function topChannels(n = 8) {
  const p = load();
  return Object.entries(p.channels)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, weight]) => ({ id, weight }));
}

export function resetProfile() {
  cache = structuredClone(EMPTY);
  save();
  return cache;
}

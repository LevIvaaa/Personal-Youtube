// Personal YouTube — локальный персональный видеохостинг.
// Бэкенд: проксирует YouTube Data API и строит рекомендации под тебя.
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import * as yt from "./lib/youtube.js";
import * as profile from "./lib/profile.js";
import * as rec from "./lib/recommender.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// небольшой помощник для асинхронных роутов
const h = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    if (err.code === "NO_API_KEY") {
      return res.status(503).json({ error: "NO_API_KEY", message: "Не задан YOUTUBE_API_KEY в .env" });
    }
    console.error("API error:", err.message);
    res.status(500).json({ error: err.code || "ERROR", message: err.message });
  });

// Статус конфигурации (нужен фронту, чтобы показать подсказку про ключ)
app.get("/api/status", (req, res) => {
  res.json({ configured: yt.isConfigured(), region: process.env.REGION_CODE || "RU" });
});

// Персональная бесконечная лента (постранично через session)
app.get("/api/feed", h(async (req, res) => {
  const limit = Math.min(24, Number(req.query.limit) || 16);
  const sessionId = req.query.session || null;
  const result = await rec.feedPage({ sessionId, limit });
  res.json(result);
}));

// Поиск
app.get("/api/search", h(async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ items: [] });
  profile.recordEvent({ type: "search", query: q });
  let items = await yt.search(q, { maxResults: 24 });
  // обогатим метаданными
  const hydrated = await yt.hydrateVideos(items.map((v) => v.id));
  items = items.map((v) => ({ ...v, ...(hydrated[v.id] || {}) }));
  res.json({ items });
}));

// Тренды
app.get("/api/trending", h(async (req, res) => {
  const items = await yt.trending({ maxResults: 32, categoryId: req.query.categoryId });
  res.json({ items });
}));

// Детали видео + похожие
app.get("/api/video/:id", h(async (req, res) => {
  const video = await yt.videoDetails(req.params.id);
  const related = await rec.buildRelated(req.params.id);
  res.json({ video, related });
}));

// Подписки (импортированные) либо любимые каналы (по аффинити)
app.get("/api/subscriptions", h(async (req, res) => {
  const subs = profile.getSubscriptions();
  if (subs.length) {
    const missing = subs.filter((s) => !s.thumbnail).map((s) => s.id);
    if (missing.length) {
      try {
        const info = await yt.channelsInfo(missing);
        subs.forEach((s) => { if (info[s.id]) s.thumbnail = info[s.id].thumbnail; });
      } catch { /* без аватарок тоже ок */ }
    }
    return res.json({ channels: subs.map((s) => ({ id: s.id, title: s.title, thumbnail: s.thumbnail, subscribed: true })) });
  }
  const top = profile.topChannels(12);
  const info = await yt.channelsInfo(top.map((c) => c.id));
  const channels = top.map((c) => ({ ...c, ...(info[c.id] || {}) })).filter((c) => c.title);
  res.json({ channels });
}));

// Импорт подписок: построчно — Takeout subscriptions.csv ИЛИ @handle / ссылка / название
app.post("/api/subscriptions/import", h(async (req, res) => {
  const raw = String(req.body?.raw || "").trim();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const directIds = []; // из Takeout CSV — id уже есть, API не нужен
  const toResolve = []; // @handle / url / название — резолвим через API

  for (const line of lines) {
    if (/^channel\s*id/i.test(line)) continue; // заголовок CSV
    if (line.includes(",")) {
      const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const idCell = cells.find((c) => /^UC[\w-]{20,}$/.test(c));
      if (idCell) {
        directIds.push({ id: idCell, title: cells[cells.length - 1] || idCell });
        continue;
      }
    }
    toResolve.push(line);
  }

  const resolved = [];
  for (const ref of toResolve.slice(0, 100)) {
    const ch = await yt.resolveChannel(ref);
    if (ch?.id) resolved.push(ch);
  }

  // подтянем аватарки/названия пачками (дёшево: 1 ед. за 50 каналов)
  const allIds = [...new Set([...directIds.map((d) => d.id), ...resolved.map((r) => r.id)])];
  let info = {};
  for (let i = 0; i < allIds.length; i += 50) {
    try { Object.assign(info, await yt.channelsInfo(allIds.slice(i, i + 50))); } catch { /* ignore */ }
  }

  const seen = new Set();
  const channels = [];
  for (const d of [...directIds, ...resolved]) {
    if (!d.id || seen.has(d.id)) continue;
    seen.add(d.id);
    const merged = {
      id: d.id,
      title: info[d.id]?.title || d.title || d.id,
      thumbnail: info[d.id]?.thumbnail || d.thumbnail || "",
    };
    profile.recordEvent({ type: "subscribe", channel: merged });
    channels.push(merged);
  }

  res.json({ imported: channels.length, requested: lines.length, unresolved: toResolve.length - resolved.length, channels });
}));

// Отписаться
app.post("/api/subscriptions/remove", (req, res) => {
  profile.recordEvent({ type: "unsubscribe", channelId: req.body?.channelId });
  res.json({ ok: true });
});

// История просмотров
app.get("/api/history", (req, res) => {
  res.json({ items: profile.getProfile().watchHistory.slice(0, 100) });
});

// Понравившиеся
app.get("/api/liked", (req, res) => {
  res.json({ items: profile.getProfile().likes });
});

// Текущий профиль интересов (для панели настроек)
app.get("/api/profile", (req, res) => {
  const p = profile.getProfile();
  res.json({
    interests: profile.topInterests(20),
    channels: profile.topChannels(12),
    counts: {
      history: p.watchHistory.length,
      likes: p.likes.length,
      searches: p.searches.length,
      subscriptions: Object.keys(p.subscriptions || {}).length,
    },
  });
});

// Регистрация событий (просмотр, лайк, не интересно, интересы)
app.post("/api/event", (req, res) => {
  try {
    const p = profile.recordEvent(req.body || {});
    res.json({ ok: true, interests: profile.topInterests(20) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Сброс профиля
app.post("/api/profile/reset", (req, res) => {
  profile.resetProfile();
  res.json({ ok: true });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  ▶ Personal YouTube запущен:  http://localhost:${PORT}`);
  if (!yt.isConfigured()) {
    console.log("  ⚠  YOUTUBE_API_KEY не задан — скопируй .env.example в .env и впиши ключ.\n");
  } else {
    console.log("  ✓ YouTube API ключ найден.\n");
  }
});

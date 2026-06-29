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

// Персональная лента главной
app.get("/api/feed", h(async (req, res) => {
  const limit = Math.min(48, Number(req.query.limit) || 32);
  const items = await rec.buildFeed({ limit });
  res.json({ items });
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

// Подписки / любимые каналы (по аффинити)
app.get("/api/subscriptions", h(async (req, res) => {
  const top = profile.topChannels(12);
  const info = await yt.channelsInfo(top.map((c) => c.id));
  const channels = top.map((c) => ({ ...c, ...(info[c.id] || {}) })).filter((c) => c.title);
  res.json({ channels });
}));

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

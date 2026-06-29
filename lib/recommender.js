// Движок «идеальных рекомендаций под себя».
// Идея: собрать кандидатов из интересов/каналов/трендов, затем отранжировать
// по аффинити профиля + свежести + разнообразию, исключив просмотренное.
import * as yt from "./youtube.js";
import { getProfile, topInterests, topChannels } from "./profile.js";

function ageDays(publishedAt) {
  if (!publishedAt) return 999;
  return (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
}

function keywords(text = "") {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

function scoreVideo(video, p) {
  let score = 0;
  const reasons = [];

  // 1. Аффинити канала
  const chAff = p.channels[video.channelId] || 0;
  if (chAff > 0) {
    score += Math.min(chAff, 10) * 1.2;
    reasons.push(`канал «${video.channelTitle}»`);
  }

  // 2. Аффинити категории
  const catAff = p.categories[video.categoryId] || 0;
  if (catAff > 0) score += Math.min(catAff, 8) * 0.6;

  // 3. Совпадение с интересами по ключевым словам
  const titleWords = keywords(`${video.title} ${(video.tags || []).join(" ")}`);
  let interestHit = 0;
  for (const [term, weight] of Object.entries(p.interests)) {
    if (titleWords.has(term)) {
      interestHit += weight;
    }
  }
  if (interestHit > 0) {
    score += Math.min(interestHit, 12);
    reasons.push("по вашим интересам");
  }

  // 4. Свежесть (мягкий бонус новизне, плавный спад)
  const days = ageDays(video.publishedAt);
  const freshness = Math.max(0, 1 - days / 60); // ~2 месяца
  score += freshness * 3;

  // 5. Популярность (лёгкий вес, чтобы не топить нишевое)
  if (video.views) score += Math.log10(Number(video.views) + 10) * 0.4;

  // лёгкая псевдо-случайность от id для разнообразия в равных условиях
  const jitter = (parseInt((video.id || "0").slice(-3), 36) % 100) / 100;
  score += jitter * 0.5;

  return { score, reasons };
}

// Сформировать персональную ленту главной.
export async function buildFeed({ limit = 32 } = {}) {
  const p = getProfile();
  const excluded = new Set([
    ...p.notInterested,
    ...p.dislikes,
    ...p.watchHistory.slice(0, 40).map((v) => v.id),
  ]);

  const interests = topInterests(6);
  const recentSearches = (p.searches || []).slice(0, 3).map((s) => s.q);

  // Набор «затравочных» запросов
  const seeds = [
    ...interests.map((i) => i.term),
    ...recentSearches,
  ];
  // если профиль пустой — стартуем с дефолтных тем
  if (seeds.length === 0) seeds.push("технологии", "наука", "музыка");

  // ограничим число поисковых запросов ради квоты
  const seedQueries = [...new Set(seeds)].slice(0, 5);

  const candidates = new Map();
  const addAll = (items) => {
    for (const v of items) {
      if (!v.id || excluded.has(v.id)) continue;
      if (!candidates.has(v.id)) candidates.set(v.id, v);
    }
  };

  // 1. Поиск по интересам
  const searchResults = await Promise.allSettled(
    seedQueries.map((q) => yt.search(q, { maxResults: 12, order: "relevance" }))
  );
  for (const r of searchResults) if (r.status === "fulfilled") addAll(r.value);

  // 2. Тренды как «исследование»/разнообразие
  try {
    addAll(await yt.trending({ maxResults: 20 }));
  } catch {
    /* нет квоты/ключа — пропускаем */
  }

  // 3. Обогатим метаданными (просмотры, длительность, категория) пачкой
  const list = [...candidates.values()];
  const missing = list.filter((v) => v.duration == null).map((v) => v.id);
  for (let i = 0; i < missing.length; i += 50) {
    try {
      const hydrated = await yt.hydrateVideos(missing.slice(i, i + 50));
      for (const [id, full] of Object.entries(hydrated)) {
        candidates.set(id, { ...candidates.get(id), ...full });
      }
    } catch {
      break;
    }
  }

  // 4. Скоринг
  const scored = [...candidates.values()].map((v) => {
    const { score, reasons } = scoreVideo(v, p);
    return { ...v, _score: score, _reasons: reasons };
  });
  scored.sort((a, b) => b._score - a._score);

  // 5. Разнообразие: не больше 2 подряд с одного канала
  const diversified = enforceChannelDiversity(scored, 2);

  return diversified.slice(0, limit).map(stripInternal);
}

function enforceChannelDiversity(items, maxPerChannelInWindow) {
  const out = [];
  const tail = []; // отложенные «лишние» с того же канала
  const recentCount = {};
  const WINDOW = 4;

  for (const item of items) {
    const ch = item.channelId || "?";
    const lastWindow = out.slice(-WINDOW);
    const inWindow = lastWindow.filter((x) => x.channelId === ch).length;
    if (inWindow >= maxPerChannelInWindow) {
      tail.push(item);
    } else {
      out.push(item);
    }
  }
  return [...out, ...tail];
}

function stripInternal(v) {
  const { _score, ...rest } = v;
  return { ...rest, reasons: v._reasons || [] };
}

export async function buildRelated(videoId) {
  const video = await yt.videoDetails(videoId);
  if (!video) return [];
  const p = getProfile();
  const related = await yt.relatedVideos(video, { maxResults: 25 });
  const excluded = new Set([videoId, ...p.notInterested, ...p.dislikes]);
  const scored = related
    .filter((v) => !excluded.has(v.id))
    .map((v) => {
      const { score } = scoreVideo(v, p);
      return { ...v, _score: score };
    })
    .sort((a, b) => b._score - a._score);
  return scored.map(stripInternal);
}

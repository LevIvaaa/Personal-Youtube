// Движок «идеальных рекомендаций под себя» + бесконечная лента.
//
// Лента = сессия с набором «питателей» (feeders), которые тянут кандидатов из
// дешёвых персональных источников (загрузки твоих каналов, тренды) и из поиска
// по интересам. Кандидаты ранжируются многосигнальным скорером, страница
// собирается с балансом «эксплуатация (точно твоё) ↔ разведка (что-то новое)»,
// и при прокрутке всегда подгружаются новые, не повторяющиеся видео.
import * as yt from "./youtube.js";
import { getProfile, topInterests, topChannels, getSubscriptions } from "./profile.js";

// ============ СКОРИНГ ============

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

// Лёгкий штраф за кликбейт — «тонкость» вкуса.
function clickbaitPenalty(title = "") {
  let pen = 0;
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length > 6) {
    const caps = (title.match(/\p{Lu}/gu) || []).length;
    if (caps / letters.length > 0.6) pen += 2; // КРИЧИТ КАПСОМ
  }
  const emojis = (title.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (emojis >= 4) pen += 1.5;
  if (/\b(ШОК|СРОЧНО|СЕНСАЦИЯ|ВЫ НЕ ПОВЕРИТЕ|ОБЯЗАТЕЛЬНО|ВСЕ В ШОКЕ)\b/iu.test(title)) pen += 2;
  return pen;
}

// Возвращает { score, reasons, novelty }.
function scoreVideo(video, p, { subscriptions } = {}) {
  let score = 0;
  const reasons = [];
  const subbed = subscriptions?.has(video.channelId);

  // 1. Подписка — самый сильный персональный сигнал
  if (subbed) {
    score += 14;
    reasons.push("из ваших подписок");
  }

  // 2. Аффинити канала (накапливается из досмотров/лайков; может быть отрицательным)
  const chAff = p.channels[video.channelId] || 0;
  if (chAff > 0) {
    score += Math.min(chAff, 12) * 1.3;
    if (!subbed) reasons.push(`вы смотрите «${video.channelTitle}»`);
  } else if (chAff < 0) {
    score += chAff * 1.5; // штраф за «не интересно»/дизлайки канала
  }

  // 3. Аффинити категории
  const catAff = p.categories[video.categoryId] || 0;
  if (catAff > 0) score += Math.min(catAff, 8) * 0.6;

  // 4. Совпадение с интересами по ключевым словам названия/тегов
  const titleWords = keywords(`${video.title} ${(video.tags || []).join(" ")}`);
  let interestHit = 0;
  let topTerm = null;
  for (const [term, weight] of Object.entries(p.interests)) {
    if (titleWords.has(term)) {
      interestHit += weight;
      if (!topTerm || weight > p.interests[topTerm]) topTerm = term;
    }
  }
  if (interestHit > 0) {
    score += Math.min(interestHit, 12);
    if (topTerm) reasons.push(`по интересу: ${topTerm}`);
  }

  // 5. Свежесть — мягкий бонус новизне
  const days = ageDays(video.publishedAt);
  const freshness = Math.max(0, 1 - days / 90);
  score += freshness * 3.5;

  // 6. Популярность + «качество» (лайки/просмотры), мягко
  if (video.views) {
    score += Math.log10(Number(video.views) + 10) * 0.4;
    if (video.likes && Number(video.views) > 0) {
      const ratio = Number(video.likes) / Number(video.views);
      score += Math.min(ratio * 40, 2); // хорошее соотношение лайков
    }
  }

  // 7. Анти-кликбейт
  score -= clickbaitPenalty(video.title);

  // 8. Разведка: новизна канала (нет в профиле) — чтобы лента не зацикливалась
  const novelty = chAff === 0 && !subbed ? freshness : 0;

  // лёгкий джиттер для разнообразия в равных условиях
  const jitter = (parseInt((video.id || "0").replace(/[^a-z0-9]/gi, "0").slice(-3), 36) % 100) / 100;
  score += jitter * 0.6;

  return { score, reasons, novelty };
}

function stripInternal(v) {
  const { _score, _novelty, ...rest } = v;
  return { ...rest, reasons: v._reasons || [] };
}

// ============ ПИТАТЕЛИ (источники кандидатов) ============

function makeChannelFeeder(channelId) {
  let pageToken;
  let exhausted = false;
  return {
    kind: "channel",
    weight: 3,
    get exhausted() { return exhausted; },
    async pull() {
      if (exhausted) return [];
      const { items, nextPageToken } = await yt.channelUploads(channelId, { maxResults: 25, pageToken });
      pageToken = nextPageToken;
      if (!nextPageToken) exhausted = true;
      return items;
    },
  };
}

function makeTrendingFeeder() {
  let pageToken;
  let exhausted = false;
  return {
    kind: "trending",
    weight: 1,
    get exhausted() { return exhausted; },
    async pull() {
      if (exhausted) return [];
      const { items, nextPageToken } = await yt.trendingPaged({ maxResults: 25, pageToken });
      pageToken = nextPageToken;
      if (!nextPageToken) exhausted = true;
      return items;
    },
  };
}

function makeSearchFeeder(query, { order = "relevance", maxPages = 4 } = {}) {
  let pageToken;
  let pages = 0;
  let exhausted = false;
  return {
    kind: "search",
    weight: 2,
    get exhausted() { return exhausted; },
    async pull() {
      if (exhausted) return [];
      const { items, nextPageToken } = await yt.searchPaged(query, { maxResults: 15, order, pageToken });
      pageToken = nextPageToken;
      pages++;
      if (!nextPageToken || pages >= maxPages) exhausted = true;
      return items;
    },
  };
}

function buildFeeders(p) {
  const feeders = [];
  const subs = getSubscriptions();
  const aff = topChannels(10);

  const channelIds = new Set();
  for (const s of subs) channelIds.add(s.id);
  for (const c of aff) channelIds.add(c.id);
  for (const id of channelIds) feeders.push(makeChannelFeeder(id));

  feeders.push(makeTrendingFeeder());

  const interests = topInterests(6).map((i) => i.term);
  const recent = (p.searches || []).slice(0, 3).map((s) => s.q);
  let seeds = [...new Set([...interests, ...recent])];
  if (!seeds.length) seeds = ["технологии", "наука", "музыка"];
  for (const q of seeds.slice(0, 5)) feeders.push(makeSearchFeeder(q));

  return feeders;
}

// Когда всё иссякло — добавляем «разведочные» питатели, чтобы лента не кончалась.
function buildFallbackFeeders(p) {
  const interests = topInterests(8).map((i) => i.term);
  const seeds = interests.length ? interests : ["интересное", "документальный", "обзор", "лучшее"];
  const feeders = [];
  for (const q of seeds.slice(0, 4)) {
    feeders.push(makeSearchFeeder(q, { order: "date", maxPages: 3 }));
    feeders.push(makeSearchFeeder(q, { order: "viewCount", maxPages: 2 }));
  }
  feeders.push(makeTrendingFeeder());
  return feeders;
}

// ============ СЕССИЯ ЛЕНТЫ ============

class FeedSession {
  constructor() {
    this.served = new Set();
    this.buffer = [];
    this.feeders = null;
    this.rr = 0; // round-robin курсор
    this.touched = Date.now();
    this.usedFallback = false;
  }

  excluded(p) {
    return new Set([
      ...this.served,
      ...p.notInterested,
      ...p.dislikes,
      ...p.watchHistory.map((v) => v.id),
    ]);
  }

  async refill(p, target) {
    if (!this.feeders) this.feeders = buildFeeders(p);
    const excluded = this.excluded(p);
    let emptyStreak = 0;
    let pulls = 0;

    // тянем round-robin: пока буфера мало ИЛИ пока не опросили несколько разных
    // источников (чтобы в буфере было разнообразие каналов, а не один канал).
    while (true) {
      const live = this.feeders.filter((f) => !f.exhausted);
      if (!live.length) {
        // всё иссякло — подключаем разведочные питатели один раз за «волну»
        const extra = buildFallbackFeeders(p);
        this.feeders.push(...extra);
        this.usedFallback = true;
        if (extra.every((f) => f.exhausted)) break;
        continue;
      }
      const enoughVariety = pulls >= Math.min(live.length, 5);
      if (this.buffer.length >= target && enoughVariety) break;
      if (pulls > 60) break;
      pulls++;

      const feeder = live[this.rr % live.length];
      this.rr++;

      let items = [];
      try {
        items = await feeder.pull();
      } catch {
        items = [];
      }
      if (!items.length) {
        emptyStreak++;
        if (emptyStreak > live.length * 2) break; // защита от зацикливания
        continue;
      }
      emptyStreak = 0;

      // обогащаем недостающие метаданные (просмотры/длительность/категория) пачкой — дёшево
      const needHydrate = items.filter((v) => v.duration == null && v.id).map((v) => v.id);
      if (needHydrate.length) {
        try {
          const hydrated = await yt.hydrateVideos(needHydrate);
          items = items.map((v) => ({ ...v, ...(hydrated[v.id] || {}) }));
        } catch {
          /* без статистики тоже сойдёт */
        }
      }

      const subscriptions = new Set(getSubscriptions().map((s) => s.id));
      for (const v of items) {
        if (!v.id || excluded.has(v.id) || this.buffer.find((b) => b.id === v.id)) continue;
        const { score, reasons, novelty } = scoreVideo(v, p, { subscriptions });
        this.buffer.push({ ...v, _score: score, _reasons: reasons, _novelty: novelty });
      }
    }
  }

  // Собрать страницу: ~80% «точно твоё» (по score) + ~20% «разведка» (по novelty),
  // с жёстким лимитом не больше 2 видео с одного канала на страницу.
  assemblePage(n) {
    this.buffer.sort((a, b) => b._score - a._score);
    const exploitN = Math.max(1, Math.round(n * 0.8));

    const page = [];
    const taken = new Set();
    const perCh = {};
    const MAX_PER_CH = 2;
    const canAdd = (item) => (perCh[item.channelId || "?"] || 0) < MAX_PER_CH;
    const take = (item) => {
      page.push(item);
      taken.add(item.id);
      perCh[item.channelId || "?"] = (perCh[item.channelId || "?"] || 0) + 1;
    };

    // эксплуатация — лучшие по score
    for (const item of this.buffer) {
      if (page.length >= exploitN) break;
      if (taken.has(item.id) || !canAdd(item)) continue;
      take(item);
    }
    // разведка — самые «новые/незнакомые» из оставшихся
    const rest = this.buffer.filter((x) => !taken.has(x.id)).sort((a, b) => b._novelty - a._novelty);
    for (const item of rest) {
      if (page.length >= n) break;
      if (!canAdd(item)) continue;
      take(item);
    }
    // если из-за лимита по каналам не добрали — добиваем чем есть
    if (page.length < n) {
      for (const item of this.buffer) {
        if (page.length >= n) break;
        if (taken.has(item.id)) continue;
        take(item);
      }
    }

    this.buffer = this.buffer.filter((x) => !taken.has(x.id));
    for (const item of page) this.served.add(item.id);
    return page.map(stripInternal);
  }

  async next(n, p) {
    this.touched = Date.now();
    await this.refill(p, n * 2.5);
    return this.assemblePage(n);
  }
}

// Хранилище сессий (один пользователь, мало сессий). TTL ~2 часа.
const sessions = new Map();
const SESSION_TTL = 1000 * 60 * 60 * 2;

function gc() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.touched > SESSION_TTL) sessions.delete(id);
  // подстраховка от роста
  if (sessions.size > 50) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].touched - b[1].touched)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
}

export function getOrCreateSession(id) {
  gc();
  if (id && sessions.has(id)) return { id, session: sessions.get(id) };
  const newId = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const session = new FeedSession();
  sessions.set(newId, session);
  return { id: newId, session };
}

export async function feedPage({ sessionId, limit = 16 } = {}) {
  const p = getProfile();
  const { id, session } = getOrCreateSession(sessionId);
  const items = await session.next(limit, p);
  return { session: id, items, exhausted: items.length === 0 };
}

// ============ ПОХОЖИЕ (страница просмотра) ============

export async function buildRelated(videoId) {
  const video = await yt.videoDetails(videoId);
  if (!video) return [];
  const p = getProfile();
  const related = await yt.relatedVideos(video, { maxResults: 25 });
  const excluded = new Set([videoId, ...p.notInterested, ...p.dislikes]);
  const subscriptions = new Set(getSubscriptions().map((s) => s.id));
  const scored = related
    .filter((v) => !excluded.has(v.id))
    .map((v) => {
      const { score } = scoreVideo(v, p, { subscriptions });
      return { ...v, _score: score };
    })
    .sort((a, b) => b._score - a._score);
  return scored.map(stripInternal);
}

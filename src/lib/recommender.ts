// Бесконечная персональная лента + многосигнальный скоринг (поверх снапшота профиля).
import * as yt from "./youtube";
import type { Video } from "./youtube";
import { getSnapshot, topChannels, topInterests, type Snapshot } from "./profile";

type Scored = Video & { _score: number; _novelty: number; _reasons: string[] };

function ageDays(publishedAt?: string) {
  if (!publishedAt) return 999;
  return (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
}
function keywords(text = ""): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));
}
function clickbaitPenalty(title = ""): number {
  let pen = 0;
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length > 6 && (title.match(/\p{Lu}/gu) || []).length / letters.length > 0.6) pen += 2;
  if ((title.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length >= 4) pen += 1.5;
  if (/\b(ШОК|СРОЧНО|СЕНСАЦИЯ|ВЫ НЕ ПОВЕРИТЕ)\b/iu.test(title)) pen += 2;
  return pen;
}

function scoreVideo(video: Video, snap: Snapshot): { score: number; reasons: string[]; novelty: number } {
  let score = 0;
  const reasons: string[] = [];
  const subbed = !!(video.channelId && snap.subscriptions[video.channelId]);
  if (subbed) { score += 14; reasons.push("из ваших подписок"); }

  const chAff = (video.channelId && snap.channels[video.channelId]) || 0;
  if (chAff > 0) { score += Math.min(chAff, 12) * 1.3; if (!subbed) reasons.push(`вы смотрите «${video.channelTitle}»`); }
  else if (chAff < 0) score += chAff * 1.5;

  const catAff = (video.categoryId && snap.categories[String(video.categoryId)]) || 0;
  if (catAff > 0) score += Math.min(catAff, 8) * 0.6;

  const titleWords = keywords(`${video.title} ${(video.tags || []).join(" ")}`);
  let interestHit = 0, topTerm: string | null = null;
  for (const [term, weight] of Object.entries(snap.interests)) {
    if (titleWords.has(term)) { interestHit += weight; if (!topTerm || weight > snap.interests[topTerm]) topTerm = term; }
  }
  if (interestHit > 0) { score += Math.min(interestHit, 12); if (topTerm) reasons.push(`по интересу: ${topTerm}`); }

  const days = ageDays(video.publishedAt);
  const freshness = Math.max(0, 1 - days / 90);
  score += freshness * 3.5;

  if (video.views) {
    score += Math.log10(Number(video.views) + 10) * 0.4;
    if (video.likes && Number(video.views) > 0) score += Math.min((Number(video.likes) / Number(video.views)) * 40, 2);
  }
  score -= clickbaitPenalty(video.title);
  const novelty = chAff === 0 && !subbed ? freshness : 0;
  const jitter = (parseInt((video.id || "0").replace(/[^a-z0-9]/gi, "0").slice(-3), 36) % 100) / 100;
  score += jitter * 0.6;
  return { score, reasons, novelty };
}

// ---- питатели ----
type Feeder = { readonly exhausted: boolean; pull: () => Promise<Video[]> };
function makeChannelFeeder(channelId: string): Feeder {
  let pageToken = "", done = false;
  return {
    get exhausted() { return done; },
    async pull() {
      if (done) return [];
      const { items, nextPageToken } = await yt.channelUploads(channelId, { maxResults: 12, pageToken });
      pageToken = nextPageToken || "";
      if (!nextPageToken) done = true;
      return items;
    },
  };
}
function makeTrendingFeeder(): Feeder {
  let pageToken = "", done = false;
  return {
    get exhausted() { return done; },
    async pull() {
      if (done) return [];
      const { items, nextPageToken } = await yt.trendingPaged({ maxResults: 25, pageToken });
      pageToken = nextPageToken || "";
      if (!nextPageToken) done = true;
      return items;
    },
  };
}
function makeSearchFeeder(query: string, { order = "relevance", maxPages = 4 } = {}): Feeder {
  let pageToken = "", pages = 0, done = false;
  return {
    get exhausted() { return done; },
    async pull() {
      if (done) return [];
      const { items, nextPageToken } = await yt.searchPaged(query, { maxResults: 15, order, pageToken });
      pageToken = nextPageToken || "";
      pages++;
      if (!nextPageToken || pages >= maxPages) done = true;
      return items;
    },
  };
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
function buildFeeders(snap: Snapshot): Feeder[] {
  const ids = new Set<string>();
  for (const id of Object.keys(snap.subscriptions)) ids.add(id);
  for (const c of topChannels(snap, 12)) ids.add(c.id);
  const channelFeeders = shuffle([...ids].map(makeChannelFeeder));
  const interests = topInterests(snap, 8).map((i) => i.term);
  let seeds = [...new Set([...interests, ...snap.searches])];
  if (!seeds.length) seeds = ["технологии", "наука", "музыка"];
  const searchFeeders = seeds.slice(0, 6).map((q) => makeSearchFeeder(q));
  const mixed: Feeder[] = [];
  let si = 0;
  channelFeeders.forEach((cf, i) => { mixed.push(cf); if (i % 3 === 2 && si < searchFeeders.length) mixed.push(searchFeeders[si++]); });
  while (si < searchFeeders.length) mixed.push(searchFeeders[si++]);
  return [makeTrendingFeeder(), ...mixed];
}
function buildFallback(snap: Snapshot): Feeder[] {
  const interests = topInterests(snap, 8).map((i) => i.term);
  const seeds = interests.length ? interests : ["интересное", "документальный", "обзор"];
  const feeders: Feeder[] = [];
  for (const q of seeds.slice(0, 4)) { feeders.push(makeSearchFeeder(q, { order: "date", maxPages: 3 })); feeders.push(makeSearchFeeder(q, { order: "viewCount", maxPages: 2 })); }
  feeders.push(makeTrendingFeeder());
  return feeders;
}

// ---- сессия ----
class FeedSession {
  served = new Set<string>();
  buffer: Scored[] = [];
  feeders: Feeder[] = [];
  built = false;
  rr = 0;
  touched = Date.now();

  async refill(snap: Snapshot, n: number) {
    if (!this.built) { this.feeders = buildFeeders(snap); this.built = true; }
    const excluded = new Set<string>([...this.served, ...snap.notInterested, ...snap.dislikes, ...snap.watched]);
    const inBuf = new Set(this.buffer.map((b) => b.id));
    const target = Math.ceil(n * 2.5);
    const contributed = new Set<Feeder>();
    let pulls = 0;
    while (true) {
      const live = this.feeders.filter((f) => !f.exhausted);
      if (!live.length) {
        const extra = buildFallback(snap);
        this.feeders.push(...extra);
        if (extra.every((f) => f.exhausted)) break;
        continue;
      }
      const need = Math.min(live.length, Math.max(5, Math.ceil(n * 0.7)));
      if (this.buffer.length >= target && contributed.size >= need) break;
      if (pulls > 90) break;
      pulls++;
      const feeder = live[this.rr % live.length];
      this.rr++;
      let items: Video[] = [];
      try { items = await feeder.pull(); } catch { items = []; }
      if (!items.length) continue;
      const needHydrate = items.filter((v) => v.duration == null && v.id).map((v) => v.id);
      if (needHydrate.length) {
        try { const h = await yt.hydrateVideos(needHydrate); items = items.map((v) => ({ ...v, ...(h[v.id] || {}) })); } catch { /* ok */ }
      }
      let added = 0;
      for (const v of items) {
        if (!v.id || excluded.has(v.id) || inBuf.has(v.id)) continue;
        if (v.duration != null && v.duration <= 60) continue; // Shorts — только в полке, не в ленте
        const { score, reasons, novelty } = scoreVideo(v, snap);
        this.buffer.push({ ...v, _score: score, _reasons: reasons, _novelty: novelty });
        inBuf.add(v.id);
        added++;
      }
      if (added > 0) contributed.add(feeder);
    }
  }

  assemble(n: number): Video[] {
    this.buffer.sort((a, b) => b._score - a._score);
    const exploitN = Math.max(1, Math.round(n * 0.8));
    const page: Scored[] = [];
    const taken = new Set<string>();
    const perCh: Record<string, number> = {};
    const canAdd = (v: Scored) => (perCh[v.channelId || "?"] || 0) < 2;
    const take = (v: Scored) => { page.push(v); taken.add(v.id); perCh[v.channelId || "?"] = (perCh[v.channelId || "?"] || 0) + 1; };
    for (const v of this.buffer) { if (page.length >= exploitN) break; if (taken.has(v.id) || !canAdd(v)) continue; take(v); }
    const rest = this.buffer.filter((x) => !taken.has(x.id)).sort((a, b) => b._novelty - a._novelty);
    for (const v of rest) { if (page.length >= n) break; if (!canAdd(v)) continue; take(v); }
    if (page.length < n) for (const v of this.buffer) { if (page.length >= n) break; if (taken.has(v.id) || (perCh[v.channelId || "?"] || 0) >= 3) continue; take(v); }
    if (page.length < n) for (const v of this.buffer) { if (page.length >= n) break; if (taken.has(v.id)) continue; take(v); }
    this.buffer = this.buffer.filter((x) => !taken.has(x.id));
    for (const v of page) this.served.add(v.id);
    return page.map(({ _score, _novelty, _reasons, ...rest }) => ({ ...rest, reasons: _reasons }) as Video & { reasons: string[] });
  }
}

const sessions = new Map<string, FeedSession>();
const SESSION_TTL = 1000 * 60 * 60 * 2;
function gc() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.touched > SESSION_TTL) sessions.delete(id);
  if (sessions.size > 50) { const oldest = [...sessions.entries()].sort((a, b) => a[1].touched - b[1].touched)[0]; if (oldest) sessions.delete(oldest[0]); }
}

export async function feedPage({ sessionId = "", limit = 16 } = {}) {
  gc();
  let id = sessionId;
  let session = id ? sessions.get(id) : undefined;
  if (!session) { id = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36); session = new FeedSession(); sessions.set(id, session); }
  session.touched = Date.now();
  const snap = await getSnapshot();
  await session.refill(snap, limit);
  const items = session.assemble(limit);
  return { session: id, items, exhausted: items.length === 0 };
}

// Ряд Shorts (короткие ≤60с) для верха главной
export async function shortsRow({ limit = 24 } = {}) {
  const snap = await getSnapshot();
  const excluded = new Set<string>([...snap.notInterested, ...snap.dislikes]);
  const channelIds = [...new Set([...Object.keys(snap.subscriptions), ...topChannels(snap, 8).map((c) => c.id)])].slice(0, 10);
  const pulls = await Promise.all([
    yt.trendingPaged({ maxResults: 25 }).then((r) => r.items).catch(() => [] as Video[]),
    ...channelIds.map((id) => yt.channelUploads(id, { maxResults: 10 }).then((r) => r.items).catch(() => [] as Video[])),
  ]);
  const cand = new Map<string, Video>();
  for (const arr of pulls) for (const v of arr) if (v.id && !excluded.has(v.id) && !cand.has(v.id)) cand.set(v.id, v);
  const ids = [...cand.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    try { const h = await yt.hydrateVideos(ids.slice(i, i + 50)); for (const [id, full] of Object.entries(h)) cand.set(id, { ...cand.get(id)!, ...full }); } catch { /* ok */ }
  }
  const shorts = [...cand.values()].filter((v) => v.duration != null && v.duration <= 60);
  shorts.sort((a, b) => scoreVideo(b, snap).score - scoreVideo(a, snap).score);
  return shorts.slice(0, limit);
}

export async function buildRelated(videoId: string) {
  const video = await yt.videoDetails(videoId);
  if (!video) return [];
  const snap = await getSnapshot();
  const related = await yt.relatedVideos(video, { maxResults: 25 });
  const excluded = new Set<string>([videoId, ...snap.notInterested, ...snap.dislikes]);
  return related
    .filter((v) => !excluded.has(v.id))
    .map((v) => ({ v, s: scoreVideo(v, snap).score }))
    .sort((a, b) => b.s - a.s)
    .map(({ v }) => v);
}

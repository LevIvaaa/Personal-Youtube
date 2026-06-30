// Профиль рекомендаций поверх PostgreSQL (Prisma).
import { prisma } from "./db";
import type { Video } from "./youtube";

export type Snapshot = {
  interests: Record<string, number>;
  channels: Record<string, number>;
  categories: Record<string, number>;
  subscriptions: Record<string, { title: string; thumbnail: string }>;
  dislikes: Set<string>;
  notInterested: Set<string>;
  watched: Set<string>;
  searches: string[];
};

// ---- кэш снапшота (для быстрой подгрузки ленты) ----
let snapCache: Snapshot | null = null;
let snapAt = 0;
const SNAP_TTL = 8000;
function invalidate() { snapAt = 0; }

export async function getSnapshot(): Promise<Snapshot> {
  if (snapCache && Date.now() - snapAt < SNAP_TTL) return snapCache;
  const [interests, channels, categories, subs, dislikes, ni, watched, searches] = await Promise.all([
    prisma.interest.findMany(),
    prisma.channelAffinity.findMany(),
    prisma.categoryAffinity.findMany(),
    prisma.subscription.findMany(),
    prisma.dislike.findMany(),
    prisma.notInterested.findMany(),
    prisma.watchHistory.findMany({ select: { videoId: true } }),
    prisma.search.findMany({ orderBy: { at: "desc" }, take: 5 }),
  ]);
  snapCache = {
    interests: Object.fromEntries(interests.map((i) => [i.term, i.weight])),
    channels: Object.fromEntries(channels.map((c) => [c.channelId, c.weight])),
    categories: Object.fromEntries(categories.map((c) => [c.categoryId, c.weight])),
    subscriptions: Object.fromEntries(subs.map((s) => [s.channelId, { title: s.title, thumbnail: s.thumbnail }])),
    dislikes: new Set(dislikes.map((d) => d.videoId)),
    notInterested: new Set(ni.map((n) => n.videoId)),
    watched: new Set(watched.map((w) => w.videoId)),
    searches: searches.map((s) => s.q),
  };
  snapAt = Date.now();
  return snapCache;
}

export function topInterests(snap: Snapshot, n = 8) {
  return Object.entries(snap.interests).sort((a, b) => b[1] - a[1]).slice(0, n).map(([term, weight]) => ({ term, weight }));
}
export function topChannels(snap: Snapshot, n = 12) {
  return Object.entries(snap.channels).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, weight]) => ({ id, weight }));
}

// ---- утилиты ----
function keywords(text = ""): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3);
}
const bumpChannel = (channelId: string, amt: number) =>
  prisma.channelAffinity.upsert({ where: { channelId }, create: { channelId, weight: amt }, update: { weight: { increment: amt } } });
const bumpCategory = (categoryId: string, amt: number) =>
  prisma.categoryAffinity.upsert({ where: { categoryId }, create: { categoryId, weight: amt }, update: { weight: { increment: amt } } });
const bumpInterest = (term: string, amt: number) =>
  prisma.interest.upsert({ where: { term }, create: { term, weight: amt }, update: { weight: { increment: amt } } });

// ---- события ----
export type EventInput = any;

export async function recordEvent(event: EventInput): Promise<void> {
  const { type } = event || {};
  if (type === "watch") {
    const v: Video = event.video;
    if (!v?.id) return;
    const watchSeconds: number = event.watchSeconds || 0;
    const ratio = v.duration ? Math.min(1, watchSeconds / v.duration) : 0.3;
    const weight = 0.5 + ratio * 1.5;
    const ops: Promise<unknown>[] = [
      prisma.watchHistory.upsert({
        where: { videoId: v.id },
        create: {
          videoId: v.id, title: v.title || "", channelId: v.channelId, channelTitle: v.channelTitle,
          categoryId: v.categoryId ?? null, thumbnail: v.thumbnail || "", watchSeconds: Math.round(watchSeconds), duration: v.duration ?? null,
          watchedAt: new Date(),
        },
        update: { watchSeconds: Math.round(watchSeconds), watchedAt: new Date(), duration: v.duration ?? undefined },
      }),
    ];
    if (v.channelId) ops.push(bumpChannel(v.channelId, weight));
    if (v.categoryId) ops.push(bumpCategory(String(v.categoryId), weight));
    for (const w of keywords(v.title).slice(0, 6)) ops.push(bumpInterest(w, weight * 0.4));
    await Promise.all(ops);
  } else if (type === "like") {
    const v: Video = event.video;
    if (!v?.id) return;
    const ops: Promise<unknown>[] = [
      prisma.like.upsert({
        where: { videoId: v.id },
        create: { videoId: v.id, title: v.title || "", channelTitle: v.channelTitle, thumbnail: v.thumbnail || "" },
        update: {},
      }),
    ];
    if (v.channelId) ops.push(bumpChannel(v.channelId, 3));
    if (v.categoryId) ops.push(bumpCategory(String(v.categoryId), 2));
    for (const w of keywords(v.title).slice(0, 6)) ops.push(bumpInterest(w, 1));
    await Promise.all(ops);
  } else if (type === "unlike") {
    await prisma.like.deleteMany({ where: { videoId: event.videoId } });
  } else if (type === "dislike") {
    const v: Video = event.video;
    if (!v?.id) return;
    await Promise.all([
      prisma.dislike.upsert({ where: { videoId: v.id }, create: { videoId: v.id }, update: {} }),
      v.channelId ? bumpChannel(v.channelId, -2) : Promise.resolve(),
    ]);
  } else if (type === "notInterested") {
    const ops: Promise<unknown>[] = [];
    if (event.videoId) ops.push(prisma.notInterested.upsert({ where: { videoId: event.videoId }, create: { videoId: event.videoId }, update: {} }));
    if (event.channelId) ops.push(bumpChannel(event.channelId, -3));
    await Promise.all(ops);
  } else if (type === "search") {
    if (event.query) {
      await prisma.search.create({ data: { q: event.query } });
      await Promise.all(keywords(event.query).map((w) => bumpInterest(w, 0.6)));
    }
  } else if (type === "addInterest") {
    const term = String(event.term || "").toLowerCase();
    if (term) await bumpInterest(term, event.weight || 3);
  } else if (type === "removeInterest") {
    await prisma.interest.deleteMany({ where: { term: String(event.term || "").toLowerCase() } });
  } else if (type === "subscribe") {
    const ch = event.channel;
    if (ch?.id) {
      await prisma.subscription.upsert({
        where: { channelId: ch.id },
        create: { channelId: ch.id, title: ch.title || ch.id, thumbnail: ch.thumbnail || "" },
        update: { title: ch.title || ch.id, thumbnail: ch.thumbnail || undefined },
      });
      await prisma.channelAffinity.upsert({ where: { channelId: ch.id }, create: { channelId: ch.id, weight: 8 }, update: {} });
      await prisma.channelAffinity.updateMany({ where: { channelId: ch.id, weight: { lt: 8 } }, data: { weight: 8 } });
    }
  } else if (type === "unsubscribe") {
    if (event.channelId) {
      await prisma.subscription.deleteMany({ where: { channelId: event.channelId } });
      await bumpChannel(event.channelId, -8);
    }
  }
  invalidate();
}

// ---- чтение для UI ----
export async function getSubscriptions() {
  const subs = await prisma.subscription.findMany({ orderBy: { importedAt: "asc" } });
  return subs.map((s) => ({ id: s.channelId, title: s.title, thumbnail: s.thumbnail, subscribed: true }));
}
export async function getHistory(limit = 200) {
  const rows = await prisma.watchHistory.findMany({ orderBy: { updatedAt: "desc" }, take: limit });
  return rows.map((r) => ({
    id: r.videoId, title: r.title, channelId: r.channelId, channelTitle: r.channelTitle,
    categoryId: r.categoryId, thumbnail: r.thumbnail, watchSeconds: r.watchSeconds, duration: r.duration, watchedAt: r.watchedAt,
  }));
}
export async function getLikes() {
  const rows = await prisma.like.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.videoId, title: r.title, channelTitle: r.channelTitle, thumbnail: r.thumbnail }));
}
export async function getProfileStats() {
  const [interests, channels, history, likes, searches, subscriptions] = await Promise.all([
    prisma.interest.findMany({ orderBy: { weight: "desc" }, take: 20 }),
    prisma.channelAffinity.findMany({ where: { weight: { gt: 0 } }, orderBy: { weight: "desc" }, take: 12 }),
    prisma.watchHistory.count(),
    prisma.like.count(),
    prisma.search.count(),
    prisma.subscription.count(),
  ]);
  return {
    interests: interests.map((i) => ({ term: i.term, weight: i.weight })),
    channels: channels.map((c) => ({ id: c.channelId, weight: c.weight })),
    counts: { history, likes, searches, subscriptions },
  };
}
export async function resetProfile() {
  await prisma.$transaction([
    prisma.interest.deleteMany(),
    prisma.channelAffinity.deleteMany(),
    prisma.categoryAffinity.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.watchHistory.deleteMany(),
    prisma.like.deleteMany(),
    prisma.dislike.deleteMany(),
    prisma.notInterested.deleteMany(),
    prisma.search.deleteMany(),
  ]);
  invalidate();
}

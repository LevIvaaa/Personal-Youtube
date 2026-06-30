// Переносит старый data/profile.json в PostgreSQL (одноразово).
import fs from "fs";

import { PrismaClient } from "@prisma/client";

// загрузить .env вручную (у рантайм-клиента нет авто-загрузки)
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const prisma = new PrismaClient();

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
async function many(label: string, rows: any[], fn: (c: any[]) => Promise<unknown>) {
  let done = 0;
  for (const c of chunk(rows, 1000)) { await fn(c); done += c.length; }
  console.log(`  ${label}: ${done}`);
}
function date(v: any): Date {
  const d = v ? new Date(v) : new Date();
  return isNaN(+d) ? new Date() : d;
}

async function main() {
const path = "data/profile.json";
if (!fs.existsSync(path)) { console.error("Нет data/profile.json — нечего переносить."); return; }
const p = JSON.parse(fs.readFileSync(path, "utf8"));
console.log("Переношу data/profile.json в PostgreSQL…");

await many("interests", Object.entries(p.interests || {}), (c) =>
  prisma.interest.createMany({ data: c.map(([term, weight]: any) => ({ term, weight: Number(weight) })), skipDuplicates: true }));

await many("channel_affinity", Object.entries(p.channels || {}), (c) =>
  prisma.channelAffinity.createMany({ data: c.map(([channelId, weight]: any) => ({ channelId, weight: Number(weight) })), skipDuplicates: true }));

await many("category_affinity", Object.entries(p.categories || {}), (c) =>
  prisma.categoryAffinity.createMany({ data: c.map(([categoryId, weight]: any) => ({ categoryId, weight: Number(weight) })), skipDuplicates: true }));

await many("subscriptions", Object.entries(p.subscriptions || {}), (c) =>
  prisma.subscription.createMany({ data: c.map(([channelId, info]: any) => ({ channelId, title: info.title || channelId, thumbnail: info.thumbnail || "", importedAt: date(info.importedAt) })), skipDuplicates: true }));

const histSeen = new Set<string>();
const hist = (p.watchHistory || []).filter((v: any) => v?.id && !histSeen.has(v.id) && histSeen.add(v.id));
await many("watch_history", hist, (c) =>
  prisma.watchHistory.createMany({ data: c.map((v: any) => ({
    videoId: v.id, title: v.title || "", channelId: v.channelId || null, channelTitle: v.channelTitle || null,
    categoryId: v.categoryId ? String(v.categoryId) : null, thumbnail: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
    watchSeconds: Math.round(v.watchSeconds || 0), duration: v.duration ?? null, watchedAt: date(v.watchedAt),
  })), skipDuplicates: true }));

const likeSeen = new Set<string>();
const likes = (p.likes || []).filter((v: any) => v?.id && !likeSeen.has(v.id) && likeSeen.add(v.id));
await many("likes", likes, (c) =>
  prisma.like.createMany({ data: c.map((v: any) => ({ videoId: v.id, title: v.title || "", channelTitle: v.channelTitle || null, thumbnail: v.thumbnail || "" })), skipDuplicates: true }));

await many("dislikes", [...new Set<string>(p.dislikes || [])], (c) =>
  prisma.dislike.createMany({ data: c.map((videoId: string) => ({ videoId })), skipDuplicates: true }));

await many("not_interested", [...new Set<string>(p.notInterested || [])], (c) =>
  prisma.notInterested.createMany({ data: c.map((videoId: string) => ({ videoId })), skipDuplicates: true }));

await many("searches", (p.searches || []).filter((s: any) => s?.q), (c) =>
  prisma.search.createMany({ data: c.map((s: any) => ({ q: s.q, at: date(s.at) })) }));

console.log("Готово.");
}
main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

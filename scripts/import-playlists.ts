// Переносит плейлисты и «Смотреть позже» из Google Takeout в PostgreSQL.
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const prisma = new PrismaClient();

function findPlaylistsDir(base: string): string | null {
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[] = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      const full = path.join(dir, name);
      if (name.endsWith(":Zone.Identifier")) continue;
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (/плейлист|playlist/i.test(name)) return full; stack.push(full); }
    }
  }
  return null;
}

async function main() {
  const takeoutArg = process.argv[2] || "takeout-20260629T203813Z-3-001";
  const dir = findPlaylistsDir(path.resolve(takeoutArg));
  if (!dir) { console.error("Не нашёл папку плейлистов в", takeoutArg); return; }
  console.log("Плейлисты:", dir);

  const files = fs.readdirSync(dir).filter((f) => /Видео в плейлисте .*\.csv$/i.test(f) && !f.endsWith(":Zone.Identifier"));
  let total = 0;
  for (const file of files) {
    const m = file.match(/плейлисте\s+_?(.+?)_?\.csv$/i);
    const name = (m ? m[1] : file.replace(/\.csv$/, "")).trim();
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).slice(1);
    const rows = lines.map((l) => l.trim()).filter(Boolean).map((l) => {
      const [vid, date] = l.split(",");
      return { videoId: (vid || "").trim(), addedAt: date ? new Date(date.trim()) : new Date() };
    }).filter((r) => /^[\w-]{11}$/.test(r.videoId));
    if (!rows.length) continue;
    await prisma.playlistItem.deleteMany({ where: { playlist: name } });
    await prisma.playlistItem.createMany({ data: rows.map((r) => ({ playlist: name, videoId: r.videoId, addedAt: isNaN(+r.addedAt) ? new Date() : r.addedAt })) });
    console.log(`  ${name}: ${rows.length}`);
    total += rows.length;
  }
  console.log("Готово. Видео в плейлистах:", total);
}
main().then(() => prisma.$disconnect()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

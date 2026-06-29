// Импорт Google Takeout (YouTube) в личный профиль рекомендаций.
// Берём историю просмотров (десятки тысяч записей), подписки и Watch Later,
// агрегируем в аффинити каналов + интересы + недавнюю историю.
//
// Запуск:  node scripts/import-takeout.js "<путь к папке takeout-...>"
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const PROFILE_PATH = path.join(DATA_DIR, "profile.json");
const SEED_PATH = path.join(DATA_DIR, "profile.seed.json");

const takeoutArg = process.argv[2];
if (!takeoutArg) {
  console.error('Укажи путь: node scripts/import-takeout.js "takeout-..."');
  process.exit(1);
}

// найти подпапку "YouTube ..." внутри Takeout
function findYouTubeDir(base) {
  const candidates = [base, path.join(base, "Takeout")];
  for (const c of candidates) {
    if (!fs.existsSync(c)) continue;
    const sub = fs.readdirSync(c).find((d) => /youtube/i.test(d));
    if (sub) return path.join(c, sub);
  }
  // вдруг уже указали саму папку YouTube
  if (/youtube/i.test(path.basename(base))) return base;
  return null;
}

const YT = findYouTubeDir(path.resolve(takeoutArg));
if (!YT) {
  console.error("Не нашёл папку YouTube внутри:", takeoutArg);
  process.exit(1);
}
console.log("YouTube data:", YT);

const find = (re) => {
  // рекурсивный поиск файла по регэкспу имени
  const stack = [YT];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (name.endsWith(":Zone.Identifier")) continue;
      const st = fs.statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (re.test(name)) return full;
    }
  }
  return null;
};

// ---------- профиль ----------
let profile;
try {
  profile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
} catch {
  try { profile = JSON.parse(fs.readFileSync(SEED_PATH, "utf8")); delete profile._comment; }
  catch { profile = {}; }
}
profile.interests ||= {};
profile.channels ||= {};
profile.categories ||= {};
profile.watchHistory ||= [];
profile.likes ||= [];
profile.dislikes ||= [];
profile.searches ||= [];
profile.notInterested ||= [];
profile.subscriptions ||= {};

// ---------- стоп-слова (4+ симв.) ----------
const STOP = new Set([
  "это","этот","этом","этой","этого","эту","эти","того","тогда","когда","очень","также","более","есть","быть","была","были","было","будет","может","можно","просто","такой","такие","который","которые","которая","чтобы","потому","почти","совсем","всего","всех","себя","себе","нельзя","конечно","нужно","надо","даже","потом","здесь","сейчас","опять","снова","много","мало","одну","один","одна","одно","два","две","три","или","ещё","еще","тоже","нет","да","как","что","для","про","над","под","без","при","изза","меня","тебя","него","нее","них","вас","нас","мне","тебе","ему"," той","том","тем","эта","все","всё","так","вот","там","где","кто","чем","чём",
  "video","видео","видос","влог","выпуск","серия","часть","полная","трейлер","official","музыка","трек","песня","клип","смотреть","смотрим","новый","новая","новое","новые","лучшие","лучший","топ","обзор","реакция","прохождение","стрим","shorts","feat","prod","remix","the","and","for","you","your","with","this","that","from","what","how","why","все",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

const decode = (s = "") => s
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

// ---------- 1) подписки ----------
const subsFile = find(/подписк|subscriptions/i);
let subsCount = 0;
if (subsFile) {
  const lines = fs.readFileSync(subsFile, "utf8").split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(",");
    const id = cells[0]?.trim();
    const title = cells.slice(2).join(",").trim() || id;
    if (!/^UC[\w-]{20,}$/.test(id)) continue;
    if (!profile.subscriptions[id]) {
      profile.subscriptions[id] = { title, thumbnail: "", importedAt: new Date().toISOString() };
    } else if (!profile.subscriptions[id].title) {
      profile.subscriptions[id].title = title;
    }
    profile.channels[id] = Math.max(profile.channels[id] || 0, 8);
    subsCount++;
  }
}

// ---------- 2) история просмотров ----------
const histFile = find(/истори.*просмотр|watch-?history/i);
const MONTHS = { "янв":0,"фев":1,"мар":2,"апр":3,"мая":4,"май":4,"июн":5,"июл":6,"авг":7,"сен":8,"окт":9,"ноя":10,"дек":11 };
function parseRuDate(s) {
  const m = s && s.match(/(\d{1,2})\s+([а-я]+)\.?\s+(\d{4})/i);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(+m[3], mon, +m[1])).toISOString();
}

let watchTotal = 0;
const channelWatch = new Map(); // id -> {title, count, recencyScore}
const keywordScore = new Map();
const seenVideos = new Set();
const recentHistory = [];

if (histFile) {
  const html = fs.readFileSync(histFile, "utf8");
  const re = /watch\?v=([\w-]{11})[^"]*">((?:(?!<\/a>).)*)<\/a><br><a href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)">((?:(?!<\/a>).)*)<\/a><br>([^<]*)</g;
  let m;
  let idx = 0;
  while ((m = re.exec(html)) !== null) {
    const [, vid, rawTitle, chId, rawCh, rawDate] = m;
    const title = decode(rawTitle).trim();
    const channelTitle = decode(rawCh).trim();
    watchTotal++;
    // recency: записи идут от новых к старым → ранний индекс = свежее
    const recency = 1 + Math.max(0, 1 - idx / 3000) * 2.5; // 1..3.5
    idx++;

    const ch = channelWatch.get(chId) || { title: channelTitle, count: 0, score: 0 };
    ch.count++; ch.score += recency; ch.title = channelTitle;
    channelWatch.set(chId, ch);

    if (idx <= 8000) { // интересы считаем по свежим 8000 (актуальные вкусы)
      for (const w of tokenize(title)) keywordScore.set(w, (keywordScore.get(w) || 0) + recency);
    }

    if (!seenVideos.has(vid) && recentHistory.length < 800) {
      seenVideos.add(vid);
      recentHistory.push({
        id: vid, title, channelId: chId, channelTitle,
        thumbnail: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
        watchedAt: parseRuDate(rawDate) || undefined,
      });
    }
  }
}

// применяем аффинити каналов (свежесть + объём; скоринг всё равно ограничит сверху)
for (const [id, ch] of channelWatch) {
  const aff = Math.min(ch.score, 40); // защита от гигантских чисел
  profile.channels[id] = Math.max(profile.channels[id] || 0, aff);
  // подхватим название канала, если знаем
  if (profile.subscriptions[id] && !profile.subscriptions[id].title) profile.subscriptions[id].title = ch.title;
}

// топ-интересы → нормируем так, чтобы максимум ≈ 9
const topKw = [...keywordScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 120);
if (topKw.length) {
  const max = topKw[0][1];
  for (const [w, sc] of topKw) {
    const weight = +(sc / max * 9).toFixed(2);
    if (weight >= 0.5) profile.interests[w] = Math.max(profile.interests[w] || 0, weight);
  }
}

// недавняя история (для страницы «История» и исключения из ленты)
profile.watchHistory = recentHistory;

// ---------- 3) Watch Later (мягкий сигнал интереса) ----------
const wlFile = find(/watch later|посмотреть позже|смотреть позже/i);
let wlCount = 0;
if (wlFile) {
  const lines = fs.readFileSync(wlFile, "utf8").split(/\r?\n/).slice(1);
  wlCount = lines.filter((l) => /^[\w-]{11},/.test(l.trim())).length;
}

// ---------- сохранить ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2));

const topChannels = [...channelWatch.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 10);
console.log("\n===== ИМПОРТ ЗАВЕРШЁН =====");
console.log("Подписок:            ", subsCount, "(в профиле:", Object.keys(profile.subscriptions).length + ")");
console.log("Просмотров в истории:", watchTotal, "| уникальных каналов:", channelWatch.size);
console.log("Сохранено в историю: ", profile.watchHistory.length, "(недавние)");
console.log("Интересов выделено:  ", Object.keys(profile.interests).length);
console.log("Watch Later видео:   ", wlCount);
console.log("\nТоп-10 каналов по просмотрам:");
for (const [, ch] of topChannels) console.log(`  ${String(ch.count).padStart(5)}×  ${ch.title}`);
console.log("\nТоп-15 интересов:");
console.log("  " + [...keywordScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w).join(", "));

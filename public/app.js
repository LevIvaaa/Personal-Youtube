// Personal YouTube — фронтенд SPA.
const view = document.getElementById("view");
const chipsEl = document.getElementById("chips");
const apiBanner = document.getElementById("apiBanner");

const CHIPS = ["Все", "Видеоигры", "Музыка", "Технологии", "Наука", "Новости", "Спорт", "Фильмы", "Подкасты"];

// ---------- утилиты ----------
const api = async (url, opts) => {
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.message || res.statusText), { code: json.error, status: res.status });
  return json;
};

const post = (body) => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function formatViews(n) {
  if (n == null) return "";
  n = Number(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " млн просмотров";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " тыс. просмотров";
  return n + " просмотров";
}
function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units = [["год", 31536000], ["мес.", 2592000], ["нед.", 604800], ["дн.", 86400], ["ч.", 3600], ["мин.", 60]];
  for (const [label, sec] of units) {
    const v = Math.floor(s / sec);
    if (v >= 1) return `${v} ${label} назад`;
  }
  return "только что";
}
function formatDuration(sec) {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const pad = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
function escapeHtml(s = "") { return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function initials(name = "?") { return name.trim().charAt(0).toUpperCase() || "?"; }

let toastTimer;
function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

// кэш видео в памяти, чтобы при переходе на просмотр знать метаданные
const videoCache = new Map();
function cacheVideos(items) { for (const v of items) if (v?.id) videoCache.set(v.id, { ...videoCache.get(v.id), ...v }); }

// ---------- карточки ----------
function videoCard(v) {
  const reason = v.reasons && v.reasons.length ? `<div class="card-reason">Рекомендуем: ${escapeHtml(v.reasons[0])}</div>` : "";
  return `
  <div class="card" data-id="${v.id}">
    <div class="thumb-wrap">
      <img loading="lazy" src="${v.thumbnail || ""}" alt="" />
      ${v.duration != null ? `<span class="duration">${formatDuration(v.duration)}</span>` : ""}
    </div>
    <div class="card-body">
      <div class="ch-avatar">${initials(v.channelTitle)}</div>
      <div class="card-meta">
        <h3 class="card-title">${escapeHtml(v.title || "")}</h3>
        <div class="card-channel">${escapeHtml(v.channelTitle || "")}</div>
        <div class="card-sub">${[formatViews(v.views), timeAgo(v.publishedAt)].filter(Boolean).join(" · ")}</div>
        ${reason}
      </div>
      <div class="card-menu">
        <button title="Не интересно" data-action="notInterested" data-id="${v.id}" data-ch="${v.channelId || ""}">⋮</button>
      </div>
    </div>
  </div>`;
}

function grid(items) {
  if (!items || !items.length) return `<div class="empty">Пока пусто. Посмотри что-нибудь — лента подстроится.</div>`;
  return `<div class="grid">${items.map(videoCard).join("")}</div>`;
}

function skeletonGrid(n = 12) {
  return `<div class="grid">${Array.from({ length: n }).map(() => `
    <div class="card"><div class="thumb-wrap skeleton sk-thumb"></div>
    <div class="card-body"><div class="ch-avatar skeleton"></div><div class="card-meta" style="flex:1">
    <div class="sk-line skeleton" style="width:90%"></div><div class="sk-line skeleton" style="width:55%"></div></div></div></div>`).join("")}</div>`;
}

// ---------- роутер ----------
const routes = {
  home: renderHome,
  trending: renderTrending,
  subscriptions: renderSubscriptions,
  history: renderHistory,
  liked: renderLiked,
  search: renderSearch,
  watch: renderWatch,
};

async function router() {
  const hash = location.hash.slice(1) || "/";
  const [, route = "home", arg = ""] = hash.match(/^\/([^/]*)\/?(.*)$/) || [];
  const name = route === "" ? "home" : route;

  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.route === name));
  chipsEl.style.display = ["home", "search", "trending"].includes(name) ? "flex" : "none";

  const handler = routes[name] || renderHome;
  try {
    await handler(decodeURIComponent(arg));
  } catch (err) {
    if (err.code === "NO_API_KEY") {
      apiBanner.classList.remove("hidden");
      view.innerHTML = "";
    } else {
      view.innerHTML = `<div class="error-box">Ошибка: ${escapeHtml(err.message)}</div>`;
    }
  }
}

// ---------- экраны ----------
let activeChip = "Все";

function renderChips() {
  chipsEl.innerHTML = CHIPS.map((c) => `<div class="chip ${c === activeChip ? "active" : ""}" data-chip="${c}">${c}</div>`).join("");
}

async function renderHome() {
  renderChips();
  view.innerHTML = skeletonGrid();
  if (activeChip !== "Все") return renderSearchInline(activeChip);
  const { items } = await api("/api/feed?limit=40");
  cacheVideos(items);
  view.innerHTML = grid(items);
}

async function renderSearchInline(q) {
  view.innerHTML = skeletonGrid(8);
  const { items } = await api(`/api/search?q=${encodeURIComponent(q)}`);
  cacheVideos(items);
  view.innerHTML = grid(items);
}

async function renderSearch(q) {
  renderChips();
  document.getElementById("searchInput").value = q;
  view.innerHTML = `<div class="section-title">Результаты: «${escapeHtml(q)}»</div>` + skeletonGrid(8);
  const { items } = await api(`/api/search?q=${encodeURIComponent(q)}`);
  cacheVideos(items);
  view.innerHTML = `<div class="section-title">Результаты: «${escapeHtml(q)}»</div>` + grid(items);
}

async function renderTrending() {
  renderChips();
  view.innerHTML = `<div class="section-title">В тренде</div>` + skeletonGrid();
  const { items } = await api("/api/trending");
  cacheVideos(items);
  view.innerHTML = `<div class="section-title">В тренде</div>` + grid(items);
}

async function renderHistory() {
  view.innerHTML = `<div class="section-title">История просмотров</div>` + skeletonGrid(6);
  const { items } = await api("/api/history");
  cacheVideos(items);
  view.innerHTML = `<div class="section-title">История просмотров</div>` + grid(items);
}

async function renderLiked() {
  view.innerHTML = `<div class="section-title">Понравившиеся</div>` + skeletonGrid(6);
  const { items } = await api("/api/liked");
  cacheVideos(items);
  view.innerHTML = `<div class="section-title">Понравившиеся</div>` + grid(items);
}

async function renderSubscriptions() {
  view.innerHTML = `<div class="section-title">Любимые каналы</div>` + skeletonGrid(6);
  const { channels } = await api("/api/subscriptions");
  if (!channels.length) {
    view.innerHTML = `<div class="section-title">Любимые каналы</div><div class="empty">Каналы появятся, когда ты начнёшь смотреть видео.</div>`;
    return;
  }
  view.innerHTML = `<div class="section-title">Любимые каналы</div>
    <div class="grid">${channels.map((c) => `
      <div class="card" data-search="${escapeHtml(c.title)}">
        <div style="display:flex;gap:12px;align-items:center">
          ${c.thumbnail ? `<img class="ch-avatar" style="width:56px;height:56px" src="${c.thumbnail}">` : `<div class="ch-avatar" style="width:56px;height:56px">${initials(c.title)}</div>`}
          <div><div style="font-weight:600">${escapeHtml(c.title)}</div>
          <div class="card-sub">${c.subscribers ? formatViews(c.subscribers).replace("просмотров", "подписчиков") : ""}</div></div>
        </div>
      </div>`).join("")}</div>`;
}

async function renderWatch(id) {
  chipsEl.style.display = "none";
  const known = videoCache.get(id);
  view.innerHTML = `<div class="watch">
    <div><div class="player-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
    <div id="watchInfo">${known ? `<div class="watch-title">${escapeHtml(known.title)}</div>` : ""}</div></div>
    <div class="related"><h3>Похожие видео</h3><div id="relatedList">${skeletonGrid(0)}</div></div>
  </div>`;

  // запись старта просмотра — обновим, когда придут детали
  const { video, related } = await api(`/api/video/${id}`);
  const v = video || known || { id };
  cacheVideos([v, ...(related || [])]);

  // фиксируем просмотр
  watchStart(v);

  document.getElementById("watchInfo").innerHTML = `
    <div class="watch-title">${escapeHtml(v.title || "")}</div>
    <div class="watch-bar">
      <div class="watch-channel">
        <div class="ch-avatar" style="width:40px;height:40px">${initials(v.channelTitle)}</div>
        <div><div class="name">${escapeHtml(v.channelTitle || "")}</div>
        <div class="subs">${formatViews(v.views)}${v.publishedAt ? " · " + timeAgo(v.publishedAt) : ""}</div></div>
      </div>
      <button class="pill-btn" id="likeBtn" data-id="${id}">👍 <span>Нравится</span></button>
      <button class="pill-btn" id="dislikeBtn">👎</button>
      <a class="pill-btn" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">↗ YouTube</a>
    </div>`;

  document.getElementById("relatedList").innerHTML = (related || []).map((r) => `
    <div class="related-card" data-id="${r.id}">
      <div class="related-thumb"><img loading="lazy" src="${r.thumbnail}">${r.duration != null ? `<span class="duration">${formatDuration(r.duration)}</span>` : ""}</div>
      <div class="related-meta"><div class="t">${escapeHtml(r.title)}</div>
      <div class="c">${escapeHtml(r.channelTitle || "")}</div><div class="c">${[formatViews(r.views), timeAgo(r.publishedAt)].filter(Boolean).join(" · ")}</div></div>
    </div>`).join("");

  document.getElementById("likeBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle("active");
    const liked = btn.classList.contains("active");
    post({ type: liked ? "like" : "unlike", video: v, videoId: id });
    toast(liked ? "Добавлено в понравившиеся" : "Убрано из понравившихся");
  });
  document.getElementById("dislikeBtn").addEventListener("click", () => {
    post({ type: "dislike", video: v });
    toast("Учли: меньше такого");
  });
}

// ---------- учёт времени просмотра ----------
let currentWatch = null;
function watchStart(video) {
  flushWatch();
  currentWatch = { video, start: Date.now() };
}
function flushWatch() {
  if (!currentWatch) return;
  const seconds = (Date.now() - currentWatch.start) / 1000;
  if (seconds > 3) {
    post({ type: "watch", video: currentWatch.video, watchSeconds: seconds });
    loadSidebarSubs();
  }
  currentWatch = null;
}
window.addEventListener("beforeunload", flushWatch);

// ---------- глобальные клики ----------
document.addEventListener("click", (e) => {
  const card = e.target.closest("[data-id]");
  const menuBtn = e.target.closest("[data-action='notInterested']");
  if (menuBtn) {
    e.preventDefault(); e.stopPropagation();
    post({ type: "notInterested", videoId: menuBtn.dataset.id, channelId: menuBtn.dataset.ch });
    const c = menuBtn.closest(".card"); if (c) c.style.display = "none";
    toast("Скрыто. Это повлияет на рекомендации.");
    return;
  }
  const searchCard = e.target.closest("[data-search]");
  if (searchCard) { goSearch(searchCard.dataset.search); return; }
  if (card && card.dataset.id) {
    flushWatch();
    location.hash = `#/watch/${card.dataset.id}`;
  }
});

// ---------- поиск ----------
function goSearch(q) {
  document.getElementById("searchInput").value = q;
  location.hash = `#/search/${encodeURIComponent(q)}`;
}
document.getElementById("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("searchInput").value.trim();
  if (q) goSearch(q);
});

// чипсы
chipsEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  activeChip = chip.dataset.chip;
  if (location.hash.startsWith("#/search")) location.hash = "#/";
  renderHome();
});

// меню
document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("collapsed");
});

// ---------- сайдбар: любимые каналы ----------
async function loadSidebarSubs() {
  try {
    const { channels } = await api("/api/subscriptions");
    const box = document.getElementById("subsList");
    if (!channels.length) return;
    box.innerHTML = `<div class="nav-title">Любимые каналы</div>` + channels.slice(0, 8).map((c) => `
      <a class="nav-item" data-search="${escapeHtml(c.title)}" href="#">
        ${c.thumbnail ? `<img src="${c.thumbnail}">` : `<div class="ch-avatar" style="width:24px;height:24px;font-size:11px">${initials(c.title)}</div>`}
        <span>${escapeHtml(c.title)}</span></a>`).join("");
  } catch { /* нет ключа — игнор */ }
}

// ---------- настройки рекомендаций ----------
const settingsModal = document.getElementById("settingsModal");
document.getElementById("openSettings").addEventListener("click", openSettings);
document.getElementById("closeSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });

async function openSettings() {
  settingsModal.classList.remove("hidden");
  await renderSettings();
}
async function renderSettings() {
  const data = await api("/api/profile");
  const itEl = document.getElementById("interestTags");
  itEl.innerHTML = data.interests.length
    ? data.interests.map((i) => `<span class="tag">${escapeHtml(i.term)} <span class="w">${i.weight.toFixed(1)}</span><button data-remove-interest="${escapeHtml(i.term)}">×</button></span>`).join("")
    : `<span class="card-sub">Интересы появятся по мере просмотра.</span>`;
  const chEl = document.getElementById("channelTags");
  chEl.innerHTML = data.channels.length
    ? data.channels.map((c) => `<span class="tag">${escapeHtml(c.title || c.id)} <span class="w">${c.weight.toFixed(1)}</span></span>`).join("")
    : `<span class="card-sub">Каналы появятся по мере просмотра.</span>`;
  document.getElementById("profileStats").innerHTML =
    `<span>История: ${data.counts.history}</span><span>Лайки: ${data.counts.likes}</span><span>Поисков: ${data.counts.searches}</span>`;
}

document.getElementById("addInterestForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const inp = document.getElementById("interestInput");
  const term = inp.value.trim();
  if (!term) return;
  await post({ type: "addInterest", term, weight: 4 });
  inp.value = "";
  renderSettings();
  toast("Интерес добавлен");
});

document.getElementById("interestTags").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-remove-interest]");
  if (!btn) return;
  await post({ type: "removeInterest", term: btn.dataset.removeInterest });
  renderSettings();
});

document.getElementById("resetProfile").addEventListener("click", async () => {
  if (!confirm("Сбросить весь профиль рекомендаций? История, лайки и интересы будут удалены.")) return;
  await fetch("/api/profile/reset", { method: "POST" });
  settingsModal.classList.add("hidden");
  toast("Профиль сброшен");
  if ((location.hash.slice(1) || "/") === "/") renderHome(); else location.hash = "#/";
});

// ---------- запуск ----------
async function init() {
  try {
    const status = await api("/api/status");
    apiBanner.classList.toggle("hidden", status.configured);
  } catch { /* ignore */ }
  loadSidebarSubs();
  window.addEventListener("hashchange", router);
  router();
}
init();

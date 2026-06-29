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
// прокси картинок через localhost (браузер может не тянуть Google CDN напрямую)
function proxify(url) { return url ? `/img?u=${encodeURIComponent(url)}` : ""; }
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
      <img loading="lazy" src="${proxify(v.thumbnail)}" alt="" />
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

  if (name !== "home") teardownFeed(); // у домашней ленты свой observer
  if (name !== "watch") destroyPlayer(); // освобождаем плеер при уходе со страницы

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

// ---------- бесконечная лента ----------
let feed = { session: null, loading: false, observer: null, gridEl: null, emptyStreak: 0 };

function teardownFeed() {
  if (feed.observer) { feed.observer.disconnect(); feed.observer = null; }
  feed = { session: null, loading: false, observer: null, gridEl: null, emptyStreak: 0 };
}

async function renderHome() {
  renderChips();
  if (activeChip !== "Все") return renderSearchInline(activeChip);

  teardownFeed();
  view.innerHTML = `<div class="grid" id="feedGrid"></div>
    <div class="feed-loader" id="feedLoader"><span class="spinner"></span> Подбираем под тебя…</div>
    <div class="feed-sentinel" id="feedSentinel"></div>`;
  feed.gridEl = document.getElementById("feedGrid");

  await loadFeedPage(); // первая страница

  // подгрузка при прокрутке к концу
  const sentinel = document.getElementById("feedSentinel");
  feed.observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadFeedPage();
  }, { rootMargin: "1200px 0px" }); // начинаем грузить заранее
  feed.observer.observe(sentinel);
}

async function loadFeedPage() {
  if (feed.loading) return;
  feed.loading = true;
  const loader = document.getElementById("feedLoader");
  if (loader) loader.style.display = "flex";
  try {
    const q = feed.session ? `&session=${encodeURIComponent(feed.session)}` : "";
    const { items, session } = await api(`/api/feed?limit=12${q}`);
    feed.session = session;
    cacheVideos(items);
    if (!feed.gridEl) return;
    if (items.length === 0) {
      feed.emptyStreak++;
      // лента «бесконечная»: пара пустых ответов подряд = источники иссякли
      if (feed.emptyStreak >= 2) {
        if (loader) loader.outerHTML = `<div class="feed-end">Пока всё. Посмотри/лайкни что-нибудь — и появится ещё.</div>`;
        if (feed.observer) feed.observer.disconnect();
      }
      return;
    }
    feed.emptyStreak = 0;
    feed.gridEl.insertAdjacentHTML("beforeend", items.map(videoCard).join(""));
  } catch (err) {
    if (err.code === "NO_API_KEY") { apiBanner.classList.remove("hidden"); teardownFeed(); }
  } finally {
    feed.loading = false;
  }
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

let historyItems = [];
let historyTab = "all";

function shortCard(v) {
  return `<div class="short-card" data-id="${v.id}">
    <div class="short-thumb"><img loading="lazy" src="${proxify(v.thumbnail)}" alt=""></div>
    <div class="short-title">${escapeHtml(v.title || "")}</div>
    <div class="short-ch">${escapeHtml(v.channelTitle || "")}</div>
  </div>`;
}

function renderHistoryTab() {
  const box = document.getElementById("histContent");
  if (!box) return;
  const shorts = historyItems.filter((v) => v.isShort);
  const videos = historyItems.filter((v) => !v.isShort);

  if (historyTab === "video") {
    box.innerHTML = grid(videos);
  } else if (historyTab === "shorts") {
    box.innerHTML = shorts.length
      ? `<div class="shorts-grid">${shorts.map(shortCard).join("")}</div>`
      : `<div class="empty">Shorts в истории пока нет.</div>`;
  } else {
    const shelf = shorts.length
      ? `<div class="shorts-shelf"><h3 class="shelf-title">⚡ Shorts</h3><div class="shorts-row">${shorts.map(shortCard).join("")}</div></div>`
      : "";
    box.innerHTML = shelf + grid(videos);
  }
}

async function renderHistory() {
  view.innerHTML = `<div class="section-title">История просмотров</div>
    <div class="tabs" id="histTabs">
      <button class="tab ${historyTab === "all" ? "active" : ""}" data-tab="all">Все</button>
      <button class="tab ${historyTab === "video" ? "active" : ""}" data-tab="video">Видео</button>
      <button class="tab ${historyTab === "shorts" ? "active" : ""}" data-tab="shorts">Shorts</button>
    </div>
    <div id="histContent">${skeletonGrid(8)}</div>`;
  const { items } = await api("/api/history");
  cacheVideos(items);
  historyItems = items;
  renderHistoryTab();
  document.getElementById("histTabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    historyTab = t.dataset.tab;
    document.querySelectorAll("#histTabs .tab").forEach((x) => x.classList.toggle("active", x === t));
    renderHistoryTab();
  });
}

async function renderLiked() {
  view.innerHTML = `<div class="section-title">Понравившиеся</div>` + skeletonGrid(6);
  const { items } = await api("/api/liked");
  cacheVideos(items);
  view.innerHTML = `<div class="section-title">Понравившиеся</div>` + grid(items);
}

async function renderSubscriptions() {
  view.innerHTML = `<div class="section-title">Подписки</div>` + skeletonGrid(6);
  const { channels } = await api("/api/subscriptions");
  if (!channels.length) {
    view.innerHTML = `<div class="section-title">Подписки</div><div class="empty">Каналы появятся, когда ты начнёшь смотреть видео.</div>`;
    return;
  }
  view.innerHTML = `<div class="section-title">Подписки</div>
    <div class="grid">${channels.map((c) => `
      <div class="card" data-search="${escapeHtml(c.title)}">
        <div style="display:flex;gap:12px;align-items:center">
          ${c.thumbnail ? `<img class="ch-avatar" style="width:56px;height:56px" src="${proxify(c.thumbnail)}">` : `<div class="ch-avatar" style="width:56px;height:56px">${initials(c.title)}</div>`}
          <div><div style="font-weight:600">${escapeHtml(c.title)}</div>
          <div class="card-sub">${c.subscribers ? formatViews(c.subscribers).replace("просмотров", "подписчиков") : ""}</div></div>
        </div>
      </div>`).join("")}</div>`;
}

async function renderWatch(id) {
  chipsEl.style.display = "none";
  const known = videoCache.get(id);
  view.innerHTML = `<div class="watch">
    <div>
      <div class="player-wrap" id="playerWrap">
        <div id="ytplayer"></div>
        <div class="vctrl" id="vctrl" style="display:none">
          <div class="vbar" id="vbar"><div class="vbar-fill" id="vfill"></div><div class="vbar-knob" id="vknob"></div></div>
          <div class="vrow">
            <button class="vbtn" id="vplay" title="Пауза/воспроизведение">▶</button>
            <button class="vbtn" id="vmute" title="Звук">🔊</button>
            <span class="vtime" id="vtime">0:00 / 0:00</span>
            <span class="vspacer"></span>
            <button class="vbtn" id="vfull" title="Во весь экран">⛶</button>
          </div>
        </div>
      </div>
      <div id="watchInfo">${known ? `<div class="watch-title">${escapeHtml(known.title)}</div>` : ""}</div>
    </div>
    <div class="related"><h3>Похожие видео</h3><div id="relatedList">${skeletonGrid(0)}</div></div>
  </div>`;

  setupPlayer(id);

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
      <div class="related-thumb"><img loading="lazy" src="${proxify(r.thumbnail)}">${r.duration != null ? `<span class="duration">${formatDuration(r.duration)}</span>` : ""}</div>
      <div class="related-meta"><div class="t">${escapeHtml(r.title)}</div>
      <div class="c">${escapeHtml(r.channelTitle || "")}</div><div class="c">${[formatViews(r.views), timeAgo(r.publishedAt)].filter(Boolean).join(" · ")}</div></div>
    </div>`).join("");

  document.getElementById("likeBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    btn.classList.toggle("active");
    const liked = btn.classList.contains("active");
    post({ type: liked ? "like" : "unlike", video: v, videoId: id }).then(() => loadSidebarSubs());
    toast(liked ? "Добавлено в понравившиеся" : "Убрано из понравившихся");
  });
  document.getElementById("dislikeBtn").addEventListener("click", () => {
    post({ type: "dislike", video: v });
    toast("Учли: меньше такого");
  });
}

// ---------- кастомный плеер с синей полосой #2ea8ef ----------
let ytApiPromise = null;
function loadYTApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) try { prev(); } catch {} resolve(); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => reject(new Error("yt api blocked"));
    document.head.appendChild(tag);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) reject(new Error("yt api timeout")); }, 6000);
  });
  return ytApiPromise;
}

let ytPlayer = null, ytPoll = null, ytDuration = 0, ytSeeking = false, playerGlobalsWired = false;

function destroyPlayer() {
  if (ytPoll) { clearInterval(ytPoll); ytPoll = null; }
  if (ytPlayer && ytPlayer.destroy) { try { ytPlayer.destroy(); } catch {} }
  ytPlayer = null; ytDuration = 0; ytSeeking = false;
}

async function setupPlayer(videoId) {
  destroyPlayer();
  const target = document.getElementById("ytplayer");
  if (!target) return;
  try {
    await loadYTApi();
    if (!document.getElementById("ytplayer")) return; // ушли со страницы пока грузился API
    ytPlayer = new YT.Player("ytplayer", {
      width: "100%", height: "100%", videoId,
      playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3 },
      events: { onReady: onPlayerReady, onStateChange: onPlayerState },
    });
  } catch {
    // запасной плеер: обычный ютуб (полоса красная), зато видео точно играет
    target.outerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0"></iframe>`;
  }
}

function onPlayerReady() {
  const ctrl = document.getElementById("vctrl");
  if (ctrl) ctrl.style.display = "";
  try { ytDuration = ytPlayer.getDuration() || 0; } catch {}
  wirePlayerControls();
  ytPoll = setInterval(updatePlayerProgress, 250);
}

function onPlayerState(e) {
  const btn = document.getElementById("vplay");
  if (btn) btn.textContent = e.data === YT.PlayerState.PLAYING ? "⏸" : "▶";
  if (!ytDuration) { try { ytDuration = ytPlayer.getDuration() || 0; } catch {} }
}

function setBar(ratio) {
  const fill = document.getElementById("vfill"), knob = document.getElementById("vknob");
  if (fill) fill.style.width = (ratio * 100) + "%";
  if (knob) knob.style.left = (ratio * 100) + "%";
}

function updatePlayerProgress() {
  if (!ytPlayer || ytSeeking) return;
  let t = 0;
  try { t = ytPlayer.getCurrentTime() || 0; if (!ytDuration) ytDuration = ytPlayer.getDuration() || 0; } catch { return; }
  const ratio = ytDuration ? Math.min(1, t / ytDuration) : 0;
  setBar(ratio);
  const time = document.getElementById("vtime");
  if (time) time.textContent = `${formatDuration(Math.floor(t))} / ${formatDuration(Math.floor(ytDuration))}`;
}

function seekToClientX(clientX) {
  const bar = document.getElementById("vbar");
  if (!bar || !ytPlayer) return;
  const rect = bar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  if (ytDuration) ytPlayer.seekTo(ratio * ytDuration, true);
  setBar(ratio);
}

function wirePlayerControls() {
  if (!playerGlobalsWired) {
    playerGlobalsWired = true;
    window.addEventListener("mousemove", (e) => { if (ytSeeking) seekToClientX(e.clientX); });
    window.addEventListener("mouseup", () => { ytSeeking = false; });
  }
  document.getElementById("vbar").addEventListener("mousedown", (e) => { ytSeeking = true; seekToClientX(e.clientX); });
  document.getElementById("vplay").addEventListener("click", () => {
    if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
  });
  const muteBtn = document.getElementById("vmute");
  muteBtn.addEventListener("click", () => {
    if (ytPlayer.isMuted()) { ytPlayer.unMute(); muteBtn.textContent = "🔊"; }
    else { ytPlayer.mute(); muteBtn.textContent = "🔇"; }
  });
  document.getElementById("vfull").addEventListener("click", () => {
    const wrap = document.getElementById("playerWrap");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (wrap?.requestFullscreen) wrap.requestFullscreen();
  });
}

// ---------- учёт времени просмотра ----------
let currentWatch = null;
function watchStart(video) {
  flushWatch();
  currentWatch = { video, start: Date.now() };
  // реальное время: запись падает в историю сразу при открытии
  post({ type: "watch", video, watchSeconds: 0 }).then(() => loadSidebarSubs());
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
    const title = channels.some((c) => c.subscribed) ? "Подписки" : "Любимые каналы";
    box.innerHTML = `<div class="nav-title">${title}</div>` + channels.slice(0, 10).map((c) => `
      <a class="nav-item" data-search="${escapeHtml(c.title)}" href="#">
        ${c.thumbnail ? `<img src="${proxify(c.thumbnail)}">` : `<div class="ch-avatar" style="width:24px;height:24px;font-size:11px">${initials(c.title)}</div>`}
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
    `<span>Подписки: ${data.counts.subscriptions ?? 0}</span><span>История: ${data.counts.history}</span><span>Лайки: ${data.counts.likes}</span><span>Поисков: ${data.counts.searches}</span>`;
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

document.getElementById("importSubsBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const inputEl = document.getElementById("subsInput");
  const fileEl = document.getElementById("subsFile");
  const resEl = document.getElementById("importResult");

  let raw = inputEl.value.trim();
  if (fileEl.files && fileEl.files[0]) {
    try { raw = (raw + "\n" + (await fileEl.files[0].text())).trim(); } catch { /* ignore */ }
  }
  if (!raw) { toast("Вставь подписки или выбери файл"); return; }

  btn.disabled = true;
  resEl.textContent = "Импортирую… (для @handle/названий это может занять время)";
  try {
    const r = await fetch("/api/subscriptions/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || "ошибка");
    resEl.textContent = `Готово: добавлено ${d.imported} каналов${d.unresolved ? `, не распознано ${d.unresolved}` : ""}.`;
    inputEl.value = ""; fileEl.value = "";
    loadSidebarSubs();
    renderSettings();
    toast(`Подписки перенесены: ${d.imported}`);
  } catch (err) {
    resEl.textContent = "Ошибка импорта: " + err.message;
  } finally {
    btn.disabled = false;
  }
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

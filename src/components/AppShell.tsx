"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { proxify, initials } from "@/lib/format";

type Sub = { id: string; title: string; thumbnail?: string; subscribed?: boolean };
type ProfileData = { interests: { term: string; weight: number }[]; channels: { id: string; weight: number; title?: string }[]; counts: { history: number; likes: number; searches: number; subscriptions: number } };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const route = (pathname || "/").split("/")[1] || "home";

  const loadSubs = useCallback(async () => {
    try { const r = await fetch("/api/subscriptions"); const d = await r.json(); setSubs(d.channels || []); } catch {}
  }, []);

  useEffect(() => {
    setTheme(localStorage.getItem("theme") === "light" ? "light" : "dark");
    setAvatar(localStorage.getItem("avatar"));
    loadSubs();
  }, [loadSubs]);

  // боковая панель скрывается на странице видео и в просмотрщике Shorts (но не в сетке /shorts)
  const isViewer = (pathname || "").startsWith("/watch/") || (pathname || "").startsWith("/shorts");
  useEffect(() => { setCollapsed(isViewer); }, [isViewer]);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    if (menuOpen) { document.addEventListener("click", close); return () => document.removeEventListener("click", close); }
  }, [menuOpen]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("light", next === "light");
  };
  const onAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { localStorage.setItem("avatar", reader.result as string); setAvatar(reader.result as string); } catch {} };
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); const s = q.trim(); if (s) router.push(`/search?q=${encodeURIComponent(s)}`); };

  const navTitle = subs.some((s) => s.subscribed) ? "Подписки" : "Любимые каналы";

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <button className="icon-btn" onClick={() => setCollapsed((c) => !c)}>
            <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <Link className="logo" href="/">
            <img className="logo-mark" src="/play-icon.svg" alt="NyaTube" width={28} height={28} />
            <span className="logo-text">NyaTube</span>
          </Link>
        </div>
        <div className="topbar-center">
          <form className="search" onSubmit={submitSearch}>
            <input value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Поиск" autoComplete="off" />
            <button type="submit" className="search-btn">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            </button>
          </form>
        </div>
        <div className="topbar-right">
          <div className="account">
            <button className={`avatar${avatar ? " has-img" : ""}`} style={avatar ? { backgroundImage: `url("${avatar}")` } : undefined}
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>{avatar ? "" : "Я"}</button>
            {menuOpen && (
              <div className="account-menu" onClick={(e) => e.stopPropagation()}>
                <div className="account-item" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                  <span>Рекомендации</span>
                </div>
                <div className="account-item" onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}>
                  <svg viewBox="0 0 24 24"><path d="M21 5H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 18l-5-6-3 4-2-3-4 5" /></svg>
                  <span>Сменить аватарку</span>
                </div>
                <div className="account-item" onClick={toggleTheme}>
                  <svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                  <span>Тема: <b>{theme === "light" ? "светлая" : "тёмная"}</b></span>
                </div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFile} />
        </div>
      </header>

      <div className="layout">
        <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
          <nav className="nav-group">
            <NavItem href="/" active={route === "home"} label="Главная" icon={<path d="M3 11l9-8 9 8M5 9v11h14V9" />} />
            <NavItem href="/shorts" active={route === "shorts"} label="Shorts" icon={<><rect x="7" y="3" width="10" height="18" rx="3" /><path d="M11 9l4 3-4 3" /></>} />
            <NavItem href="/subscriptions" active={route === "subscriptions"} label="Подписки" icon={<path d="M4 7h16M6 12h12M9 17h6" />} />
          </nav>
          <div className="nav-divider" />
          <div className="nav-group">
            <div className="nav-title">Вы</div>
            <NavItem href="/history" active={route === "history"} label="История" icon={<><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 8v4l3 2" /></>} />
            <NavItem href="/playlists" active={route === "playlists" || route === "playlist"} label="Плейлисты" icon={<><path d="M3 6h12M3 12h12M3 18h7" /><path d="M16 13l5 3-5 3z" /></>} />
            <NavItem href="/watch-later" active={route === "watch-later"} label="Смотреть позже" icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>} />
            <NavItem href="/liked" active={route === "liked"} label="Понравившиеся" icon={<path d="M7 10v11M2 12h5v9H2zM7 10l4-7c1.5 0 2 1 2 2v3h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7" />} />
          </div>
          <div className="nav-divider" />
          <div className="nav-group">
            <div className="nav-title">{navTitle}</div>
            {subs.length === 0 ? <div className="nav-hint">Появятся по мере просмотра</div> :
              subs.slice(0, 12).map((c) => (
                <Link key={c.id} className="nav-item" href={`/search?q=${encodeURIComponent(c.title)}`}>
                  {c.thumbnail ? <img src={proxify(c.thumbnail)} alt="" /> : <div className="ch-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>{initials(c.title)}</div>}
                  <span>{c.title}</span>
                </Link>
              ))}
          </div>
          <div className="sidebar-footer">Локально · только для тебя</div>
        </aside>

        <main className="content">{children}</main>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} onSubsChange={loadSubs} />}
    </>
  );
}

function NavItem({ href, active, label, icon }: { href: string; active: boolean; label: string; icon: React.ReactNode }) {
  return (
    <Link className={`nav-item${active ? " active" : ""}`} href={href}>
      <svg viewBox="0 0 24 24">{icon}</svg><span>{label}</span>
    </Link>
  );
}

function SettingsModal({ onClose, onSubsChange }: { onClose: () => void; onSubsChange: () => void }) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [interest, setInterest] = useState("");
  const [subsText, setSubsText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const subsFileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/profile"); setData(await r.json()); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = (body: any) => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const addInterest = async (e: React.FormEvent) => {
    e.preventDefault(); const t = interest.trim(); if (!t) return;
    await post({ type: "addInterest", term: t, weight: 4 }); setInterest(""); load();
  };
  const removeInterest = async (term: string) => { await post({ type: "removeInterest", term }); load(); };

  const importSubs = async () => {
    let raw = subsText.trim();
    const f = subsFileRef.current?.files?.[0];
    if (f) { try { raw = (raw + "\n" + (await f.text())).trim(); } catch {} }
    if (!raw) { setImportMsg("Вставь подписки или выбери файл"); return; }
    setBusy(true); setImportMsg("Импортирую…");
    try {
      const r = await fetch("/api/subscriptions/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
      const d = await r.json();
      setImportMsg(`Готово: добавлено ${d.imported}${d.unresolved ? `, не распознано ${d.unresolved}` : ""}.`);
      setSubsText(""); if (subsFileRef.current) subsFileRef.current.value = "";
      onSubsChange(); load();
    } catch (e: any) { setImportMsg("Ошибка: " + e.message); } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!confirm("Сбросить весь профиль рекомендаций? История, лайки и интересы будут удалены.")) return;
    await fetch("/api/profile/reset", { method: "POST" });
    onSubsChange(); onClose();
  };

  return (
    <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <div className="modal-head">
          <h2>Твои рекомендации</h2>
          <button className="icon-btn" onClick={onClose}><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <p className="modal-sub">Лента строится из интересов и каналов, которые ты смотришь. Чем больше смотришь и лайкаешь — тем точнее.</p>

        <div className="settings-section">
          <h3>Интересы</h3>
          <form onSubmit={addInterest} className="interest-add">
            <input value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Добавить тему: например, авиация" />
            <button type="submit">Добавить</button>
          </form>
          <div className="tag-list">
            {data?.interests?.length ? data.interests.map((i) => (
              <span className="tag" key={i.term}>{i.term} <span className="w">{i.weight.toFixed(1)}</span><button onClick={() => removeInterest(i.term)}>×</button></span>
            )) : <span className="card-sub">Интересы появятся по мере просмотра.</span>}
          </div>
        </div>

        <div className="settings-section">
          <h3>Перенести подписки с YouTube</h3>
          <p className="modal-sub" style={{ margin: "0 0 10px" }}>
            Вставь <code>subscriptions.csv</code> из <a href="https://takeout.google.com/" target="_blank" rel="noopener noreferrer">Google Takeout</a>, либо по одному в строке: <code>@handle</code>, ссылку или название.
          </p>
          <textarea id="subsInput" value={subsText} onChange={(e) => setSubsText(e.target.value)} placeholder={"@mrbeast\nhttps://youtube.com/@veritasium\n(или содержимое subscriptions.csv)"} />
          <div className="interest-add" style={{ marginTop: 10 }}>
            <input ref={subsFileRef} type="file" accept=".csv,.txt" style={{ flex: 1 }} />
            <button type="button" id="importSubsBtn" disabled={busy} onClick={importSubs}>Импортировать</button>
          </div>
          <div className="card-sub" style={{ marginTop: 10 }}>{importMsg}</div>
        </div>

        <div className="settings-section">
          <h3>Любимые каналы</h3>
          <div className="tag-list">
            {data?.channels?.length ? data.channels.map((c) => (
              <span className="tag" key={c.id}>{c.title || c.id} <span className="w">{c.weight.toFixed(1)}</span></span>
            )) : <span className="card-sub">Каналы появятся по мере просмотра.</span>}
          </div>
        </div>

        <div className="settings-section stats">
          <span>Подписки: {data?.counts.subscriptions ?? 0}</span><span>История: {data?.counts.history ?? 0}</span>
          <span>Лайки: {data?.counts.likes ?? 0}</span><span>Поисков: {data?.counts.searches ?? 0}</span>
        </div>

        <button className="danger-btn" onClick={reset}>Сбросить весь профиль</button>
      </div>
    </div>
  );
}

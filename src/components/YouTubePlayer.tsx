"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, initials } from "@/lib/format";

// ---- иконки (filled) ----
const I = {
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  volHigh: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  volMute: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
  gear: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  full: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  fullExit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
};
const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24"><path fill="currentColor" d={d} /></svg>;
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(tag);
    setTimeout(() => { if (!w.YT?.Player) reject(new Error("timeout")); }, 6000);
  });
  return apiPromise;
}

export default function YouTubePlayer({ videoId, title, channelTitle }: { videoId: string; title?: string; channelTitle?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<any>(null);
  const dragging = useRef(false);

  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [show, setShow] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rate, setRate] = useState(1);
  const [fs, setFs] = useState(false);
  const [hover, setHover] = useState<{ ratio: number; t: number } | null>(null);

  // создать плеер
  useEffect(() => {
    let cancelled = false;
    loadApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0 },
        events: {
          onReady: (e: any) => { if (cancelled) return; setReady(true); setDur(e.target.getDuration() || 0); setVolume(e.target.getVolume() || 100); setMuted(e.target.isMuted()); },
          onStateChange: (e: any) => {
            const S = (window as any).YT.PlayerState;
            setBuffering(e.data === S.BUFFERING);
            if (e.data === S.PLAYING) { setPlaying(true); setDur(playerRef.current?.getDuration() || 0); }
            else if (e.data === S.PAUSED || e.data === S.ENDED || e.data === S.CUED) setPlaying(false);
          },
        },
      });
    }).catch(() => { if (!cancelled) setFallback(true); });
    return () => { cancelled = true; try { playerRef.current?.destroy?.(); } catch {} playerRef.current = null; };
  }, [videoId]);

  // прогресс
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = playerRef.current; if (!p || dragging.current) return;
      try { setCur(p.getCurrentTime() || 0); const d = p.getDuration() || 0; if (d) setDur(d); setBuf(p.getVideoLoadedFraction?.() || 0); } catch {}
    }, 250);
    return () => clearInterval(id);
  }, [ready]);

  // авто-скрытие
  const poke = useCallback(() => {
    setShow(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      const p = playerRef.current;
      if (p && p.getPlayerState?.() === (window as any).YT?.PlayerState.PLAYING && !menuOpen) setShow(false);
    }, 2500);
  }, [menuOpen]);

  useEffect(() => {
    const onFs = () => setFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = () => { const p = playerRef.current; if (!p) return; if (p.getPlayerState?.() === (window as any).YT.PlayerState.PLAYING) p.pauseVideo(); else p.playVideo(); poke(); };
  const toggleMute = () => { const p = playerRef.current; if (!p) return; if (p.isMuted()) { p.unMute(); setMuted(false); if ((p.getVolume() || 0) === 0) { p.setVolume(50); setVolume(50); } } else { p.mute(); setMuted(true); } };
  const seekRatio = (r: number) => { const p = playerRef.current; if (!p || !dur) return; p.seekTo(r * dur, true); setCur(r * dur); };
  const toggleFs = () => { const el = wrapRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };
  const chooseRate = (r: number) => { playerRef.current?.setPlaybackRate(r); setRate(r); setMenuOpen(false); };

  const ratioFrom = (el: HTMLElement, clientX: number) => { const b = el.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - b.left) / b.width)); };
  const startBarDrag = (e: React.MouseEvent) => {
    dragging.current = true; const r0 = ratioFrom(barRef.current!, e.clientX); setCur(r0 * dur);
    const move = (ev: MouseEvent) => setCur(ratioFrom(barRef.current!, ev.clientX) * dur);
    const up = (ev: MouseEvent) => { dragging.current = false; seekRatio(ratioFrom(barRef.current!, ev.clientX)); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const setVolFrom = (clientX: number) => { const r = ratioFrom(volRef.current!, clientX); const v = Math.round(r * 100); const p = playerRef.current; if (!p) return; p.setVolume(v); setVolume(v); if (v > 0 && p.isMuted()) { p.unMute(); setMuted(false); } if (v === 0) { p.mute(); setMuted(true); } };
  const startVolDrag = (e: React.MouseEvent) => {
    e.stopPropagation(); setVolFrom(e.clientX);
    const move = (ev: MouseEvent) => setVolFrom(ev.clientX);
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  // клавиатура
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName) || ""; if (tag === "INPUT" || tag === "TEXTAREA") return;
      const p = playerRef.current; if (!p) return;
      const k = e.key.toLowerCase();
      const d = p.getDuration?.() || 0, t = p.getCurrentTime?.() || 0;
      if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
      else if (k === "arrowright") { e.preventDefault(); p.seekTo(t + 5, true); }
      else if (k === "arrowleft") { e.preventDefault(); p.seekTo(Math.max(0, t - 5), true); }
      else if (k === "j") p.seekTo(Math.max(0, t - 10), true);
      else if (k === "l") p.seekTo(t + 10, true);
      else if (k === "m") toggleMute();
      else if (k === "f") toggleFs();
      else if (k === "arrowup") { e.preventDefault(); const v = Math.min(100, (p.getVolume() || 0) + 5); p.setVolume(v); setVolume(v); if (p.isMuted()) { p.unMute(); setMuted(false); } }
      else if (k === "arrowdown") { e.preventDefault(); const v = Math.max(0, (p.getVolume() || 0) - 5); p.setVolume(v); setVolume(v); }
      else if (k >= "0" && k <= "9" && d) p.seekTo(d * (+k / 10), true);
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poke]);

  const progress = dur ? Math.min(1, cur / dur) : 0;
  const visible = show || !playing;

  if (fallback) {
    return (
      <div className="cp">
        <iframe src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&color=white`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`cp${visible ? " show" : ""}${fs ? " fs" : ""}`}
      onMouseMove={poke} onMouseLeave={() => { if (playing && !menuOpen) setShow(false); }}>
      <div ref={hostRef} className="cp-host" />

      <div className="cp-click" onClick={togglePlay} onDoubleClick={toggleFs} />

      {/* верхняя плашка: название + канал */}
      <div className="cp-top">
        <div className="ava">{initials(channelTitle)}</div>
        <div className="meta">
          <div className="t">{title}</div>
          <div className="c">{channelTitle}</div>
        </div>
      </div>

      {/* центр: большая play / спиннер */}
      {buffering ? <div className="cp-spinner" /> : !playing ? (
        <div className="cp-center"><div className="cp-bigplay"><Icon d={I.play} /></div></div>
      ) : null}

      {/* низ: контролы */}
      <div className="cp-bottom" onClick={(e) => e.stopPropagation()}>
        <div ref={barRef} className="cp-bar"
          onMouseDown={startBarDrag}
          onMouseMove={(e) => { const r = ratioFrom(e.currentTarget, e.clientX); setHover({ ratio: r, t: r * dur }); }}
          onMouseLeave={() => setHover(null)}>
          <div className="cp-track">
            <div className="cp-buf" style={{ width: `${buf * 100}%` }} />
            {hover && <div className="cp-hover" style={{ width: `${hover.ratio * 100}%` }} />}
            <div className="cp-played" style={{ width: `${progress * 100}%` }} />
            <div className="cp-knob" style={{ left: `${progress * 100}%` }} />
          </div>
          {hover && <div className="cp-tip" style={{ left: `${hover.ratio * 100}%` }}>{formatDuration(hover.t)}</div>}
        </div>

        <div className="cp-row">
          <button className="cp-btn" onClick={togglePlay} title="Пауза/воспроизведение (k)"><Icon d={playing ? I.pause : I.play} /></button>
          <div className="cp-vol">
            <button className="cp-btn" onClick={toggleMute} title="Звук (m)"><Icon d={muted || volume === 0 ? I.volMute : I.volHigh} /></button>
            <div ref={volRef} className="cp-vol-track" onMouseDown={startVolDrag}>
              <div className="cp-vol-fill" style={{ width: `${muted ? 0 : volume}%` }} />
              <div className="cp-vol-knob" style={{ left: `${muted ? 0 : volume}%` }} />
            </div>
          </div>
          <span className="cp-time">{formatDuration(cur)} / {formatDuration(dur)}</span>
          <span className="cp-spacer" />
          <button className="cp-btn" onClick={() => setMenuOpen((o) => !o)} title="Настройки"><Icon d={I.gear} /></button>
          <button className="cp-btn" onClick={toggleFs} title="Во весь экран (f)"><Icon d={fs ? I.fullExit : I.full} /></button>
        </div>
      </div>

      {menuOpen && (
        <div className="cp-menu" onClick={(e) => e.stopPropagation()}>
          <div className="h">Скорость</div>
          {RATES.map((r) => (
            <div key={r} className={`cp-mi${r === rate ? " on" : ""}`} onClick={() => chooseRate(r)}>{r === 1 ? "Обычная" : r}</div>
          ))}
        </div>
      )}
    </div>
  );
}

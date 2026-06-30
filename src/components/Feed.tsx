"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VideoCard } from "./VideoCard";
import type { Video } from "@/lib/format";

export default function Feed() {
  const [items, setItems] = useState<Video[]>([]);
  const [done, setDone] = useState(false);
  const sessionRef = useRef("");
  const loadingRef = useRef(false);
  const emptyRef = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    try {
      const s = sessionRef.current;
      const r = await fetch(`/api/feed?limit=12${s ? `&session=${encodeURIComponent(s)}` : ""}`);
      const d = await r.json();
      if (d.session) sessionRef.current = d.session;
      if (!d.items?.length) { emptyRef.current++; if (emptyRef.current >= 2) setDone(true); }
      else { emptyRef.current = 0; setItems((prev) => [...prev, ...d.items]); }
    } catch { /* ignore */ } finally { loadingRef.current = false; }
  }, [done]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const obs = new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: "1200px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [load]);

  return (
    <>
      <div className="grid">{items.map((v) => <VideoCard key={v.id} v={v} />)}</div>
      {done ? <div className="feed-end">Пока всё. Посмотри/лайкни что-нибудь — и появится ещё.</div>
        : <div className="feed-loader"><span className="spinner" /> Подбираем под тебя…</div>}
      <div className="feed-sentinel" ref={sentinel} />
    </>
  );
}

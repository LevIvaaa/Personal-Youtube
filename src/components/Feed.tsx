"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VideoCard } from "./VideoCard";
import type { Video } from "@/lib/format";

export default function Feed() {
  const [items, setItems] = useState<Video[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const sessionRef = useRef("");
  const loadingRef = useRef(false);
  const doneRef = useRef(false);
  const emptyRef = useRef(0);
  const errRef = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    loadingRef.current = true;
    setStatus("loading");
    try {
      const s = sessionRef.current;
      const r = await fetch(`/api/feed?limit=12${s ? `&session=${encodeURIComponent(s)}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message || "err");
      if (d.session) sessionRef.current = d.session;
      if (!d.items?.length) {
        emptyRef.current++;
        if (emptyRef.current >= 2) { doneRef.current = true; setStatus("done"); }
        else setStatus("idle");
      } else {
        emptyRef.current = 0; errRef.current = 0;
        setItems((prev) => [...prev, ...d.items]);
        setStatus("idle");
      }
    } catch {
      errRef.current++;
      if (errRef.current >= 2) { doneRef.current = true; setStatus("error"); }
      else setStatus("idle");
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const obs = new IntersectionObserver((es) => { if (es[0].isIntersecting) load(); }, { rootMargin: "800px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [load]);

  // дозагрузка, пока низ ленты в зоне видимости (observer не повторяет событие сам)
  useEffect(() => {
    if (status !== "idle" || doneRef.current) return;
    const el = sentinel.current; if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 600) load();
  }, [items, status, load]);

  return (
    <>
      <div className="grid">{items.map((v, i) => <VideoCard key={`${v.id}-${i}`} v={v} />)}</div>
      {status === "loading" && <div className="feed-loader"><span className="spinner" /> Подбираем под тебя…</div>}
      {status === "done" && <div className="feed-end">{items.length ? "Это всё на сейчас. Загляни позже — появится новое." : "Пока пусто. Посмотри/лайкни что-нибудь — лента подстроится."}</div>}
      {status === "error" && <div className="feed-end">Не удалось загрузить ещё. Возможно, на сегодня исчерпана квота YouTube API — она сбросится по тихоокеанскому времени.</div>}
      <div className="feed-sentinel" ref={sentinel} />
    </>
  );
}

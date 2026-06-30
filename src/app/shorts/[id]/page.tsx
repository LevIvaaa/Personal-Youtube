"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { initials, formatViews, type Video } from "@/lib/format";

export default function ShortsPage() {
  const startId = String(useParams().id || "");
  const [list, setList] = useState<Video[]>([]);
  const [idx, setIdx] = useState(0);
  const wheelLock = useRef(false);
  const recorded = useRef<Set<string>>(new Set());

  useEffect(() => {
    let on = true;
    fetch("/api/shorts").then((r) => r.json()).then((d) => {
      if (!on) return;
      let items: Video[] = d.items || [];
      const i = items.findIndex((v) => v.id === startId);
      if (i === -1) { items = [{ id: startId, title: "", thumbnail: "" } as Video, ...items]; setIdx(0); }
      else setIdx(i);
      setList(items);
    }).catch(() => setList([{ id: startId, title: "", thumbnail: "" } as Video]));
    return () => { on = false; };
  }, [startId]);

  const cur = list[idx];

  useEffect(() => {
    if (!cur?.id || recorded.current.has(cur.id)) return;
    recorded.current.add(cur.id);
    fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "watch", video: cur, watchSeconds: 0 }) });
  }, [cur?.id]);

  const go = useCallback((d: number) => setIdx((i) => Math.max(0, Math.min(list.length - 1, i + d))), [list.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const onWheel = (e: React.WheelEvent) => {
    if (wheelLock.current || Math.abs(e.deltaY) < 18) return;
    wheelLock.current = true;
    go(e.deltaY > 0 ? 1 : -1);
    setTimeout(() => { wheelLock.current = false; }, 550);
  };

  if (!cur) return <div className="empty">Загрузка…</div>;

  return (
    <div className="shorts-viewer" onWheel={onWheel}>
      <div className="short-stage">
        <div className="short-frame">
          <iframe key={cur.id} src={`https://www.youtube-nocookie.com/embed/${cur.id}?autoplay=1&rel=0&loop=1&playlist=${cur.id}`}
            allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
        <div className="short-side">
          <button className="short-nav" onClick={() => go(-1)} disabled={idx === 0} title="Предыдущий (↑)">▲</button>
          <span className="short-count">{idx + 1}/{list.length}</span>
          <button className="short-nav" onClick={() => go(1)} disabled={idx >= list.length - 1} title="Следующий (↓)">▼</button>
        </div>
      </div>
      {cur.title ? (
        <div className="short-meta">
          <div className="ava">{initials(cur.channelTitle)}</div>
          <div><div className="t">{cur.title}</div><div className="c">{[cur.channelTitle, formatViews(cur.views)].filter(Boolean).join(" · ")}</div></div>
        </div>
      ) : null}
      <div className="short-hint">Листай колёсиком мыши или стрелками ↑ ↓</div>
    </div>
  );
}

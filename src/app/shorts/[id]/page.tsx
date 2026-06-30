"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { proxify, initials, formatViews, timeAgo, type Video } from "@/lib/format";

type Comment = { id: string; author: string; avatar: string; text: string; likes: number; publishedAt: string };

export default function ShortsViewer() {
  const startId = String(useParams().id || "");
  const [list, setList] = useState<Video[]>([]);
  const [idx, setIdx] = useState(0);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
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
  const post = (body: any) => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    if (!cur?.id) return;
    setComments(null); setShowComments(false);
    if (!recorded.current.has(cur.id)) { recorded.current.add(cur.id); post({ type: "watch", video: cur, watchSeconds: 0 }); }
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
    wheelLock.current = true; go(e.deltaY > 0 ? 1 : -1);
    setTimeout(() => { wheelLock.current = false; }, 550);
  };

  const toggleLike = () => { if (!cur) return; const n = !liked[cur.id]; setLiked((m) => ({ ...m, [cur.id]: n })); post({ type: n ? "like" : "unlike", video: cur, videoId: cur.id }); };
  const openComments = () => {
    setShowComments((s) => !s);
    if (comments === null && cur?.id) fetch(`/api/comments?videoId=${cur.id}`).then((r) => r.json()).then((d) => setComments(d.items || [])).catch(() => setComments([]));
  };

  if (!cur) return <div className="empty">Загрузка…</div>;

  return (
    <div className="shorts-viewer" onWheel={onWheel}>
      <div className="short-stage">
        <div className="short-col">
          <div className="short-frame">
            <iframe key={cur.id} src={`https://www.youtube-nocookie.com/embed/${cur.id}?autoplay=1&rel=0&loop=1&playlist=${cur.id}`}
              allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
          {cur.title ? (
            <div className="short-meta">
              {cur.channelThumb ? <img className="ava" src={proxify(cur.channelThumb)} alt="" /> : <div className="ava">{initials(cur.channelTitle)}</div>}
              <div className="short-meta-text">
                <div className="t">{cur.title}</div>
                <div className="c">{[cur.channelTitle, formatViews(cur.views)].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="short-rail">
          <button className={`short-act${cur && liked[cur.id] ? " on" : ""}`} onClick={toggleLike}><span>👍</span></button>
          <button className="short-act" onClick={() => post({ type: "dislike", video: cur })}><span>👎</span></button>
          <button className={`short-act${showComments ? " on" : ""}`} onClick={openComments}><span>💬</span></button>
          <div className="short-navs">
            <button className="short-act" onClick={() => go(-1)} disabled={idx === 0}><span>▲</span></button>
            <div className="short-count">{idx + 1}/{list.length}</div>
            <button className="short-act" onClick={() => go(1)} disabled={idx >= list.length - 1}><span>▼</span></button>
          </div>
        </div>

        {showComments && (
          <div className="short-comments">
            <h3>Комментарии</h3>
            {comments === null ? <div className="card-sub">Загрузка…</div>
              : comments.length === 0 ? <div className="card-sub">Комментариев нет или они отключены.</div>
                : comments.map((c) => (
                  <div className="comment" key={c.id}>
                    {c.avatar ? <img className="comment-ava" src={proxify(c.avatar)} alt="" /> : <div className="comment-ava">{initials(c.author)}</div>}
                    <div className="comment-body">
                      <div className="comment-head">{c.author} <span className="comment-time">{timeAgo(c.publishedAt)}</span></div>
                      <div className="comment-text">{c.text}</div>
                      {c.likes > 0 && <div className="comment-likes">👍 {c.likes}</div>}
                    </div>
                  </div>
                ))}
          </div>
        )}
      </div>
    </div>
  );
}

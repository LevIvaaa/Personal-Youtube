"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatViews, timeAgo, fullDate, formatDuration, proxify, initials, type Video } from "@/lib/format";

type Comment = { id: string; author: string; avatar: string; text: string; likes: number; publishedAt: string };
type Channel = { id: string; title?: string; thumbnail?: string; subscribers?: string };

async function translate(text: string): Promise<string> {
  const r = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, to: "ru" }) });
  const d = await r.json();
  return d.text || "";
}

function CommentItem({ c }: { c: Comment }) {
  const [tr, setTr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onTranslate = async () => {
    if (tr) { setTr(null); return; }
    setBusy(true);
    try { setTr(await translate(c.text)); } catch { setTr("(не удалось перевести)"); } finally { setBusy(false); }
  };
  return (
    <div className="comment">
      {c.avatar ? <img className="comment-ava" src={proxify(c.avatar)} alt="" /> : <div className="comment-ava">{initials(c.author)}</div>}
      <div className="comment-body">
        <div className="comment-head">{c.author} <span className="comment-time" title={fullDate(c.publishedAt)}>{timeAgo(c.publishedAt)}</span></div>
        <div className="comment-text">{tr ?? c.text}</div>
        <div className="comment-actions">
          {c.likes > 0 && <span className="comment-likes">👍 {c.likes}</span>}
          <button className="link-btn" onClick={onTranslate} disabled={busy}>{busy ? "Перевожу…" : tr ? "Оригинал" : "Перевод"}</button>
        </div>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const id = String(useParams().id || "");
  const [video, setVideo] = useState<Video | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const recorded = useRef("");

  const post = (body: any) => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    let on = true;
    setVideo(null); setRelated([]); setLiked(false); setComments([]); setChannel(null); setDescOpen(false);
    fetch(`/api/video/${id}`).then((r) => r.json()).then((d) => {
      if (!on) return;
      setVideo(d.video); setChannel(d.channel); setRelated(d.related || []);
      if (d.video && recorded.current !== id) { recorded.current = id; post({ type: "watch", video: d.video, watchSeconds: 0 }); }
    }).catch(() => {});
    fetch(`/api/comments?videoId=${id}`).then((r) => r.json()).then((d) => { if (on) setComments(d.items || []); }).catch(() => {});
    return () => { on = false; };
  }, [id]);

  const toggleLike = () => { const n = !liked; setLiked(n); post({ type: n ? "like" : "unlike", video, videoId: id }); };
  const desc = video?.description || "";

  return (
    <div className="watch">
      <div>
        <div className="player-wrap">
          <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        </div>
        <h1 className="watch-title">{video?.title || ""}</h1>
        <div className="watch-bar">
          <div className="watch-channel">
            {channel?.thumbnail
              ? <img className="ch-avatar" style={{ width: 40, height: 40 }} src={proxify(channel.thumbnail)} alt="" />
              : <div className="ch-avatar" style={{ width: 40, height: 40 }}>{initials(video?.channelTitle)}</div>}
            <div>
              <div className="name">{video?.channelTitle || ""}</div>
              <div className="subs">{channel?.subscribers ? formatViews(Number(channel.subscribers)).replace("просмотров", "подписчиков") : ""}</div>
            </div>
          </div>
          <button className={`pill-btn${liked ? " active" : ""}`} onClick={toggleLike}>👍</button>
          <button className="pill-btn" onClick={() => post({ type: "dislike", video })}>👎</button>
        </div>

        <div className={`watch-desc${descOpen ? " open" : ""}`} onClick={() => setDescOpen((o) => !o)}>
          <div className="watch-desc-meta">
            {formatViews(video?.views)}
            {video?.publishedAt ? <> · <span title={fullDate(video.publishedAt)}>{timeAgo(video.publishedAt)}</span></> : null}
          </div>
          {desc ? <div className="watch-desc-text">{desc}</div> : null}
          {desc && desc.length > 200 ? <div className="watch-desc-toggle">{descOpen ? "Свернуть" : "…ещё"}</div> : null}
        </div>

        <div className="comments">
          <h3>Комментарии</h3>
          {comments.length === 0
            ? <div className="card-sub">Комментарии недоступны или их пока нет.</div>
            : comments.map((c) => <CommentItem key={c.id} c={c} />)}
        </div>
      </div>

      <div className="related">
        <h3>Похожие видео</h3>
        {related.map((r) => (
          <Link className="related-card" key={r.id} href={`/watch/${r.id}`}>
            <div className="related-thumb">
              {r.thumbnail ? <img loading="lazy" src={proxify(r.thumbnail)} alt="" /> : null}
              {r.duration != null ? <span className="duration">{formatDuration(r.duration)}</span> : null}
            </div>
            <div className="related-meta">
              <div className="t">{r.title}</div>
              <div className="c">{r.channelTitle}</div>
              <div className="c">{[formatViews(r.views), timeAgo(r.publishedAt)].filter(Boolean).join(" · ")}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatViews, timeAgo, formatDuration, proxify, initials, type Video } from "@/lib/format";

type Comment = { id: string; author: string; avatar: string; text: string; likes: number; publishedAt: string };
type Channel = { id: string; title?: string; thumbnail?: string; subscribers?: string };

export default function WatchPage() {
  const id = String(useParams().id || "");
  const [video, setVideo] = useState<Video | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const recorded = useRef("");

  const post = (body: any) => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  useEffect(() => {
    let on = true;
    setVideo(null); setRelated([]); setLiked(false); setComments([]); setChannel(null);
    fetch(`/api/video/${id}`).then((r) => r.json()).then((d) => {
      if (!on) return;
      setVideo(d.video); setChannel(d.channel); setRelated(d.related || []);
      if (d.video && recorded.current !== id) { recorded.current = id; post({ type: "watch", video: d.video, watchSeconds: 0 }); }
    }).catch(() => {});
    fetch(`/api/comments?videoId=${id}`).then((r) => r.json()).then((d) => { if (on) setComments(d.items || []); }).catch(() => {});
    return () => { on = false; };
  }, [id]);

  const toggleLike = () => { const n = !liked; setLiked(n); post({ type: n ? "like" : "unlike", video, videoId: id }); };

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
          <button className={`pill-btn${liked ? " active" : ""}`} onClick={toggleLike} title="Нравится">👍</button>
          <button className="pill-btn" onClick={() => post({ type: "dislike", video })} title="Не нравится">👎</button>
        </div>

        <div className="watch-desc">{[formatViews(video?.views), video?.publishedAt ? timeAgo(video.publishedAt) : ""].filter(Boolean).join(" · ")}</div>

        <div className="comments">
          <h3>Комментарии</h3>
          {comments.length === 0
            ? <div className="card-sub">Комментарии недоступны или их пока нет.</div>
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

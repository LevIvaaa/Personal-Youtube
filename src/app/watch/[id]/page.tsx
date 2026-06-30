"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import YouTubePlayer from "@/components/YouTubePlayer";
import { formatViews, timeAgo, formatDuration, proxify, initials, type Video } from "@/lib/format";

export default function WatchPage() {
  const id = String(useParams().id || "");
  const [video, setVideo] = useState<Video | null>(null);
  const [related, setRelated] = useState<Video[]>([]);
  const [liked, setLiked] = useState(false);
  const recorded = useRef("");

  useEffect(() => {
    let on = true;
    setVideo(null); setRelated([]); setLiked(false);
    fetch(`/api/video/${id}`).then((r) => r.json()).then((d) => {
      if (!on) return;
      setVideo(d.video);
      setRelated(d.related || []);
      if (d.video && recorded.current !== id) {
        recorded.current = id;
        fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "watch", video: d.video, watchSeconds: 0 }) });
      }
    }).catch(() => {});
    return () => { on = false; };
  }, [id]);

  const post = (body: any) => fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const toggleLike = () => { const next = !liked; setLiked(next); post({ type: next ? "like" : "unlike", video, videoId: id }); };

  return (
    <div className="watch">
      <div>
        <YouTubePlayer key={id} videoId={id} title={video?.title} channelTitle={video?.channelTitle} />
        <h1 className="watch-title">{video?.title || ""}</h1>
        <div className="watch-bar">
          <div className="watch-channel">
            <div className="ch-avatar" style={{ width: 40, height: 40 }}>{initials(video?.channelTitle)}</div>
            <div>
              <div className="name">{video?.channelTitle || ""}</div>
              <div className="subs">{formatViews(video?.views)}{video?.publishedAt ? " · " + timeAgo(video.publishedAt) : ""}</div>
            </div>
          </div>
          <button className={`pill-btn${liked ? " active" : ""}`} onClick={toggleLike}>👍 <span>Нравится</span></button>
          <button className="pill-btn" onClick={() => post({ type: "dislike", video })}>👎</button>
          <a className="pill-btn" href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">↗ YouTube</a>
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

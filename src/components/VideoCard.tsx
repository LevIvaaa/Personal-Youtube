"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatViews, timeAgo, formatDuration, proxify, initials, type Video } from "@/lib/format";

export function VideoCard({ v }: { v: Video }) {
  const reason = v.reasons && v.reasons.length ? (
    <div className="card-reason">Рекомендуем: {v.reasons[0]}</div>
  ) : null;
  const notInterested = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "notInterested", videoId: v.id, channelId: v.channelId }) });
    (e.currentTarget.closest(".card") as HTMLElement)?.style.setProperty("display", "none");
  };
  return (
    <Link className="card" href={`/watch/${v.id}`}>
      <div className="thumb-wrap">
        {v.thumbnail ? <img loading="lazy" src={proxify(v.thumbnail)} alt="" /> : null}
        {v.duration != null ? <span className="duration">{formatDuration(v.duration)}</span> : null}
      </div>
      <div className="card-body">
        <div className="ch-avatar">{initials(v.channelTitle)}</div>
        <div className="card-meta">
          <h3 className="card-title">{v.title}</h3>
          <div className="card-channel">{v.channelTitle}</div>
          <div className="card-sub">{[formatViews(v.views), timeAgo(v.publishedAt)].filter(Boolean).join(" · ")}</div>
          {reason}
        </div>
        <div className="card-menu">
          <button title="Не интересно" onClick={notInterested}>⋮</button>
        </div>
      </div>
    </Link>
  );
}

export function ShortCard({ v }: { v: Video }) {
  return (
    <Link className="short-card" href={`/shorts/${v.id}`}>
      <div className="short-thumb">{v.thumbnail ? <img loading="lazy" src={proxify(v.thumbnail)} alt="" /> : null}</div>
      <div className="short-title">{v.title}</div>
      <div className="short-ch">{v.channelTitle}</div>
    </Link>
  );
}

export function Grid({ items, empty }: { items: Video[]; empty?: string }) {
  if (!items?.length) return <div className="empty">{empty || "Пока пусто."}</div>;
  return <div className="grid">{items.map((v) => <VideoCard key={v.id} v={v} />)}</div>;
}

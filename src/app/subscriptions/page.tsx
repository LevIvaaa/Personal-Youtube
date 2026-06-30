"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { proxify, initials, formatViews } from "@/lib/format";

type Channel = { id: string; title: string; thumbnail?: string; subscribers?: string };

export default function SubscriptionsPage() {
  const [channels, setChannels] = useState<Channel[] | null>(null);
  useEffect(() => {
    fetch("/api/subscriptions").then((r) => r.json()).then((d) => setChannels(d.channels || [])).catch(() => setChannels([]));
  }, []);

  return (
    <>
      <div className="section-title">Подписки</div>
      {channels === null ? <div className="empty">Загрузка…</div> :
        channels.length === 0 ? <div className="empty">Каналы появятся, когда ты начнёшь смотреть видео или импортируешь подписки (⚙️ → Рекомендации).</div> :
          <div className="grid">
            {channels.map((c) => (
              <Link className="card" key={c.id} href={`/search?q=${encodeURIComponent(c.title)}`}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {c.thumbnail ? <img className="ch-avatar" style={{ width: 56, height: 56 }} src={proxify(c.thumbnail)} alt="" />
                    : <div className="ch-avatar" style={{ width: 56, height: 56 }}>{initials(c.title)}</div>}
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.title}</div>
                    <div className="card-sub">{c.subscribers ? formatViews(Number(c.subscribers)).replace("просмотров", "подписчиков") : ""}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>}
    </>
  );
}

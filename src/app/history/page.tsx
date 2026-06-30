"use client";
import { useEffect, useState } from "react";
import { Grid, ShortCard } from "@/components/VideoCard";
import { Skeleton } from "@/components/ApiList";
import type { Video } from "@/lib/format";

export default function HistoryPage() {
  const [items, setItems] = useState<Video[] | null>(null);
  const [tab, setTab] = useState<"all" | "video" | "shorts">("all");

  useEffect(() => {
    fetch("/api/history").then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);

  const shorts = (items || []).filter((v) => v.isShort);
  const videos = (items || []).filter((v) => !v.isShort);

  return (
    <>
      <div className="section-title">История просмотров</div>
      <div className="tabs">
        {(["all", "video", "shorts"] as const).map((t) => (
          <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "all" ? "Все" : t === "video" ? "Видео" : "Shorts"}
          </button>
        ))}
      </div>
      {items === null ? <Skeleton n={8} /> : tab === "video" ? <Grid items={videos} empty="Видео в истории нет." />
        : tab === "shorts" ? (shorts.length ? <div className="shorts-grid">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div> : <div className="empty">Shorts в истории нет.</div>)
          : (
            <>
              {shorts.length > 0 && (
                <div className="shorts-shelf">
                  <h3 className="shelf-title">⚡ Shorts</h3>
                  <div className="shorts-row">{shorts.map((v) => <ShortCard key={v.id} v={v} />)}</div>
                </div>
              )}
              <Grid items={videos} empty="История пуста." />
            </>
          )}
    </>
  );
}

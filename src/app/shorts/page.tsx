"use client";
import { useEffect, useState } from "react";
import { ShortCard } from "@/components/VideoCard";
import { Skeleton } from "@/components/ApiList";
import type { Video } from "@/lib/format";

export default function ShortsGridPage() {
  const [items, setItems] = useState<Video[] | null>(null);
  useEffect(() => {
    fetch("/api/shorts").then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);
  return (
    <>
      <div className="section-title">Shorts</div>
      {items === null ? <Skeleton n={8} />
        : items.length ? <div className="shorts-grid">{items.map((v) => <ShortCard key={v.id} v={v} />)}</div>
          : <div className="empty">Shorts не найдены.</div>}
    </>
  );
}

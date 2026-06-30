"use client";
import { useEffect, useState } from "react";
import { ShortCard } from "./VideoCard";
import type { Video } from "@/lib/format";

export default function ShortsRow() {
  const [items, setItems] = useState<Video[] | null>(null);
  useEffect(() => {
    fetch("/api/shorts").then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);
  if (!items || !items.length) return null;
  return (
    <div className="shorts-shelf">
      <h3 className="shelf-title">⚡ Shorts</h3>
      <div className="shorts-row">{items.map((v) => <ShortCard key={v.id} v={v} />)}</div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Grid } from "@/components/VideoCard";
import { Skeleton } from "@/components/ApiList";
import type { Video } from "@/lib/format";

export default function PlaylistPage() {
  const name = decodeURIComponent(String(useParams().name || ""));
  const [items, setItems] = useState<Video[] | null>(null);
  useEffect(() => {
    setItems(null);
    fetch(`/api/playlist?name=${encodeURIComponent(name)}`).then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, [name]);
  return (
    <>
      <div className="section-title">{name}</div>
      {items === null ? <Skeleton n={8} /> : <Grid items={items} empty="Плейлист пуст." />}
    </>
  );
}

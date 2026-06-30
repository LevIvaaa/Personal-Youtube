"use client";
import { useEffect, useState } from "react";
import { Grid } from "./VideoCard";
import type { Video } from "@/lib/format";

export function Skeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: n }).map((_, i) => (
        <div className="card" key={i}>
          <div className="thumb-wrap skeleton sk-thumb" />
          <div className="card-body"><div className="ch-avatar skeleton" />
            <div className="card-meta" style={{ flex: 1 }}>
              <div className="sk-line skeleton" style={{ width: "90%" }} />
              <div className="sk-line skeleton" style={{ width: "55%" }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ApiList({ url, empty }: { url: string; empty?: string }) {
  const [items, setItems] = useState<Video[] | null>(null);
  useEffect(() => {
    let on = true; setItems(null);
    fetch(url).then((r) => r.json()).then((d) => { if (on) setItems(d.items || []); }).catch(() => on && setItems([]));
    return () => { on = false; };
  }, [url]);
  if (items === null) return <Skeleton n={8} />;
  return <Grid items={items} empty={empty} />;
}

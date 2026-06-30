"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { proxify } from "@/lib/format";

type PL = { name: string; title: string; count: number; thumbVideoId: string | null };

export default function PlaylistsPage() {
  const [pls, setPls] = useState<PL[] | null>(null);
  useEffect(() => { fetch("/api/playlists").then((r) => r.json()).then((d) => setPls(d.playlists || [])).catch(() => setPls([])); }, []);

  return (
    <>
      <div className="section-title">Плейлисты</div>
      {pls === null ? <div className="empty">Загрузка…</div> :
        pls.length === 0 ? <div className="empty">Плейлистов пока нет.</div> :
          <div className="grid">
            {pls.map((p) => {
              const href = p.name === "Watch later" ? "/watch-later" : `/playlist/${encodeURIComponent(p.name)}`;
              return (
                <Link className="card" key={p.name} href={href}>
                  <div className="thumb-wrap">
                    {p.thumbVideoId ? <img loading="lazy" src={proxify(`https://i.ytimg.com/vi/${p.thumbVideoId}/mqdefault.jpg`)} alt="" /> : null}
                    <span className="duration">{p.count} видео</span>
                  </div>
                  <div className="card-body">
                    <div className="card-meta"><h3 className="card-title">{p.title}</h3><div className="card-sub">{p.count} видео</div></div>
                  </div>
                </Link>
              );
            })}
          </div>}
    </>
  );
}

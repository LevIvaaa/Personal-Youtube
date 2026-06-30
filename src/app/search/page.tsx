"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ApiList from "@/components/ApiList";

function SearchInner() {
  const q = useSearchParams().get("q") || "";
  return (
    <>
      <div className="section-title">Результаты: «{q}»</div>
      <ApiList key={q} url={`/api/search?q=${encodeURIComponent(q)}`} empty="Ничего не найдено." />
    </>
  );
}

export default function SearchPage() {
  return <Suspense fallback={<div className="section-title">Поиск…</div>}><SearchInner /></Suspense>;
}

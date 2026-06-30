"use client";
import ApiList from "@/components/ApiList";

export default function WatchLaterPage() {
  return (
    <>
      <div className="section-title">Смотреть позже</div>
      <ApiList url="/api/watch-later" empty="В «Смотреть позже» пока пусто." />
    </>
  );
}

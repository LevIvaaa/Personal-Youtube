"use client";
import ApiList from "@/components/ApiList";

export default function LikedPage() {
  return (
    <>
      <div className="section-title">Понравившиеся</div>
      <ApiList url="/api/liked" empty="Пока нет понравившихся видео." />
    </>
  );
}

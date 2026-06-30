"use client";
import ApiList from "@/components/ApiList";

export default function TrendingPage() {
  return (
    <>
      <div className="section-title">В тренде</div>
      <ApiList url="/api/trending" />
    </>
  );
}

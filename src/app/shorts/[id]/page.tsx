"use client";
import { useParams } from "next/navigation";
import ShortsViewer from "@/components/ShortsViewer";

export default function ShortsByIdPage() {
  const id = String(useParams().id || "");
  return <ShortsViewer startId={id} />;
}

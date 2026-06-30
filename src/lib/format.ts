export function formatViews(n: number | null | undefined): string {
  if (n == null) return "";
  n = Number(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " млн просмотров";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + " тыс. просмотров";
  return n + " просмотров";
}
export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [string, number][] = [["год", 31536000], ["мес.", 2592000], ["нед.", 604800], ["дн.", 86400], ["ч.", 3600], ["мин.", 60]];
  for (const [label, sec] of units) { const v = Math.floor(s / sec); if (v >= 1) return `${v} ${label} назад`; }
  return "только что";
}
export function formatDuration(sec?: number | null): string {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const pad = (x: number) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function proxify(url?: string | null): string {
  return url ? `/api/img?u=${encodeURIComponent(url)}` : "";
}
export function initials(name = "?"): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export type Video = {
  id: string; title: string; channelId?: string; channelTitle?: string;
  publishedAt?: string; thumbnail?: string; duration?: number | null; views?: number | null;
  reasons?: string[]; isShort?: boolean; watchedAt?: string;
};

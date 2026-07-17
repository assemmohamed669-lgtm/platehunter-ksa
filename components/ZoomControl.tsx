"use client";

import { ZoomIn, ZoomOut } from "lucide-react";
import { ZOOM_LEVELS, zoomFontPx } from "@/lib/zoom";

// نعيد التصدير عشان الاستيرادات القديمة من "@/components/ZoomControl" تفضل شغّالة.
export { ZOOM_LEVELS, zoomFontPx };

/** زرّا تكبير/تصغير + نسبة مئوية — مشترك لكل نوافذ اللوحات. */
export default function ZoomControl({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: (updater: (z: number) => number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setZoom((z) => Math.max(0, z - 1))}
        disabled={zoom === 0}
        title="تصغير"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition hover:text-ink disabled:opacity-30"
      >
        <ZoomOut size={14} />
      </button>
      <span className="w-9 text-center text-xs text-muted">{Math.round((ZOOM_LEVELS[zoom] ?? 1) * 100)}%</span>
      <button
        type="button"
        onClick={() => setZoom((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
        disabled={zoom === ZOOM_LEVELS.length - 1}
        title="تكبير"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition hover:text-ink disabled:opacity-30"
      >
        <ZoomIn size={14} />
      </button>
    </div>
  );
}

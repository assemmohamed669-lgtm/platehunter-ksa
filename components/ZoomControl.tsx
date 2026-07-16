"use client";

import { ZoomIn, ZoomOut } from "lucide-react";

// نفس مستويات الزوم المستخدمة في صفحة الفرز وجدول السجلات — مؤشّر index في المصفوفة.
export const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];

/** حجم الخط بالبكسل حسب مستوى الزوم (الأساس 12px). */
export function zoomFontPx(zoom: number): number {
  return (ZOOM_LEVELS[zoom] ?? 1) * 12;
}

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

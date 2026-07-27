"use client";

/**
 * نافذة «موقعها» — بتوري السيارة المطلوبة معلَّمة بلون + ٥ سيارات قبلها و٥ بعدها
 * في نفس الموقع (الشارع/الحي) من ملف الداتا، عشان المندوب يحدد مكانها بالظبط
 * من خلال جيرانها. لو أول/آخر الموقع بتظهر علامة واضحة.
 */

import { useEffect } from "react";
import { X, MapPin, ArrowUp, ArrowDown } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { pushBackHandler } from "@/lib/backStack";

export interface NeighborsView {
  locationName: string;
  before: Record<string, string>[];
  target: Record<string, string>;
  after: Record<string, string>[];
  isFirstInLocation: boolean;
  isLastInLocation: boolean;
  plateCol: string;
  /** أعمدة مختصرة تُعرض تحت كل لوحة للتعريف البصري (نوع/لون…). */
  detailCols: string[];
}

function detailsText(row: Record<string, string>, cols: string[]): string {
  return cols.map((c) => String(row[c] ?? "").trim()).filter(Boolean).join(" • ");
}

function NeighborRow({
  row, plateCol, detailCols, highlight,
}: { row: Record<string, string>; plateCol: string; detailCols: string[]; highlight?: boolean }) {
  const details = detailsText(row, detailCols);
  return (
    <div
      className={
        highlight
          ? "flex items-center gap-3 rounded-xl border-2 border-brand bg-brand/15 px-3 py-2"
          : "flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2"
      }
    >
      <PlateBadge value={String(row[plateCol] ?? "")} size="sm" />
      {details && <span className="text-xs text-muted truncate">{details}</span>}
      {highlight && (
        <span className="mr-auto flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-night">
          <MapPin size={11} /> السيارة المطلوبة
        </span>
      )}
    </div>
  );
}

export default function LocationNeighborsModal({ view, onClose }: { view: NeighborsView | null; onClose: () => void }) {
  useEffect(() => { if (view) return pushBackHandler(onClose); }, [view, onClose]);
  if (!view) return null;

  const { locationName, before, target, after, isFirstInLocation, isLastInLocation, plateCol, detailCols } = view;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border-t border-border bg-surface sm:rounded-2xl"
        style={{ direction: "rtl" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink"><MapPin size={15} className="text-brand" /> موقعها في الشارع</h3>
            {locationName && <p className="truncate text-xs text-muted">{locationName}</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink"><X size={18} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
          {/* علامة أول الموقع */}
          {isFirstInLocation ? (
            <p className="flex items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 text-[11px] font-bold text-muted">
              <ArrowUp size={12} /> دي أول سيارة في الموقع — مفيش قبلها
            </p>
          ) : before.length < 5 ? (
            <p className="text-center text-[11px] text-muted">قبلها {before.length} {before.length === 1 ? "سيارة" : "سيارات"} بس في نفس الموقع</p>
          ) : null}

          {before.map((row, i) => (
            <NeighborRow key={`b-${i}`} row={row} plateCol={plateCol} detailCols={detailCols} />
          ))}

          <NeighborRow row={target} plateCol={plateCol} detailCols={detailCols} highlight />

          {after.map((row, i) => (
            <NeighborRow key={`a-${i}`} row={row} plateCol={plateCol} detailCols={detailCols} />
          ))}

          {/* علامة آخر الموقع */}
          {isLastInLocation ? (
            <p className="flex items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 text-[11px] font-bold text-muted">
              <ArrowDown size={12} /> دي آخر سيارة في الموقع — مفيش بعدها
            </p>
          ) : after.length < 5 ? (
            <p className="text-center text-[11px] text-muted">بعدها {after.length} {after.length === 1 ? "سيارة" : "سيارات"} بس في نفس الموقع</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

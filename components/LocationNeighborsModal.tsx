"use client";

/**
 * نافذة «موقعها» — بتوري السيارة المطلوبة معلَّمة بلون + ٥ سيارات قبلها و٥ بعدها
 * في نفس الموقع (الشارع/الحي) من ملف الداتا، عشان المندوب يحدد مكانها بالظبط
 * من خلال جيرانها. بتظهر كجدول مضغوط بنفس شكل نافذة نتيجة الفرز.
 */

import { useEffect } from "react";
import { X, MapPin, ArrowUp, ArrowDown } from "lucide-react";
import { pushBackHandler } from "@/lib/backStack";

export interface NeighborsView {
  locationName: string;
  before: Record<string, string>[];
  target: Record<string, string>;
  after: Record<string, string>[];
  isFirstInLocation: boolean;
  isLastInLocation: boolean;
  plateCol: string;
  /** أعمدة مختصرة تُعرض جنب اللوحة للتعريف البصري (نوع/لون…). */
  detailCols: string[];
}

export default function LocationNeighborsModal({ view, onClose }: { view: NeighborsView | null; onClose: () => void }) {
  useEffect(() => { if (view) return pushBackHandler(onClose); }, [view, onClose]);
  if (!view) return null;

  const { locationName, before, target, after, isFirstInLocation, isLastInLocation, plateCol, detailCols } = view;
  const list: { row: Record<string, string>; isTarget: boolean }[] = [
    ...before.map((row) => ({ row, isTarget: false })),
    { row: target, isTarget: true },
    ...after.map((row) => ({ row, isTarget: false })),
  ];

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
          {isFirstInLocation ? (
            <p className="flex items-center justify-center gap-1 rounded-lg bg-surface-2 py-1.5 text-[11px] font-bold text-muted">
              <ArrowUp size={12} /> دي أول سيارة في الموقع — مفيش قبلها
            </p>
          ) : before.length < 5 ? (
            <p className="text-center text-[11px] text-muted">قبلها {before.length} {before.length === 1 ? "سيارة" : "سيارات"} بس في نفس الموقع</p>
          ) : null}

          <div className="overflow-auto rounded-xl border border-border">
            <table className="border-collapse w-full text-xs" style={{ direction: "rtl" }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-2 text-muted">
                  <th className="border-b border-l border-border px-2 py-1.5 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                  {detailCols.map((c) => (
                    <th key={c} className="border-b border-l border-border px-2 py-1.5 text-right font-bold whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(({ row, isTarget }, i) => (
                  <tr key={i} className={isTarget ? "bg-brand/25 border-b border-border" : "border-b border-border"}>
                    <td className="border-l border-border px-2 py-1.5 whitespace-nowrap font-bold text-ink">
                      <span className="inline-flex items-center gap-1">
                        {isTarget && <MapPin size={11} className="shrink-0 text-brand" />}
                        {String(row[plateCol] ?? "") || "—"}
                        {isTarget && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold text-night leading-none">المطلوبة</span>}
                      </span>
                    </td>
                    {detailCols.map((c) => (
                      <td key={c} className="border-l border-border px-2 py-1.5 whitespace-nowrap text-ink">{String(row[c] ?? "").trim() || "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

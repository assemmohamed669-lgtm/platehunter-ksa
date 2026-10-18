"use client";

/**
 * 🚨 **مربع «سيارات مطلوبة» بعد التفريغ** (١٨ أكتوبر ٢٠٢٦ — `lib/wantedBatch.ts`).
 *
 * المالك: «لو اتفرغ وطلع مطلوبه اكتر من لوحه اولا يظهر في مربع وبصوت والمربع مكتوب فيه بيانات السيارة
 * كامله ولو ليها شهادة وكل بيانات السيارة ويظهر كلمه فوق يوجد مثلا ٣ سيارات مطلوبه ولما يسحب من
 * اليمين لليسار او العكس يلاقي اللوحات التانيه بكل بياناتهم».
 *
 *  · صوت واحد أول ما يظهر — نفس صفّارة التطبيق ونغمة التحصيل المختارة (`lib/alertSiren.ts`)، و«تم» بتوقّفها.
 *  · كارت لكل عربية: اللوحة · كل أعمدة ملف التشييك · الشهادة (بالشاص وإلا باللوحة) · النوع/الملاحظة اللي
 *    اتقالوا · مكانها **لحظة ما اتقالت**. السحب يمين/شمال (scroll-snap) أو الأسهم.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, MapPin, TableProperties } from "lucide-react";
import CertificateBadge from "@/components/CertificateBadge";
import { ensureSirenAudioUnlocked, startAlertSiren, stopAlertSiren } from "@/lib/alertSiren";
import PlateBadge from "./PlateBadge";
import { pinLink } from "../lib/gps";
import { carInfoRows, chassisOf, wantedHeadline } from "../lib/wantedBatch";
import type { PlateEntry } from "../lib/plateEntry";

function clock(ms: number | undefined): string | null {
  if (!ms || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}${h < 12 ? "ص" : "م"}`;
}

export default function WantedBatchModal({
  items,
  onClose,
  onShowRow,
}: {
  items: PlateEntry[];
  onClose: () => void;
  /** «وريني في الجدول» — الصفحة بتنزل لصف اللوحة */
  onShowRow?: (id: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const n = items.length;

  // 🔊 صوت أول ما المربع يظهر — ويوقف لو المربع اتقفل بأي طريقة
  useEffect(() => {
    try {
      ensureSirenAudioUnlocked();
      startAlertSiren();
    } catch {
      /* الصوت مقفول — المربع لوحده كفاية */
    }
    return () => {
      try {
        stopAlertSiren();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (idx > n - 1) setIdx(Math.max(0, n - 1));
  }, [n, idx]);

  const goTo = (i: number) => {
    const j = Math.max(0, Math.min(n - 1, i));
    setIdx(j);
    const card = railRef.current?.children[j] as HTMLElement | undefined;
    card?.scrollIntoView?.({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  /** السحب بالصباع — الكارت اللي في النص هو الحالي (RTL: scrollLeft بالسالب في كروم) */
  const onScroll = () => {
    const el = railRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (i !== idx && i >= 0 && i < n) setIdx(i);
  };

  const done = () => {
    try {
      stopAlertSiren();
    } catch {
      /* ignore */
    }
    onClose();
  };

  if (n === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-3" dir="rtl" data-testid="wanted-batch">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border-2 border-red-500 bg-slate-900 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-3 text-white">
          <AlertTriangle size={22} className="animate-pulse" />
          <span className="text-lg font-black">🚨 {wantedHeadline(n)}</span>
        </div>
        {n > 1 && (
          <div className="flex items-center justify-between px-4 pt-2 text-xs text-slate-300">
            <span>اسحب يمين أو شمال للعربيات التانية</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-bold tabular-nums">{`${idx + 1} من ${n}`}</span>
          </div>
        )}

        <div
          ref={railRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-contain"
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((e) => {
            const row = (e.match?.row ?? null) as Record<string, unknown> | null;
            const info = carInfoRows(row, e.review.plate);
            const link = pinLink(e.pin);
            const said = clock(e.capturedAt);
            return (
              <div key={e.id} data-testid="wanted-card" className="w-full shrink-0 snap-center overflow-y-auto px-4 py-4" style={{ minWidth: "100%" }}>
                <div className="flex flex-col items-center gap-3">
                  <PlateBadge letters={e.review.letters} digits={e.review.digits} size="lg" tone="wanted" />
                  {said && <span className="text-xs text-slate-300">اتقالت الساعة {said}</span>}
                  {(e.vehicleType || e.note) && (
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-100">
                      {[e.vehicleType, e.note].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-3 py-1 text-xs font-bold text-sky-100">
                      <MapPin size={12} /> مكانها لحظة ما اتقالت
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">📍 من غير موقع</span>
                  )}
                  {info.length > 0 && (
                    <div className="grid w-full grid-cols-1 gap-y-1.5 rounded-2xl bg-white/5 p-3 sm:grid-cols-2 sm:gap-x-3">
                      {info.map(([k, v]) => (
                        <div key={k} className="flex min-w-0 gap-1 text-xs">
                          <span className="shrink-0 text-slate-400">{k}:</span>
                          <span className="break-words font-bold text-white">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <CertificateBadge plate={e.review.plate} chassis={chassisOf(row) ?? undefined} />
                  {onShowRow && (
                    <button type="button" onClick={() => { onShowRow(e.id); done(); }}
                      className="inline-flex items-center gap-1 rounded-full border border-white/20 px-3 py-1 text-xs text-slate-200">
                      <TableProperties size={12} /> وريني في الجدول
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 p-3">
          {n > 1 && (
            <button type="button" aria-label="اللي قبلها" disabled={idx === 0} onClick={() => goTo(idx - 1)}
              className="rounded-xl border border-white/15 p-3 disabled:opacity-30">
              <ChevronRight size={20} />
            </button>
          )}
          <button type="button" onClick={done}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-3 text-lg font-black text-slate-900 active:scale-95">
            <Check size={22} /> تم
          </button>
          {n > 1 && (
            <button type="button" aria-label="اللي بعدها" disabled={idx === n - 1} onClick={() => goTo(idx + 1)}
              className="rounded-xl border border-white/15 p-3 disabled:opacity-30">
              <ChevronLeft size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

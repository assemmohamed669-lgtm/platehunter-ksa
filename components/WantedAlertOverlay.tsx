"use client";

/**
 * Overlay موحّد لتنبيه «سيارة مطلوبة» — متركّب مرة واحدة في لياوت التطبيق.
 * بيسمع لحدث fireWantedAlert من أي صفحة، فيظهر نفس الرسالة بالظبط،
 * يشغّل صفّارة إنذار الحرب، وزر «تم» يوقف الصفّارة ويقفل الرسالة.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { startAlertSiren, stopAlertSiren } from "@/lib/alertSiren";
import { WANTED_ALERT_EVENT, type WantedAlertDetail } from "@/lib/wantedAlert";

export default function WantedAlertOverlay() {
  const [alert, setAlert] = useState<WantedAlertDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WantedAlertDetail>).detail;
      if (!detail?.plate) return;
      setAlert(detail);
      startAlertSiren();
    };
    window.addEventListener(WANTED_ALERT_EVENT, handler);
    return () => {
      window.removeEventListener(WANTED_ALERT_EVENT, handler);
      stopAlertSiren();
    };
  }, []);

  function dismiss() {
    stopAlertSiren();
    setAlert(null);
  }

  if (!alert) return null;

  const fuzzy = alert.matchType === "fuzzy";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-5" style={{ direction: "rtl" }}>
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border-2 border-danger bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 bg-danger px-4 py-3 text-white">
          <AlertTriangle size={22} className="animate-pulse" />
          <span className="text-lg font-black">🚨 سيارة مطلوبة!</span>
        </div>

        <div className="flex flex-col items-center gap-3 px-5 py-5">
          <PlateBadge value={alert.plate} size="lg" />

          {fuzzy && (
            <span className="rounded-full bg-alert/15 px-3 py-1 text-xs font-bold text-alert">
              تطابق مشتبه به{alert.similarity != null ? ` · ${alert.similarity}%` : ""}
            </span>
          )}

          {/* تفاصيل السيارة */}
          {alert.info && alert.info.length > 0 && (
            <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl bg-surface-2 p-3">
              {alert.info.map(([k, v], i) => (
                <div key={i} className="flex gap-1 text-xs min-w-0">
                  <span className="shrink-0 text-muted">{k}:</span>
                  <span className="truncate font-bold text-ink">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* زر «تم» — يوقف الصفّارة ويقفل الرسالة */}
          <button
            onClick={dismiss}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-4 text-lg font-black text-night transition active:scale-95"
          >
            <Check size={22} /> تم
          </button>
        </div>
      </div>
    </div>
  );
}

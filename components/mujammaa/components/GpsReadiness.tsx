"use client";

/**
 * 📍 **الموقع جاهز؟** — العلامة جنب زرار التسجيل + التحذير الكبير (١٩ أكتوبر ٢٠٢٦).
 *
 * لوحة المالك اتفرّغت من غير موقع: داس «بدء التسجيل» على طول والموقع لسه بيصحى. دلوقتي يشوف قبل ما
 * يسجّل: حمرا «📍 بيجيب الموقع…» ⇒ خضرا «📍 الموقع جاهز ±Xم» (`gpsReadiness`). ولو داس وهي لسه حمرا ⇒
 * تحذير كبير لحد ما يجهز (`gpsStartWarning`) — التسجيل مابيتوقّفش (الشغل في الشارع مايستناش).
 *
 * كل واحدة بعدّادها (كل ثانية) — فالموقع اللي وقف بيرجّع العلامة حمرا لوحده، والصفحة الكبيرة ماتتعادش.
 */
import { useEffect, useState } from "react";
import {
  currentFix,
  gpsReadiness,
  gpsStartWarning,
  gpsStatus,
  lastFixRecvAt,
  subscribeGps,
  type GpsReadiness,
} from "../lib/gps";

const read = () => gpsReadiness(currentFix(), lastFixRecvAt(), Date.now(), gpsStatus());

function useReadiness(): GpsReadiness {
  const [r, setR] = useState<GpsReadiness>(read);
  useEffect(() => {
    const update = () =>
      setR((prev) => {
        const next = read();
        return next.state === prev.state && next.label === prev.label ? prev : next;
      });
    const unsub = subscribeGps(update);
    const id = setInterval(update, 1000);
    update();
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);
  return r;
}

const TONE: Record<GpsReadiness["state"], string> = {
  ready: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
  weak: "border-amber-400/50 bg-amber-500/15 text-amber-100",
  waiting: "animate-pulse border-red-400/50 bg-red-500/15 text-red-200",
  off: "border-red-400/50 bg-red-500/15 text-red-200",
};

export function GpsReadyChip() {
  const r = useReadiness();
  return (
    <span role="status" aria-live="polite" className={`rounded-lg border px-2 py-1 text-xs font-bold ${TONE[r.state]}`}>
      {r.label}
    </span>
  );
}

export function GpsStartWarning({ onReady }: { onReady: () => void }) {
  const warn = gpsStartWarning(useReadiness());
  useEffect(() => {
    if (!warn) onReady();
  }, [warn, onReady]);
  if (!warn) return null;
  return (
    <div
      role="alert"
      className="mt-3 rounded-xl border-2 border-red-500/60 bg-red-600/20 px-4 py-3 text-sm font-black leading-relaxed text-red-100"
    >
      {warn}
    </div>
  );
}

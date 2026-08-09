"use client";

import { useCallback, useRef } from "react";
import { ZOOM_LEVELS } from "@/lib/zoom";

/**
 * بيحسب مستوى الزوم الهدف من نسبة تباعد الإصبعين (scale) مقارنةً ببداية البنش.
 * كل ما الإصبعين يتباعدوا ~١.٢× نطلع درجة، والعكس. دالة نقية قابلة للاختبار.
 */
export function pinchZoomTarget(startZoom: number, scale: number, maxIndex: number): number {
  if (!isFinite(scale) || scale <= 0) return startZoom;
  const steps = Math.round(Math.log(scale) / Math.log(1.2));
  return Math.max(0, Math.min(maxIndex, startZoom + steps));
}

/**
 * زوم بإصبعين (pinch) لأي حاوية فيها لوحات — بيحرّك نفس مؤشّر الزوم بتاع
 * ZoomControl. بيرجّع **callback ref** تحطّه على الحاوية (ref={pinch})، فيشتغل
 * حتى لو الحاوية بتظهر متأخرة (نتيجة فرز/تشييك بتترسم بعد ضغط زر)، عكس useEffect
 * اللي بيتعلّق مرة واحدة على التحميل. لمس بس (موبايل)، مابيأثرش على الماوس.
 */
/** بيعلّق مستمعي اللمس على عنصر واحد، وبيرجّع دالة الفك. */
function attachPinch(
  el: HTMLElement,
  zoomRef: { current: number },
  setZoomRef: { current: (updater: (z: number) => number) => void },
  maxRef: { current: number },
): () => void {
  let startDist = 0;
  let startZoom = 0;
  let active = false;
  const distOf = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onStart = (e: TouchEvent) => {
    if (e.touches.length === 2) { active = true; startDist = distOf(e.touches); startZoom = zoomRef.current; }
  };
  const onMove = (e: TouchEvent) => {
    if (!active || e.touches.length !== 2 || startDist === 0) return;
    e.preventDefault(); // امنع تكبير الصفحة نفسها أثناء زوم اللوحات
    const target = pinchZoomTarget(startZoom, distOf(e.touches) / startDist, maxRef.current);
    setZoomRef.current(() => target);
  };
  const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) active = false; };

  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: false });
  el.addEventListener("touchend", onEnd, { passive: true });
  el.addEventListener("touchcancel", onEnd, { passive: true });
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchmove", onMove);
    el.removeEventListener("touchend", onEnd);
    el.removeEventListener("touchcancel", onEnd);
  };
}

export function usePinchZoom(
  zoom: number,
  setZoom: (updater: (z: number) => number) => void,
  maxIndex: number = ZOOM_LEVELS.length - 1,
): (el: HTMLElement | null) => void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;
  const maxRef = useRef(maxIndex);
  maxRef.current = maxIndex;
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    // نفكّ أي مستمعين قدام (لو اتغيّرت العقدة أو اتشالت).
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    if (!el) return;
    cleanupRef.current = attachPinch(el, zoomRef, setZoomRef, maxRef);
  }, []);
}

/**
 * نفس `usePinchZoom` بس لعدد **مش معروف** من الحاويات (نوافذ نتيجة الفرز —
 * نافذة لكل ملف داتا). الهوك ماينفعش يتنادى جوه لوب، فبنستدعي واحد بس وبيرجّع
 * مصنع: `pinchFor(key)` بيدّي callback ref **ثابت** لكل مفتاح، وكل مفتاح ليه
 * دالة فكّ خاصة به.
 */
export function usePinchZoomMulti(
  zoom: number,
  setZoom: (updater: (z: number) => number) => void,
  maxIndex: number = ZOOM_LEVELS.length - 1,
): (key: string | number) => (el: HTMLElement | null) => void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;
  const maxRef = useRef(maxIndex);
  maxRef.current = maxIndex;
  // مفتاح → { الـ ref الثابت، فكّ المستمعين الحاليين }
  const slots = useRef(new Map<string | number, {
    ref: (el: HTMLElement | null) => void;
    cleanup: (() => void) | null;
  }>());

  return useCallback((key: string | number) => {
    const existing = slots.current.get(key);
    if (existing) return existing.ref;
    const slot: { ref: (el: HTMLElement | null) => void; cleanup: (() => void) | null } = {
      cleanup: null,
      ref: (el: HTMLElement | null) => {
        if (slot.cleanup) { slot.cleanup(); slot.cleanup = null; }
        if (!el) return;
        slot.cleanup = attachPinch(el, zoomRef, setZoomRef, maxRef);
      },
    };
    slots.current.set(key, slot);
    return slot.ref;
  }, []);
}

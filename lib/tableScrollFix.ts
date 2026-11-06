"use client";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ↔️ جدول النتيجة مايرجعش لأول الصف لوحده (الآيفون) — ٦ نوفمبر ٢٠٢٦
 * ══════════════════════════════════════════════════════════════════════
 * المالك عن العبيدي (آيفون): «بيمشي صباعه ويسحب في المربع علشان يشوف الاعمدة … امشي ب صباعي علشان اجيب اخر الصف
 * علشان احمل الشهادة يرجعه من الاول ويجيبه يمين المربع».
 *
 * مفيش في الكود حاجة بتقول «ارجع لأول الصف»، بس فيه حاجتين محرّك الآيفون مابيتعاملش معاهم كويس:
 *  1. «شهايد النهارده» بتتفرز تاني لوحدها كل ما شهايد جديدة تنزل وبترسم الجدول من جديد — حتى والصباع عليه.
 *  2. السحب الجانبي في مربع «من اليمين للشمال» (RTL) — محرّك الآيفون عنده مشاكل معروفة في حفظ مكانه.
 *
 * ⇒ (`components/WantedResultsTable.tsx` + `components/DailyCertSort.tsx`):
 *  · المربع بيتسحب «شمال ⇐ يمين» من جوّه (`dir="ltr"`) والجدول نفسه زي ما هو (`direction: rtl`، اللوحة على اليمين)،
 *    وبيفتح على اليمين.
 *  · الجدول فاكر المندوب واقف فين (بُعده عن أول الصف) وبيرجّعه هناك بعد أي تحديث أو تغيير في العرض.
 *  · التحديث التلقائي بيستنى الصباع يتشال ويقف شوية (بحد أقصى) قبل ما يرسم.
 *
 * العبيدي + السوبر أدمن الأول. الرجوع: شيل الرقم من `TABLE_SCROLL_FIX_IDS`.
 */

import { useEffect, useState } from "react";

/** للكل؟ — false = العبيدي + السوبر أدمن بس (لحد ما يأكّد إنها اتصلّحت). */
export const TABLE_SCROLL_FIX_FOR_ALL = false;

export const TABLE_SCROLL_FIX_IDS: string[] = [
  "db903add-ebc1-4b1e-96e8-8cacd87dc13b",   // العبيدي (آيفون)
];

export function tableScrollFixFor(uid: string | null | undefined, isSuper: boolean): boolean {
  return TABLE_SCROLL_FIX_FOR_ALL || isSuper || (!!uid && TABLE_SCROLL_FIX_IDS.includes(uid));
}

let fixPromise: Promise<boolean> | null = null;
function fetchScrollFix(): Promise<boolean> {
  if (!fixPromise) {
    fixPromise = (async () => {
      try {
        const { supabase } = await import("./supabaseClient");
        const { data } = await supabase.auth.getUser();
        const id = data.user?.id;
        if (!id) { fixPromise = null; return false; }   // الجلسة لسه مش جاهزة ⇒ نسأل تاني بعدين
        if (tableScrollFixFor(id, false)) return true;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", id).single();
        return tableScrollFixFor(id, !!(prof as { is_super?: boolean } | null)?.is_super);
      } catch {
        fixPromise = null;
        return false;
      }
    })();
  }
  return fixPromise;
}

/** الإصلاح شغّال للمندوب ده؟ */
export function useTableScrollFix(): boolean {
  const [on, setOn] = useState<boolean>(TABLE_SCROLL_FIX_FOR_ALL);
  useEffect(() => {
    if (TABLE_SCROLL_FIX_FOR_ALL) return;
    let alive = true;
    void fetchScrollFix().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}

// ── مكان السحب: بُعد المندوب عن أول الصف (اليمين — عمود اللوحة) في مربع بيتسحب «شمال ⇐ يمين» ──

/** أقصى سحب = اليمين (أول الصف). */
function maxScroll(scrollWidth: number, clientWidth: number): number {
  return Math.max(0, scrollWidth - clientWidth);
}

/** المندوب بعيد قد إيه عن أول الصف (بالبكسل). */
export function fromRightOf(scrollLeft: number, scrollWidth: number, clientWidth: number): number {
  return Math.max(0, maxScroll(scrollWidth, clientWidth) - scrollLeft);
}

/** مكان السحب اللي يرجّعه لنفس البُعد عن أول الصف — جوّه حدود الجدول. */
export function scrollLeftFor(fromRight: number, scrollWidth: number, clientWidth: number): number {
  const max = maxScroll(scrollWidth, clientWidth);
  return Math.min(max, Math.max(0, max - fromRight));
}

// ── الصباع على الجدول: التحديث التلقائي بيستنى ──

/** بعد ما الصباع يتشال (أو آخر زحلقة) بكام يعتبر واقف. */
export const TABLE_TOUCH_IDLE_MS = 2500;
/** لمسة من غير «شال» (الجدول اتشال وهو ماسك) ⇒ بعد كده مانعتبرهاش ماسكة. */
export const TABLE_TOUCH_STALE_MS = 15_000;

let touching = false;
let lastTouchAt = -Infinity;

export function noteTableTouch(kind: "start" | "move" | "end" | "scroll", now: number = Date.now()): void {
  if (kind === "start") touching = true;
  else if (kind === "end") touching = false;
  lastTouchAt = now;
}

/** المندوب ماسك الجدول أو لسه سايبه من ثواني؟ */
export function tableBusy(now: number = Date.now()): boolean {
  if (touching && now - lastTouchAt < TABLE_TOUCH_STALE_MS) return true;
  return now - lastTouchAt < TABLE_TOUCH_IDLE_MS;
}

/** استنى لحد ما الجدول يفضى — بحد أقصى `maxMs` (التحديث مايتعلّقش على طول). */
export function waitTableIdle(maxMs: number): Promise<void> {
  const until = Date.now() + maxMs;
  return new Promise((resolve) => {
    const tick = () => {
      const now = Date.now();
      if (!tableBusy(now) || now >= until) { resolve(); return; }
      setTimeout(tick, 500);
    };
    tick();
  });
}

/** للاختبارات. */
export function resetTableTouch(): void {
  touching = false;
  lastTouchAt = -Infinity;
}

"use client";

/**
 * ⏸️ **التسجيل واقف مؤقت** — الشريط اللي تحت الزراير وهو واقف (المالك ٢٢ أكتوبر ٢٠٢٦).
 *
 * المندوب لازم يعرف إن اللي بيقوله دلوقتي **مش بيتسجّل** — وإنه لسه في نفس الملف ومحتاج يدوس «كمّل التسجيل» لما
 * يوصل مكان فيه لوحات. عدّاد الوقفة بعدّاده هو (كل ثانية) — الصفحة الكبيرة ماتتعادش.
 */
import { useEffect, useState } from "react";
import { pauseBannerText } from "../lib/pauseText";

export function PauseBanner({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 rounded-xl border-2 border-amber-400/60 bg-amber-500/15 px-4 py-3 text-sm font-bold leading-relaxed text-amber-100"
    >
      {pauseBannerText(now - since)}
    </div>
  );
}

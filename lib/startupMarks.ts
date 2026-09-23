/**
 * ══════════════════════════════════════════════════════════════════════
 *  قياس زمن بدء التسجيل — «بيأخر على ما بيبدأ»
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (٢٣ سبتمبر ٢٠٢٦): «لما بدوس ابدأ التسجيل بيأخر على ما
 * بيبدأ التسجيل».
 *
 * 🔴 **التخمين هنا غالي**: تلات مشتبهين وكل واحد علاجه مختلف —
 *   ① تحليل شيت التشييك (٤٩ ألف لوحة، `readAllSheets` على الخيط الرئيسي)
 *   ② تحميل شنك المحرّك (`import("@/lib/voicexEngine")` أول مرة)
 *   ③ فتح المايك (`getUserMedia` + `AudioContext`)
 *
 * فبنقيس التلاتة ونعرض الأرقام بدل ما نصلّح واحد ونستنى رد.
 */

export interface Mark {
  label: string;
  /** لحظة انتهاء المرحلة (`Date.now()`). */
  at: number;
}

export interface Phase {
  label: string;
  ms: number;
}

export interface Breakdown {
  phases: Phase[];
  totalMs: number;
  /** أبطأ مرحلة — هي اللي بتحدّد نصلّح إيه. */
  slowest: Phase | null;
  /** سطر جاهز للتقرير. */
  text: string;
}

/** يحوّل علامات زمنية لمدد، مع أبطأ مرحلة ونص جاهز. */
export function startupBreakdown(marks: readonly Mark[], pressedAt: number): Breakdown {
  const list = (marks ?? []).filter((m) => m && Number.isFinite(m.at));
  if (!list.length) return { phases: [], totalMs: 0, slowest: null, text: "—" };

  let prev = pressedAt;
  const phases: Phase[] = list.map((m) => {
    // ⚠️ الحارس: علامة سابقة للضغطة (ساعة اتظبطت) مالهاش مدة سالبة.
    const ms = Math.max(0, Math.round(m.at - prev));
    prev = m.at;
    return { label: m.label, ms };
  });

  const totalMs = Math.max(0, Math.round(list[list.length - 1].at - pressedAt));
  const slowest = phases.reduce<Phase | null>(
    (best, p) => (best == null || p.ms > best.ms ? p : best), null);

  return {
    phases,
    totalMs,
    slowest,
    text: phases.map((p) => p.label + " " + p.ms + "ms").join(" · ") + " = " + totalMs + "ms",
  };
}

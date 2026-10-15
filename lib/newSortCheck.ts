/**
 * 🆕 «فرز جديد» = المحفظة (كل شيتات الإحالة) **ناقص** اللي في التشييك، والباقي بيتفرز على الداتا. «فرز كلي» = المحفظة
 * كلها على الداتا. المالك (١٥ أكتوبر ٢٠٢٦): «يظهر في الفرز الجديد السيارات الجديده بس ولما يفرز فرز كلي يطلعلو نتيجه
 * الفرز الكلي اللي في المحفظه اللي رفعها» — بعد شكاوى «الجديد والكلي زي بعض … لازم يفرز مرتين او تلاته».
 *
 * سببين كانوا بيلخبطوا التابين (اتصلّحوا في صفحة الفرز بالدوال دي):
 *  ① التبديل بين «جديد» و«كلي» والفرز لسه شغّال ⇒ نتيجة الكلي بتنزل في تاب الجديد (أو العكس) — `resultBelongsOnScreen`.
 *  ② نتيجة «الجديد» المحفوظة بتفضل تتعرض بعد ما ملف التشييك اتغيّر — `checkSourcesSignature` + `isNewCacheFresh`.
 */
import type { CheckSource } from "./checkSheets";

/** يقسم المحفظة: الجديد (مش في التشييك) + كام لوحة منها موجودة في التشييك. */
export function splitReferralByCheck<T extends { norm: string }>(
  entries: T[], checkSet: Set<string>,
): { fresh: T[]; inCheck: number; total: number } {
  const fresh = entries.filter((e) => !checkSet.has(e.norm));
  return { fresh, inCheck: entries.length - fresh.length, total: entries.length };
}

/**
 * بصمة ملفات التشييك (الأساسي + الإضافية) — عدد الصفوف والأعمدة وأول وآخر صف لكل ملف. لو اتغيّرت، نتيجة «الجديد»
 * المحفوظة اتحسبت على ملف تاني فماتتعرضش.
 */
export function checkSourcesSignature(sources: CheckSource[]): string {
  return `${sources.length}|` + sources.map((s) => {
    const rows = s?.rows ?? [];
    const first = rows.length ? JSON.stringify(rows[0]) : "";
    const last = rows.length > 1 ? JSON.stringify(rows[rows.length - 1]) : "";
    return `${rows.length}:${(s?.headers ?? []).join("\u0001")}:${first}:${last}`;
  }).join("\u0002");
}

/** النتيجة المحفوظة اتحسبت على نفس ملف التشييك الحالي؟ (المحفوظة قبل التصليح مالهاش بصمة ⇒ لأ) */
export function isNewCacheFresh(cachedSig: string | undefined, currentSig: string): boolean {
  return !!cachedSig && cachedSig === currentSig;
}

/** نتيجة الفرز تنزل على الشاشة بس لو التاب بتاعها هو اللي مفتوح دلوقتي. */
export function resultBelongsOnScreen(runMode: "new" | "full", screenMode: "new" | "full"): boolean {
  return runMode === screenMode;
}

/**
 * قفل لكل مربع داتا إضافي في صفحة الفرز — زي قفل مربع الداتا الأساسي بالظبط.
 *
 * وهو مقفول المندوب مايقدرش يمسح الإكسيل اللي جوّاه ولا يشيل المربع؛ لازم يفتح
 * القفل الأول. لازمته إن المندوب بيشتغل على ملفات كبيرة ومسحة بالغلط تضيّع رفع
 * ووقت.
 *
 * الأقفال متخزّنة **بمواقع** مش بمعرّفات، لأن المربعات نفسها بتتشال بالموقع —
 * فلو مربع اتشال لازم قفله يتشال معاه، وإلا الأقفال تتزحلق على المربعات الغلط.
 * والافتراضي **مفتوح** دايماً: قفل بالغلط بيمنع المندوب من شغله.
 */

export const EXTRA_DATA_LOCKS_KEY = "ph:sorting:extraDataLocks";

/** بيترجم القيمة المتخزّنة. أي حاجة مش مصفوفة = الكل مفتوح. */
export function locksFromStored(raw: string | null): boolean[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map((v) => v === true) : [];
  } catch {
    return [];
  }
}

export function loadExtraDataLocks(): boolean[] {
  try { return locksFromStored(localStorage.getItem(EXTRA_DATA_LOCKS_KEY)); }
  catch { return []; }
}

export function saveExtraDataLocks(locks: boolean[]): void {
  try { localStorage.setItem(EXTRA_DATA_LOCKS_KEY, JSON.stringify(locks)); }
  catch { /* التخزين مرفوض — القفل يشتغل للجلسة دي بس */ }
}

/** المربع ده مقفول؟ (المواقع اللي لسه ماتسجّلتش = مفتوحة). */
export function isLockedAt(locks: boolean[], i: number): boolean {
  return locks[i] === true;
}

/** بيبدّل قفل موقع — وبيحجز المواقع اللي قبله كمفتوحة لو كانت ناقصة. */
export function toggleLockAt(locks: boolean[], i: number): boolean[] {
  const next = [...locks];
  while (next.length <= i) next.push(false);
  next[i] = !next[i];
  return next;
}

/** بيشيل قفل المربع اللي اتشال — الباقي بيتزحلق معاه صح. */
export function removeLockAt(locks: boolean[], i: number): boolean[] {
  return locks.filter((_, idx) => idx !== i);
}

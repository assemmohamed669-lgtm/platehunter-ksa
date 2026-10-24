/**
 * ══════════════════════════════════════════════════════════════════════
 *  📥 تعديلات السجلات من السيرفر **قبل الفرز** — الحي/الشارع اللي الأدمن ملاه
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٤ أكتوبر ٢٠٢٦): «مليتو بس عايزك تتأكد ان المندوب لما بيفرز بعد ما يتملي بيطلع معاه كل بيانات اللوحات اللي
 * مكنتش مليانه في نتيجه الفرز وتبقي موجوده في السجلات كمان … ولو صدّر».
 *
 * 🔍 «املأ الحي والشارع» (`/admin/area-fill`) بيكتب على السيرفر، والموبايل بينزّل التعديلات (`pullEditedFieldChecks`)
 * لما المندوب يفتح **«التشييك»** بس. والبرنامج بيفتح على **آخر صفحة أو «الفرز»** (`app/page.tsx`) ⇒ المندوب اللي بيفتح
 * ويفرز على طول كان بيفرز على سجلات الموبايل القديمة (من غير الحي) لحد ما يعدّي على «التشييك».
 *
 * ⇒ صفحة الفرز بتنزّل التعديلات بنفسها (نفس الدالة — **الجديد بس** من آخر مرة)، و«فرز» بيستناها لحد `EDITS_WAIT_MS`.
 * النت مقطوع/بطيء ⇒ الفرز بيكمّل بسجلات الموبايل زي النهارده (مابيقفش).
 */
import { withTimeout } from "./sortRunner";

/** نزلت من أقل من كده ⇒ مابنسألش السيرفر تاني (الرجوع للصفحة كتير). */
export const EDITS_PULL_GAP_MS = 60_000;
/** «فرز» بيستنى التعديلات لحد كده بالكتير. */
export const EDITS_WAIT_MS = 6_000;

type Pull = (uid: string) => Promise<{ updated: number; error?: string }>;

type State = { uid: string; at: number; ok: boolean; p: Promise<void> | null };
let state: State | null = null;

/**
 * نزّل تعديلات السجلات للحساب ده — مرة واحدة لو شغّالة، ومن غير ما نعيد لو نزلت من شوية. مابترميش أبداً؛ الفشل بيخلّي
 * المرة الجاية تحاول على طول.
 */
export function ensureRecordEdits(uid: string, pull: Pull, now: number = Date.now()): Promise<void> {
  if (!uid) return Promise.resolve();
  if (state && state.uid === uid) {
    if (state.p) return state.p;
    if (state.ok && now - state.at < EDITS_PULL_GAP_MS) return Promise.resolve();
  }
  const s: State = { uid, at: now, ok: false, p: null };
  const p = (async () => {
    try {
      const r = await pull(uid);
      s.ok = !r?.error;
    } catch {
      s.ok = false;
    } finally {
      s.p = null;
    }
  })();
  s.p = p;
  state = s;
  return p;
}

/** «فرز» بيستنى التعديلات — `true` خلصت (أو مفيش) · `false` اتأخّرت والفرز يكمّل باللي على الموبايل. */
export async function waitRecordEdits(p: Promise<void> | null | undefined, ms: number = EDITS_WAIT_MS): Promise<boolean> {
  if (!p) return true;
  try {
    await withTimeout(p, ms);
    return true;
  } catch {
    return false;
  }
}

/** للاختبارات بس. */
export function __resetRecordEdits(): void {
  state = null;
}

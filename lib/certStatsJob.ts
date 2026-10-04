/**
 * 📊 إحصائيات الشهايد — **الدورة على السيرفر** (كل دقيقة من `/api/cron/cert-stats`).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): العدّ من الموبايل قعد ربع ساعة وعدّى ٦٠٠ ألف ملف ولسه. فالعدّ اتنقل
 * هنا: السيرفر بيعدّ لوحده في الخلفية ويحفظ (`cert_stats_state`)، والصفحة بتفتح على طول بآخر
 * نتيجة كاملة. كل دورة:
 *  · بتاخد القفل (دورتين مايشتغلوش مع بعض أبداً) — مشغول ⇒ مابتعملش حاجة.
 *  · مفيش نتيجة لسه، أو آخر عدّ كامل عدّى عليه يوم ⇒ عدّ كامل جديد (`advancePass`) بيكمّل على
 *    كذا دورة. النتيجة القديمة بتفضل ظاهرة لحد ما الجديد يخلص.
 *  · غير كده ⇒ الجديد بس (`addNewFiles`) ويتضاف على النتيجة.
 *  · اللوحات المختلفة في جدولين (`cert_stats_plates` و`cert_stats_plate_uploaders`) متعلّمة برقم
 *    العدّة؛ لما العدّة تخلص بنعدّ صفوفها، وبنمسح بتاع العدّات القديمة (اللي اتمسح من درايف بيتشال).
 *  · الحالة بتتكتب بس لو حاجة اتغيّرت (غير كده بس بيتفك القفل) — مانحمّلش الداتابيز كل دقيقة.
 */
import {
  newPass, advancePass, snapshotFromPass, addNewFiles,
  type CertSnapshot, type PassState, type CountTask, type StepResult, type StatFile,
} from "./certStats";

/** الحالة المحفوظة (صف واحد). */
export interface JobState {
  snapshot?: CertSnapshot | null;
  pass?: PassState | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
}

export interface PlatesDb {
  upsert(pass: number, pairs: [string, string][]): Promise<void>;
  count(pass: number): Promise<number>;
  countBy(pass: number, uploader: string): Promise<number>;
  cleanup(pass: number): Promise<void>;
}

export interface JobDeps {
  /** بياخد القفل ويرجّع الحالة — `null` لو دورة تانية شغّالة. */
  lock(): Promise<JobState | null>;
  /** بيحفظ الحالة ويفك القفل. */
  save(st: JobState): Promise<void>;
  /** بيفك القفل بس (مفيش حاجة اتغيّرت). */
  release(): Promise<void>;
  plates: PlatesDb;
  /** صفحة من درايف لفترة ⇒ `stepFromPage(…, cut, true)`. */
  step(t: CountTask, cut: boolean): Promise<StepResult>;
  listNew(since: string, token?: string): Promise<{ files: StatFile[]; next: string | null }>;
  now(): Date;
  /** الوقت المسموح لإطلاق خطوات جديدة في الدورة. */
  budgetMs: number;
  /** (للاختبار) أقصى عدد خطوات في الدورة. */
  maxSteps?: number;
  concurrency: number;
}

/** عدّ كامل جديد كل يوم (اللي اتمسح أو اتشارك قديم يبان). */
export const FULL_EVERY_MS = 24 * 60 * 60_000;

export type TickResult =
  | { action: "busy" }
  | { action: "pass"; n: number }
  | { action: "done"; n: number; plates: number }
  | { action: "new"; added: number }
  | { action: "error"; error: string };

async function countByUploaders(db: PlatesDb, pass: number, uploaders: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (let i = 0; i < uploaders.length; i += 5) {
    const chunk = uploaders.slice(i, i + 5);
    const counts = await Promise.all(chunk.map((u) => db.countBy(pass, u)));
    chunk.forEach((u, j) => { out[u] = counts[j]; });
  }
  return out;
}

export async function certStatsTick(d: JobDeps): Promise<TickResult> {
  const st = await d.lock();
  if (!st) return { action: "busy" };
  const t0 = Date.now();
  let launched = 0;
  const stop = () => Date.now() - t0 > d.budgetMs || (d.maxSteps != null && ++launched > d.maxSteps);
  let changed = false;
  try {
    const now = d.now();
    if (!st.pass && (!st.snapshot || now.getTime() - Date.parse(st.snapshot.fullAt) >= FULL_EVERY_MS)) {
      st.pass = newPass((st.snapshot?.pass ?? 0) + 1, now);
      changed = true;
    }

    if (st.pass) {
      const p = st.pass;
      changed = true;
      const r = await advancePass(p, d.step, {
        concurrency: d.concurrency, stop, onCounted: (res) => d.plates.upsert(p.pass, res.pairs),
      });
      if (r === "paused") return { action: "pass", n: p.n };
      const plates = await d.plates.count(p.pass);
      const platesBy = await countByUploaders(d.plates, p.pass, Object.keys(p.counts));
      st.snapshot = snapshotFromPass(p, plates, platesBy, d.now());
      st.pass = null;
      st.lastError = null;
      try { await d.plates.cleanup(p.pass); } catch { /* المرة الجاية */ }
      return { action: "done", n: st.snapshot.n, plates };
    }

    // الجديد بس
    const snap = st.snapshot!;
    const r = await addNewFiles(snap, d.listNew, { stop, onCounted: (pairs) => d.plates.upsert(snap.pass, pairs) });
    if (r.added) {
      snap.plates = await d.plates.count(snap.pass);
      Object.assign(snap.platesBy, await countByUploaders(d.plates, snap.pass, r.uploaders));
      snap.at = d.now().toISOString();
      changed = true;
    }
    if (st.lastError) { st.lastError = null; changed = true; }
    return { action: "new", added: r.added };
  } catch (e) {
    st.lastError = (e as Error)?.message || "error";
    st.lastErrorAt = d.now().toISOString();
    changed = true;
    return { action: "error", error: st.lastError };
  } finally {
    if (changed) await d.save(st);
    else await d.release();
  }
}

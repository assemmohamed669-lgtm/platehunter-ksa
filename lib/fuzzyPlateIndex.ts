/**
 * فهرس «اللوحات المتشابهة» للفرز.
 *
 * الفرز بيطابق **تطابق تام** بس (Map)، فلوحة اتكتبت غلط بحرف أو رقم واحد
 * بتفوت. الفهرس ده بيمسك المتشابه من غير ما يقارن كل لوحة بكل لوحة (اللي
 * هيبقى مليارات المقارنات على ملف داتا كبير):
 *
 *   • دلو بنفس **الأرقام** (الحروف غلط)  — «رنع3110» ↔ «رمع3110»
 *   • دلو بنفس **الحروف** (رقم غلط)      — «رنع3110» ↔ «رنع3118»
 *
 * أغلب الأخطاء الحقيقية واحدة من الاتنين دول، والبحث بيبقى نداء Map واحد
 * ودلو صغير — يعني تكلفته على ٤٠٠ ألف صف تقريباً زي التطابق التام.
 */
import { levenshtein, similarityPercent } from "./plateParser";

/**
 * **خانة واحدة غلط بالظبط** هي تعريف «متشابهة» هنا — مش نسبة مئوية.
 * النسبة بتخدع: لوحة ٧ خانات بفرق خانة = ٨٦٪ (تحت عتبة الـ٨٨)، ولوحة ٨ خانات
 * بفرق خانة = ٨٨٪ (فوقها) — فالعتبة بتقبل وترفض حسب الطول مش حسب الغلط.
 * مسافة تحرير ١ = حرف واحد أو رقم واحد مختلف، وهي الغلطة الحقيقية الغالبة.
 */
export const FUZZY_MAX_EDITS = 1;

const lettersOf = (n: string) => n.replace(/[0-9]/g, "");
const digitsOf = (n: string) => n.replace(/[^0-9]/g, "");

export interface FuzzyHit<T> { norm: string; value: T; similarity: number }

export class FuzzyPlateIndex<T> {
  private byDigits = new Map<string, Array<{ norm: string; value: T }>>();
  private byLetters = new Map<string, Array<{ norm: string; value: T }>>();
  private count = 0;

  add(norm: string, value: T): void {
    if (!norm) return;
    const d = digitsOf(norm), l = lettersOf(norm);
    if (!d || !l) return;                       // مش لوحة (أرقام بس أو حروف بس)
    const e = { norm, value };
    const dl = this.byDigits.get(d); if (dl) dl.push(e); else this.byDigits.set(d, [e]);
    const ll = this.byLetters.get(l); if (ll) ll.push(e); else this.byLetters.set(l, [e]);
    this.count++;
  }

  get size(): number { return this.count; }

  /** أقرب لوحة مشابهة (أعلى نسبة) — أو null. التطابق التام بيترجّع كمان بنسبة ١٠٠. */
  find(norm: string, maxEdits = FUZZY_MAX_EDITS): FuzzyHit<T> | null {
    let best: FuzzyHit<T> | null = null;
    for (const e of this.candidates(norm)) {
      if (!this.near(norm, e.norm, maxEdits)) continue;
      const sim = e.norm === norm ? 100 : similarityPercent(norm, e.norm);
      if (!best || sim > best.similarity) best = { norm: e.norm, value: e.value, similarity: sim };
    }
    return best;
  }

  /** نفس الطول ومسافة تحرير ≤ maxEdits — يعني خانة واحدة مختلفة مش أكتر. */
  private near(a: string, b: string, maxEdits: number): boolean {
    if (a === b) return true;
    if (a.length !== b.length) return false;
    return levenshtein(a, b) <= maxEdits;
  }

  /** كل المتشابه (للحالة اللي فيها أكتر من صف داتا لنفس اللوحة). */
  findAll(norm: string, maxEdits = FUZZY_MAX_EDITS): FuzzyHit<T>[] {
    const out: FuzzyHit<T>[] = [];
    for (const e of this.candidates(norm)) {
      if (!this.near(norm, e.norm, maxEdits)) continue;
      out.push({ norm: e.norm, value: e.value, similarity: e.norm === norm ? 100 : similarityPercent(norm, e.norm) });
    }
    return out;
  }

  private *candidates(norm: string): Generator<{ norm: string; value: T }> {
    const d = digitsOf(norm), l = lettersOf(norm);
    if (!d || !l) return;
    const seen = new Set<unknown>();
    for (const e of this.byDigits.get(d) ?? []) { seen.add(e); yield e; }
    for (const e of this.byLetters.get(l) ?? []) if (!seen.has(e)) yield e;
  }
}

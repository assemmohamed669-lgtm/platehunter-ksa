/**
 * الثقب اللي التدقيق المستقل لقاه: **تاريخ النتائج مالوش بصمة تيار**.
 * =============================================================================
 * `planPlateWindow` بيرفض **الرسالة** الجاية من تيار قديم (`stale_stream`)، بس
 * `finals` (تاريخ آخر ٣ نتايج) مافيهوش أي معلومة عن التيار. وفي الصفحة الـpush
 * على التاريخ (`page.tsx` جوّه `ws.onmessage`) **مش** مشروط بـ
 * `dgStreamSeqRef.current === streamSeq`، فنتيجة نهائية متأخّرة من سوكيت قديم
 * بتدخل تاريخ التيار الجديد.
 *
 * ليه ده خطر: المدى المثبَت بياخد وقته من توقيت الكلمات. كلمات من ساعة قديمة +
 * كلمات من ساعة جديدة = نافذة على صوت **مش** صوت اللوحة. فحص التزايد جوّه
 * `provePlateSpanAcrossFinals` بيمسك الاتجاه الشايع (ساعة جديدة بتبدأ من الصفر ⇒
 * التوقيت بينزل ⇒ مرفوض)، لكن لو إعادة الاتصال حصلت **بدري** في التيار القديم
 * (أو المالك سكت بعدها فالتاريخ فضل) التوقيت بيبقى متزايد وبيعدّي.
 *
 * الإصلاح فشل-مغلق: `DgFinal.streamFresh === false` ⇒ الإثبات مايعبرش النتيجة
 * دي — بيبدأ من بعدها. والمسار الأحادي (`words` بتاع الرسالة الحالية) مالمسوش.
 */

import { describe, it, expect } from "vitest";
import { provePlateSpanAcrossFinals, type DgWord, type DgFinal } from "@/lib/deepgramWords";
import { planPlateWindow } from "@/lib/plateJudgeClient";

function utter(tokens: string[], t0: number, dur = 0.30, gap = 0.05): DgWord[] {
  const out: DgWord[] = [];
  let t = t0;
  for (const tok of tokens) {
    out.push({ word: tok, start: +t.toFixed(3), end: +(t + dur).toFixed(3), confidence: 0.9 });
    t = +(t + dur + gap).toFixed(3);
  }
  return out;
}

const A_L = ["دال", "باء", "ياء"];
const A_D = ["1", "8", "8", "2"];
const PLATE = "دبي1882";

describe("نتيجة من تيار قديم جوّه التاريخ", () => {
  // إعادة الاتصال حصلت عند ٠٫٩ث من التيار القديم؛ النتيجة القديمة (٠٫٤٠–١٫٠٥)
  // وصلت متأخّرة بعد ما التيار الجديد بقى عند ١٫٦ث ⇒ التوقيت متزايد.
  const stale = utter(A_L, 0.40);      // ساعة التيار **القديم**
  const fresh = utter(A_D, 1.60);      // ساعة التيار الجديد

  it("الإثبات مايعبرش نتيجة مش من التيار الحالي", () => {
    const finals: DgFinal[] = [
      { words: stale, prevWordEndMs: null, streamFresh: false },
      { words: fresh, prevWordEndMs: null, streamFresh: true },
    ];
    expect(provePlateSpanAcrossFinals(finals, PLATE)).toBeNull();
  });

  it("والنافذة بتسكت بسبب مسمّى بدل ما تقصّ صوت غلط", () => {
    const finals: DgFinal[] = [
      { words: stale, prevWordEndMs: null, streamFresh: false },
      { words: fresh, prevWordEndMs: null, streamFresh: true },
    ];
    const p = planPlateWindow({
      words: fresh, finals, expectPlateNorm: PLATE, prevWordEndMs: null,
      wordStartMs: 1600, wordEndMs: 3000, arrivalMs: 4000, mediaElapsedMs: 3500,
      streamFresh: true, audioDrops: 0, pausedMs: 0,
      emit: { index: 0, count: 1, fromCarry: true }, timing: null,
    });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("carried_over");
  });

  it("نتيجة قديمة **بعد** المدى برضه ماتدخلش (الحدّ العلوي مايجيش منها)", () => {
    const finals: DgFinal[] = [
      { words: utter(A_L, 1.00), prevWordEndMs: 500, streamFresh: true },
      { words: utter(A_D, 2.20), prevWordEndMs: 1650, streamFresh: true },
      { words: utter(["راء", "صاد"], 0.20), prevWordEndMs: null, streamFresh: false },
    ];
    const proof = provePlateSpanAcrossFinals(finals, PLATE);
    expect(proof).toBeNull();     // فشل-مغلق: التاريخ فيه نتيجة مش من التيار
  });

  it("بلا العلَم خالص (توافق للخلف) السلوك زي ما هو", () => {
    const finals: DgFinal[] = [
      { words: utter(A_L, 1.00), prevWordEndMs: 500 },
      { words: utter(A_D, 2.20), prevWordEndMs: 1650 },
    ];
    const proof = provePlateSpanAcrossFinals(finals, PLATE);
    expect(proof).not.toBeNull();
    expect(proof!.crossed).toBe(true);
    expect(proof!.span.startMs).toBe(1000);
    expect(proof!.span.endMs).toBe(3550);
  });

  it("وكل النتايج طازة ⇒ الإثبات بيعدّي عادي", () => {
    const finals: DgFinal[] = [
      { words: utter(A_L, 1.00), prevWordEndMs: 500, streamFresh: true },
      { words: utter(A_D, 2.20), prevWordEndMs: 1650, streamFresh: true },
    ];
    expect(provePlateSpanAcrossFinals(finals, PLATE)).not.toBeNull();
  });
});

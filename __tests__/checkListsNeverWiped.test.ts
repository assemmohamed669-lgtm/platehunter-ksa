/**
 * حارس: **شغل المندوب مايتمسحش في صمت.**
 *
 * «اللوحات تفضل في الصفحة مكانها متتمسحش… لو حب هو يمسحها بإيده عادي، بس قبل
 * المسح تجيله رسالة تحذير لو مش متصدّرة» — أمر المالك.
 *
 * كان فيه مسارين بيمسحوا لوحات الصوت من غير ما حد يدوس مسح: رفع ملف تشييك
 * جديد، ومسح ملف التشييك. الاختبار ده بيمنعهم يرجعوا.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ⚠️ توحيد نهايات السطور: على ويندوز git بيحوّل الملف لـCRLF، وساعتها
// `"\n  }\n"` مابتلاقيش حاجة فالقصّ بياخد الملف كله — والحارس يعدّي على أي
// حاجة في صمت. (حصل فعلاً: الاختبار ده «نجح» وهو بيقرا الملف كله.)
const SRC = readFileSync("app/(app)/instant-check/page.tsx", "utf8").replace(/\r\n/g, "\n");

/** جسم دالة بالاسم ده (من التعريف لحد أول قفلة على أول عمود). */
function body(name: string): string {
  const i = SRC.indexOf(`function ${name}(`);
  expect(i, `مالقيتش ${name}`).toBeGreaterThan(-1);
  const end = SRC.indexOf("\n  }\n", i);
  expect(end, `مالقيتش نهاية ${name} — القصّ بايظ`).toBeGreaterThan(i);
  return SRC.slice(i, end);
}

describe("رفع/مسح ملف التشييك مايمسحش لوحات المندوب", () => {
  for (const fn of ["handleParsed", "handleClear"]) {
    it(`${fn} مابيفضّيش نتايج الصوت`, () => {
      const b = body(fn).replace(/\/\/[^\n]*/g, "");   // من غير التعليقات
      expect(b).not.toContain("setPttResults([])");
      expect(b).not.toContain("setManualDraft([])");
      expect(b).not.toContain("setManualHits([])");
    });
  }
});

describe("كل مسار مسح بيعدّي على تحذير «مش متصدّرة»", () => {
  const guarded = [
    "deleteManualSelected",
    "clearAllManualDraft",
    "deletePttSelected",
    "askDeletePttRow",
    "deleteHit",
  ];
  for (const fn of guarded) {
    it(`${fn} بيسأل الأول`, () => {
      expect(body(fn)).toContain("confirmDeleteUnexported");
    });
  }

  it("زرار «مسح النتائج» في الصوت بيسأل كمان", () => {
    const i = SRC.indexOf("مسح النتائج — أحمر، بتأكيد");
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 500)).toContain("confirmDeleteUnexported");
  });
});

describe("التخزين الأساسي IndexedDB مش localStorage", () => {
  it("القوايم التلاتة بتتحفظ بـsaveDraft", () => {
    for (const key of ['"hits", "ic-hits"', '"ptt", "ic-ptt-results"', '"manual", "ic-manual-draft"']) {
      expect(SRC).toContain(`saveDraft(${key}`);
    }
  });

  it("مافيش كتابة مباشرة للقوايم في localStorage (المرآة جوّه saveDraft)", () => {
    expect(SRC).not.toContain('localStorage.setItem("ic-hits"');
    expect(SRC).not.toContain('localStorage.setItem("ic-ptt-results"');
    expect(SRC).not.toContain('localStorage.setItem("ic-manual-draft"');
  });
});

describe("المسح من الصفحة بعد التصدير الناجح بس", () => {
  it("التلات دوال بتستخدم allSettled مش all — الفاشل يفضل مكانه", () => {
    for (const fn of ["exportManualDraft", "exportAllHitsToField", "exportAllPttToField"]) {
      const b = body(fn);
      expect(b, fn).toContain("Promise.allSettled");
      expect(b, fn).not.toContain("await Promise.all(toSave");
    }
  });
});

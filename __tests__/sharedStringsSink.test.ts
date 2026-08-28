/**
 * جدول النصوص المشترك (sharedStrings) كان بيتحمّل **نصّه كامل** في الذاكرة قبل
 * ما يتحوّل لمصفوفة. على ملف مندوب حقيقي (٧٧٩ ألف صف، ٤٦٢ ألف نص مشترك) ده
 * وحده كلّف **+١٢١ ميجا** — والصفحة على الآيفون بتموت **قبل قراءة صف واحد**
 * (ولذلك الكراش عند صفر بالمية بالظبط).
 *
 * الحل: نقراه على دفعات ونبني المصفوفة على الطاير، فالنص الكامل عمره ما يتجمّع.
 *
 * الخطر الوحيد في القراءة على دفعات: **حدود الدفع** ممكن تقع في نص وسم أو
 * وسط كلمة عربية. الاختبارات دي بتثبت إن النتيجة واحدة مهما اتقطع النص.
 */
import { describe, it, expect } from "vitest";
import { createSharedStringsSink } from "@/lib/xlsxStream";

const XML =
  '<?xml version="1.0"?><sst xmlns="x"><si><t>ابح1234</t></si>' +
  '<si><t>النسيم</t></si><si><r><t>جزء</t></r><r><t>-تاني</t></r></si>' +
  '<si><t xml:space="preserve"> مسافة </t></si><si><t></t></si></sst>';
const EXPECTED = ["ابح1234", "النسيم", "جزء-تاني", " مسافة ", ""];

function run(chunks: string[]): string[] {
  const sink = createSharedStringsSink();
  for (const c of chunks) sink.write(c);
  return sink.end();
}

describe("createSharedStringsSink", () => {
  it("دفعة واحدة = نفس نتيجة القراءة الكاملة", () => {
    expect(run([XML])).toEqual(EXPECTED);
  });

  it("**القطع عند كل موضع ممكن بيدّي نفس النتيجة**", () => {
    // الاختبار الحاسم: حدود الدفع بتقع في نص الوسوم والنص العربي.
    for (let i = 1; i < XML.length; i++) {
      expect(run([XML.slice(0, i), XML.slice(i)]), `قطع عند ${i}`).toEqual(EXPECTED);
    }
  });

  it("دفعات صغيرة جداً (حرف بحرف)", () => {
    expect(run(XML.split(""))).toEqual(EXPECTED);
  });

  it("rich text: بيجمع كل أجزاء <t> في نص واحد", () => {
    expect(run([XML])[2]).toBe("جزء-تاني");
  });

  it("بيفكّ ترميز _xHHHH_ زي القارئ العادي", () => {
    const x = '<sst><si><t>ابح1234_x000D_</t></si></sst>';
    expect(run([x])[0]).toBe("ابح1234\r");
  });

  it("مدخل فاضي", () => {
    expect(run([])).toEqual([]);
    expect(run(["<sst></sst>"])).toEqual([]);
  });
});

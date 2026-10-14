import { describe, it, expect } from "vitest";
import { ocrFailureHint } from "@/lib/ocrHint";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔎 «خطأ OCR: HTTP 200» مكانتش بتقول حاجة
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (١٤ أكتوبر ٢٠٢٦): مندوب آيفون صوّر رقم الشاص، الرقم باين في
 *  الصورة (`RKLB20DE1R4001532`)، والبرنامج كتب «خطأ OCR: HTTP 200» وبس.
 *
 *  و«HTTP 200» معناها السيرفر ردّ **تمام** — يعني المشكلة في رد الموديل مش في
 *  الشبكة. الرسالة كانت بتخفي ده وتبان كأنها عطل اتصال.
 */
describe("🔎 رسالة فشل القراية", () => {
  it("🔴 ٢٠٠ ومفيش رد من الموديل ⇒ بتقول الحقيقة مش «HTTP 200»", () => {
    const m = ocrFailureHint({ chassis: null }, 200);
    expect(m).not.toContain("HTTP 200");
    expect(m).toContain("الصورة");
  });

  it("🔴 الموديل قال NONE ⇒ رسالة مفهومة للمندوب", () => {
    expect(ocrFailureHint({ chassis: null, raw: "NONE" }, 200)).toContain("مالقاش رقم");
  });

  it("الموديل قال كلام ⇒ بنعرض كلامه زي ما هو (ده اللي بيشخّص)", () => {
    expect(ocrFailureHint({ chassis: null, raw: "I cannot read this" }, 200))
      .toBe("الموديل قال: I cannot read this");
  });

  it("السيرفر بعت سبب ⇒ السبب يكسب", () => {
    expect(ocrFailureHint({ hint: "مفتاح الصوت ناقص" }, 403)).toBe("خطأ OCR: مفتاح الصوت ناقص");
    expect(ocrFailureHint({ error: "vision_model_gone" }, 500)).toContain("vision_model_gone");
  });

  it("عطل شبكة حقيقي ⇒ الكود زي ما هو", () => {
    expect(ocrFailureHint(null, 502)).toBe("خطأ OCR: HTTP 502");
  });

  it("الرسالة مابتطولش على الشاشة", () => {
    expect(ocrFailureHint({ raw: "x".repeat(400) }, 200).length).toBeLessThanOrEqual(140);
  });
});

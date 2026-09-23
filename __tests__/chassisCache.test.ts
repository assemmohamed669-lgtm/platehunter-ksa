import { describe, it, expect, beforeEach } from "vitest";
import { checkFingerprint, getCachedChassis, setCachedChassis, clearChassisCache } from "../lib/chassisCache";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «التنقل بين الصفحات بقى تقيل» — خريطة الشاص بتتحسب مرة لكل ملف
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «التنقل بين الصفحات عايزها سلسة… بعد ما ضيفنا
 *  صفحة الجديد بقت تقيلة شوي».
 *
 *  🔴 كل مرة «الجديد» كانت بتفتح — **أو الموبايل يصحى من القفل** — كانت
 *  بتعمل `readAllSheets` على ملف التشييك **كله** (٤٩ ألف لوحة) عشان تدوّر
 *  على عمود الشاص في الورقات التانية. تحليل إكسل كامل، ثواني على الموبايل.
 *  والنتيجة **نفسها بالظبط** طول ما الملف ماتغيّرش.
 *
 *  ⚠️ **البصمة من غير تاريخ** — متسجّل من صفحة الفرز: الملف بيتحفظ تاني
 *     بـ`uploadedAt` جديد وهو نفس المحتوى، فبصمة بالتاريخ كانت بتضيّع الحفظ.
 */
describe("checkFingerprint", () => {
  const rec = (over: Record<string, unknown> = {}) => ({
    fileName: "تشييك.xlsx", fileBlob: { size: 5_000_000 }, rows: new Array(49165),
    uploadedAt: "2026-09-23T10:00:00Z", ...over,
  });

  it("نفس الملف ⇒ نفس البصمة", () => {
    expect(checkFingerprint(rec())).toBe(checkFingerprint(rec()));
  });

  it("🔴 **التاريخ لوحده اتغيّر ⇒ نفس البصمة** (اتحفظ تاني بنفس المحتوى)", () => {
    expect(checkFingerprint(rec({ uploadedAt: "2026-09-24T09:00:00Z" })))
      .toBe(checkFingerprint(rec()));
  });

  it("ملف تاني ⇒ بصمة تانية", () => {
    expect(checkFingerprint(rec({ fileName: "تاني.xlsx" }))).not.toBe(checkFingerprint(rec()));
    expect(checkFingerprint(rec({ fileBlob: { size: 5_000_001 } }))).not.toBe(checkFingerprint(rec()));
    expect(checkFingerprint(rec({ rows: new Array(100) }))).not.toBe(checkFingerprint(rec()));
  });

  it("مافيش ملف ⇒ `null` (مافيش حاجة تتحفظ)", () => {
    expect(checkFingerprint(null)).toBeNull();
  });
});

describe("كاش خريطة الشاص", () => {
  beforeEach(() => clearChassisCache());

  it("اللي اتحفظ بيرجع بنفس البصمة", () => {
    const m = new Map([["ابح1234", "VIN1"]]);
    setCachedChassis("fp-A", m);
    expect(getCachedChassis("fp-A")).toBe(m);
  });

  it("🔴 بصمة تانية ⇒ `null` — الملف اتغيّر فلازم يتحسب تاني", () => {
    setCachedChassis("fp-A", new Map());
    expect(getCachedChassis("fp-B")).toBeNull();
  });

  it("⚠️ **نسخة واحدة بس** — عشان الذاكرة (الآيفون بيقتل التطبيق)", () => {
    setCachedChassis("fp-A", new Map([["a", "1"]]));
    setCachedChassis("fp-B", new Map([["b", "2"]]));
    expect(getCachedChassis("fp-A")).toBeNull();
    expect(getCachedChassis("fp-B")?.get("b")).toBe("2");
  });

  it("بصمة `null` ⇒ مابيتحفظش ومابيرجعش", () => {
    setCachedChassis(null, new Map([["a", "1"]]));
    expect(getCachedChassis(null)).toBeNull();
  });
});

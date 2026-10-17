import { describe, expect, it } from "vitest";
import { BATCH_ENGINES, batchEngineLabel, type BatchEngine } from "./batchEngine";

/**
 * الاختبار ده جاي من **غلطة حقيقية** في تقرير المالك (١٠ سبتمبر):
 *
 *   «عدد اللوحات اللي طلعت: 10 · المحرك: Whisper»
 *
 * والمحرك اللي شغّال فعلاً كان **«المقاطع»**. السبب: سلسلة `? :` في
 * `BatchPage` كانت بتغطّي `scan`/`vad`/`fused` وبعدين `: "Whisper"` —
 * فـ`seg` و`chunks` الاتنين كانوا بيقعوا على اسم محرك مااشتغلش.
 *
 * تقرير بيسمّي محرك غلط أخطر من تقرير مافيهوش اسم: كل تشخيص مبني عليه
 * بيبقى على محرك تاني خالص. فالاسم بقى دالة نقية **مع حارس شمول**.
 */
describe("batchEngineLabel", () => {
  it("🔴 المقاطع مابترجعش «Whisper» — الغلطة الأصلية", () => {
    const label = batchEngineLabel("seg", "seg-v3-3000");
    expect(label).not.toBe("Whisper");
    expect(label).toContain("المقاطع");
  });

  it("🔴 «كامل ⚡» مابترجعش «Whisper» كمان", () => {
    const label = batchEngineLabel("chunks", "seg-v3-3000");
    expect(label).not.toBe("Whisper");
    expect(label).toContain("كامل");
  });

  it("مافيش محرك بيستعير اسم محرك تاني", () => {
    const labels = BATCH_ENGINES.map((e) => batchEngineLabel(e, "m"));
    expect(new Set(labels).size).toBe(BATCH_ENGINES.length);
    // «Whisper» لوحده اسم محرك OpenAI بس
    const whisperish = BATCH_ENGINES.filter((e) =>
      /^Whisper/.test(batchEngineLabel(e, "m"))
    );
    expect(whisperish).toEqual(["openai"]);
  });

  it("كل محرك له اسم عربي مقروء غير فاضي", () => {
    for (const e of BATCH_ENGINES) {
      const label = batchEngineLabel(e, "seg-v3-3000");
      expect(label.trim().length).toBeGreaterThan(3);
      expect(label).not.toBe(e); // مش رجّع المفتاح البرمجي
    }
  });

  it("اسم الموديل بيدخل في المحركات اللي بتستخدمه", () => {
    expect(batchEngineLabel("seg", "seg-v3-3000")).toContain("seg-v3-3000");
    expect(batchEngineLabel("chunks", "seg-v3-3000")).toContain("seg-v3-3000");
    expect(batchEngineLabel("scan", "seg-v3-3000")).toContain("seg-v3-3000");
  });

  it("🔴 علامة نيابة مش اسم موديل — «— ؟» طلعت في تقرير المالك", () => {
    for (const ph of ["?", "؟", "—", "-", "...", "N/A", "null", "undefined", "  ؟  "]) {
      const label = batchEngineLabel("chunks", ph);
      expect(label).not.toContain("—");
      expect(label).not.toContain(ph.trim());
    }
  });

  it("اسم موديل فاضي مايسيبش شرطة معلّقة", () => {
    for (const e of BATCH_ENGINES) {
      const label = batchEngineLabel(e, "");
      expect(label).not.toMatch(/—\s*$/);
      expect(label).not.toMatch(/—\s*\)/);
      expect(label).not.toMatch(/\s{2,}/);
    }
  });

  it("محرك مش في القائمة بيرجع نفسه مش اسم محرك تاني", () => {
    const label = batchEngineLabel("gibberish" as BatchEngine, "m");
    expect(label).not.toMatch(/Whisper|المقاطع|كامل/);
  });

  it("القائمة فيها الستة بلا تكرار", () => {
    expect(new Set(BATCH_ENGINES).size).toBe(6);
    expect(BATCH_ENGINES).toContain("chunks");
    expect(BATCH_ENGINES).toContain("seg");
  });
});

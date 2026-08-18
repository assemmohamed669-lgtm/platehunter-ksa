import { describe, it, expect, vi } from "vitest";
import { runBatchTranscription } from "@/lib/batchTranscript";

/**
 * خط التفريغ الكامل: صوت → مقاطع بتوقيتاتها → لوحات → (اختياري) قراءة تانية
 * بالموديل المدرّب → النتيجة.
 *
 * الاعتماديات بتتحقن، فالاختبار بيغطّي **القرارات** من غير شبكة: إيه اللي
 * بيحصل لما الموديل مقفول، ولما يرفض، ولما التفريغ نفسه يفشل.
 */
const seg = (text: string, start: number, end: number) => ({ text, start, end });
const engine = vi.fn(async () => [seg("الف باء حاء واحد اتنين تلاتة اربعة", 0, 3)]);

describe("خط التفريغ الكامل", () => {
  it("من غير موديل → لوحات المحرك زي ما هي", async () => {
    const out = await runBatchTranscription(new Blob(["x"]), { transcribe: engine, modelBase: null });
    expect(out.plates).toHaveLength(1);
    expect(out.plates[0].normalized).toBe("ابح1234");
    expect(out.usedModel).toBe(false);
  });

  it("مع موديل متفق → مؤكدة", async () => {
    const readSlice = vi.fn(async () => ({ normalized: "ابح1234", accepted: true }));
    const out = await runBatchTranscription(new Blob(["x"]), {
      transcribe: engine, modelBase: "https://m.example.com", token: "t", readSlice,
    });
    expect(out.plates[0].source).toBe("agreed");
    expect(out.usedModel).toBe(true);
    expect(readSlice).toHaveBeenCalledTimes(1);
  });

  it("الموديل واقع → بنكمّل بالمحرك، مافيش انهيار", async () => {
    const readSlice = vi.fn(async () => { throw new Error("network"); });
    const out = await runBatchTranscription(new Blob(["x"]), {
      transcribe: engine, modelBase: "https://m.example.com", token: "t", readSlice,
    });
    expect(out.plates).toHaveLength(1);
    expect(out.plates[0].source).toBe("engine");
    expect(out.plates[0].needsReview).toBe(false);   // مش ذنب المندوب
  });

  it("التفريغ نفسه فشل → خطأ واضح ومافيش لوحات مخترعة", async () => {
    const bad = vi.fn(async () => { throw new Error("انقطع الاتصال"); });
    await expect(runBatchTranscription(new Blob(["x"]), { transcribe: bad, modelBase: null }))
      .rejects.toThrow(/انقطع/);
  });

  it("تسجيل مافيهوش لوحات → ليستة فاضية بدون خطأ", async () => {
    const quiet = vi.fn(async () => [seg("خلاص يا معلم", 0, 2)]);
    const out = await runBatchTranscription(new Blob(["x"]), { transcribe: quiet, modelBase: null });
    expect(out.plates).toEqual([]);
  });

  it("بيبلّغ التقدّم عشان المندوب يشوف إنه شغال", async () => {
    const steps: string[] = [];
    await runBatchTranscription(new Blob(["x"]), {
      transcribe: engine, modelBase: null, onProgress: (s) => steps.push(s.phase),
    });
    expect(steps).toContain("transcribing");
    expect(steps).toContain("done");
  });
});

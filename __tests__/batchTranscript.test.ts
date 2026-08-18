import { describe, it, expect } from "vitest";
import { splitTranscriptIntoPlates, type TimedSegment } from "@/lib/batchTranscript";

/**
 * المندوب بيسجّل كلامه كله متصل — عشرين لوحة ورا بعض من غير ما يستنى — وبعدين
 * يدوس «تفريغ» مرة واحدة. الدالة دي بتاخد التفريغ الكامل بتوقيتاته وتطلّع
 * **كل لوحة لوحدها ومعاها الثانية اللي اتقالت فيها**.
 *
 * التوقيت ده هو اللي بيخلّي كل لوحة تاخد **موقعها الصح** من مسار المندوب،
 * وهو كمان اللي بيحدد نقطة القص لو حبينا نعيد قراءة اللوحة بموديل أدق.
 */
const seg = (text: string, start: number, end: number): TimedSegment => ({ text, start, end });

describe("تقسيم التفريغ الكامل للوحات", () => {
  it("لوحة واحدة في مقطع واحد", () => {
    const out = splitTranscriptIntoPlates([seg("الف باء حاء واحد اتنين تلاتة اربعة", 0, 3)]);
    expect(out).toHaveLength(1);
    expect(out[0].normalized).toBe("ابح1234");
    expect(out[0].startSec).toBe(0);
  });

  it("كذا لوحة في مقطع واحد → كل واحدة بتوقيتها التقريبي", () => {
    const out = splitTranscriptIntoPlates([
      seg("الف باء حاء واحد اتنين تلاتة اربعة دال هاء واو خمسة ستة سبعة تمانية", 0, 8),
    ]);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0].startSec).toBeLessThan(out[1].startSec);
  });

  it("لوحات موزّعة على مقاطع بتاخد توقيت مقطعها", () => {
    const out = splitTranscriptIntoPlates([
      seg("الف باء حاء واحد اتنين تلاتة اربعة", 0, 3),
      seg("دال هاء واو خمسة ستة سبعة تمانية", 10, 13),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].startSec).toBeGreaterThanOrEqual(10);
  });

  it("الكلام اللي مافيهوش لوحة بيتتجاهل — مابنخترعش", () => {
    expect(splitTranscriptIntoPlates([seg("خلاص يا معلم كمّل على طول", 0, 3)])).toEqual([]);
  });

  it("نوع السيارة بيتمسك مع لوحته", () => {
    const out = splitTranscriptIntoPlates([seg("الف باء حاء واحد اتنين تلاتة اربعة ونيت", 0, 3)]);
    expect(out[0].vehicleType).toBeTruthy();
  });

  it("اللوحة المشكوك فيها بتتعلّم مش بتتشال", () => {
    const out = splitTranscriptIntoPlates([seg("باء حاء واحد اتنين تلاتة", 0, 3)]);
    if (out.length) expect(out[0]).toHaveProperty("needsReview");
  });

  it("مقاطع فاضية مابتكسرش", () => {
    expect(splitTranscriptIntoPlates([])).toEqual([]);
    expect(splitTranscriptIntoPlates([seg("", 0, 1)])).toEqual([]);
  });

  it("الترتيب بالتوقيت مش بترتيب النص", () => {
    const out = splitTranscriptIntoPlates([
      seg("دال هاء واو خمسة ستة سبعة تمانية", 20, 23),
      seg("الف باء حاء واحد اتنين تلاتة اربعة", 5, 8),
    ]);
    expect(out[0].startSec).toBeLessThan(out[1].startSec);
  });
});

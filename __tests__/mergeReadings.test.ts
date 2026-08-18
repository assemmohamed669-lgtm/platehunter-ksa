import { describe, it, expect } from "vitest";
import { mergePlateReadings, type ModelReading } from "@/lib/batchTranscript";

/**
 * التفريغ بيمشي على مرحلتين: محرك عام بيسمع التسجيل كله ويدّي توقيت كل لوحة،
 * وبعدين **موديلنا المدرّب** بيعيد قراءة كل لوحة من مقطعها بدقة.
 *
 * الدالة دي بتقرر النتيجة النهائية. القاعدة اللي اتعلمناها من المنافس:
 * **اللي مش متأكدين منه يتعلّم، مايتخترعش.** لوحة مخترعة شكلها سليم أخطر
 * من لوحة مكتوب عليها «راجعها».
 */
const base = { plate: "ا ب ح 1234", normalized: "ابح1234", notes: "", startSec: 3, needsReview: false };
const m = (o: Partial<ModelReading> = {}): ModelReading =>
  ({ normalized: "ابح1234", accepted: true, meanLogprob: -0.2, ...o });

describe("دمج قراءة المحرك مع قراءة الموديل", () => {
  it("اتفقوا → مؤكدة", () => {
    const [r] = mergePlateReadings([base], [m()]);
    expect(r.normalized).toBe("ابح1234");
    expect(r.needsReview).toBe(false);
    expect(r.source).toBe("agreed");
  });

  it("اختلفوا والموديل واثق → بتاع الموديل، بس متعلّمة للمراجعة", () => {
    const [r] = mergePlateReadings([base], [m({ normalized: "ابح1284" })]);
    expect(r.normalized).toBe("ابح1284");
    expect(r.needsReview).toBe(true);
    expect(r.source).toBe("model");
  });

  it("الموديل رفض → بتاع المحرك، متعلّمة", () => {
    const [r] = mergePlateReadings([base], [m({ accepted: false, normalized: "" })]);
    expect(r.normalized).toBe("ابح1234");
    expect(r.needsReview).toBe(true);
    expect(r.source).toBe("engine");
  });

  it("الموديل مارَدّش (السيرفر مقفول) → بتاع المحرك زي ما هو", () => {
    const [r] = mergePlateReadings([base], [null]);
    expect(r.normalized).toBe("ابح1234");
    expect(r.source).toBe("engine");
  });

  it("الموديل قال لوحة شكلها غلط → بنرفضها ونمسك بتاع المحرك", () => {
    const [r] = mergePlateReadings([base], [m({ normalized: "اب12" })]);
    expect(r.normalized).toBe("ابح1234");
    expect(r.source).toBe("engine");
  });

  it("اللي كانت محتاجة مراجعة بتفضل محتاجة حتى لو اتفقوا", () => {
    const [r] = mergePlateReadings([{ ...base, needsReview: true }], [m()]);
    expect(r.needsReview).toBe(true);
  });

  it("التوقيت والنوع مابيضيعوش", () => {
    const [r] = mergePlateReadings([{ ...base, vehicleType: "ونيت" }], [m()]);
    expect(r.startSec).toBe(3);
    expect(r.vehicleType).toBe("ونيت");
  });

  it("قوايم مختلفة الطول مابتكسرش", () => {
    expect(mergePlateReadings([base, base], [m()])).toHaveLength(2);
    expect(mergePlateReadings([], [m()])).toEqual([]);
  });

  it("إحصائية سريعة للمندوب: كام مؤكدة وكام محتاجة مراجعة", () => {
    const out = mergePlateReadings(
      [base, { ...base, normalized: "دهو5678", startSec: 9 }],
      [m(), m({ normalized: "دهو5679" })],
    );
    expect(out.filter(x => x.needsReview)).toHaveLength(1);
  });
});

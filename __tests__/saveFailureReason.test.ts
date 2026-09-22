/**
 * لما التصدير يفشل، الرسالة لازم تقول **السبب الحقيقي**.
 *
 * الرسالة اللي المندوب شافها («تعذّر حفظ أي لوحة — كلها فضلت مكانها») كانت
 * بتترمي بعد `Promise.allSettled` و**أسباب الرفض بترمى معاها** — فالشاشة
 * بتقول إن فيه مشكلة من غير ما تقول إيه هي، ومحدش يقدر يشخّص من صورة الشاشة.
 */
import { describe, it, expect } from "vitest";
import { firstFailureReason, saveFailureMessage } from "@/lib/saveFailure";

const rej = (m: string) => ({ status: "rejected" as const, reason: new Error(m) });
const ok = { status: "fulfilled" as const, value: undefined };

describe("firstFailureReason", () => {
  it("بيطلّع نص أول رفض", () => {
    expect(firstFailureReason([ok, rej("QuotaExceededError")])).toBe("QuotaExceededError");
  });

  it("اسم الخطأ بيتحط لو مافيش نص", () => {
    const e = new Error(""); e.name = "DataError";
    expect(firstFailureReason([{ status: "rejected", reason: e }])).toBe("DataError");
  });

  it("رفض بقيمة مش Error", () => {
    expect(firstFailureReason([{ status: "rejected", reason: "مساحة ممتلئة" }])).toBe("مساحة ممتلئة");
  });

  it("رفض بـnull/undefined مابيكسرش", () => {
    expect(firstFailureReason([{ status: "rejected", reason: null }])).toBe("سبب غير معروف");
    expect(firstFailureReason([{ status: "rejected", reason: undefined }])).toBe("سبب غير معروف");
  });

  it("مافيش رفض = فاضي", () => {
    expect(firstFailureReason([ok, ok])).toBe("");
    expect(firstFailureReason([])).toBe("");
  });
});

describe("saveFailureMessage", () => {
  it("بتقول اللوحات فضلت مكانها **والسبب**", () => {
    const m = saveFailureMessage("QuotaExceededError");
    expect(m).toContain("فضلت مكانها");
    expect(m).toContain("QuotaExceededError");
  });

  it("بتطمّن المندوب إن شغله ماضاعش", () => {
    expect(saveFailureMessage("x")).toContain("متمسحتش");
  });

  it("بلا سبب معروف لسه بترجّع رسالة مفيدة", () => {
    const m = saveFailureMessage("");
    expect(m).toContain("فضلت مكانها");
    expect(m.length).toBeGreaterThan(20);
  });

  it("بتدّي المندوب طريق يكمّل بيه — مشاركة إكسيل مابتلمسش التخزين", () => {
    expect(saveFailureMessage("QuotaExceededError")).toContain("مشاركة إكسيل");
  });

  it("وبتطلب منه يبعت صورة الرسالة", () => {
    expect(saveFailureMessage("x")).toContain("صورة");
  });
});

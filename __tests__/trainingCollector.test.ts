import { describe, it, expect } from "vitest";
import { classifyForCollection, type CollectContext } from "@/lib/trainingCollector";

const base: CollectContext = {
  action: "exported",
  uncertain: false,
  validShape: true,
  listMatch: false,
  wordConfidenceOk: true,
};

describe("classifyForCollection — قرار جمع اللوحة للتدريب", () => {
  it("معدّلة → ذهبية (تُجمع دايماً لو شكلها صح)", () => {
    const d = classifyForCollection({ ...base, action: "edited", wordConfidenceOk: false, uncertain: true });
    expect(d.collect).toBe(true);
    expect(d.tier).toBe("gold");
  });

  it("ممسوحة → تُستبعد (إشارة غلط)", () => {
    expect(classifyForCollection({ ...base, action: "deleted" }).collect).toBe(false);
  });

  it("متجاهلة (مش مُصدَّرة) → تُستبعد", () => {
    expect(classifyForCollection({ ...base, action: "ignored" }).collect).toBe(false);
  });

  it("مُصدَّرة + ثقة كلمات عالية → تُجمع (موثوقة)", () => {
    const d = classifyForCollection({ ...base, action: "exported", wordConfidenceOk: true });
    expect(d.collect).toBe(true);
    expect(d.tier).toBe("trusted");
  });

  it("مُصدَّرة + طابقت قائمة → تُجمع", () => {
    const d = classifyForCollection({ ...base, action: "exported", wordConfidenceOk: false, listMatch: true });
    expect(d.collect).toBe(true);
  });

  it("مُصدَّرة بدون تعديل + ثقة واطية + مش مطابقة → تُجمع بوسم عادي (نفلتر offline)", () => {
    const d = classifyForCollection({ ...base, action: "exported", wordConfidenceOk: false, listMatch: false });
    expect(d.collect).toBe(true);
    expect(d.tier).toBe("trusted");
    expect(d.reason).toBe("export-weak");
  });

  it("مُصدَّرة + uncertain → تُستبعد", () => {
    expect(classifyForCollection({ ...base, action: "exported", uncertain: true }).collect).toBe(false);
  });

  it("شكل غلط → تُستبعد حتى لو معدّلة", () => {
    expect(classifyForCollection({ ...base, action: "edited", validShape: false }).collect).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { summarizeSkips } from "@/lib/skipLabels";

describe("summarizeSkips — عدّاد التخطّي يفضل مقروء على تليفون", () => {
  it("بيرجّع فاضي لو مافيش تخطّي", () => {
    expect(summarizeSkips({})).toEqual([]);
  });

  it("بيدّي اسم عربي مفهوم بدل الكود الإنجليزي", () => {
    const out = summarizeSkips({ utterance_too_long: 3 });
    expect(out).toHaveLength(1);
    expect(out[0].label).toContain("نطق طويل");
    expect(out[0].n).toBe(3);
  });

  it("🔴 بيلمّ المفاتيح اللي ليها ذيل رقمي — `empty_slice:<bytes>` بيولّد مفتاح جديد لكل حجم", () => {
    // من غير اللمّ ده العدّاد بيتحوّل لحيطة نص على شاشة المندوب.
    const out = summarizeSkips({
      "empty_slice:44": 1,
      "empty_slice:120": 1,
      "empty_slice:900": 2,
    });
    expect(out).toHaveLength(1);
    expect(out[0].n).toBe(4);
  });

  it("🔴 بس كود فشل الطلب بيفضل متفصّل — ٥٠٣ غير المهلة غير الشبكة", () => {
    // دي بالظبط التفرقة اللي بتحدّد الخطوة الجاية، فماينفعش تتلمّ.
    const out = summarizeSkips({
      "request_failed:http_503": 5,
      "request_failed:timeout": 2,
    });
    expect(out).toHaveLength(2);
    const labels = out.map((o) => o.label).join(" ");
    expect(labels).toContain("503");
    expect(labels).toContain("مهلة");
  });

  it("بيرتّب من الأكتر للأقل عشان أهم رقم يبان الأول", () => {
    const out = summarizeSkips({ busy_window: 2, utterance_too_long: 9, silence_gate: 5 });
    expect(out.map((o) => o.n)).toEqual([9, 5, 2]);
  });

  it("المفتاح المش معروف بيظهر زي ما هو بدل ما يتبلع", () => {
    const out = summarizeSkips({ something_new: 1 });
    expect(out[0].label).toBe("something_new");
    expect(out[0].n).toBe(1);
  });
});

/**
 * 🔴 جلسة المالك (٨ سبتمبر) — ١٠ لوحات اتقالت بسرعة.
 *
 * ٤ بطاقات كان مكتوب عليها «🟡 للمراجعة — قراءة مفردة»، و**٣ منهم غلط**
 * (حند٩١٣٣ بدل حند٩٠٠٣ · درر٩٢٩١ بدل درر٩٢٠٠ · حبك٥٢٧٤ بدل حبك٥٢٧٠).
 * وفوق التقرير كان مكتوب «مؤكّدة ١٠ · محتاجة نظرة ٠ · محتاجة مراجعة ٠».
 *
 * السبب: محرّك المقاطع لوحده مافيش عنده محرّك تاني يتفق معاه، فبيسيب
 * `stage` فاضية — و`stage === undefined` كانت بتترجم «مؤكّدة».
 */
import { describe, it, expect } from "vitest";
import { sessionTierCounts, tierCounts } from "../plateTable";
import type { PlateEntry } from "../plateEntry";

function card(plate: string, badge: string): PlateEntry {
  return {
    id: plate,
    review: { plate, notes: [badge], timeStart: 0 },
    match: { kind: "none" },
  } as unknown as PlateEntry;
}

describe("درجات الجلسة — الشارة اللي على البطاقة هي الحقيقة", () => {
  const session = [
    card("ربس6497", "🟢 مؤكّدة — إجماع 2 نافذتين"),
    card("حيد4197", "🟢 مؤكّدة — إجماع 2 نافذتين"),
    card("حند9133", "🟡 للمراجعة — قراءة مفردة/ثقة منخفضة"),
    card("حهه6816", "🟡 للمراجعة — قراءة مفردة/ثقة منخفضة"),
    card("درر9291", "🟡 للمراجعة — قراءة مفردة/ثقة منخفضة"),
    card("بسل8763", "🟢 مؤكّدة — إجماع 2 نافذتين"),
    card("حبك5274", "🟡 للمراجعة — قراءة مفردة/ثقة منخفضة"),
    card("ابس2985", "🟢 مؤكّدة — إجماع 2 نافذتين"),
    card("ررس8194", "🟢 مؤكّدة — إجماع 2 نافذتين"),
    card("دسر5210", "🟢 مؤكّدة — إجماع 2 نافذتين"),
  ];

  it("🔴 الملخّص القديم كان بيقول «مؤكّدة ١٠» والتلات غلطات جوّاه", () => {
    expect(tierCounts(session)).toEqual({ high: 10, check: 0, weak: 0 });
  });

  it("الملخّص الجديد بيقول ٦ مؤكّدة و٤ محتاجة نظرة", () => {
    expect(sessionTierCounts(session)).toEqual({ high: 6, check: 4, weak: 0 });
  });

  it("لو مافيش شارات خالص بيرجع لـstage زي الأول", () => {
    const noBadge = [
      { id: "a", review: { plate: "ابح1234", notes: [] }, stage: "agreed" },
      { id: "b", review: { plate: "ابح1235", notes: [] }, stage: "conflict" },
    ] as unknown as PlateEntry[];
    expect(sessionTierCounts(noBadge)).toEqual(tierCounts(noBadge));
  });

  it("بطاقة عليها الاتنين (اتعادت) تفضل «محتاجة نظرة»", () => {
    const both = [
      {
        id: "x",
        review: { plate: "ابح1234", notes: ["🟢 مؤكّدة — إجماع 2 نافذتين", "🟡 للمراجعة — قراءة مفردة"] },
      },
    ] as unknown as PlateEntry[];
    expect(sessionTierCounts(both)).toEqual({ high: 0, check: 1, weak: 0 });
  });
});

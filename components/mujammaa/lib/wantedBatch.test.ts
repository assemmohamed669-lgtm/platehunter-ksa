import { describe, expect, it } from "vitest";
import { carInfoRows, chassisOf, mergeWanted, newlyWanted, rematchEntries, wantedHeadline, wantedOf } from "./wantedBatch";
import type { PlateEntry } from "./plateEntry";

/**
 * 🚨 مربع «سيارات مطلوبة» بعد التفريغ (١٨ أكتوبر ٢٠٢٦) — المالك: «لو اتفرغ وطلع مطلوبه اكتر من لوحه
 * اولا يظهر في مربع وبصوت والمربع مكتوب فيه بيانات السيارة كامله ولو ليها شهادة … ويظهر كلمه فوق يوجد
 * مثلا ٣ سيارات مطلوبه ولما يسحب من اليمين لليسار او العكس يلاقي اللوحات التانيه بكل بياناتهم».
 */
const ROW = {
  "رقم اللوحة": "ب س ن 8921",
  "صانع المركبة": "تويوتا",
  "طراز المركبة": "هايلكس",
  "لون المركبة الأساسي": "أبيض",
  "سنة الصنع": "2019",
  "البنك": "الراجحي",
  "رقم الهيكل": "MR0FB8CD3K0123456",
  "ملاحظة": "",
};

const entry = (plate: string, kind: "exact" | "none", row?: Record<string, string>) =>
  ({ id: `e-${plate}`, review: { plate }, match: row ? { kind, row } : { kind }, pin: null, capturedAt: 1, source: "batch" }) as unknown as PlateEntry;

describe("wantedHeadline", () => {
  it("بالعربي حسب العدد", () => {
    expect(wantedHeadline(1)).toBe("يوجد سيارة مطلوبة");
    expect(wantedHeadline(2)).toBe("يوجد سيارتين مطلوبين");
    expect(wantedHeadline(3)).toBe("يوجد 3 سيارات مطلوبة");
    expect(wantedHeadline(10)).toBe("يوجد 10 سيارات مطلوبة");
    expect(wantedHeadline(11)).toBe("يوجد 11 سيارة مطلوبة");
  });
});

describe("carInfoRows — بيانات السيارة كاملة من ملف التشييك", () => {
  it("كل الأعمدة اللي فيها قيمة — من غير عمود اللوحة نفسه ولا الفاضي", () => {
    const rows = carInfoRows(ROW, "بسن8921");
    const keys = rows.map(([k]) => k);
    expect(keys).not.toContain("رقم اللوحة");
    expect(keys).not.toContain("ملاحظة");
    for (const k of ["صانع المركبة", "طراز المركبة", "لون المركبة الأساسي", "سنة الصنع", "البنك", "رقم الهيكل"]) {
      expect(keys).toContain(k);
    }
  });

  it("الأعمدة المهمة (الماركة/الطراز/اللون/السنة/البنك) الأول وبعدها الباقي بترتيب الملف", () => {
    const rows = carInfoRows({ "عمود غريب": "x", ...ROW }, "بسن8921");
    expect(rows[rows.length - 1][0]).toBe("رقم الهيكل");
    expect(rows.findIndex(([k]) => k === "عمود غريب")).toBeGreaterThan(rows.findIndex(([k]) => k === "البنك"));
  });

  it("مافيش صف ⇒ فاضي", () => {
    expect(carInfoRows(null, "x")).toEqual([]);
    expect(carInfoRows(undefined, "x")).toEqual([]);
  });
});

describe("chassisOf — للشهادة", () => {
  it("بالاسم أو بشكل الرقم", () => {
    expect(chassisOf(ROW)).toBe("MR0FB8CD3K0123456");
    expect(chassisOf({ "Col 7": "JTDBR32E720123456" })).toBe("JTDBR32E720123456");
    expect(chassisOf({ "البنك": "الراجحي" })).toBeNull();
    expect(chassisOf(null)).toBeNull();
  });
});

describe("wantedOf / mergeWanted", () => {
  it("المطلوبة بتطابق تام بس", () => {
    const list = [entry("ابح1234", "none"), entry("بسن8921", "exact", ROW), entry("حقل5830", "exact", {})];
    expect(wantedOf(list).map((e) => e.review.plate)).toEqual(["بسن8921", "حقل5830"]);
    expect(wantedOf(undefined as never)).toEqual([]);
  });

  it("مقطع تاني خلص والمربع مفتوح ⇒ بتتضاف من غير تكرار", () => {
    const a = [entry("بسن8921", "exact", ROW)];
    const b = [entry("بسن8921", "exact", ROW), entry("حقل5830", "exact", {})];
    expect(mergeWanted(a, b).map((e) => e.review.plate)).toEqual(["بسن8921", "حقل5830"]);
  });
});

describe("rematchEntries / newlyWanted — ملف التشييك اتغيّر", () => {
  /**
   * المالك (١٨ أكتوبر): «لو غير الملف بتاع التشييك من صفحه التشييك او من صفحه المجمع يظهر في باقي الصفحات
   * والبرنامج يعتمدة في كل حاجه» ⇒ اللوحات اللي في الجدول بتتقارن تاني بالملف الجديد.
   */
  // نفس الملف بيرجّع نفس الصف (الفهرس) — ملف جديد بيرجّع صفوف جديدة
  const rows: Record<string, Record<string, string>> = {};
  const sheetWith = (plates: string[]) => (p: string) =>
    plates.includes(p)
      ? ({ kind: "exact", row: (rows[p] ??= { البنك: "x" }), similarity: 100 } as never)
      : ({ kind: "none", similarity: 0 } as never);

  it("كل لوحة بتاخد حالتها من الملف الجديد — والمرجع نفسه لو مافيش تغيير", () => {
    const list = [entry("ابح1234", "none"), entry("بسن8921", "exact", ROW)];
    const a = rematchEntries(list, sheetWith(["ابح1234"]));
    expect(a.changed).toBe(true);
    expect(a.entries.map((e) => e.match.kind)).toEqual(["exact", "none"]);
    const b = rematchEntries(a.entries, sheetWith(["ابح1234"]));
    expect(b.changed).toBe(false);
    expect(b.entries).toBe(a.entries);
  });

  it("المطلوبة الجديدة بس (اللي ماكانتش مطلوبة قبل كده)", () => {
    const before = [entry("ابح1234", "none"), entry("بسن8921", "exact", ROW)];
    const after = rematchEntries(before, sheetWith(["ابح1234", "بسن8921"])).entries;
    expect(newlyWanted(before, after).map((e) => e.review.plate)).toEqual(["ابح1234"]);
  });
});

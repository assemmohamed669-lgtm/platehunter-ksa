import { describe, it, expect } from "vitest";
import { buildTableFromAoa } from "@/lib/excel";
import { splitSideBySideTables, baseHeaderName } from "@/lib/sideBySideTables";
import { detectArabicPlateColumnByContent, collectReferralEntries } from "@/lib/plateParser";

/**
 * محفظة شركة بتيجي **كذا جدول جنب بعض في نفس الورقة** (الخرج / الرياض /
 * الشرقية)، كل جدول بنفس الرؤوس. البرنامج كان بيقرا عمود لوحة واحد فبيفرز على
 * جدول واحد بس — والباقي بيضيع في صمت.
 */
const HDR = ["م", "القرار", "النوع", "رقم", "الاسم", "رقم الهيكل"];
const AOA: (string | null)[][] = [
  ["تحديث سيارات الخرج", null, null, null, null, null, null,
   "تحديث سيارات الرياض", null, null, null, null, null, null,
   "تحديث سيارات الشرقية", null, null, null, null, null],
  [...HDR, null, ...HDR, null, ...HDR],
  ["1", "تم التبليغ", "اكسنت", "ر ل ص - 4665", "هتلان الدوسري", "MALGT41D6RM076341", null,
   "1", "موجود", "النترا", "ر ا ق 5083", "عبدالعزيز السمحان", "KMHLN41E4NU253267", null,
   "1", "تم التبليغ", "كيا", "ر ع ر - 3639", "جابر محمد", "LJD0AA295P0241852"],
  ["2", "تم التبليغ", "يارس", "س س ب - 9875", "مفرح السبيعي", "MALGT41DXTM210419", null,
   "2", "تم التبليغ", "RAV4", "س ح د -6547", "بندر الفقيه", "JTMB43FV9SD085918", null,
   "2", "تم التبليغ", "توسان", "ر س ن - 3811", "فهيد الشمري", "TMAJB81B9PJ287005"],
  [null, null, null, null, null, null, null,
   "3", "تم التبليغ", "يارس", "ر ي ي 7873", "مد نظام", "MR2BE9B32T0119445", null,
   null, null, null, null, null, null],
];

const hasPlates = (h: string[], r: Record<string, string>[]) =>
  detectArabicPlateColumnByContent(h, r) !== null;

describe("جداول متجاورة في نفس الورقة", () => {
  it("أسماء الأعمدة المكرّرة مابتمسحش بعضها", () => {
    const t = buildTableFromAoa(AOA, "ورقة1", ["ورقة1"]);
    expect(new Set(t.headers).size).toBe(t.headers.length);   // كلها فريدة
    expect(t.headers.filter((h) => baseHeaderName(h) === "رقم")).toHaveLength(3);
  });

  it("بتتقسّم لثلاث جداول وكل لوحة بصفّها", () => {
    const t = buildTableFromAoa(AOA, "ورقة1", ["ورقة1"]);
    const blocks = splitSideBySideTables(t.headers, t.rows, hasPlates);
    expect(blocks).not.toBeNull();
    expect(blocks!).toHaveLength(3);
    expect(blocks![0].headers).toEqual(HDR);       // الأسماء ترجع بلا لاحقة
    expect(blocks!.map((b) => b.rows.length)).toEqual([2, 3, 2]);
  });

  it("كل اللوحات بتتفرز — مش جدول واحد بس", () => {
    const t = buildTableFromAoa(AOA, "ورقة1", ["ورقة1"]);
    const blocks = splitSideBySideTables(t.headers, t.rows, hasPlates)!;
    const entries = collectReferralEntries(
      blocks.map((b) => ({ rows: b.rows, plateCol: "رقم", isArabic: true }))
    );
    expect(entries).toHaveLength(7);                       // ٢ + ٣ + ٢
    const e = entries.find((x) => x.norm === "راق5083")!;   // لوحة من الجدول التاني
    expect(e.row["الاسم"]).toBe("عبدالعزيز السمحان");       // ببياناتها هي
    expect(e.row["النوع"]).toBe("النترا");
  });

  it("صف بيكرّر الرؤوس وسط الجدول مابيتحسبش داتا", () => {
    const aoa = [...AOA, [null, null, null, null, null, null, null, ...HDR, null, null, null, null, null, null, null]];
    const t = buildTableFromAoa(aoa, "ورقة1", ["ورقة1"]);
    const blocks = splitSideBySideTables(t.headers, t.rows, hasPlates)!;
    expect(blocks[1].rows).toHaveLength(3);   // مش 4 — صف الرؤوس المكرّر اتشال
  });

  it("الورقة العادية (جدول واحد) مابتتقسّمش", () => {
    const single = buildTableFromAoa(
      [HDR, ["1", "تم التبليغ", "يارس", "ر س س - 2810", "عبدالعزيز", "MR2BE9B37P0029004"]],
      "ورقة1", ["ورقة1"]);
    expect(splitSideBySideTables(single.headers, single.rows, hasPlates)).toBeNull();
  });
});

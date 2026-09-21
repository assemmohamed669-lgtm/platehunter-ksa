/**
 * **قرار صارم من المالك (2026-09-21): البرنامج مايفرزش على ورقة مخفية أبداً —
 * الصفحة الأساسية بس.**
 *
 * الحالة اللي فجّرت ده: «محفظة التيسير المؤتمن الاول» فيها ٣ ورقات —
 *   Sheet1 (مخفية، ١٣٩١ صف) · المؤتمن الاول (ظاهرة، ٣٨٦) · Sheet2 (مخفية، ٢٢)
 * والمخفية هي **أول ورقة**، فأي قارئ بياخد «أول ورقة» بياخد الغلط.
 *
 * المشكلة دي اتصلّحت قبل كده ورجعت — لأن القرّاء أربعة والإصلاح وصل لتلاتة.
 * الاختبار ده بيمسك القاعدة نفسها، مش مكان واحد.
 */
import { describe, it, expect } from "vitest";
import { visibleSheets } from "@/lib/referralSheets";

type S = { name: string; hidden?: boolean; aoa: unknown[][] };
const sheet = (name: string, hidden: boolean, rows: number): S =>
  ({ name, hidden, aoa: Array.from({ length: rows }, (_, i) => [`ا ب ح ${1000 + i}`]) });

/** نفس ملف المالك بالظبط. */
const WALLET: S[] = [
  sheet("Sheet1", true, 1391),
  sheet("المؤتمن الاول", false, 386),
  sheet("Sheet2", true, 22),
];

describe("visibleSheets", () => {
  it("محفظة المالك → الورقة الظاهرة بس", () => {
    expect(visibleSheets(WALLET).map((s) => s.name)).toEqual(["المؤتمن الاول"]);
  });

  it("المخفية الأكبر مابتغلبش الظاهرة الأصغر", () => {
    const out = visibleSheets(WALLET);
    expect(out).toHaveLength(1);
    expect(out[0].aoa.length).toBe(386);
  });

  it("المخفية اللي **أول** الملف مابتتاخدش", () => {
    expect(visibleSheets(WALLET)[0].name).not.toBe("Sheet1");
  });

  it("كل الورقات ظاهرة → مفيش حاجة بتتشال", () => {
    const all = [sheet("أ", false, 3), sheet("ب", false, 4)];
    expect(visibleSheets(all)).toHaveLength(2);
  });

  it("**صمام أمان**: كل الورقات مخفية → نرجّعها كلها بدل ما نرفض الملف", () => {
    const all = [sheet("أ", true, 3), sheet("ب", true, 4)];
    expect(visibleSheets(all)).toHaveLength(2);
  });

  it("علم الإخفاء ناقص (undefined) = ظاهرة", () => {
    expect(visibleSheets<S>([{ name: "أ", aoa: [[1]] }])).toHaveLength(1);
  });

  it("قايمة فاضية", () => {
    expect(visibleSheets([])).toEqual([]);
  });

  it("الورقة الظاهرة الفاضية بتفضل (الفلترة على الإخفاء بس)", () => {
    const out = visibleSheets([sheet("مخفية", true, 5), { name: "ظاهرة فاضية", hidden: false, aoa: [] }]);
    expect(out.map((s) => s.name)).toEqual(["ظاهرة فاضية"]);
  });
});

import { describe, it, expect } from "vitest";
import { resolveResultColumns, resolveMergedResultColumns, joinDupValues } from "@/lib/resultColumns";

/**
 * محافظ بتيجي فيها **نفس اسم العمود مرتين** بمعنيين مختلفين. مثال حقيقي
 * (محفظة التيسير): «نوع المركبة» الأولى = الماركة (تويوتا/مان) والتانية =
 * الطراز (لاندكروزر/رأس). قارئ الإكسل بيسمّي التانية «نوع المركبة_1».
 *
 * قبل كده كان البرنامج بياخد الأولى ويرمي التانية، فالمندوب يشوف «تويوتا»
 * من غير «لاندكروزر». المطلوب: يدمج الاتنين في عمود واحد.
 */
const HEADERS = ["PLATE_NO", "نوع المركبة", "نوع المركبة_1", "الموديل", "اللون"];
const ROWS = [
  { "PLATE_NO": "ب ط م 3191", "نوع المركبة": "مان", "نوع المركبة_1": "رأس", "الموديل": "2020", "اللون": "ابيض" },
  { "PLATE_NO": "ر ل د 6202", "نوع المركبة": "تويوتا", "نوع المركبة_1": "لاندكروزر", "الموديل": "2024", "اللون": "ابيض" },
  { "PLATE_NO": "ر ل د 6203", "نوع المركبة": "نيسان", "نوع المركبة_1": "باترول", "الموديل": "2022", "اللون": "اسود" },
];

describe("أعمدة مكررة الاسم — تتدمج في عمود واحد", () => {
  it("العمود المكرر بيتسجّل كأعمدة إضافية للهدف", () => {
    const cols = resolveResultColumns(HEADERS, ROWS, "PLATE_NO");
    const type = cols.find((c) => c.key === "type");
    expect(type).toBeTruthy();
    expect(type!.sourceCol).toBe("نوع المركبة");
    expect(type!.dupCols).toEqual(["نوع المركبة_1"]);
  });

  it("joinDupValues بتدمج القيمتين بمسافة", () => {
    expect(joinDupValues(ROWS[1], { sourceCol: "نوع المركبة", dupCols: ["نوع المركبة_1"] }))
      .toBe("تويوتا لاندكروزر");
    expect(joinDupValues(ROWS[0], { sourceCol: "نوع المركبة", dupCols: ["نوع المركبة_1"] }))
      .toBe("مان رأس");
  });

  it("القيمة الفاضية مابتسيبش مسافة زيادة", () => {
    const row = { "نوع المركبة": "تويوتا", "نوع المركبة_1": "" };
    expect(joinDupValues(row, { sourceCol: "نوع المركبة", dupCols: ["نوع المركبة_1"] })).toBe("تويوتا");
    const row2 = { "نوع المركبة": "", "نوع المركبة_1": "لاندكروزر" };
    expect(joinDupValues(row2, { sourceCol: "نوع المركبة", dupCols: ["نوع المركبة_1"] })).toBe("لاندكروزر");
  });

  it("القيمة المتكررة مابتتكتبش مرتين", () => {
    const row = { "نوع المركبة": "تويوتا", "نوع المركبة_1": "تويوتا" };
    expect(joinDupValues(row, { sourceCol: "نوع المركبة", dupCols: ["نوع المركبة_1"] })).toBe("تويوتا");
  });

  it("عمود بلا مكرر بيرجّع قيمته زي ما هي", () => {
    expect(joinDupValues(ROWS[1], { sourceCol: "اللون" })).toBe("ابيض");
  });

  it("الأعمدة المكررة مابتتصرفش لأهداف تانية", () => {
    // «نوع المركبة_1» فيها أسماء موديلات — ماينفعش تتسرق لهدف «الماركة»
    const cols = resolveResultColumns(HEADERS, ROWS, "PLATE_NO");
    const brand = cols.find((c) => c.key === "brand");
    expect(brand?.sourceCol).not.toBe("نوع المركبة_1");
  });

  it("بيشتغل في الدمج عبر المصادر كمان", () => {
    const merged = resolveMergedResultColumns([
      { kind: "referral", headers: HEADERS, rows: ROWS, plateCol: "PLATE_NO" },
    ]);
    const type = merged.find((c) => c.key === "type");
    expect(type?.dupCols).toEqual(["نوع المركبة_1"]);
  });

  it("الاسم المكرر حرفياً (بلا لاحقة) بيتدمج برضه", () => {
    const h = ["لوحة", "الملاحظات", "الملاحظات"];
    const r = [{ "لوحة": "ابح1234", "الملاحظات": "أ", "الملاحظات_1": "ب" }];
    // مافيش هدف اسمه ملاحظات — بنتأكد بس إن الدالة مابتكسرش
    expect(() => resolveResultColumns(h, r, "لوحة")).not.toThrow();
  });
});

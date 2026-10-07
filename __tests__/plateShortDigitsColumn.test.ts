import { describe, it, expect } from "vitest";
import { detectPlateColumn, detectArabicPlateColumnByContent } from "@/lib/plateParser";
import { looksLikePlate, detectHeaderless } from "@/lib/headerlessColumns";
import { countPlatesInBestColumn } from "@/lib/parseWorkbook";

/**
 * 0️⃣ عمود اللوحة بالمحتوى لما البنك ينزّل اللوحة **برقم أو رقمين** («ي ه ل 76» = «يهل0076») —
 * المالك (٧ أكتوبر ٢٠٢٦): «اللوحات دي بتبقي موجوده في الاحاله اللي بتنزل من البنوك ... لما المندوب يفرز
 * فرز كلي او فرز جديد او فرز علي السجلات ... تبقي مطلوبه ف تطلع في نتيجه الفرز».
 * المطابقة نفسها كانت شغّالة (normalizePlate بيكمّل لـ٤)؛ الناقص: ملف أغلب لوحاته أرقامها قصيرة وعنوان
 * عموده مافيهوش «لوح» ⇒ العمود مابيتعرفش فالفرز بيمشي على عمود غلط.
 * القاعدة: حرفين أو ٣ حروف لوحة **عربي مفصولة** (زي ما البنك بينزّلها — ١٢٨ من ١٢٨ في شيت المالك) + رقم أو رقمين
 * = لوحة. كلمة + رقم («30 يوم» / «رقم 5») و«R8» وأي كود لاتيني قصير = مش لوحة.
 */
const shortPlates = ["ي ه ل 76", "و ص ق 57", "ي م د 18", "ي ب س 87", "ه ب ق 73", "و ن ن 4", "ي هـ ل 66", "76 ي ب ق"];
const bankRows = shortPlates.map((p, i) => ({
  "م": String(i + 1),
  "رقم العقد": `40116013660${i}0001`,
  "البيان": p,
  "اسم العميل": "عميل تجريبي",
  "المبلغ": String(12000 + i * 350),
}));
const headers = Object.keys(bankRows[0]);

describe("🔴 ملف بنك لوحاته أرقامها قصيرة وعنوانه «البيان»", () => {
  it("🔴 detectPlateColumn بيلاقي «البيان» (مش أول عمود)", () => {
    expect(detectPlateColumn(headers, bankRows)).toBe("البيان");
  });
  it("🔴 detectArabicPlateColumnByContent (الإحالة بتفضّل العمود العربي)", () => {
    expect(detectArabicPlateColumnByContent(headers, bankRows)).toBe("البيان");
  });
  it("🔴 اختيار الورقة في ملف متعدد الورقات بيعدّ اللوحات دي", () => {
    const aoa = [headers, ...bankRows.map((r) => headers.map((h) => r[h as keyof typeof r]))];
    expect(countPlatesInBestColumn(aoa)).toBe(shortPlates.length);
  });
  it("🔴 «هـ» بالشرطة («ي هـ ل 0076») بتتعرف لوحة زي «ه» — زي باقي نسخ الكشف", () => {
    const rows = ["ي هـ ل 0076", "هـ ب ق 7300", "د هـ و 5678"].map((p, i) => ({ "م": String(i + 1), "البيان": p }));
    expect(detectPlateColumn(["م", "البيان"], rows)).toBe("البيان");
  });
  it("🔴 ملف من غير صف عناوين: أول صف لوحات قصيرة = داتا مش عناوين", () => {
    expect(looksLikePlate("ي ه ل 76")).toBe(true);
    expect(looksLikePlate("ي ب س ٨٧")).toBe(true);
    expect(looksLikePlate("أ ب ى 5")).toBe(true);
    expect(detectHeaderless(["ي ه ل 76", "النسيم", "15/5/2024"])).toBe(true);
  });
});

describe("🔴 ملف إحالة بأكتر من ورقة: ورقة كل لوحاتها برقمين ماتتخطّاش", () => {
  it("🔴 قارئ الإحالة (parseExcelStream) بيدمج الورقة دي مع التانية", async () => {
    const XLSX = await import("xlsx");
    const { parseExcelStream } = await import("@/lib/excel");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["البيان", "الماركة"], ["ح ه ه 9482", "دودج"], ["د د ن 2138", "هونداي"], ["و ن ن 0004", "مرسيدس"],
    ]), "محفظة 1");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["البيان", "الماركة"], ["ي ه ل 76", "تويوتا"], ["و ص ق 57", "نيسان"], ["ي م د 18", "كيا"],
    ]), "محفظة 2");
    const t = await parseExcelStream(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(t.rows.map((r) => r["البيان"])).toEqual(["ح ه ه 9482", "د د ن 2138", "و ن ن 0004", "ي ه ل 76", "و ص ق 57", "ي م د 18"]);
  });
});

describe("الأكواد القصيرة لسه مش لوحات (زي الأول)", () => {
  it("«R8» / «AB12» / حرفين عربي + رقم", () => {
    const rows = [
      { "Risk Grading": "R8", "Code": "AB12", "حي": "حي1", "PLATE#": "ح ه ه 9482" },
      { "Risk Grading": "R8", "Code": "XY7", "حي": "حي2", "PLATE#": "د د ن 2138" },
      { "Risk Grading": "R12", "Code": "AB12", "حي": "حي3", "PLATE#": "و ن ن 0004" },
    ];
    expect(detectPlateColumn(Object.keys(rows[0]), rows)).toBe("PLATE#");
    expect(looksLikePlate("82ع")).toBe(false);
    expect(looksLikePlate("حي1")).toBe(false);
    expect(looksLikePlate("ABC12")).toBe(false);
    expect(looksLikePlate("A B C 12")).toBe(false);
    expect(looksLikePlate("ف ش ة 12")).toBe(false);   // مش حروف لوحة
    expect(looksLikePlate("ي ه ل 761")).toBe(true);    // ٣ أرقام = القاعدة القديمة زي ما هي
  });
  it("🔴 كلمة + رقم («30 يوم» / «رقم 5») مش لوحة — ولو عمودها قبل عمود اللوحة مابيكسبوش", () => {
    for (const w of ["30 يوم", "يوم 30", "رقم 5", "قسط 12", "بند 3"]) expect(looksLikePlate(w)).toBe(false);
    const rows = shortPlates.map((p, i) => ({ "مدة التأخير": `${30 + i} يوم`, "البند": `بند ${i + 1}`, "البيان": p }));
    expect(detectPlateColumn(Object.keys(rows[0]), rows)).toBe("البيان");
    expect(detectArabicPlateColumnByContent(Object.keys(rows[0]), rows)).toBe("البيان");
  });
  it("صف عناوين حقيقي مابيتحسبش داتا", () => {
    expect(detectHeaderless(["رقم اللوحة", "الحي", "التاريخ"])).toBe(false);
  });
});

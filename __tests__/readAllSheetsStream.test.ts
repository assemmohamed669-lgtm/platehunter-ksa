import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readAllSheetsRawStream } from "@/lib/xlsxStream";
import { analyzeWorkbook, totalPlates, defaultSelection } from "@/lib/referralSheets";

/**
 * محافظ البنوك بتيجي أحياناً بمدى وهمي ضخم: الورقة مسجّلة لغاية صف ٩٩٨ ألف
 * وفيها ١٦٧٤ لوحة بس — الباقي صفوف فاضية متنسّقة. قارئ SheetJS بيبني الورقة
 * كلها في الذاكرة الأول (مليون صف) وبعدين نقصّها، فالتليفون بيتجمّد أو يقفل.
 *
 * القارئ المتدفّق بيمرّ على الـXML مرة واحدة وبيرمي الصفوف الفاضية وهو ماشي،
 * فالذاكرة بتفضل على قد الداتا الحقيقية.
 */

/** ورقة بمدى وهمي: صفوف فيها بيانات + صفوف فاضية متنسّقة تحتها. */
function buildPhantomFile(): Uint8Array {
  const aoa: unknown[][] = [
    ["محفظة البنك العربي — تاريخ ١٠/٨"],          // صف عنوان فوق الهيدر
    [],
    ["PLATE_NUM", "MODEL", "Vehicle color"],
    ["ا ب ح 1234", "لاندكروزر", "ابيض"],
    ["د ن ر 5678", "باترول", "اسود"],
    ["ر ل د 6202", "هايلكس", "فضي"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // مدى وهمي: الورقة بتقول إنها لغاية صف ٥٠٠٠ وهي ٦ صفوف
  ws["!ref"] = "A1:C5000";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ملخّص"], ["الإجمالي", 3]]), "Sheet2");
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

describe("readAllSheetsRawStream — قراءة كل الورقات بلا صفوف فاضية", () => {
  it("بيرجّع كل الورقات بأسمائها وبترتيبها", async () => {
    const sheets = await readAllSheetsRawStream(buildPhantomFile());
    expect(sheets.map((s) => s.name)).toEqual(["Sheet1", "Sheet2"]);
  });

  it("الصفوف الفاضية اللي تحت مابترجعش (المدى الوهمي مابيأثرش)", async () => {
    const [s1] = await readAllSheetsRawStream(buildPhantomFile());
    expect(s1.aoa).toHaveLength(5);   // ٦ صفوف ناقص الصف الفاضي اللي في النص
  });

  it("القيم نفسها بترجع صح وبترتيبها", async () => {
    const [s1] = await readAllSheetsRawStream(buildPhantomFile());
    expect(s1.aoa[0]).toEqual(["محفظة البنك العربي — تاريخ ١٠/٨"]);
    expect(s1.aoa[1]).toEqual(["PLATE_NUM", "MODEL", "Vehicle color"]);
    expect(s1.aoa[2]).toEqual(["ا ب ح 1234", "لاندكروزر", "ابيض"]);
  });

  it("تحليل الإحالة بيشتغل على الناتج ويطلّع اللوحات صح", async () => {
    const sheets = await readAllSheetsRawStream(buildPhantomFile());
    const infos = analyzeWorkbook(sheets);
    const s1 = infos[0];
    expect(s1.plateColName).toBe("PLATE_NUM");
    expect(s1.plateCount).toBe(3);
    expect(s1.rows).toHaveLength(3);
    expect(totalPlates(infos.filter((s) => defaultSelection(infos).has(s.name)))).toBeGreaterThan(0);
  });

  it("خلية HYPERLINK بترجع الرابط (زي القارئ العادي)", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["PLATE_NUM", "GPS"], ["ابح1234", "خريطة"]]);
    ws["B2"] = { t: "s", v: "خريطة", f: 'HYPERLINK("https://maps.app.goo.gl/abc","خريطة")' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    const [s] = await readAllSheetsRawStream(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(s.aoa[1][1]).toBe("https://maps.app.goo.gl/abc");
  });

  it("ورقة فاضية خالص بترجع بمصفوفة فاضية مش بتختفي", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["أ"], ["ب"]]), "فيها");
    const empty = XLSX.utils.aoa_to_sheet([[]]);
    empty["!ref"] = "A1:C900000";
    XLSX.utils.book_append_sheet(wb, empty, "فاضية");
    const sheets = await readAllSheetsRawStream(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(sheets.map((s) => s.name)).toEqual(["فيها", "فاضية"]);
    expect(sheets[1].aoa).toEqual([]);
  });

  it("خلايا الخطأ (#N/A) بترجع فاضية مش نص «N/A#»", async () => {
    // محافظ البنوك فيها أعمدة عناوين بصيغ فاشلة → #N/A. القارئ العادي بيرجّعها
    // فاضية، والمتدفّق لازم يعمل نفس الحاجة عشان المندوب مايشوفش «#N/A».
    const ws = XLSX.utils.aoa_to_sheet([["PLATE_NUM", "Address Line1"], ["ابح1234", ""]]);
    ws["B2"] = { t: "e", v: 0x2a, w: "#N/A" };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    const [s] = await readAllSheetsRawStream(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(s.aoa[1][1]).toBe("");
  });

  it("ملف مش xlsx بيرمي خطأ (عشان الاحتياطي يشتغل)", async () => {
    await expect(readAllSheetsRawStream(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

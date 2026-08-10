import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseExcelStream } from "@/lib/excel";

/**
 * `parseExcelStream` هو مسار قراءة ملف الإحالة الجديد — بيقرا الملف بمرور واحد
 * بدل ما SheetJS يبني الورقة كلها في الذاكرة. محفظة «البنك العربي» الحقيقية:
 * ٧٨٣ ميجا ذاكرة و٧.٧ ثانية بالقارئ القديم، مقابل جزء صغير بالمتدفّق.
 *
 * الاختبارات دي بتثبّت السلوك اللي اتقارن **خليّة بخليّة** مع القارئ القديم على
 * ملفات محافظ حقيقية، ومنها حاجتين اتصلحوا في الطريق:
 *   • `_x000D_` (سطر جديد جوّه خلية) كان بيطلع مكتوب حرفياً جنب اللوحة.
 *   • التاريخ كان ناقص يوم — SheetJS بترجّع «٩ مارس ١١:٥٩:٤٨م» لتاريخ إكسيل
 *     ١٠ مارس (فرق التوقيت المحلي القديم)، فالمندوب كان يشوف يوم قبله.
 */

function build(aoa: unknown[][], sheetName = "Sheet1", extra?: (ws: XLSX.WorkSheet) => void): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  extra?.(ws);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

describe("parseExcelStream — قراءة ملف الإحالة بمرور واحد", () => {
  it("بيطلّع العناوين والصفوف صح", async () => {
    const t = await parseExcelStream(build([
      ["PLATE_NUM", "MODEL", "Vehicle color"],
      ["ا ب ح 1234", "لاندكروزر", "ابيض"],
      ["د ن ر 5678", "باترول", "اسود"],
    ]));
    expect(t.headers).toEqual(["PLATE_NUM", "MODEL", "Vehicle color"]);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual({ "PLATE_NUM": "ا ب ح 1234", "MODEL": "لاندكروزر", "Vehicle color": "ابيض" });
    expect(t.sheetName).toBe("Sheet1");
  });

  it("الصفوف الفاضية اللي تحت المدى الوهمي مابتظهرش", async () => {
    const bytes = build([["PLATE_NUM"], ["ا ب ح 1234"]], "Sheet1", (ws) => { ws["!ref"] = "A1:A900000"; });
    const t = await parseExcelStream(bytes);
    expect(t.rows).toHaveLength(1);
  });

  it("صفوف العناوين اللي فوق الهيدر بتتخطّى", async () => {
    const t = await parseExcelStream(build([
      ["محفظة البنك العربي — ١٠/٨"],
      ["PLATE_NUM", "MODEL"],
      ["ا ب ح 1234", "لاندكروزر"],
    ]));
    expect(t.headers).toEqual(["PLATE_NUM", "MODEL"]);
    expect(t.rows).toHaveLength(1);
  });

  it("«_x000D_» (سطر جوّه خلية) مابيطلعش مكتوب حرفياً", async () => {
    // اللوحة في محفظة حقيقية كانت متخزّنة كده — لو ماتفكّتش المندوب يشوف
    // «ر ق أ 6720_x000D_» في عمود اللوحة.
    const t = await parseExcelStream(build([
      ["PLATE_NO"],
      ["ر ق أ 6720\r\n"],
    ]));
    expect(t.rows[0]["PLATE_NO"]).not.toContain("_x000D_");
    expect(t.rows[0]["PLATE_NO"].trim()).toBe("ر ق أ 6720");
  });

  it("التاريخ بيطلع باليوم الصح (مش ناقص يوم)", async () => {
    // ١٠ مارس ٢٠٢٤ = الرقم التسلسلي ٤٥٣٦١ في إكسيل.
    const bytes = build([["Approval Date"], [0]], "Sheet1", (ws) => {
      ws["A2"] = { t: "n", v: 45361, z: "dd/mmm/yy" };
    });
    const t = await parseExcelStream(bytes);
    expect(t.rows[0]["Approval Date"]).toBe("10/03/2024");
  });

  it("التنسيق المدمج للتاريخ (numFmtId ١٤) بيتعرف كمان", async () => {
    const bytes = build([["DT"], [0]], "Sheet1", (ws) => {
      ws["A2"] = { t: "n", v: 45361, z: XLSX.SSF.get_table()[14] };
    });
    const t = await parseExcelStream(bytes);
    // المهم إنه يطلع تاريخ مقروء مش رقم تسلسلي
    expect(t.rows[0]["DT"]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(t.rows[0]["DT"]).not.toBe("45361");
  });

  it("الأرقام بتفضل أرقام من غير فواصل تنسيق", async () => {
    const bytes = build([["EMI"], [0]], "Sheet1", (ws) => {
      ws["A2"] = { t: "n", v: 4301, z: "#,##0 " };
    });
    const t = await parseExcelStream(bytes);
    expect(t.rows[0]["EMI"]).toBe("4301");
  });

  it("بيختار الورقة اللي فيها أكتر لوحات في الملفات متعددة الورقات", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ملخّص"], ["الإجمالي", 3]]), "ملخص");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["PLATE_NUM"], ["ا ب ح 1234"], ["د ن ر 5678"], ["ر ل د 6202"],
    ]), "المطلوبين");
    const t = await parseExcelStream(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(t.sheetName).toBe("المطلوبين");
    expect(t.allSheetNames).toEqual(["ملخص", "المطلوبين"]);
    expect(t.rows).toHaveLength(3);
  });

  it("ملف مش xlsx بيرمي (عشان الاحتياطي يشتغل)", async () => {
    await expect(parseExcelStream(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});

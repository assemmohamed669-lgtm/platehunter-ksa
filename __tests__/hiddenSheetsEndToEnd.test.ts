/**
 * تحقّق من الطرف للطرف على ملف بنفس شكل «محفظة التيسير المؤتمن الاول»:
 *   Sheet1 (مخفية، الأكبر، **أول ورقة**) · محفظة (ظاهرة) · Sheet2 (مخفية)
 *
 * لازم القرّاء كلهم يقعوا على الورقة الظاهرة — مش أول ورقة ولا أكبر ورقة.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readSheetNames, readAllSheets, parseExcelFile } from "@/lib/excel";

/** ملف بنفس شكل محفظة المالك. */
function walletFile(): File {
  const big = [["رقم اللوحة"], ...Array.from({ length: 300 }, (_, i) => [`ا ب ح ${1000 + i}`])];
  const real = [["رقم اللوحة"], ...Array.from({ length: 40 }, (_, i) => [`د ه و ${2000 + i}`])];
  const tiny = [["ملاحظات"], ["كلام"]];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(big), "Sheet1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(real), "المحفظة");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tiny), "Sheet2");
  wb.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }, { Hidden: 1 }] } as XLSX.WBProps;

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([out], "محفظة.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("محفظة فيها ورقة مخفية أول الملف", () => {
  it("readSheetNames بيرجّع الظاهرة بس — فالملف بيتعامل كورقة واحدة", async () => {
    expect(await readSheetNames(walletFile())).toEqual(["المحفظة"]);
  });

  it("readAllSheets بيتخطّى المخفيتين", async () => {
    const out = await readAllSheets(walletFile());
    expect(out.map((s) => s.sheetName)).toEqual(["المحفظة"]);
  });

  it("parseExcelFile بيقع على الظاهرة — مش الأولى ولا الأكبر", async () => {
    const t = await parseExcelFile(walletFile());
    expect(t.rows.length).toBe(40);          // الظاهرة، مش الـ٣٠٠ المخفية
    expect(String(t.rows[0]["رقم اللوحة"])).toContain("د");
  });

  it("لوحات المخفية مش داخلة الفرز خالص", async () => {
    const t = await parseExcelFile(walletFile());
    const all = JSON.stringify(t.rows);
    expect(all).not.toContain("ا ب ح");
  });
});

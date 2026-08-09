import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { streamXlsxToBatches } from "@/lib/xlsxStream";
import { gpsCellToLink } from "@/lib/gps";

/**
 * ملفات الداتا الكبيرة بتتقرا بالقارئ المتدفّق (streaming) مش بـ parseExcelFile.
 * القارئ ده كان **بيتجاهل الصيغ خالص** — وخلية الموقع في ملفات الداتا بتتكتب
 * كـ `=HYPERLINK("https://maps.app.goo.gl/...","خريطة")`، يعني القيمة المخزّنة
 * هي كلمة «خريطة» والرابط جوّه الصيغة.
 *
 * فالنتيجة: عمود GPS كان بيوصل للتطبيق كنص «خريطة» — لا لينك في نتيجة الفرز
 * ولا لينك في النسخ/المشاركة على واتساب. القارئ العادي (الملفات الصغيرة) كان
 * بيحلّها صح عبر resolveHyperlinkCells، فالمشكلة كانت بتظهر بس مع الداتا الكبيرة.
 */

const PIN = "https://maps.app.goo.gl/TiYvx13pEkZ7sHFH6?g_st=aw";

/** ملف زي ملفات الداتا الحقيقية: عمود GPS بصيغة HYPERLINK. */
function buildFileWithHyperlinks(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([
    ["رقم اللوحة", "نوع السيارة", "الحى", "GPS"],
    ["دحم1328", "مركونه", "1دوام برحه مستشفي الجدعاني", "خريطة"],
    ["راك5128", "", "1دوام برحه مستشفي الجدعاني", "خريطة"],
    ["رمل3547", "", "2دوام", ""],
  ]);
  // نفس شكل الملف الحقيقي: v = «خريطة» و f = HYPERLINK(url,"خريطة")
  for (const ref of ["D2", "D3"]) {
    ws[ref] = { t: "s", v: "خريطة", f: `HYPERLINK("${PIN}","خريطة")` };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا جديد");
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

async function readAll(bytes: Uint8Array) {
  const rows: Record<string, string>[] = [];
  const meta = await streamXlsxToBatches(bytes, (batch) => { rows.push(...batch); }, { batchSize: 2 });
  return { rows, meta };
}

describe("القارئ المتدفّق — خلية HYPERLINK بترجع الرابط مش كلمة «خريطة»", () => {
  it("عمود GPS بيرجع رابط الدبوس", async () => {
    const { rows } = await readAll(buildFileWithHyperlinks());
    expect(rows).toHaveLength(3);
    expect(rows[0]["GPS"]).toBe(PIN);
    expect(rows[1]["GPS"]).toBe(PIN);
  });

  it("والرابط ده بيتحوّل للينك خرائط شغّال (اللي بيروح للمندوب)", async () => {
    const { rows } = await readAll(buildFileWithHyperlinks());
    expect(gpsCellToLink(rows[0]["GPS"])).toBe(PIN);
  });

  it("الخلية الفاضية بتفضل فاضية", async () => {
    const { rows } = await readAll(buildFileWithHyperlinks());
    expect(rows[2]["GPS"]).toBe("");
  });

  it("باقي الأعمدة ماتغيّرتش", async () => {
    const { rows, meta } = await readAll(buildFileWithHyperlinks());
    expect(meta.headers).toEqual(["رقم اللوحة", "نوع السيارة", "الحى", "GPS"]);
    expect(rows[0]["رقم اللوحة"]).toBe("دحم1328");
    expect(rows[0]["نوع السيارة"]).toBe("مركونه");
    expect(rows[0]["الحى"]).toBe("1دوام برحه مستشفي الجدعاني");
    expect(meta.rowCount).toBe(3);
  });

  it("صيغة عادية (مش HYPERLINK) بتفضل بقيمتها المحسوبة", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["اللوحة", "العدد"], ["ابح1234", 0]]);
    ws["B2"] = { t: "n", v: 7, f: "SUM(A1:A1)" };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    const { rows } = await readAll(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(rows[0]["العدد"]).toBe("7");
  });

  it("HYPERLINK بعلامات تنصيص مفردة أو بمسافات بتشتغل برضه", async () => {
    const ws = XLSX.utils.aoa_to_sheet([["اللوحة", "GPS"], ["ابح1234", "خريطة"]]);
    ws["B2"] = { t: "s", v: "خريطة", f: `HYPERLINK( "${PIN}" , "خريطة" )` };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    const { rows } = await readAll(new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" })));
    expect(rows[0]["GPS"]).toBe(PIN);
  });
});

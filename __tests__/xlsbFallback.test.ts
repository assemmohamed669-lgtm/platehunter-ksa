// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseAnySpreadsheet } from "@/lib/excel";

/**
 * محافظ البنوك بتيجي بصيغ مختلفة. الـ .xlsb (إكسيل ثنائي) جوّاه أوراق
 * **بايناري** (sheet1.bin) مش XML — فالقارئ المتدفّق السريع مابيقدرش عليها،
 * وبيرمي رسالة واضحة. لكن SheetJS بيقراها عادي.
 *
 * صفحة «رفع للداتا» كانت بتستخدم القارئ المتدفّق لوحده، فمحفظة .xlsb
 * كانت بتترفض — رغم إن باقي صفحات البرنامج بتقراها. الدالة دي بتجرّب
 * السريع الأول وترجع للبطيء لو مانفعش.
 */
function fileOf(aoa: unknown[][], bookType: "xlsx" | "xlsb" | "biff8" | "ods", name: string): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ورقة1");
  const out = XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer;
  return new File([out], name);
}

const AOA = [
  ["رقم اللوحة", "صانع المركبة", "الحى"],
  ["ر د ه 4899", "هونداي", "80 الصفا"],
  ["ا ب ج 1234", "تويوتا", "81 الصفا"],
];

describe("قراءة أي صيغة إكسيل", () => {
  it("xlsx بيتقرا (المسار السريع)", async () => {
    const t = await parseAnySpreadsheet(fileOf(AOA, "xlsx", "a.xlsx"));
    expect(t.rows).toHaveLength(2);
    expect(t.headers).toContain("رقم اللوحة");
    expect(t.rows[0]["رقم اللوحة"]).toBe("ر د ه 4899");
  });

  it("xlsb بيتقرا (بيرجع للمسار البطيء)", async () => {
    const t = await parseAnySpreadsheet(fileOf(AOA, "xlsb", "محفظة.xlsb"));
    expect(t.rows).toHaveLength(2);
    expect(t.headers).toContain("رقم اللوحة");
    expect(t.rows[1]["صانع المركبة"]).toBe("تويوتا");
  });

  it("xls القديم بيتقرا", async () => {
    const t = await parseAnySpreadsheet(fileOf(AOA, "biff8", "قديم.xls"));
    expect(t.rows).toHaveLength(2);
  });

  it("ods بيتقرا", async () => {
    const t = await parseAnySpreadsheet(fileOf(AOA, "ods", "a.ods"));
    expect(t.rows).toHaveLength(2);
  });

  it("ملف مش جدول أصلاً بيرمي رسالة", async () => {
    await expect(parseAnySpreadsheet(new File(["مش إكسيل"], "x.txt"))).rejects.toThrow();
  });
});

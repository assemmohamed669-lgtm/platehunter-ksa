// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbookViaXlsx } from "@/lib/parseWorkbook";

function bytes(aoa: unknown[][], bookType: "xlsx" | "xlsb" | "biff8" | "ods"): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "داتا");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer);
}

const AOA = [
  ["رقم اللوحة", "الماركة", "اللون"],
  ["ابح1234", "تويوتا", "أبيض"],
  ["دمم5012", "نيسان", "أسود"],
  ["سعم7788", "هونداي", "فضي"],
];

describe("parseWorkbookViaXlsx — يقرا أي صيغة (الاحتياطي جوّه الـWorker)", () => {
  it("xlsx → كل الصفوف والأعمدة", () => {
    const t = parseWorkbookViaXlsx(bytes(AOA, "xlsx"));
    expect(t.headers).toEqual(["رقم اللوحة", "الماركة", "اللون"]);
    expect(t.rows.length).toBe(3);
    expect(t.rows.map((r) => r["رقم اللوحة"])).toEqual(["ابح1234", "دمم5012", "سعم7788"]);
    expect(t.rows[0]["الماركة"]).toBe("تويوتا");
  });

  it("xlsb (الصيغة اللي كانت بتتعطّل) → كل الصفوف", () => {
    const t = parseWorkbookViaXlsx(bytes(AOA, "xlsb"));
    expect(t.rows.length).toBe(3);
    expect(t.rows.map((r) => r["رقم اللوحة"])).toEqual(["ابح1234", "دمم5012", "سعم7788"]);
    expect(t.rows[2]["اللون"]).toBe("فضي");
  });

  it("xls القديم → كل الصفوف", () => {
    const t = parseWorkbookViaXlsx(bytes(AOA, "biff8"));
    expect(t.rows.length).toBe(3);
    expect(t.rows.map((r) => r["رقم اللوحة"])).toEqual(["ابح1234", "دمم5012", "سعم7788"]);
  });

  it("ods → كل الصفوف", () => {
    const t = parseWorkbookViaXlsx(bytes(AOA, "ods"));
    expect(t.rows.length).toBe(3);
    expect(t.rows[1]["الماركة"]).toBe("نيسان");
  });

  it("ملف فارغ → يرمي رسالة عربية", () => {
    expect(() => parseWorkbookViaXlsx(bytes([[]], "xlsx"))).toThrow(/الملف/);
  });
});

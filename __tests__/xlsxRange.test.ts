import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { trimSheetToData } from "@/lib/xlsxRange";

/**
 * محافظ كتير بيتعملها تنسيق على أعمدة كاملة، فـ Excel بيسجّل `!ref` لغاية صف
 * مليون رغم إن الداتا ١٥٠٠ صف. sheet_to_json ساعتها بيولّد مليون مصفوفة فاضية
 * → تجميد وخروج التطبيق على الموبايل. trimSheetToData بتقصّ المدى للداتا
 * الحقيقية **من غير ما تفقد أي خلية فيها قيمة**.
 */

function sparseSheet(cells: Record<string, unknown>, ref: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  for (const [addr, v] of Object.entries(cells)) {
    ws[addr] = { t: typeof v === "number" ? "n" : "s", v } as XLSX.CellObject;
  }
  ws["!ref"] = ref;
  return ws;
}

describe("trimSheetToData — قصّ المدى الوهمي", () => {
  it("يقصّ الصفوف الفاضية المتعلّقة في الآخر", () => {
    const ws = sparseSheet(
      { A1: "رقم اللوحة", A2: "ا ب ج 1234", A3: "د ه و 5678" },
      "A1:Q998660"
    );
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:A3");
  });

  it("يقصّ الأعمدة الفاضية كمان", () => {
    const ws = sparseSheet({ A1: "لوحة", B1: "موديل", A2: "ا ب ج 1234" }, "A1:Z5000");
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:B2");
  });

  it("مايغيّرش حاجة لما المدى مظبوط أصلاً", () => {
    const ws = sparseSheet({ A1: "لوحة", A2: "ا ب ج 1234" }, "A1:A2");
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:A2");
  });

  it("مايرميش خلايا قيمتها صفر أو false", () => {
    const ws = sparseSheet({ A1: "عدد", A2: 0 }, "A1:A9999");
    ws.A3 = { t: "b", v: false } as XLSX.CellObject;
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:A3");
  });

  it("مايرميش خلية فيها رابط أو صيغة", () => {
    const ws = sparseSheet({ A1: "لوحة" }, "A1:D9999");
    ws.B1 = { t: "s", v: "", l: { Target: "https://maps.google.com/x" } } as XLSX.CellObject;
    ws.C1 = { t: "s", f: 'HYPERLINK("https://x","خريطة")' } as XLSX.CellObject;
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:C1");
  });

  it("ورقة فاضية تماماً مابتكسرش", () => {
    const ws: XLSX.WorkSheet = { "!ref": "A1:Q998660" };
    expect(() => trimSheetToData(ws)).not.toThrow();
    expect(ws["!ref"]).toBe("A1"); // encode_range بيلمّ الخلية الواحدة كده
  });

  it("ورقة من غير !ref مابتكسرش", () => {
    const ws: XLSX.WorkSheet = {};
    expect(() => trimSheetToData(ws)).not.toThrow();
    expect(() => trimSheetToData(undefined)).not.toThrow();
  });

  it("بيشتغل على ورقة dense (مفاتيح رقمية — نسخة xlsx 0.18)", () => {
    const ws: XLSX.WorkSheet = { "!ref": "A1:Q998660" };
    const mk = (v: string) => ({ t: "s", v });
    (ws as Record<string, unknown>)["0"] = [mk("لوحة"), mk("موديل")];
    (ws as Record<string, unknown>)["1"] = [mk("ا ب ج 1234"), mk("كامري")];
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:B2");
  });

  it("بيشتغل على ورقة dense الجديدة (!data)", () => {
    const ws: XLSX.WorkSheet = { "!ref": "A1:Q998660" };
    const mk = (v: string) => ({ t: "s", v });
    (ws as Record<string, unknown>)["!data"] = [
      [mk("لوحة")],
      [mk("ا ب ج 1234")],
    ];
    trimSheetToData(ws);
    expect(ws["!ref"]).toBe("A1:A2");
  });

  it("بعد القصّ sheet_to_json بيرجّع نفس البيانات بالظبط", () => {
    const ws = sparseSheet(
      { A1: "رقم اللوحة", B1: "الموديل", A2: "ا ب ج 1234", B2: "كامري" },
      "A1:Q20000" // مدى صغير عشان الاختبار يفضل سريع — المنطق واحد
    );
    const before = XLSX.utils
      .sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "" })
      .filter((r) => r.some((v) => String(v).trim() !== ""));
    trimSheetToData(ws);
    const after = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: "",
    });
    expect(after.map((r) => r.slice(0, 2))).toEqual(before.map((r) => r.slice(0, 2)));
  });
});

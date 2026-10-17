/**
 * 🧮 «مطلوبة» في المجمّع = ملف التشييك بتاع قناص (مش شيت بنك لوحده زي المعمل).
 *
 * صفحة «التسجيل» بتقرا ملف التشييك بس (`local:check` + الإضافيين) — الرفع والمسح
 * من صفحة التشييك. فالمجمّع بياخد نفس الملفات بنفس قواعد التطبيق: كل ملف بعمود
 * لوحته، الإنجليزي البنكي بيتحوّل (أرقام قبل الحروف = الحروف بتتعكس)، الأصفار
 * في الأول بتتكمّل، والأول بيكسب.
 */
import { describe, expect, it } from "vitest";
import { buildCheckBankSheet, matchInCheckSheet } from "../checkSheetAdapter";

const arabic = {
  headers: ["رقم اللوحة", "الطراز", "البنك"],
  rows: [
    { "رقم اللوحة": "ا ب ح 1234", "الطراز": "كامري", "البنك": "الأهلي" },
    { "رقم اللوحة": "يهل76", "الطراز": "هايلكس", "البنك": "الراجحي" },
    { "رقم اللوحة": "", "الطراز": "فاضي", "البنك": "-" },
  ],
};
const english = {
  headers: ["Plate Number", "Vehicle Name"],
  rows: [
    { "Plate Number": "7709 ABS", "Vehicle Name": "Sonata" },
    { "Plate Number": "NKD 5678", "Vehicle Name": "Accent" },
    { "Plate Number": "ابح 1234", "Vehicle Name": "تاني — الأول يكسب" },
  ],
};

describe("buildCheckBankSheet", () => {
  it("فهرس واحد من كل الملفات بقواعد التطبيق", () => {
    const s = buildCheckBankSheet([arabic, english], "تشييك.xlsx")!;
    expect(s.fileName).toBe("تشييك.xlsx");
    expect(s.plateColumn).toBe("رقم اللوحة");
    expect(s.headers).toEqual(arabic.headers);
    expect([...s.index.keys()].sort()).toEqual(["ابح1234", "سبا7709", "نكد5678", "يهل0076"].sort());
    expect(s.plates.length).toBe(4);
    expect(s.skipped).toBe(1);
  });

  it("مافيش ملف ⇒ null (الصفحة بتقول «مافيش ملف تشييك»)", () => {
    expect(buildCheckBankSheet([], "")).toBeNull();
    expect(buildCheckBankSheet([{ headers: [], rows: [] }], "")).toBeNull();
  });
});

describe("matchInCheckSheet — تطابق تام بس", () => {
  const s = buildCheckBankSheet([arabic, english], "تشييك.xlsx");

  it("لوحة السيرفر (٣ حروف + ٤ أرقام) بتلاقي صفها", () => {
    const m = matchInCheckSheet(s, "ابح1234");
    expect(m.kind).toBe("exact");
    expect(m.row?.["الطراز"]).toBe("كامري");   // الأول يكسب
    expect(m.similarity).toBe(100);
  });

  it("🔴 بنكي إنجليزي بأرقام قبل الحروف (`7709 ABS`) = «سبا7709»", () => {
    expect(matchInCheckSheet(s, "سبا7709").kind).toBe("exact");
    expect(matchInCheckSheet(s, "ابس7709").kind).toBe("none");
  });

  it("الأصفار: «يهل76» في الملف = «يهل0076» من السيرفر", () => {
    expect(matchInCheckSheet(s, "يهل0076").kind).toBe("exact");
  });

  it("حرف واحد فرق ⇒ مش مطلوبة (مافيش تقريبي)", () => {
    expect(matchInCheckSheet(s, "ابح1235").kind).toBe("none");
    expect(matchInCheckSheet(s, "ابد1234").kind).toBe("none");
  });

  it("مافيش ملف ⇒ none", () => {
    expect(matchInCheckSheet(null, "ابح1234").kind).toBe("none");
  });
});

import { describe, it, expect } from "vitest";
import { findPlateRows, contextWindow, nextOccurrence } from "@/lib/plateLocator";

const rows = [
  { "رقم اللوحة": "ا ب ج 1111", "الحي": "الصفا" },
  { "رقم اللوحة": "حبك 1234", "الحي": "الصفا" },
  { "رقم اللوحة": "د ه و 2222", "الحي": "النزهة" },
  { "رقم اللوحة": "حبك1234", "الحي": "النزهة" },
  { "رقم اللوحة": "ABS 7709", "الحي": "الملز" },
];

describe("findPlateRows", () => {
  it("بيلاقي اللوحة مهما كانت المسافات", () => {
    expect(findPlateRows(rows, "رقم اللوحة", "حبك1234")).toEqual([1, 3]);
    expect(findPlateRows(rows, "حبك 1234".length ? "رقم اللوحة" : "", "حبك 1234")).toEqual([1, 3]);
  });

  it("بيرجّع كل المرات بالترتيب", () => {
    expect(findPlateRows(rows, "رقم اللوحة", "حبك1234").length).toBe(2);
  });

  it("لوحة مش موجودة → قايمة فاضية", () => {
    expect(findPlateRows(rows, "رقم اللوحة", "سسس9999")).toEqual([]);
  });

  it("بحث فاضي → قايمة فاضية (مش كل الصفوف)", () => {
    expect(findPlateRows(rows, "رقم اللوحة", "   ")).toEqual([]);
  });

  it("لوحة بنكي إنجليزي بتتحوّل قبل المقارنة", () => {
    // «7709 ABS» على اللوحة = «س ب ا 7709»
    expect(findPlateRows(rows, "رقم اللوحة", "ابس7709")).toEqual([4]);
  });

  it("عمود مش موجود → قايمة فاضية بدل ما يرمي", () => {
    expect(findPlateRows(rows, "عمود وهمي", "حبك1234")).toEqual([]);
  });
});

describe("contextWindow", () => {
  it("١٠ قبل و١٠ بعد", () => {
    const w = contextWindow(50, 1000, 10);
    expect(w[0]).toBe(40);
    expect(w[w.length - 1]).toBe(60);
    expect(w.length).toBe(21);
  });

  it("في أول الملف مابينزلش تحت الصفر", () => {
    const w = contextWindow(2, 1000, 10);
    expect(w[0]).toBe(0);
    expect(w).toContain(2);
  });

  it("في آخر الملف مابيعدّيش آخر صف", () => {
    const w = contextWindow(998, 1000, 10);
    expect(w[w.length - 1]).toBe(999);
  });

  it("ملف أصغر من النافذة → الملف كله", () => {
    expect(contextWindow(1, 3, 10)).toEqual([0, 1, 2]);
  });
});

describe("nextOccurrence", () => {
  it("بيلف على المرة اللي بعدها", () => {
    expect(nextOccurrence(0, 5)).toBe(1);
    expect(nextOccurrence(3, 5)).toBe(4);
  });

  it("بعد آخر مرة بيرجع لأول واحدة", () => {
    expect(nextOccurrence(4, 5)).toBe(0);
  });

  it("مفيش نتايج → بيفضل صفر", () => {
    expect(nextOccurrence(0, 0)).toBe(0);
  });
});

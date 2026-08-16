import { describe, it, expect } from "vitest";
import { combinedDupColorMap } from "@/lib/dupColors";

/**
 * الفرز بيطلّع نافذتين: نتيجة الداتا ونتيجة السجلات. ولما المندوب يشارك،
 * الاتنين بيروحوا في **نفس الإكسيل**.
 *
 * كان التلوين محسوب من الداتا لوحدها، وصفوف السجلات بتاخد null دايماً — فاللوحة
 * اللي ظهرت في الداتا **وكمان** في السجلات مكانتش تتلوّن، رغم إنها بالظبط الحالة
 * اللي المندوب محتاج يشوفها.
 *
 * دلوقتي اللون بيتحسب على **الاتنين مع بعض**: أي لوحة اتكررت — سواء جوّه نافذة
 * واحدة أو عبر النافذتين — بتاخد لون.
 */
const PALETTE = 8;

describe("تلوين اللوحات المكررة عبر النافذتين", () => {
  it("لوحة في الداتا والسجلات → بتاخد لون", () => {
    const m = combinedDupColorMap([["ابج1234"], ["ابج1234"]], PALETTE);
    expect(m.has("ابج1234")).toBe(true);
  });

  it("ونفس اللون في الاتنين — عشان المندوب يربطهم بعينه", () => {
    const m = combinedDupColorMap([["ابج1234", "دهو5678"], ["ابج1234"]], PALETTE);
    expect(m.get("ابج1234")).toBe(m.get("ابج1234"));
    expect(m.has("دهو5678")).toBe(false);       // ظهرت مرة واحدة
  });

  it("المكرر جوّه الداتا لوحدها لسه بياخد لون (السلوك القديم مالمستش)", () => {
    const m = combinedDupColorMap([["ابج1234", "ابج1234"], []], PALETTE);
    expect(m.has("ابج1234")).toBe(true);
  });

  it("المكرر جوّه السجلات لوحدها بياخد لون كمان", () => {
    const m = combinedDupColorMap([[], ["ابج1234", "ابج1234"]], PALETTE);
    expect(m.has("ابج1234")).toBe(true);
  });

  it("اللي ظهر مرة واحدة مابياخدش لون", () => {
    const m = combinedDupColorMap([["ابج1234"], ["دهو5678"]], PALETTE);
    expect(m.size).toBe(0);
  });

  it("ألوان مختلفة للوحات المكررة المختلفة", () => {
    const m = combinedDupColorMap([["ا1", "ب2"], ["ا1", "ب2"]], PALETTE);
    expect(m.get("ا1")).not.toBe(m.get("ب2"));
  });

  it("الترتيب بترتيب أول ظهور — الداتا الأول", () => {
    const m = combinedDupColorMap([["ب2", "ا1"], ["ا1", "ب2"]], PALETTE);
    expect(m.get("ب2")).toBe(0);
    expect(m.get("ا1")).toBe(1);
  });

  it("بيلف على الألوان لو المكررات أكتر من الألوان", () => {
    const many = Array.from({ length: 10 }, (_, i) => `لوحة${i}`);
    const m = combinedDupColorMap([many, many], PALETTE);
    expect(m.size).toBe(10);
    for (const v of m.values()) expect(v).toBeLessThan(PALETTE);
    expect(m.get("لوحة8")).toBe(0);              // لفّت من الأول
  });

  it("المفاتيح الفاضية بتتجاهل — صف بلا لوحة مايلوّنش", () => {
    const m = combinedDupColorMap([["", ""], ["", "ابج1234"]], PALETTE);
    expect(m.size).toBe(0);
  });

  it("قوايم فاضية مابتكسرش", () => {
    expect(combinedDupColorMap([[], []], PALETTE).size).toBe(0);
    expect(combinedDupColorMap([], PALETTE).size).toBe(0);
  });
});

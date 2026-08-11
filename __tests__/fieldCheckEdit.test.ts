import { describe, it, expect } from "vitest";
import { applyEntryEdit, entryType, entryNotes, NOTES_KEY, TYPE_KEY } from "@/lib/fieldCheckEdit";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * المندوب بيعدّل على اللوحة اللي طلعت في التشييك — يكتب ملاحظة، أو يختار نوع
 * السيارة (ونيت/صالون…)، أو يصلّح اللوحة نفسها. التعديلات دي لازم:
 *   • تتحفظ **على طول** جوّه السجل نفسه (مش في الذاكرة بس)،
 *   • تفضل قدام السيارة في التصدير والمشاركة،
 *   • وتطلع في نتيجة الفرز بعد كده.
 *
 * النوع والملاحظات بيتخزّنوا جوّه `row` — الفرز بينشر `row` كله في شيت
 * السجلات، فأي حاجة هنا بتوصل للفرز تلقائياً.
 */

const base = (): FieldCheckEntry => ({
  id: "e1",
  plate: "ا ب ح 1234",
  row: { "الحي-الشارع": "الواحة" },
  method: "متشيكة بالصوت",
  checkedAt: "2026-08-10T10:00:00.000Z",
  synced: true,
});

describe("applyEntryEdit — تعديلات المندوب بتتحفظ في السجل", () => {
  it("الملاحظات بتتكتب جوّه السجل", () => {
    const e = applyEntryEdit(base(), { notes: "مركونة تحت العمارة" });
    expect(entryNotes(e)).toBe("مركونة تحت العمارة");
    expect(e.row[NOTES_KEY]).toBe("مركونة تحت العمارة");
  });

  it("نوع السيارة بيتحفظ", () => {
    const e = applyEntryEdit(base(), { type: "ونيت" });
    expect(entryType(e)).toBe("ونيت");
    expect(e.row[TYPE_KEY]).toBe("ونيت");
  });

  it("تعديل اللوحة نفسها بيتحفظ ومتشالة منها المسافات الزيادة", () => {
    const e = applyEntryEdit(base(), { plate: "  د ن ر 5678  " });
    expect(e.plate).toBe("د ن ر 5678");
  });

  it("أي تعديل بيعلّم السجل إنه محتاج يترفع تاني للسيرفر", () => {
    expect(applyEntryEdit(base(), { notes: "x" }).synced).toBe(false);
    expect(applyEntryEdit(base(), { type: "و" }).synced).toBe(false);
    expect(applyEntryEdit(base(), { plate: "ابح1235" }).synced).toBe(false);
  });

  it("مسح الملاحظة أو النوع بيشيلهم من السجل مش بيسيبهم فاضيين", () => {
    const withBoth = applyEntryEdit(base(), { notes: "ملاحظة", type: "ونيت" });
    const cleared = applyEntryEdit(withBoth, { notes: "", type: "" });
    expect(NOTES_KEY in cleared.row).toBe(false);
    expect(TYPE_KEY in cleared.row).toBe(false);
  });

  it("باقي بيانات السجل مابتتلمسش", () => {
    const e = applyEntryEdit(base(), { notes: "ملاحظة" });
    expect(e.row["الحي-الشارع"]).toBe("الواحة");
    expect(e.id).toBe("e1");
    expect(e.method).toBe("متشيكة بالصوت");
    expect(e.checkedAt).toBe("2026-08-10T10:00:00.000Z");
  });

  it("السجل الأصلي مابيتغيّرش (نسخة جديدة)", () => {
    const orig = base();
    applyEntryEdit(orig, { notes: "ملاحظة" });
    expect(orig.row[NOTES_KEY]).toBeUndefined();
    expect(orig.synced).toBe(true);
  });

  it("لوحة فاضية مابتتقبلش — بتفضل زي ما هي", () => {
    const e = applyEntryEdit(base(), { plate: "   " });
    expect(e.plate).toBe("ا ب ح 1234");
  });

  it("بيقرا ملاحظة موجودة أصلاً بأي تسمية قريبة من الشيت", () => {
    const e: FieldCheckEntry = { ...base(), row: { "الملاحظات": "من الشيت" } };
    expect(entryNotes(e)).toBe("من الشيت");
  });

  it("التعديل بيكتب في نفس عمود الشيت مش بيعمل عمود تاني", () => {
    const e: FieldCheckEntry = { ...base(), row: { "الملاحظات": "قديمة" } };
    const upd = applyEntryEdit(e, { notes: "جديدة" });
    expect(upd.row["الملاحظات"]).toBe("جديدة");
    expect(NOTES_KEY in upd.row && upd.row[NOTES_KEY] !== "جديدة").toBe(false);
    expect(Object.keys(upd.row)).toHaveLength(1);
  });

  it("مافيش تعديل → السجل زي ما هو بالظبط", () => {
    const orig = base();
    expect(applyEntryEdit(orig, {})).toEqual(orig);
  });
});

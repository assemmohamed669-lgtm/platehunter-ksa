import { describe, it, expect } from "vitest";
import { applyEntryEdit, entryType, entryNotes, NOTES_KEY, TYPE_KEY } from "@/lib/fieldCheckEdit";
import { resolveMergedResultColumns, isHiddenTashyeekCol } from "@/lib/resultColumns";
import { buildCombinedShareRows, type ShareDataRow } from "@/lib/combinedShare";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * الرحلة الكاملة لتعديل المندوب: بيشيّك لوحة، يكتب ملاحظة/يختار نوع/يصلّح
 * اللوحة → التعديل يتحفظ في السجل → يطلع في **نتيجة الفرز** وفي **المشاركة**.
 *
 * الاختبار ده بيمسك الحلقة اللي كانت مقطوعة: التعديل كان بيفضل في الذاكرة بس،
 * فمابيوصلش لا للتصدير ولا للفرز.
 */

/** نفس الطريقة اللي صفحة الفرز بتبني بيها شيت السجلات من السجلات المحفوظة. */
function toSheetRow(e: FieldCheckEntry): Record<string, string> {
  return {
    "رقم اللوحة": e.plate,
    ...e.row,
    "الحالة": e.method || "",
    "GPS": e.mapsLink ?? "",
    "التاريخ": "10/08/2026",
  };
}

const checked = (): FieldCheckEntry => ({
  id: "e1", plate: "ا ب ح 1234",
  row: { "الحي-الشارع": "8واحه ليلي" },
  method: "متشيكة بالصوت", checkedAt: "2026-08-10T10:00:00.000Z", synced: true,
});

describe("تعديل المندوب بيوصل للفرز والمشاركة", () => {
  const edited = applyEntryEdit(checked(), {
    type: "ونيت", notes: "مركونة تحت العمارة", plate: "ا ب ح 1235",
  });

  it("التعديل بيتحفظ في السجل نفسه", () => {
    expect(edited.plate).toBe("ا ب ح 1235");
    expect(entryType(edited)).toBe("ونيت");
    expect(entryNotes(edited)).toBe("مركونة تحت العمارة");
    expect(edited.synced).toBe(false);   // هيترفع تاني في المزامنة
  });

  it("شيت السجلات (اللي الفرز بيفرز عليه) فيه التعديل", () => {
    const row = toSheetRow(edited);
    expect(row["رقم اللوحة"]).toBe("ا ب ح 1235");
    expect(row[TYPE_KEY]).toBe("ونيت");
    expect(row[NOTES_KEY]).toBe("مركونة تحت العمارة");
  });

  it("«النوع» بيطلع في نتيجة الفرز كعمود «نوع السيارة»", () => {
    const row = toSheetRow(edited);
    const cols = resolveMergedResultColumns([
      { kind: "data", headers: Object.keys(row), rows: [row], plateCol: "رقم اللوحة" },
    ]);
    const type = cols.find((c) => c.key === "type");
    expect(type?.sourceCol).toBe(TYPE_KEY);
  });

  it("«الملاحظات» مابتتخفيش من نافذة السجلات", () => {
    expect(isHiddenTashyeekCol(NOTES_KEY)).toBe(false);
    expect(isHiddenTashyeekCol("الملاحظات")).toBe(false);
  });

  it("الملاحظة والنوع بيطلعوا في المشاركة الموحّدة", () => {
    const tash: ShareDataRow[] = [{
      src: "سجلات", plate: edited.plate, type: entryType(edited), model: "",
      bank: "", dist: "", addr: "8واحه ليلي", date: "10/08/2026",
      gps: "", color: "", notes: entryNotes(edited),
    }];
    const { columns, imageRows } = buildCombinedShareRows([], tash);
    const typeIdx = columns.indexOf("نوع السيارة");
    const notesIdx = columns.indexOf("الملاحظات");
    expect(imageRows[0][typeIdx]).toBe("ونيت");
    expect(imageRows[0][notesIdx]).toBe("مركونة تحت العمارة");
    expect(imageRows[0][columns.indexOf("المصدر")]).toBe("سجلات");
  });

  it("تعديل تاني بيغلب اللي قبله (آخر تعديل هو اللي يفضل)", () => {
    const again = applyEntryEdit(edited, { notes: "اتسحبت" });
    expect(entryNotes(again)).toBe("اتسحبت");
    expect(entryType(again)).toBe("ونيت");           // اللي ماتعدّلش فضل زي ما هو
    expect(again.plate).toBe("ا ب ح 1235");
  });

  it("سجل من غير تعديل مابيتغيّرش شكله في الفرز", () => {
    const row = toSheetRow(checked());
    expect(TYPE_KEY in row).toBe(false);
    expect(NOTES_KEY in row).toBe(false);
  });
});

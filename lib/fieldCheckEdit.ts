/**
 * fieldCheckEdit — تعديلات المندوب على سجل تشييك (لوحة / نوع السيارة / ملاحظات).
 *
 * المندوب بيشيّك لوحة (صوت أو يدوي أو كاميرا)، وبعدين بيعدّل عليها: يكتب ملاحظة،
 * يختار النوع، أو يصلّح اللوحة. التعديلات دي كانت بتفضل في الذاكرة بس — فبتضيع
 * من التصدير والمشاركة ومن نتيجة الفرز. هنا بنطبّقها على **السجل المحفوظ** نفسه.
 *
 * النوع والملاحظات بيتخزّنوا جوّه `row`: صفحة الفرز بتبني شيت السجلات بنشر
 * `row` كله (`...e.row`)، فأي حاجة بتتكتب هنا بتوصل لنتيجة الفرز تلقائياً.
 *
 * أي تعديل بيعلّم السجل `synced: false` عشان يترفع تاني في المزامنة.
 */

import type { FieldCheckEntry } from "./idb";

/** اسم عمود الملاحظات الافتراضي لما الشيت مافيهوش عمود ملاحظات أصلاً. */
export const NOTES_KEY = "ملاحظات";
/** اسم عمود نوع السيارة — نفس الاسم اللي التشييك الصوتي واليدوي بيكتبوا فيه. */
export const TYPE_KEY = "النوع";

/** أي عمود شكله ملاحظات (الشيتات بتسمّيه «ملاحظات» أو «الملاحظات»…). */
const NOTES_RE = /ملاح/;

/** اسم عمود الملاحظات الموجود في السجل، وإلا الافتراضي. */
function notesKeyOf(row: Record<string, string>): string {
  return Object.keys(row).find((k) => NOTES_RE.test(k)) ?? NOTES_KEY;
}

export function entryNotes(entry: FieldCheckEntry): string {
  const row = entry.row ?? {};
  const k = Object.keys(row).find((x) => NOTES_RE.test(x));
  return k ? String(row[k] ?? "") : "";
}

export function entryType(entry: FieldCheckEntry): string {
  return String(entry.row?.[TYPE_KEY] ?? "");
}

export interface EntryEdit {
  plate?: string;
  type?: string;
  notes?: string;
}

/**
 * بيرجّع **نسخة** جديدة من السجل بعد التعديل (مابيغيّرش الأصل).
 * القيمة الفاضية بتشيل العمود بدل ما تسيبه فاضي.
 */
export function applyEntryEdit(entry: FieldCheckEntry, edit: EntryEdit): FieldCheckEntry {
  if (edit.plate === undefined && edit.type === undefined && edit.notes === undefined) return entry;

  const row = { ...(entry.row ?? {}) };

  if (edit.type !== undefined) {
    const t = edit.type.trim();
    if (t) row[TYPE_KEY] = t; else delete row[TYPE_KEY];
  }
  if (edit.notes !== undefined) {
    const k = notesKeyOf(row);
    const n = edit.notes.trim();
    if (n) row[k] = n; else delete row[k];
  }

  const plate = edit.plate !== undefined && edit.plate.trim() ? edit.plate.trim() : entry.plate;
  return { ...entry, plate, row, synced: false };
}

/**
 * fieldCheck.ts — pure helpers for the field-check sheet (dedupe + search).
 * Kept separate from idb.ts so the logic is unit-testable without IndexedDB.
 */

import { normalizePlate, bankPlateToArabic } from "./plateParser";
import type { FieldCheckEntry } from "./idb";

/** Normalized comparison key for a plate (spaces stripped, alef unified, EN→AR). */
export function plateKey(raw: string): string {
  return normalizePlate(bankPlateToArabic(String(raw ?? "")));
}

/** The existing sheet entry for this plate, if any (ignores spaces/alef/EN-AR). */
export function findDuplicateEntry(
  entries: FieldCheckEntry[],
  plate: string
): FieldCheckEntry | undefined {
  const key = plateKey(plate);
  if (!key) return undefined;
  return entries.find((e) => plateKey(e.plate) === key);
}

/** True when the entry matches a free-text query (plate / method / any column). */
export function entryMatchesQuery(entry: FieldCheckEntry, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  const q = raw.toLowerCase();

  const qKey = plateKey(raw);
  if (qKey && plateKey(entry.plate).includes(qKey)) return true;
  if (entry.method.toLowerCase().includes(q)) return true;
  for (const v of Object.values(entry.row)) {
    if (String(v ?? "").toLowerCase().includes(q)) return true;
  }
  return false;
}

/** Filter the sheet by a free-text query (returns all when blank). */
export function filterFieldEntries(entries: FieldCheckEntry[], query: string): FieldCheckEntry[] {
  if (!query.trim()) return entries;
  return entries.filter((e) => entryMatchesQuery(e, query));
}

/**
 * مفتاح «نفس اللوحة في نفس الدقيقة» — أو `null` لو التوقيت مش مقروء.
 * بنقطع الثواني عشان ٨ إرسالات لنفس النطق في نفس الدقيقة تبقى صف واحد.
 */
function sameMinuteKey(entry: FieldCheckEntry): string | null {
  const key = plateKey(entry.plate);
  if (!key) return null;
  const t = new Date(entry.checkedAt).getTime();
  if (!Number.isFinite(t)) return null;   // توقيت باظ ⇒ مانجمّعش، الصف يفضل
  return `${key}@${Math.floor(t / 60_000)}`;
}

/** أي الصفّين أكمل — الفايز بياخد بياناته (بس المعرّف بيفضل بتاع الأول). */
function richer(a: FieldCheckEntry, b: FieldCheckEntry): FieldCheckEntry {
  const score = (e: FieldCheckEntry) =>
    (e.lat != null && e.lng != null ? 2 : 0) +
    (e.mapsLink ? 1 : 0) +
    Object.keys(e.row ?? {}).length;
  return score(b) > score(a) ? b : a;
}

/**
 * بيجمّع تكرار نفس اللوحة في نفس الدقيقة في صف واحد.
 *
 * ليه موجودة: محرك الصوت بيعيد إرسال نفس النطق، وحارس الـ٦ ثواني في صفحة
 * التشييك بيسمح بصف جديد بعد ما الوقت يعدّي — فلوحة واحدة طلعت ٨ مرات في ٧٦
 * ثانية بنفس الـGPS بالظبط. ده تنضيف **للعرض والتصدير**؛ السجلات الأصلية في
 * قاعدة البيانات ماتتلمسش (مفيش مسح تلقائي لداتا المندوب).
 *
 * القاعدة بالظبط زي ما المالك طلبها: نفس الحروف والأرقام + نفس الوقت والتاريخ.
 * دقيقة مختلفة = تشييك حقيقي تاني ⇒ **بيفضل**.
 *
 * الصف الأول هو اللي بيفضل (بمعرّفه) عشان أي تعديل متربط بيه مايضيعش، بس
 * بياخد البيانات الأكمل من إخواته (مثلاً واحد لحق يسجّل GPS والتاني لأ).
 */
export function collapseSameMinuteDuplicates(entries: FieldCheckEntry[]): FieldCheckEntry[] {
  const out: FieldCheckEntry[] = [];
  const at = new Map<string, number>();   // المفتاح → مكانه في `out`
  for (const entry of entries) {
    const key = sameMinuteKey(entry);
    if (key === null) { out.push(entry); continue; }
    const seen = at.get(key);
    if (seen === undefined) {
      at.set(key, out.length);
      out.push(entry);
      continue;
    }
    const best = richer(out[seen], entry);
    out[seen] = { ...best, id: out[seen].id };   // المعرّف بتاع الأول يفضل
  }
  return out;
}

/**
 * مجموعات التكرار: معرّف الصف **الظاهر** → كل معرّفات المجموعة (هو وإخواته).
 *
 * لازمتها إن `collapseSameMinuteDuplicates` بتخفي الإخوات مش بتمسحهم، فلو
 * المندوب مسح الصف الظاهر هيطلع مكانه أخوه ⇒ «مسحته ورجع». فالمسح بيستخدم
 * الخريطة دي عشان يشيل المجموعة كلها. الصفوف اللي مالهاش تكرار مش بتتحط.
 */
export function sameMinuteDuplicateIds(entries: FieldCheckEntry[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  const firstId = new Map<string, string>();
  for (const entry of entries) {
    const key = sameMinuteKey(entry);
    if (key === null) continue;
    const ids = byKey.get(key);
    if (ids) ids.push(entry.id);
    else { byKey.set(key, [entry.id]); firstId.set(key, entry.id); }
  }
  const out = new Map<string, string[]>();
  for (const [key, ids] of byKey) {
    if (ids.length > 1) out.set(firstId.get(key)!, ids);
  }
  return out;
}

/**
 * نفس قاعدة «نفس اللوحة في نفس الدقيقة» بس لأي شكل صفوف (مثلاً سجلات
 * المجموعة الجاية من السيرفر). `owner` بيفصل المناديب عن بعض — **مندوبين
 * مختلفين ممكن يشيّكوا نفس اللوحة في نفس الدقيقة بشكل شرعي** فمايتجمّعوش.
 * الأول بيفضل (الترتيب محفوظ)، وأي صف توقيته مش مقروء بيعدّي زي ما هو.
 */
export function dedupeSameMinuteRows<T>(
  rows: T[],
  get: (row: T) => { plate: string; at: string; owner?: string },
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const { plate, at, owner } = get(row);
    const key = plateKey(plate);
    const t = new Date(at).getTime();
    if (!key || !Number.isFinite(t)) { out.push(row); continue; }
    const k = `${owner ?? ""}|${key}@${Math.floor(t / 60_000)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

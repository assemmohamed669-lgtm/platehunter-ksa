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

/**
 * الكتابة دي **لوحة** ولا كلام عادي؟
 *
 * لوحة سعودية = ٣ حروف + ٤ أرقام. بنعتبرها لوحة لو بعد التطبيع فيها حروف
 * عربية/أرقام بس، وقصيرة، و(فيها رقم **أو** حروفها ٣ أو أقل). كده «3706»
 * و«رري» و«رري3706» تعدّي، و«النسيم» و«متشيكة بالكاميرا» لأ — فالبحث بالحي أو
 * بطريقة التشييك يفضل شغّال زي ما هو.
 */
export function looksLikePlateQuery(query: string): boolean {
  const key = plateKey(query);
  if (!key || key.length > 8) return false;
  if (!/^[؀-ۿ0-9]+$/.test(key)) return false;
  const digits = key.replace(/[^0-9]/g, "").length;
  const letters = key.length - digits;
  return digits > 0 || letters <= 3;
}

/**
 * True when the entry matches a free-text query (plate / method / any column).
 *
 * لما الكتابة تبقى **لوحة**، البحث بيتقفل على عمود اللوحة بس — المندوب بيدوّر
 * على لوحة معيّنة، فصف تاني صادف إن أرقامها في عمود الحي أو الملاحظة كان
 * بيلخبطه. أي كلام تاني بيدوّر في كل الأعمدة زي الأول.
 */
export function entryMatchesQuery(entry: FieldCheckEntry, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  return matchesPrepared(entry, prepareQuery(raw));
}

/** القيم المشتقّة من نص البحث — بتتحسب **مرة واحدة** مش مع كل سجل. */
interface PreparedQuery { q: string; qKey: string; plateOnly: boolean }

function prepareQuery(raw: string): PreparedQuery {
  return { q: raw.toLowerCase(), qKey: plateKey(raw), plateOnly: looksLikePlateQuery(raw) };
}

function matchesPrepared(entry: FieldCheckEntry, p: PreparedQuery): boolean {
  const key = plateKey(entry.plate);
  if (p.plateOnly) return key.includes(p.qKey);
  if (p.qKey && key.includes(p.qKey)) return true;
  if (entry.method.toLowerCase().includes(p.q)) return true;
  for (const v of Object.values(entry.row)) {
    if (String(v ?? "").toLowerCase().includes(p.q)) return true;
  }
  return false;
}

/** Filter the sheet by a free-text query (returns all when blank). */
export function filterFieldEntries(entries: FieldCheckEntry[], query: string): FieldCheckEntry[] {
  const raw = query.trim();
  if (!raw) return entries;
  // البحث بيتنده مع **كل حرف** على كل السجلات، فتحضير نص البحث بيتعمل مرة
  // واحدة برّه اللفّة بدل تلات مرات لكل سجل.
  const prepared = prepareQuery(raw);
  return entries.filter((e) => matchesPrepared(e, prepared));
}

/**
 * نافذة «نفس التشييك»: إرسالات محرّك الصوت المتكررة بتيجي في ثواني معدودة.
 * ٥ دقايق واسعة كفاية تلمّ الـ٧٦ ثانية اللي حصلت فعلاً، وضيّقة كفاية إن تشييك
 * حقيقي تاني (المندوب رجع للعربية تاني) يفضل صف مستقل.
 */
const SAME_CHECK_WINDOW_MS = 5 * 60_000;

/** مفتاح الموقع — الرابط المحفوظ، وإلا الإحداثيات مقرّبة لـ~١ متر. */
function locationKey(entry: FieldCheckEntry): string | null {
  const link = String(entry.mapsLink ?? "").trim();
  if (link) return link;
  if (typeof entry.lat === "number" && typeof entry.lng === "number") {
    return `${entry.lat.toFixed(5)},${entry.lng.toFixed(5)}`;
  }
  return null;
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
 * بيمشي على السجلات ويقرّر كل صف: إما تشييك جديد، أو إرسال مكرّر لتشييك قبله.
 *
 * القاعدة: **نفس اللوحة + نفس الموقع + جوّه نافذة ٥ دقايق** = تشييك واحد.
 * النافذة متثبّتة على **أول** صف في المجموعة (مش بتتمدّد مع كل مكرّر) عشان
 * سلسلة طويلة ماتبلعش تشييك حقيقي بعدها.
 *
 * لو الصف **مالوش موقع** (GPS مقفول أو فشل) بنرجع لقاعدة الدقيقة — أضيق، عشان
 * من غير موقع مانقدرش نفرّق بين إرسال مكرّر وتشييك تاني في نفس المكان.
 *
 * المعيار الحاكم اللي المالك حدّده: «شيّكها مرة تظهر مرة، شيّكها مرتين تظهر
 * مرتين» — فأي شك بيروح ناحية **إبقاء** الصف.
 */
function groupDuplicateChecks(entries: FieldCheckEntry[]): number[] {
  // بيرجّع لكل صف رقم مجموعته (موقع الصف الأول فيها في `entries`).
  const groupOf: number[] = [];
  // آخر مجموعة مفتوحة لكل (لوحة + موقع): موقعها ووقت أول صف فيها.
  const open = new Map<string, { at: number; t0: number }>();
  entries.forEach((entry, i) => {
    const plate = plateKey(entry.plate);
    const t = new Date(entry.checkedAt).getTime();
    if (!plate || !Number.isFinite(t)) { groupOf[i] = i; return; }   // توقيت باظ ⇒ صف مستقل
    const loc = locationKey(entry);
    const key = loc === null ? `${plate}|~${Math.floor(t / 60_000)}` : `${plate}|${loc}`;
    const window = loc === null ? 60_000 : SAME_CHECK_WINDOW_MS;
    const prev = open.get(key);
    if (prev && t - prev.t0 <= window) { groupOf[i] = prev.at; return; }
    open.set(key, { at: i, t0: t });
    groupOf[i] = i;
  });
  return groupOf;
}

/**
 * بيجمّع الإرسالات المكرّرة لنفس التشييك في صف واحد.
 *
 * ليه موجودة: لوحة واحدة طلعت **٨ مرات** في ٧٦ ثانية بنفس الـGPS بالظبط —
 * محرّك الصوت بيعيد إرسال نفس النطق. ده تنضيف **للعرض والتصدير**؛ السجلات
 * الأصلية في قاعدة البيانات ماتتلمسش (مفيش مسح تلقائي لداتا المندوب).
 *
 * الصف الأول هو اللي بيفضل (بمعرّفه) عشان أي تعديل متربط بيه مايضيعش، بس
 * بياخد البيانات الأكمل من إخواته (مثلاً واحد لحق يسجّل GPS والتاني لأ).
 */
export function collapseDuplicateChecks(entries: FieldCheckEntry[]): FieldCheckEntry[] {
  const groupOf = groupDuplicateChecks(entries);
  const out: FieldCheckEntry[] = [];
  const posOf = new Map<number, number>();   // رقم المجموعة → مكانها في `out`
  entries.forEach((entry, i) => {
    const g = groupOf[i];
    const at = posOf.get(g);
    if (at === undefined) { posOf.set(g, out.length); out.push(entry); return; }
    const best = richer(out[at], entry);
    out[at] = { ...best, id: out[at].id };   // المعرّف بتاع الأول يفضل
  });
  return out;
}

/**
 * مجموعات التكرار: معرّف الصف **الظاهر** → كل معرّفات المجموعة (هو وإخواته).
 *
 * لازمتها إن `collapseDuplicateChecks` بتخفي الإخوات مش بتمسحهم، فلو المندوب
 * مسح الصف الظاهر هيطلع مكانه أخوه ⇒ «مسحته ورجع». فالمسح بيستخدم الخريطة دي
 * عشان يشيل المجموعة كلها. الصفوف اللي مالهاش تكرار مش بتتحط.
 */
export function duplicateCheckIds(entries: FieldCheckEntry[]): Map<string, string[]> {
  const groupOf = groupDuplicateChecks(entries);
  const byGroup = new Map<number, string[]>();
  entries.forEach((entry, i) => {
    const list = byGroup.get(groupOf[i]);
    if (list) list.push(entry.id);
    else byGroup.set(groupOf[i], [entry.id]);
  });
  const out = new Map<string, string[]>();
  for (const [g, ids] of byGroup) if (ids.length > 1) out.set(entries[g].id, ids);
  return out;
}

/**
 * نفس القاعدة لأي شكل صفوف (مثلاً سجلات المجموعة الجاية من السيرفر).
 * `owner` بيفصل المناديب عن بعض — **مندوبين مختلفين ممكن يشيّكوا نفس اللوحة في
 * نفس الوقت والمكان بشكل شرعي** فمايتجمّعوش.
 */
export function dedupeDuplicateRows<T>(
  rows: T[],
  get: (row: T) => { plate: string; at: string; owner?: string; location?: string | null },
): T[] {
  const entries = rows.map((r) => {
    const g = get(r);
    return {
      id: "", plate: `${g.owner ?? ""} ${g.plate}`, row: {}, method: "",
      checkedAt: g.at, mapsLink: g.location ?? undefined,
    } as FieldCheckEntry;
  });
  const groupOf = groupDuplicateChecks(entries);
  const seen = new Set<number>();
  const out: T[] = [];
  rows.forEach((row, i) => {
    if (seen.has(groupOf[i])) return;
    seen.add(groupOf[i]);
    out.push(row);
  });
  return out;
}

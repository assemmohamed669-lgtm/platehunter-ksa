/**
 * ══════════════════════════════════════════════════════════════════════
 *  🗂️ شيت السجلات جاهز على البرنامج — للفرز
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢١ أكتوبر ٢٠٢٦): «باقصي سرعه تكون السجلات والداتا قاريه علي البرنامج والحاجه التانيه يفرز علي كامل شيت
 * الداتا اللي رافعه وكامل السجلات اللي هو مصدرها كلها» · «مش كل شوي يحمل من جديد اللي يحمل من جديد بس اللوحات الجديدة».
 *
 * كانت صفحة الفرز كل فتحة بتقرا **كل** السجلات من الجهاز وتلمّ المكرر وتبني الجدول من الأول (١٨ ألف سجل عند مندوب).
 * دلوقتي:
 *  · السجلات من النسخة اللي في الذاكرة (\`getFieldCheckMirror\` في \`lib/idb.ts\`) — اتقرت مرة، وأي حفظ/تصدير/مسح/مزامنة
 *    بيعدّلها على طول (الجديد بس).
 *  · الجدول بيتبني منها في لحظة، وبيتخزّن لحد ما حاجة تتغيّر (النسخة · المجموعات المستخبية · قفل السجلات · الاسم).
 *  · **نفس الجدول بالحرف** اللي كانت الصفحة بتبنيه (المكرر في نفس الدقيقة سطر واحد، حي المندوب، GPS، التاريخ، المندوب).
 */
import { getFieldCheckMirror, type FieldCheckEntry } from "./idb";
import { withoutHiddenTeams } from "./activeTeam";
import { recordsLockedNow } from "./groupLocks";
import { collapseDuplicateChecks } from "./fieldCheck";
import { recordAreaRow } from "./recordArea";
import { MUJAMMAA_RECORD_PREFIX } from "./mujammaaRecords";
import { toMapsLink } from "./gps";
import { normalizePlate, bankPlateToArabic } from "./plateParser";

export type RecordsTable = { headers: string[]; rows: Record<string, string>[] };

/** تاريخ تشييك المندوب بنفس شكل صفحة التشييك (يوم-شهر-سنة ساعة:دقيقة). */
export function fmtCheckDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** جدول السجلات للفرز من السجلات (الأحدث الأول) — `null` لو مفيش. */
export function buildRecordsTable(entries: FieldCheckEntry[], ownName: string): RecordsTable | null {
  // نفس اللوحة في نفس الدقيقة = تشييك واحد ⇒ نتيجة فرز واحدة.
  return buildRecordsTableFromCollapsed(collapseDuplicateChecks(entries), ownName);
}

/** نفس `buildRecordsTable` من سجلات **اتلمّ مكررها** خلاص (`getRecordsEntries`) — مابنلمّش مرتين. */
export function buildRecordsTableFromCollapsed(fieldEntries: FieldCheckEntry[], ownName: string): RecordsTable | null {
  if (fieldEntries.length === 0) return null;
  // 📍 حي المندوب (بأي اسم من التلاتة) ⇐ عمود واحد «الحي-الشارع» (`lib/recordArea.ts`)
  const recRows = fieldEntries.map((e) => recordAreaRow(e));
  const keys = new Set<string>(["رقم اللوحة"]);
  for (const r of recRows) for (const k of Object.keys(r)) keys.add(k);
  keys.add("GPS");
  keys.add("التاريخ");   // تاريخ تشييك المندوب — لازم يبان في نتيجة السجلات ومشاركتها
  keys.add("المندوب");   // مين سجّلها — بيفرق لما سجلات المجموعة تتلم مع بتاعته
  const headers = [...keys];
  const rows = fieldEntries.map((e, i) => ({
    "رقم اللوحة": e.plate,
    ...recRows[i],
    // موقع وقت التشييك: نفضّل الرابط المحفوظ، وإلا نبنيه من الإحداثيات
    // (بعض السجلات عندها lat/lng بدون mapsLink) — عشان «خريطة» تفتح صح.
    "GPS": e.mapsLink || (typeof e.lat === "number" && typeof e.lng === "number" ? toMapsLink(e.lat, e.lng) : ""),
    // وقت التشييك الفعلي (مش عمود من الشيت) — بيغلب أي «تاريخ» جوه e.row.
    "التاريخ": e.checkedAt ? fmtCheckDate(e.checkedAt) : (e.row?.["التاريخ"] ?? ""),
    "المندوب": ownName,
  } as Record<string, string>));
  return { headers, rows };
}

/** نفس ترتيب قراية الجهاز (`getAllFieldCheckEntriesRaw`): الأحدث الأول، والمتساوي بالمعرّف. */
function newestFirst(a: FieldCheckEntry, b: FieldCheckEntry): number {
  const d = new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime();
  if (d) return d;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const raw = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };

let cache: { key: string; table: RecordsTable | null } | null = null;
let entriesCache: { key: string; entries: FieldCheckEntry[] } | null = null;

/**
 * سجلات الفرز (المكرر في نفس الدقيقة واحد، الأحدث الأول، من غير المجموعات المستخبية) — **نفس**
 * `collapseDuplicateChecks(await getAllFieldCheckEntries())` بالحرف، بس من الذاكرة ومخزّنة لحد ما حاجة تتغيّر.
 * «صوت فقط» ومربع «شيت السجلات» بيفرزوا ويعدّوا منها.
 */
export async function getRecordsEntries(): Promise<FieldCheckEntry[]> {
  const { entries, version } = await getFieldCheckMirror();
  const key = [version, raw("ph:hiddenRecordTeams"), raw("ph:hideLegacyRecords")].join("|");
  if (version >= 0 && entriesCache?.key === key) return entriesCache.entries;
  const out = collapseDuplicateChecks(withoutHiddenTeams(entries.slice().sort(newestFirst)));
  if (version >= 0) entriesCache = { key, entries: out };
  return out;
}

/**
 * 🗂️ شيت السجلات للفرز — من الذاكرة، ومابيتبنيش تاني إلا لو حاجة اتغيّرت. **عمره ما بيرجّع شيت أقدم من السجلات.**
 * `ownName` = اسمي في عمود «المندوب».
 */
export async function getRecordsSheet(ownName: string): Promise<{ table: RecordsTable | null }> {
  if (recordsLockedNow()) return { table: null };   // 🔒 عضو مقفول عليه السجلات ⇒ مابتدخلش الفرز
  const { version } = await getFieldCheckMirror();
  const key = [version, raw("ph:hiddenRecordTeams"), raw("ph:hideLegacyRecords"), ownName].join("|");
  if (version >= 0 && cache?.key === key) return { table: cache.table };
  const table = buildRecordsTableFromCollapsed(await getRecordsEntries(), ownName);
  if (version >= 0) cache = { key, table };
  return { table };
}

/**
 * 🔢 كام سجل الفرز بيقراه — **خام** زي «الكل» في صفحة السجلات (الإرسال المكرر لنفس التشييك جوّاه)، مقسوم «سجل التشييك»
 * و«داتا التسجيلات» (المجمّع)، من غير المجموعات المستخبية. المالك (٢١ أكتوبر ٢٠٢٦) شاف «سجل التشييك ١٠٣٧» و«قاري ٥٤٩
 * لوحة» وافتكر إن الفرز مش بيقرا كله — ٥٤٩ دول لوحات **مختلفة**.
 */
export async function getRecordsSummary(): Promise<{ check: number; mj: number }> {
  const { entries } = await getFieldCheckMirror();
  let check = 0, mj = 0;
  for (const e of withoutHiddenTeams(entries)) {
    if (e.id.startsWith(MUJAMMAA_RECORD_PREFIX)) mj++;
    else check++;
  }
  return { check, mj };
}

/** «قاري — X صف · Y لوحة» */
export function recordsSheetStats(t: RecordsTable | null): { rows: number; plates: number } {
  if (!t) return { rows: 0, plates: 0 };
  const plates = new Set<string>();
  for (const r of t.rows) {
    const n = normalizePlate(bankPlateToArabic(String(r["رقم اللوحة"] ?? "")));
    if (n) plates.add(n);
  }
  return { rows: t.rows.length, plates: plates.size };
}

/** للاختبارات بس */
export function __resetRecordsSheetForTest(): void {
  cache = null;
  entriesCache = null;
}

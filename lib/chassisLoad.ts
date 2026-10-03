/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔧 خريطة لوحة ← رقم الهيكل (الشاص) — **في الخلفية**، مرة واحدة لكل ملف
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٣ أكتوبر ٢٠٢٦) وافق على تحميل رقم الهيكل في الخلفية بحيث الصفحة
 * ماتهنّجش أبداً — بشرط إن ميزة الهيكل نفسها تفضل شغّالة **زي ما هي بالظبط**
 * (بتظهر تحت اللوحة المطلوبة وبتتكتب في السجلات المصدّرة)، ومن غير ما تأثّر على
 * قراية لوحات ملف التشييك ولا صفّارة المطلوب.
 *
 * 🔴 القديم (تأثير loadCheck في صفحة «الجديد»): `readAllSheets` = `XLSX.read`
 *    متزامن **على الخيط الرئيسي** لملف التشييك كله في كل فتحة باردة للتطبيق
 *    (الكاش كان في الذاكرة بس). ملف ٦٠٬٥١٣ صف = ٨–١٦ ثانية تهنيج و١٢٠–٢٥٠ ميجا.
 *    وكمان وقت الرفع كان بيتحلّل **مرتين** (نداءين ورا بعض لنفس الملف).
 *
 * الجديد:
 *  ① الخريطة محفوظة على الجهاز بالبصمة (`getPersistedChassis`) ⇒ الفتحة الباردة
 *     بتقراها جاهزة، من غير ما تلمس الملف خالص.
 *  ② لو لازم تتحسب: الملف بيتقرا بـ`readAllSheetsRaw` — **في الـworker**، بعيد عن
 *     الشاشة — والبناء نفسه على دفعات بينها نَفَس للشاشة.
 *  ③ نداءين لنفس الملف في نفس الوقت ⇒ قراءة واحدة (وعد واحد شغّال).
 *
 * ⚠️ الخريطة **لازم تطلع نفسها حرفياً** زي القديم: نفس كشف العمودين، نفس
 *    التطبيع، **أول ظهور يكسب** (الورقات المحمّلة الأول، وبعدين ورقات الملف
 *    بالترتيب). القارئ الجديد بيرجّع صفوف خام (مصفوفات) — فبنعيد بناء نفس شكل
 *    `sheet_to_json` (العناوين/الصفوف) اللي القديم كان شايفه. متحقَّق منه
 *    بالاختبار على ملف حقيقي الشكل مقابل نسخة حرفية من الكود القديم
 *    (__tests__/chassisLoad.test.ts).
 */
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "./plateParser";
import { detectChassisColumn } from "./chassis";
import {
  getCachedChassis,
  setCachedChassis,
  getPersistedChassis,
  setPersistedChassis,
} from "./chassisCache";

/** ورقة جاهزة (زي اللي في IDB أو اللي `readAllSheets` كان بيرجّعها). */
export interface ChassisTable {
  headers: string[];
  rows: Record<string, string>[];
}

/** ورقة خام من `readAllSheetsRaw` (القارئ اللي بيشتغل في الـworker). */
export interface RawSheet {
  name: string;
  aoa: unknown[][];
  hidden?: boolean;
}

export interface LoadChassisOptions {
  /**
   * بصمة الملف (من `checkFingerprint` + الملفات الإضافية). `null` ⇒ مفيش كاش
   * خالص (بيتحسب كل مرة).
   */
  fingerprint: string | null;
  /** الورقات المحمّلة بالفعل (الأساسي + check-2…) — بتدخل الأول وبتكسب. */
  sources: readonly ChassisTable[];
  /** الملف الأصلي — عشان عمود الهيكل كتير بيكون في ورقة تانية. */
  blob?: Blob | null;
  fileName?: string | null;
  /**
   * ختم الرفع (`uploadedAt` من IndexedDB) — عشان هاش محتوى الملف يتحسب **مرة
   * واحدة لكل ملف في الجلسة** (كل قراية من IndexedDB بترجّع Blob جديد لنفس الملف).
   */
  fileStamp?: string | null;
  /** القارئ — افتراضياً `readAllSheetsRaw` (في الـworker). قابل للتبديل للاختبار. */
  readSheets?: (file: File) => Promise<RawSheet[]>;
  /**
   * **للاختبار بس** — الصفحة مابتبعتهوش. الافتراضي `READER_VERSION`؛ الاختبار
   * بيبعت رقم تاني عشان يثبت إن رفع النسخة بيبطّل الكاش (الذاكرة + الجهاز).
   */
  readerVersion?: number;
}

/**
 * 🔢 **نسخة القارئ — جزء من مفتاح الكاش** (الذاكرة + المحفوظ على الجهاز).
 *
 * ⚠️ **للي هيعدّل: ارفع الرقم ده (+١) مع أي تغيير** في:
 *   · القارئ الخام `readAllSheetsRaw` (في `lib/excel.ts` والـworker بتاعه):
 *     صيغ الخلايا، التواريخ، الورقات/الصفوف المخفية، الخلايا المدموجة…
 *   · إعادة بناء شكل SheetJS هنا: `layoutOf` (العناوين / `__EMPTY` / `_1`)،
 *     `isBlankRow`، `rowObject`، `visibleSheets`، أو قراية العمودين في
 *     `addRawSheetsChunked`.
 *   · أي حاجة تغيّر **قيم أو ترتيب** الخريطة اللي بتطلع من نفس الملف.
 *
 * ليه: ختم المنطق (`chassisLogicStamp` في `lib/chassisCache.ts`) بيلقط لوحده
 * تغيير التطبيع وكشف العمودين بس — **مش** القارئ ولا بناء العناوين. من غير
 * رفع الرقم، الخرايط اللي اتبنت بالقارئ القديم بتفضل محفوظة على موبايلات
 * المناديب و**بتتقري غلط للأبد** (المفتاح هو هو). رفعه ⇒ مفتاح جديد ⇒ كل
 * خريطة بتتحسب من جديد مرة واحدة، والقديمة بتتشال لوحدها بالتقليم
 * (`PERSISTED_CHASSIS_KEEP`). مثبّت في `__tests__/chassisLoad.test.ts`.
 */
export const READER_VERSION = 1;

// ─── المنطق نفسه (حرفياً من الصفحة) ─────────────────────────────────────────

/** عمود اللوحة وعمود الهيكل — أو `null` لو واحد فيهم مش موجود (الورقة بتتخطّى). */
function columnsOf(headers: string[], rows: Record<string, string>[]): [string, string] | null {
  const pCol = detectPlateColumn(headers, rows);
  const cCol = detectChassisColumn(headers, rows);
  if (!pCol || !cCol) return null;
  return [pCol, cCol];
}

/** نفس سطرين القديم بالحرف — أول ظهور يكسب. */
function addPair(map: Map<string, string>, plate: unknown, vin: unknown): void {
  const key = normalizePlate(bankPlateToArabic(String(plate ?? "")));
  const v = String(vin ?? "").trim();
  if (key && v && !map.has(key)) map.set(key, v);
}

/**
 * خريطة لوحة ← هيكل من ورقات جاهزة — **نفس `addSheet` القديمة بالحرف**: نفس
 * كشف العمودين، نفس التطبيع، وأول ظهور يكسب (بالترتيب اللي الورقات جاية بيه).
 * `into` ⇒ بيكمّل على خريطة موجودة (اللي فيها مابيتغيّرش).
 */
export function buildChassisMap(
  sheets: readonly ChassisTable[],
  into: Map<string, string> = new Map(),
): Map<string, string> {
  for (const t of sheets) {
    const cols = columnsOf(t.headers, t.rows);
    if (!cols) continue;
    const [pCol, cCol] = cols;
    for (const row of t.rows) addPair(into, row[pCol], row[cCol]);
  }
  return into;
}

// ─── من صفوف خام لنفس شكل readAllSheets ─────────────────────────────────────

/** فيها قيمة فعلية؟ (زي `trimSheetToData`: الفراغات بس = مفيش) */
const hasText = (v: unknown) => v != null && String(v).trim() !== "";

interface SheetLayout {
  /** مفتاح كل عمود بالترتيب (زي SheetJS). */
  keys: string[];
  /** العناوين بترتيب `Object.keys(rows[0])` — اللي القديم كان بيمرّره للكشف. */
  headers: string[];
}

/**
 * عناوين الورقة **زي `sheet_to_json` بالظبط** (SheetJS 0.18.5):
 *  - عرض الورقة لحد آخر عمود فيه قيمة (زي `trimSheetToData`).
 *  - الخلية الغايبة ⇒ `__EMPTY`، والمكرر ⇒ `_1`، `_2`… بنفس عدّاد SheetJS.
 *  - الترتيب النهائي = ترتيب `Object.keys` — يعني العنوان الرقمي («2024»)
 *    بيتقدّم. القديم كان بيعدّي ده لكشف العمود، فلازم يفضل زي ما هو.
 */
function layoutOf(aoa: unknown[][]): SheetLayout {
  let width = 0;
  for (const row of aoa) {
    if (!Array.isArray(row)) continue;
    for (let c = row.length - 1; c >= width; c--) {
      if (hasText(row[c])) { width = c + 1; break; }
    }
  }
  const head = (Array.isArray(aoa[0]) ? aoa[0] : []) as unknown[];
  const keys: string[] = [];
  const cnt: Record<string, number> = {};
  for (let c = 0; c < width; c++) {
    const raw = head[c];
    // الخلية الفاضية في القارئ الخام = الغايبة في SheetJS (الاتنين بيترجموها "")
    const v = raw == null || raw === "" ? "__EMPTY" : String(raw);
    let vv = v;
    let counter = cnt[v] || 0;
    if (!counter) cnt[v] = 1;
    else {
      do { vv = v + "_" + counter++; } while (cnt[vv]);
      cnt[v] = counter;
      cnt[vv] = 1;
    }
    keys.push(vv);
  }
  // نفس الكائن اللي SheetJS بيبنيه (كل الأعمدة متعبّية بـdefval) ⇒ نفس ترتيب المفاتيح
  const probe: Record<string, string> = {};
  for (const k of keys) probe[k] = "";
  return { keys, headers: Object.keys(probe) };
}

/**
 * صف فاضي؟ SheetJS بيشيل الصف اللي مافيهوش ولا خلية بقيمة؛ القارئ الخام بيرجّع
 * الغايبة "" — فالصف اللي كله "" فاضي، والصف اللي فيه فراغات بس **مش** فاضي
 * (زي SheetJS بالظبط).
 */
function isBlankRow(row: unknown, width: number): boolean {
  if (!Array.isArray(row)) return true;
  const n = Math.min(row.length, width);
  for (let c = 0; c < n; c++) {
    const v = row[c];
    if (v != null && String(v) !== "") return false;
  }
  return true;
}

function rowObject(row: unknown[], keys: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let c = 0; c < keys.length; c++) {
    const v = row[c];
    o[keys[c]] = (v === undefined ? "" : v) as string;
  }
  return o;
}

/** الورقات اللي بتدخل: الظاهرة بس — إلا لو كلها مخفية (نفس قاعدة readAllSheets). */
function visibleSheets(raw: readonly RawSheet[]): readonly RawSheet[] {
  const shown = raw.filter((s) => !s.hidden);
  return shown.length > 0 ? shown : raw;
}

/**
 * الصفوف الخام (`readAllSheetsRaw`) ⇒ **نفس** اللي `readAllSheets` كان بيرجّعه:
 * المخفية بتتخطّى، أول صف = العناوين (بأسماء SheetJS)، الصفوف الفاضية بتتشال،
 * والورقة اللي مافيهاش صفوف بيانات بتتخطّى.
 */
export function rawSheetsToTables(raw: readonly RawSheet[]): (ChassisTable & { sheetName: string })[] {
  const out: (ChassisTable & { sheetName: string })[] = [];
  for (const s of visibleSheets(raw)) {
    const aoa = Array.isArray(s.aoa) ? s.aoa : [];
    if (aoa.length === 0) continue;
    const { keys, headers } = layoutOf(aoa);
    const rows: Record<string, string>[] = [];
    for (let r = 1; r < aoa.length; r++) {
      if (!isBlankRow(aoa[r], keys.length)) rows.push(rowObject(aoa[r] as unknown[], keys));
    }
    if (!rows.length) continue;
    out.push({ sheetName: s.name, headers, rows });
  }
  return out;
}

// ─── البناء على دفعات (الشاشة تفضل تتنفّس) ──────────────────────────────────

/** صفوف بين كل نَفَس والتاني — ~١٠ مللي على موبايل متوسط. */
const CHUNK_ROWS = 2000;
/**
 * عيّنة الكشف. `detectPlateColumn` أقصاه أول ٢٠٠ صف و`detectChassisColumn` أول
 * ٤٠ — فبنبني كائنات لأول ٢٠٠ صف بس بدل ٦٠ ألف (ذاكرة الآيفون). لو الكشف
 * اتغيّر يوم وبقى يبص أبعد، اختبار «بعد صف ٢٠٠» في chassisLoad.test.ts هيقع.
 */
const DETECT_SAMPLE = 200;

const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

async function addTablesChunked(map: Map<string, string>, sheets: readonly ChassisTable[]): Promise<void> {
  for (const t of sheets) {
    const cols = columnsOf(t.headers, t.rows);
    if (!cols) continue;
    const [pCol, cCol] = cols;
    for (let i = 0; i < t.rows.length; i++) {
      const row = t.rows[i];
      addPair(map, row[pCol], row[cCol]);
      if ((i + 1) % CHUNK_ROWS === 0) await breathe();
    }
  }
}

/**
 * نفس `buildChassisMap(rawSheetsToTables(raw))` بالظبط — بس من غير ما نبني كل
 * الصفوف كائنات: الكشف على عيّنة أول ٢٠٠ صف (هو أصلاً مابيبصّش أبعد)، وبعدين
 * بنقرا العمودين من الصفوف الخام مباشرة.
 */
async function addRawSheetsChunked(map: Map<string, string>, raw: readonly RawSheet[]): Promise<void> {
  for (const s of visibleSheets(raw)) {
    const aoa = Array.isArray(s.aoa) ? s.aoa : [];
    if (aoa.length === 0) continue;
    const { keys, headers } = layoutOf(aoa);
    const sample: Record<string, string>[] = [];
    for (let r = 1; r < aoa.length && sample.length < DETECT_SAMPLE; r++) {
      if (!isBlankRow(aoa[r], keys.length)) sample.push(rowObject(aoa[r] as unknown[], keys));
    }
    if (!sample.length) continue;   // مفيش صفوف بيانات — readAllSheets كان بيتخطّاها
    const cols = columnsOf(headers, sample);
    if (!cols) continue;
    const pIdx = keys.indexOf(cols[0]);
    const cIdx = keys.indexOf(cols[1]);
    if (pIdx < 0 || cIdx < 0) continue;
    // الصف الفاضي لوحته "" ⇒ addPair بيتخطّاه لوحده — زي ما كان مش موجود.
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (Array.isArray(row)) addPair(map, row[pIdx], row[cIdx]);
      if (r % CHUNK_ROWS === 0) await breathe();
    }
    await breathe();
  }
}

// ─── التحميل ────────────────────────────────────────────────────────────────

/** FNV-1a ٣٢ بت — توقيع صغير، مش تشفير. */
function fnv1a(s: string, h = 0x811c9dc5): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * توقيع رخيص للورقات المحمّلة (عدد + عناوين + أول/نص/آخر صف).
 *
 * ليه: البصمة اللي جاية من الصفحة فيها **عدد صفوف** الملفات الإضافية بس — لو
 * المندوب بدّل check-2 بملف تاني بنفس عدد الصفوف، الكاش في الذاكرة كان بيدّي
 * الخريطة القديمة لحد ما التطبيق يتقفل. دلوقتي الخريطة بتتحفظ على الجهاز، فمن
 * غير التوقيع ده الغلط كان هيفضل **للأبد**.
 */
function sourcesSignature(sources: readonly ChassisTable[]): string {
  let h = 0x811c9dc5;
  for (const t of sources) {
    const rows = Array.isArray(t.rows) ? t.rows : [];
    const pick = (i: number) => (i >= 0 && i < rows.length ? JSON.stringify(rows[i]) : "");
    h = fnv1a(
      rows.length + "\u0001" + (t.headers ?? []).join("\u0002") + "\u0001" +
        pick(0) + "\u0001" + pick(rows.length >> 1) + "\u0001" + pick(rows.length - 1) + "\u0003",
      h,
    );
  }
  return sources.length + ":" + h.toString(16);
}

/* ─── 🔐 بصمة محتوى الملف ──────────────────────────────────────────────── */

/**
 * 🔴 **SHA-256 لمحتوى الملف نفسه.** البصمة اللي جاية من الصفحة = الاسم + حجم
 * الملف + عدد الصفوف. ملف اترفع تاني بنفس الاسم والحجم بس **رقم هيكل اتصحّح**
 * جوّاه (أو في ورقة تانية) كان هياخد الخريطة القديمة — والخريطة دلوقتي محفوظة
 * على الجهاز، فالغلط كان هيفضل **للأبد** بدل لحد ما التطبيق يتقفل.
 *
 * `crypto.subtle` بيشتغل برّه الخيط الرئيسي (مابيجمّدش الشاشة) ومابيحلّلش
 * الإكسيل — فمسموح حتى وقت التسجيل. مش متاح أو فشل ⇒ `null` ⇒ البصمة القديمة
 * لوحدها (زي الأول). **مرة واحدة لكل ملف في الجلسة**: بختم الرفع (`fileStamp`)،
 * أو بالـBlob نفسه لو مافيش ختم.
 */
const HASH_MEMO_MAX = 4;
const hashByStamp = new Map<string, Promise<string | null>>();
const hashByBlob = new WeakMap<Blob, Promise<string | null>>();

async function sha256Hex(blob: Blob): Promise<string | null> {
  try {
    const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
    if (!subtle || typeof subtle.digest !== "function" || typeof blob.arrayBuffer !== "function") return null;
    const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}

function contentHashOf(opts: LoadChassisOptions): Promise<string | null> {
  const blob = opts.blob;
  if (!blob) return Promise.resolve(null);
  if (opts.fileStamp) {
    const k = opts.fileStamp + "|" + (opts.fingerprint ?? "") + "|" + blob.size;
    const hit = hashByStamp.get(k);
    if (hit) return hit;
    const p = sha256Hex(blob);
    hashByStamp.set(k, p);
    // آخر كام ملف بس — مانراكمش وعود
    while (hashByStamp.size > HASH_MEMO_MAX) hashByStamp.delete(hashByStamp.keys().next().value as string);
    return p;
  }
  const hit = hashByBlob.get(blob);
  if (hit) return hit;
  const p = sha256Hex(blob);
  hashByBlob.set(blob, p);
  return p;
}

/**
 * مفتاح الكاش (الذاكرة + الجهاز) = نسخة القارئ (`READER_VERSION`) + البصمة +
 * توقيع الورقات المحمّلة + هاش المحتوى. `null` ⇒ مفيش كاش خالص (مفيش بصمة).
 */
async function cacheKeyOf(opts: LoadChassisOptions): Promise<string | null> {
  if (!opts.fingerprint) return null;
  const rv = opts.readerVersion ?? READER_VERSION;
  const base = "r" + rv + "§" + opts.fingerprint + "§" + sourcesSignature(opts.sources);
  if (!opts.blob) return base;
  const h = await contentHashOf(opts);
  return base + "§" + (h ?? "nohash");
}

/** الوعود الشغّالة — نداءين لنفس الملف في نفس الوقت ⇒ قراءة واحدة. */
const inflight = new Map<string, Promise<Map<string, string>>>();

async function readWorkbook(opts: LoadChassisOptions): Promise<RawSheet[]> {
  const read = opts.readSheets ?? (await import("./excel")).readAllSheetsRaw;
  const file = new File([opts.blob as Blob], opts.fileName || "check.xlsx");
  return read(file);
}

/**
 * 🧯 **الملف ده وقّع الموبايل وهو بيتقري؟** — المالك (٣ أكتوبر ٢٠٢٦): مندوب بآيفون ١١
 * كان بيلفّ في «جارٍ التحقق» (الصفحة تفتح، تحلّل ملف التشييك كله، الآيفون يقفلها،
 * تفتح تاني وتحلّل تاني…). قبل قراية الملف بنكتب علامة على الجهاز بمفتاح الكاش،
 * وبنشيلها لما القراية تخلص (نجحت أو فشلت). لسه موجودة لنفس المفتاح في الفتحة
 * الجاية ⇒ القراية ماخلصتش لأن الموبايل قفل الصفحة في النص ⇒ مانقراش الملف ده
 * تاني على الموبايل ده: الخريطة من الورقات المحمّلة بس **وبتتحفظ** (فمافيش محاولة
 * تانية). ملف تاني = مفتاح تاني ⇒ بيتقري عادي.
 */
export const READ_MARK_KEY = "ph:chassisReadInFlight";
function readMarkIs(key: string): boolean {
  try { return localStorage.getItem(READ_MARK_KEY) === key; } catch { return false; }
}
function setReadMark(key: string): void {
  try { localStorage.setItem(READ_MARK_KEY, key); } catch { /* تخزين مقفول — بنقرا عادي */ }
}
function clearReadMark(key: string): void {
  try { if (localStorage.getItem(READ_MARK_KEY) === key) localStorage.removeItem(READ_MARK_KEY); } catch { /* ignore */ }
}

async function compute(opts: LoadChassisOptions, key: string | null): Promise<{ map: Map<string, string>; complete: boolean }> {
  const map = new Map<string, string>();
  // 🧯 القراية اللي فاتت لنفس الملف وقّعت الموبايل ⇒ المحمّلة بس، ومحفوظة (complete)
  if (opts.blob && key && readMarkIs(key)) {
    await addTablesChunked(map, opts.sources);
    return { map, complete: true };
  }
  if (opts.blob && key) setReadMark(key);
  try {
    // الملف بيتقرا في الـworker **بالتوازي** مع الورقات المحمّلة — بس الترتيب
    // (المحمّلة الأول) محفوظ لأن الإضافة للخريطة بتستنى الاتنين بالترتيب.
    const reading: Promise<RawSheet[] | null> = opts.blob
      ? readWorkbook(opts).catch(() => null)
      : Promise.resolve(null);
    await addTablesChunked(map, opts.sources);
    if (!opts.blob) return { map, complete: true };
    const raw = await reading;
    if (!raw) return { map, complete: false };   // blob مش مقروء — نكتفي بالورقة المحمّلة (زي القديم)
    try {
      await addRawSheetsChunked(map, raw);
      return { map, complete: true };
    } catch {
      return { map, complete: false };
    }
  } finally {
    if (opts.blob && key) clearReadMark(key);
  }
}

/** الكامل بمفتاح جاهز — الجزء المتزامن لحد تسجيل الوعد عشان النداءين مايقروش مرتين. */
function loadWithKey(opts: LoadChassisOptions, key: string | null): Promise<Map<string, string>> {
  if (key) {
    const mem = getCachedChassis(key);
    if (mem) return Promise.resolve(mem);
    const running = inflight.get(key);
    if (running) return running;
  }
  const job = (async () => {
    if (key) {
      const saved = await getPersistedChassis(key);
      if (saved) {
        setCachedChassis(key, saved);
        return saved;
      }
    }
    const { map, complete } = await compute(opts, key);
    if (key) {
      setCachedChassis(key, map);
      if (complete) await setPersistedChassis(key, map);
    }
    return map;
  })();
  if (key) {
    inflight.set(key, job);
    const clear = () => { if (inflight.get(key) === job) inflight.delete(key); };
    job.then(clear, clear);
  }
  return job;
}

/**
 * خريطة لوحة ← هيكل لملف التشييك:
 *  ١. في الذاكرة (نفس الجلسة، نفس المحتوى) ⇒ فوراً.
 *  ٢. نداء شغّال لنفس الملف ⇒ نفس الوعد (قراءة واحدة).
 *  ٣. محفوظة على الجهاز ⇒ من غير ما نلمس الملف.
 *  ٤. غير كده ⇒ الورقات المحمّلة + كل ورقات الملف (في الـworker)، وبتتحفظ.
 *
 * المفتاح فيه هاش محتوى الملف (`contentHashOf`) — نفس الملف بمحتوى مختلف
 * مايرجعش خريطة قديمة.
 *
 * مابترميش: أي فشل في التخزين ⇒ بتحسب عادي؛ الملف مش مقروء ⇒ الورقات المحمّلة
 * بس (زي القديم) ومابتتحفظش على الجهاز (الفشل ممكن يكون عابر).
 */
export async function loadChassisMap(opts: LoadChassisOptions): Promise<Map<string, string>> {
  const key = await cacheKeyOf(opts);
  return loadWithKey(opts, key);
}

/**
 * 🔴 **وقت التسجيل: من غير قراية الملف خالص** — عشان رقم الهيكل يظهر تحت
 * اللوحة المطلوبة وهو بيسجّل، والملف التقيل بيستنى الإيقاف:
 *  · مافيش ملف ⇒ الكامل نفسه (مافيش حاجة تتقري أصلاً) — `final`.
 *  · في الذاكرة / تحميل شغّال لنفس الملف / محفوظة على الجهاز ⇒ `final`.
 *  · غير كده ⇒ خريطة **الورقات المحمّلة بس** (قيمها نفس قيم الكاملة لأن المحمّلة
 *    بتكسب في الاتنين) — مش `final`، ومابتتحفظش لا في الذاكرة ولا على الجهاز،
 *    والكاملة بتيجي بعد الإيقاف.
 */
export async function quickChassisMap(
  opts: LoadChassisOptions,
): Promise<{ value: Map<string, string>; final: boolean }> {
  if (!opts.blob) return { value: await loadChassisMap(opts), final: true };
  const key = await cacheKeyOf(opts);
  if (key) {
    const mem = getCachedChassis(key);
    if (mem) return { value: mem, final: true };
    const running = inflight.get(key);
    if (running) return { value: await running, final: true };
    const saved = await getPersistedChassis(key);
    if (saved) {
      setCachedChassis(key, saved);
      return { value: saved, final: true };
    }
  }
  const partial = new Map<string, string>();
  await addTablesChunked(partial, opts.sources);
  return { value: partial, final: false };
}

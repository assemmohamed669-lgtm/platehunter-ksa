/**
 * ══════════════════════════════════════════════════════════════════════
 *  «التنقل بين الصفحات بقى تقيل» — خريطة الشاص بتتحسب **مرة لكل ملف**
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «التنقل بين الصفحات عايزها سلسة… بعد ما ضيفنا
 * صفحة الجديد بقت تقيلة شوي».
 *
 * 🔴 كل مرة «الجديد» كانت بتفتح — **أو الموبايل يصحى من القفل** — كانت بتعمل
 * `readAllSheets` على ملف التشييك **كله** (٤٩ ألف لوحة) عشان تدوّر على عمود
 * الشاص في الورقات التانية. تحليل إكسل كامل على الخيط الرئيسي، ثواني على
 * الموبايل — والنتيجة **نفسها بالظبط** طول ما الملف ماتغيّرش.
 *
 * ⚠️ **نسخة واحدة بس في الذاكرة**: الآيفون بيقتل التطبيق لو الذاكرة زادت
 *    (متسجّل من صفحة الفرز). خريطة لوحة ← شاص لـ٤٩ ألف لوحة = بضعة ميجا، ولو
 *    اتحفظ أكتر من ملف كانت هتتراكم.
 */
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "./plateParser";
import { detectChassisColumn } from "./chassis";

export interface FingerprintSource {
  fileName?: string | null;
  fileBlob?: { size?: number } | null;
  rows?: readonly unknown[] | null;
}

/**
 * بصمة الملف — **من غير تاريخ** عن قصد.
 *
 * متسجّل من صفحة الفرز: الملف بيتحفظ تاني بـ`uploadedAt` جديد وهو نفس
 * المحتوى، فبصمة فيها التاريخ كانت بتضيّع الحفظ في كل مرة. الاسم + الحجم +
 * عدد الصفوف كفاية يفرّقوا ملفين في الواقع.
 */
export function checkFingerprint(rec: FingerprintSource | null | undefined): string | null {
  if (!rec) return null;
  const name = String(rec.fileName ?? "");
  const size = Number(rec.fileBlob?.size ?? 0);
  const n = Array.isArray(rec.rows) ? rec.rows.length : 0;
  return name + "|" + size + "|" + n;
}

let slot: { fp: string; map: Map<string, string> } | null = null;

/** الخريطة المحفوظة لو البصمة نفسها، وإلا `null` (لازم تتحسب). */
export function getCachedChassis(fp: string | null): Map<string, string> | null {
  if (!fp || !slot || slot.fp !== fp) return null;
  return slot.map;
}

/** يحفظ الخريطة — **بيمسح أي نسخة قبلها** (نسخة واحدة بس). */
export function setCachedChassis(fp: string | null, map: Map<string, string>): void {
  if (!fp) return;
  slot = { fp, map };
}

export function clearChassisCache(): void {
  slot = null;
}

/* ══════════════════════════════════════════════════════════════════════
 *  💾 نسخة على الجهاز (IndexedDB) — عشان الفتحة الباردة ماتحلّلش الملف تاني
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٣ أكتوبر ٢٠٢٦) وافق على تحميل رقم الهيكل في الخلفية بحيث الصفحة
 * ماتهنّجش. النسخة اللي فوق في الذاكرة بس ⇒ كل مرة التطبيق يتقفل ويتفتح كان
 * بيعيد تحليل ملف التشييك كله (٦٠ ألف صف، ٨–١٦ ثانية على الموبايل) عشان يطلّع
 * **نفس الخريطة بالظبط**. هنا بنحفظها على الجهاز بالبصمة.
 *
 * ⚠️ قاعدة **منفصلة** ("platehunter-chassis") — مالهاش علاقة بقاعدة التطبيق
 *    ("platehunter") فأي حاجة هنا مستحيل تلمس سجلات المناديب أو ملفاتهم، ومن
 *    غير ما نرفع إصدار القاعدة الرئيسية.
 * ⚠️ **أي فشل مابيوقّفش حاجة**: القراءة بترجّع null والكتابة false — والمنادي
 *    بيحسب الخريطة عادي زي الأول. (الآيفون ساعات بيقتل اتصال IndexedDB — #306.)
 * ⚠️ آخر كام ملف بس (`PERSISTED_CHASSIS_KEEP`) — مانراكمش ميجات على الموبايل.
 */

const PERSIST_DB = "platehunter-chassis";
const PERSIST_DB_VERSION = 1;
const PERSIST_STORE = "maps";
/**
 * رقم نسخة **شكل** المحفوظ وطريقة بناء الخريطة (`lib/chassisLoad.ts`). أي تغيير
 * في البناء نفسه (الترتيب، مين يكسب…) ⇒ ارفع الرقم. التغييرات في دوال التطبيع
 * والكشف بتتلقط لوحدها من العيّنات تحت (`chassisLogicStamp`). أما تغيير
 * **القارئ الخام** (`readAllSheetsRaw`) أو إعادة بناء العناوين (`layoutOf`) ⇒
 * ارفع `READER_VERSION` في `lib/chassisLoad.ts` (العيّنات هنا مابتشوفهمش).
 * (٢: المفتاح بقى فيه العيّنات + بصمة محتوى الملف — «v1|» القديم مابيرجعش.)
 */
export const PERSIST_SCHEMA = 2;

/** FNV-1a ٣٢ بت — توقيع صغير، مش تشفير. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * 🔴 **نسخة المنطق** — ناتج دوال الخريطة نفسها على عيّنات ثابتة: تطبيع اللوحة،
 * تحويل لوحات البنك بالتخطيطين، وكشف عمود اللوحة والهيكل (بالاسم وبالمحتوى).
 *
 * ليه: الخريطة المحفوظة على الموبايل اتبنت بالمنطق اللي كان وقتها. لو تحديث
 * غيّر `normalizePlate`/`bankPlateToArabic`/الكشف، الكاش القديم في الذاكرة كان
 * بيتبني من جديد مع أول فتحة — بس المحفوظ كان هيفضل **غلط** على الجهاز. أي
 * تغيير في الناتج ⇒ مفتاح جديد ⇒ المحفوظ القديم بيتجاهل ويتحسب من جديد.
 * بيتحسب **مرة واحدة** في الجلسة (أول حفظ/قراية)، ومابيرميش أبداً.
 */
let logicStamp: string | null = null;
export function chassisLogicStamp(): string {
  if (logicStamp) return logicStamp;
  let canary: string;
  try {
    const plates = ["7709 ABS", "NKD 5678", "أ ب ح 1234", "إ هـ و 0042", "HUV 1111"].map(
      (p) => normalizePlate(bankPlateToArabic(p)),
    );
    // كشف عمود الهيكل بالاسم — كل عنوان لوحده
    const byName = ["رقم الهيكل", "الشاصي", "شاسيه", "Chassis Number", "VIN", "Serial No", "بيان", "رقم اللوحة", "Plate Number"]
      .map((h) => detectChassisColumn([h]) ?? "-");
    // وبالمحتوى (عمود من غير اسم معروف)
    const rows = [
      { A: "ا ب ح 1234", B: "JTDKBAA0000000001", C: "تويوتا" },
      { A: "NKD 5678", B: "LFP82APE2N1D03256", C: "نيسان" },
      { A: "7709 ABS", B: "1HGCM82633A004352", C: "هوندا" },
    ];
    const byContent = detectChassisColumn(["A", "B", "C"], rows) ?? "-";
    const plateByName = detectPlateColumn(["م", "رقم اللوحة", "الماركة"], [{ "م": "1", "رقم اللوحة": "ا ب ح 1234", "الماركة": "تويوتا" }]) ?? "-";
    const plateByContent = detectPlateColumn(["A", "B", "C"], rows) ?? "-";
    canary = JSON.stringify([plates, byName, byContent, plateByName, plateByContent]);
  } catch {
    canary = "err";
  }
  logicStamp = "s" + PERSIST_SCHEMA + ":" + fnv1a(canary);
  return logicStamp;
}
/** عدد الملفات اللي بنحتفظ بخرايطها — الملف الحالي + كام واحد قبله. */
export const PERSISTED_CHASSIS_KEEP = 3;
/**
 * مهلة أي عملية تخزين. الفتح العادي مللي ثواني؛ لو الآيفون ساب الطلب معلّق
 * (اتصال ميت) مانستناش للأبد — نحسب الخريطة عادي.
 */
const PERSIST_TIMEOUT_MS = 4000;

interface PersistedChassis {
  fp: string;
  keys: string[];
  vins: string[];
  savedAt: number;
}

/** المفتاح على الجهاز = نسخة المنطق + البصمة (اللي فيها بصمة محتوى الملف). */
const persistKey = (fp: string) => chassisLogicStamp() + "|" + fp;

// ختم وقت **بيزيد دايماً** — حفظين في نفس المللي ثانية مايتساووش في الترتيب
// (وإلا التقليم ممكن يشيل الأحدث بدل الأقدم).
let lastStamp = 0;
function nextStamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

function openPersistDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb) { reject(new Error("IndexedDB مش متاح")); return; }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("فتح تخزين الشاص ماردّش"));
    }, PERSIST_TIMEOUT_MS);
    let req: IDBOpenDBRequest;
    try {
      req = idb.open(PERSIST_DB, PERSIST_DB_VERSION);
    } catch (e) {
      settled = true;
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PERSIST_STORE)) {
        const store = db.createObjectStore(PERSIST_STORE, { keyPath: "fp" });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // ردّ متأخر بعد المهلة ⇒ نقفله بدل ما يفضل ماسك القاعدة
      if (settled) { try { db.close(); } catch { /* ignore */ } return; }
      settled = true;
      clearTimeout(timer);
      // نسخة أحدث طلبت ترقية ⇒ نسيب الاتصال فوراً عشان الترقية تعدّي
      db.onversionchange = () => { try { db.close(); } catch { /* ignore */ } };
      resolve(db);
    };
    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(req.error ?? new Error("تعذّر فتح تخزين الشاص"));
    };
  });
}

/** عملية واحدة على القاعدة: فتح ← تنفيذ ← قفل، بمهلة. اتصال جديد كل مرة عن قصد (#306). */
async function withPersistStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, done: (v: T) => void) => void,
): Promise<T> {
  const db = await openPersistDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      let result: T;
      let has = false;
      // لو المعاملة نفسها رمت (اتصال بيتقفل) ⇒ الوعد بيترفض هنا على طول
      const tx = db.transaction(PERSIST_STORE, mode);
      const timer = setTimeout(() => reject(new Error("تخزين الشاص ماردّش")), PERSIST_TIMEOUT_MS);
      tx.oncomplete = () => { clearTimeout(timer); if (has) resolve(result); else reject(new Error("no result")); };
      tx.onerror = () => { clearTimeout(timer); reject(tx.error ?? new Error("tx error")); };
      tx.onabort = () => { clearTimeout(timer); reject(tx.error ?? new Error("tx aborted")); };
      run(tx.objectStore(PERSIST_STORE), (v) => { result = v; has = true; });
    });
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

/**
 * الخريطة المحفوظة على الجهاز لنفس البصمة، أو `null` (مش محفوظة / سجل بايظ /
 * التخزين مش شغّال). **مابترميش أبداً.**
 */
export async function getPersistedChassis(fp: string | null): Promise<Map<string, string> | null> {
  if (!fp) return null;
  try {
    const rec = await withPersistStore<PersistedChassis | undefined>("readonly", (store, done) => {
      const req = store.get(persistKey(fp));
      req.onsuccess = () => done(req.result as PersistedChassis | undefined);
    });
    if (!rec || !Array.isArray(rec.keys) || !Array.isArray(rec.vins) || rec.keys.length !== rec.vins.length) {
      return null;
    }
    const map = new Map<string, string>();
    for (let i = 0; i < rec.keys.length; i++) map.set(rec.keys[i], rec.vins[i]);
    return map;
  } catch {
    return null;
  }
}

/**
 * يحفظ الخريطة على الجهاز بالبصمة، ويشيل الأقدم لحد ما يفضل
 * `PERSISTED_CHASSIS_KEEP` بس. بيرجّع `true` لو اتحفظت. **مابترميش أبداً.**
 */
export async function setPersistedChassis(fp: string | null, map: ReadonlyMap<string, string>): Promise<boolean> {
  if (!fp) return false;
  try {
    // مصفوفتين نصوص بدل الـMap — أسرع في النسخ للتخزين وأصغر.
    const rec: PersistedChassis = {
      fp: persistKey(fp),
      keys: [...map.keys()],
      vins: [...map.values()],
      savedAt: nextStamp(),
    };
    return await withPersistStore<boolean>("readwrite", (store, done) => {
      store.put(rec);
      // التقليم: من الأحدث للأقدم، أي حاجة بعد أول KEEP بتتشال. (المفاتيح بس —
      // من غير ما نقرا الخرايط القديمة نفسها في الذاكرة.)
      let seen = 0;
      const cur = store.index("savedAt").openKeyCursor(null, "prev");
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) { done(true); return; }
        seen++;
        if (seen > PERSISTED_CHASSIS_KEEP) store.delete(c.primaryKey);
        c.continue();
      };
    });
  } catch {
    return false;
  }
}

/** يمسح كل الخرايط المحفوظة على الجهاز (للاختبارات / إعادة الضبط). مابترميش. */
export async function clearPersistedChassis(): Promise<void> {
  try {
    await withPersistStore<boolean>("readwrite", (store, done) => {
      const req = store.clear();
      req.onsuccess = () => done(true);
    });
  } catch { /* مفيش تخزين — مفيش حاجة تتمسح */ }
}

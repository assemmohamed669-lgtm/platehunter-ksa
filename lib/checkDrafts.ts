/**
 * checkDrafts — تخزين قوايم التشييك اللي لسه ما اتصدّرتش (يدوي/كاميرا/صوت).
 *
 * **ليه اتنقلت من localStorage:** الـWebView بيمسح localStorage أحياناً
 * (حصلت قبل كده وضاع شغل مندوب). القاعدة اللي المالك حطّها: «اللوحات تفضل في
 * الصفحة مكانها متتمسحش حتى لو عمل تسجيل خروج… المندوب يخسر شغله دي مفيهاش
 * تسامح». فالتخزين الأساسي بقى IndexedDB (اللي عليه `navigator.storage.persist`
 * في اللياوت)، وlocalStorage فضلت **مرآة** — نكتب فيها كمان، ونقرا منها مرة
 * واحدة وقت الترحيل بس.
 */

import { safeDraftsOn } from "./safeDrafts";

const DB_NAME = "ph-check-drafts";
const STORE = "drafts";
const DB_VERSION = 1;

/** علم بيتكتب أول ما نحفظ في IDB — بعده IDB هو مصدر الحقيقة. */
const INIT_SUFFIX = ":init";
/**
 * 🛡️ رقم النسخة — بيتكتب مع القايمة في الاتنين (IndexedDB وlocalStorage)، فالتحميل يعرف مين الأحدث.
 * IndexedDB بيتكتب بعد ٣٠٠ مللي وممكن يفشل (التليفون مليان)؛ localStorage بيتكتب على طول. (`pickNewestDraft`)
 */
const REV_SUFFIX = ":rev";
/** آخر رقم نسخة لكل قايمة — بيكبر دايماً حتى لو ساعة الموبايل رجعت لورا. */
const lastRev = new Map<string, number>();
function nextRev(key: DraftKey): number {
  const n = Math.max(Date.now(), (lastRev.get(key) ?? 0) + 1);
  lastRev.set(key, n);
  return n;
}

export type DraftKey =
  | "hits" | "ptt" | "manual" | "hits-exported" | "ptt-exported"
  /** صفوف صفحة «التسجيل الجديد» — كانت في الذاكرة بس وبتضيع لو التطبيق قفل. */
  | "trial";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve((r.result as T) ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}

async function idbPut(key: string, value: unknown, extra?: Array<[string, unknown]>): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const st = tx.objectStore(STORE);
      st.put(value, key);
      for (const [k, v] of extra ?? []) st.put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

/**
 * مين المصدر: IndexedDB لو اتكتب فيه قبل كده (حتى لو القائمة فاضية)، وإلا
 * localStorage مرة واحدة للترحيل.
 *
 * الحتة الحرجة: **القائمة الفاضية بعد التصدير مايصحّش ترجع من localStorage** —
 * وإلا اللوحات اللي اتصدّرت بتظهر تاني وتتصدّر مرتين.
 */
export function pickDraft<T>(fromIdb: T[] | null, idbInitialised: boolean, fromLocal: T[] | null | undefined): T[] {
  if (idbInitialised) return Array.isArray(fromIdb) ? fromIdb : [];
  return Array.isArray(fromLocal) ? fromLocal : [];
}

/**
 * 🛡️ ③ **أحدث نسخة تكسب** (السوبر أدمن الأول). كان IndexedDB بيكسب دايماً بعد الترحيل — فلو كتابته فشلت
 * (التليفون مليان) أو التطبيق اتقفل في الـ٣٠٠ مللي قبلها، النسخة الأقدم كانت بترجع والأحدث (اللي في
 * localStorage) بتضيع. دلوقتي: localStorage **برقم أحدث** ⇒ هي. القايمة الفاضية بعد التصدير ليها رقم أحدث
 * برضه، فاللوحات اللي اتصدّرت مابترجعش. من غير أرقام (قبل التحديث) ⇒ `pickDraft` بالحرف.
 */
export function pickNewestDraft<T>(d: {
  idb: T[] | null; idbInit: boolean; idbRev: number | null;
  local: T[] | null | undefined; localRev: number | null;
}): T[] {
  if (Array.isArray(d.local) && d.localRev != null && (!d.idbInit || d.idbRev == null || d.localRev > d.idbRev)) {
    return d.local;
  }
  return pickDraft(d.idb, d.idbInit, d.local);
}

function revOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** يقرا قائمة: IDB أولاً، وlocalStorage للترحيل. أي فشل → localStorage لوحدها. */
export async function loadDraft<T>(key: DraftKey, localKey: string): Promise<T[]> {
  let local: T[] | null = null;
  let localRev: number | null = null;
  try {
    const s = localStorage.getItem(localKey);
    if (s) local = JSON.parse(s) as T[];
    localRev = revOf(localStorage.getItem(localKey + REV_SUFFIX));
  } catch { /* مش متاحة أو بايظة */ }

  try {
    const initialised = (await idbGet<boolean>(key + INIT_SUFFIX)) === true;
    const fromIdb = await idbGet<T[]>(key);
    const idbRev = revOf(await idbGet<number>(key + REV_SUFFIX));
    // رقم النسخة الجاية لازم يبقى أكبر من أي رقم اتكتب قبل كده (حتى لو الساعة رجعت لورا)
    const seen = Math.max(localRev ?? 0, idbRev ?? 0);
    if (seen > (lastRev.get(key) ?? 0)) lastRev.set(key, seen);
    return safeDraftsOn()
      ? pickNewestDraft<T>({ idb: fromIdb, idbInit: initialised, idbRev, local, localRev })
      : pickDraft<T>(fromIdb, initialised, local);
  } catch {
    return Array.isArray(local) ? local : [];   // IDB مش متاح — نكمّل بالمرآة
  }
}

/**
 * طابور كتابة لكل مفتاح — كل حفظ بيستنى اللي قبله.
 *
 * ليه: كل نداء بيفتح اتصال IDB لوحده، والترتيب بين اتصالين **مش مضمون**. من
 * غير الطابور، كتابة قديمة ممكن تنزل بعد الجديدة فترجّع لوحات اتصدّرت أو
 * اتمسحت. مع سرعة المندوب في التسجيل ده مش احتمال نظري.
 */
const writeQueue = new Map<DraftKey, Promise<void>>();

/** آخر قيمة مستنية الكتابة لكل مفتاح + مؤقّت التجميع. */
const pending = new Map<DraftKey, { localKey: string; value: unknown[]; rev: number; timer: ReturnType<typeof setTimeout>; waiters: Array<() => void> }>();

/** المفاتيح اللي اتكتب فيها علم `:init` في الجلسة دي — مانكتبوش كل مرة. */
const initialised = new Set<DraftKey>();

/** عدّاد كتابات فعلية — للاختبار بس. */
let writeCount = 0;
export function __writeCountForTest(): number { return writeCount; }

/**
 * **تجميع الكتابات.** كل تغيير في القائمة كان بيكتبها **كلها** في IndexedDB.
 * اللوحة الواحدة بتعمل ٣-٤ تغييرات (دخول الصف · وصول الموقع · النوع/الملاحظة ·
 * الشيل وقت التصدير)، فمندوب بـ١٥٠ لوحة كان بيكتب ميجابايتات في جلسة واحدة —
 * والحصّة في المتصفّح **لكل أصل مش لكل قاعدة**، فلما تمتلئ **كل** كتابة في
 * **كل** قاعدة بتفشل، وده شكل «تعذّر حفظ أي لوحة» بالظبط.
 *
 * بنستنى ٣٠٠ مللي: الرشقة بتتكتب مرة واحدة بآخر قيمة، والمندوب مش بيحس بفرق.
 */
const COALESCE_MS = 300;

function flushNow<T>(key: DraftKey, localKey: string, value: T[], rev: number): Promise<void> {
  const next = (writeQueue.get(key) ?? Promise.resolve()).then(async () => {
    writeCount += 1;
    try {
      // القايمة ورقم نسختها في معاملة واحدة — يا الاتنين يا ولا واحد
      await idbPut(key, value, [[key + REV_SUFFIX, rev]]);
      // علم الترحيل يتكتب **مرة واحدة** في الجلسة — كان بيتكتب مع كل حفظ.
      if (!initialised.has(key)) { await idbPut(key + INIT_SUFFIX, true); initialised.add(key); }
    } catch { /* IDB مش متاح — المرآة بتغطّي */ }
  });
  writeQueue.set(key, next);
  return next;
}

/** يحفظ في IDB (الأساسي) وlocalStorage (مرآة)، بتجميع الرشقات. */
export function saveDraft<T>(key: DraftKey, localKey: string, value: T[]): Promise<void> {
  // ⚠️ **الحفظ في ذاكرة المتصفّح بيفضل فوري — مش مؤجّل.** هو متزامن ورخيص،
  // وكان بيحصل فوراً من قبل ما أضيف IndexedDB أصلاً. تأجيله كان هيفتح نافذة
  // ٣٠٠ مللي لو التطبيق اتقفل فجأة تضيع فيها آخر لوحة — والقاعدة إن شغل
  // المندوب مايضيعش. اللي بيتجمّع هو **كتابة IndexedDB بس**، وهي اللي أنا
  // ضفتها وهي اللي كانت بتضغط على مساحة التليفون.
  const rev = nextRev(key);
  try {
    localStorage.setItem(localKey, JSON.stringify(value));
    // الرقم بيتكتب **بعد** القايمة وبس لو هي اتكتبت — رقم من غير قايمته يبقى كدب
    try { localStorage.setItem(localKey + REV_SUFFIX, String(rev)); } catch { /* ممتلئة */ }
  } catch { /* ممتلئة/مقفولة */ }
  return new Promise<void>((resolve) => {
    // الكتابة اللي اتأجّلت **وعدها بيتقفل مع الكتابة اللي حلّت محلها** — قيمتها
    // أقدم فالأحدث بتغطّيها. من غير كده المنادي الأول بيستنى للأبد.
    const cur = pending.get(key);
    const waiters = cur ? cur.waiters : [];
    if (cur) clearTimeout(cur.timer);
    waiters.push(resolve);
    const timer = setTimeout(() => {
      const p = pending.get(key);
      pending.delete(key);
      if (!p) { resolve(); return; }
      const done = () => p.waiters.forEach((w) => w());
      void flushNow(key, p.localKey, p.value, p.rev).then(done, done);
    }, COALESCE_MS);
    pending.set(key, { localKey, value: value as unknown[], rev, timer, waiters });
  });
}

/** يكتب أي حاجة مستنية فوراً — قبل الإغلاق أو التصدير. */
export async function flushDrafts(): Promise<void> {
  const items = [...pending.entries()];
  for (const [key, p] of items) {
    clearTimeout(p.timer);
    pending.delete(key);
    const done = () => p.waiters.forEach((w) => w());
    void flushNow(key, p.localKey, p.value, p.rev).then(done, done);
  }
  await Promise.allSettled([...writeQueue.values()]);
}

/**
 * تحذير قبل مسح لوحات لسه ما اتصدّرتش. `null` = مفيش داعي للتحذير.
 * «لا» بترجّعه للصفحة عشان يصدّرها من الزرار لو حب.
 */
export function unexportedDeleteWarning(count: number): string | null {
  if (count <= 0) return null;
  return `انتبه: فيه ${count} لوحة مش متصدّرة للسجلات — لو مسحتها هتضيع.\n\n«موافق» = امسح   |   «إلغاء» = ارجع وصدّرها من زر التصدير`;
}

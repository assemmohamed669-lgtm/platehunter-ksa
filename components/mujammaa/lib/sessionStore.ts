/**
 * ==========================================================================
 *  حفظ النتائج على الجهاز — عشان ما تضيعش
 * ==========================================================================
 *
 *  المشكلة الحقيقية اللي بتحلّها
 *  ─────────────────────────────
 *  أندرويد بيقفل تبويبات كروم اللي في الخلفية عشان يفضّي ذاكرة. المندوب
 *  بيخرج على واتساب ثانيتين، يرجع يلاقي الصفحة اتحمّلت من الأول وكل
 *  اللوحات راحت — لأنها كانت في ذاكرة المتصفح بس.
 *
 *  ده مش احتمال نظري: حصل فعلاً ميدانياً.
 *
 *  الحل: نحفظ اللوحات على الجهاز مع كل تغيير، ونرجّعها لما الصفحة تفتح.
 *
 *  ليه localStorage مش IndexedDB؟
 *   - الحفظ متزامن، فمافيش لحظة «اتغيّر بس لسه ماتحفظش»
 *   - الحجم صغير (لوحة ≈ ٤٠٠ بايت، والسقف ٥ ميجا = آلاف اللوحات)
 *   - وبنطلب ‎storage.persist()‎ عشان المتصفح ما يمسحهاش تحت الضغط
 */

import type { PlateEntry } from "./plateEntry";
import type { Correction } from "./corrections";

const PREFIX = "plate-voice-lab:session:";

/** أقصى عدد لوحات نحفظها — حماية من امتلاء التخزين */
const MAX_SAVED = 500;

export type SessionKey = "batch" | "live";

interface SavedSession {
  version: 1;
  savedAt: number;
  entries: PlateEntry[];
}

/**
 * يطلب من المتصفح إنه ما يمسحش تخزيننا تحت الضغط.
 * بيتنادى مرة واحدة عند فتح التطبيق. المتصفح ممكن يرفض — مش مشكلة،
 * الحفظ العادي بيفضل شغّال.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * يحفظ لوحات صفحة.
 *
 * ⚠️ قائمة فاضية = **ما نمسحش** المحفوظ.
 *
 * ليه؟ لأن الصفحة بتفضّي الجدول في لحظات كتير مؤقتة (أول ما تضغط تسجيل،
 * وأول ما يبدأ التفريغ). لو المسح اتربط بالفراغ ده، كان اللي رجّعناه من
 * الجلسة السابقة **يتمسح نهائياً** بمجرد ما تضغط تسجيل — وقبل ما ييجي أي
 * بديل. ولو التفريغ فشل بعدها، تبقى ضاعت اللوحات القديمة والجديدة.
 *
 * المسح الحقيقي بيحصل بـ‎clearSession()‎ لما المندوب يطلبه صراحة.
 */
export function saveSession(key: SessionKey, entries: PlateEntry[]): void {
  try {
    if (entries.length === 0) return;
    const payload: SavedSession = {
      version: 1,
      savedAt: Date.now(),
      // التشييك الفوري بيحط الأحدث في الأول، والتسجيل المجمع بالترتيب
      // الزمني. ‎slice(0, MAX)‎ بيحافظ على أول العناصر في الحالتين —
      // وده الأحدث في الفوري وأول التسجيل في المجمع.
      entries: entries.slice(0, MAX_SAVED),
    };
    localStorage.setItem(PREFIX + key, JSON.stringify(payload));
  } catch {
    // التخزين مليان أو مقفول — مش سبب نكسر التطبيق
  }
}

/** يرجّع لوحات صفحة، أو قائمة فاضية */
export function loadSession(key: SessionKey): PlateEntry[] {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSession;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return [];
    // فحص خفيف: أي عنصر مكسور بيتشال بدل ما يكسر الصفحة
    return parsed.entries.filter(
      (e) => e && typeof e.id === "string" && e.review && typeof e.review.plate === "string"
    );
  } catch {
    return [];
  }
}

export function clearSession(key: SessionKey): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** آخر وقت حفظ — للعرض «اترجّعوا من آخر جلسة» */
export function sessionSavedAt(key: SessionKey): number | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    return typeof parsed?.savedAt === "number" ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

/* ==========================================================================
 *  منع الشاشة من القفل أثناء التسجيل
 * ==========================================================================
 *  لما الشاشة تقفل، أندرويد بيوقف الصفحة — فالتسجيل بيقف والقناة بتتقطع.
 *  ‎Wake Lock‎ بيمنع ده طول ما إحنا بنسجّل بس (ومش بيستهلك بطارية غير وقتها).
 */

let wakeLock: WakeLockSentinel | null = null;
/** المندوب لسه بيسجّل؟ — بلا العلم ده مش هنعرف نرجّع القفل بعد الرجوع */
let wakeWanted = false;

export async function keepScreenAwake(): Promise<boolean> {
  wakeWanted = true;
  document.addEventListener("visibilitychange", reacquire);
  return acquire();
}

async function acquire(): Promise<boolean> {
  try {
    if (!("wakeLock" in navigator)) return false;
    if (wakeLock) return true;
    const sentinel = await navigator.wakeLock.request("screen");
    wakeLock = sentinel;
    /**
     * ⚠️ المتصفح بيفك القفل لوحده أول ما التبويب يتخفي.
     * بلا السطر ده الـ sentinel بيفضل مخزّن (مش null) فشرط الرجوع
     * ‎if (wakeLock) return‎ كان بيرجع فوراً — يعني القفل **عمره ما يترجع**،
     * وهي بالظبط الحالة اللي عملناه عشانها (تخرج على واتساب وترجع).
     */
    sentinel.addEventListener("release", () => {
      if (wakeLock === sentinel) wakeLock = null;
    });
    return true;
  } catch {
    return false;
  }
}

async function reacquire() {
  if (!wakeWanted) return;
  if (document.visibilityState !== "visible") return;
  await acquire();
}

export function releaseScreenAwake(): void {
  wakeWanted = false;
  document.removeEventListener("visibilitychange", reacquire);
  try {
    void wakeLock?.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

/* ==========================================================================
 *  تخزين تصحيحات المندوب — **داتا تدريب**، مش حالة جلسة
 * ==========================================================================
 *
 *  🔴 الفرق الجوهري عن `saveSession`: لوحات الجلسة بتتبدّل مع كل تسجيل، لكن
 *  التصحيح **تسمية بشرية على مقطع صوتي** — أثمن حاجة نقدر نجمعها. فبيتراكم
 *  عبر الجلسات ومابيروحش مع «تسجيل جديد» ولا مع قفل الصفحة.
 *
 *  ليه دي مهمة أوي (مقيس ٤ سبتمبر ٢٠٢٦):
 *   · الحصاد المسمّى **بالموديل نفسه** ورّثه أخطاءه ⇒ v13/v14 نزلوا من ٩٩.٠٪
 *     دقة و١ اختراع لـ٩٥–٩٦٪ و٧–٩ اختراع.
 *   · ديبجرام كشاهد مستقل أدّى ٩,٥٩٠ مقطع نضيفة من ٢٦,٩٤٠ — بس كلها **سهلة**.
 *   · التصحيح لوحده هو اللي بيدّي **الحالات اللي الموديل غلط فيها**.
 */

const CORRECTIONS_KEY = "plate-lab:corrections";
/** سقف — التصحيحات بتتراكم للأبد، والتخزين محدود */
const MAX_CORRECTIONS = 2000;

interface SavedCorrections {
  version: 1;
  savedAt: number;
  rows: Correction[];
}

function readCorrections(): Correction[] {
  try {
    const raw = localStorage.getItem(CORRECTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCorrections;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rows)) return [];
    return parsed.rows.filter(
      (r) =>
        r && typeof r.id === "string" &&
        typeof r.heard === "string" && typeof r.corrected === "string"
    );
  } catch {
    return [];
  }
}

/**
 * بيدمج الجديد على المحفوظ. نفس الصف بيتحدّث مكانه بدل ما يتضاف تاني.
 * ⚠️ قائمة فاضية **مابتمسحش** — نفس منطق `saveSession`: الصفحة بتفضّي حالتها
 * في لحظات مؤقتة كتير، ولو ربطنا المسح بالفراغ هنخسر داتا تدريب مجمّعة.
 */
export function saveCorrections(rows: Correction[]): void {
  try {
    if (!rows || rows.length === 0) return;
    const merged = new Map<string, Correction>();
    for (const r of readCorrections()) merged.set(r.id, r);
    for (const r of rows) merged.set(r.id, r);
    const all = [...merged.values()].slice(-MAX_CORRECTIONS);
    const payload: SavedCorrections = { version: 1, savedAt: Date.now(), rows: all };
    localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(payload));
  } catch {
    // التخزين مليان أو مقفول — مش سبب نكسر التسجيل
  }
}

export function loadCorrections(): Correction[] {
  return readCorrections();
}

/** المسح الصريح بس — لما المندوب يطلبه أو بعد ما الداتا تتصدّر للتدريب */
export function clearCorrections(): void {
  try {
    localStorage.removeItem(CORRECTIONS_KEY);
  } catch {
    /* مفيش حاجة نعملها */
  }
}

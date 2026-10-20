/**
 * ==========================================================================
 *  💾 مقاطع المجمّع — محفوظة على الجهاز لحد ما المندوب يمسحها بإيده
 * ==========================================================================
 *
 *  طلب المالك (٣ أكتوبر ٢٠٢٦): «لما المندوب يسجل كذا مقطع تظهر المقاطع دي
 *  تحت بعض وكل مقطع يبقي قدامه كلمه تفريغ … ولما يبدأ تسجيل او الصفحه تعمل
 *  تحديث او خرج او اتنقل بين الصفحات المقاطع دي متروحش تفضل مسجله في الصفحه».
 *
 *  قبل كده المقطع كان في الذاكرة بس (`ClipJob.blob`): تحديث الصفحة، أو
 *  أندرويد يقفل التبويب وهو على واتساب ⇒ الصوت يروح. والتسجيل اللي ماتفرّغش
 *  كان بيتمسح بالسكوت مع أول «بدء تسجيل».
 *
 *  التصميم:
 *   · قاعدة IndexedDB **لوحدها** (`plate-lab-clips`) — مابتلمسش قاعدة الملفات
 *     ولا التقارير، فمافيش ترقية نسخة لحاجة شغّالة.
 *   · مخزنين: `clips` (البيانات: الوقت/المدة/الحالة/مسار الموقع/النتيجة) و
 *     `parts` (الصوت أجزاء بالترتيب، ArrayBuffer مش Blob — سفاري بيتلخبط
 *     مع Blob جوّه IndexedDB).
 *   · الصوت **بيتحفظ وهو بيتسجّل** (`ProgressiveClipWriter`، كل ثانية تقريباً)
 *     — فتحديث الصفحة وسط التسجيل بيسيب مقطع «اتقطع» صوته محفوظ لحد آخر
 *     ثانية، وبيتفرّغ عادي (الجزء الأول فيه ترويسة WebM؛ البادئة بتتفكّ
 *     — متجرّبة بـffmpeg على ١/٢/٣ ميجا من شريط حقيقي).
 *   · **مافيش مسح تلقائي خالص** — المسح من زرّ «امسح» على المقطع بس، وبيسأل.
 *
 *  ⚠️ IndexedDB مربوطة بالدومين: لو لينك النفق اتغيّر المتصفح بيشوفه موقع
 *  جديد فالمقاطع القديمة مش هتبان عليه (هتفضل على اللينك القديم).
 */

import type { PlateEntry } from "./plateEntry";
import {
  NO_PRECISE_PIN,
  countPinned,
  isPinMark,
  stampEntriesWithTrack,
  trackFromRaw,
  type RawFix,
  type TrackFix,
} from "./platePin";
import type { SessionStampJSON } from "./sessionStamp";

export type ClipStatus =
  | "recording"
  | "interrupted"
  | "ready"
  | "queued"
  | "working"
  | "done"
  | "failed";

/** نتيجة تفريغ المقطع — بتتحفظ معاه فتفضل بعد التحديث */
export interface ClipResult {
  /** وقت ما التفريغ خلص */
  at: number;
  plates: number;
  /** كام لوحة خدت موقع دقيق */
  pinned: number;
  entries: PlateEntry[];
  tookSec?: number;
  reportId?: string;
  engine?: string;
  /** 📋 آخر مرة لوحاته اتصدّرت للسجلات («داتا التسجيلات») */
  exportedAt?: number;
  /** كام لوحة منه اتصدّرت لحد دلوقتي */
  exportedCount?: number;
}

export interface StoredClip {
  id: string;
  /** رقم مسلسل مابيتكررش حتى بعد المسح */
  seqNo: number;
  label: string;
  createdAt: number;
  /** لحظة صفر الصوت (epoch) — أساس توقيت اللوحات والموقع */
  startEpoch: number;
  durationSec: number;
  mime: string;
  source: "record" | "upload";
  status: ClipStatus;
  /** عدد أجزاء الصوت المحفوظة */
  parts: number;
  bytes: number;
  /** آخر مرة اتحفظ فيها صوت — مدة المقطع المتقطع بتتحسب منها */
  updatedAt: number;
  /** ختم الجلسة (الشارع/الملاحظة/النوع) */
  stamp: SessionStampJSON;
  /** مسار الموقع وقت التسجيل */
  rawFixes: RawFix[];
  result?: ClipResult;
  error?: string;
  /**
   * ⚠️ **وقت التشغيل بس — مابيتحفظش.** الصوت الكامل في الذاكرة بس: الحفظ
   * على الجهاز فشل (المساحة مليانة) أو ماكملش. بيتفرّغ ويتمسح عادي، بس لو
   * الصفحة اتقفلت قبل التفريغ يضيع ⇒ الصف بيحذّر (`MEM_ONLY_WARNING`).
   */
  memOnly?: boolean;
}

/** التحذير اللي بيظهر قدام المقطع اللي صوته في الذاكرة بس */
export const MEM_ONLY_WARNING = "مساحة الموبايل مليانة — المقطع ده في الذاكرة بس، فرّغه قبل ما تقفل الصفحة";

/** طبقة التخزين — IndexedDB في المتصفح، ذاكرة في الاختبارات/الاحتياطي */
export interface ClipBackend {
  putClip(c: StoredClip): Promise<void>;
  getClip(id: string): Promise<StoredClip | undefined>;
  allClips(): Promise<StoredClip[]>;
  /**
   * الجزء **وبيانات المقطع** (عدد الأجزاء/البايتات) في معاملة واحدة — يا
   * الاتنين يتكتبوا يا ولا واحد. 🔴 كانوا كتابتين: الجزء يتكتب وتحديث
   * المقطع يفشل ⇒ العدّاد مايزيدش والجزء الجاي يتكتب **فوقه** بنفس الرقم.
   */
  putPartWithClip(c: StoredClip, seq: number, data: ArrayBuffer): Promise<void>;
  /** صوت المقطع كله **جزء واحد** بدل أجزاءه القديمة + بياناته — معاملة واحدة */
  replaceParts(c: StoredClip, data: ArrayBuffer): Promise<void>;
  getParts(clipId: string): Promise<ArrayBuffer[]>;
  deleteClip(id: string): Promise<void>;
}

/** المقطع زي ما بيتكتب على الجهاز — من غير حقول وقت التشغيل */
function persistable(c: StoredClip): StoredClip {
  const { memOnly: _memOnly, ...rest } = c;
  return rest;
}

/* ================================================================ الذاكرة */

export function memoryClipBackend(): ClipBackend {
  const clips = new Map<string, StoredClip>();
  const parts = new Map<string, Map<number, ArrayBuffer>>();
  return {
    async putClip(c) {
      clips.set(c.id, { ...c });
    },
    async getClip(id) {
      const c = clips.get(id);
      return c ? { ...c } : undefined;
    },
    async allClips() {
      return [...clips.values()].map((c) => ({ ...c }));
    },
    async putPartWithClip(c, seq, data) {
      let m = parts.get(c.id);
      if (!m) parts.set(c.id, (m = new Map()));
      m.set(seq, data);
      clips.set(c.id, { ...c });
    },
    async replaceParts(c, data) {
      parts.set(c.id, new Map([[0, data]]));
      clips.set(c.id, { ...c });
    },
    async getParts(clipId) {
      const m = parts.get(clipId);
      if (!m) return [];
      return [...m.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    },
    async deleteClip(id) {
      clips.delete(id);
      parts.delete(id);
    },
  };
}

/* ============================================================= IndexedDB */

const DB_NAME = "plate-lab-clips";
const CLIPS = "clips";
const PARTS = "parts";
const SEQ_MAX = Number.MAX_SAFE_INTEGER;

/**
 * ==========================================================================
 *  🔴 IndexedDB على الآيفون بتعلّق أو بتموت (مراجعة ٣ أكتوبر — جولة ٢)
 * ==========================================================================
 *  نفس اللي حصل في التطبيق بالظبط:
 *   · **4e01eaf:** الآيفون ساعات بيسيب `indexedDB.open` معلّق خالص — لا نجاح
 *     ولا خطأ — فكل نداء بعده بيستنى وعد **عمره** ما هيرجع. ⇒ مهلة فتح ١٠ث.
 *   · **#306:** الآيفون بيقتل الاتصال في الخلفية («Connection to Indexed
 *     Database server lost» — UnknownError) والاتصال الميت بيفضل متخزّن ⇒
 *     كل حفظ بعده بيفشل. ⇒ **أي** فشل: نسيب الاتصال ونفتح جديد ونعيد **مرة**.
 *     (كان هنا بيعيد على InvalidStateError أو «closed» بس — رسالة سفاري
 *     مابتطابقش، فعمره ما كان بيعيد.)
 *   · ومعاملة بتعلّق ⇒ مهلة ليها هي كمان (١٠ث) وبنلغيها.
 *  الإعادة آمنة: كل الكتابات `put` بمفتاح، والمعاملة اللي فشلت ماكتبتش حاجة.
 */
export const OPEN_TIMEOUT_MS = 10_000;
export const TX_TIMEOUT_MS = 10_000;

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

/**
 * الوعد بمهلة — **مابيلغيش** الشغل اللي تحت (مايتلغيش أصلاً)، بس اللي مستني
 * مايفضلش مستني للأبد. بعد المهلة ⇒ `TimeoutError`.
 */
export function withDeadline<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(namedError("TimeoutError", `${what} ماردّش في ${Math.max(1, Math.round(ms / 1000))}ث`)),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export interface IdbOptions {
  /** للاختبار — الافتراضي `indexedDB` بتاع المتصفح */
  factory?: IDBFactory;
  /** للاختبار — الافتراضي `IDBKeyRange.bound` */
  keyRange?: (lo: IDBValidKey, hi: IDBValidKey) => IDBKeyRange;
  openTimeoutMs?: number;
  txTimeoutMs?: number;
}

export function idbClipBackend(opts: IdbOptions = {}): ClipBackend {
  const factory = (): IDBFactory => opts.factory ?? indexedDB;
  const range = (lo: IDBValidKey, hi: IDBValidKey): IDBKeyRange =>
    opts.keyRange ? opts.keyRange(lo, hi) : IDBKeyRange.bound(lo, hi);
  const openMs = opts.openTimeoutMs ?? OPEN_TIMEOUT_MS;
  const txMs = opts.txTimeoutMs ?? TX_TIMEOUT_MS;

  let db: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase> | null = null;

  const openDb = (): Promise<IDBDatabase> => {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const req = factory().open(DB_NAME, 1);
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(namedError("TimeoutError", "فتح تخزين المقاطع ماردّش"));
      }, openMs);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(CLIPS)) d.createObjectStore(CLIPS, { keyPath: "id" });
        if (!d.objectStoreNames.contains(PARTS)) d.createObjectStore(PARTS, { keyPath: ["clipId", "seq"] });
      };
      req.onsuccess = () => {
        const d = req.result;
        if (settled) {
          // 🔴 الفتح وصل بعد المهلة — اتصال يتيم، نقفله عشان مايمسكش التخزين
          try {
            d.close();
          } catch {
            // اتقفل خلاص
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        d.onversionchange = () => {
          try {
            d.close();
          } catch {
            // اتقفل خلاص
          }
          if (db === d) db = null;
        };
        // الآيفون قتل الاتصال ⇒ ننساه، واللي بعده يفتح جديد
        d.onclose = () => {
          if (db === d) db = null;
        };
        db = d;
        resolve(d);
      };
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(req.error ?? namedError("UnknownError", "فتح تخزين المقاطع فشل"));
      };
    });
    opening = p;
    const clear = () => {
      if (opening === p) opening = null;
    };
    p.then(clear, clear);
    return p;
  };

  /** نسيب الاتصال (ميت أو معلّق) — اللي بعده بيفتح جديد */
  const dropConnection = () => {
    try {
      db?.close();
    } catch {
      // اتقفل خلاص
    }
    db = null;
    opening = null;
  };

  /** محاولة واحدة: فتح (بمهلة) + معاملة (بمهلة) */
  const attempt = async <T,>(
    names: string[],
    mode: IDBTransactionMode,
    body: (t: IDBTransaction) => () => T
  ): Promise<T> => {
    const d = await openDb();
    const t = d.transaction(names, mode);
    const read = body(t);
    await new Promise<void>((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try {
          t.abort();
        } catch {
          // خلصت أو اتلغت
        }
        reject(namedError("TimeoutError", "معاملة تخزين المقاطع ماخلصتش"));
      }, txMs);
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        fn();
      };
      t.oncomplete = () => finish(resolve);
      t.onerror = () => finish(() => reject(t.error ?? namedError("UnknownError", "المعاملة فشلت")));
      t.onabort = () => finish(() => reject(t.error ?? namedError("AbortError", "المعاملة اتلغت")));
    });
    return read();
  };

  /**
   * معاملة واحدة: `body` بتبعت الطلبات **بشكل متزامن** وترجّع دالة بتقرا
   * النتيجة بعد ما المعاملة تخلص — مافيش `await` جوّه المعاملة.
   * **أي** فشل (مهلة/اتصال ميت/مساحة…) ⇒ اتصال جديد ومحاولة تانية واحدة.
   */
  const withTx = async <T,>(
    names: string[],
    mode: IDBTransactionMode,
    body: (t: IDBTransaction) => () => T
  ): Promise<T> => {
    try {
      return await attempt(names, mode, body);
    } catch {
      dropConnection();
      return attempt(names, mode, body);
    }
  };

  return {
    putClip: (c) =>
      withTx([CLIPS], "readwrite", (t) => {
        t.objectStore(CLIPS).put(c);
        return () => undefined;
      }),
    getClip: (id) =>
      withTx([CLIPS], "readonly", (t) => {
        const r = t.objectStore(CLIPS).get(id);
        return () => (r.result as StoredClip | undefined) ?? undefined;
      }),
    allClips: () =>
      withTx([CLIPS], "readonly", (t) => {
        const r = t.objectStore(CLIPS).getAll();
        return () => (r.result as StoredClip[]) ?? [];
      }),
    putPartWithClip: (c, seq, data) =>
      withTx([CLIPS, PARTS], "readwrite", (t) => {
        t.objectStore(PARTS).put({ clipId: c.id, seq, data });
        t.objectStore(CLIPS).put(c);
        return () => undefined;
      }),
    replaceParts: (c, data) =>
      withTx([CLIPS, PARTS], "readwrite", (t) => {
        const parts = t.objectStore(PARTS);
        parts.delete(range([c.id, 0], [c.id, SEQ_MAX]));
        parts.put({ clipId: c.id, seq: 0, data });
        t.objectStore(CLIPS).put(c);
        return () => undefined;
      }),
    getParts: (clipId) =>
      withTx([PARTS], "readonly", (t) => {
        const r = t.objectStore(PARTS).getAll(range([clipId, 0], [clipId, SEQ_MAX]));
        return () =>
          ((r.result as Array<{ seq: number; data: ArrayBuffer }>) ?? [])
            .sort((a, b) => a.seq - b.seq)
            .map((p) => p.data);
      }),
    deleteClip: (id) =>
      withTx([CLIPS, PARTS], "readwrite", (t) => {
        t.objectStore(CLIPS).delete(id);
        t.objectStore(PARTS).delete(range([id, 0], [id, SEQ_MAX]));
        return () => undefined;
      }),
  };
}

/* ================================================================ المخزن */

export function clipLabel(seqNo: number): string {
  return `مقطع ${seqNo}`;
}

const sortNewest = (xs: StoredClip[]) =>
  xs.slice().sort((a, b) => b.startEpoch - a.startEpoch || b.seqNo - a.seqNo);

function toBuffer(data: ArrayBuffer | Blob): Promise<ArrayBuffer> {
  const b = data as Blob;
  if (typeof b?.arrayBuffer === "function" && typeof (data as ArrayBuffer).byteLength !== "number") {
    return b.arrayBuffer();
  }
  return Promise.resolve(data as ArrayBuffer);
}

/**
 * بعد تحميل الصفحة: الحالات اللي كانت «شغّالة» ماتت مع الصفحة.
 *  · «بيسجّل» ⇒ «اتقطع» — صوته محفوظ لحد آخر جزء، ومدته لحد آخر حفظ.
 *  · «في الدور»/«بيتفرّغ» ⇒ «جاهز» (أو «خلص» لو نتيجته محفوظة).
 * `null` = مافيش تغيير.
 */
export function recoverClip(c: StoredClip): StoredClip | null {
  if (c.status === "recording") {
    const est = Math.max(0, (c.updatedAt - c.startEpoch) / 1000);
    return { ...c, status: "interrupted", durationSec: Math.max(c.durationSec || 0, est) };
  }
  if (c.status === "queued" || c.status === "working") {
    return { ...c, status: c.result ? "done" : "ready" };
  }
  return null;
}

/**
 * ==========================================================================
 *  🔴 مافيش مقطع يضيع لو التخزين فشل — ولا الصفحة تعلّق (مراجعة ٣ أكتوبر)
 * ==========================================================================
 *  المساحة مليانة / اتصال IndexedDB ميت ⇒ الكتابة بترمي. وعلى الآيفون
 *  كمان ممكن **تعلّق** (لا نجاح ولا خطأ) — وكل النداءات كانت في طابور واحد،
 *  فنداء معلّق واحد كان بيوقّف الباقي للأبد: «بدء التسجيل» يفضل «بيحفظ
 *  المقطع…»، والقائمة تبان فاضية والصوت الكامل في الذاكرة (جولة ٢ — عيب ١).
 *
 *  دلوقتي المخزن عنده **نسخة في الذاكرة** من كل مقطع لمسه في الجلسة دي:
 *   · `mem` — آخر بيانات لكل مقطع؛ `persisted` = ليه سجل على الجهاز،
 *     `dirty` = اللي في الذاكرة أحدث من اللي على الجهاز (الكتابة فشلت).
 *     القائمة والقراية بتاخد منها الأول — فمابيرموش أبداً.
 *   · `held` — الصوت **الكامل** لمقطع نسخته المحفوظة ناقصة؛ التفريغ
 *     والاستماع بياخدوه هو (`audio()`)، والصف بيتعلّم `memOnly`.
 *   · **كل** نداء للتخزين ليه مهلة (`call`)، وأول مهلة بتفتح «قاطع»: النداءات
 *     اللي بعدها بتفشل على طول (بلا انتظار) لحد ما وقت الراحة يعدّي،
 *     وبعدها نجرّب تاني. فأسوأ قفل = مهلة واحدة (ثواني) مش للأبد.
 *   · `retryPending()` — اللي ماتحفظش (صوت محجوز/بيانات) بيتحفظ أول ما
 *     التخزين يرجع أو المساحة تفضى (مع أي حركة + كل شوية من الصفحة).
 *  تحديث البيانات والقائمة والقراية مابيرموش أبداً. كتابة الصوت بترمي —
 *  عشان الكاتب مايعلّمش جزء «اتحفظ» وهو مااتحفظش.
 */

/**
 * مهلة كتابة واحدة على مستوى المخزن — الكتابة الطبيعية عشرات المللي ثواني
 * (حتى المقطع كله ٥ دقايق ≈ ٢.٤ ميجا). مهلة بالغلط على موبايل بطيء مابتضيّعش
 * حاجة: الصوت بيتحجز في الذاكرة ويتحفظ في المحاولة الجاية.
 */
export const STORE_WRITE_TIMEOUT_MS = 2500;
/** مهلة قراية بيانات (القائمة/مقطع) — بعدها القاطع بيتفتح */
export const STORE_READ_TIMEOUT_MS = 4000;
/**
 * القائمة مابتستناش القراية أكتر من كده — بتعرض آخر قائمة معروفة + اللي في
 * الذاكرة، والقراية بتكمّل ورا وتحدّث «آخر قائمة» للمرة الجاية.
 */
export const STORE_LIST_WAIT_MS = 1000;
/** مهلة قراية صوت مقطع كامل (ممكن يبقى ميجات) */
export const STORE_AUDIO_TIMEOUT_MS = 8000;
/** بعد مهلة: قد إيه النداءات بتفشل على طول قبل ما نجرّب التخزين تاني */
export const STORE_COOLDOWN_MS = 15_000;
/** فحص التخزين وقت فتح الصفحة — مانستناش أكتر من كده */
export const STORE_PROBE_TIMEOUT_MS = 3000;

export interface ClipStoreOptions {
  writeTimeoutMs?: number;
  readTimeoutMs?: number;
  audioTimeoutMs?: number;
  listWaitMs?: number;
  coolDownMs?: number;
}

interface MemClip {
  clip: StoredClip;
  /** ليه سجل على الجهاز */
  persisted: boolean;
  /** اللي هنا أحدث من اللي على الجهاز */
  dirty: boolean;
}

export class ClipStore {
  private chain: Promise<unknown> = Promise.resolve();
  private mem = new Map<string, MemClip>();
  private held = new Map<string, { blob: Blob; chunks?: Blob[] }>();
  /** اتمسحت في الجلسة دي — قراية قديمة مابترجّعهاش */
  private removed = new Set<string>();
  /** آخر قائمة اتقرت من الجهاز — بتفضل ظاهرة لو القراية الجاية فشلت */
  private lastListed: StoredClip[] = [];
  /** الاسترجاع وقت الفتح فشل — أول قراية تنجح بتصحّح */
  private recoverPending = false;
  /** «القاطع»: لحد الوقت ده النداءات بتفشل على طول من غير ما تلمس التخزين */
  private downUntil = 0;
  private readonly o: Required<ClipStoreOptions>;
  /** آخر فشل كتابة — للتحذير في الصفحة */
  lastWriteError: string | null = null;

  constructor(
    private backend: ClipBackend,
    private now: () => number = () => Date.now(),
    opts: ClipStoreOptions = {}
  ) {
    this.o = {
      writeTimeoutMs: opts.writeTimeoutMs ?? STORE_WRITE_TIMEOUT_MS,
      readTimeoutMs: opts.readTimeoutMs ?? STORE_READ_TIMEOUT_MS,
      audioTimeoutMs: opts.audioTimeoutMs ?? STORE_AUDIO_TIMEOUT_MS,
      listWaitMs: opts.listWaitMs ?? STORE_LIST_WAIT_MS,
      coolDownMs: opts.coolDownMs ?? STORE_COOLDOWN_MS,
    };
  }

  /** التخزين علّق قريب — النداءات بتفشل على طول لحد وقت الراحة */
  get down(): boolean {
    return this.downUntil > this.now();
  }

  /** كل الكتابات بالترتيب — قراية-تعديل-كتابة ماتتداخلش (وكل واحدة ليها مهلة) */
  private run<T>(op: () => Promise<T>): Promise<T> {
    const p = this.chain.then(op, op);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** نداء للتخزين بمهلة — والمهلة بتفتح «القاطع» */
  private async call<T>(what: string, op: () => Promise<T>, ms: number): Promise<T> {
    if (this.down) throw namedError("StoreDownError", "تخزين المقاطع مابيردّش — هنحاول تاني بعد شوية");
    try {
      return await withDeadline(Promise.resolve().then(op), ms, what);
    } catch (err) {
      if ((err as Error)?.name === "TimeoutError") this.downUntil = this.now() + this.o.coolDownMs;
      throw err;
    }
  }

  private remember(clip: StoredClip, persisted: boolean, dirty: boolean): void {
    this.mem.set(clip.id, { clip, persisted, dirty });
  }

  private decorate(c: StoredClip): StoredClip {
    const m = this.mem.get(c.id);
    const memOnly = this.held.has(c.id) || (m !== undefined && !m.persisted);
    const out = { ...c };
    if (memOnly) out.memOnly = true;
    else delete out.memOnly;
    return out;
  }

  /** أحدث نسخة من المقطع: الذاكرة، وإلا الجهاز (بمهلة)، وإلا آخر قائمة — **مابيرميش** */
  private async current(id: string): Promise<{ clip: StoredClip; persisted: boolean } | undefined> {
    const m = this.mem.get(id);
    if (m) return { clip: m.clip, persisted: m.persisted };
    if (this.removed.has(id)) return undefined;
    try {
      const c = await this.call("قراية المقطع", () => this.backend.getClip(id), this.o.readTimeoutMs);
      return c ? { clip: c, persisted: true } : undefined;
    } catch (err) {
      this.noteWriteError(err);
      const c = this.lastListed.find((x) => x.id === id);
      return c ? { clip: c, persisted: true } : undefined;
    }
  }

  private noteWriteError(err: unknown): void {
    const e = err as { name?: string; message?: string } | null;
    this.lastWriteError = String(e?.name === "QuotaExceededError" ? "QuotaExceededError" : e?.message ?? err);
  }

  /** قائمة الجهاز ⇒ آخر قائمة معروفة (+ تصحيح الاسترجاع لو كان فشل وقت الفتح) */
  private adoptListed(all: StoredClip[]): StoredClip[] {
    const rows = (all || []).filter((c) => !this.removed.has(c.id));
    if (this.recoverPending) {
      this.recoverPending = false;
      for (const c of rows) {
        if (this.mem.has(c.id)) continue;
        const r = recoverClip(c);
        // التصحيح بيبان على طول، وبيتحفظ في المحاولة الجاية (`retryPending`)
        if (r) this.remember(persistable(r), true, true);
      }
    }
    this.lastListed = rows;
    return rows;
  }

  private merged(base: StoredClip[]): StoredClip[] {
    const byId = new Map(base.map((c) => [c.id, c] as const));
    for (const [id, m] of this.mem) byId.set(id, m.clip);
    for (const id of this.removed) byId.delete(id);
    return sortNewest([...byId.values()].map((c) => this.decorate(c)));
  }

  /** فحص التخزين وقت الفتح — بمهلة قصيرة (مهلته بتفتح القاطع) */
  async probe(ms: number): Promise<void> {
    this.adoptListed(await this.call("فتح تخزين المقاطع", () => this.backend.allClips(), ms));
  }

  /**
   * القائمة — **مابترميش، ومابتستناش الكتابات**: الجهاز (بمهلة) أو آخر
   * قائمة اتقرت، وفوقها اللي في الذاكرة. فالمقطع اللي صوته في الذاكرة بس
   * بيفضل ظاهر حتى لو التخزين ميت.
   */
  async list(): Promise<StoredClip[]> {
    const read = this.call("قراية المقاطع", () => this.backend.allClips(), this.o.readTimeoutMs).then((all) =>
      this.adoptListed(all)
    );
    // القراية بتكمّل ورا حتى لو القائمة ماستنتهاش — فشلها بيتسجّل بس
    read.catch((err) => this.noteWriteError(err));
    let base: StoredClip[];
    try {
      base = await withDeadline(read, this.o.listWaitMs, "قراية المقاطع");
    } catch {
      // التخزين مابيردّش (أو بطيء) — آخر قائمة + اللي في الذاكرة
      base = this.lastListed;
    }
    return this.merged(base);
  }

  /** مقطع واحد — **مابيرميش** (الذاكرة الأول) */
  async get(id: string): Promise<StoredClip | undefined> {
    const cur = await this.current(id);
    return cur ? this.decorate(cur.clip) : undefined;
  }

  create(input: {
    startEpoch: number;
    mime: string;
    source: "record" | "upload";
    stamp: SessionStampJSON;
    durationSec?: number;
  }): Promise<StoredClip> {
    return this.run(async () => {
      let all: StoredClip[] = this.lastListed;
      try {
        all = this.adoptListed(
          await this.call("قراية المقاطع", () => this.backend.allClips(), this.o.readTimeoutMs)
        );
      } catch (err) {
        this.noteWriteError(err);
      }
      const seqNo =
        [...all, ...[...this.mem.values()].map((m) => m.clip)].reduce((m, c) => Math.max(m, c.seqNo || 0), 0) + 1;
      const t = this.now();
      const clip: StoredClip = {
        id: `clip-${t.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        seqNo,
        label: clipLabel(seqNo),
        createdAt: t,
        startEpoch: input.startEpoch,
        durationSec: input.durationSec ?? 0,
        mime: input.mime || "audio/webm",
        source: input.source,
        status: "recording",
        parts: 0,
        bytes: 0,
        updatedAt: t,
        stamp: input.stamp,
        rawFixes: [],
      };
      try {
        await this.call("حفظ المقطع", () => this.backend.putClip(clip), this.o.writeTimeoutMs);
        this.remember(clip, true, false);
      } catch (err) {
        // المساحة مليانة / التخزين معلّق — المقطع بيتعمل في الذاكرة والتسجيل مايقفش
        this.noteWriteError(err);
        this.remember(clip, false, true);
      }
      return this.decorate(clip);
    });
  }

  /**
   * جزء صوت جديد في آخر المقطع — **بيرمي لو ماتكتبش** (الكاتب لازم يعرف).
   * الجزء وعدّاد المقطع في معاملة واحدة، فمافيش جزء بيتكتب فوق جزء.
   * ولو المقطع كان في الذاكرة بس والكتابة نجحت، بيبقى محفوظ من دلوقتي.
   */
  appendPart(id: string, data: ArrayBuffer | Blob): Promise<void> {
    return this.run(async () => {
      const buf = await toBuffer(data);
      if (!buf || buf.byteLength === 0) return;
      const cur = await this.current(id);
      // 🔴 مش «اتحفظ» لو المقطع مش لاقيينه — الكاتب يعيد بعدين
      if (!cur) throw namedError("NotFoundError", "المقطع مش موجود");
      const c = cur.clip;
      const next: StoredClip = persistable({
        ...c,
        parts: c.parts + 1,
        bytes: c.bytes + buf.byteLength,
        updatedAt: this.now(),
      });
      try {
        await this.call("حفظ جزء صوت", () => this.backend.putPartWithClip(next, c.parts, buf), this.o.writeTimeoutMs);
      } catch (err) {
        this.noteWriteError(err);
        throw err;
      }
      this.remember(next, true, false);
    });
  }

  /**
   * صوت المقطع كله بدل أجزاءه المحفوظة (معاملة واحدة) — لما الحفظ التدريجي
   * ماكملش. بيرمي لو ماتكتبش؛ ولو نجح الصوت اللي في الذاكرة بيتساب.
   */
  replaceAudio(id: string, data: Blob): Promise<StoredClip> {
    return this.run(async () => {
      const cur = await this.current(id);
      if (!cur) throw namedError("NotFoundError", "المقطع مش موجود");
      const buf = await toBuffer(data);
      const next: StoredClip = persistable({ ...cur.clip, parts: 1, bytes: buf.byteLength, updatedAt: this.now() });
      try {
        await this.call("حفظ الصوت كامل", () => this.backend.replaceParts(next, buf), this.o.writeTimeoutMs);
      } catch (err) {
        this.noteWriteError(err);
        throw err;
      }
      this.remember(next, true, false);
      this.held.delete(id);
      return this.decorate(next);
    });
  }

  /**
   * تحديث بيانات المقطع — **مابيرميش** لو القراية أو الكتابة فشلت: التحديث
   * بيفضل في الذاكرة والقائمة بتعرضه، وبيتحفظ في المحاولة الجاية.
   */
  update(id: string, patch: Partial<StoredClip>): Promise<StoredClip | undefined> {
    return this.run(async () => {
      const cur = await this.current(id);
      if (!cur) return undefined;
      const next: StoredClip = persistable({ ...cur.clip, ...patch, id: cur.clip.id });
      this.remember(next, cur.persisted, true);
      // مالوش سجل على الجهاز — سجل من غير صوت هيبقى مقطع فاضي بعد التحديث؛
      // الصوت هو اللي بيعمل السجل (`appendPart`/`replaceAudio`/`retryPending`)
      if (!cur.persisted) return this.decorate(next);
      try {
        await this.call("حفظ بيانات المقطع", () => this.backend.putClip(next), this.o.writeTimeoutMs);
        this.remember(next, true, false);
      } catch (err) {
        this.noteWriteError(err);
      }
      return this.decorate(next);
    });
  }

  /** الصوت **الكامل** في الذاكرة لمقطع نسخته المحفوظة ناقصة (أو مش موجودة) */
  holdAudio(id: string, blob: Blob, chunks?: Blob[]): void {
    this.held.set(id, { blob, chunks });
  }

  /** النسخة المحفوظة طلعت كاملة — الصوت المحجوز مالوش لازمة */
  releaseHeld(id: string): void {
    this.held.delete(id);
  }

  /** أجزاء التسجيل (٢٥٠ms) للصوت المحجوز — للمحركات اللي بتقصّ ببادئة */
  heldChunks(id: string): Blob[] | undefined {
    return this.held.get(id)?.chunks;
  }

  finish(
    id: string,
    info: { durationSec: number; rawFixes: RawFix[]; stamp?: SessionStampJSON }
  ): Promise<StoredClip | undefined> {
    return this.update(id, {
      status: "ready",
      durationSec: info.durationSec,
      rawFixes: info.rawFixes,
      ...(info.stamp ? { stamp: info.stamp } : {}),
    });
  }

  /**
   * صوت المقطع كله — **الكامل اللي في الذاكرة الأول** لو موجود (النسخة
   * المحفوظة ناقصة)، وإلا الأجزاء المحفوظة بترتيبها (بمهلة). بيرمي لو
   * التخزين مابيردّش ومافيش نسخة في الذاكرة — المنادي بيرجع لأجزاء التسجيل.
   */
  async audio(id: string): Promise<Blob> {
    const h = this.held.get(id);
    if (h) return h.blob;
    const m = this.mem.get(id);
    if (m && !m.persisted) return new Blob([], { type: m.clip.mime || "audio/webm" });
    const parts = await this.call("قراية صوت المقطع", () => this.backend.getParts(id), this.o.audioTimeoutMs);
    const mime = m?.clip.mime ?? this.lastListed.find((c) => c.id === id)?.mime ?? (await this.current(id))?.clip.mime;
    return new Blob(parts, { type: mime || "audio/webm" });
  }

  /**
   * المسح — من الجهاز **الأول**؛ لو فشل بيرمي ومابيشيلش النسخة اللي في
   * الذاكرة (وإلا مسح فاشل يضيّع الصوت الوحيد الكامل).
   */
  remove(id: string): Promise<void> {
    return this.run(async () => {
      const m = this.mem.get(id);
      const persisted = !(m && !m.persisted);
      try {
        await this.call("مسح المقطع", () => this.backend.deleteClip(id), this.o.writeTimeoutMs);
      } catch (err) {
        // مقطع الذاكرة بس: مسح الجهاز احتياطي (يمكن الإنشاء اتكتب متأخر)
        if (persisted) throw err;
      }
      this.mem.delete(id);
      this.held.delete(id);
      this.removed.add(id);
      this.lastListed = this.lastListed.filter((c) => c.id !== id);
    });
  }

  /** فيه حاجة ماتحفظتش؟ (صوت محجوز أو بيانات أحدث من الجهاز) — مش المقطع اللي بيتسجّل */
  hasPending(): boolean {
    for (const [id, m] of this.mem) {
      if (m.clip.status === "recording") continue;
      if (this.held.has(id) || (m.persisted && m.dirty)) return true;
    }
    return false;
  }

  /**
   * 💾 (عيب ٧) اللي ماتحفظش بيتحفظ دلوقتي لو التخزين رجع/المساحة فضيت:
   *  · صوت محجوز ⇒ بيتكتب كامل مع بياناته (معاملة واحدة) وبيتشال من الذاكرة.
   *  · بيانات أحدث من الجهاز ⇒ بتتكتب.
   * المقطع اللي بيتسجّل مابيتلمسش (كاتبه هو اللي بيحفظه). بيرجّع كام اتحفظ.
   */
  retryPending(): Promise<number> {
    return this.run(async () => {
      let saved = 0;
      for (const [id, m] of [...this.mem]) {
        if (this.down) break;
        if (m.clip.status === "recording") continue;
        const h = this.held.get(id);
        try {
          if (h) {
            const buf = await toBuffer(h.blob);
            const next: StoredClip = persistable({ ...m.clip, parts: 1, bytes: buf.byteLength });
            await this.call("حفظ الصوت المحجوز", () => this.backend.replaceParts(next, buf), this.o.writeTimeoutMs);
            this.remember(next, true, false);
            this.held.delete(id);
            saved++;
          } else if (m.persisted && m.dirty) {
            await this.call("حفظ بيانات المقطع", () => this.backend.putClip(m.clip), this.o.writeTimeoutMs);
            this.remember(m.clip, true, false);
            saved++;
          }
        } catch (err) {
          this.noteWriteError(err);
        }
      }
      return saved;
    });
  }

  /** بعد تحميل الصفحة — بيصحّح الحالات الميتة ويرجّع القائمة. **مابيرميش** */
  recover(): Promise<StoredClip[]> {
    return this.run(async () => {
      let all: StoredClip[];
      try {
        all = await this.call("قراية المقاطع", () => this.backend.allClips(), this.o.readTimeoutMs);
      } catch (err) {
        // التخزين مابيردّش وقت الفتح — أول قراية تنجح هتصحّح (`adoptListed`)
        this.noteWriteError(err);
        this.recoverPending = true;
        return this.merged(this.lastListed);
      }
      const out: StoredClip[] = [];
      for (const c of all.filter((x) => !this.removed.has(x.id))) {
        const r = recoverClip(c);
        if (r) {
          this.remember(r, true, true);
          try {
            await this.call("حفظ تصحيح المقطع", () => this.backend.putClip(r), this.o.writeTimeoutMs);
            this.remember(r, true, false);
          } catch (err) {
            this.noteWriteError(err);
          }
        }
        out.push(r ?? c);
      }
      this.lastListed = out;
      return this.merged(out);
    });
  }
}

/**
 * المخزن الفعلي: IndexedDB لو شغّالة، وإلا ذاكرة (المقاطع تفضل لحد ما
 * الصفحة تتقفل بس) — وبيقول صراحةً أنهي فيهم عشان الصفحة تحذّر المندوب.
 *
 * 🔴 الفحص بمهلة قصيرة: التخزين لو **معلّق** (آيفون) مانستناش — بنرجّع نفس
 * المخزن (قاطعه مفتوح ⇒ بيشتغل من الذاكرة على طول) وبيجرّب تاني بعد شوية،
 * فلو رجع المقاطع بتتحفظ. لو بيرمي على طول (مقفول/وضع خاص) ⇒ ذاكرة.
 */
export async function openClipStore(
  opts: { backend?: ClipBackend; probeTimeoutMs?: number; store?: ClipStoreOptions } = {}
): Promise<{ store: ClipStore; persistent: boolean; error?: string }> {
  if (!opts.backend && typeof indexedDB === "undefined") {
    return { store: new ClipStore(memoryClipBackend(), undefined, opts.store), persistent: false, error: "IndexedDB مش متاحة" };
  }
  const store = new ClipStore(opts.backend ?? idbClipBackend(), undefined, opts.store);
  try {
    await store.probe(opts.probeTimeoutMs ?? STORE_PROBE_TIMEOUT_MS);
    return { store, persistent: true };
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if ((err as Error)?.name === "TimeoutError") {
      return {
        store,
        persistent: true,
        error: `تخزين المقاطع مابيردّش (${msg}) — المقاطع في الذاكرة لحد ما يرجع، وبنحاول نحفظها تاني لوحدنا.`,
      };
    }
    return { store: new ClipStore(memoryClipBackend(), undefined, opts.store), persistent: false, error: msg };
  }
}

/* ======================================================= الحفظ وهو بيسجّل */

/**
 * بياخد الأجزاء الجديدة من المسجّل (`getChunks()` = نفس مصفوفة
 * `BatchRecorder.audioChunks` اللي بتكبر كل ٢٥٠ms) ويحفظها **جزء واحد** في
 * كل `flush`. النداءات بتتسلسل فمافيش جزء بيتكتب مرتين. و`meta()` (اختياري)
 * بيتحفظ مع كل `flush` — المدة ومسار الموقع والختم لحد اللحظة دي.
 *
 * 🔴 الأجزاء بتتعلّم «اتحفظت» **بعد** ما الكتابة تنجح بس (مراجعة ٣ أكتوبر:
 * كانت بتتعلّم قبلها ⇒ فشل مؤقّت واحد = فجوة دايمة في نص الصوت). الفشل
 * بيرمي، والـ`flush` الجاي بيعيد من أول جزء ماتحفظش.
 */
export class ProgressiveClipWriter {
  private flushed = 0;
  private chain: Promise<void> = Promise.resolve();
  private lastFailed = false;

  constructor(
    private store: ClipStore,
    readonly clipId: string,
    private getChunks: () => Blob[],
    private meta?: () => Partial<StoredClip>
  ) {}

  /** عدد أجزاء التسجيل اللي اتحفظت فعلاً */
  get flushedChunks(): number {
    return this.flushed;
  }

  /** آخر `flush` فشل في كتابة الصوت؟ (المساحة مليانة/الاتصال ميت) */
  get failed(): boolean {
    return this.lastFailed;
  }

  flush(): Promise<void> {
    const p = this.chain.then(() => this.doFlush());
    this.chain = p.catch(() => undefined);
    return p;
  }

  private async doFlush(): Promise<void> {
    const all = this.getChunks() || [];
    const upto = all.length;
    if (upto > this.flushed) {
      try {
        await this.store.appendPart(this.clipId, new Blob(all.slice(this.flushed, upto)));
      } catch (err) {
        this.lastFailed = true;
        throw err;
      }
      this.flushed = upto;
    }
    this.lastFailed = false;
    // بيانات المقطع (المدة/المسار/الختم) — فشلها مابيرميش (بيفضل في الذاكرة)
    if (this.meta) await this.store.update(this.clipId, this.meta());
  }
}

/** خطأ حفظ بمكانه ونوعه — الصفحة بتسجّل كل نوع مرة لكل مقطع (عيب ٦) */
export interface SaveError {
  where: string;
  kind: string;
  message: string;
}

/**
 * 🔴 (عيب ٥) الصوت **الأطول** اللي في الذاكرة: صوت `stop()` أو أجزاء التسجيل.
 * آخر جزء ممكن يوصل بعد شبكة أمان `stop()` (٨٠٠ms) فيبقى في الأجزاء ومش في
 * صوت `stop()` — الأطول هو الكامل (الأجزاء بتكبر بس، مابتتغيّرش).
 */
function longerAudio(blob: Blob | null, chunks: Blob[] | undefined, mime: string): Blob | null {
  const fromChunks =
    chunks && chunks.length > 0 ? new Blob(chunks, { type: blob?.type || mime || "audio/webm" }) : null;
  if (!blob) return fromChunks;
  return fromChunks && fromChunks.size > blob.size ? fromChunks : blob;
}

/**
 * 💾 قفل المقطع بعد ما التسجيل يقف — **مافيش تسجيل يضيع** مهما التخزين عمل،
 * و**مابيعلّقش** (كل نداء للمخزن بمهلة — «بدء التسجيل» بيرجع في ثواني).
 *
 *  ١. آخر `flush` للحفظ التدريجي (فشله مايوقّفش الباقي).
 *  ٢. النسخة المحفوظة **قد** الصوت اللي في الذاكرة أو **أطول** (جزء وصل بعد
 *     مهلة `stop()` واتحفظ) ⇒ تمام، وبتفضل هي (عيب ٥: كانت بتتكتب فوقها
 *     النسخة الأقصر).
 *  ٣. أقصر ⇒ نكتب الصوت الكامل مرة واحدة بدلها (`replaceAudio`).
 *  ٤. لسه فاشل (المساحة مليانة/التخزين معلّق) ⇒ الصوت الكامل **يتحجز في
 *     الذاكرة**: التفريغ والاستماع بياخدوه هو، والصف بيحذّر، وبيتحفظ لوحده
 *     أول ما المساحة تفضى (`retryPending`).
 *  ٥. المقطع بيبقى «جاهز» في كل الحالات (التحديث مابيرميش).
 * التسجيل الفاضي خالص (ولا صوت محفوظ) بيتشال. `id = null` بس للتسجيل الفاضي.
 */
export async function closeRecordedClip(
  store: ClipStore,
  input: {
    clipId: string | null;
    writer: ProgressiveClipWriter | null;
    blob: Blob | null;
    chunks?: Blob[];
    durationSec: number;
    rawFixes: RawFix[];
    stamp: SessionStampJSON;
    startEpoch: number;
    mime: string;
  }
): Promise<{ id: string | null; memOnly: boolean; errors: SaveError[] }> {
  const errors: SaveError[] = [];
  const note = (where: string, err: unknown) =>
    errors.push({ where, kind: saveErrorKind(err), message: String((err as Error)?.message ?? err) });
  const blob = longerAudio(input.blob, input.chunks, input.mime);
  let id = input.clipId;

  if (id && input.writer && input.writer.clipId === id) {
    try {
      await input.writer.flush();
    } catch (err) {
      note("آخر حفظ تدريجي", err);
    }
  }

  const finish = async (clipId: string) => {
    // `update` مابيرميش — لو الكتابة فشلت التحديث في الذاكرة وبيتحفظ بعدين
    await store.finish(clipId, {
      durationSec: input.durationSec,
      rawFixes: input.rawFixes,
      stamp: input.stamp,
    });
  };

  if (!blob || blob.size === 0) {
    if (id) {
      // صوت `stop()` فاضي بس الكاتب حفظ صوت ⇒ ده المقطع، مايتمسحش
      const saved = await store.get(id);
      if (saved && saved.bytes > 0) {
        await finish(id);
        return { id, memOnly: false, errors };
      }
      try {
        await store.remove(id);
      } catch (err) {
        note("مسح المقطع الفاضي", err);
      }
    }
    return { id: null, memOnly: false, errors };
  }

  if (!id) {
    const c = await store.create({
      startEpoch: input.startEpoch,
      mime: blob.type || input.mime || "audio/webm",
      source: "record",
      stamp: input.stamp,
    });
    id = c.id;
  }

  let complete = false;
  const saved = await store.get(id);
  if (saved && !saved.memOnly && saved.bytes >= blob.size) {
    complete = true;
    store.releaseHeld(id);
  }
  if (!complete) {
    try {
      await store.replaceAudio(id, blob);
      complete = true;
    } catch (err) {
      note("حفظ الصوت كامل", err);
    }
  }
  if (!complete) store.holdAudio(id, blob, input.chunks);

  await finish(id);
  return { id, memOnly: !complete, errors };
}

/* ====================================================== سجل أخطاء الحفظ */

/** علامة رسائل الحفظ في سجل الأخطاء — عشان سبب فشل التفريغ مايتاخدش منها */
export const SAVE_LOG_TAG = "💾 الحفظ:";

/** نوع خطأ الحفظ: اسمه (QuotaExceededError/TimeoutError/UnknownError…) أو رسالته */
export function saveErrorKind(err: unknown): string {
  const e = err as { name?: string; message?: string } | null;
  if (e?.name && e.name !== "Error") return e.name;
  return `Error:${String(e?.message ?? err).slice(0, 60)}`;
}

/**
 * 🔴 (عيب ٦) رسالة حفظ **واحدة لكل مقطع لكل نوع خطأ**. الحفظ بيتجرّب كل
 * ثانية، فالمساحة المليانة كانت بتكتب رسالة كل ثانية — تسجيل ٥ دقايق بيزقّ
 * كل حاجة تانية برّه السجل (٦٠ رسالة)، وتفريغ بيفشل وقتها بيتعلّم بسبب الحفظ.
 */
export class SaveErrorOnce {
  private seen = new Set<string>();

  first(clipId: string | null | undefined, err: unknown): boolean {
    const k = `${clipId ?? "-"}|${saveErrorKind(err)}`;
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }
}

/** سبب فشل التفريغ من السجل — أحدث رسالة **مش** رسالة حفظ */
export function runFailureLog(entries: ReadonlyArray<{ message: string }>): string | undefined {
  return entries.find((e) => !String(e.message).startsWith(SAVE_LOG_TAG))?.message;
}

/* ======================================================= مسار الموقع */

/**
 * بيجمّع قراءات الموقع للمقطع **بوقتين**: وقت القراءة نفسها (`at` =
 * `pos.timestamp`) ووقت وصولها للصفحة — `trackFromRaw` بيقرر منهم.
 * إشعار الحالة بيرجّع نفس القراءة ⇒ مابتتكررش.
 */
export class FixCollector {
  private fixes: RawFix[] = [];
  private seen = new Set<string>();

  /** `recvEpoch = null` = وقت الوصول مش معروف (القراءة الجاهزة وقت البداية) */
  add(
    fix: { lat: number; lng: number; accuracy: number; at: number } | null | undefined,
    recvEpoch: number | null
  ): void {
    if (!fix) return;
    const k = `${fix.at}|${fix.lat}|${fix.lng}`;
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.fixes.push({ lat: fix.lat, lng: fix.lng, acc: fix.accuracy, fixEpoch: fix.at, recvEpoch });
  }

  list(): RawFix[] {
    return this.fixes.slice();
  }

  get count(): number {
    return this.fixes.length;
  }
}

/* ===================================================== التفريغ من مقطع */

/**
 * سياق التفريغ من المقطع **نفسه** — بدايته وختمه ومصدره ومساره — مش من
 * اللي حيّ في الصفحة دلوقتي (المندوب ممكن يكون بيسجّل مقطع تاني، أو الصفحة
 * اتحدّثت من ساعتها).
 */
export function clipJobFields(c: StoredClip): {
  startedAtMs: number;
  stamp: SessionStampJSON;
  source: "record" | "upload";
  label: string;
  sec: number;
  fixes: TrackFix[];
} {
  return {
    startedAtMs: c.startEpoch,
    stamp: c.stamp,
    source: c.source,
    label: c.label,
    sec: Math.round(clipDurationSec(c)),
    fixes: trackFromRaw(c.rawFixes || [], c.startEpoch),
  };
}

/**
 * بعد ما المقطع يتفرّغ: الدبوس على لوحاته من مساره (لو موجود) + اللي
 * بيتحفظ معاه. الفشل بيسيب النتيجة القديمة (لو فيه) زي ما هي.
 */
export function clipRunOutcome(input: {
  ok: boolean;
  error?: string;
  entries: PlateEntry[];
  fixes?: TrackFix[];
  startEpoch: number;
  tookSec: number;
  reportId?: string;
  engine?: string;
  now: number;
}): { entries: PlateEntry[]; patch: Partial<StoredClip> } {
  if (!input.ok) {
    return { entries: input.entries, patch: { status: "failed", error: input.error || "التفريغ ماكملش" } };
  }
  const entries = input.fixes
    ? stampEntriesWithTrack(input.entries, input.fixes, input.startEpoch)
    : input.entries;
  return {
    entries,
    patch: {
      status: "done",
      error: undefined,
      result: {
        at: input.now,
        plates: entries.length,
        pinned: countPinned(entries),
        entries,
        tookSec: input.tookSec,
        reportId: input.reportId,
        engine: input.engine,
      },
    },
  };
}

/* ============================================================== العرض */

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 1024) return `${Math.max(0, Math.round(n || 0))} بايت`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}

/** مدة المقطع — ولو مش متسجّلة (اتقطع) من آخر حفظ */
export function clipDurationSec(c: Pick<StoredClip, "durationSec" | "startEpoch" | "updatedAt">): number {
  if (c.durationSec > 0) return c.durationSec;
  return Math.max(0, (c.updatedAt - c.startEpoch) / 1000);
}

/**
 * 🔴 **حكم التفريغ — لأي محرّك** (مراجعة ٣ أكتوبر — عيب ٢).
 *
 * كان «نجح» = «ماحدش قال فشل»، ومحرّك «كامل ⚡» بس هو اللي بيقول. فوقوع
 * سيرفر الموديل في «المسح»، وفشل باقي المحرّكات، و«وقّف التفريغ» كانوا
 * بيتحفظوا «✅ خلص · ٠ لوحة» — وتحذير المسح بيبقى الخفيف، فالمندوب يمسح
 * صوت **عمره ما اتفرّغ**. دلوقتي «نجح» لازم يتقال صراحة (`succeeded` =
 * المحرّك وصل لآخره)، والإيقاف فشل حتى لو المحرّك كمّل.
 */
export function runVerdict(r: {
  succeeded: boolean;
  threw?: string | null;
  cancelled?: boolean;
  /** السبب اللي المحرّك قاله */
  error?: string;
  /** آخر رسالة اتسجّلت في سجل الأخطاء وقت التفريغ — احتياطي للسبب */
  lastLog?: string;
  /**
   * «كامل ⚡»: سطر اللوحات وصل بس سطر «done» (الأنواع والأوقات النهائية)
   * ماوصلش — اتقطع/اترفض/اتوقف. اللوحات في الجدول بلا دبوس (عيب ٢).
   */
  platesOnly?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const cut = (s: string) => (s.length > 150 ? `${s.slice(0, 149)}…` : s);
  if (r.platesOnly && (r.threw || r.cancelled || !r.succeeded)) return { ok: false, error: PLATES_ONLY_ERROR };
  if (r.threw) return { ok: false, error: cut(r.threw) };
  if (r.cancelled) return { ok: false, error: "اتوقف قبل ما يخلص — فرّغه تاني" };
  if (!r.succeeded) return { ok: false, error: cut(r.error || r.lastLog || "التفريغ ماكملش") };
  return { ok: true };
}

/* ============================================ سطر اللوحات قبل «done» */

/** حالة المقطع لما اللوحات ظهرت والأنواع ماوصلتش (اتقطع/اترفض/اتوقف) */
export const PLATES_ONLY_ERROR = "الأنواع ماوصلتش — فرّغ تاني";
/** علامة لوحة من سطر اللوحات — موقعها لسه بيتحدّد من سطر «done» */
export const PIN_PENDING = "📍 بيتحدّد…";

const withoutPinMarks = (notes: string[] | undefined) =>
  (notes || []).filter((n) => String(n) !== PIN_PENDING && !isPinMark(n));

/**
 * 🔴 (عيب ٢) لوحات سطر اللوحات — أوقاتها **مبدئية** (`t_s_final:false`،
 * أسوأ فرق ١٠ث ≈ ٨٧م بسرعة ٣٠ كم/س) ⇒ **مافيش دبوس** منها أبداً، وعلامة
 * «📍 بيتحدّد…». الدبوس بييجي من أوقات سطر «done» بس.
 */
export function preliminaryEntries(entries: PlateEntry[]): PlateEntry[] {
  return entries.map((e) => ({
    ...e,
    pin: null,
    review: { ...e.review, notes: [...withoutPinMarks(e.review.notes), PIN_PENDING] },
  }));
}

/**
 * الرد ماكملش بعد سطر اللوحات (اتقطع/اترفض/اتوقف) ⇒ اللوحات **تفضل** في
 * الجدول بلا دبوس، ومتعلّمة «من غير موقع دقيق — الأنواع ماوصلتش — فرّغ تاني».
 */
export function platesOnlyEntries(entries: PlateEntry[]): PlateEntry[] {
  return entries.map((e) => ({
    ...e,
    pin: null,
    review: {
      ...e.review,
      notes: [...withoutPinMarks(e.review.notes), `${NO_PRECISE_PIN} — ${PLATES_ONLY_ERROR}`],
    },
  }));
}

/** «اسمع» — صوت على الجهاز، أو صوت في الذاكرة بس (عيب ٧: كان مقفول بـ٠ بايت) */
export function canPlay(c: Pick<StoredClip, "bytes" | "memOnly">): boolean {
  return c.bytes > 0 || !!c.memOnly;
}

/**
 * أجزاء التسجيل (٢٥٠ms) **لو هي نفس صوت المقطع بالظبط** (مجموع أحجامها =
 * حجمه) — المحركات اللي بتقصّ ببادئة (المدمج/احتياطي المسح) بتستعملها.
 * غير كده `undefined`: أجزاء تسجيل تاني = صوت عربية تانية.
 */
export function matchingChunks(blob: Blob, chunks: Blob[] | undefined): Blob[] | undefined {
  if (!chunks || chunks.length === 0) return undefined;
  const total = chunks.reduce((s, c) => s + c.size, 0);
  return total === blob.size ? chunks : undefined;
}

/**
 * «اعرض لوحاته في الجدول» على جدول فيه لوحات ⇒ سؤال الأول (مراجعة ٣
 * أكتوبر — عيب ٤): التعديلات اليدوية مابتترجعش للمقطع، فالاستبدال بلا
 * سؤال بيضيّعها للأبد أول ما الحفظ التلقائي يكتب فوقها.
 */
export function replaceTableWarning(tableRows: number): string | null {
  if (!(tableRows > 0)) return null;
  return `الجدول فيه ${tableRows} لوحة دلوقتي — هتتبدّل بلوحات المقطع ده، وأي تعديل عملته فيها بإيدك هيضيع. متأكد؟`;
}

/** حالة المقطع بكلام المندوب */
export function clipStatusText(c: Pick<StoredClip, "status" | "result" | "error" | "memOnly">): string {
  const base = clipStatusBase(c);
  return c.memOnly ? `${base} · ⚠️ ${MEM_ONLY_WARNING}` : base;
}

function clipStatusBase(c: Pick<StoredClip, "status" | "result" | "error">): string {
  switch (c.status) {
    case "recording":
      return "🔴 بيسجّل…";
    case "interrupted":
      return "⚠️ اتقطع — صوته محفوظ لحد آخر ثانية";
    case "ready":
      return "جاهز للتفريغ";
    case "queued":
      return "🕒 في الدور";
    case "working":
      return "⏳ بيتفرّغ…";
    case "failed":
      return `❌ فشل${c.error ? ` — ${c.error}` : ""}`;
    case "done": {
      const r = c.result;
      return r ? `✅ ${r.plates} لوحة · 📍 ${r.pinned} بموقع دقيق` : "✅ خلص";
    }
  }
}

/**
 * الصف زي ما بيتعرض: «بيسجّل» بس لو هو التسجيل الشغّال فعلاً. مقطع حالته
 * «بيسجّل» ومش هو (قفله فشل في الكتابة) بيتعامل «اتقطع» — صوته يتفرّغ
 * ويتمسح، بدل صف زراره كلها مستخبية للأبد (مراجعة ٣ أكتوبر — عيب ١).
 */
export function clipForRow(c: StoredClip, recordingId: string | null): { isRec: boolean; clip: StoredClip } {
  if (recordingId && c.id === recordingId) return { isRec: true, clip: { ...c, status: "recording" } };
  if (c.status === "recording") return { isRec: false, clip: { ...c, status: "interrupted" } };
  return { isRec: false, clip: c };
}

/** زر التفريغ قدام المقطع */
export function transcribeAction(c: Pick<StoredClip, "status">): { label: string; enabled: boolean } {
  if (c.status === "done") return { label: "فرّغ تاني", enabled: true };
  const enabled = c.status === "ready" || c.status === "interrupted" || c.status === "failed";
  return { label: "تفريغ", enabled };
}

/**
 * 🔁 رسالة قبل «فرّغ تاني» لمقطع متفرّغ (٢٠ أكتوبر ٢٠٢٦ — المالك: «زرار فرغ تاني لو هو مفرغ يجيبلو رساله يقولو المقطع
 * دة متفرغ»). مهند فرّغ نفس المقطع لحد ٤ مرات في دقيقتين. اتصدّر منه ⇒ كمان تحذير التكرار في السجلات. `null` = عادي.
 */
export function retranscribeWarning(c: Pick<StoredClip, "status" | "result">): string | null {
  if (c.status !== "done" && !c.result) return null;
  const n = c.result?.plates ?? 0;
  const head = `المقطع ده متفرّغ قبل كده (${n} لوحة) — لوحاته موجودة في «اعرض لوحاته في الجدول».`;
  const exported = c.result?.exportedCount ?? 0;
  if (exported > 0) {
    return `${head}\nواتصدّر منه ${exported} لوحة للسجلات — التفريغ تاني هيطلّع لوحاته تاني، ولو صدّرتها هتتكرر في السجلات.\nتفرّغه تاني؟`;
  }
  return `${head}\nتفرّغه تاني؟`;
}

/** نص تأكيد المسح — بيحذّر لو الصوت لسه ماتفرّغش */
export function deleteWarning(c: Pick<StoredClip, "result" | "memOnly">): string {
  if (c.memOnly && !c.result) {
    return "⚠️ المقطع ده في الذاكرة بس ولسه ماتفرّغش — لو مسحته صوته يروح خالص ومش هيرجع.";
  }
  return c.result
    ? "تمسح المقطع ده؟ صوته ولوحاته المحفوظة معاه هيتمسحوا (التقرير بيفضل)."
    : "⚠️ المقطع ده لسه ماتفرّغش — لو مسحته صوته يروح خالص ومش هيرجع.";
}

/** التخزين قرّب يتملي؟ (٨٠٪) — بنحذّر ومابنمسحش حاجة لوحدنا */
export function storageNearlyFull(usage: number | undefined, quota: number | undefined): boolean {
  if (!usage || !quota) return false;
  return usage / quota >= 0.8;
}

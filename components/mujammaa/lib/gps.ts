/**
 * ==========================================================================
 *  الموقع — دبوس GPS مع كل لوحة
 * ==========================================================================
 *
 *  المطلوب: كل لوحة المندوب ينطقها ياخد جنبها دبوس للمكان اللي كان فيه
 *  **في نفس اللحظة**.
 *
 *  الفخّ التقني: ‎getCurrentPosition()‎ بتاخد من ثانية لـ٢٠ ثانية عشان
 *  تجيب أول قراءة. لو نادينا عليها لحظة ما اللوحة تظهر، الدبوس هيتأخّر
 *  والمندوب يكون مشي مية متر.
 *
 *  الحل: ‎watchPosition()‎ بتفضل شغالة من أول ما الصفحة تفتح وبتحدّث
 *  القراءة باستمرار في الخلفية. فلما اللوحة تظهر إحنا **ختمنا** آخر
 *  قراءة جاهزة — بلا انتظار ولا تأخير.
 *
 *  وبنسجّل عمر القراءة كذلك: لو آخر قراءة أقدم من دقيقة نعلّمها «قديم»
 *  عشان المندوب ما يعتمدش على دبوس بايت.
 */

import { gpsService, isNativeApp } from "@/lib/gps";
import { getDevicePlatform } from "@/lib/devicePlatform";
import { GPS_STAMP_MAX_ACCURACY_M } from "@/lib/gpsWarning";

export interface GpsFix {
  lat: number;
  lng: number;
  /** دقة القراءة بالمتر */
  accuracy: number;
  /** وقت القراءة (ملي ثانية) */
  at: number;
}

export interface GpsPin extends GpsFix {
  /** عمر القراءة لحظة الختم */
  ageMs: number;
  /** أقدم من الحد = مش موثوق تماماً */
  stale: boolean;
}

export type GpsStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "error";

/** أقدم من كده تعتبر قراءة قديمة */
export const STALE_AFTER_MS = 60_000;

/** أسوأ دقة نقبلها — أوسع من كده مايوصّلش لعربية */
export const MAX_ACCURACY_M = 100;
/**
 * أبعد فرق زمني بين النطق وأقرب قراءة قبل ما نرفض الدبوس.
 * ⚠️ كان ٦٠ث وده رمى دبابيس كان النظام بيحتفظ بيها ويعلّمها «قديم» —
 * ومعلومة معلّمة أنفع من لا معلومة. الرفض دلوقتي للحالات اللي الدبوس فيها
 * بقى بلا معنى فعلاً، و`stale` هي اللي بتحذّر فيما دون كده.
 */
export const MAX_PIN_GAP_MS = 300_000;
/** أكبر فجوة بين قراءتين نسمح بالاستنباط عبرها */
export const MAX_INTERPOLATE_MS = 120_000;

/* ------------------------------------------------ الحالة المشتركة */
// حالة واحدة للتطبيق كله عشان الصفحتين يشاركوا نفس القراءة،
// فما نفتحش الـGPS مرتين ونستهلك بطارية على الفاضي.

let latest: GpsFix | null = null;
let status: GpsStatus = "idle";
let lastError: string | null = null;
let watchId: number | null = null;
let watchers = 0;

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeGps(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function gpsStatus(): GpsStatus {
  return status;
}

export function gpsError(): string | null {
  return lastError;
}

export function currentFix(): GpsFix | null {
  return latest;
}

/**
 * يبدأ متابعة الموقع. آمن إنك تنادي عليها من أكتر من صفحة —
 * بتفتح متابعة واحدة بس وبتعدّ اللي محتاجينها.
 * ترجّع دالة إيقاف.
 */
export function startGpsWatch(): () => void {
  watchers++;

  if (watchId !== null) {
    return () => stopOne();
  }

  /**
   * 🧮 قناص (١٦ أكتوبر ٢٠٢٦): المراقبة من **خدمة موقع التطبيق** (`@/lib/gps`) بدل
   * `watchPosition` بتاع المتصفّح — على الموبايل دي الأصلية (Capacitor)، وفي المتصفّح
   * ويب عادي. المتصفّح جوّه التطبيق كان بيطلّع على الآيفون «platehunter-ksa.vercel.app
   * would like to use your current location» (بلاغ المالك ٢٧ سبتمبر). القراءة بوقتها
   * الحقيقي (`timestamp`) ⇒ `currentFix`/`FixCollector`/`platePin` زي المعمل بالظبط.
   */
  status = "requesting";
  lastError = null;
  watchId = 1;
  notify();
  void gpsService.startTracking();
  appStop = () => gpsService.stopTracking();
  // الاشتراك بيبعت القراءة المخزّنة عند الخدمة على طول (ممكن عمرها ٢٠ث+) — دي مش
  // «وصلت دلوقتي»، فوقت وصولها مش معروف والتحذير بيقيس بوقتها هي (مراجعة ١٧ أكتوبر).
  seeding = true;
  appUnsub = gpsService.subscribe((c) => {
    if (!c) return;
    acceptFix({ lat: c.lat, lng: c.lng, accuracy: c.accuracy ?? 0, at: c.timestamp || Date.now() });
  });
  seeding = false;
  fastBackoff = FAST_REARM_MIN_MS;
  void armFast();

  return () => stopOne();
}

let appUnsub: (() => void) | null = null;
let appStop: (() => void) | null = null;

/**
 * القراءة الأحدث بس هي اللي تكتب. المصدرين (مراقبة المجمّع الخاصة + خدمة التطبيق)
 * بيبعتوا نفس القراءات أحياناً، وخدمة التطبيق بتعيد «الأفضل» عندها كل ثانية — وده
 * ممكن يبقى أقدم من آخر قراءة خام ⇒ مايرجّعش الموقع لورا.
 * ووقت وصولها للصفحة بيتحفظ لتحذير «الموقع مش بيتحدّث» — وقت القراءة نفسها ساعة
 * الأقمار، وممكن تفرق عن ساعة الموبايل ثواني (`platePin.ts` — CLOCK_TOLERANCE_MS).
 */
let latestRecvAt: number | null = null;
/** جوّه نداء الاشتراك الأول — القراءة اللي بتيجي وقتها مخزّنة مش جديدة */
let seeding = false;

function acceptFix(f: GpsFix) {
  if (latest && f.at <= latest.at) return;
  latest = f;
  latestRecvAt = seeding ? null : Date.now();
  status = "active";
  lastError = null;
  notify();
}

/** آخر قراءة جديدة وصلت إمتى (ساعة الموبايل) */
export function lastFixRecvAt(): number | null {
  return latestRecvAt;
}

function stopOne() {
  watchers = Math.max(0, watchers - 1);
  if (watchers === 0 && watchId !== null) {
    appUnsub?.();
    appUnsub = null;
    appStop?.();
    appStop = null;
    dropFast();
    watchId = null;
    status = "idle";
    notify();
  }
}

/* ==========================================================================
 *  📍 أندرويد: قراءة كل ثانية طول ما المجمّع ظاهر (١٧ أكتوبر ٢٠٢٦)
 * ==========================================================================
 *  تجربة المالك: ٣٣ لوحة و**٤ بس** خدوا موقع — قراءة كل ٢٠ث بالظبط. مراقبة التطبيق
 *  (`@/lib/gps`) على أندرويد من غير `interval`، و`@capacitor/geolocation` 8 بيخلّيه =
 *  `timeout` (٢٠ث) و`minimumUpdateInterval` افتراضي ٥ث. والمجمّع بيحط الموقع من قراءة
 *  في حدود ثانيتين من لحظة النطق (`platePin.ts`) — فلوحة كل ٣ث مالقتش قراءة جنبها.
 *  المالك: «عايز كل سيارة تاخد موقع وقت ما المندوب قالها بالظبط».
 *
 *  ⇒ مراقبة أصلية **تانية** خاصة بالمجمّع (سوبر أدمن بس)، كل ثانية، وبتتقفل مع آخر
 *    مستخدم. مراقبة التطبيق نفسها **ماتتلمسش** — المناديب زي ما هم بالحرف.
 *  · **أندرويد بس.** هناك كل مراقبة طلب مستقل بمهلته. على الآيفون كل المراقبات على
 *    مدير موقع واحد بيبعت كل قراءة لكل المشتركين أصلاً (مافيش `interval` هناك)، ومهلته
 *    **مشتركة** وبتمسح كل المراقبات لما تخلص — مراقبة جديدة جوّه مبنى ممكن تقفل
 *    مراقبة التطبيق. والمتصفّح بيبعت كل ثانية لوحده.
 *  · 🔴 **مابتطلبش إذن أبداً** (مراجعة ١٧ أكتوبر): `watchPosition` من غير إذن بيطلب
 *    الإذن بنفسه، وCapacitor بيوزّع ردود طلبات الإذن بالترتيب — فطلبها مع طلب خدمة
 *    التطبيق كان بيدّي كل واحد رد التاني: خدمة التطبيق ماتفتحش مراقبتها خالص.
 *    ⇒ `checkPermissions` الأول (مابيطلّعش أي رسالة)، ولو مش «granted» (أو الموقع مقفول،
 *    أو «تقريبي» بس) نسأل تاني كل ٣ث لحد ما خدمة التطبيق تاخد الإذن.
 *  · `timeout` هنا = مهلة **أول قراءة** بس، وبعدها المكتبة بتقفل المراقبة نفسها —
 *    فعشر دقايق بدل ٢٠ث: جوّه جراج مابتموتش وتستنى إعادة.
 *  · خطأ ⇒ نقفلها ونعيدها: المهلة (0010) بعد ٢ث على طول، والباقي بمهلة بتطول لحد ١٠ث،
 *    وقراءة ناجحة بترجّعها. رفض تشغيل الموقع / خدمات جوجل ⇒ **مانعيدش** (رسالة للمندوب).
 */
export const FAST_WATCH_OPTS = {
  enableHighAccuracy: true,
  timeout: 600_000,
  maximumAge: 0,
  interval: 1_000,
  minimumUpdateInterval: 1_000,
} as const;
export const FAST_REARM_MIN_MS = 2_000;
export const FAST_REARM_MAX_MS = 10_000;
/** لسه مافيش إذن ⇒ نسأل تاني كل كده (سؤال بس، مابيطلّعش رسالة) */
export const FAST_PERM_RECHECK_MS = 3_000;
/** الإذن مرفوض · الموقع مقفول · ممنوع · رفض تشغيله · خدمات جوجل (رسائل للمندوب) */
const FAST_FATAL = new Set([
  "OS-PLUG-GLOC-0003",
  "OS-PLUG-GLOC-0007",
  "OS-PLUG-GLOC-0008",
  "OS-PLUG-GLOC-0009",
  "OS-PLUG-GLOC-0014",
  "OS-PLUG-GLOC-0015",
  "OS-PLUG-GLOC-0017",
]);
const FAST_TIMEOUT_CODE = "OS-PLUG-GLOC-0010";

/** كل فتح/قفل بيزوّده — نداءات مراقبة قديمة بعده بتتجاهل */
let fastToken = 0;
let fastIdP: Promise<string | null> | null = null;
let fastTimer: ReturnType<typeof setTimeout> | null = null;
let fastBackoff = FAST_REARM_MIN_MS;

type GeoModule = typeof import("@capacitor/geolocation");
let geoModP: Promise<GeoModule> | null = null;
/**
 * المكتبة مرة واحدة — الفتح والقفل على نفس النسخة.
 * 🔴 **الوعد شايل الموديول، مش `Geolocation` نفسه** (مراجعة ١٧ أكتوبر): بلجن Capacitor
 * بيرد على أي اسم دالة — حتى `then` — فوعد بيتحلّ بيه بيعامله كوعد ويفضل معلّق للأبد
 * على الموبايل، والمراقبة ماكانتش هتتفتح خالص.
 */
function loadGeo(): Promise<GeoModule> {
  if (!geoModP) {
    geoModP = import("@capacitor/geolocation");
    geoModP.catch(() => {
      geoModP = null;
    });
  }
  return geoModP;
}

function errCode(e: unknown): string {
  return String((e as { code?: unknown } | null | undefined)?.code ?? "");
}

/** يقفل مراقبة المجمّع الحالية (لو رقمها لسه مارجعش، أول ما يرجع) + أي إعادة مستنية */
function dropFast(): void {
  fastToken++;
  if (fastTimer !== null) {
    clearTimeout(fastTimer);
    fastTimer = null;
  }
  const p = fastIdP;
  fastIdP = null;
  if (!p) return;
  void p.then(async (id) => {
    if (!id) return;
    try {
      const { Geolocation } = await loadGeo();
      await Geolocation.clearWatch({ id });
    } catch {
      /* اتقفلت لوحدها */
    }
  });
}

/** يفتح تاني بعد `wait` — لو الصفحة لسه مفتوحة */
function retryFast(wait: number): void {
  if (fastTimer !== null) clearTimeout(fastTimer);
  fastTimer = setTimeout(() => {
    fastTimer = null;
    if (watchId !== null) void armFast();
  }, wait);
}

async function armFast(): Promise<void> {
  const token = ++fastToken;
  if (!(await isNativeApp()) || token !== fastToken) return;
  if (getDevicePlatform() !== "android") return;
  let geo: GeoModule["Geolocation"];
  try {
    geo = (await loadGeo()).Geolocation;
  } catch {
    return;
  }
  if (token !== fastToken) return;
  // الإذن: سؤال بس — الطلب نفسه شغل خدمة التطبيق (`gpsService.startTracking`)
  let granted = false;
  try {
    granted = (await geo.checkPermissions())?.location === "granted";
  } catch {
    /* الموقع مقفول من الموبايل ⇒ زي «لسه» */
  }
  if (token !== fastToken) return;
  if (!granted) {
    retryFast(FAST_PERM_RECHECK_MS);
    return;
  }
  let failed = false;
  const fail = (err: unknown) => {
    if (failed || token !== fastToken) return;
    failed = true;
    rearmAfter(err);
  };
  const idP = geo
    .watchPosition(FAST_WATCH_OPTS, (pos, err) => {
      if (token !== fastToken) return;
      const c = pos?.coords;
      if (err || !pos || !c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) {
        fail(err);
        return;
      }
      fastBackoff = FAST_REARM_MIN_MS;
      acceptFix({
        lat: c.latitude,
        lng: c.longitude,
        accuracy: c.accuracy ?? 0,
        at: pos.timestamp || Date.now(),
      });
    })
    .then(
      (id) => id,
      (e) => {
        fail(e);
        return null;
      }
    );
  fastIdP = idP;
}

function rearmAfter(err: unknown): void {
  dropFast();
  const code = errCode(err);
  if (watchId === null || FAST_FATAL.has(code)) return;
  if (code === FAST_TIMEOUT_CODE) {
    // المهلة نفسها بتباعد المحاولات — مانطوّلش فوقها
    retryFast(FAST_REARM_MIN_MS);
    return;
  }
  const wait = fastBackoff;
  fastBackoff = Math.min(wait * 2, FAST_REARM_MAX_MS);
  retryFast(wait);
}

/* ------------------------------------------- تحذير وهو بيسجّل */

/** آخر قراءة جديدة وصلت من أكتر من كده وهو بيسجّل ⇒ «الموقع مش بيتحدّث» */
export const FIX_LATE_MS = 3_000;

/**
 * ⚠️ المندوب يعرف **وهو بيسجّل** إن اللوحات اللي بيقولها دلوقتي ممكن تطلع من غير
 * موقع — مش بعد التفريغ (زي «٩٦ لوحة بلا موقع» ١٥ أكتوبر في التطبيق —
 * `lib/gpsWarning.ts`). نفس حد الدقة (١٠٠م) + الموقع واقف (المجمّع محتاج قراءة في
 * حدود ثانيتين من كل لوحة).
 *
 * `recvAt` = وقت وصول آخر قراءة جديدة بساعة الموبايل (`lastFixRecvAt`). من غيره بنقيس
 * بوقت القراءة نفسها — وده ساعة الأقمار، وموبايل ساعته قدّام كان هيطلّع التحذير طول
 * التسجيل واللوحات كلها بموقعها.
 */
export function recordGpsWarning(
  fix: GpsFix | null | undefined,
  recording: boolean,
  now = Date.now(),
  recvAt?: number | null
): string | null {
  if (!recording) return null;
  if (!fix || !Number.isFinite(fix.accuracy) || fix.accuracy <= 0) {
    return "⚠️ الموقع لسه مش جاهز — اللوحات اللي بتقولها دلوقتي هتطلع من غير موقع. استنى ثانية أو اطلع لمكان مكشوف.";
  }
  if (fix.accuracy > GPS_STAMP_MAX_ACCURACY_M) {
    return `⚠️ دقة الموقع ضعيفة (${Math.round(fix.accuracy)} متر) — اللوحات اللي بتقولها دلوقتي هتطلع من غير موقع. اطلع لمكان مكشوف.`;
  }
  const age = now - (typeof recvAt === "number" && Number.isFinite(recvAt) ? recvAt : fix.at);
  if (age > FIX_LATE_MS) {
    return `⚠️ الموقع مش بيتحدّث (آخر قراءة من ${Math.floor(age / 1000)} ثانية) — اللوحات اللي بتقولها دلوقتي ممكن تطلع من غير موقع.`;
  }
  return null;
}

/**
 * يختم آخر قراءة متاحة — دي اللي بننادي عليها لحظة ظهور اللوحة.
 * فورية تماماً: مافيش أي انتظار.
 */
export function stampPin(now = Date.now()): GpsPin | null {
  if (!latest) return null;
  const ageMs = now - latest.at;
  return { ...latest, ageMs, stale: ageMs > STALE_AFTER_MS };
}

/* ==========================================================================
 *  مسار الموقع (GPS Track) — للتسجيل الممتد
 * ==========================================================================
 *  في البث المباشر اللوحة بتظهر لحظة نطقها، فـ‎stampPin()‎ كفاية.
 *
 *  لكن في التسجيل الممتد الموضوع مختلف تماماً: المندوب بيسجّل ٥ دقايق
 *  وهو **ماشي**، والتفريغ بيحصل بعد ما يخلّص. فلو ختمنا الموقع وقت
 *  التفريغ، كل اللوحات هتاخد نفس الدبوس — مكانك لما ضغطت «تفريغ» — وده
 *  عكس المطلوب تماماً (المطلوب مكان نطق كل لوحة).
 *
 *  الحل: نسجّل **مسار** كامل وإحنا بنسجّل الصوت (كل قراءة بوقتها)، وبعد
 *  التفريغ نستخدم توقيت كل لوحة في الصوت عشان نجيب أقرب قراءة للحظة دي.
 */
export class GpsTrack {
  private fixes: GpsFix[] = [];
  private unsubscribe: (() => void) | null = null;
  private stopWatch: (() => void) | null = null;

  /** كل قراءة اتسجّلت في المسار */
  get count(): number {
    return this.fixes.length;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.fixes = [];

    // نضم القراءة الحالية فوراً لو موجودة، فأول لوحة ما تفضلش بلا موقع
    const now = currentFix();
    if (now) this.fixes.push(now);

    this.stopWatch = startGpsWatch();
    this.unsubscribe = subscribeGps(() => {
      const fix = currentFix();
      if (!fix) return;
      const last = this.fixes[this.fixes.length - 1];
      if (last && last.at === fix.at) return; // نفس القراءة
      this.fixes.push(fix);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopWatch?.();
    this.stopWatch = null;
  }

  /**
   * نسخة مجمّدة من المسار — مسار مستقل بنفس القراءات، **مش** بيتأثر
   * بأي تسجيل جاي.
   *
   * 🔴 **ليه دي موجودة:** ‎start()‎ بتعمل ‎fixes = []‎. فلما بقى ينفع
   * المندوب يسجّل مقطع جديد والقديم لسه بيتفرّغ، أول ما يدوس تسجيل
   * **قراءات المقطع اللي في الطابور بتتمسح** — واللوحات بتاعته تطلع
   * بلا دبوس، أو أسوأ: بدبوس من مكان تاني هو واقف فيه دلوقتي.
   * الصورة دي بتتاخد وقت ما المقطع يدخل الطابور، فبتفضل معاه.
   */
  snapshot(): GpsTrack {
    const copy = new GpsTrack();
    copy.fixes = this.fixes.slice();
    return copy;
  }

  /**
   * المكان عند لحظة نطق معيّنة (بالتوقيت المطلق بالملي ثانية).
   * ‎ageMs‎ هنا = بُعد أقرب قراءة عن اللحظة المطلوبة، مش عمرها من الآن.
   *
   * 🔴 **قاعدة عدم الاختراع** — نفس قاعدة اللوحات مطبّقة على الموقع:
   *  • القراءة اللي دقتها أسوأ من ‎MAX_ACCURACY_M‎ **مش قراءة**؛ ±٥٠٠ متر
   *    مش هتوصّل المندوب لعربية، فبنتجاهلها بدل ما نطلّعها كأنها مكان.
   *  • لو أقرب قراءة أبعد من ‎MAX_PIN_GAP_MS‎ ⇒ **‎null‎**، مش أقرب حاجة
   *    موجودة. دبوس غلط أسوأ من غير دبوس: المندوب هيروح لمكان مافيهوش
   *    عربية، يضيّع وقته، ويفقد ثقته في البرنامج.
   *  • **مابنستنبطش عبر فجوة كبيرة** — الاستنباط بين قراءتين بعيدتين بيرسم
   *    خط مستقيم على طريق ماحصلش (العربية ممكن تكون لفّت أو وقفت).
   *
   * وبين قراءتين قريبتين بنستنبط بدل ما نقفز لواحدة — المندوب ماشي، فنص
   * المسافة بين قراءتين أقرب للحقيقة من أي طرف فيهم.
   */
  pinAt(atMs: number): GpsPin | null {
    const usable = this.fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M);
    if (usable.length === 0) return null;

    let before: GpsFix | null = null;
    let after: GpsFix | null = null;
    for (const f of usable) {
      if (f.at <= atMs) before = f;
      else if (!after) after = f;
    }

    if (before && after) {
      const gap = after.at - before.at;
      if (gap > MAX_INTERPOLATE_MS) return null;
      const r = gap === 0 ? 0 : (atMs - before.at) / gap;
      const delta = Math.min(atMs - before.at, after.at - atMs);
      return {
        lat: before.lat + (after.lat - before.lat) * r,
        lng: before.lng + (after.lng - before.lng) * r,
        accuracy: Math.max(before.accuracy, after.accuracy),
        at: atMs,
        ageMs: delta,
        stale: delta > STALE_AFTER_MS,
      };
    }

    const edge = (before ?? after)!;
    const delta = Math.abs(edge.at - atMs);
    if (delta > MAX_PIN_GAP_MS) return null;
    return { ...edge, ageMs: delta, stale: delta > STALE_AFTER_MS };
  }
}

/* ------------------------------------------------------- روابط الخريطة */

/** رابط خريطة جوجل للدبوس */
export function toMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function pinLink(pin: GpsPin | null | undefined): string | null {
  if (!pin) return null;
  return toMapsLink(pin.lat, pin.lng);
}

/** نص مختصر للدبوس: «24.712345, 46.675300 (±8م)» */
export function pinLabel(pin: GpsPin | null | undefined): string {
  if (!pin) return "بدون موقع";
  return `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)} (±${Math.round(pin.accuracy)}م)`;
}

/** وصف حالة الموقع بالعربي للعرض */
export function gpsStatusLabel(s: GpsStatus): string {
  switch (s) {
    case "idle":
      return "الموقع متوقف";
    case "requesting":
      return "بيجيب الموقع…";
    case "active":
      return "الموقع شغّال";
    case "denied":
      return "إذن الموقع مرفوض";
    case "unavailable":
      return "الموقع غير مدعوم";
    case "error":
      return "خطأ في الموقع";
  }
}

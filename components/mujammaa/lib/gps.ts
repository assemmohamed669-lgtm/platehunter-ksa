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

import { gpsService } from "@/lib/gps";

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
  appUnsub = gpsService.subscribe((c) => {
    if (!c) return;
    latest = { lat: c.lat, lng: c.lng, accuracy: c.accuracy ?? 0, at: c.timestamp || Date.now() };
    status = "active";
    lastError = null;
    notify();
  });

  return () => stopOne();
}

let appUnsub: (() => void) | null = null;
let appStop: (() => void) | null = null;

function stopOne() {
  watchers = Math.max(0, watchers - 1);
  if (watchers === 0 && watchId !== null) {
    appUnsub?.();
    appUnsub = null;
    appStop?.();
    appStop = null;
    watchId = null;
    status = "idle";
    notify();
  }
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

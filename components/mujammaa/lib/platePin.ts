/**
 * ==========================================================================
 *  موقع كل لوحة = مكان المندوب **لحظة ما قالها** — مميّز ودقيق
 * ==========================================================================
 *
 *  طلب المالك (٣ أكتوبر ٢٠٢٦): «كل لوحه وهو المندوب في الشارع بتاخد موقع
 *  السيارة نفسه اللي المندوب قالها وقت ما قالها».
 *  وقاعدته الدائمة (٢٧ سبتمبر): «كل لوحة ليها موقعها الخاص بيها ويكون دقيق».
 *
 *  🔴 **ليه مش `GpsTrack.pinAt` القديمة؟** حدودها كانت واسعة جداً للمجمّع:
 *    · دقة لحد ١٠٠م مقبولة            ⇒ هنا **٢٥م** بس
 *    · قراءة واحدة بتتمدّ ٥ دقايق       ⇒ هنا **ثانيتين** بس من لحظة النطق
 *    · استنباط عبر فجوة دقيقتين         ⇒ هنا بين قراءتين **≤٤ث** بس
 *  فكانت كل اللوحات اللي بعد آخر قراءة (دخل جراج/مبنى) بتاخد **نفس النقطة**.
 *  (`GpsTrack` نفسها مافيش فيها تعديل — البث المباشر لسه بيستخدمها.)
 *
 *  والقاعدة: **دبوس غلط أسوأ من مافيش دبوس** — بيتصدّر في Excel كأنه حقيقة
 *  والمندوب يروح لمكان مافيهوش عربية. فاللوحة اللي مالهاش قراءة دقيقة قريبة
 *  بتطلع **بلا موقع ومتعلّمة** «من غير موقع دقيق» — مش أقرب حاجة موجودة.
 *
 *  كل الدوال هنا **نقية** (مافيش متصفّح ولا GPS) عشان تتختبر لوحدها.
 */

import type { GpsPin } from "./gps";
import type { PlateEntry } from "./plateEntry";

/** أسوأ دقة نقبلها لدبوس لوحة (متر) */
export const PIN_MAX_ACCURACY_M = 25;
/** أبعد مسافة زمنية بين لحظة النطق وأقرب قراءة نستخدمها (ملي ثانية) */
export const PIN_MAX_SNAP_MS = 2000;
/**
 * أكبر فجوة بين قراءتين نستنبط بينهم. ضعف حد الالتقاط بالظبط — فأي لوحة
 * في النص بتكون **≤ثانيتين** من أقرب قراءة، يعني نفس شرط الالتقاط.
 */
export const PIN_MAX_BRACKET_MS = 2 * PIN_MAX_SNAP_MS;
/**
 * فرق ساعة القراءة عن ساعة الجهاز اللي بنعتبره طبيعي (تأخير توصيل).
 *
 * 🔴 مراجعة ٣ أكتوبر (جولة ٢ — عيب ٤): الجولة التانية كانت بتسيب أي فرق
 * ثابت لحد دقيقة على إنه «تأخير توصيل» ⇒ موبايل ساعته قدّام ٨ث بياخد كل
 * الدبابيس ٦٧م غلط (٣٠ث ⇒ ٢٥٠م) ومتعلّمة «دقيقة». القراءة الطازة
 * (`maximumAge: 0`) بتوصل في أقل من ثانية، فالفرق الثابت فوق ٥ث **ساعة** —
 * قدّام أو ورا — وبيتصحّح (تصحيح الجولة الأولى رجع).
 */
export const CLOCK_TOLERANCE_MS = 5000;

/** العلامة اللي بتتكتب في ملاحظات اللوحة اللي مالهاش موقع دقيق */
export const NO_PRECISE_PIN = "من غير موقع دقيق";

/** قراءة زي ما وصلت من المتصفح — بتتحفظ مع المقطع */
export interface RawFix {
  lat: number;
  lng: number;
  /** دقة القراءة بالمتر */
  acc: number;
  /** وقت القراءة نفسها (`pos.timestamp`) */
  fixEpoch: number;
  /**
   * وقت وصولها للصفحة (`Date.now()` لحظة الإشعار). `null` = مش معروف (القراءة
   * الجاهزة وقت بداية المقطع وصلت قبله بوقت مانعرفوش) — مابتدخلش في حساب
   * فرق الساعة، وإلا تأخيرها الوهمي (صفر) بيشدّ الوسيط.
   */
  recvEpoch: number | null;
}

/** قراءة على مسار المقطع — `tMs` من بداية الصوت */
export interface TrackFix {
  tMs: number;
  lat: number;
  lng: number;
  acc: number;
}

export type PinMiss =
  /** اللوحة مالهاش لحظة نطق من السيرفر */
  | "no-time"
  /** مافيش ولا قراءة صالحة في المسار */
  | "no-fix"
  /** فيه قراءات قريبة بس كلها أوسع من ٢٥م */
  | "coarse"
  /** القراءات الدقيقة أبعد من ثانيتين عن لحظة النطق */
  | "gap"
  /** نفس **القراءة** (نفس وقتها) اتحطّت على اللوحة اللي جنبها — نفس الإحداثيات من قراءة طازة تانية مسموح */
  | "same-fix";

export interface PinResolution {
  pin: { lat: number; lng: number; acc: number; ageMs: number } | null;
  kind?: "interp" | "snap";
  reason?: PinMiss;
  /** فهارس القراءات اللي اتبنى منها الدبوس في المسار */
  fixIdx: number[];
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * القراءات الخام ⇒ مسار بتوقيت نسبي لبداية الصوت، مرتّب ومن غير تكرار.
 *
 *  · **وقت القراءة نفسها** مش وقت وصولها — القراءة المخزّنة اللي بتوصل متأخرة
 *    لازم تفضل في وقتها الحقيقي، وإلا مكان قديم يتختم كأنه «دلوقتي».
 *  · تأخير توصيل طبيعي (أقل من ٥ث) ⇒ مابنحرّكش حاجة.
 *  · فرق **ثابت** أكبر من ٥ث (ساعة الموبايل قدّام أو ورا ساعة القراءات)
 *    ⇒ ساعة، وبيتصحّح على كل القراءات (تصحيح الجولة الأولى — عيب ٤).
 *    ⚖️ تأخير توصيل منتظم فوق ٥ث على **كل** قراءة مايتفرقش عنه بالأرقام،
 *    وبيتعامل نفس المعاملة (القراءة الطازة مابتتأخرش كده) — والوقتين
 *    محفوظين في `rawFixes` لو موبايل حقيقي قال غير كده.
 *  · القرار بالفرق **الوسيط** (مابيتأثرش بقراءة شاذة)، والتصحيح بـ**أقل**
 *    فرق **في عنقود الوسيط** — التأخير بيزوّد بس، فأقل فرق = فرق الساعة
 *    لوحده: القراءة اللي اتأخرت زيادة بتفضل في وقتها الحقيقي، وقراءة واحدة
 *    بوقت مجنون (برّه العنقود) مابتسحبش التصحيح على المسار كله.
 *  · القراءة اللي وقت وصولها مش معروف (`null` — الجاهزة وقت البداية)
 *    مابتدخلش في الحساب، بس بتتصحّح زي الباقي (ساعتها نفس الساعة).
 */
export function trackFromRaw(raw: RawFix[], startEpoch: number): TrackFix[] {
  const ok = (raw || []).filter(
    (f) => f && finite(f.lat) && finite(f.lng) && finite(f.fixEpoch) && Math.abs(f.lat) <= 90 && Math.abs(f.lng) <= 180
  );
  if (!ok.length) return [];
  const d = ok
    .filter((f) => finite(f.recvEpoch))
    .map((f) => (f.recvEpoch as number) - f.fixEpoch);
  let shift = 0;
  if (d.length) {
    const off = median(d);
    if (Math.abs(off) > CLOCK_TOLERANCE_MS) {
      shift = Math.min(...d.filter((x) => x >= off - CLOCK_TOLERANCE_MS));
    }
  }
  const out: TrackFix[] = ok.map((f) => ({
    tMs: Math.round(f.fixEpoch + shift - startEpoch),
    lat: f.lat,
    lng: f.lng,
    acc: finite(f.acc) && f.acc >= 0 ? f.acc : Number.POSITIVE_INFINITY,
  }));
  out.sort((a, b) => a.tMs - b.tMs);
  const seen = new Set<string>();
  return out.filter((f) => {
    const k = `${f.tMs}|${f.lat}|${f.lng}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * مكان المندوب عند لحظة نطق واحدة (`tMs` من بداية الصوت).
 *
 *  ١. قراءة بالظبط في اللحظة ⇒ هي.
 *  ٢. قراءتين دقيقتين حوالين اللحظة وبينهم ≤٤ث ⇒ **استنباط** بالنسبة.
 *  ٣. غير كده: أقرب قراءة دقيقة لو في حدود **ثانيتين**.
 *  ٤. غير كده: **لا شيء** + السبب.
 */
export function resolvePlatePin(track: TrackFix[], tMs: number | undefined | null): PinResolution {
  if (!finite(tMs)) return { pin: null, reason: "no-time", fixIdx: [] };
  if (!track || track.length === 0) return { pin: null, reason: "no-fix", fixIdx: [] };

  let bi = -1;
  let ai = -1;
  for (let i = 0; i < track.length; i++) {
    const f = track[i];
    if (!(f.acc <= PIN_MAX_ACCURACY_M)) continue;
    if (f.tMs <= tMs) bi = i;
    else if (ai < 0) ai = i;
  }

  if (bi < 0 && ai < 0) {
    const coarseNear = track.some((f) => Math.abs(f.tMs - tMs) <= PIN_MAX_SNAP_MS);
    return { pin: null, reason: coarseNear ? "coarse" : "no-fix", fixIdx: [] };
  }

  const b = bi >= 0 ? track[bi] : null;
  const a = ai >= 0 ? track[ai] : null;

  if (b && b.tMs === tMs) {
    return { pin: { lat: b.lat, lng: b.lng, acc: b.acc, ageMs: 0 }, kind: "snap", fixIdx: [bi] };
  }

  if (b && a && a.tMs - b.tMs <= PIN_MAX_BRACKET_MS) {
    const r = (tMs - b.tMs) / (a.tMs - b.tMs);
    return {
      pin: {
        lat: b.lat + (a.lat - b.lat) * r,
        lng: b.lng + (a.lng - b.lng) * r,
        acc: Math.max(b.acc, a.acc),
        ageMs: Math.min(tMs - b.tMs, a.tMs - tMs),
      },
      kind: "interp",
      fixIdx: [bi, ai],
    };
  }

  const db = b ? tMs - b.tMs : Number.POSITIVE_INFINITY;
  const da = a ? a.tMs - tMs : Number.POSITIVE_INFINITY;
  const useB = db <= da;
  const best = useB ? b! : a!;
  const age = useB ? db : da;
  if (age <= PIN_MAX_SNAP_MS) {
    return {
      pin: { lat: best.lat, lng: best.lng, acc: best.acc, ageMs: age },
      kind: "snap",
      fixIdx: [useB ? bi : ai],
    };
  }
  const coarseNear = track.some(
    (f) => !(f.acc <= PIN_MAX_ACCURACY_M) && Math.abs(f.tMs - tMs) <= PIN_MAX_SNAP_MS
  );
  return { pin: null, reason: coarseNear ? "coarse" : "gap", fixIdx: [] };
}

/**
 * هوية القراءة اللي الدبوس اتبنى منها.
 *
 * 🟢 **قرار ٣ أكتوبر** (نيّة المالك: شكوى ٢٧ سبتمبر كانت قراءة **قديمة**
 * بتتعاد على كذا لوحة): الممنوع هو **نفس القراءة** (نفس وقت القراءة)
 * تتحط على لوحتين جيران — مش نفس الإحداثيات. المندوب الواقف في برحة
 * أندرويد بيرجّعله نفس الإحداثيات في كل قراءة **طازة**، وكل لوحة قراءتها
 * وقت نطقها ⇒ النقطة الواحدة هنا حقيقة.
 *  · التقاط ⇒ القراءة نفسها (وقتها).
 *  · استنباط ⇒ موقع **بلحظة اللوحة نفسها** بين قراءتين — مش إعادة قراءة؛
 *    بيتكرّر بس لو لوحتين في نفس اللحظة بالظبط بين نفس القراءتين.
 */
function fixIdentity(track: TrackFix[], r: PinResolution, tMs: number): string | null {
  if (!r.pin) return null;
  const at = (i: number) => track[i]?.tMs;
  if (r.kind === "snap") return `snap@${at(r.fixIdx[0])}`;
  return `interp@${tMs}@${at(r.fixIdx[0])}-${at(r.fixIdx[1])}`;
}

/**
 * دبوس لكل لوحة (المخرج محاذي للمدخل) — وبعدها قاعدة «مميّز»:
 * لوحات ورا بعض (بالوقت) وقعت على **نفس القراءة** ⇒ الأقرب للقراءة بس
 * ياخدها، والباقي بلا موقع («same-fix»). قراءة واحدة لعربيتين = واحدة
 * منهم واخدة مكان قديم أكيد. (نفس الإحداثيات من قراءات طازة مختلفة مسموح.)
 */
export function resolvePlatePins(
  track: TrackFix[],
  timesMs: Array<number | undefined | null>
): PinResolution[] {
  const out = timesMs.map((t) => resolvePlatePin(track, t));
  const id = (i: number) => fixIdentity(track, out[i], timesMs[i] as number);
  const samePoint = (i: number, j: number) => {
    const a = id(i);
    return a !== null && a === id(j);
  };
  const order = timesMs
    .map((t, i) => ({ t, i }))
    .filter((x): x is { t: number; i: number } => finite(x.t))
    .sort((p, q) => p.t - q.t || p.i - q.i)
    .map((x) => x.i);

  let k = 0;
  while (k < order.length) {
    let end = k + 1;
    while (end < order.length && samePoint(order[end - 1], order[end])) end++;
    if (end - k > 1) {
      // الأقرب زمنياً للقراءة يكسب؛ التعادل للأسبق في الوقت
      let keep = order[k];
      for (let j = k + 1; j < end; j++) {
        if (out[order[j]].pin!.ageMs < out[keep].pin!.ageMs) keep = order[j];
      }
      for (let j = k; j < end; j++) {
        const i = order[j];
        if (i !== keep) out[i] = { pin: null, reason: "same-fix", fixIdx: [] };
      }
    }
    k = end;
  }
  return out;
}

/** سبب الغياب بالعربي — بيتكتب جنب العلامة */
export function pinMissLabel(reason: PinMiss | undefined): string {
  switch (reason) {
    case "no-time":
      return "اللوحة مالهاش لحظة نطق";
    case "no-fix":
      return "مافيش قراءة GPS وقت التسجيل";
    case "coarse":
      return `قراءة GPS وقتها أوسع من ${PIN_MAX_ACCURACY_M}م`;
    case "gap":
      return `مافيش قراءة GPS في حدود ${PIN_MAX_SNAP_MS / 1000}ث من لحظة نطقها`;
    case "same-fix":
      return "نفس قراءة GPS اللي اتحطّت على اللوحة اللي جنبها — ماتتعادش";
    default:
      return "";
  }
}

/**
 * الدبوس على صفوف الصفحة بعد التفريغ — من **مسار المقطع نفسه**.
 *
 * `review.timeStart` = لحظة النطق بالثواني من بداية الصوت (`t_s` من السيرفر).
 * اللوحة اللي مالهاش موقع دقيق بتاخد `pin = null` وعلامة «من غير موقع دقيق»
 * في `review.notes` (عمود «ملاحظات» في التصدير). العلامة القديمة بتتشال
 * الأول فإعادة التفريغ مابتكرّرهاش. مابيعدّلش المدخل.
 */
export function stampEntriesWithTrack(
  entries: PlateEntry[],
  track: TrackFix[],
  startEpoch: number
): PlateEntry[] {
  const times = entries.map((e) => {
    const t = e?.review?.timeStart;
    return finite(t) ? Math.round(t * 1000) : undefined;
  });
  const res = resolvePlatePins(track, times);
  return entries.map((e, i) => {
    const r = res[i];
    const notes = (e.review.notes || []).filter((n) => !String(n).startsWith(NO_PRECISE_PIN));
    let pin: GpsPin | null = null;
    if (r.pin) {
      const atRel = r.kind === "snap" ? track[r.fixIdx[0]].tMs : (times[i] as number);
      pin = {
        lat: r.pin.lat,
        lng: r.pin.lng,
        accuracy: r.pin.acc,
        at: startEpoch + atRel,
        ageMs: r.pin.ageMs,
        stale: false,
      };
    } else {
      notes.push(`${NO_PRECISE_PIN} — ${pinMissLabel(r.reason)}`);
    }
    return { ...e, pin, review: { ...e.review, notes } };
  });
}

/** كام لوحة خدت موقع دقيق — للعرض في صف المقطع */
export function countPinned(entries: PlateEntry[]): number {
  return entries.filter((e) => e.pin).length;
}

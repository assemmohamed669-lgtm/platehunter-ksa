/**
 * ══════════════════════════════════════════════════════════════════════
 *  🧈 «سلاسة» Voice PRO — دوال صغيرة الصفحة بتوصّلها **للسوبر أدمن الأول**
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٣ أكتوبر ٢٠٢٦): «أنا عايز سلاسة في كل حاجة في البرنامج». وقراراته:
 *   ① «خلي ده مايحصلش غير في حالة النت الضعيف أوي فقط…» — شريط النت الضعيف.
 *   ② «ماشي اعمل كده» — جلسة قديمة ماتوقّفش جلسة أحدث، ورسالة الوقوع للسوبر
 *      أدمن بتقول **السبب الحقيقي** من غير «أعِد الفحص».
 *   ③ رقم الهيكل في الخلفية — والصفحة ماتهنّجش، ومايبدأش وقت التسجيل.
 *   ④ «ماشي اعمل كده طالما مش هتأثر على حاجة» — مؤشّر الصوت مايعيدش رسم
 *      الصفحة كلها ٦٠ مرة في الثانية.
 *   ⑤ «لو عنده أكتر من ألف لوحة مش متصدّرة ويدوس تصدير مش عايزه يقفل ولا
 *      يهنّج معاه مهما كان عدد اللوحات».
 *
 * ⚠️ كله هنا **أدوات بس** — مابتغيّرش حاجة لوحدها. الصفحة هي اللي بتقرّر
 *    تستعملها للسوبر أدمن (`isSuper`)، والمناديب على القديم بالحرف لحد ما
 *    المالك يجرّب. مغطّاة في `__tests__/voiceProSmooth.test.ts`.
 */

import { REPLAY_MAX_AGE_SEC } from "./voicexReplay";

/* ─── ① 📶 شريط النت الضعيف ───────────────────────────────────────────── */

export const WEAK_NET_TEXT = "📶 النت ضعيف — كمّل كلامك، اللوحات هتظهر لما النت يرجع";
/**
 * الصوت الفايت بيعيش في ذاكرة الموبايل **٧٥ث بس** (`REPLAY_MAX_AGE_SEC` في
 * `lib/voicexReplay.ts` — الحلقة ٩٠ث ناقص هامش النافذة) = **دقيقة وربع** (مش
 * «دقيقة ونص» — دي كانت غلط). يعني طول ما الانقطاع أقل من ٧٥ث مفيش صوت ضاع،
 * ومفيش داعي نقلق المندوب. بعدها، اللي اتقال من بدري ممكن يكون طلع برّه
 * الذاكرة — فلازم يعرف يعيده بدل ما يفتكر إنه اتسجّل.
 * السطر ده **بيظهر بس طول ما الانقطاع أقدم من ٧٥ث** وبيختفي مع رجوع النت.
 */
export const WEAK_NET_LONG_TEXT = "اللوحات اللي اتقالت من أكتر من دقيقة وربع ممكن ماتظهرش — عيدها لما النت يرجع";
export const WEAK_NET_LONG_AFTER_MS = REPLAY_MAX_AGE_SEC * 1000;

/**
 * الشريط (أو `null` لو النت تمام). `weakSinceMs` = **بداية الانقطاع** (أول طلب
 * فشل بعد آخر رد ناجح — `createOutageClock`)، ولو مش معروفة لحظة ما المحرّك
 * قال «ضعيف».
 */
export function weakNetBanner(
  weakSinceMs: number | null,
  nowMs: number,
): { text: string; extra: string | null } | null {
  if (weakSinceMs == null) return null;
  const long = nowMs - weakSinceMs > WEAK_NET_LONG_AFTER_MS;
  return { text: WEAK_NET_TEXT, extra: long ? WEAK_NET_LONG_TEXT : null };
}

/**
 * 📶 **بداية الانقطاع الفعلية.** المحرّك بيقول «ضعيف» عند الفشل الـ٨ ورا بعض —
 * يعني ~٣٠ث **بعد** ما النت يقع فعلاً. الصوت الفايت بيعيش ٧٥ث من لحظة ما
 * اتقال، فلو السطر التاني اتحسب من «ضعيف» كان بيظهر متأخّر ~٣٠ث: اللوحات
 * بتضيع والشريط لسه بيقول «هتظهر». هنا البداية = **أول طلب فشل بعد آخر رد
 * ناجح** (`onSkip("request_failed:…")` / `replay_failed`)، وأي رد ناجح
 * (`onRead` — بيتنده مع كل رد) بيقفلها. مابترميش ومابتلمسش الشبكة.
 */
export interface OutageClock {
  /** طلب فشل — لو مفيش انقطاع مفتوح، ده بدايته. */
  fail(nowMs: number): void;
  /** رد ناجح — الانقطاع خلص. */
  ok(): void;
  /** بداية الانقطاع المفتوح، أو `null`. */
  since(): number | null;
}

export function createOutageClock(): OutageClock {
  let start: number | null = null;
  return {
    fail(nowMs) { if (start === null && Number.isFinite(nowMs)) start = nowMs; },
    ok() { start = null; },
    since() { return start; },
  };
}

/** تخطّي معناه «طلب اتبعت وفشل» (عادي أو إعادة) — مش بوابة سكوت ولا طابور. */
export function isRequestFailSkip(reason: string): boolean {
  return typeof reason === "string" && /^(?:request|replay)_failed(?::|$)/.test(reason);
}

/* ─── ② 🔒 رسالة الوقوع + حارس الجلسة ────────────────────────────────── */

const FATAL_MIC_TEXT = "الميكروفون مرفوض — اسمح للمتصفّح بالتسجيل وجرّب تاني.";
/**
 * 🔴 نص المناديب **زي ما هو بالحرف** لأي سبب غير الميك (زي القديم:
 * `reason === "mic_denied" ? … : ده`) لحد ما المالك يوافق — مثبّت باختبار.
 * (معروف إنه بيشاور على «أعِد الفحص» وده زرار ظاهر للسوبر أدمن بس — سايبينه
 * زي ما هو عن قصد: مفيش تغيير للمناديب من غير موافقة.)
 */
const FATAL_SERVER_TEXT = "السيرفر فصل وسط التسجيل. دوس «أعِد الفحص» واتأكد إنه واصل.";
/**
 * السوبر أدمن: **السبب الحقيقي** والخطوة اللي بتحلّه — مش «أعِد الفحص» لكل
 * حاجة (الفحص مابيرجّعش التسجيل، ولما الدخول مرفوض النت مش هو المشكلة).
 * المحرّك بـ`netResilience` بيبعت السبب والكود الخام (`onFatal(reason, code)`):
 *   · `net_lost`      — مافيش رد ٣ دقايق والنت ضعيف ⇒ النت فعلاً مقطوع
 *   · `server_down`   — **النت واصل، والعطل عند السيرفر** — والنص على حسب الكود:
 *                       · 429 / 5xx / 52x (أو أي كود تاني) ⇒ «مش بيرد (الكود)»
 *                       · 4xx (غير 429) ⇒ «رفض الطلب (الكود)» — السيرفر **رد**،
 *                         فـ«مش بيرد» كانت كدبة (مراجعة ٣ أكتوبر)
 *                       · `tunnel_error` ⇒ «مش واصل (النفق واقع)»: فحص `/health`
 *                         وصل والطلب لسه `network` (`checkReachable` في المحرّك)
 *   · `auth_rejected` — 401/403: السيرفر رفض الدخول
 *   · `bad_reply`     — رد مش مفهوم (`bad_json` / `bad_shape`)
 *   · `tunnel_down` أو أي سبب جديد ⇒ رسالة عامة **بالكود** — مانقولش «النت
 *     فصل» من غير ما نكون متأكّدين (بالعلم ده بيوصل لكود مش نت زي `http_500`).
 */
const FATAL_SUPER: Readonly<Record<string, string>> = {
  net_lost: "النت مقطوع من ٣ دقايق فوقف التسجيل — اللوحات اللي ظهرت محفوظة. اتأكد إن النت رجع ودوس «ابدأ التسجيل».",
  auth_rejected: "السيرفر رفض الدخول — كلّم الإدارة.",
  bad_reply: "رد السيرفر مش مفهوم — جرّب تاني.",
};

/**
 * 🚇 كود «النفق واقع» من المحرّك (`server_down` + `tunnel_error`) — نفس النص
 * اللي `lib/voicexEngine.ts` بيبعته (`TUNNEL_ERROR_CODE` هناك؛ متكرّر هنا عن قصد
 * عشان الملف ده مايستوردش المحرّك كله). الاتنين مثبّتين باختبار.
 */
const TUNNEL_ERROR_CODE = "tunnel_error";
const FATAL_TUNNEL_TEXT = "السيرفر مش واصل (النفق واقع) — مش مشكلة النت. استنى دقيقة وجرّب تاني، ولو فضلت كلّم الإدارة.";

/** كود السبب جوّه الرسالة — نص قصير بس (المدخل ممكن يبقى أي حاجة)، و"" لو فاضي. */
function shortCode(v: unknown): string {
  if (v == null) return "";
  const r = String(v).replace(/\s+/g, " ").trim();
  return r.slice(0, 40);
}

/**
 * نص الوقوع. `code` = الكود الخام من المحرّك (المعامل التاني في `onFatal`) —
 * **للسوبر أدمن بس**؛ المناديب نفس النص القديم بالحرف مهما كان السبب أو الكود.
 */
export function fatalText(reason: string, isSuper: boolean, code?: string): string {
  if (reason === "mic_denied") return FATAL_MIC_TEXT;
  if (!isSuper) return FATAL_SERVER_TEXT;
  const c = shortCode(code);
  if (reason === "server_down") {
    // 🚇 النفق واقع: `/health` وصل (نت الموبايل شغّال) والطلب لسه `network`
    if (c === TUNNEL_ERROR_CODE) return FATAL_TUNNEL_TEXT;
    // 🚫 4xx (غير 429 = زحمة): السيرفر **رد** ورفض الطلب — مش «مش بيرد»
    if (/^http_4\d\d$/.test(c) && c !== "http_429") {
      return "السيرفر رفض الطلب (" + c + ") — مش مشكلة النت. كلّم الإدارة وقولّهم الكود.";
    }
    return "السيرفر مش بيرد" + (c ? " (" + c + ")" : "")
      + " — مش مشكلة النت. استنى دقيقة وجرّب تاني، ولو فضلت كلّم الإدارة.";
  }
  if (typeof reason === "string" && Object.prototype.hasOwnProperty.call(FATAL_SUPER, reason)) {
    return FATAL_SUPER[reason];
  }
  return "التسجيل وقف بسبب عطل (الكود: " + (c || shortCode(reason) || "غير معروف")
    + ") — دوس «ابدأ التسجيل» تاني، ولو اتكرر كلّم الإدارة وقولّهم الكود.";
}

/**
 * 🔒 **رقم لكل جلسة تسجيل** — نداءات المحرّك (وقوع/الميك اتاخد/النت الضعيف)
 * بتشيل رقم جلستها، ولو مش الحالية بتتجاهل. من غيره: محرّك قديم لسه بيخلّص
 * آخر نوافذه بعد الإيقاف، وأول ما يفشل كان بينده `stop` — فيقفل **التسجيل
 * الجديد** اللي المندوب لسه دايس عليه.
 */
export interface SessionGate {
  /** جلسة جديدة — بترجّع رقمها، وأي رقم قبله بيبطل. */
  begin(): number;
  /** الجلسة الحالية خلصت (إيقاف) — مفيش رقم «حالي» لحد البداية الجاية. */
  end(): void;
  isCurrent(id: number): boolean;
}

export function createSessionGate(): SessionGate {
  let n = 0;
  let current = -1;
  return {
    begin() { n += 1; current = n; return n; },
    end() { current = -1; },
    isCurrent(id) { return id === current; },
  };
}

/**
 * 🔌 **نفق واقع ولا نت الموبايل؟** — `checkReachable` بتاع المحرّك (السوبر أدمن بس).
 *
 * مراجعة ٣ أكتوبر: نفق Cloudflare ميت أو سيرفر واقع بيرجّع صفحة ٥٣٠/٥٠٢ **من غير
 * CORS** ⇒ المتصفّح بيخفي الرد وطلب الصوت بيطلع `network` — بالظبط زي موبايل
 * أوفلاين. فكان بيبقى «📶 النت ضعيف» ٣ دقايق وبعدين «النت مقطوع» والنت شغّال.
 *
 * الفرق: طلب `no-cors` لـ`/health` (من غير توكن ولا ترويسات ⇒ مافيش preflight)
 * بيخلص بأي رد — حتى صفحة الـ٥٣٠ (رد opaque مانقدرش نقراه، وده مش مهم): وصوله
 * لوحده = نت الموبايل واصل لحد السيرفر. رمية (`Failed to fetch`) أو مهلة ٤ث =
 * نت الموبايل نفسه. بيترجم `true`/`false` بس، ومابيرميش أبداً.
 */
export const REACH_CHECK_TIMEOUT_MS = 4000;

export function reachabilityCheck(
  url: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): () => Promise<boolean> {
  const ms = opts.timeoutMs ?? REACH_CHECK_TIMEOUT_MS;
  return () => new Promise<boolean>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(v);
    };
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    timer = setTimeout(() => {
      try { ctl?.abort(); } catch { /* ignore */ }
      finish(false);
    }, ms);
    try {
      const init: RequestInit = { mode: "no-cors", cache: "no-store", ...(ctl ? { signal: ctl.signal } : {}) };
      // `fetch` نفسه مش متغيّر منه — نسخة مفكوكة من `window` بترمي «Illegal invocation» على بعض المتصفّحات
      const p = opts.fetchImpl ? opts.fetchImpl(url, init) : fetch(url, init);
      Promise.resolve(p).then(() => finish(true), () => finish(false));
    } catch {
      finish(false);
    }
  });
}

/* ─── ④ 🎚️ مؤشّر الصوت ───────────────────────────────────────────────── */

/**
 * خنق عام: قيمة واحدة كل `gapMs` على الأكتر، و`always` بيعدّي من غير ما
 * يستنى (زي الصفر في المؤشّر، أو آخر خطوة في التقدّم).
 */
export function createThrottle<T>(
  push: (v: T) => void,
  opts: { gapMs: number; always?: (v: T) => boolean; now?: () => number },
): (v: T) => void {
  const now = opts.now ?? Date.now;
  let lastAt = -Infinity;
  return (v: T) => {
    const t = now();
    if (!(opts.always?.(v)) && t - lastAt < opts.gapMs) return;
    lastAt = t;
    push(v);
  };
}

/**
 * **نفس خنق «صوتي» بالظبط** (`throttledPttLevel` في `instant-check/page.tsx`):
 * ٨٠ مللي = ~١٢ تحديث/ث — المؤشّر لسه بيتحرّك بسلاسة للعين. `onLevel` جاي من
 * `requestAnimationFrame` (٦٠–١٢٠ مرة/ث)، وكل مرة كانت بتعيد رسم الصفحة كلها.
 * ⚠️ الصفر بيعدّي دايماً: الإيقاف بيبعت `onLevel(0)`، ولو اتخنق المؤشّر
 *    بيتجمّد مضوّي بعد ما المندوب يقفل.
 */
export const LEVEL_GAP_MS = 80;
export function levelThrottle(push: (lvl: number) => void, now?: () => number): (lvl: number) => void {
  return createThrottle<number>(push, { gapMs: LEVEL_GAP_MS, always: (v) => v === 0, now });
}

/**
 * مخزن صغير لمستوى الصوت — المؤشّر بس اللي بيشترك فيه (`useSyncExternalStore`)،
 * فتحديث المؤشّر **مابيعيدش رسم الصفحة** (جدول ١٠٠٠ لوحة كان بيترسم مع كل تحديث).
 */
export interface LevelStore {
  get(): number;
  set(v: number): void;
  subscribe(fn: () => void): () => void;
}

export function createLevelStore(initial = 0): LevelStore {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(v) {
      if (v === value) return;
      value = v;
      for (const fn of [...subs]) { try { fn(); } catch { /* المؤشّر بس */ } }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
  };
}

/* ─── ⑤ 📤 نص تقدّم التصدير ──────────────────────────────────────────── */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** أرقام عربي (زي `toLocaleString("ar-EG")` من غير فواصل) — ثابتة على كل جهاز. */
export function toArabicDigits(n: number): string {
  return String(Math.trunc(n)).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
}

/** «بصدّر ٣٠٠ من ١٢٠٠…» — المندوب شايف إن التصدير ماشي مش واقف. */
export function exportProgressText(done: number, total: number): string {
  return "بصدّر " + toArabicDigits(done) + " من " + toArabicDigits(total) + "…";
}

/** تحديث نص التقدّم كل ربع ثانية بالكتير — كل تحديث بيعيد رسم جدول اللوحات. */
export const EXPORT_PROGRESS_GAP_MS = 250;

/* ─── ④ ⏰ وقت الصف ───────────────────────────────────────────────────── */

let rowTimeFmt: Intl.DateTimeFormat | null = null;

/**
 * **نفس نص** `new Date(ms).toLocaleTimeString("ar-EG", {…})` بالحرف — بس
 * بمنسّق واحد. `toLocaleTimeString` بلغة واختيارات بيبني منسّق جديد كل نداء،
 * والجدول بينده عليه لكل صف في كل رسمة (١٠٠٠ لوحة × كل تحديث).
 * الوقت البايظ بيرجّع «Invalid Date» زي القديم (المنسّق كان هيرمي ويوقع الصفحة).
 */
export function formatRowTime(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "Invalid Date";
  if (!rowTimeFmt) {
    rowTimeFmt = new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return rowTimeFmt.format(d);
}

/* ─── ③ 🔧 الهيكل: أحدث طلب بس، ومابيقراش الملف وقت التسجيل ─────────── */

/**
 * 🔧 **أحدث تحميل بس هو اللي يتطبّق، ومافيش قراية للملف وقت التسجيل.**
 *
 *  · `begin()` مع كل تحميل للشيت ⇒ تذكرة؛ أي تحميل أقدم (شغّال أو مستني)
 *    بيبطل — فملف قديم خلص متأخّر مايكتبش فوق خريطة ملف أحدث (السباق ده
 *    كان موجود في الكود القديم). `isLatest(ticket)` لنفس السؤال من برّه.
 *  · `request()` وقت التسجيل (`busy`) ⇒ **قراية الملف بس هي اللي بتستنى**:
 *    `quick` (الكاش في الذاكرة ثم على الجهاز، أو الورقات المحمّلة لوحدها)
 *    بيشتغل على طول عشان الهيكل يظهر تحت المطلوبة وهو بيسجّل. نتيجته
 *    `final` ⇒ خلاص مفيش حاجة تستنى؛ مش `final` (جزئية) ⇒ بتظهر لحد ما
 *    الكاملة تيجي بعد الإيقاف (`flush()`). قراية الملف (حتى في الـworker)
 *    بترجّع نتيجتها على الخيط الرئيسي مرة واحدة — وقفة صغيرة، بس وقت
 *    التسجيل ممكن تأخّر لوحة.
 *  · `release(ticket)` ⇒ التحميل ده خلص **من غير** طلب هيكل (الطريق القديم /
 *    مافيش ملف) ⇒ مفيش حاجة التصدير يستناها.
 *  · `ensure()` (التصدير) ⇒ **لازم** يلاقي الخريطة: بيستنى الشيت لو لسه بيتقري،
 *    وبيشغّل التحميل المستني **حتى لو بيسجّل** (القراية في الـworker مابتجمّدش
 *    الشاشة)، وبيرجّع نتيجة أحدث تحميل — أو `null` لو مافيش تحميل هيكل خالص.
 *    `idle` = مفيش حاجة يستناها (عشان نص «بجهّز أرقام الهيكل…» مايظهرش على الفاضي).
 *
 * مابترميش: فشل التحميل ⇒ مافيش تطبيق، والصفحة بتفضل على الخريطة اللي معاها.
 */
export interface LatestJobs<J, R> {
  begin(): number;
  release(ticket: number): void;
  isLatest(ticket: number): boolean;
  request(ticket: number, job: J): "ran" | "deferred" | "stale";
  flush(): boolean;
  ensure(): Promise<R | null>;
  /** مفيش شيت بيتقري ولا تحميل مستني أو شغّال للتذكرة الحالية. */
  readonly idle: boolean;
  readonly hasPending: boolean;
}

/** نتيجة `quick`: `final` = دي الخريطة الكاملة (من الكاش)، غير كده جزئية لحد الإيقاف. */
export interface QuickResult<R> {
  value: R;
  final: boolean;
}

export function createLatestJobs<J, R>(opts: {
  busy: () => boolean;
  run: (job: J) => Promise<R>;
  /** مسموح وقت التسجيل — مابيقراش الملف. `null` ⇒ مفيش حاجة تتعرض لحد الإيقاف. */
  quick?: (job: J) => Promise<QuickResult<R> | null>;
  apply: (result: R) => void;
}): LatestJobs<J, R> {
  let gen = 0;
  /** `begin()` حصل والشيت لسه بيتقري (لا طلب ولا release). */
  let preparing = false;
  let pending: { t: number; job: J } | null = null;
  let current: { t: number; p: Promise<R | null>; done: boolean; value: R | null } | null = null;
  const waiters = new Set<() => void>();
  const changed = () => {
    const ws = [...waiters];
    waiters.clear();
    for (const w of ws) w();
  };
  const nextChange = () => new Promise<void>((r) => { waiters.add(r); });
  const safeApply = (r: R) => { try { opts.apply(r); } catch { /* العرض بس */ } };
  /** الكاملة للتذكرة دي خلصت؟ (الجزئية بعدها ماتكتبش فوقها) */
  const fullDone = (t: number) => !!current && current.t === t && current.done;

  const launch = (t: number, job: J) => {
    let p: Promise<R>;
    try { p = opts.run(job); } catch (e) { p = Promise.reject(e); }
    const c: { t: number; p: Promise<R | null>; done: boolean; value: R | null } = { t, p: Promise.resolve(null), done: false, value: null };
    c.p = p.then(
      (r) => {
        c.done = true;
        if (t !== gen) { changed(); return null; }   // تحميل أحدث بدأ — النتيجة دي قديمة
        c.value = r;
        safeApply(r);
        changed();
        return r;
      },
      () => { c.done = true; changed(); return null; },
    );
    current = c;
    changed();
  };

  const runQuick = (t: number, job: J) => {
    if (!opts.quick) return;
    let q: Promise<QuickResult<R> | null>;
    try { q = opts.quick(job); } catch { return; }
    Promise.resolve(q).then(
      (res) => {
        if (!res || t !== gen || fullDone(t)) return;
        if (res.final && pending && pending.t === t) {
          // من الكاش ⇒ دي الكاملة: مفيش قراية ملف تستنى الإيقاف
          pending = null;
          current = { t, p: Promise.resolve(res.value), done: true, value: res.value };
          changed();
        }
        safeApply(res.value);
      },
      () => { /* الكاش مش متاح — الكاملة بعد الإيقاف */ },
    );
  };

  return {
    begin() {
      gen += 1;
      preparing = true;
      pending = null;
      current = null;
      changed();
      return gen;
    },
    release(t) {
      if (t !== gen || !preparing) return;
      preparing = false;
      changed();
    },
    isLatest(t) {
      return t === gen;
    },
    request(t, job) {
      if (t !== gen) return "stale";
      preparing = false;
      if (!opts.busy()) {
        launch(t, job);
        return "ran";
      }
      pending = { t, job };
      changed();
      runQuick(t, job);
      return "deferred";
    },
    flush() {
      if (!pending || opts.busy()) return false;
      const p = pending;
      pending = null;
      if (p.t !== gen) return false;
      launch(p.t, p.job);
      return true;
    },
    async ensure() {
      for (;;) {
        const g = gen;
        // التصدير محتاج الخريطة **دلوقتي** ⇒ المستني بيشتغل حتى وقت التسجيل
        if (pending && pending.t === g) {
          const p = pending;
          pending = null;
          launch(p.t, p.job);
        }
        const c = current;
        if (c && c.t === g) {
          if (c.done) return c.value;
          const r = await c.p;
          if (g === gen) return r;
          continue;   // تحميل أحدث بدأ وإحنا مستنيين ⇒ نستنى هو
        }
        if (preparing) {
          await nextChange();
          continue;
        }
        return null;  // مافيش تحميل هيكل (الطريق القديم / مافيش ملف)
      }
    },
    get idle() {
      return !preparing && !(pending && pending.t === gen) && !(current && current.t === gen && !current.done);
    },
    get hasPending() { return pending !== null; },
  };
}

/* ─── ⑤ 🔧 الهيكل في التصدير ────────────────────────────────────────── */

/**
 * أقصى انتظار لخريطة الهيكل وقت التصدير (السوبر أدمن). **سخي عن قصد**: القديم
 * كان بيجمّد الصفحة لحد ما الخريطة تخلص، فالتصدير عمره ما طلع من غير هيكل —
 * دلوقتي التصدير بيستناها والزرار بيقول «بجهّز أرقام الهيكل…». الحد بس عشان
 * عطل مايوقّفش التصدير للأبد — ولو حصل بيتقال في رسالة النتيجة.
 */
export const CHASSIS_EXPORT_WAIT_MS = 90_000;
export const CHASSIS_WAIT_TEXT = "بجهّز أرقام الهيكل…";
/** سطر في رسالة «تم التصدير» لو الخريطة ماجهزتش في الوقت. */
export const CHASSIS_MISSING_NOTE = "\n⚠️ أرقام الهيكل ماخلصتش تتجهّز في الوقت — اتصدّرت باللي كان جاهز، فممكن لوحة مطلوبة تكون من غير رقم هيكل.";

/* ─── ⑤ 🫁 تجهيز صفوف التصدير على دفعات ─────────────────────────────── */

/**
 * نفس `items.map(fn)` بالظبط وبنفس الترتيب — بس بيسيب الصفحة تتنفّس
 * (`setTimeout 0`) بين كل دفعة والتانية، فتجهيز ٥٠٠٠ لوحة مايجمّدش الشاشة.
 */
export async function mapInChunks<T, R>(items: readonly T[], fn: (t: T) => R, chunkSize = 200): Promise<R[]> {
  const size = Number.isFinite(chunkSize) && chunkSize >= 1 ? Math.floor(chunkSize) : 200;
  const out: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % size === 0) await new Promise<void>((r) => setTimeout(r, 0));
    out[i] = fn(items[i]);
  }
  return out;
}

/** القيمة لو جت خلال `ms`، وإلا `null` (والفشل `null` كمان) — مابيرميش. */
export function withinMs<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

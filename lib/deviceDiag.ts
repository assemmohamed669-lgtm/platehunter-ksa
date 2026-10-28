/**
 * 🩺 «صندوق أسود» على موبايل مندوب واحد (١٨ أكتوبر ٢٠٢٦).
 *
 * بلاغ المالك: مندوب آيفون بيفتح Voice PRO ويشتغل شوية وبعدين البرنامج يرجع لوحده على «التشييك ←
 * يدوي» — اتكرر كذا مرة، ومن غير السطر الأحمر بتاع حارس اللفّة. الكود مافيهوش أي تحويل لوحده، فالأرجح
 * iOS بيقفل البرنامج ويفتحه من الأول. المالك: «ممكن علي المندوب دة بالظبط نعمل حاجه تراقب التليفون عنده
 * … ونعرف بالظبط السبب» و«عايزه يبقي للمندوب دة فقط لان باقي الناس شغالين تمام».
 *
 * بيسجّل (على الجهاز أول بأول — لو البرنامج وقع ماتضيعش — ويرفع كل دقيقة لـ`voice_telemetry`،
 * `server = "diag"`، بيتمسح بعد ٧ أيام مع باقي الجدول):
 *  · كل فتحة للصفحة من الأول: على أنهي صفحة، نوعها (فتح/إعادة تحميل/رجوع)، والفتحة اللي قبلها انتهت
 *    إزاي — `classifyPreviousEnd`: اتقفل وهو **قدامه** (وقعة) · وهو في الخلفية · إعادة تحميل عادية.
 *  · كل انتقال بين الصفحات + آخر زرار اتداس قبله (هو اللي داس ولا البرنامج نقله؟).
 *  · الخلفية/الرجوع، وأي غلط في البرنامج، ونسخة iOS وحجم الشاشة.
 * مابيسجّلش صوت ولا لوحات ولا موقع — الأرقام في أسامي الزراير بتتشال (`safeLabel`).
 *
 * 🔒 شغّال على الحسابات اللي في `DIAG_AGENT_IDS` بس — أي حد تاني مابيتسجّلّوش ولا سطر.
 */

/**
 * الحسابات اللي الصندوق شغّال عليها (`profiles.id`) — فاضية = مقفول على الكل.
 * ١٨ أكتوبر ٢٠٢٦: مندوب الآيفون اللي Voice PRO بيرجّعه لـ«يدوي» (طلب المالك — هو بس).
 * شيل الرقم أول ما السبب يبان.
 */
export const DIAG_AGENT_IDS: string[] = [
  "fbe0486e-e979-4427-ba0e-c33572f1d7be",
  // ١٩ أكتوبر ٢٠٢٦: آيفون ١٦ برو ماكس — «موقع واحد على كل اللوحات» (سطر موقع لكل لوحة — `lib/gpsDiag.ts`)
  "56627d4f-1e8c-4f74-bf1e-8e75077d5143",
  // ١٩ أكتوبر ٢٠٢٦: «الحي اتكتب على السيرفر ومانزلش على الموبايل» (سطر مزامنة السجلات — `lib/recordsSyncDiag.ts`)
  "7b4bc404-50e7-46ad-935f-aa65e293d6b8",
  // ٢٣ أكتوبر ٢٠٢٦: آيفون — «صفحة المطلوب كانت بتقفل البرنامج» وهو بيفرز (خطوات الفرز — wanted-sort / cert-sort)
  "3f220bb5-aa99-44b2-a384-72c3279d5478",
  // ٢٤ أكتوبر ٢٠٢٦: آيفون (العبيدي) — «الشاشة بتنام وهو بيسجّل» و«المطلوبة ساعات مابتصفّرش» (wake / rv2-wanted / siren)
  "db903add-ebc1-4b1e-96e8-8cacd87dc13b",
  // ٢٥ أكتوبر ٢٠٢٦: أندرويد (احمد سلام) — «المايك بيقفل بعد ٣ ثواني» في Voice PRO من غير بلوتوث ولا مكالمة (`rv2-mic` — `lib/micDiag.ts`)
  "050c0795-c21d-4ce5-8ee7-b2d2deb4d644",
  // ٢٨ أكتوبر ٢٠٢٦: أندرويد (رامي عابد) — «بيقول لوحات يظهر لوحات ولوحات لا» وصوته واضح والنت كويس (الصندوق الكامل + مراقبة Voice PRO)
  "1a4cafa0-34d6-40c9-bc70-d9954d83c403",
];

export const DIAG_MAX_EVENTS = 600;

/**
 * 🩺 **الصندوق الخفيف للكل** — المالك (٢٤ أكتوبر ٢٠٢٦): «شغل الصندوق الاسود علي كل المناديب» ⇒ بعد شرح الأثر: «يلا اعمله».
 * القياس على الـ٤ حسابات اللي عليها الكامل: **٨٥٪ من حجمه سطور الموقع** (`gps-plate` ٧٣٪ · `gps-watch` ١١٪) اتعملت لشكوى
 * «موقع واحد على كل اللوحات» بس. الخفيف:
 *  · نفس البداية (الفتحة جات بعد وقعة؟) والتنقّل والخلفية والأغلاط والتهنيج والنت — وملاحظات الصفحات **المهمة بس**
 *    (`lightKeepsNote`): التسجيل بدأ/وقف، المطلوبة اتأكدت والصفّارة رنّت، الشاشة نامت، التصدير.
 *  · بيترفع بعلامة `diag-lite` والكرون بيمسحه بعد يومين (نفس «سجل المشاكل»).
 *  · حد في اليوم لكل موبايل (سطور ورفعات) ورفع كل ٣ دقايق — موبايل بيكتب كتير مايملاش القاعدة.
 * ~٢٠ مرة أصغر من الكامل. الحساب اللي في `DIAG_AGENT_IDS` بياخد الكامل زي ما هو.
 * 🟢 للكل — المالك (٢٥ أكتوبر ٢٠٢٦): «يلا اعمل الاتنين». الحجم المقيس عند السوبر أدمن: ٤٨ رفعة و١٨ كيلو في ~٢٠ ساعة.
 */
export const DIAG_LIGHT_FOR_ALL = true;
export const DIAG_LIGHT_SERVER = "diag-lite";
/** أقصى سطور في اليوم لكل موبايل (كل سطر ~١٥٠ بايت) */
export const LIGHT_MAX_EVENTS_PER_DAY = 400;
/** أقصى رفعات في اليوم لكل موبايل */
export const LIGHT_MAX_UPLOADS_PER_DAY = 30;
const LIGHT_FLUSH_MS = 180_000;
const LIGHT_BUDGET_KEY = "ph:diag:lite:budget";
const LIGHT_NOTES = new Set([
  "rv2-rec", "rv2-wanted", "rv2-alert", "rv2-export", "rv2-mic",
  "siren", "siren-2s", "siren-stop",
  "wake", "wake-lost",
]);

export function diagLightFor(isSuper: boolean): boolean {
  return isSuper === true || DIAG_LIGHT_FOR_ALL;
}

/** ملاحظة الصفحة دي تتكتب في الخفيف؟ (سطور الموقع وخطوات المزامنة/الفرز لأ) */
export function lightKeepsNote(k: string): boolean {
  return LIGHT_NOTES.has(k);
}

export interface LightBudget { day: string; events: number; uploads: number }

/** عدّاد النهارده (يوم جديد ⇒ من الصفر) */
export function lightBudget(prev: LightBudget | null, day: string): LightBudget {
  return prev && prev.day === day ? { ...prev } : { day, events: 0, uploads: 0 };
}

function riyadhDay(t: number): string {
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}
const STATE_KEY = "ph:diag:state";
const BUF_KEY = "ph:diag:buf";
const BEAT_MS = 5_000;
const FLUSH_MS = 60_000;
/** آخر نبضة أقدم من كده ⇒ الفتحة دي «عادية بعد فترة» مش بعد وقعة */
const RECENT_MS = 10 * 60_000;

export interface DiagEvent {
  t: number;
  k: string;
  [key: string]: unknown;
}

export interface DiagState {
  sid: string;
  path: string;
  /** آخر نبضة (البرنامج كان عايش) */
  beat: number;
  vis: "visible" | "hidden" | string;
  /** الصفحة اتقفلت بنفسها (`pagehide` — إعادة تحميل/تنقّل كامل) مش وقعت */
  reload?: boolean;
}

export type PrevEnd = "first" | "killed-visible" | "killed-hidden" | "reload" | "stale";

export function diagEnabledFor(uid: string | null | undefined, ids: string[] = DIAG_AGENT_IDS): boolean {
  return !!uid && ids.includes(uid);
}

/** الفتحة دي جات بعد إيه؟ */
export function classifyPreviousEnd(prev: DiagState | null, now: number): PrevEnd {
  if (!prev) return "first";
  if (prev.reload) return "reload";
  if (!(now - prev.beat < RECENT_MS)) return "stale";
  return prev.vis === "hidden" ? "killed-hidden" : "killed-visible";
}

/** اسم الزرار من غير أرقام (مافيش لوحات في السجل) ومحدود */
export function safeLabel(s: string): string {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[0-9٠-٩]+/g, "#")
    .slice(0, 40);
}

export function appendEvent(buf: DiagEvent[], ev: DiagEvent, max = DIAG_MAX_EVENTS): DiagEvent[] {
  const next = buf.concat(ev);
  return next.length > max ? next.slice(next.length - max) : next;
}

/** دفعات تحت ٦٠ كيلو (الجدول بيرفض الصف فوق ٦٤ كيلو) */
export function chunkForUpload(events: DiagEvent[], maxChars = 55_000): DiagEvent[][] {
  const out: DiagEvent[][] = [];
  let cur: DiagEvent[] = [];
  let size = 2;
  for (const e of events) {
    const n = JSON.stringify(e).length + 1;
    if (cur.length && size + n > maxChars) {
      out.push(cur);
      cur = [];
      size = 2;
    }
    cur.push(e);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * موديل الآيفون **التقريبي** من مقاس الشاشة (نقط CSS + الكثافة). iOS مابيدّيش اسم الموديل لصفحة الويب،
 * والاسم المضبوط محتاج بلجن أصلي (نسخة جديدة من المتجر). «تكبير العرض» في الإعدادات بيغيّر المقاس.
 */
const IPHONE_SCREENS: Array<[number, number, number, string]> = [
  [320, 568, 2, "iPhone SE (الأول) / 5s"],
  [375, 667, 2, "iPhone 6/6s/7/8 أو SE (التاني/التالت)"],
  [414, 736, 3, "iPhone 6+/7+/8+ Plus"],
  [375, 812, 3, "iPhone X/XS/11 Pro أو 12 mini/13 mini"],
  [360, 780, 3, "iPhone 12 mini/13 mini"],
  [414, 896, 2, "iPhone XR / 11"],
  [414, 896, 3, "iPhone XS Max / 11 Pro Max"],
  [390, 844, 3, "iPhone 12/12 Pro/13/13 Pro/14"],
  [428, 926, 3, "iPhone 12 Pro Max/13 Pro Max/14 Plus"],
  [393, 852, 3, "iPhone 14 Pro/15/15 Pro/16"],
  [430, 932, 3, "iPhone 14 Pro Max/15 Plus/15 Pro Max/16 Plus"],
  [402, 874, 3, "iPhone 16 Pro/17/17 Pro"],
  [440, 956, 3, "iPhone 16 Pro Max/17 Pro Max"],
  [420, 912, 3, "iPhone Air"],
];
export function guessIphoneModel(w: number, h: number, dpr: number): string | null {
  const a = Math.min(w, h);
  const b = Math.max(w, h);
  const d = Math.round(dpr);
  const hit = IPHONE_SCREENS.find(([x, y, z]) => x === a && y === b && z === d);
  return hit ? hit[3] : null;
}

/** المؤقّت بتاع الثانية اتأخّر أكتر من ٣ث ⇒ الصفحة كانت معلّقة المدة دي */
export function freezeGap(prevTick: number, now: number, everyMs = 1000, thresholdMs = 3000): number | null {
  const late = now - prevTick - everyMs;
  return late > thresholdMs - everyMs ? now - prevTick - everyMs : null;
}

/** رسالة غلط من غير لوحات (أرقام ٤+ بتتشال — كود الرد ٣ أرقام بيفضل) ومحدودة */
export function safeMsg(s: unknown): string {
  return String(s ?? "")
    .replace(/[0-9٠-٩]{4,}/g, (m) => "#".repeat(m.length))
    .slice(0, 200);
}

/** الرابط من غير الاستعلام (مافيش توكن ولا بيانات) */
export function netUrl(u: string): string {
  try {
    if (/^https?:\/\//i.test(u)) {
      const x = new URL(u);
      return x.host + x.pathname;
    }
  } catch {
    /* مش رابط كامل */
  }
  return String(u).split(/[?#]/)[0].slice(0, 120);
}

/* ------------------------------------------------------------- التشغيل */

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* تخزين مقفول/مليان */
  }
}

let started = false;
/** الكامل (القايمة) ولا الخفيف */
let mode: "full" | "light" | null = null;
let uidRef = "";
let sidRef = "";
let lastPath = "";
let lastTap: { label: string; t: number } | null = null;

function push(ev: Omit<DiagEvent, "t"> & { t?: number }) {
  if (!started) return;
  if (mode === "light") {
    const b = lightBudget(readJson<LightBudget>(LIGHT_BUDGET_KEY), riyadhDay(Date.now()));
    if (b.events >= LIGHT_MAX_EVENTS_PER_DAY) return;
    b.events += 1;
    writeJson(LIGHT_BUDGET_KEY, b);
  }
  const buf = readJson<DiagEvent[]>(BUF_KEY) ?? [];
  writeJson(BUF_KEY, appendEvent(buf, { t: Date.now(), ...ev } as DiagEvent));
}

function saveState(patch: Partial<DiagState>) {
  const cur = readJson<DiagState>(STATE_KEY);
  writeJson(STATE_KEY, {
    sid: sidRef,
    path: location.pathname,
    beat: Date.now(),
    vis: document.visibilityState,
    ...(cur && cur.sid === sidRef ? cur : {}),
    ...patch,
  });
}

let flushing = false;
async function flush() {
  if (flushing || !uidRef) return;
  const buf = readJson<DiagEvent[]>(BUF_KEY) ?? [];
  if (!buf.length) return;
  flushing = true;
  try {
    const [{ supabase }, { BUILD_ID }, { getDevicePlatform }] = await Promise.all([
      import("@/lib/supabaseClient"),
      import("@/lib/appVersion"),
      import("@/lib/devicePlatform"),
    ]);
    let sent = 0;
    const light = mode === "light";
    for (const chunk of chunkForUpload(buf)) {
      // 🩺 الخفيف: حد الرفعات في اليوم — الباقي بيستنى على الموبايل (حد ٦٠٠ سطر)
      const b = light ? lightBudget(readJson<LightBudget>(LIGHT_BUDGET_KEY), riyadhDay(Date.now())) : null;
      if (b && b.uploads >= LIGHT_MAX_UPLOADS_PER_DAY) break;
      const { error } = await supabase.from("voice_telemetry").insert({
        agent_id: uidRef,
        session_id: "diag-" + sidRef,
        started_at: new Date(chunk[0].t).toISOString(),
        ended_at: new Date(chunk[chunk.length - 1].t).toISOString(),
        platform: getDevicePlatform(),
        build: BUILD_ID,
        server: light ? DIAG_LIGHT_SERVER : "diag",
        counts: { n: chunk.length },
        latency: {},
        events: chunk,
      });
      if (error) break;
      if (b) { b.uploads += 1; writeJson(LIGHT_BUDGET_KEY, b); }
      sent += chunk.length;
    }
    if (sent) {
      // اللي اترفع بس — اللي وصل وإحنا بنرفع يفضل للمرة الجاية
      const now = readJson<DiagEvent[]>(BUF_KEY) ?? [];
      writeJson(BUF_KEY, now.slice(sent));
    }
  } catch {
    /* من غير نت — المرة الجاية */
  } finally {
    flushing = false;
  }
}

/**
 * حدث من صفحة (Voice PRO: التسجيل · حجم ملف التشييك · حالة السيرفر …). مابيعملش حاجة لو الصندوق مقفول
 * (أي مندوب مش في القايمة) — ومابيرميش أبداً.
 */
export function diagNote(k: string, data: Record<string, unknown> = {}) {
  if (!started) return;
  if (mode === "light" && !lightKeepsNote(k)) return;
  try {
    push({ k, path: location.pathname, ...data });
  } catch {
    /* التشخيص عمره ما يوقّع البرنامج */
  }
}

/** الصندوق شغّال على الموبايل ده؟ (عشان الصفحة ماتحسبش حاجة على الفاضي لباقي المناديب) */
export function diagActive(): boolean {
  return started;
}

/** الانتقال بين الصفحات — بتتنده من الـlayout مع كل تغيير مسار */
export function diagNav(path: string) {
  if (!started || !path || path === lastPath) return;
  const tap = lastTap && Date.now() - lastTap.t < 3_000 ? lastTap.label : null;
  push({ k: "nav", from: lastPath || null, to: path, tap });
  lastPath = path;
  saveState({ path });
}

/**
 * يشغّل الصندوق للحساب ده لو في القايمة (مرة واحدة لكل تحميل صفحة). بيرجّع دالة إيقاف.
 */
export function startDeviceDiag(uid: string | null | undefined): () => void {
  if (!diagEnabledFor(uid)) return () => {};
  return startDiag(uid as string, "full");
}

/**
 * 🩺 الصندوق **الخفيف** (`DIAG_LIGHT_FOR_ALL` — السوبر أدمن الأول). بيتنده بعد البروفايل؛ لو الكامل شغّال (الحساب في
 * القايمة) ولا حاجة.
 */
export function startDeviceDiagLight(uid: string | null | undefined, opts: { isSuper: boolean }): () => void {
  if (!uid || !diagLightFor(opts.isSuper)) return () => {};
  return startDiag(uid, "light");
}

function startDiag(uid: string, m: "full" | "light"): () => void {
  if (started || typeof window === "undefined") return () => {};
  started = true;
  mode = m;
  uidRef = uid as string;
  sidRef = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = Date.now();
  const prev = readJson<DiagState>(STATE_KEY);
  let nav = "unknown";
  try {
    nav = String((performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined)?.type ?? "unknown");
  } catch {
    /* قديم */
  }
  const ua = navigator.userAgent || "";
  const ios = /OS (\d+[_\d]*) like Mac OS X/.exec(ua)?.[1]?.replace(/_/g, ".") ?? null;
  lastPath = location.pathname;
  const raw = (k: string) => {
    try {
      return (localStorage.getItem(k) ?? "").slice(0, 120) || null;
    } catch {
      return null;
    }
  };
  push({
    k: "start",
    path: lastPath,
    nav,
    prevEnd: classifyPreviousEnd(prev, now),
    prevPath: prev?.path ?? null,
    prevBeatAgoS: prev ? Math.round((now - prev.beat) / 1000) : null,
    ios,
    ua: ios ? undefined : ua.slice(0, 120),
    scr: `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`,
    model: guessIphoneModel(screen.width, screen.height, window.devicePixelRatio || 1),
    mem: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null,
    online: navigator.onLine,
    // البرنامج كان فاكر إيه: آخر صفحة · حارس اللفّة · تبويب التشييك
    lastPage: raw("ph:lastPage"),
    bootGuard: raw("ph:bootGuard"),
    checkMode: raw("ph:check:mode"),
  });
  // نسخة التطبيق نفسه (من المتجر) + مساحة التخزين — مابيعطّلوش حاجة لو فشلوا
  void import("@capacitor/app")
    .then(({ App }) => App.getInfo())
    .then((i) => push({ k: "appinfo", version: i.version, build: i.build }))
    .catch(() => {});
  void (navigator.storage?.estimate?.() ?? Promise.reject())
    .then((e) => push({ k: "storage", usedMB: Math.round((e.usage ?? 0) / 1e6), quotaMB: Math.round((e.quota ?? 0) / 1e6) }))
    .catch(() => {});
  writeJson(STATE_KEY, { sid: sidRef, path: lastPath, beat: now, vis: document.visibilityState });

  const beat = setInterval(() => saveState({ beat: Date.now(), path: location.pathname, vis: document.visibilityState }), BEAT_MS);
  const tick = setInterval(() => void flush(), m === "light" ? LIGHT_FLUSH_MS : FLUSH_MS);
  const onVis = () => {
    push({ k: "vis", s: document.visibilityState, path: location.pathname });
    // رجع قدامه من غير إعادة تحميل (الصفحة اتحفظت في الذاكرة) ⇒ علامة «إعادة تحميل» تتشال
    saveState({ vis: document.visibilityState, beat: Date.now(), ...(document.visibilityState === "visible" ? { reload: false } : {}) });
    if (document.visibilityState === "hidden") void flush();
  };
  const onHide = (e: PageTransitionEvent) => {
    push({ k: "pagehide", persisted: !!e.persisted, path: location.pathname });
    saveState({ reload: true, vis: "hidden", beat: Date.now() });
  };
  // 🔎 أول سطرين من مكان الغلط (`stk`) — غلط من غير ملف («EmptyRanges» على آيفون ٢٤ أكتوبر) نعرف جاي منين
  const onErr = (e: ErrorEvent) =>
    push({
      k: "err", msg: String(e.message ?? "").slice(0, 200), src: String(e.filename ?? "").split("/").pop()?.slice(0, 60),
      line: e.lineno, col: e.colno,
      stk: safeMsg(String((e.error as { stack?: unknown } | null)?.stack ?? "").split("\n").slice(0, 2).join(" | ")) || undefined,
    });
  const onRej = (e: PromiseRejectionEvent) =>
    push({ k: "rej", msg: String((e.reason as { message?: string })?.message ?? e.reason ?? "").slice(0, 200) });
  const onTap = (e: Event) => {
    const el = (e.target as HTMLElement | null)?.closest?.("button, a, [role=button], input, select") as HTMLElement | null;
    if (!el) return;
    const label = safeLabel(el.getAttribute("aria-label") || el.textContent || el.tagName);
    lastTap = { label, t: Date.now() };
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onHide);
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);
  document.addEventListener("click", onTap, true);

  // 🧊 التهنيج: مؤقّت كل ثانية — لو اتأخّر أكتر من ٣ث والصفحة قدامه ⇒ كانت معلّقة المدة دي
  let lastTick = Date.now();
  // آخر مرة راح الخلفية — المؤقّت بيقف هناك، فالفجوة دي مش تهنيج (كانت بتطلع «علّق ٥٦٠ث» غلط)
  let hiddenAt = 0;
  const freeze = setInterval(() => {
    const n = Date.now();
    const g = freezeGap(lastTick, n);
    if (g && document.visibilityState === "visible" && !(hiddenAt >= lastTick)) push({ k: "freeze", ms: g, path: location.pathname });
    lastTick = n;
  }, 1000);
  const resetTick = () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    lastTick = Date.now();
  };
  document.addEventListener("visibilitychange", resetTick);

  // 📶 النت فصل/رجع
  const onOnline = () => push({ k: "net-on" });
  const onOffline = () => push({ k: "net-off" });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted) push({ k: "pageshow", persisted: true, path: location.pathname });
  };
  window.addEventListener("pageshow", onShow);

  // 📝 رسايل الغلط اللي البرنامج نفسه بيكتبها (التخزين/السيرفر/الصوت…) — من غير أرقام لوحات، وبحد
  let consoleLeft = m === "light" ? 20 : 80;
  const origError = console.error;
  const origWarn = console.warn;
  const wrapConsole = (level: "error" | "warn", orig: (...a: unknown[]) => void) =>
    function (this: unknown, ...a: unknown[]) {
      try {
        if (consoleLeft > 0) {
          consoleLeft--;
          push({ k: level === "error" ? "cerr" : "cwarn", msg: safeMsg(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : "")).join(" ")) });
        }
      } catch {
        /* التشخيص عمره ما يوقّع البرنامج */
      }
      return orig.apply(this, a);
    };
  console.error = wrapConsole("error", origError);
  console.warn = wrapConsole("warn", origWarn);

  // 🌐 الطلبات اللي فشلت أو ردّت بغلط سيرفر أو خدت أكتر من ٨ث — الرابط من غير استعلام (مافيش توكن)
  let netLeft = m === "light" ? 30 : 150;
  const origFetch = window.fetch;
  const wrappedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const mine = /\/rest\/v1\/voice_telemetry/.test(url);
    const t0 = Date.now();
    try {
      const res = await origFetch(input, init);
      const ms = Date.now() - t0;
      if (!mine && netLeft > 0 && (res.status >= 500 || ms > 8000)) {
        netLeft--;
        push({ k: "net", u: netUrl(url), st: res.status, ms });
      }
      return res;
    } catch (err) {
      if (!mine && netLeft > 0 && (err as { name?: string })?.name !== "AbortError") {
        netLeft--;
        push({ k: "net", u: netUrl(url), st: 0, ms: Date.now() - t0, msg: safeMsg((err as Error)?.message) });
      }
      throw err;
    }
  };
  window.fetch = wrappedFetch;

  // حالة التطبيق نفسه (قدامه/في الخلفية) من الأصلي — لو متاح
  let removeApp: (() => void) | undefined;
  void import("@capacitor/app")
    .then(async ({ App }) => {
      const h = await App.addListener("appStateChange", (s) => {
        if (!s.isActive) hiddenAt = Date.now();   // التطبيق راح الخلفية ⇒ الفجوة الجاية مش تهنيج
        push({ k: "app", active: !!s.isActive });
      });
      removeApp = () => void h.remove();
    })
    .catch(() => {});

  // اللي فضل من الفتحة اللي قبلها (اللي وقعت) يترفع على طول
  void flush();

  return () => {
    clearInterval(beat);
    clearInterval(tick);
    clearInterval(freeze);
    document.removeEventListener("visibilitychange", onVis);
    document.removeEventListener("visibilitychange", resetTick);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("click", onTap, true);
    if (window.fetch === wrappedFetch) window.fetch = origFetch;
    console.error = origError;
    console.warn = origWarn;
    removeApp?.();
    started = false;
    mode = null;
  };
}

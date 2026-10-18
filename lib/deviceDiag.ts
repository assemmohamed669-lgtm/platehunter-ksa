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
export const DIAG_AGENT_IDS: string[] = ["fbe0486e-e979-4427-ba0e-c33572f1d7be"];

export const DIAG_MAX_EVENTS = 600;
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
let uidRef = "";
let sidRef = "";
let lastPath = "";
let lastTap: { label: string; t: number } | null = null;

function push(ev: Omit<DiagEvent, "t"> & { t?: number }) {
  if (!started) return;
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
    for (const chunk of chunkForUpload(buf)) {
      const { error } = await supabase.from("voice_telemetry").insert({
        agent_id: uidRef,
        session_id: "diag-" + sidRef,
        started_at: new Date(chunk[0].t).toISOString(),
        ended_at: new Date(chunk[chunk.length - 1].t).toISOString(),
        platform: getDevicePlatform(),
        build: BUILD_ID,
        server: "diag",
        counts: { n: chunk.length },
        latency: {},
        events: chunk,
      });
      if (error) break;
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
  if (started || typeof window === "undefined" || !diagEnabledFor(uid)) return () => {};
  started = true;
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
    mem: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
  });
  writeJson(STATE_KEY, { sid: sidRef, path: lastPath, beat: now, vis: document.visibilityState });

  const beat = setInterval(() => saveState({ beat: Date.now(), path: location.pathname, vis: document.visibilityState }), BEAT_MS);
  const tick = setInterval(() => void flush(), FLUSH_MS);
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
  const onErr = (e: ErrorEvent) =>
    push({ k: "err", msg: String(e.message ?? "").slice(0, 200), src: String(e.filename ?? "").split("/").pop()?.slice(0, 60), line: e.lineno });
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

  // حالة التطبيق نفسه (قدامه/في الخلفية) من الأصلي — لو متاح
  let removeApp: (() => void) | undefined;
  void import("@capacitor/app")
    .then(async ({ App }) => {
      const h = await App.addListener("appStateChange", (s) => push({ k: "app", active: !!s.isActive }));
      removeApp = () => void h.remove();
    })
    .catch(() => {});

  // اللي فضل من الفتحة اللي قبلها (اللي وقعت) يترفع على طول
  void flush();

  return () => {
    clearInterval(beat);
    clearInterval(tick);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
    document.removeEventListener("click", onTap, true);
    removeApp?.();
    started = false;
  };
}

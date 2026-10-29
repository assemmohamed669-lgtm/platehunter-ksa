/**
 * ══════════════════════════════════════════════════════════════════════
 *  🧯 «سجل المشاكل» الخفيف — الوقعات والأغلاط والتهنيج بس
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ أكتوبر ٢٠٢٦): «عايزينه اخف ويسجل فقط كل يوم ب يومه» · «اكدلي … ان محدش هيتأثر فيهم بحاجه ولا دة هيعمل
 * لخبطه مع حد فيهم سواء في التشييك او في التسجيل». الصندوق الأسود الكامل (`lib/deviceDiag.ts`) بيتشغّل لحساب بعينه
 * **بعد** ما المشكلة تحصل؛ ده بيسجّل المشاكل نفسها من الأول، فأي شكوى نلاقي اللي حصل.
 *
 *  · **بيسجّل:** البرنامج اتقفل والصفحة قدامه (وقعة) · غلط في الكود · وعد اترفض · الشاشة وقفت ٥ ثواني أو أكتر.
 *  · **مابيعملش:** خطوات · متابعة طلبات النت · لمس للتشييك/التسجيل/Voice PRO/الفرز. بيسمع بس.
 *  · **الموبايل:** مشاكل النهارده بس (حد `ISSUE_MAX_EVENTS`)، واليوم الجديد بيبدأ من الأول.
 *  · **السيرفر:** صف صغير في `voice_telemetry` (server = «issues») **لما يحصل حاجة بس** — بعد دقيقتين من أول مشكلة؛
 *    يوم من غير مشاكل = ولا طلب. الكرون بيمسحه بعد `ISSUE_RETENTION_DAYS` (النهارده وامبارح).
 *  · أي غلط جوّاه بيسكت — عمره ما يوقّع البرنامج. **للكل** (`ISSUE_LOG_FOR_ALL` — المالك: «حطه ل كله ويتمسح كل
 *    يومين»)، و`ISSUE_MAX_UPLOADS_PER_DAY` رفعة في اليوم بالكتير. الحساب اللي عليه الصندوق الكامل مابيشتغلش عنده.
 */

/** 🟢 للكل — المالك (٢٣ أكتوبر ٢٠٢٦): «حطه ل كله ويتمسح كل يومين». */
export const ISSUE_LOG_FOR_ALL = true;
export const ISSUE_LOG_SERVER = "issues";
/** أقصى سطور مشاكل في اليوم على الموبايل (كل سطر بضع عشرات من البايتات). */
export const ISSUE_MAX_EVENTS = 50;
/** النهارده وامبارح — شكوى بالليل تتشاف الصبح. */
export const ISSUE_RETENTION_DAYS = 2;
/**
 * 🛡️ أقصى رفعات في اليوم لكل موبايل — غلط بيتكرر طول اليوم مايبعتش مئات الطلبات للسيرفر (السطور بتفضل على الموبايل
 * لحد الحد بتاعها، والرفع بيرجع اليوم اللي بعده).
 */
export const ISSUE_MAX_UPLOADS_PER_DAY = 20;

import { appAwaySince, onAppState, pageVisibility } from "./appForeground";

const STATE_KEY = "ph:issues:state";
const BUF_KEY = "ph:issues:buf";
const UPLOADS_KEY = "ph:issues:uploads";
const TICK_MS = 2_000;
const FREEZE_MS = 5_000;
const BEAT_MS = 30_000;
const FLUSH_DELAY_MS = 120_000;
/** نبضة أقدم من كده ⇒ الفتحة دي «عادية بعد فترة» مش بعد وقعة. */
const RECENT_MS = 10 * 60_000;
/** أغلاط الكود في الفتحة الواحدة — عشان غلط بيتكرر مايملاش السجل. */
const MAX_ERRS_PER_LOAD = 20;
const DEDUPE_MS = 60_000;

export interface IssueEvent {
  t: number;
  k: "crash" | "err" | "rej" | "freeze" | string;
  /** الصفحة */
  p: string;
  msg?: string;
  src?: string;
  line?: number;
  ms?: number;
}
export interface IssueBuffer { day: string; events: IssueEvent[] }
interface IssueState { path: string; beat: number; vis: string; reload?: boolean }

/** يوم الرياض (YYYY-MM-DD). */
export function issueDayKey(t: number): string {
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

/** السطر الجديد — اليوم الجديد بيبدأ من الأول، نفس الغلط في نفس الدقيقة مرة واحدة، والقديم بيتشال لو عدّى الحد. */
export function addIssue(buf: IssueBuffer | null, ev: IssueEvent, day: string): IssueBuffer {
  const base: IssueEvent[] = buf && buf.day === day ? buf.events : [];
  const dup = base.some((e) => e.k === ev.k && e.msg === ev.msg && e.p === ev.p && Math.abs(ev.t - e.t) < DEDUPE_MS);
  if (dup) return { day, events: base };
  const events = [...base, ev];
  return { day, events: events.length > ISSUE_MAX_EVENTS ? events.slice(events.length - ISSUE_MAX_EVENTS) : events };
}

/** تاريخ المسح على السيرفر (الكرون). */
export function issuesCutoff(now: Date): string {
  return new Date(now.getTime() - ISSUE_RETENTION_DAYS * 86_400_000).toISOString();
}

function readJson<T>(k: string): T | null {
  try { return JSON.parse(localStorage.getItem(k) || "null") as T | null; } catch { return null; }
}
function writeJson(k: string, v: unknown): void {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين مليان/مقفول — نسكت */ }
}

export function readIssueBuffer(): IssueBuffer | null {
  return readJson<IssueBuffer>(BUF_KEY);
}

type Insert = (row: Record<string, unknown>) => Promise<{ error: unknown }>;

async function defaultInsert(row: Record<string, unknown>): Promise<{ error: unknown }> {
  const [{ supabase }, { BUILD_ID }, { getDevicePlatform }] = await Promise.all([
    import("@/lib/supabaseClient"),
    import("@/lib/appVersion"),
    import("@/lib/devicePlatform"),
  ]);
  const { error } = await supabase.from("voice_telemetry").insert({ ...row, platform: getDevicePlatform(), build: BUILD_ID });
  return { error };
}

let started = false;

/**
 * يبدأ السجل للحساب ده (مرة واحدة لكل تحميل). بيرجّع دالة إيقاف. مقفول (ولا مستمع ولا مؤقّت) لو مش مسموح له
 * أو الصندوق الكامل شغّال على الحساب.
 */
export function startIssueLog(
  uid: string | null | undefined,
  opts: { isSuper: boolean; diagOn?: boolean; insert?: Insert },
): () => void {
  if (started || typeof window === "undefined" || !uid) return () => {};
  if (opts.diagOn || !(ISSUE_LOG_FOR_ALL || opts.isSuper)) return () => {};
  started = true;
  const insert = opts.insert ?? defaultInsert;
  const path = () => { try { return location.pathname; } catch { return ""; } };
  // 📱 حالة التطبيق نفسه مش رأي الصفحة — أندرويد 1.8 والتسجيل في الخلفية بيقول للصفحة «ظاهرة» (`lib/appForeground.ts`)
  const vis = () => pageVisibility();

  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let errsLeft = MAX_ERRS_PER_LOAD;

  const flush = async () => {
    flushTimer = null;
    if (flushing) return;
    const buf = readIssueBuffer();
    if (!buf || !buf.events.length) return;
    const today = issueDayKey(Date.now());
    const up = readJson<{ day: string; n: number }>(UPLOADS_KEY);
    const usedToday = up && up.day === today ? up.n : 0;
    if (usedToday >= ISSUE_MAX_UPLOADS_PER_DAY) return;   // 🛡️ وصل حد النهارده
    flushing = true;
    try {
      const evs = buf.events;
      const { error } = await insert({
        agent_id: uid,
        session_id: `issues-${buf.day}`,
        started_at: new Date(evs[0].t).toISOString(),
        ended_at: new Date(evs[evs.length - 1].t).toISOString(),
        server: ISSUE_LOG_SERVER,
        counts: { n: evs.length },
        latency: {},
        events: evs,
      });
      if (!error) {
        writeJson(UPLOADS_KEY, { day: today, n: usedToday + 1 });
        // اللي اترفع بس — اللي وصل وإحنا بنرفع يفضل للمرة الجاية
        const now = readIssueBuffer();
        if (now && now.day === buf.day) writeJson(BUF_KEY, { day: now.day, events: now.events.slice(evs.length) });
      }
    } catch { /* مفيش نت — المرة الجاية */ } finally {
      flushing = false;
    }
  };
  const scheduleFlush = () => { if (!flushTimer) flushTimer = setTimeout(() => { void flush(); }, FLUSH_DELAY_MS); };
  const record = (ev: Omit<IssueEvent, "t" | "p"> & { t?: number; p?: string }) => {
    try {
      const t = ev.t ?? Date.now();
      const full: IssueEvent = { ...ev, t, p: ev.p ?? path() } as IssueEvent;
      writeJson(BUF_KEY, addIssue(readIssueBuffer(), full, issueDayKey(t)));
      scheduleFlush();
    } catch { /* السجل عمره ما يوقّع البرنامج */ }
  };
  const saveState = (patch: Partial<IssueState> = {}) =>
    writeJson(STATE_KEY, { path: path(), beat: Date.now(), vis: vis(), ...patch });

  // 💥 الفتحة اللي فاتت خلصت بوقعة؟ (نبضة حديثة + الصفحة كانت قدامه + من غير قفل عادي)
  try {
    const prev = readJson<IssueState>(STATE_KEY);
    const now = Date.now();
    if (prev && !prev.reload && prev.vis !== "hidden" && now - prev.beat < RECENT_MS) {
      record({ k: "crash", p: prev.path, t: now });
    }
  } catch { /* نسكت */ }
  saveState();
  if (readIssueBuffer()?.events.length) scheduleFlush();   // سطور قديمة لسه ماترفعتش

  const onErr = (e: ErrorEvent) => {
    if (errsLeft <= 0) return;
    errsLeft--;
    record({ k: "err", msg: String(e.message ?? "").slice(0, 160), src: String(e.filename ?? "").split("/").pop()?.slice(0, 60) || undefined, line: e.lineno || undefined });
  };
  const onRej = (e: Event) => {
    if (errsLeft <= 0) return;
    errsLeft--;
    const r = (e as Event & { reason?: unknown }).reason as { message?: string } | string | undefined;
    record({ k: "rej", msg: String((typeof r === "object" && r ? r.message : r) ?? "").slice(0, 160) });
  };
  let hiddenAt = 0;
  let lastTick = Date.now();
  let lastBeat = Date.now();
  const onVis = () => {
    if (vis() === "hidden") {
      hiddenAt = Date.now();
      saveState({ vis: "hidden" });
      void flush();
    } else {
      saveState();
    }
    lastTick = Date.now();
  };
  const onHide = () => saveState({ reload: true, vis: "hidden" });
  // التطبيق راح الخلفية ⇒ قفل الأندرويد ليه بعدها مش «وقعة» · رجع ⇒ الفجوة دي مش «تهنيج»
  const offApp = onAppState((active) => {
    if (!active) { hiddenAt = Date.now(); saveState({ vis: "hidden" }); void flush(); }
    else saveState();
    lastTick = Date.now();
  });
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", onVis);

  // 🧊 التهنيج + النبضة — مؤقّت خفيف كل ثانيتين
  const tick = setInterval(() => {
    try {
      const n = Date.now();
      const gap = n - lastTick;
      if (gap - TICK_MS >= FREEZE_MS && vis() === "visible" && !(hiddenAt >= lastTick) && !appAwaySince(lastTick)) record({ k: "freeze", ms: gap });
      lastTick = n;
      if (n - lastBeat >= BEAT_MS) { lastBeat = n; saveState(); }
    } catch { /* نسكت */ }
  }, TICK_MS);

  return () => {
    clearInterval(tick);
    offApp();
    if (flushTimer) clearTimeout(flushTimer);
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
    window.removeEventListener("pagehide", onHide);
    document.removeEventListener("visibilitychange", onVis);
    started = false;
  };
}

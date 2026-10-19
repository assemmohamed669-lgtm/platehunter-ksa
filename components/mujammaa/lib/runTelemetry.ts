/**
 * 📋 **تقرير كل تسجيل للسيرفر** (١٨ أكتوبر ٢٠٢٦) — المالك: «أهم حاجه عايزين نعرف كل التقارير عن التسجيل».
 *
 * الوسيط على إيطاليا بيسجّل لوحده كل طلب تفريغ (الحجم · وقت الرفع · الطابور · النتيجة · الغلط) جنب
 * الصوت. اللي السيرفر **مايعرفهوش** بيبعته الموبايل هنا على `POST <السيرفر>/report`:
 *  · كل لوحة بموقعها (دقة الموقع) ومطلوبة ولا لأ ونوعها وثانية نطقها،
 *  · الجهاز (آيفون/أندرويد ونسخته) والنت،
 *  · الأغلاط اللي حصلت على الموبايل — **وأهمها التسجيل اللي ماوصلش السيرفر أصلاً**،
 *  · التصدير (اتحفظ كام · فشل كام · عدّل/مسح كام).
 *
 * التقرير مابيوقّفش ولا بيأخّر حاجة: مافيش `await` عليه في الصفحة، وأي فشل (نت/سيرفر) ⇒ بيستنى في
 * صندوق صغير على الموبايل (`OUTBOX_KEY`) ويتبعت مع التقرير اللي بعده. المندوب مابيشوفش حاجة.
 * القارئ: `mujammaa_report.py` في platehunter-server-scripts.
 */
import type { PlateEntry } from "./plateEntry";
import { NO_PRECISE_PIN, neighborPinOf, type TrackFix } from "./platePin";

export const OUTBOX_KEY = "mj:reports:outbox";
/** الصندوق مايكبرش للأبد — الأقدم بيتشال */
export const OUTBOX_MAX = 30;
/** السيرفر بيقبل لحد ٥١٢ ك في الطلب — نسيب مسافة */
const OUTBOX_MAX_CHARS = 380_000;
export const PLATES_MAX = 600;
/** قراءة في الثانية ⇒ ٢٠ دقيقة (الحد ١٥) — كل واحدة ~١٤ حرف */
export const GPS_FIXES_MAX = 1200;
const ERRORS_MAX = 10;
const ERROR_CHARS = 200;
const SEND_TIMEOUT_MS = 15_000;

/** «مسح» من الجدول قبل التصدير — كل واحدة لوحة البرنامج طلّعها والمندوب شالها (غالباً زيادة/مكررة) */
export const REMOVED_MAX = 200;

export interface DeviceInfo {
  /** معرّف البناء اللي شغّال على الموبايل — نسخة قديمة مكاشة بتبان هنا */
  app?: string;
  platform?: string;
  ua?: string;
  online?: boolean;
  vis?: string;
  mem?: number;
  scr?: string;
}

export interface RunReport {
  v: 1;
  /** `issue` = مشاكل الموبايل اللي حصلت برّه أي تفريغ (الميكروفون · التخزين · السيرفر مش جاهز …) */
  kind: "run" | "fail" | "export" | "issue";
  at: string;
  uid: string | null;
  agent: string;
  run?: string;
  ok?: boolean;
  error?: string;
  clip?: { id?: string; label?: string; source?: string; sec?: number; bytes?: number; mime?: string };
  t?: { total_ms?: number; upload_ms?: number; plates_ms?: number; queued_ms?: number; queue_pos_max?: number };
  res?: { n?: number; dur_s?: number; server_ms?: number; fields_from?: string; cohere_calls?: number; dropped?: number };
  n_plates: number;
  pinned: number;
  wanted: number;
  /**
   * `ts` = ثانية النطق من السيرفر (اللي الدبوس بيتحط بيها) · `pm` = ليه مالهاش موقع / إنه منسوخ ·
   * `h` = اللوحة زي ما البرنامج سمعها لو المندوب صلّحها بإيده · `th` = النوع اللي طلع لو المندوب غيّره.
   */
  plates: Array<{
    p: string;
    t: number | null;
    ts?: number;
    ty?: string;
    w?: 1;
    acc: number | null;
    pm?: string;
    h?: string;
    th?: string;
  }>;
  fixes?: number;
  /**
   * 📍 الموقع وقت التسجيل (١٩ أكتوبر): `f` = كل قراءة [ثانيتها من بداية الصوت (سالب = قبل البداية), دقتها م] ·
   * `in_clip` كام قراءة جوّه التسجيل · `first_s` أول واحدة جوّه · `old_s` عمر القراءة الجاهزة وقت البداية ·
   * `max_gap_s` أطول وقت من غير قراءة (من البداية للنهاية) · الدقة أحسن/وسط/أوحش.
   */
  gps?: {
    n: number;
    in_clip: number;
    f: Array<[number, number | null]>;
    first_s?: number;
    old_s?: number;
    max_gap_s?: number;
    acc_min?: number;
    acc_med?: number;
    acc_max?: number;
  };
  errors?: string[];
  export?: {
    saved: number;
    failed: number;
    total: number;
    no_pin: number;
    edited?: number;
    deleted?: number;
    /** اللوحات اللي المندوب مسحها من الجدول (بثانية نطقها) */
    removed?: Array<{ p: string; t: number | null }>;
  };
  dev?: DeviceInfo;
}

export interface RunReportInput {
  kind: RunReport["kind"];
  agent: string;
  uid: string | null;
  run?: string;
  ok?: boolean;
  error?: string;
  clip?: RunReport["clip"] & { startedAtMs?: number };
  timing?: { totalMs?: number; uploadMs?: number; platesMs?: number; queuedMs?: number; queuePosMax?: number };
  result?: { n?: number; durS?: number; serverMs?: number; fieldsFrom?: string; cohereCalls?: number; dropped?: number };
  entries?: PlateEntry[];
  fixes?: number;
  /** مسار المقطع (`clipJobFields(clip).fixes`) — بيطلع منه `gps` */
  track?: TrackFix[];
  errors?: string[];
  export?: RunReport["export"];
  now?: number;
  dev?: DeviceInfo;
}

const num = (x: unknown): number | undefined =>
  typeof x === "number" && Number.isFinite(x) ? x : undefined;
const round1 = (x: number) => Math.round(x * 10) / 10;

export function buildRunReport(i: RunReportInput): RunReport {
  const entries = Array.isArray(i.entries) ? i.entries : [];
  const t0 = num(i.clip?.startedAtMs);
  const plates = entries.slice(0, PLATES_MAX).map((e) => {
    const at = num(e.capturedAt);
    const o: RunReport["plates"][number] = {
      p: String(e.review?.plate ?? ""),
      t: t0 !== undefined && at !== undefined ? round1((at - t0) / 1000) : null,
      acc: null,
    };
    const ts = num(e.review?.timeStart);
    if (ts !== undefined) o.ts = round1(ts);
    if (e.vehicleType) o.ty = e.vehicleType;
    if (e.match?.kind === "exact") o.w = 1;
    o.acc = e.pin && num(e.pin.accuracy) !== undefined ? Math.round(e.pin.accuracy) : null;
    const pm = pinNote(e);
    if (pm) o.pm = pm;
    // ✍️ تصحيح المندوب بإيده = الحقيقة: «طلع X وصلّحها Y» من غير ما نسأله
    const heard = e.review?.heardPlate;
    if (e.review?.manuallyEdited && heard && heard !== o.p) o.h = String(heard);
    if (typeof e.typeHeard === "string" && e.typeHeard !== (e.vehicleType ?? "")) o.th = e.typeHeard;
    return o;
  });
  const clip = i.clip
    ? {
        ...(i.clip.id ? { id: i.clip.id } : {}),
        ...(i.clip.label ? { label: i.clip.label } : {}),
        ...(i.clip.source ? { source: i.clip.source } : {}),
        ...(num(i.clip.sec) !== undefined ? { sec: Math.round((i.clip.sec as number) * 100) / 100 } : {}),
        ...(num(i.clip.bytes) !== undefined ? { bytes: i.clip.bytes } : {}),
        ...(i.clip.mime ? { mime: i.clip.mime } : {}),
      }
    : undefined;
  const r: RunReport = {
    v: 1,
    kind: i.kind,
    at: new Date(i.now ?? Date.now()).toISOString(),
    uid: i.uid ?? null,
    agent: String(i.agent || "").slice(0, 120),
    n_plates: entries.length,
    pinned: entries.filter((e) => !!e.pin).length,
    wanted: entries.filter((e) => e.match?.kind === "exact").length,
    plates,
  };
  if (i.run) r.run = i.run;
  if (i.ok !== undefined) r.ok = i.ok;
  if (i.error) r.error = String(i.error).slice(0, 300);
  if (clip && Object.keys(clip).length) r.clip = clip;
  if (i.timing) {
    const t: NonNullable<RunReport["t"]> = {};
    if (num(i.timing.totalMs) !== undefined) t.total_ms = Math.round(i.timing.totalMs!);
    if (num(i.timing.uploadMs) !== undefined) t.upload_ms = Math.round(i.timing.uploadMs!);
    if (num(i.timing.platesMs) !== undefined) t.plates_ms = Math.round(i.timing.platesMs!);
    if (num(i.timing.queuedMs) !== undefined) t.queued_ms = Math.round(i.timing.queuedMs!);
    if (num(i.timing.queuePosMax) !== undefined) t.queue_pos_max = i.timing.queuePosMax;
    if (Object.keys(t).length) r.t = t;
  }
  if (i.result) {
    r.res = {
      n: num(i.result.n),
      dur_s: num(i.result.durS),
      server_ms: num(i.result.serverMs),
      fields_from: i.result.fieldsFrom,
      cohere_calls: num(i.result.cohereCalls),
      dropped: num(i.result.dropped),
    };
  }
  if (num(i.fixes) !== undefined) r.fixes = i.fixes;
  if (Array.isArray(i.track)) r.gps = gpsSummary(i.track, num(i.clip?.sec));
  if (i.errors?.length) r.errors = i.errors.slice(0, ERRORS_MAX).map((e) => String(e).slice(0, ERROR_CHARS));
  if (i.export) {
    r.export = { ...i.export };
    if (Array.isArray(i.export.removed)) r.export.removed = i.export.removed.slice(0, REMOVED_MAX);
  }
  r.dev = i.dev ?? deviceInfo();
  return r;
}

/** ليه اللوحة مالهاش موقع (من علامتها) — أو إنه منسوخ من اللي جنبها */
function pinNote(e: PlateEntry): string | undefined {
  const side = neighborPinOf(e);
  if (side) return side === "before" ? "نفس اللي قبلها" : "نفس اللي بعدها";
  if (e.pin) return undefined;
  const miss = (e.review?.notes || []).find((n) => String(n).startsWith(NO_PRECISE_PIN));
  if (!miss) return undefined;
  const why = String(miss).split(" — ").slice(1).join(" — ").trim();
  return (why || String(miss)).slice(0, 120);
}

function gpsSummary(track: TrackFix[], sec: number | undefined): NonNullable<RunReport["gps"]> {
  const list = track.filter((f) => f && num(f.tMs) !== undefined).sort((a, b) => a.tMs - b.tMs);
  const endMs = sec !== undefined ? sec * 1000 : undefined;
  const inClip = list.filter((f) => f.tMs >= 0 && (endMs === undefined || f.tMs <= endMs));
  const g: NonNullable<RunReport["gps"]> = {
    n: list.length,
    in_clip: inClip.length,
    f: list
      .slice(0, GPS_FIXES_MAX)
      .map((f): [number, number | null] => [round1(f.tMs / 1000), num(f.acc) !== undefined ? Math.round(f.acc) : null]),
  };
  if (inClip.length) g.first_s = round1(inClip[0].tMs / 1000);
  const before = list.filter((f) => f.tMs < 0);
  if (before.length) g.old_s = round1(-before[before.length - 1].tMs / 1000);
  const marks = [0, ...inClip.map((f) => f.tMs)];
  if (endMs !== undefined) marks.push(endMs);
  if (marks.length > 1) {
    let gap = 0;
    for (let k = 1; k < marks.length; k++) gap = Math.max(gap, marks[k] - marks[k - 1]);
    g.max_gap_s = round1(gap / 1000);
  }
  const accs = list
    .map((f) => f.acc)
    .filter((a) => num(a) !== undefined)
    .sort((a, b) => a - b);
  if (accs.length) {
    const m = accs.length >> 1;
    g.acc_min = Math.round(accs[0]);
    g.acc_med = Math.round(accs.length % 2 ? accs[m] : (accs[m - 1] + accs[m]) / 2);
    g.acc_max = Math.round(accs[accs.length - 1]);
  }
  return g;
}

/**
 * 🧯 مشاكل الموبايل اللي حصلت **برّه** أي تفريغ (الميكروفون مارضيش · التخزين · السيرفر مش جاهز …) — من غيرها
 * المندوب اللي ماعرفش يسجّل أصلاً مالوش أي أثر على السيرفر. كل غلط مرة واحدة (`seen`)، والأقدم الأول.
 * اللي حصل وقت تفريغ (`jobActive`) بيتعلّم بس — تقرير التفريغ نفسه بيبعته (`errors`).
 */
export function issueBatch(
  snapshot: ReadonlyArray<{ id: string; source: string; message: string }>,
  seen: Set<string>,
  jobActive: boolean
): string[] {
  const out: string[] = [];
  for (const e of snapshot) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (!jobActive) out.push(`${e.source}: ${e.message}`.slice(0, ERROR_CHARS));
  }
  return out.reverse();
}

export function deviceInfo(): DeviceInfo {
  const d: DeviceInfo = { app: process.env.NEXT_PUBLIC_BUILD_ID || "dev" };
  try {
    const cap = (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    d.platform = cap?.getPlatform?.() || "web";
  } catch {
    d.platform = "web";
  }
  try {
    d.ua = String(navigator.userAgent || "").slice(0, 240);
    d.online = navigator.onLine !== false;
    const mem = (navigator as { deviceMemory?: number }).deviceMemory;
    if (typeof mem === "number") d.mem = mem;
  } catch {
    /* مافيش navigator */
  }
  try {
    d.vis = document.visibilityState;
    d.scr = `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`;
  } catch {
    /* مافيش document */
  }
  return d;
}

export function loadOutbox(): RunReport[] {
  try {
    const v = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]");
    return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as RunReport[]) : [];
  } catch {
    return [];
  }
}

function saveOutbox(list: RunReport[]) {
  let box = list.slice(-OUTBOX_MAX);
  try {
    while (box.length > 1 && JSON.stringify(box).length > OUTBOX_MAX_CHARS) box = box.slice(1);
    if (box.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(box));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* تخزين مقفول/مليان — التقرير ده بس اللي هيضيع، الشغل مايقفش */
  }
}

/**
 * بيبعت التقرير (ومعاه أي حاجة مستنية في الصندوق). **عمره ما بيرمي** — `true` لو اتبعت.
 * الصفحة بتندهه من غير `await` على مسار التفريغ.
 */
export async function sendRunReport(
  base: string,
  token: string | null | undefined,
  report: RunReport,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const batch = loadOutbox().concat(report);
  if (!token || !base) {
    saveOutbox(batch);
    return false;
  }
  let send = batch;
  while (send.length > 1 && JSON.stringify(send).length > OUTBOX_MAX_CHARS) send = send.slice(1);
  const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ac ? setTimeout(() => ac.abort(), SEND_TIMEOUT_MS) : null;
  try {
    const r = await fetchImpl(`${base.replace(/\/+$/, "")}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Plate-Token": token },
      body: JSON.stringify(send),
      signal: ac?.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    saveOutbox([]);
    return true;
  } catch {
    saveOutbox(batch);
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

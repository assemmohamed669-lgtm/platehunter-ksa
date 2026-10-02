/**
 * 🩺 مراقبة الصوت — المُجمِّع (٣ أكتوبر ٢٠٢٦)
 *
 * المالك: «عايز مراقبة شاملة علشان لما تحصل حاجة زي كده نرجع ونعرف إيه اللي
 * حصل والسبب ونحلّه — المهم مايأثرش على المناديب ولا شغل السيرفر».
 *
 * شكوى «قلت لوحات ومااتكتبتش» ليها ٣ أسباب ممكنة وكل واحد بيبان هنا:
 *   - النت: الطلب فشل/اتقطع  ⇐ حدث `f` بكود الفشل (http_503 / timeout / network…)
 *   - الموديل ماسمعش: القراية رجعت فاضية أو بنص من غير لوحة ⇐ `t` / عدّاد `empty`
 *   - النافذة اترمت قبل ما تتبعت (الطابور مليان) ⇐ عدّاد `skips.busy_window`
 *
 * التصميم عشان مايأثرش:
 *   - في الذاكرة بس، أرقام وجمل قصيرة — مافيش صوت خالص.
 *   - كل دالة جوّه try/catch: المراقبة عمرها ماترمي استثناء في طريق الصوت.
 *   - سقف أحداث لكل دفعة، والدفعة بتترفع مرة كل دقيقتين (مش مع كل طلب).
 */

/** حدث مضغوط: [نوع، ثانية من بداية الجلسة، …]. */
export type TelEvent = (string | number | null)[];

export type TelCounts = {
  reads: number;      // ردود رجعت من السيرفر
  accepted: number;   // فيها لوحة اتقبلت
  rejected: number;   // فيها لوحة بس اترفضت (ثقة قليلة / محجوبة)
  empty: number;      // من غير لوحة
  replays: number;    // إعادة إرسال نافذة
  shown: number;      // لوحات ظهرت للمندوب في الجدول
  fails: Record<string, number>;  // فشل الطلبات بالكود
  skips: Record<string, number>;  // نوافذ اتشالت قبل الإرسال (سكوت/زحمة…)
  events_dropped: number;
};

export type TelBatch = {
  agent_id: string;
  session_id: string;
  session_started_at: string;
  started_at: string;
  ended_at: string;
  platform: string;
  build: string;
  server: string;
  counts: TelCounts;
  latency: { p50: number | null; p95: number | null; max: number | null; model_p50: number | null; n: number };
  events: TelEvent[];
};

export type TelRead = {
  tMs?: number;
  rawText?: string;
  plate?: string;
  accepted?: boolean;
  blocked?: boolean;
  conf?: number | null;
  minLogprob?: number | null;
  msModel?: number | null;
  msWall?: number | null;
};

/** سقف الأحداث العادية (قراءات/لوحات/زحمة) — الفشل وأحداث الجلسة ليهم الباقي لحد MAX_EVENTS. */
const MAX_ROUTINE_EVENTS = 300;
const MAX_EVENTS = 400;
const MAX_TEXT = 48;

/** أسباب التخطّي العادية — بتتعدّ بس. الباقي فشل حقيقي (عدّاد + حدث). */
const ROUTINE_SKIPS = new Set([
  "silence_gate", "too_short", "utterance_too_short", "utterance_too_long",
  "busy_window", "yield_to_utterance",
]);
/** زحمة: النافذة اتشالت قبل ما تتبعت — مهمة للشكوى فبتاخد حدث (تحت السقف العادي). */
const CONGESTION_SKIPS = new Set(["busy_window", "yield_to_utterance"]);

/** النسبة المئوية بالرتبة الأقرب — الفاضي null. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * s.length));
  return s[Math.min(rank, s.length) - 1];
}

/** «request_failed:http_503» ⇐ «http_503»؛ من غير «:» بيرجع زي ما هو. */
export function skipCode(reason: string): string {
  const s = String(reason ?? "");
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(i + 1) || s : s;
}

const r2 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
const ri = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null);
const short = (s: unknown) => (typeof s === "string" ? s.slice(0, MAX_TEXT) : "");

function emptyCounts(): TelCounts {
  return { reads: 0, accepted: 0, rejected: 0, empty: 0, replays: 0, shown: 0, fails: {}, skips: {}, events_dropped: 0 };
}

type QueueStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const STALE_MS = 3 * 86_400_000;

/**
 * طابور الرفع: الدفعة بتتحفظ على الجهاز لحد ما ترتفع — لو النت وقع (وده بالظبط
 * وقت الشكوى) ماتضيعش، وبتترفع في الرفعة الجاية أو الجلسة الجاية. سقف عدد،
 * والأقدم من ٣ أيام بيترمى. رفعة واحدة في نفس الوقت، وأي غلط في التخزين بيكمّل
 * في الذاكرة من غير ما يرمي.
 */
export function createTelemetryQueue(opts: {
  key: string;
  storage?: QueueStorage | null;
  send: (rows: TelBatch[]) => Promise<boolean>;
  maxQueued?: number;
}) {
  const max = opts.maxQueued ?? 20;
  let items: TelBatch[] = [];
  let inFlight: Promise<void> | null = null;

  try {
    const raw = opts.storage?.getItem(opts.key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed.slice(-max);
  } catch { items = []; }

  const persist = () => {
    try { opts.storage?.setItem(opts.key, JSON.stringify(items)); } catch { /* التخزين رافض — الذاكرة كفاية */ }
  };
  const dropStale = () => {
    const cutoff = Date.now() - STALE_MS;
    items = items.filter((b) => {
      const t = new Date(b?.ended_at).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });
  };

  return {
    size: () => items.length,
    enqueue(b: TelBatch | null) {
      try {
        if (!b) return;
        items.push(b);
        if (items.length > max) items = items.slice(-max);
        persist();
      } catch { /* المراقبة ماتوقّفش الصوت */ }
    },
    flush(): Promise<void> {
      if (inFlight) return inFlight;
      const run = async () => {
        try {
          dropStale();
          if (!items.length) { persist(); return; }
          const sending = items.slice();
          let ok = false;
          try { ok = await opts.send(sending); } catch { ok = false; }
          if (ok) {
            const sent = new Set(sending);
            items = items.filter((b) => !sent.has(b));
          }
          persist();
        } catch { /* المراقبة ماتوقّفش الصوت */ }
      };
      // .finally بيتنفّذ بعد التعيين — لو الدالة خلصت من غير await
      // (طابور فاضي) التصفير جوّه كان بيسبق التعيين فيقفل الرفعات اللي بعدها.
      inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}

export type TelemetryQueue = ReturnType<typeof createTelemetryQueue>;

export const TELEMETRY_QUEUE_KEY = "voice:telemetry:queue";

let sharedQueue: TelemetryQueue | null = null;
/**
 * طابور واحد للصفحة كلها: وقف وبدأ على طول ⇒ الجلستين في نفس الطابور. لو كل
 * جلسة ليها طابور، الجديدة كانت تكتب فوق دفعة القديمة الأخيرة في التخزين.
 */
export function sharedTelemetryQueue(send: (rows: TelBatch[]) => Promise<boolean>, storage: QueueStorage | null): TelemetryQueue {
  if (!sharedQueue) sharedQueue = createTelemetryQueue({ key: TELEMETRY_QUEUE_KEY, storage, send });
  return sharedQueue;
}

type Listener = { addEventListener(k: string, f: () => void): void; removeEventListener(k: string, f: () => void): void };

const safeCall = <T,>(f?: () => T): T | null => { try { return f ? f() : null; } catch { return null; } };

function newSessionId(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* مش متاح */ }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

/**
 * جلسة مراقبة لتسجيل واحد: بتبدأ مع الضغطة وبتسجّل حالة النت، بترفع كل
 * دقيقتين، وبتسجّل وقوع النت ورجوعه. `end` بتتنده بعد ما آخر اللوحات توصل.
 * مقفولة ⇒ null ومافيش أي حاجة بتشتغل خالص.
 */
export function startTelemetrySession(opts: {
  enabled: boolean;
  agentId: string | null;
  server: string;
  platform: string;
  build: string;
  send: (rows: TelBatch[]) => Promise<boolean>;
  storage?: QueueStorage | null;
  queue?: TelemetryQueue;
  win?: Listener | null;
  online?: () => boolean;
  connection?: () => string | null;
  intervalMs?: number;
}): { tel: VoiceTelemetry; end(reason: string): void } | null {
  try {
    if (!opts.enabled || !opts.agentId) return null;
    const tel = new VoiceTelemetry({
      agentId: opts.agentId, sessionId: newSessionId(),
      platform: opts.platform, build: opts.build, server: opts.server,
    });
    const queue = opts.queue ?? createTelemetryQueue({ key: TELEMETRY_QUEUE_KEY, storage: opts.storage, send: opts.send });
    const net = () => ({ online: safeCall(opts.online), conn: safeCall(opts.connection) });
    tel.event("start", net());
    const onOffline = () => tel.event("offline");
    const onOnline = () => tel.event("online", net());
    try {
      opts.win?.addEventListener("offline", onOffline);
      opts.win?.addEventListener("online", onOnline);
    } catch { /* مستمعين مش متاحين */ }
    const tick = () => {
      try { queue.enqueue(tel.takeBatch()); void queue.flush(); } catch { /* المراقبة ماتوقّفش الصوت */ }
    };
    const timer = setInterval(tick, opts.intervalMs ?? 120_000);
    let ended = false;
    return {
      tel,
      end(reason: string) {
        if (ended) return;
        ended = true;
        try {
          clearInterval(timer);
          try {
            opts.win?.removeEventListener("offline", onOffline);
            opts.win?.removeEventListener("online", onOnline);
          } catch { /* ignore */ }
          tel.event("stop", { reason, ...net() });
          tick();
        } catch { /* المراقبة ماتوقّفش الصوت */ }
      },
    };
  } catch {
    return null;
  }
}

export class VoiceTelemetry {
  private readonly now: () => number;
  private readonly sessionStart: number;
  private windowStart: number;
  private counts: TelCounts = emptyCounts();
  private events: TelEvent[] = [];
  private routineEvents = 0;
  private wall: number[] = [];
  private model: number[] = [];
  private dirty = false;

  constructor(private readonly meta: {
    agentId: string; sessionId: string; platform?: string; build?: string; server?: string; now?: () => number;
  }) {
    this.now = meta.now ?? (() => Date.now());
    this.sessionStart = this.now();
    this.windowStart = this.sessionStart;
  }

  private t(): number {
    return Math.round((this.now() - this.sessionStart) / 100) / 10;
  }

  private push(ev: TelEvent, routine: boolean) {
    this.dirty = true;
    if (routine ? this.routineEvents >= MAX_ROUTINE_EVENTS : this.events.length >= MAX_EVENTS) {
      this.counts.events_dropped++;
      return;
    }
    if (routine) this.routineEvents++;
    this.events.push(ev);
  }

  /** بداية/وقف/المايك وقع/خطأ قاتل/… */
  event(name: string, detail?: Record<string, unknown>) {
    try {
      let d: string | null = null;
      if (detail) { try { d = JSON.stringify(detail).slice(0, 160); } catch { d = null; } }
      this.push(["e", this.t(), short(name), d], false);
    } catch { /* المراقبة ماتوقّفش الصوت */ }
  }

  /** رد السيرفر على نافذة. */
  read(r: TelRead) {
    try {
      if (!r) return;
      const c = this.counts;
      c.reads++;
      this.dirty = true;
      if (typeof r.msWall === "number" && Number.isFinite(r.msWall)) this.wall.push(r.msWall);
      if (typeof r.msModel === "number" && Number.isFinite(r.msModel)) this.model.push(r.msModel);
      const plate = short(r.plate);
      if (plate) {
        if (r.accepted) c.accepted++; else c.rejected++;
        // ["r", ث, لوحة, اتقبلت؟, محجوبة؟, ثقة, أقل logprob, زمن الرحلة, زمن الموديل, موضع النافذة]
        this.push(["r", this.t(), plate, r.accepted ? 1 : 0, r.blocked ? 1 : 0, r2(r.conf), r2(r.minLogprob), ri(r.msWall), ri(r.msModel), ri(r.tMs)], true);
      } else {
        c.empty++;
        // الموديل كتب حاجة بس مااتفهمتش لوحة — ده بالظبط «قلت لوحة ومااتكتبتش»
        const txt = short(r.rawText).trim();
        if (txt) this.push(["t", this.t(), txt, r2(r.conf), ri(r.msWall), ri(r.tMs)], true);
      }
    } catch { /* المراقبة ماتوقّفش الصوت */ }
  }

  /** onSkip من المحرّك: فشل طلب أو نافذة اتشالت. */
  skip(reason: string) {
    try {
      const why = String(reason ?? "");
      if (!why) return;
      const base = why.split(":")[0];
      if (ROUTINE_SKIPS.has(base)) {
        this.counts.skips[base] = (this.counts.skips[base] ?? 0) + 1;
        this.dirty = true;
        if (CONGESTION_SKIPS.has(base)) this.push(["b", this.t(), base], true);
        return;
      }
      const code = skipCode(why);
      this.counts.fails[code] = (this.counts.fails[code] ?? 0) + 1;
      this.push(["f", this.t(), short(why)], false);
    } catch { /* المراقبة ماتوقّفش الصوت */ }
  }

  replay() {
    try {
      this.counts.replays++;
      this.push(["x", this.t()], true);
    } catch { /* المراقبة ماتوقّفش الصوت */ }
  }

  /** لوحة ظهرت للمندوب في الجدول. */
  shown(plate: string, meta?: { tMs?: number; mult?: number; conf?: number; tier?: string }) {
    try {
      if (!plate) return;
      this.counts.shown++;
      this.push(["s", this.t(), short(plate), ri(meta?.tMs), ri(meta?.mult), r2(meta?.conf), short(meta?.tier) || null], true);
    } catch { /* المراقبة ماتوقّفش الصوت */ }
  }

  /** الدفعة من آخر مرة ويصفّر — null لو مافيش جديد. */
  takeBatch(): TelBatch | null {
    try {
      if (!this.dirty) return null;
      const end = this.now();
      const b: TelBatch = {
        agent_id: this.meta.agentId,
        session_id: this.meta.sessionId,
        session_started_at: new Date(this.sessionStart).toISOString(),
        started_at: new Date(this.windowStart).toISOString(),
        ended_at: new Date(end).toISOString(),
        platform: this.meta.platform ?? "",
        build: this.meta.build ?? "",
        server: this.meta.server ?? "",
        counts: this.counts,
        latency: {
          p50: percentile(this.wall, 50),
          p95: percentile(this.wall, 95),
          max: this.wall.length ? Math.max(...this.wall) : null,
          model_p50: percentile(this.model, 50),
          n: this.wall.length,
        },
        events: this.events,
      };
      this.windowStart = end;
      this.counts = emptyCounts();
      this.events = [];
      this.routineEvents = 0;
      this.wall = [];
      this.model = [];
      this.dirty = false;
      return b;
    } catch {
      return null;
    }
  }
}

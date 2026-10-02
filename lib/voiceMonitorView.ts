/**
 * 🩺 صفحة «مراقبة الصوت» — بتحوّل صفوف `voice_telemetry` و`voice_health`
 * لحكاية تتقري: إمتى بدأ وإمتى وقف، كل نافذة رد عليها السيرفر بإيه، وكل
 * فشل حصل **والسيرفر كان صاحي ساعتها ولا لأ** (ده اللي بيفرّق «نت المندوب»
 * عن «السيرفر واقع»).
 */
import type { TelCounts, TelEvent } from "./voiceTelemetry";

export type TelRow = {
  id: number;
  agent_id: string;
  session_id: string;
  session_started_at: string | null;
  started_at: string;
  ended_at: string;
  platform: string | null;
  build: string | null;
  server: string | null;
  counts: Partial<TelCounts> | null;
  latency: { p50?: number | null; p95?: number | null; max?: number | null; model_p50?: number | null; n?: number } | null;
  events: TelEvent[] | null;
};

export type HealthPoint = { checked_at: string; ok: boolean; ms: number | null; error: string | null; status: number | null; inflight: number | null };

export type SessionView = {
  sessionId: string;
  agentId: string;
  sessionStartedAt: string;
  startedAt: string;
  endedAt: string;
  platform: string;
  build: string;
  server: string;
  counts: TelCounts;
  latencyP50s: number[];
  latencyP95Max: number | null;
  latencyMax: number | null;
  batches: number;
  events: { at: Date; ev: TelEvent }[];
};

const add = (a: Record<string, number>, b: Record<string, number> | undefined) => {
  for (const [k, v] of Object.entries(b ?? {})) a[k] = (a[k] ?? 0) + (Number(v) || 0);
};
const maxN = (a: number | null, b: unknown) =>
  typeof b === "number" && Number.isFinite(b) ? (a == null ? b : Math.max(a, b)) : a;

export function groupSessions(rows: TelRow[]): SessionView[] {
  const by = new Map<string, SessionView>();
  const sorted = [...rows].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const r of sorted) {
    const key = r.agent_id + "|" + r.session_id;
    let s = by.get(key);
    if (!s) {
      s = {
        sessionId: r.session_id, agentId: r.agent_id,
        sessionStartedAt: r.session_started_at || r.started_at,
        startedAt: r.started_at, endedAt: r.ended_at,
        platform: r.platform ?? "", build: r.build ?? "", server: r.server ?? "",
        counts: { reads: 0, accepted: 0, rejected: 0, empty: 0, replays: 0, shown: 0, fails: {}, skips: {}, events_dropped: 0 },
        latencyP50s: [], latencyP95Max: null, latencyMax: null, batches: 0, events: [],
      };
      by.set(key, s);
    }
    s.batches++;
    if (r.ended_at > s.endedAt) s.endedAt = r.ended_at;
    if (r.started_at < s.startedAt) s.startedAt = r.started_at;
    const c = r.counts ?? {};
    for (const k of ["reads", "accepted", "rejected", "empty", "replays", "shown", "events_dropped"] as const) {
      s.counts[k] += Number(c[k]) || 0;
    }
    add(s.counts.fails, c.fails);
    add(s.counts.skips, c.skips);
    const l = r.latency ?? {};
    if (typeof l.p50 === "number") s.latencyP50s.push(l.p50);
    s.latencyP95Max = maxN(s.latencyP95Max, l.p95);
    s.latencyMax = maxN(s.latencyMax, l.max);
    const t0 = new Date(s.sessionStartedAt).getTime();
    for (const ev of r.events ?? []) {
      const sec = Number(ev?.[1]);
      if (!Number.isFinite(sec)) continue;
      s.events.push({ at: new Date(t0 + sec * 1000), ev });
    }
  }
  const out = [...by.values()];
  for (const s of out) s.events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out.sort((a, b) => b.sessionStartedAt.localeCompare(a.sessionStartedAt));
}

export type Tone = "ok" | "bad" | "warn" | "info" | "muted";

/** شرح كود الفشل اللي المحرّك بيدّيه (`lib/plateJudgeClient.ts`). */
export function failCodeText(code: string): string {
  if (code === "timeout") return "عدّى المهلة — النت بطيء أو السيرفر ماردّش";
  if (code === "network") return "النت فاصل على الموبايل (الطلب ماوصلش)";
  if (code === "no_response") return "مافيش رد";
  if (code === "bad_json" || code === "bad_shape") return "السيرفر رد بحاجة مش مفهومة";
  if (code === "http_401" || code === "http_403" || code === "bad_token") return "التوكن اترفض";
  if (code === "http_429") return "السيرفر بيقول طلبات كتير";
  if (code === "http_502" || code === "http_503" || code === "http_504" || code === "http_530")
    return `النفق/السيرفر مش متاح (${code.slice(5)})`;
  if (/^http_5\d\d$/.test(code)) return `خطأ في السيرفر (${code.slice(5)})`;
  if (code === "utterance_queue_full") return "طابور النطق اتملى — نطقة اترمت";
  if (code === "utterance_dropped_legacy") return "نطقة اترمت (السلوك القديم)";
  if (code === "slice_failed" || code.startsWith("empty_slice")) return "مقدرش يقصّ الصوت";
  return code;
}

const pct = (n: unknown) => (typeof n === "number" ? Math.round(n * 100) + "٪" : "—");
const secs = (ms: unknown) => (typeof ms === "number" ? (ms / 1000).toFixed(1) + "ث" : "—");
const parse = (s: unknown): Record<string, unknown> => {
  if (typeof s !== "string") return {};
  try { const o = JSON.parse(s); return o && typeof o === "object" ? o : {}; } catch { return {}; }
};

const STOP_REASON: Record<string, string> = {
  manual: "بإيده", fatal: "عطل", call: "مكالمة", background: "التطبيق راح للخلفية",
  unmount: "خرج من الصفحة", restart: "بدأ تسجيل جديد", mic_failed: "المايك مافتحش", engine_failed: "المحرّك مااشتغلش",
};

export function describeTelEvent(ev: TelEvent): { label: string; text: string; tone: Tone } {
  const k = String(ev?.[0] ?? "");
  switch (k) {
    case "f": {
      const why = String(ev[2] ?? "");
      const code = why.includes(":") ? why.slice(why.indexOf(":") + 1) : why;
      return { label: why.startsWith("replay_failed") ? "فشل إعادة الإرسال" : "فشل طلب", text: failCodeText(code), tone: "bad" };
    }
    case "r": {
      const ok = ev[3] === 1, blocked = ev[4] === 1;
      return {
        label: (ok ? "قراية: " : blocked ? "قراية محجوبة: " : "قراية اترفضت: ") + String(ev[2] ?? ""),
        text: `ثقة ${pct(ev[5])} · رد في ${secs(ev[7])}`,
        tone: ok ? "info" : "warn",
      };
    }
    case "t":
      return { label: "الموديل كتب نص من غير لوحة", text: `«${String(ev[2] ?? "")}» · ثقة ${pct(ev[3])}`, tone: "warn" };
    case "s":
      return { label: "ظهرت للمندوب: " + String(ev[2] ?? ""), text: `اتأكدت من ${ev[4] ?? "?"} نافذة · ثقة ${pct(ev[5])}`, tone: "ok" };
    case "b":
      return { label: "نافذة اترمت قبل ما تتبعت (زحمة)", text: String(ev[2] ?? ""), tone: "warn" };
    case "x":
      return { label: "إعادة إرسال نافذة فاتت", text: "", tone: "muted" };
    case "e": {
      const name = String(ev[2] ?? "");
      const d = parse(ev[3]);
      const net = d.online === false ? "النت فاصل" : d.conn ? `النت ${d.conn}` : "";
      if (name === "start") return { label: "بدأ التسجيل", text: net, tone: "info" };
      if (name === "stop") return { label: "وقف التسجيل", text: [STOP_REASON[String(d.reason)] ?? String(d.reason ?? ""), net].filter(Boolean).join(" · "), tone: "info" };
      if (name === "offline") return { label: "النت وقع على الموبايل", text: "", tone: "bad" };
      if (name === "online") return { label: "النت رجع", text: net, tone: "ok" };
      if (name === "mic_lost") return { label: "المايك اتاخد", text: STOP_REASON[String(d.reason)] ?? String(d.reason ?? ""), tone: "warn" };
      if (name === "fatal") return { label: "خطأ وقّف التسجيل", text: String(d.reason ?? ""), tone: "bad" };
      return { label: name, text: "", tone: "muted" };
    }
    default:
      return { label: k, text: "", tone: "muted" };
  }
}

/** النبضات الفاشلة المتتالية ⇐ فترة وقوع واحدة (بالترتيب الزمني). */
export function findOutages(rows: HealthPoint[]): { from: string; to: string; checks: number; errors: string[] }[] {
  const sorted = [...rows].sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  const out: { from: string; to: string; checks: number; errors: string[] }[] = [];
  let cur: (typeof out)[number] | null = null;
  for (const r of sorted) {
    if (r.ok) { cur = null; continue; }
    const err = r.error ?? "unknown";
    if (!cur) { cur = { from: r.checked_at, to: r.checked_at, checks: 0, errors: [] }; out.push(cur); }
    cur.to = r.checked_at;
    cur.checks++;
    if (!cur.errors.includes(err)) cur.errors.push(err);
  }
  return out;
}

/** حالة السيرفر في لحظة: أقرب نبضة في حدود دقيقتين. */
export function serverStateAt(rows: HealthPoint[], at: Date): "up" | "down" | "unknown" {
  const t = at.getTime();
  let best: HealthPoint | null = null;
  let bestD = Infinity;
  for (const r of rows) {
    const d = Math.abs(new Date(r.checked_at).getTime() - t);
    if (d < bestD) { bestD = d; best = r; }
  }
  if (!best || bestD > 120_000) return "unknown";
  return best.ok ? "up" : "down";
}

/** اليوم بتوقيت السعودية (UTC+3، مافيش توقيت صيفي). */
export function dayRange(day: string): { from: string; to: string } {
  const [y, m, d] = day.split("-").map(Number);
  const from = Date.UTC(y, m - 1, d) - 3 * 3_600_000;
  return { from: new Date(from).toISOString(), to: new Date(from + 86_400_000).toISOString() };
}

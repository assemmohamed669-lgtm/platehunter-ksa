/**
 * 🧭 سجل شغل الأعضاء لمسئول المجموعة — المالك (١٥ أكتوبر ٢٠٢٦): «يعرف مسئول المجموعه اي وقت كل عضو في المجموعه عمل
 * فرز ولا لا … لما يفتحها … يعرف انه اتحرك علي السيارة دي وفتح موقعها في الوقت دة ولما يشارك صورة او ملف اكسيل …
 * يعرف مكان الشخص دة فين». الجدول والدالة: `docs/sql/agent-events.sql` (٧ أيام).
 *
 * - الفرز ⇒ من غير ما نستنى الموقع (الفرز مايتأخرش).
 * - فتح موقع عربية / مشاركة ⇒ ومعاه مكان العضو ساعتها.
 * - النت في الشارع ضعيف ⇒ اللي مااتبعتش بيستنى في طابور على الموبايل ويتبعت مع التسجيل الجاي (أقصاه ٥٠، وأقل من ٢٣
 *   ساعة لأن الداتابيز بترفض الأقدم من يوم).
 * - الـSQL لسه ماتشغّلش ⇒ بيوقف بهدوء ومايملاش الموبايل.
 */
import { loadActiveTeam } from "./activeTeam";

export type AgentEventKind = "sort" | "open_location" | "share";

export interface AgentEventRow {
  kind: AgentEventKind;
  at: string;
  team: string | null;
  details: Record<string, unknown>;
  lat: number | null;
  lng: number | null;
}

export interface EventLoggerDeps {
  insert(rows: AgentEventRow[]): Promise<{ ok: boolean; missing?: boolean }>;
  getFix(): Promise<{ lat: number; lng: number } | null>;
  now(): Date;
  team(): string | null;
  storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null;
}

const QUEUE_KEY = "ph:agentEvents:queue";
const MAX_QUEUE = 50;
const MAX_AGE_MS = 23 * 60 * 60 * 1000;
const MAX_DETAILS = 2500;

/** التفاصيل مايعدّوش ~٢.٥ كيلو (الداتابيز بترفض أكتر من ٤). */
function trimDetails(d: Record<string, unknown>): Record<string, unknown> {
  if (JSON.stringify(d).length <= MAX_DETAILS) return d;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    out[k] = typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v;
    if (JSON.stringify(out).length > MAX_DETAILS) { delete out[k]; break; }
  }
  return out;
}

export function createEventLogger(deps: EventLoggerDeps) {
  let disabled = false;
  let flushing: Promise<void> | null = null;

  const read = (): AgentEventRow[] => {
    try { const v = JSON.parse(deps.storage?.getItem(QUEUE_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  };
  const write = (q: AgentEventRow[]) => { try { deps.storage?.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* مليان */ } };
  const fresh = (q: AgentEventRow[]) => {
    const now = deps.now().getTime();
    return q.filter((r) => now - Date.parse(r.at) < MAX_AGE_MS).slice(-MAX_QUEUE);
  };

  async function flushOnce(): Promise<void> {
    const q = fresh(read());
    if (!q.length || disabled) { write(disabled ? [] : q); return; }
    let res: { ok: boolean; missing?: boolean };
    try { res = await deps.insert(q); } catch { res = { ok: false }; }
    if (res.missing) { disabled = true; write([]); return; }
    if (res.ok) {
      // اللي اتضاف للطابور وإحنا بنبعت يفضل للمرة الجاية
      const sent = new Set(q.map((r) => `${r.at}|${r.kind}`));
      write(read().filter((r) => !sent.has(`${r.at}|${r.kind}`)));
    } else {
      write(q);
    }
  }

  async function flush(): Promise<void> {
    if (flushing) return flushing;
    flushing = flushOnce().finally(() => { flushing = null; });
    return flushing;
  }

  async function log(kind: AgentEventKind, details: Record<string, unknown>, opts: { withLocation?: boolean } = {}): Promise<void> {
    if (disabled) return;
    let fix: { lat: number; lng: number } | null = null;
    if (opts.withLocation) { try { fix = await deps.getFix(); } catch { fix = null; } }
    const row: AgentEventRow = {
      kind, at: deps.now().toISOString(), team: deps.team(), details: trimDetails(details ?? {}),
      lat: fix ? fix.lat : null, lng: fix ? fix.lng : null,
    };
    write(fresh([...read(), row]));
    await flush();
  }

  return { log, flush };
}

// ── النسخة اللي التطبيق بيستخدمها ────────────────────────────────────────────────

let appLogger: ReturnType<typeof createEventLogger> | null = null;

function getAppLogger() {
  if (appLogger) return appLogger;
  appLogger = createEventLogger({
    async insert(rows) {
      const { supabase } = await import("./supabaseClient");
      const { error } = await supabase.from("agent_events").insert(rows);
      if (!error) return { ok: true };
      const missing = error.code === "42P01" || error.code === "PGRST205" || /agent_events/.test(error.message ?? "") && /exist|schema cache/i.test(error.message ?? "");
      return { ok: false, missing };
    },
    async getFix() {
      const { gpsService } = await import("./gps");
      const f = await gpsService.getFreshFix({ maxAgeMs: 5 * 60_000, maxAccuracyM: 300, timeoutMs: 6000 });
      return f ? { lat: f.lat, lng: f.lng } : null;
    },
    now: () => new Date(),
    team: () => { try { return loadActiveTeam(); } catch { return null; } },
    storage: typeof localStorage !== "undefined" ? localStorage : null,
  });
  return appLogger;
}

/** بيسجّل حاجة عملها المندوب (من غير ما يوقّف الشاشة — مابيرميش غلط أبداً). */
export function logAgentEvent(kind: AgentEventKind, details: Record<string, unknown>, opts: { withLocation?: boolean } = {}): void {
  try { void getAppLogger().log(kind, details, opts).catch(() => {}); } catch { /* ignore */ }
}

/** لينك خرايط (موقع عربية)؟ */
export function isMapsHref(href: string): boolean {
  const h = String(href ?? "").trim();
  if (!h) return false;
  if (/^geo:/i.test(h)) return true;
  return /(maps\.google\.|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(h);
}

// ── للمسئول ─────────────────────────────────────────────────────────────────────

export interface TeamEvent {
  id: number;
  agent_id: string;
  username: string;
  kind: AgentEventKind;
  at: string;
  details: Record<string, unknown>;
  lat: number | null;
  lng: number | null;
}

export interface MemberWork {
  id: string;
  username: string;
  lastSortAt: string | null;
  sortsToday: number;
  opensToday: number;
  sharesToday: number;
  events: TeamEvent[];
}

const riyadhDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });

/** لكل عضو: آخر فرز + عدد النهارده (بتوقيت السعودية) + شغله كله (الأحدث فوق). */
export function summarizeTeamEvents(events: TeamEvent[], members: { id: string; username: string | null }[], now = new Date()): MemberWork[] {
  const today = riyadhDay(now);
  return members.map((m) => {
    const mine = events.filter((e) => e.agent_id === m.id).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const isToday = (e: TeamEvent) => riyadhDay(new Date(e.at)) === today;
    return {
      id: m.id,
      username: m.username ?? "؟",
      lastSortAt: mine.find((e) => e.kind === "sort")?.at ?? null,
      sortsToday: mine.filter((e) => e.kind === "sort" && isToday(e)).length,
      opensToday: mine.filter((e) => e.kind === "open_location" && isToday(e)).length,
      sharesToday: mine.filter((e) => e.kind === "share" && isToday(e)).length,
      events: mine,
    };
  });
}

const ar = (n: unknown) => Number(n ?? 0).toLocaleString("ar-EG");
const SORT_MODE: Record<string, string> = { new: "فرز جديد", full: "فرز كلي", paste: "لصق نصي" };

/** الكلام اللي المسئول بيشوفه لكل حاجة. */
export function describeEvent(e: Pick<TeamEvent, "kind" | "details">): string {
  const d = e.details ?? {};
  if (e.kind === "sort") {
    const mode = SORT_MODE[String(d.mode ?? "")] ?? "فرز";
    const res = Number(d.results ?? 0);
    const rec = Number(d.records ?? 0);
    if (!res && !rec) return `${mode} — مطلعش مطلوب`;
    return `${mode} — ${ar(res)} عربية مطلوبة${rec ? ` + ${ar(rec)} من السجلات` : ""}`;
  }
  if (e.kind === "open_location") return `فتح موقع العربية${d.plate ? ` ${String(d.plate)}` : ""}`;
  const count = d.count != null ? ` (${ar(d.count)} عربية)` : "";
  if (d.kind === "image") return `شارك صور النتيجة${count}`;
  if (d.kind === "excel") return `شارك إكسيل النتيجة${count}`;
  return "شارك النتيجة على واتساب";
}

/** شغل أعضاء مجموعة (للمسئول) — `missing` لو الـSQL لسه ماتشغّلش. */
export async function fetchTeamEvents(team: string): Promise<{ events: TeamEvent[]; missing?: boolean }> {
  const { supabase } = await import("./supabaseClient");
  const { data, error } = await supabase.rpc("team_agent_events", { p_team: team, p_days: 7 });
  if (error) return { events: [], missing: error.code === "PGRST202" || error.code === "42883" || /team_agent_events/.test(error.message ?? "") };
  return { events: (data ?? []) as TeamEvent[] };
}

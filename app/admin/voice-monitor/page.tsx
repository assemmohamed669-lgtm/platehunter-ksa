"use client";

/**
 * لوحة الأدمن — 🩺 مراقبة الصوت (سوبر أدمن فقط).
 *
 * المالك (٣ أكتوبر ٢٠٢٦): «عايز مراقبة شاملة علشان لما تحصل حاجة زي كده نرجع
 * ونعرف إيه اللي حصل والسبب ونحلّه». مندوب يشتكي «قلت لوحات ومااتكتبتش» ⇒
 * تختار اليوم والمندوب وتشوف كل اللي حصل ساعتها، وجنب كل فشل: السيرفر كان
 * صاحي ساعتها ولا لأ (صاحي ⇒ المشكلة من نت الموبايل).
 *
 * القراية محميّة على مستوى الداتابيز (RLS للسوبر أدمن) — الصفحة مش الحماية
 * الوحيدة. الجداول في `docs/sql/voice-monitoring.sql`.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Activity, RefreshCw, Server, Smartphone, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";
import {
  groupSessions, describeTelEvent, findOutages, serverStateAt, dayRange, failCodeText,
  type TelRow, type HealthPoint, type SessionView, type Tone,
} from "@/lib/voiceMonitorView";

const TONE: Record<Tone, string> = {
  ok: "text-emerald-600", bad: "text-danger", warn: "text-alert", info: "text-primary", muted: "text-muted",
};

/** النهارده بتوقيت السعودية (YYYY-MM-DD). */
function todayRiyadh(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function clock(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  const h24 = dt.getHours();
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${h12}:${p2(dt.getMinutes())}:${p2(dt.getSeconds())} ${h24 < 12 ? "ص" : "م"}`;
}

function mins(fromIso: string, toIso: string): string {
  const m = Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
  return m < 1 ? "أقل من دقيقة" : `${m} دقيقة`;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};
const secs = (ms: number | null) => (ms == null ? "—" : (ms / 1000).toFixed(1) + "ث");

/** الأحداث المهمة للشكوى — الباقي بيظهر بزرّ «كله». */
function isProblem(ev: SessionView["events"][number]["ev"]): boolean {
  const k = ev[0];
  if (k === "f" || k === "b" || k === "t") return true;
  if (k === "r") return ev[3] !== 1;
  if (k === "e") return ev[2] !== "start" && ev[2] !== "online";
  return false;
}

function MetaChip({ label, value, tone }: { label: string; value: string | number; tone?: Tone }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-1.5 text-center">
      <div className={"text-sm font-bold tabular-nums " + (tone ? TONE[tone] : "text-ink")}>{value}</div>
      <div className="text-[10px] text-muted">{label}</div>
    </div>
  );
}

function SessionCard({ s, health }: { s: SessionView; health: HealthPoint[] }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const c = s.counts;
  const fails = Object.values(c.fails).reduce((a, b) => a + b, 0);
  const busy = (c.skips.busy_window ?? 0) + (c.skips.yield_to_utterance ?? 0);
  const events = all ? s.events : s.events.filter((e) => isProblem(e.ev));

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <button className="flex w-full items-center justify-between gap-2 text-right" onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-bold text-ink">
          {clock(s.sessionStartedAt)} ← {clock(s.endedAt)}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          {mins(s.sessionStartedAt, s.endedAt)}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-muted" dir="ltr">
        <span>{s.platform || "?"}</span><span>{s.server}</span><span>build {s.build.slice(0, 7)}</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <MetaChip label="ردود" value={c.reads} />
        <MetaChip label="ظهرت" value={c.shown} tone="ok" />
        <MetaChip label="فشل" value={fails} tone={fails ? "bad" : "ok"} />
        <MetaChip label="زحمة اترمت" value={busy} tone={busy ? "warn" : "ok"} />
        <MetaChip label="من غير لوحة" value={c.empty} tone="muted" />
        <MetaChip label="اترفضت" value={c.rejected} tone={c.rejected ? "warn" : "muted"} />
        <MetaChip label="إعادة" value={c.replays} tone="muted" />
        <MetaChip label="الرد (وسيط/أقصى)" value={`${secs(median(s.latencyP50s))}/${secs(s.latencyMax)}`} />
      </div>

      {fails > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 text-[11px]">
          {Object.entries(c.fails).map(([code, n]) => (
            <span key={code} className="text-danger">• {failCodeText(code)} × {n}</span>
          ))}
        </div>
      )}
      {c.events_dropped > 0 && (
        <p className="mt-1 text-[10px] text-alert">⚠️ {c.events_dropped} حدث مااتسجّلش تفصيلياً (سقف الدفعة) — العدادات فوق كاملة.</p>
      )}

      {open && (
        <div className="mt-3">
          <div className="mb-2 flex gap-1.5">
            <button onClick={() => setAll(false)}
              className={"rounded-full px-3 py-1 text-[11px] font-bold " + (!all ? "bg-primary text-night" : "border border-border bg-surface-2 text-muted")}>
              المشاكل بس
            </button>
            <button onClick={() => setAll(true)}
              className={"rounded-full px-3 py-1 text-[11px] font-bold " + (all ? "bg-primary text-night" : "border border-border bg-surface-2 text-muted")}>
              كله ({s.events.length})
            </button>
          </div>
          {events.length === 0 ? (
            <p className="text-[11px] text-muted">مافيش مشاكل في الجلسة دي.</p>
          ) : (
            <ol className="flex flex-col gap-1">
              {events.map(({ at, ev }, i) => {
                const d = describeTelEvent(ev);
                const st = ev[0] === "f" ? serverStateAt(health, at) : null;
                return (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-surface-2 px-2 py-1.5">
                    <span className="shrink-0 font-mono text-[10px] text-muted tabular-nums">{clock(at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className={"block text-[11px] font-bold " + TONE[d.tone]}>{d.label}</span>
                      {d.text && <span className="block text-[10px] text-muted">{d.text}</span>}
                      {st && (
                        <span className={"mt-0.5 block text-[10px] font-bold " + (st === "up" ? "text-alert" : st === "down" ? "text-danger" : "text-muted")}>
                          {st === "up" ? "السيرفر كان صاحي ساعتها ⇐ المشكلة غالباً من نت الموبايل"
                            : st === "down" ? "السيرفر كان واقع ساعتها"
                            : "مافيش نبضة للسيرفر قريبة من الوقت ده"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default function VoiceMonitorPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [day, setDay] = useState(todayRiyadh());
  const [health, setHealth] = useState<HealthPoint[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string; sessions: number }[]>([]);
  const [agentId, setAgentId] = useState<string>("");
  const [rows, setRows] = useState<TelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();   // مش getUser: فشل الشبكة ≠ خروج
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", userId).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/sorting"); return; }
      setAuthorized(true);
    })();
  }, [router]);

  const tableErr = (m: string) =>
    m.includes("does not exist") || m.includes("schema cache")
      ? "جداول المراقبة مش موجودة — شغّل docs/sql/voice-monitoring.sql في Supabase."
      : "مش متاح — الصفحة دي للسوبر أدمن فقط.";

  const loadDay = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { from, to } = dayRange(day);
    const [h, t] = await Promise.all([
      supabase.from("voice_health").select("checked_at, ok, ms, error, status, inflight")
        .gte("checked_at", from).lt("checked_at", to).order("checked_at", { ascending: true }).limit(1600),
      supabase.from("voice_telemetry").select("agent_id, session_id")
        .gte("started_at", from).lt("started_at", to).limit(5000),
    ]);
    if (h.error || t.error) {
      setErr(tableErr((h.error ?? t.error)!.message));
      setHealth([]); setAgents([]); setLoading(false);
      return;
    }
    setHealth((h.data ?? []) as HealthPoint[]);
    const sess = new Map<string, Set<string>>();
    for (const r of (t.data ?? []) as { agent_id: string; session_id: string }[]) {
      if (!sess.has(r.agent_id)) sess.set(r.agent_id, new Set());
      sess.get(r.agent_id)!.add(r.session_id);
    }
    const ids = [...sess.keys()];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      for (const p of (profs ?? []) as { id: string; username?: string }[]) names[p.id] = p.username || p.id.slice(0, 8);
    }
    const list = ids.map((id) => ({ id, name: names[id] ?? id.slice(0, 8), sessions: sess.get(id)!.size }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
    setAgents(list);
    setAgentId((cur) => (cur && sess.has(cur) ? cur : list[0]?.id ?? ""));
    setLoading(false);
  }, [day]);

  const loadAgent = useCallback(async () => {
    if (!agentId) { setRows([]); return; }
    const { from, to } = dayRange(day);
    const { data, error } = await supabase.from("voice_telemetry").select("*")
      .eq("agent_id", agentId).gte("started_at", from).lt("started_at", to)
      .order("started_at", { ascending: true }).limit(1000);
    if (error) { setErr(tableErr(error.message)); setRows([]); return; }
    setRows((data ?? []) as TelRow[]);
  }, [agentId, day]);

  useEffect(() => { if (authorized) void loadDay(); }, [authorized, loadDay]);
  useEffect(() => { if (authorized) void loadAgent(); }, [authorized, loadAgent]);

  const sessions = useMemo(() => groupSessions(rows), [rows]);
  const outages = useMemo(() => findOutages(health).reverse(), [health]);
  const last = health.length ? health[health.length - 1] : null;
  const okCount = health.filter((r) => r.ok).length;
  // ٢٤ خانة = ساعات اليوم بتوقيت السعودية؛ اللون = نسبة النبضات الناجحة
  const hours = useMemo(() => {
    const { from } = dayRange(day);
    const t0 = new Date(from).getTime();
    const cells = Array.from({ length: 24 }, () => ({ ok: 0, n: 0 }));
    for (const r of health) {
      const i = Math.floor((new Date(r.checked_at).getTime() - t0) / 3_600_000);
      if (i >= 0 && i < 24) { cells[i].n++; if (r.ok) cells[i].ok++; }
    }
    return cells;
  }, [health, day]);

  if (!authorized) {
    return <div className="py-10 text-center text-sm text-muted">جارٍ التحقق من الصلاحيات...</div>;
  }

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-bold text-ink">مراقبة الصوت</h1>
            <p className="text-xs text-muted">السيرفر + جلسات Voice PRO — سوبر أدمن فقط</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { void loadDay(); void loadAgent(); }} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-bold text-muted transition hover:border-primary hover:text-primary disabled:opacity-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> تحديث
          </button>
          <button onClick={() => router.back()} className="rounded-xl border border-border bg-surface-2 p-2 text-muted transition hover:text-primary">
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        اليوم
        <input type="date" value={day} max={todayRiyadh()} onChange={(e) => e.target.value && setDay(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
      </label>

      {err && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-xs leading-relaxed text-danger">{err}</div>
      )}

      {/* ── السيرفر ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
          <Server size={15} /> سيرفر الصوت (ماليزيا)
        </div>
        {!last ? (
          <p className="text-[11px] leading-relaxed text-muted">
            مافيش نبضات لليوم ده. المراقب بيسأل السيرفر كل دقيقة بعد النشر وتشغيل الـSQL.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              <MetaChip label="آخر نبضة" value={last.ok ? "صاحي" : "واقع"} tone={last.ok ? "ok" : "bad"} />
              <MetaChip label="بيرد في" value={last.ms != null ? last.ms + " مللي" : "—"} />
              <MetaChip label="طلبات شغّالة" value={last.inflight ?? "—"} />
            </div>
            <p className="mt-1.5 text-[10px] text-muted">
              آخر نبضة {clock(last.checked_at)} · {okCount} من {health.length} نبضة سليمة · {outages.length} فترة وقوع
            </p>
            <div className="mt-2 grid grid-cols-12 gap-0.5" dir="ltr" aria-label="ساعات اليوم">
              {hours.map((c, i) => (
                <div key={i} title={`${i}:00 — ${c.ok}/${c.n}`}
                  className={"h-4 rounded-sm " + (c.n === 0 ? "bg-surface-2" : c.ok === c.n ? "bg-emerald-600/70" : c.ok / c.n >= 0.9 ? "bg-alert/70" : "bg-danger/70")} />
              ))}
            </div>
            <div className="mt-0.5 flex justify-between text-[9px] text-muted" dir="ltr"><span>12ص</span><span>12م</span><span>11م</span></div>
            {outages.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {outages.slice(0, 30).map((o) => (
                  <li key={o.from} className="rounded-lg bg-danger/5 px-2 py-1.5 text-[11px] text-danger">
                    {clock(o.from)}{o.to !== o.from ? ` ← ${clock(o.to)}` : ""} · {o.checks} نبضة · {o.errors.map(failCodeText).join(" / ")}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* ── المندوب ─────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Smartphone size={15} /> جلسات المندوب
        </div>
        {agents.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-center text-[11px] leading-relaxed text-muted">
            مافيش جلسات صوت مسجّلة لليوم ده. المراقبة شغّالة على السوبر أدمن بس دلوقتي.
          </p>
        ) : (
          <>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
              className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary">
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.sessions} جلسة</option>)}
            </select>
            {sessions.map((s) => <SessionCard key={s.sessionId} s={s} health={health} />)}
          </>
        )}
      </section>
    </div>
  );
}

"use client";

/**
 * نشاط المجموعة — **للمسئول بس** (أو أدمن في المجموعة). ٣ أقسام:
 *   ① حالة كل مندوب: فاتح دلوقتي ولا لأ + موقعه الحالي + إجمالي اليوم/٧/٣٠ يوم.
 *   ② المطلوب اللي اتلقى (المتصدَّر بس): لكل لوحة — مين + إمتى + فين.
 *   ③ تفاصيل يومية: مين نزل، بدأ الساعة كام، آخر تسجيل، كام سيارة، منهم كام مطلوبة.
 * المصدر: RPCs my_team_member_status / my_team_wanted_found / my_team_daily_activity.
 * التوقيت بتوقيت السعودية.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, CalendarDays, Clock, Car, AlertCircle, MapPin, AlertTriangle } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";

interface ActivityRow { agent_id: string; username: string; day: string; cars: number; wanted: number; first_at: string; last_at: string; }
interface StatusRow {
  agent_id: string; username: string; last_seen: string | null;
  last_lat: number | null; last_lng: number | null; last_loc_at: string | null;
  cars_today: number; cars_7d: number; cars_30d: number; wanted_30d: number; active_days_30d: number;
}
interface WantedRow { agent_id: string; username: string; plate: string; checked_at: string; maps_link: string | null; }

const TZ = "Asia/Riyadh";
const ONLINE_MS = 3 * 60 * 1000; // فاتح دلوقتي = آخر ظهور خلال ٣ دقايق

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("ar-EG", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}
function fmtDay(day: string): string {
  try { return new Date(day + "T00:00:00Z").toLocaleDateString("ar-EG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); } catch { return day; }
}
function fmtDur(a: string, b: string): string {
  try {
    const m = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
    if (m < 60) return `${m} د`;
    const h = Math.floor(m / 60), r = m % 60; return r ? `${h} س ${r} د` : `${h} س`;
  } catch { return "—"; }
}
function since(iso: string | null): string {
  if (!iso) return "مافيش";
  try {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} د`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `منذ ${h} س`;
    return `منذ ${Math.floor(h / 24)} يوم`;
  } catch { return "—"; }
}
function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  try { return Date.now() - new Date(lastSeen).getTime() <= ONLINE_MS; } catch { return false; }
}
function todayRiyadh(): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return ""; }
}

export default function GroupActivityPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "no-team" | "not-leader">("loading");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [status, setStatus] = useState<StatusRow[]>([]);
  const [wanted, setWanted] = useState<WantedRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("team, role").eq("id", userId).single();
      const prof = me as { team?: string | null; role?: string | null } | null;
      const team = prof?.team ?? null;
      if (!team) { setState("no-team"); return; }
      const { data: gs } = await supabase.from("group_settings").select("leader_id").eq("team", team).maybeSingle();
      const leaderId = (gs as { leader_id?: string | null } | null)?.leader_id ?? null;
      if (!(leaderId === userId || prof?.role === "admin")) { setState("not-leader"); return; }

      const [act, st, wf] = await Promise.all([
        supabase.rpc("my_team_daily_activity", { p_days: 14 }),
        supabase.rpc("my_team_member_status"),
        supabase.rpc("my_team_wanted_found", { p_days: 30 }),
      ]);
      if (act.error || st.error || wf.error) {
        setError("تعذّر تحميل النشاط: " + (act.error?.message || st.error?.message || wf.error?.message));
      }
      setRows((act.data ?? []) as ActivityRow[]);
      setStatus((st.data ?? []) as StatusRow[]);
      setWanted((wf.data ?? []) as WantedRow[]);
      setState("ok");
    })();
  }, [router]);

  const days: { day: string; members: ActivityRow[]; total: number; wanted: number }[] = [];
  for (const r of rows) {
    let d = days.find((x) => x.day === r.day);
    if (!d) { d = { day: r.day, members: [], total: 0, wanted: 0 }; days.push(d); }
    d.members.push(r); d.total += Number(r.cars) || 0; d.wanted += Number(r.wanted) || 0;
  }
  const today = todayRiyadh();

  return (
    <div dir="rtl" className="mx-auto max-w-lg px-4 pb-24 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => router.back()} className="rounded-lg p-1 text-muted hover:text-ink" aria-label="رجوع"><ChevronLeft size={22} /></button>
        <h1 className="flex items-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> نشاط المجموعة</h1>
      </div>

      {state === "loading" && <p className="py-16 text-center text-sm text-muted">جارٍ التحميل…</p>}
      {state === "no-team" && <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">إنت مش في مجموعة.</div>}
      {state === "not-leader" && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-sm text-ink">الصفحة دي لمسئول المجموعة بس — بيشوف فيها نشاط أعضاء مجموعته.</p>
        </div>
      )}

      {state === "ok" && (<>
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" /><p className="flex-1 text-xs font-bold text-danger">{error}</p>
          </div>
        )}

        {/* ① حالة كل مندوب */}
        <h2 className="mb-2 text-sm font-black text-ink">👥 أعضاء المجموعة</h2>
        {status.length === 0 && <p className="mb-4 text-xs text-muted">مفيش أعضاء.</p>}
        <div className="mb-5 space-y-2">
          {status.map((m) => {
            const online = isOnline(m.last_seen);
            const hasLoc = m.last_lat != null && m.last_lng != null;
            return (
              <div key={m.agent_id} className="rounded-2xl border border-border bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (online ? "bg-green-500" : "bg-slate-300")} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{m.username}</span>
                  <span className={"shrink-0 text-[11px] font-bold " + (online ? "text-green-600" : "text-muted")}>
                    {online ? "فاتح الآن" : `آخر ظهور ${since(m.last_seen)}`}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span>النهاردة: <b className="text-ink">{m.cars_today}</b></span>
                  <span>٧ أيام: <b className="text-ink">{m.cars_7d}</b></span>
                  <span>٣٠ يوم: <b className="text-ink">{m.cars_30d}</b> سيارة</span>
                  <span className="text-danger">مطلوبة (٣٠ي): <b>{m.wanted_30d}</b></span>
                  <span>أيام نزل: <b className="text-ink">{m.active_days_30d}</b></span>
                </div>
                <div className="mt-1.5">
                  {hasLoc ? (
                    <a href={`https://www.google.com/maps?q=${m.last_lat},${m.last_lng}`} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary underline">
                      <MapPin size={12} /> موقعه الحالي · {since(m.last_loc_at)}
                    </a>
                  ) : (
                    <span className="text-[11px] text-muted">📍 الموقع مش متاح</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ② المطلوب اللي اتلقى (المتصدَّر) */}
        <h2 className="mb-2 flex items-center gap-1 text-sm font-black text-ink"><AlertTriangle size={15} className="text-danger" /> المطلوب اللي اتلقى (آخر ٣٠ يوم)</h2>
        {wanted.length === 0 ? (
          <p className="mb-5 text-xs text-muted">مفيش مطلوبة اتلقت واتصدّرت في آخر ٣٠ يوم.</p>
        ) : (
          <div className="mb-5 space-y-1.5">
            {wanted.map((w, i) => (
              <div key={w.agent_id + w.plate + w.checked_at + i} className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-2">
                <PlateBadge value={w.plate} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-bold text-ink">{w.username}</p>
                  <p className="text-[10px] text-muted">{new Date(w.checked_at).toLocaleString("ar-EG", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                {w.maps_link
                  ? <a href={w.maps_link} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[11px] font-bold text-primary"><MapPin size={12} /> موقعها</a>
                  : <span className="shrink-0 text-[10px] text-muted">مفيش موقع</span>}
              </div>
            ))}
          </div>
        )}

        {/* ③ تفاصيل يومية */}
        <h2 className="mb-2 text-sm font-black text-ink">🗓️ التفاصيل اليومية (آخر ١٤ يوم)</h2>
        {days.length === 0 && <p className="text-xs text-muted">مفيش أي نشاط في آخر ١٤ يوم.</p>}
        {days.map((d) => (
          <div key={d.day} className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
              <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <CalendarDays size={15} className="text-primary" /> {fmtDay(d.day)}
                {d.day === today && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">النهاردة</span>}
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
                <Car size={13} /> {d.total} · <span className="text-danger">{d.wanted} مطلوبة</span>
              </span>
            </div>
            <div className="divide-y divide-border">
              {d.members.map((m) => (
                <div key={m.agent_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{m.username}</p>
                    <p className="flex items-center gap-1 text-[11px] text-muted">
                      <Clock size={11} /> {fmtTime(m.first_at)} ← {fmtTime(m.last_at)}
                      <span className="text-muted/70">· {fmtDur(m.first_at, m.last_at)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-black text-primary">{m.cars}<span className="mr-1 text-[10px] font-bold text-muted">سيارة</span></span>
                    {Number(m.wanted) > 0 && <div className="mt-0.5 text-[10px] font-bold text-danger">منهم {m.wanted} مطلوبة</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </>)}
    </div>
  );
}

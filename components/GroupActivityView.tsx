"use client";

/**
 * نشاط المجموعة — **للمسئول بس** (أو أدمن في المجموعة). بيتعرض في صفحة /group-activity وكتاب «تقرير النشاط» في
 * «إدارة مجموعتي». ٣ أقسام:
 *   ① حالة كل مندوب: فاتح دلوقتي ولا لأ + موقعه الحالي + إجمالي اليوم/٧/٣٠ يوم.
 *   ② المطلوب اللي اتلقى (المتصدَّر): لكل لوحة — مين + إمتى + فين، و**بالدوس عليها: تفاصيل العربية كاملة**.
 *   ③ تفاصيل يومية: مين نزل، بدأ الساعة كام، آخر تسجيل، كام سيارة، و**المطلوب بتاعه في اليوم ده** (بالدوس).
 * المالك (١١ أكتوبر ٢٠٢٦): «ولما يدخل علي اللوحات اللي طلعت مطلوبه معاهم يعرف كل لوحه ... ايه هيا وايمته لقاها
 * وتفاصيل اللوحه بالكامل». المصدر: my_team_member_status / my_team_wanted_found_v2 (ورجوع للقديمة) /
 * my_team_daily_activity. التوقيت بتوقيت السعودية.
 */
import { useState, useEffect } from "react";
import { CalendarDays, Clock, Car, AlertCircle, MapPin, AlertTriangle, ChevronDown } from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";

interface ActivityRow { agent_id: string; username: string; day: string; cars: number; wanted: number; first_at: string; last_at: string; }
interface StatusRow {
  agent_id: string; username: string; last_seen: string | null;
  last_lat: number | null; last_lng: number | null; last_loc_at: string | null;
  cars_today: number; cars_7d: number; cars_30d: number; wanted_30d: number; active_days_30d: number;
}
interface WantedRow {
  agent_id: string; username: string; plate: string; checked_at: string; maps_link: string | null;
  method?: string | null; extra?: Record<string, unknown> | null;
}

const TZ = "Asia/Riyadh";
const ONLINE_MS = 3 * 60 * 1000; // فاتح دلوقتي = آخر ظهور خلال ٣ دقايق

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleTimeString("ar-EG", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}
function fmtDay(day: string): string {
  try { return new Date(day + "T00:00:00Z").toLocaleDateString("ar-EG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); } catch { return day; }
}
function fmtFull(iso: string): string {
  try { return new Date(iso).toLocaleString("ar-EG", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); } catch { return iso; }
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
/** يوم اللقطة بتوقيت السعودية «2026-10-11» — نفس شكل `day` في التفاصيل اليومية. */
export function riyadhDayOf(iso: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)); } catch { return ""; }
}
/** تفاصيل العربية (بيانات ملف التشييك اللي اتحفظت مع السجل) — من غير الخانات الفاضية. */
export function wantedDetails(w: Pick<WantedRow, "extra">): [string, string][] {
  const e = w.extra && typeof w.extra === "object" ? w.extra : {};
  return Object.entries(e)
    .map(([k, v]) => [k, String(v ?? "").trim()] as [string, string])
    .filter(([k, v]) => k.trim() && v);
}

/** لوحة مطلوبة — بالدوس عليها بتفتح تفاصيلها كاملة. */
function WantedItem({ w }: { w: WantedRow }) {
  const [open, setOpen] = useState(false);
  const details = wantedDetails(w);
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-2 text-right">
        <PlateBadge value={w.plate} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-ink">{w.username}</p>
          <p className="text-[10px] text-muted">{new Date(w.checked_at).toLocaleString("ar-EG", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <ChevronDown size={15} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-danger/20 px-3 py-2 text-[11px]">
          <p className="text-ink"><span className="text-muted">لقاها:</span> <b>{w.username}</b></p>
          <p className="text-ink"><span className="text-muted">إمتى:</span> <b>{fmtFull(w.checked_at)}</b></p>
          {w.method && <p className="text-ink"><span className="text-muted">الطريقة:</span> <b>{w.method}</b></p>}
          {details.length > 0 && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface p-2">
              {details.map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-1"><span className="shrink-0 text-muted">{k}:</span><span className="truncate font-bold text-ink">{v}</span></div>
              ))}
            </div>
          )}
          {w.maps_link
            ? <a href={w.maps_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 font-bold text-primary"><MapPin size={12} /> مكانها على الخريطة</a>
            : <span className="text-muted">مفيش موقع</span>}
        </div>
      )}
    </div>
  );
}

export default function GroupActivityView() {
  const [state, setState] = useState<"loading" | "ok" | "no-team" | "not-leader" | "not-enabled" | "signed-out">("loading");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [status, setStatus] = useState<StatusRow[]>([]);
  const [wanted, setWanted] = useState<WantedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** «منهم N مطلوبة» المفتوح: `${agent}|${day}` */
  const [openDayWanted, setOpenDayWanted] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { userId } = await currentSession();
      if (!userId) { setState("signed-out"); return; }
      const { data: me } = await supabase.from("profiles").select("team, role").eq("id", userId).single();
      const prof = me as { team?: string | null; role?: string | null } | null;
      const team = prof?.team ?? null;
      if (!team) { setState("no-team"); return; }
      const { data: gs } = await supabase.from("group_settings").select("leader_id, activity_report_enabled").eq("team", team).maybeSingle();
      const g = gs as { leader_id?: string | null; activity_report_enabled?: boolean } | null;
      const isLeader = g?.leader_id === userId;
      const isAdmin = prof?.role === "admin";
      // مسئول المجموعة يشوفها بس لو السوبر أدمن فاتح «تقرير النشاط» لمجموعته.
      // الأدمن بيشوف أي مجموعة زي المعتاد.
      if (!isAdmin) {
        if (!isLeader) { setState("not-leader"); return; }
        if (!g?.activity_report_enabled) { setState("not-enabled"); return; }
      }

      const [act, st, wf2] = await Promise.all([
        supabase.rpc("my_team_daily_activity", { p_days: 14 }),
        supabase.rpc("my_team_member_status"),
        supabase.rpc("my_team_wanted_found_v2", { p_days: 30 }),
      ]);
      // تفاصيل العربية (v2) لسه ماتشغّلتش على السيرفر ⇒ القديمة من غير التفاصيل
      const wf = wf2.error ? await supabase.rpc("my_team_wanted_found", { p_days: 30 }) : wf2;
      if (act.error || st.error || wf.error) {
        setError("تعذّر تحميل النشاط: " + (act.error?.message || st.error?.message || wf.error?.message));
      }
      setRows((act.data ?? []) as ActivityRow[]);
      setStatus((st.data ?? []) as StatusRow[]);
      setWanted((wf.data ?? []) as WantedRow[]);
      setState("ok");
    })();
  }, []);

  const days: { day: string; members: ActivityRow[]; total: number; wanted: number }[] = [];
  for (const r of rows) {
    let d = days.find((x) => x.day === r.day);
    if (!d) { d = { day: r.day, members: [], total: 0, wanted: 0 }; days.push(d); }
    d.members.push(r); d.total += Number(r.cars) || 0; d.wanted += Number(r.wanted) || 0;
  }
  const today = todayRiyadh();

  return (
    <div>
      {state === "loading" && <p className="py-16 text-center text-sm text-muted">جارٍ التحميل…</p>}
      {state === "signed-out" && <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">سجّل الدخول الأول.</div>}
      {state === "no-team" && <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">إنت مش في مجموعة.</div>}
      {state === "not-leader" && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-sm text-ink">الصفحة دي لمسئول المجموعة بس — بيشوف فيها نشاط أعضاء مجموعته.</p>
        </div>
      )}
      {state === "not-enabled" && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-sm text-ink">تقرير النشاط لسه مش مفعّل لمجموعتك — كلّم الإدارة عشان يفتحوه ليك.</p>
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

        {/* ② المطلوب اللي اتلقى (المتصدَّر) — بالدوس: التفاصيل كاملة */}
        <h2 className="mb-2 flex items-center gap-1 text-sm font-black text-ink"><AlertTriangle size={15} className="text-danger" /> المطلوب اللي اتلقى (آخر ٣٠ يوم)</h2>
        {wanted.length === 0 ? (
          <p className="mb-5 text-xs text-muted">مفيش مطلوبة اتلقت واتصدّرت في آخر ٣٠ يوم.</p>
        ) : (
          <div className="mb-5 space-y-1.5">
            {wanted.map((w, i) => <WantedItem key={w.agent_id + w.plate + w.checked_at + i} w={w} />)}
          </div>
        )}

        {/* ③ تفاصيل يومية — «منهم N مطلوبة» بيفتح لوحات اليوم ده للمندوب ده */}
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
              {d.members.map((m) => {
                const key = `${m.agent_id}|${d.day}`;
                const dayWanted = wanted.filter((w) => w.agent_id === m.agent_id && riyadhDayOf(w.checked_at) === d.day);
                return (
                  <div key={m.agent_id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">{m.username}</p>
                        <p className="flex items-center gap-1 text-[11px] text-muted">
                          <Clock size={11} /> {fmtTime(m.first_at)} ← {fmtTime(m.last_at)}
                          <span className="text-muted/70">· {fmtDur(m.first_at, m.last_at)}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-left">
                        <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-black text-primary">{m.cars}<span className="mr-1 text-[10px] font-bold text-muted">سيارة</span></span>
                        {Number(m.wanted) > 0 && (
                          <button onClick={() => setOpenDayWanted((k) => (k === key ? null : key))}
                            className="mt-0.5 flex items-center gap-0.5 text-[10px] font-bold text-danger underline">
                            منهم {m.wanted} مطلوبة <ChevronDown size={11} className={openDayWanted === key ? "rotate-180" : ""} />
                          </button>
                        )}
                      </div>
                    </div>
                    {openDayWanted === key && (
                      <div className="mt-2 space-y-1.5">
                        {dayWanted.length === 0
                          ? <p className="text-[11px] text-muted">مفيش تفاصيل (اللوحات المصدَّرة بس بتظهر هنا).</p>
                          : dayWanted.map((w, i) => <WantedItem key={w.plate + w.checked_at + i} w={w} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </>)}
    </div>
  );
}

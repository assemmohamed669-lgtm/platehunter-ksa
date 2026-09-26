"use client";

/**
 * نشاط المجموعة اليومي — **للمسئول بس** (أو أدمن في المجموعة).
 * بيعرض كل يوم: مين من المجموعة نزل، بدأ الساعة كام، آخر تسجيل الساعة كام،
 * وكام سيارة سجّل. المصدر: RPC `my_team_daily_activity` (سجلات التشييك المتزامنة).
 * التوقيت بتوقيت السعودية.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, CalendarDays, Clock, Car, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";

interface ActivityRow {
  agent_id: string;
  username: string;
  day: string;        // YYYY-MM-DD بتوقيت السعودية
  cars: number;
  first_at: string;   // ISO timestamptz
  last_at: string;
}

const TZ = "Asia/Riyadh";

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("ar-EG", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

function fmtDay(day: string): string {
  try {
    // day = «YYYY-MM-DD» (تاريخ السعودية) — نعرضه بتوقيت UTC عشان مايزحلقش يوم.
    const d = new Date(day + "T00:00:00Z");
    return d.toLocaleDateString("ar-EG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  } catch { return day; }
}

function fmtDuration(firstIso: string, lastIso: string): string {
  try {
    const mins = Math.max(0, Math.round((new Date(lastIso).getTime() - new Date(firstIso).getTime()) / 60000));
    if (mins < 60) return `${mins} د`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h} س ${m} د` : `${h} س`;
  } catch { return "—"; }
}

/** اليوم الحالي بتوقيت السعودية بصيغة YYYY-MM-DD — لتمييز «النهاردة». */
function todayRiyadh(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return parts; // en-CA → YYYY-MM-DD
  } catch { return ""; }
}

export default function GroupActivityPage() {
  const router = useRouter();
  const [state, setState] = useState<null | "loading" | "ok" | "no-team" | "not-leader">("loading");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      const { data: me } = await supabase.from("profiles").select("team, role").eq("id", userId).single();
      const prof = me as { team?: string | null; role?: string | null } | null;
      const team = prof?.team ?? null;
      if (!team) { setState("no-team"); return; }

      // المسئول بتاع المجموعة أو أدمن — غير كده الصفحة مش ليه.
      const { data: gs } = await supabase.from("group_settings").select("leader_id").eq("team", team).maybeSingle();
      const leaderId = (gs as { leader_id?: string | null } | null)?.leader_id ?? null;
      const allowed = leaderId === userId || prof?.role === "admin";
      if (!allowed) { setState("not-leader"); return; }

      const { data, error: rpcErr } = await supabase.rpc("my_team_daily_activity", { p_days: 14 });
      if (rpcErr) { setError("تعذّر تحميل النشاط: " + rpcErr.message); setState("ok"); return; }
      setRows(((data ?? []) as ActivityRow[]));
      setState("ok");
    })();
  }, [router]);

  // تجميع الصفوف بالأيام (مرتبة تنازلي — الـRPC بيرجّعها كده أصلاً).
  const days: { day: string; members: ActivityRow[]; total: number }[] = [];
  for (const r of rows) {
    let d = days.find((x) => x.day === r.day);
    if (!d) { d = { day: r.day, members: [], total: 0 }; days.push(d); }
    d.members.push(r);
    d.total += Number(r.cars) || 0;
  }
  const today = todayRiyadh();

  return (
    <div dir="rtl" className="mx-auto max-w-lg px-4 pb-24 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => router.back()} className="rounded-lg p-1 text-muted hover:text-ink" aria-label="رجوع">
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex items-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> نشاط المجموعة اليومي</h1>
      </div>
      <p className="mb-4 text-[11px] text-muted">مين نزل كل يوم، بدأ الساعة كام، آخر تسجيل، وكام سيارة سجّل — بتوقيت السعودية. آخر ١٤ يوم.</p>

      {state === "loading" && <p className="py-16 text-center text-sm text-muted">جارٍ التحميل…</p>}

      {state === "no-team" && (
        <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
          إنت مش في مجموعة. تواصل مع الإدارة.
        </div>
      )}

      {state === "not-leader" && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-sm text-ink">الصفحة دي لمسئول المجموعة بس — بيشوف فيها نشاط أعضاء مجموعته اليومي.</p>
        </div>
      )}

      {state === "ok" && error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
          <p className="flex-1 text-xs font-bold text-danger">{error}</p>
        </div>
      )}

      {state === "ok" && !error && days.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
          مفيش أي نشاط مسجّل في آخر ١٤ يوم.
        </div>
      )}

      {state === "ok" && !error && days.map((d) => (
        <div key={d.day} className="mb-4 overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <CalendarDays size={15} className="text-primary" />
              {fmtDay(d.day)}
              {d.day === today && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">النهاردة</span>}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
              <Car size={13} /> {d.total.toLocaleString("en-US")} سيارة · {d.members.length} مندوب
            </span>
          </div>
          <div className="divide-y divide-border">
            {d.members.map((m) => (
              <div key={m.agent_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{m.username}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted">
                    <Clock size={11} />
                    {fmtTime(m.first_at)} ← {fmtTime(m.last_at)}
                    <span className="text-muted/70">· {fmtDuration(m.first_at, m.last_at)}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-primary/10 px-2.5 py-1 text-sm font-black text-primary">
                  {Number(m.cars).toLocaleString("en-US")}
                  <span className="mr-1 text-[10px] font-bold text-muted">سيارة</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

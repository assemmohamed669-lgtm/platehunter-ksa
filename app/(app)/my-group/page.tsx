"use client";

/**
 * 🧭 «إدارة مجموعتي» — مسئول المجموعة بيتحكّم في مجموعته بنفسه (المالك ١١ أكتوبر ٢٠٢٦). بتظهر في القايمة الجانبية بس
 * لو السوبر أدمن فاتحها للمجموعة (`leader_page_enabled`). كل الحفظ عن طريق `/api/group/leader-settings` (السيرفر
 * بيتأكد إنه المسئول والقايمة البيضا في `lib/leaderSettings.ts`). إضافة وشيل الأعضاء للسوبر أدمن بس.
 * تابات: «الإعدادات» و«شغل الأعضاء» (الفرز/المواقع/المشاركة — المالك ١٥ أكتوبر ٢٠٢٦، للكل) و«داتا الأعضاء» (ملف داتا لكل
 * عضو يفرز عليه بس — المالك ١٥ أكتوبر ٢٠٢٦، للكل) و«تقرير النشاط» (لو السوبر أدمن فاتحه للمجموعة).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Settings2, BarChart3, Users, AlertCircle, Activity, FolderLock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { currentSession } from "@/lib/authSession";
import GroupActivityView from "@/components/GroupActivityView";
import TeamWorkLog from "@/components/TeamWorkLog";
import MemberDataManager from "@/components/MemberDataManager";
import { switchActiveTeam } from "@/lib/activeTeamSwitch";
import type { LeaderView, NotifyMode } from "@/lib/leaderSettings";

interface LeaderGroup { team: string; settings: LeaderView; members: { id: string; username: string | null }[] }

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const at = data.session?.access_token;
  return at ? { Authorization: `Bearer ${at}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function Toggle({ on, label, help, busy, onChange }: { on: boolean; label: string; help: string; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="text-[11px] leading-relaxed text-muted">{help}</p>
      </div>
      <button disabled={busy} onClick={() => onChange(!on)}
        className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${on ? "bg-green-600 text-white" : "border border-border bg-surface-2 text-muted"}`}>
        {on ? "مفتوح ✓" : "مقفول"}
      </button>
    </div>
  );
}

export default function MyGroupPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const [groups, setGroups] = useState<LeaderGroup[]>([]);
  const [team, setTeam] = useState<string>("");
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [tab, setTab] = useState<"settings" | "work" | "memberData" | "activity">("settings");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/group/leader-settings", { headers: await authHeader(), cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      const gs = (j.groups ?? []) as LeaderGroup[];
      setGroups(gs);
      setActiveTeam(j.activeTeam ?? null);
      if (gs.length === 0) { setState("none"); return; }
      setTeam((cur) => (cur && gs.some((g) => g.team === cur) ? cur : (gs.find((g) => g.team === j.activeTeam)?.team ?? gs[0].team)));
      setState("ok");
    } catch { setState("none"); }
  }, []);

  useEffect(() => {
    (async () => {
      const { userId, signedOut } = await currentSession();
      if (!userId) { if (signedOut) router.replace("/login"); return; }
      void load();
    })();
  }, [router, load]);

  const g = groups.find((x) => x.team === team) ?? null;

  /** حفظ تغيير واحد على السيرفر (تفاؤلي — بيرجع لو فشل). */
  async function save(patch: Record<string, unknown>, optimistic: Partial<LeaderView>) {
    if (!g || busy) return;
    const before = g.settings;
    setGroups((list) => list.map((x) => (x.team === g.team ? { ...x, settings: { ...x.settings, ...optimistic } } : x)));
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/group/leader-settings", {
        method: "POST", headers: await authHeader(), body: JSON.stringify({ team: g.team, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "تعذّر الحفظ");
      setGroups((list) => list.map((x) => (x.team === g.team ? { ...x, settings: j.settings as LeaderView } : x)));
      setMsg("اتحفظ ✓");
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      setGroups((list) => list.map((x) => (x.team === g.team ? { ...x, settings: before } : x)));
      setMsg("تعذّر الحفظ: " + ((e as Error)?.message ?? ""));
    } finally { setBusy(false); }
  }

  function setNotify(mode: NotifyMode, ids?: string[]) {
    if (!g) return;
    const chosen = ids ?? g.settings.notifyMemberIds;
    void save({ notifyMode: mode, notifyMemberIds: chosen }, { notifyMode: mode, notifyMemberIds: mode === "chosen" ? chosen : [] });
  }
  function toggleChosen(id: string) {
    if (!g) return;
    const cur = new Set(g.settings.notifyMemberIds);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setNotify("chosen", [...cur]);
  }

  return (
    <div dir="rtl" className="mx-auto max-w-lg px-4 pb-24 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => router.back()} className="rounded-lg p-1 text-muted hover:text-ink" aria-label="رجوع"><ChevronLeft size={22} /></button>
        <h1 className="flex items-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> إدارة مجموعتي</h1>
      </div>

      {state === "loading" && <p className="py-16 text-center text-sm text-muted">جارٍ التحميل…</p>}
      {state === "none" && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-sm text-ink">الصفحة دي لمسئول المجموعة — بتتفتح لما الإدارة تفعّلها لمجموعتك.</p>
        </div>
      )}

      {state === "ok" && g && (<>
        {groups.length > 1 && (
          <label className="mb-3 flex items-center gap-2 text-xs font-bold text-ink">
            المجموعة:
            <select value={team} onChange={(e) => setTeam(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-ink">
              {groups.map((x) => <option key={x.team} value={x.team}>{x.team}</option>)}
            </select>
          </label>
        )}
        <p className="mb-3 text-center text-[11px] text-muted">مجموعة «{g.team}» — {g.members.length} عضو · إضافة وشيل الأعضاء من الإدارة</p>

        {/* التابات */}
        <div className={`mb-3 grid ${g.settings.activityReport ? "grid-cols-4" : "grid-cols-3"} gap-1.5 rounded-2xl border border-border bg-surface-2 p-1.5`}>
          <button onClick={() => setTab("settings")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-bold leading-tight ${tab === "settings" ? "bg-primary text-night" : "text-muted"}`}>
            <Settings2 size={15} /> الإعدادات
          </button>
          <button onClick={() => setTab("work")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-bold leading-tight ${tab === "work" ? "bg-primary text-night" : "text-muted"}`}>
            <Activity size={15} /> شغل الأعضاء
          </button>
          <button onClick={() => setTab("memberData")}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-bold leading-tight ${tab === "memberData" ? "bg-primary text-night" : "text-muted"}`}>
            <FolderLock size={15} /> داتا الأعضاء
          </button>
          {g.settings.activityReport && (
            <button onClick={() => setTab("activity")}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-bold leading-tight ${tab === "activity" ? "bg-primary text-night" : "text-muted"}`}>
              <BarChart3 size={15} /> تقرير النشاط
            </button>
          )}
        </div>

        {msg && <p className={`mb-2 text-center text-xs font-bold ${msg.startsWith("اتحفظ") ? "text-green-600" : "text-danger"}`}>{msg}</p>}

        {tab === "settings" && (
          <div className="flex flex-col gap-2.5">
            {/* إشعارات السيارات المطلوبة: للكل / لأعضاء أختارهم / مقفولة */}
            <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
              <p className="text-sm font-bold text-ink">إشعارات السيارات المطلوبة</p>
              <p className="mb-2 text-[11px] leading-relaxed text-muted">لما عضو يلاقي عربية مطلوبة — مين من المجموعة يوصله الإشعار.</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([["all", "للكل"], ["chosen", "أعضاء أختارهم"], ["off", "مقفولة"]] as [NotifyMode, string][]).map(([m, label]) => (
                  <button key={m} disabled={busy} onClick={() => setNotify(m)}
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${g.settings.notifyMode === m ? "border-primary bg-primary/15 text-primary" : "border-border text-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {g.settings.notifyMode === "chosen" && (
                <div className="mt-2 flex flex-col gap-1">
                  {g.members.map((m) => {
                    const sel = g.settings.notifyMemberIds.includes(m.id);
                    return (
                      <button key={m.id} disabled={busy} onClick={() => toggleChosen(m.id)}
                        className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-right text-xs transition disabled:opacity-50 ${sel ? "border-primary bg-primary/10 font-bold text-ink" : "border-border text-muted"}`}>
                        {m.username ?? "—"} <span>{sel ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Toggle on={g.settings.findsLeaderOnly} busy={busy} label="إشعار المطلوب للمسئول بس"
              help="أي عربية مطلوبة عضو يلاقيها بتوصلك إنت بس في نفس اللحظة (بيغلب اللي فوق)."
              onChange={(v) => void save({ findsLeaderOnly: v }, { findsLeaderOnly: v })} />

            <Toggle on={g.settings.shareRecords} busy={busy} label="مشاركة السجلات"
              help="مفتوحة: سجلات كل الأعضاء بتظهر للكل. مقفولة: كل السجلات بتبقى عندك إنت بس."
              onChange={(v) => void save({ shareRecords: v }, { shareRecords: v })} />
            <Toggle on={!g.settings.shareRecords} busy={busy} label="السجلات للمسئول بس"
              help="نفس «مشاركة السجلات» بالعكس — مفتوحة: السجلات ليك إنت بس ومش ظاهرة للأعضاء."
              onChange={(v) => void save({ shareRecords: !v }, { shareRecords: !v })} />

            <Toggle on={g.settings.sharedCheck} busy={busy} label="رفع ملف التشييك للمجموعة"
              help="مفتوح: ملف التشييك اللي بترفعه بيوصل لكل الأعضاء. مقفول: كل عضو بيرفع ملفه بإيده."
              onChange={(v) => void save({ sharedCheck: v }, { sharedCheck: v })} />

            <Toggle on={g.settings.lockSort} busy={busy} label="الأعضاء مايفرزوش"
              help="مفتوح: ولا عضو يقدر يفرز. مقفول: بيفرزوا عادي."
              onChange={(v) => void save({ lockSort: v }, { lockSort: v })} />
            <Toggle on={g.settings.lockDownload} busy={busy} label="الأعضاء مايحمّلوش السجلات"
              help="تحميل ومشاركة السجلات مقفولين عن الأعضاء."
              onChange={(v) => void save({ lockDownload: v }, { lockDownload: v })} />
            <Toggle on={g.settings.lockEdit} busy={busy} label="الأعضاء مايعدّلوش السجلات"
              help="تعديل ومسح السجلات مقفولين عن الأعضاء."
              onChange={(v) => void save({ lockEdit: v }, { lockEdit: v })} />
          </div>
        )}

        {/* 🧭 الفرز وفتح المواقع والمشاركة لكل عضو — أعضاء المجموعة دي بس */}
        {tab === "work" && <TeamWorkLog team={g.team} members={g.members} />}
        {tab === "memberData" && <MemberDataManager team={g.team} />}

        {tab === "activity" && g.settings.activityReport && (
          activeTeam === g.team ? (
            <GroupActivityView />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-4 text-center">
              <p className="mb-2 text-sm text-ink">تقرير النشاط بيتعرض للمجموعة اللي شغّال لها — إنت دلوقتي شغّال لـ«{activeTeam ?? "—"}».</p>
              <button disabled={busy} onClick={async () => {
                setBusy(true);
                const r = await switchActiveTeam(activeTeam, g.team);
                if (r.ok) window.location.reload(); else { setBusy(false); setMsg("تعذّر: " + (r.error ?? "")); }
              }} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-night disabled:opacity-50">
                اشتغل لـ«{g.team}» وافتح التقرير
              </button>
            </div>
          )
        )}
      </>)}
    </div>
  );
}

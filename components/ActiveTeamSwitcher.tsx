"use client";

/**
 * 👥 «شغّال لـ ▾» — بيظهر **بس** للمندوب اللي عضو في أكتر من مجموعة (المالك ١١ أكتوبر ٢٠٢٦). المندوب في مجموعة
 * واحدة (أو من غير مجموعة) مابيشوفش أي حاجة جديدة. القلب: `lib/activeTeamSwitch.ts` وبعدين إعادة فتح الصفحة
 * عشان كل حاجة (السجلات/الفرز/الصلاحيات/ملف التشييك) تبقى بتاعة المجموعة الجديدة.
 */
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { switchActiveTeam } from "@/lib/activeTeamSwitch";

export default function ActiveTeamSwitcher() {
  const [teams, setTeams] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (!uid) return;
        const [{ data: prof }, tm] = await Promise.all([
          supabase.from("profiles").select("team").eq("id", uid).single(),
          supabase.from("team_members").select("team").eq("agent_id", uid),
        ]);
        if (!alive || tm.error) return;
        setActive((prof as { team?: string | null } | null)?.team ?? null);
        setTeams([...new Set((tm.data ?? []).map((r: { team: string }) => r.team))].sort());
      } catch { /* مافيش نت — مايظهرش */ }
    })();
    return () => { alive = false; };
  }, []);

  if (teams.length < 2) return null;

  async function choose(t: string) {
    if (t === active || busy) return;
    if (!confirm(`هتشتغل لمجموعة «${t}»؟\nسجلات وفرز وإشعارات وملف تشييك المجموعة هيبقوا بتوعها. سجلاتك إنت مابتتمسحش.`)) return;
    setBusy(true);
    const r = await switchActiveTeam(active, t);
    if (!r.ok) { alert("تعذّر التغيير: " + (r.error ?? "")); setBusy(false); return; }
    window.location.reload();
  }

  return (
    <label className="mb-2 flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
      <Users size={15} className="shrink-0" />
      <span className="shrink-0">شغّال لـ:</span>
      <select value={active ?? ""} disabled={busy} onChange={(e) => void choose(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink">
        {teams.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  );
}

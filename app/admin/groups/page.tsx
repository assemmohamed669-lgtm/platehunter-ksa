"use client";

/**
 * صفحة المجموعات — للسوبر أدمن بس. يحدّد مين في أي مجموعة (profiles.team).
 * المناديب اللي في نفس المجموعة بيوصلهم لقطات بعض لحظيًا، وبيشوفوا سجلات بعض.
 * الإضافة = تحط للمندوب اسم المجموعة؛ الشيل = تفضّي المجموعة؛ النقل = تغيّر الاسم.
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, Save, Search, X, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface Agent { id: string; username: string; team: string | null; }

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export default function GroupsPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("id, username, team, role")
      .eq("role", "agent").order("username", { ascending: true });
    if (data) setAgents((data as (Agent & { role: string })[]).map(({ id, username, team }) => ({ id, username, team })));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", data.user.id).single();
      // سوبر أدمن بس بيحدّد المجموعات.
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/admin"); return; }
      setAuthorized(true);
      load();
    })();
  }, [router, load]);

  async function setTeam(a: Agent, team: string) {
    setBusy(a.id);
    try {
      const res = await fetch("/api/admin/manage-agent", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ agentId: a.id, action: "setTeam", team }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error ?? "تعذّر الحفظ."); return; }
      const clean = team.trim() || null;
      setAgents((as) => as.map((x) => (x.id === a.id ? { ...x, team: clean } : x)));
      setDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    } catch { alert("تعذّر الاتصال بالخادم."); }
    finally { setBusy(null); }
  }

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  // المجموعات الموجودة (لاقتراحها + الملخّص).
  const teams = Array.from(new Set(agents.map((a) => a.team).filter((t): t is string => !!t))).sort();
  const q = search.trim().toLowerCase();
  const shown = q ? agents.filter((a) => a.username?.toLowerCase().includes(q) || (a.team ?? "").toLowerCase().includes(q)) : agents;
  const grouped = shown.filter((a) => a.team);
  const unassigned = shown.filter((a) => !a.team);

  const AgentRow = (a: Agent) => {
    const val = draft[a.id] !== undefined ? draft[a.id] : (a.team ?? "");
    const changed = draft[a.id] !== undefined && draft[a.id].trim() !== (a.team ?? "");
    return (
      <div key={a.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-ink" title={a.username}>{a.username}</span>
        <input list="teams-list" value={val} onChange={(e) => setDraft((d) => ({ ...d, [a.id]: e.target.value }))}
          placeholder="اسم المجموعة" dir="rtl"
          className="w-32 shrink-0 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink focus:outline-none focus:border-primary" />
        <button onClick={() => setTeam(a, draft[a.id] ?? a.team ?? "")} disabled={!changed || busy === a.id}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg bg-primary px-2 text-[11px] font-bold text-night transition disabled:opacity-40" title="حفظ المجموعة">
          <Save size={12} /> حفظ
        </button>
        {a.team && (
          <button onClick={() => { if (confirm(`تشيل «${a.username}» من مجموعة «${a.team}»؟`)) setTeam(a, ""); }} disabled={busy === a.id}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted transition hover:text-danger disabled:opacity-40" title="شيل من المجموعة">
            <X size={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-night pb-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.push("/admin")}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted transition hover:text-ink">
            <ChevronLeft size={15} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="flex items-center justify-center gap-1.5 text-lg font-bold text-ink"><Users size={18} /> المجموعات</h1>
            <p className="text-[11px] text-muted">مين مع مين — للسوبر أدمن</p>
          </div>
          <span className="w-[52px]" />
        </div>

        <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
          اكتب اسم المجموعة قدام المندوب واحفظ عشان **تضيفه**. زر ✕ **يشيله** من مجموعته. غيّر الاسم عشان **تنقله**. اللي نفس الاسم = نفس المجموعة (بيوصلهم لقطات بعض ويشوفوا سجلات بعض).
        </p>

        <datalist id="teams-list">{teams.map((t) => <option key={t} value={t} />)}</datalist>

        {/* ملخّص المجموعات */}
        {teams.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => (
              <span key={t} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                {t} ({agents.filter((a) => a.team === t).length})
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المندوب أو المجموعة..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}

        {/* المناديب داخل مجموعات */}
        {!loading && teams.filter((t) => grouped.some((a) => a.team === t)).map((t) => (
          <div key={t} className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><Users size={15} className="text-primary" /> {t} <span className="text-[11px] font-normal text-muted">({agents.filter((a) => a.team === t).length})</span></div>
            <div className="flex flex-col gap-1.5">{grouped.filter((a) => a.team === t).map(AgentRow)}</div>
          </div>
        ))}

        {/* مناديب بدون مجموعة */}
        {!loading && unassigned.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-muted"><UserPlus size={15} /> بدون مجموعة <span className="text-[11px] font-normal">({unassigned.length})</span></div>
            <div className="flex flex-col gap-1.5">{unassigned.map(AgentRow)}</div>
          </div>
        )}

        {!loading && shown.length === 0 && <p className="py-8 text-center text-sm text-muted">لا توجد نتائج.</p>}
      </div>
    </main>
  );
}

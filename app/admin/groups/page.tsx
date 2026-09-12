"use client";

/**
 * صفحة المجموعات — للسوبر أدمن بس. منظّمة على شكل مربعات:
 *  • زر «إنشئ مجموعة جديدة» → تسمّي المجموعة وتختار مين فيها وتحفظ → يتعمل مربع باسمها.
 *  • تفتح المربع → تشوف أعضاءها، تضيف (زر إضافة) أو تشيل (بتأكيد)، وتدوس «حفظ»
 *    فتتحفظ كل التغييرات مرة واحدة.
 * العضوية = profiles.team. المندوب في مجموعة واحدة؛ إضافته لمجموعة بتنقله من القديمة.
 * اللي يتضاف بيشوف سجلات المجموعة تلقائيًا (لما تنزل ميزة السجلات المشتركة).
 */
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Users, Plus, X, Search, Trash2, UserPlus, ChevronDown, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { GROUP_ELIGIBLE_ROLES, memberBadge, membersLabel } from "@/lib/groupMembers";

interface Agent { id: string; username: string; team: string | null; role: string | null; }

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
  const [busy, setBusy] = useState(false);

  // إنشاء مجموعة
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSel, setCreateSel] = useState<Set<string>>(new Set());
  const [createSearch, setCreateSearch] = useState("");

  // فتح/تعديل مجموعة (تغييرات معلّقة لحد ما تدوس حفظ)
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [editSet, setEditSet] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    // الأدمنز كمان ينفع يبقوا في مجموعة — الباك إند بيدعمهم من الأصل
    // (setTeam بلا فلتر دور، وmy_team_members بترجّع أي حد بنفس الـteam).
    const { data } = await supabase.from("profiles").select("id, username, team, role")
      .in("role", [...GROUP_ELIGIBLE_ROLES]).order("username", { ascending: true });
    if (data) setAgents((data as Agent[]).map(({ id, username, team, role }) => ({ id, username, team, role })));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (prof?.role !== "admin" || !prof?.is_super) { router.replace("/admin"); return; }
      setAuthorized(true);
      load();
    })();
  }, [router, load]);

  const nameOf = (id: string) => agents.find((a) => a.id === id)?.username ?? id;
  const teams = Array.from(new Set(agents.map((a) => a.team).filter((t): t is string => !!t))).sort();
  const membersOf = (t: string) => agents.filter((a) => a.team === t);

  // يطبّق setTeam على مجموعة من المناديب بالتتابع.
  async function setTeamFor(ids: string[], team: string) {
    for (const id of ids) {
      const res = await fetch("/api/admin/manage-agent", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ agentId: id, action: "setTeam", team }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? "تعذّر الحفظ."); }
    }
  }

  // ── إنشاء مجموعة ──
  function openCreate() { setCreateName(""); setCreateSel(new Set()); setCreateSearch(""); setCreateOpen(true); }
  async function saveCreate() {
    const name = createName.trim();
    if (!name) { alert("اكتب اسم المجموعة."); return; }
    if (createSel.size === 0) { alert("اختار مندوب واحد على الأقل."); return; }
    setBusy(true);
    try { await setTeamFor([...createSel], name); await load(); setCreateOpen(false); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  // ── فتح/تعديل مجموعة ──
  function expand(t: string) {
    if (openGroup === t) { setOpenGroup(null); return; }
    setOpenGroup(t); setEditSet(new Set(membersOf(t).map((a) => a.id))); setAddOpen(false); setAddSearch("");
  }
  async function saveGroup() {
    if (!openGroup) return;
    const current = new Set(membersOf(openGroup).map((a) => a.id));
    const added = [...editSet].filter((id) => !current.has(id));
    const removed = [...current].filter((id) => !editSet.has(id));
    if (added.length === 0 && removed.length === 0) { setOpenGroup(null); return; }
    setBusy(true);
    try {
      if (added.length) await setTeamFor(added, openGroup);
      if (removed.length) await setTeamFor(removed, "");     // "" = يتشال من المجموعة
      await load(); setOpenGroup(null);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  return (
    <main className="min-h-screen bg-night pb-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5">
        {/* Header */}
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

        {/* زر إنشاء مجموعة */}
        <button onClick={openCreate}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition active:scale-[0.99]">
          <Plus size={17} /> إنشئ مجموعة جديدة
        </button>

        {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}

        {/* مربعات المجموعات */}
        {!loading && teams.length === 0 && (
          <p className="rounded-xl border border-border bg-surface px-3 py-6 text-center text-sm text-muted">
            لسه مفيش مجموعات. دوس «إنشئ مجموعة جديدة» وابدأ.
          </p>
        )}

        {!loading && teams.map((t) => {
          const members = membersOf(t);
          const isOpen = openGroup === t;
          // اللي ينفع يتضافوا = مش في المجموعة دي حاليًا (لو في مجموعة تانية بيتنقلوا).
          const addable = agents.filter((a) => !editSet.has(a.id));
          const q = addSearch.trim().toLowerCase();
          const addableShown = q ? addable.filter((a) => a.username?.toLowerCase().includes(q)) : addable;
          return (
            <div key={t} className="rounded-2xl border border-border bg-surface">
              {/* رأس المربع — اسم المجموعة + العدد */}
              <button onClick={() => expand(t)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right">
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><Users size={16} className="text-primary" /> {t}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">{membersLabel(members)}</span>
                  <ChevronDown size={16} className={`text-muted transition ${isOpen ? "rotate-180" : ""}`} />
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-3">
                  {/* الأعضاء (المعلّقين) */}
                  <div className="flex flex-col gap-1.5">
                    {[...editSet].length === 0 && <p className="text-[11px] text-muted">مفيش أعضاء — أضف مناديب.</p>}
                    {[...editSet].map((id) => (
                      <div key={id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{nameOf(id)}</span>
                        <button
                          onClick={() => { if (confirm(`تشيل «${nameOf(id)}» من مجموعة «${t}»؟`)) setEditSet((s) => { const n = new Set(s); n.delete(id); return n; }); }}
                          className="flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-[11px] font-bold text-muted transition hover:border-danger/50 hover:text-danger" title="شيل من المجموعة">
                          <Trash2 size={12} /> شيل
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* زر إضافة + قائمة الإضافة */}
                  <button onClick={() => { setAddOpen((v) => !v); setAddSearch(""); }}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 py-2 text-xs font-bold text-primary transition hover:bg-primary/20">
                    <UserPlus size={14} /> إضافة مندوب
                  </button>
                  {addOpen && (
                    <div className="mt-2 rounded-lg border border-border bg-surface-2 p-2">
                      <div className="relative mb-2">
                        <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
                        <input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="ابحث بالاسم..."
                          className="w-full rounded-lg border border-border bg-surface py-1.5 pr-8 pl-3 text-xs text-ink focus:outline-none focus:border-primary" />
                      </div>
                      <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
                        {addableShown.length === 0 && <p className="py-2 text-center text-[11px] text-muted">مفيش مناديب.</p>}
                        {addableShown.map((a) => (
                          <button key={a.id} onClick={() => setEditSet((s) => new Set(s).add(a.id))}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right transition hover:bg-surface">
                            <span className="min-w-0 flex-1 truncate text-xs text-ink">{a.username}
                              {a.team && a.team !== t && <span className="mr-1 text-[10px] text-amber-500">(في «{a.team}» — هينتقل)</span>}
                            </span>
                            <Plus size={14} className="shrink-0 text-primary" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* حفظ / إلغاء */}
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => setOpenGroup(null)} disabled={busy}
                      className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted disabled:opacity-50">إلغاء</button>
                    <button onClick={saveGroup} disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-50">
                      <Save size={15} /> {busy ? "جارٍ..." : "حفظ التغييرات"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* مودال إنشاء مجموعة */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => !busy && setCreateOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">مجموعة جديدة</h3>
              <button onClick={() => setCreateOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <label className="mb-1 text-[11px] font-bold text-muted">اسم المجموعة</label>
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="مثلاً: فريق ١" dir="rtl"
              className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
            <label className="mb-1 text-[11px] font-bold text-muted">اختار مين في المجموعة ({createSel.size})</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={createSearch} onChange={(e) => setCreateSearch(e.target.value)} placeholder="ابحث بالاسم..."
                className="w-full rounded-lg border border-border bg-surface-2 py-2 pr-8 pl-3 text-xs text-ink focus:outline-none focus:border-primary" />
            </div>
            <div className="mb-3 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2">
              {agents
                .filter((a) => { const q = createSearch.trim().toLowerCase(); return !q || a.username?.toLowerCase().includes(q); })
                .map((a) => {
                  const on = createSel.has(a.id);
                  return (
                    <button key={a.id} onClick={() => setCreateSel((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-right transition ${on ? "border-primary bg-primary/10" : "border-transparent hover:bg-surface"}`}>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink">{a.username}
                        {memberBadge(a.role) && <span className="mr-1 rounded px-1 py-0.5 text-[10px] font-bold text-primary bg-primary/10">{memberBadge(a.role)}</span>}
                        {a.team && <span className="mr-1 text-[10px] text-amber-500">(في «{a.team}» — هينتقل)</span>}
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? "border-primary bg-primary text-night" : "border-border"}`}>{on && "✓"}</span>
                    </button>
                  );
                })}
            </div>
            <button onClick={saveCreate} disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60">
              <Save size={15} /> {busy ? "جارٍ..." : "حفظ المجموعة"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

/**
 * /admin/accounts — «حسابات المناديب» (لأي أدمن).
 *
 * لكل مندوب مربعين مباشرين: «دفع» (المدفوع الشهر ده) و«عليه» (المتبقّي عليه)،
 * تكتبهم وتحفظ، وفوق يتجمّع اللي اتلمّ. كمان: أيام الاشتراك الباقية، فتح/قفل
 * الصوت والبرنامج، ملاحظة خاصة بالأدمن، ورسالة تظهر للمندوب بالأحمر.
 *
 * «دفع» بيتخزّن في agent_payments (صف إجمالي للشهر). «عليه» رقم على profiles.
 * كله عبر /api/admin/payments و /api/admin/manage-agent (service role).
 * ⚠️ لازم تشغّل docs/sql/agent-payments.sql ثم docs/sql/agent-owed.sql مرة واحدة.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Search, Wallet, MessageCircle, X, Trash2,
  Coins, AlertCircle, Save, CircleUserRound, Mic, LayoutGrid, Megaphone, CalendarClock,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus } from "@/lib/subscription";
import { PLAN_LABEL, effectiveFee, agentPlanOf, monthKey, type Plan } from "@/lib/agentBilling";

interface Agent {
  id: string;
  username: string;
  phone: string | null;
  role: "admin" | "agent";
  is_active: boolean;
  subscription_end: string | null;
  voicex_enabled?: boolean | null;
  rest_pages_enabled?: boolean | null;
  owed_amount?: number | null;
  payment_note?: string | null;
  agent_notice?: string | null;
}

interface Payment { id: string; agent_id: string; amount: number; paid_at: string; }

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function shiftMonth(mk: string, delta: number): string {
  const [y, m] = mk.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(mk: string): string {
  const [y, m] = mk.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}
const fmt = (n: number) => n.toLocaleString("ar-EG");

function waDigits(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d || null;
}
const planFeeOf = (a: Agent) => effectiveFee({ voicex_enabled: a.voicex_enabled, rest_pages_enabled: a.rest_pages_enabled, monthly_fee: null });

const PLAN_BADGE: Record<Plan, string> = {
  all: "bg-primary/15 text-primary",
  voice: "bg-brand/15 text-brand",
  basic: "bg-muted/15 text-muted",
};

type PayFilter = "all" | "unpaid" | "paid";
type SubFilter = "all" | "active" | "expiring" | "expired";

export default function AdminAccounts() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [month, setMonth] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // الافتراضي: اللي لسه عليه فلوس بس — اللي دفع كامل (دفع ومفيش عليه) يختفي من
  // الصفحة تلقائيًا. تقدر تشوفهم من فلتر «خالص» أو «الكل».
  const [payFilter, setPayFilter] = useState<PayFilter>("unpaid");
  const [subFilter, setSubFilter] = useState<SubFilter>("all");

  // مسوّدات التعديل لكل مندوب.
  const [paidDraft, setPaidDraft] = useState<Record<string, string>>({});
  const [owedDraft, setOwedDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [msgDraft, setMsgDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({}); // key → تأكيد مؤقت

  const patchAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setAgents((as) => as.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }, []);
  const showFlash = useCallback((key: string, msg: string) => {
    setFlash((f) => ({ ...f, [key]: msg }));
    setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[key]; return n; }), 2500);
  }, []);

  const loadAgents = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("*").order("username", { ascending: true });
    if (data) setAgents((data as Agent[]).filter((a) => a.role === "agent"));
  }, []);

  const loadPayments = useCallback(async (mk: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/payments?month=${mk}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) { setLoadError(json.error ?? "تعذّر التحميل."); setPayments([]); }
      else setPayments((json.payments ?? []) as Payment[]);
    } catch { setLoadError("تعذّر الاتصال بالخادم."); setPayments([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      if (prof?.role !== "admin") { router.replace("/sorting"); return; }
      setAuthorized(true);
      await loadAgents();
    })();
  }, [router, loadAgents]);

  useEffect(() => { if (authorized) void loadPayments(month); }, [authorized, month, loadPayments]);

  const paidByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.agent_id, (m.get(p.agent_id) ?? 0) + Number(p.amount || 0));
    return m;
  }, [payments]);

  const subCounts = useMemo(() => {
    let active = 0, expiring = 0, expired = 0;
    for (const a of agents) {
      const s = subStatus(a.subscription_end).status;
      if (s === "active") active++;
      else if (s === "expiring" || s === "grace") expiring++;
      else if (s === "expired") expired++;
    }
    return { active, expiring, expired };
  }, [agents]);

  const collected = useMemo(() => payments.reduce((s, p) => s + Number(p.amount || 0), 0), [payments]);
  const totalOwed = useMemo(() => agents.reduce((s, a) => s + Number(a.owed_amount || 0), 0), [agents]);
  const paidCount = useMemo(() => agents.filter((a) => (paidByAgent.get(a.id) ?? 0) > 0).length, [agents, paidByAgent]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .map((a) => {
        const paid = paidByAgent.get(a.id) ?? 0;
        const owed = Number(a.owed_amount || 0);
        const pstatus = paid <= 0 ? "unpaid" : owed > 0 ? "partial" : "paid";
        const sub = subStatus(a.subscription_end);
        return { a, paid, owed, pstatus, sub };
      })
      .filter(({ a, pstatus, sub }) => {
        if (q && !(a.username?.toLowerCase().includes(q) || a.phone?.includes(q))) return false;
        if (payFilter === "paid" && pstatus !== "paid") return false;
        if (payFilter === "unpaid" && pstatus === "paid") return false;
        if (subFilter === "active" && sub.status !== "active") return false;
        if (subFilter === "expiring" && !(sub.status === "expiring" || sub.status === "grace")) return false;
        if (subFilter === "expired" && sub.status !== "expired") return false;
        return true;
      })
      .sort((x, y) => {
        const w = (s: string) => (s === "unpaid" ? 0 : s === "partial" ? 1 : 2);
        return w(x.pstatus) - w(y.pstatus) || (x.a.username ?? "").localeCompare(y.a.username ?? "");
      });
  }, [agents, paidByAgent, search, payFilter, subFilter]);

  async function postPay(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/payments", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const json = await res.json();
      return res.ok ? { ok: true } : { ok: false, error: json.error };
    } catch { return { ok: false, error: "تعذّر الاتصال بالخادم." }; }
  }
  async function manageAgent(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/manage-agent", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const json = await res.json();
      return res.ok ? { ok: true } : { ok: false, error: json.error };
    } catch { return { ok: false, error: "تعذّر الاتصال بالخادم." }; }
  }

  // ── «دفع» + «عليه» ──
  async function saveBilling(a: Agent) {
    const paidNow = paidByAgent.get(a.id) ?? 0;
    const pd = paidDraft[a.id];
    const od = owedDraft[a.id];
    const paidChanged = pd !== undefined && pd !== (paidNow > 0 ? String(paidNow) : "");
    const owedChanged = od !== undefined && od !== (a.owed_amount != null ? String(a.owed_amount) : "");
    if (!paidChanged && !owedChanged) return;
    setBusy(`bill:${a.id}`);
    if (paidChanged) {
      const r = await postPay({ action: "setPaid", agentId: a.id, month, amount: pd });
      if (!r.ok) { setBusy(null); alert(r.error ?? "تعذّر حفظ «دفع»."); return; }
    }
    if (owedChanged) {
      const r = await postPay({ action: "setOwed", agentId: a.id, amount: od });
      if (!r.ok) { setBusy(null); alert(r.error ?? "تعذّر حفظ «عليه»."); return; }
      patchAgent(a.id, { owed_amount: od === "" ? null : Number(od) });
    }
    setBusy(null);
    setPaidDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    setOwedDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    if (paidChanged) await loadPayments(month);
    showFlash(`bill:${a.id}`, "اتسجّل ✓");
  }

  // ── ملاحظة الأدمن الخاصة ──
  async function saveNote(a: Agent) {
    const note = noteDraft[a.id] ?? "";
    setBusy(`note:${a.id}`);
    const r = await postPay({ action: "setNote", agentId: a.id, note });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر الحفظ."); return; }
    patchAgent(a.id, { payment_note: note.trim() || null });
    setNoteDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    showFlash(`note:${a.id}`, "اتحفظت ✓");
  }
  async function clearNote(a: Agent) {
    if (!(a.payment_note || noteDraft[a.id])) return;
    setBusy(`note:${a.id}`);
    const r = await postPay({ action: "setNote", agentId: a.id, note: "" });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر المسح."); return; }
    patchAgent(a.id, { payment_note: null });
    setNoteDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    showFlash(`note:${a.id}`, "اتمسحت ✓");
  }

  // ── رسالة المندوب (بالأحمر عنده) ──
  async function saveMsg(a: Agent) {
    const notice = msgDraft[a.id] ?? "";
    setBusy(`msg:${a.id}`);
    const r = await manageAgent({ agentId: a.id, action: "setAgentNotice", notice });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر الحفظ."); return; }
    patchAgent(a.id, { agent_notice: notice.trim() || null });
    setMsgDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    showFlash(`msg:${a.id}`, notice.trim() ? "وصلت للمندوب ✓" : "اتمسحت ✓");
  }
  async function clearMsg(a: Agent) {
    if (!(a.agent_notice || msgDraft[a.id])) return;
    setBusy(`msg:${a.id}`);
    const r = await manageAgent({ agentId: a.id, action: "setAgentNotice", notice: "" });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر المسح."); return; }
    patchAgent(a.id, { agent_notice: null });
    setMsgDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
    showFlash(`msg:${a.id}`, "اتمسحت من عنده ✓");
  }

  // ── فتح/قفل الصوت + البرنامج ──
  async function toggleVoice(a: Agent) {
    const next = !(a.voicex_enabled === true);
    setBusy(`flag:${a.id}`);
    const r = await manageAgent({ agentId: a.id, action: "setVoicexEnabled", enabled: next });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر التنفيذ."); return; }
    patchAgent(a.id, { voicex_enabled: next });
  }
  async function toggleProgram(a: Agent) {
    const cur = a.rest_pages_enabled !== false;
    const next = !cur;
    if (!next && !confirm(`تقفل باقي صفحات البرنامج على «${a.username}» وتخليه صوت فقط؟`)) return;
    setBusy(`flag:${a.id}`);
    const r = await manageAgent({ agentId: a.id, action: "setRestPages", enabled: next });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر التنفيذ."); return; }
    patchAgent(a.id, { rest_pages_enabled: next });
  }

  // تذكير واتساب — بيفتح المحادثة فاضية.
  function remind(a: Agent) {
    const digits = waDigits(a.phone);
    if (!digits) { alert("مفيش رقم واتساب للمندوب ده."); return; }
    window.open(`https://wa.me/${digits}`, "_blank", "noopener,noreferrer");
  }

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  const subCards: { key: SubFilter; label: string; val: number; cls: string; on: string }[] = [
    { key: "active", label: "نشط", val: subCounts.active, cls: "text-emerald-500", on: "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500" },
    { key: "expiring", label: "قرب ينتهي", val: subCounts.expiring, cls: "text-amber-500", on: "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500" },
    { key: "expired", label: "منتهي", val: subCounts.expired, cls: "text-danger", on: "border-danger bg-danger/10 ring-1 ring-danger" },
  ];
  const inputCls = "min-w-0 w-full rounded-lg border bg-surface-2 px-2 py-1.5 text-center text-sm font-bold text-ink focus:outline-none";

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
            <h1 className="flex items-center justify-center gap-1.5 text-lg font-bold text-ink"><Wallet size={18} /> حسابات المناديب</h1>
            <p className="text-[11px] text-muted">دفعات الاشتراكات وإدارتها</p>
          </div>
          <span className="w-[52px]" />
        </div>

        {/* اختيار الشهر */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-2 py-1.5">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink" title="الشهر اللي فات">
            <ChevronRight size={18} />
          </button>
          <span className="text-sm font-bold text-ink">{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= monthKey()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-30" title="الشهر اللي بعده">
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* الفلوس اللي اتجمعت */}
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-emerald-500"><Coins size={16} /> الفلوس اللي اتجمعت — {monthLabel(month)}</p>
          <p className="mt-1 text-4xl font-black text-emerald-500">{fmt(collected)} <span className="text-lg font-bold">ريال</span></p>
          <p className="mt-1.5 text-[11px] text-muted">
            عليهم <b className={totalOwed > 0 ? "text-danger" : "text-muted"}>{fmt(totalOwed)}</b> · دفع {fmt(paidCount)} من {fmt(agents.length)} مندوب
          </p>
        </div>

        {/* عدّادات الاشتراك — كل رقم زر بيفلتر */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {subCards.map((c) => {
            const on = subFilter === c.key;
            return (
              <button key={c.key} onClick={() => setSubFilter(on ? "all" : c.key)}
                className={`rounded-xl border p-2.5 transition active:scale-95 ${on ? c.on : "border-border bg-surface"}`}>
                <p className={`text-2xl font-black ${c.cls}`}>{fmt(c.val)}</p>
                <p className="text-[11px] text-muted">{c.label}</p>
              </button>
            );
          })}
        </div>

        {/* بحث + فلترة الدفع */}
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو التليفون..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex items-center gap-1.5">
          {([["all", "الكل"], ["unpaid", "لسه عليه"], ["paid", "خالص"]] as [PayFilter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setPayFilter(k)}
              className={`flex-1 rounded-full border px-3 py-1.5 text-xs transition ${payFilter === k ? "border-primary bg-primary/15 font-bold text-primary" : "border-border text-muted"}`}>
              {label}
            </button>
          ))}
          {subFilter !== "all" && (
            <button onClick={() => setSubFilter("all")} title="إلغاء فلتر الاشتراك"
              className="shrink-0 rounded-full border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-ink">
              <X size={13} />
            </button>
          )}
        </div>

        {loadError && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
            <AlertCircle size={15} className="shrink-0" />
            <span>{loadError} — لو أول مرة، شغّل <b>agent-payments.sql</b> ثم <b>agent-owed.sql</b> على Supabase.</span>
          </div>
        )}

        {/* قائمة المناديب */}
        <div className="flex flex-col gap-2.5">
          {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}
          {!loading && rows.map(({ a, paid, owed, pstatus, sub }) => {
            const plan = agentPlanOf(a);
            const voiceOn = a.voicex_enabled === true;
            const progOn = a.rest_pages_enabled !== false;
            const paidVal = paidDraft[a.id] !== undefined ? paidDraft[a.id] : (paid > 0 ? String(paid) : "");
            const owedVal = owedDraft[a.id] !== undefined ? owedDraft[a.id] : (a.owed_amount != null ? String(a.owed_amount) : "");
            const paidChanged = paidDraft[a.id] !== undefined && paidDraft[a.id] !== (paid > 0 ? String(paid) : "");
            const owedChanged = owedDraft[a.id] !== undefined && owedDraft[a.id] !== (a.owed_amount != null ? String(a.owed_amount) : "");
            const billChanged = paidChanged || owedChanged;
            const noteVal = noteDraft[a.id] !== undefined ? noteDraft[a.id] : (a.payment_note ?? "");
            const noteChanged = noteDraft[a.id] !== undefined && noteDraft[a.id] !== (a.payment_note ?? "");
            const msgVal = msgDraft[a.id] !== undefined ? msgDraft[a.id] : (a.agent_notice ?? "");
            const msgChanged = msgDraft[a.id] !== undefined && msgDraft[a.id] !== (a.agent_notice ?? "");
            return (
              <div key={a.id} className="rounded-xl border border-border bg-surface p-3">
                {/* السطر ١: الاسم + الخطة + أيام الاشتراك */}
                <div className="flex items-center gap-2">
                  <CircleUserRound size={22} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={a.username}>{a.username}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${PLAN_BADGE[plan]}`}>{PLAN_LABEL[plan]}</span>
                  <span className="flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ color: sub.color, background: `${sub.color}22` }}>
                    <CalendarClock size={11} /> {sub.status === "expired" ? "منتهي" : sub.status === "none" ? "—" : `${sub.daysLeft} يوم`}
                  </span>
                </div>

                {/* السطر ٢: مربعا «دفع» و«عليه» + حفظ */}
                <div className="mt-2.5 flex items-end gap-2">
                  <label className="flex-1">
                    <span className="mb-0.5 block text-[10px] font-bold text-emerald-600">دفع (الشهر ده)</span>
                    <input type="number" inputMode="numeric" dir="ltr" value={paidVal} placeholder="0"
                      onChange={(e) => setPaidDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                      className={`${inputCls} border-emerald-500/40 focus:border-emerald-500`} />
                  </label>
                  <label className="flex-1">
                    <span className="mb-0.5 block text-[10px] font-bold text-danger">عليه</span>
                    <input type="number" inputMode="numeric" dir="ltr" value={owedVal} placeholder={String(planFeeOf(a))}
                      onChange={(e) => setOwedDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                      className={`${inputCls} border-danger/40 focus:border-danger`} />
                  </label>
                  <button onClick={() => saveBilling(a)} disabled={!billChanged || busy === `bill:${a.id}`}
                    className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-night transition disabled:opacity-40" title="حفظ دفع/عليه">
                    <Save size={14} /> حفظ
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    pstatus === "paid" ? "bg-emerald-500/15 text-emerald-500"
                    : pstatus === "partial" ? "bg-amber-500/15 text-amber-500"
                    : "bg-danger/15 text-danger"}`}>
                    {pstatus === "paid" ? "خالص ✓" : pstatus === "partial" ? "دفع وعليه باقي" : "لسه مادفعش"}
                  </span>
                  {flash[`bill:${a.id}`] && <span className="text-[10px] font-bold text-emerald-500">{flash[`bill:${a.id}`]}</span>}
                </div>

                {/* السطر ٣: فتح/قفل الصوت + البرنامج */}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button onClick={() => toggleVoice(a)} disabled={busy === `flag:${a.id}`}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                      voiceOn ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-danger/40 bg-danger/10 text-danger"}`}>
                    <Mic size={13} /> الصوت {voiceOn ? "مفتوح" : "مقفول"}
                  </button>
                  <button onClick={() => toggleProgram(a)} disabled={busy === `flag:${a.id}`}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                      progOn ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-danger/40 bg-danger/10 text-danger"}`}>
                    <LayoutGrid size={13} /> البرنامج {progOn ? "مفتوح" : "مقفول"}
                  </button>
                </div>

                {/* السطر ٤: ملاحظة خاصة بالأدمن */}
                <div className="mt-2.5">
                  <div className="flex items-center gap-1.5">
                    <input value={noteVal}
                      onChange={(e) => setNoteDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                      placeholder="ملاحظة ليك: «قال هيسدد بعد يومين»... (المندوب مش بيشوفها)"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted/50 focus:outline-none focus:border-primary" />
                    <button onClick={() => saveNote(a)} disabled={!noteChanged || busy === `note:${a.id}`}
                      className="flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-bold text-night transition disabled:opacity-40" title="حفظ الملاحظة">
                      <Save size={13} /> حفظ
                    </button>
                    <button onClick={() => clearNote(a)} disabled={!(a.payment_note || noteDraft[a.id]) || busy === `note:${a.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition hover:text-danger disabled:opacity-40" title="مسح الملاحظة">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {flash[`note:${a.id}`] && <p className="mt-1 text-[10px] font-bold text-emerald-500">{flash[`note:${a.id}`]}</p>}
                </div>

                {/* السطر ٥: رسالة تظهر للمندوب بالأحمر */}
                <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 p-2">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-danger"><Megaphone size={11} /> رسالة تظهر للمندوب بالأحمر</p>
                  <div className="flex items-center gap-1.5">
                    <input value={msgVal}
                      onChange={(e) => setMsgDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                      placeholder="اكتب رسالة تظهر له في البرنامج..."
                      className="min-w-0 flex-1 rounded-lg border border-danger/30 bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted/50 focus:outline-none focus:border-danger" />
                    <button onClick={() => saveMsg(a)} disabled={!msgChanged || busy === `msg:${a.id}`}
                      className="flex h-8 items-center gap-1 rounded-lg bg-danger px-2.5 text-[11px] font-bold text-white transition disabled:opacity-40" title="إرسال الرسالة للمندوب">
                      <Save size={13} /> حفظ
                    </button>
                    <button onClick={() => clearMsg(a)} disabled={!(a.agent_notice || msgDraft[a.id]) || busy === `msg:${a.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition hover:text-danger disabled:opacity-40" title="مسح الرسالة من عنده">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {flash[`msg:${a.id}`]
                    ? <p className="mt-1 text-[10px] font-bold text-emerald-500">{flash[`msg:${a.id}`]}</p>
                    : a.agent_notice && <p className="mt-1 text-[10px] text-danger/80">شغّالة عنده دلوقتي ✓</p>}
                </div>

                {/* السطر ٦: واتساب */}
                {waDigits(a.phone) && (
                  <button onClick={() => remind(a)}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/10 py-2 text-xs font-bold text-green-500 transition hover:bg-green-500/20">
                    <MessageCircle size={14} /> افتح واتساب المندوب
                  </button>
                )}
              </div>
            );
          })}
          {!loading && rows.length === 0 && !loadError && <p className="py-8 text-center text-sm text-muted">لا توجد نتائج.</p>}
        </div>
      </div>
    </main>
  );
}

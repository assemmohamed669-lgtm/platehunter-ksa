"use client";

/**
 * /admin/accounts — «حسابات المناديب» (لأي أدمن، مش السوبر بس).
 *
 * بتساعد المالك يتابع فلوس المناديب ويدير كل واحد من مكان واحد:
 *  • فوق: صندوق بيّن بالفلوس اللي اتجمعت الشهر ده + عدّادات الاشتراك
 *    (نشط / قرب ينتهي / منتهي) — كل رقم بتدوس عليه يفلتر القائمة على ناسه بس.
 *  • كل مندوب: خطته وسعره الشهري (تلقائي، قابل للتعديل)، الأيام الباقية في
 *    اشتراكه، كام دفع الشهر ده وحالته، أزرار فتح/قفل الصوت والبرنامج،
 *    ملاحظة خاصة بالأدمن (حفظ/مسح)، ورسالة تظهر للمندوب بالأحمر (حفظ/مسح)،
 *    تسجيل دفعة، سجل الدفعات، وتذكير واتساب.
 *
 * الدفعات على /api/admin/payments (service role). فتح/قفل الصوت/البرنامج
 * ورسالة المندوب على /api/admin/manage-agent (نفس اللي بتستخدمه لوحة الأدمن).
 * ⚠️ لازم تشغّل docs/sql/agent-payments.sql مرة واحدة على Supabase قبل الاستخدام.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Search, Plus, Wallet, Receipt, MessageCircle,
  X, Trash2, Coins, AlertCircle, Save, CircleUserRound, Mic, LayoutGrid,
  Megaphone, CalendarClock,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus } from "@/lib/subscription";
import {
  PLAN_LABEL, effectiveFee, agentPlanOf, monthKey, type Plan,
} from "@/lib/agentBilling";

interface Agent {
  id: string;
  username: string;
  phone: string | null;
  role: "admin" | "agent";
  is_active: boolean;
  subscription_end: string | null;
  voicex_enabled?: boolean | null;
  rest_pages_enabled?: boolean | null;
  monthly_fee?: number | null;
  payment_note?: string | null;
  agent_notice?: string | null;
}

interface Payment {
  id: string;
  agent_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  note: string | null;
  created_at: string;
}

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
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  const [subFilter, setSubFilter] = useState<SubFilter>("all");

  // مسوّدات التعديل + حالة الحفظ لكل مندوب.
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [msgDraft, setMsgDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null); // "note:id" / "msg:id" / "flag:id"

  // مودالات.
  const [payFor, setPayFor] = useState<Agent | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [historyFor, setHistoryFor] = useState<Agent | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [feeFor, setFeeFor] = useState<Agent | null>(null);
  const [feeVal, setFeeVal] = useState("");
  const [feeSaving, setFeeSaving] = useState(false);

  const patchAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setAgents((as) => as.map((x) => (x.id === id ? { ...x, ...patch } : x)));
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
      if (!res.ok) { setLoadError(json.error ?? "تعذّر تحميل الدفعات."); setPayments([]); }
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

  // عدّادات الاشتراك (نشط / قرب ينتهي / منتهي) — كل رقم زر بيفلتر.
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
  const expected = useMemo(
    () => agents.filter((a) => a.is_active !== false).reduce((s, a) => s + effectiveFee(a), 0),
    [agents],
  );
  const paidCount = useMemo(() => agents.filter((a) => (paidByAgent.get(a.id) ?? 0) > 0).length, [agents, paidByAgent]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .map((a) => {
        const fee = effectiveFee(a);
        const paid = paidByAgent.get(a.id) ?? 0;
        const pstatus = paid <= 0 ? "unpaid" : paid >= fee ? "paid" : "partial";
        const sub = subStatus(a.subscription_end);
        return { a, fee, paid, pstatus, sub };
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

  // ── دفعة ──
  function openPay(a: Agent) {
    const remaining = Math.max(0, effectiveFee(a) - (paidByAgent.get(a.id) ?? 0));
    setPayFor(a);
    setPayAmount(String(remaining || effectiveFee(a)));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod(""); setPayNote(""); setPayError(null);
  }
  async function submitPay() {
    if (!payFor) return;
    setPayError(null);
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setPayError("اكتب مبلغ صحيح."); return; }
    setPaySaving(true);
    const r = await postPay({ action: "add", agentId: payFor.id, amount, paidAt: payDate, method: payMethod || null, note: payNote || null });
    setPaySaving(false);
    if (!r.ok) { setPayError(r.error ?? "تعذّر الحفظ."); return; }
    setPayFor(null);
    await loadPayments(month);
  }

  async function openHistory(a: Agent) {
    setHistoryFor(a); setHistory([]); setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/payments?agentId=${a.id}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setHistory((json.payments ?? []) as Payment[]);
    } catch { /* تجاهل */ }
    finally { setHistoryLoading(false); }
  }
  async function deletePayment(id: string) {
    if (!confirm("متأكد تمسح الدفعة دي؟")) return;
    const r = await postPay({ action: "delete", id });
    if (!r.ok) { alert(r.error ?? "تعذّر المسح."); return; }
    setHistory((h) => h.filter((p) => p.id !== id));
    await loadPayments(month);
  }

  // ── ملاحظة الأدمن (خاصة، المندوب مش بيشوفها) ──
  async function saveNote(a: Agent) {
    const note = noteDraft[a.id] ?? "";
    setBusy(`note:${a.id}`);
    const r = await postPay({ action: "setNote", agentId: a.id, note });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر الحفظ."); return; }
    patchAgent(a.id, { payment_note: note.trim() || null });
    setNoteDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
  }
  async function clearNote(a: Agent) {
    if (!(a.payment_note || noteDraft[a.id])) return;
    setBusy(`note:${a.id}`);
    const r = await postPay({ action: "setNote", agentId: a.id, note: "" });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر المسح."); return; }
    patchAgent(a.id, { payment_note: null });
    setNoteDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
  }

  // ── رسالة المندوب (بتظهر عنده بالأحمر) ──
  async function saveMsg(a: Agent) {
    const notice = msgDraft[a.id] ?? "";
    setBusy(`msg:${a.id}`);
    const r = await manageAgent({ agentId: a.id, action: "setAgentNotice", notice });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر الحفظ."); return; }
    patchAgent(a.id, { agent_notice: notice.trim() || null });
    setMsgDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
  }
  async function clearMsg(a: Agent) {
    if (!(a.agent_notice || msgDraft[a.id])) return;
    setBusy(`msg:${a.id}`);
    const r = await manageAgent({ agentId: a.id, action: "setAgentNotice", notice: "" });
    setBusy(null);
    if (!r.ok) { alert(r.error ?? "تعذّر المسح."); return; }
    patchAgent(a.id, { agent_notice: null });
    setMsgDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
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

  // ── الرسم الشهري ──
  function openFee(a: Agent) {
    setFeeFor(a);
    setFeeVal(a.monthly_fee != null ? String(a.monthly_fee) : "");
  }
  async function saveFee() {
    if (!feeFor) return;
    setFeeSaving(true);
    const fee = feeVal.trim() === "" ? null : Number(feeVal);
    const r = await postPay({ action: "setFee", agentId: feeFor.id, fee });
    setFeeSaving(false);
    if (!r.ok) { alert(r.error ?? "تعذّر الحفظ."); return; }
    patchAgent(feeFor.id, { monthly_fee: fee });
    setFeeFor(null);
  }

  // تذكير واتساب — بيفتح المحادثة **من غير رسالة** (فاضية) عشان تكتب اللي إنت عايزه.
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

        {/* صندوق الفلوس اللي اتجمعت — بيّن فوق */}
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-emerald-500"><Coins size={16} /> الفلوس اللي اتجمعت — {monthLabel(month)}</p>
          <p className="mt-1 text-4xl font-black text-emerald-500">{fmt(collected)} <span className="text-lg font-bold">ريال</span></p>
          <p className="mt-1.5 text-[11px] text-muted">
            المتوقّع {fmt(expected)} · المتبقّي <b className={expected - collected > 0 ? "text-danger" : "text-muted"}>{fmt(Math.max(0, expected - collected))}</b> · دفع {fmt(paidCount)} من {fmt(agents.length)}
          </p>
        </div>

        {/* عدّادات الاشتراك — كل رقم زر بيفلتر القائمة على ناسه */}
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
          {([["all", "الكل"], ["unpaid", "لم يدفع"], ["paid", "مدفوع"]] as [PayFilter, string][]).map(([k, label]) => (
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
            <span>{loadError} — لو أول مرة، اتأكد إنك شغّلت <b>agent-payments.sql</b> على Supabase.</span>
          </div>
        )}

        {/* قائمة المناديب */}
        <div className="flex flex-col gap-2.5">
          {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}
          {!loading && rows.map(({ a, fee, paid, pstatus, sub }) => {
            const plan = agentPlanOf(a);
            const remaining = Math.max(0, fee - paid);
            const voiceOn = a.voicex_enabled === true;
            const progOn = a.rest_pages_enabled !== false;
            const noteVal = noteDraft[a.id] !== undefined ? noteDraft[a.id] : (a.payment_note ?? "");
            const noteChanged = noteDraft[a.id] !== undefined && noteDraft[a.id] !== (a.payment_note ?? "");
            const msgVal = msgDraft[a.id] !== undefined ? msgDraft[a.id] : (a.agent_notice ?? "");
            const msgChanged = msgDraft[a.id] !== undefined && msgDraft[a.id] !== (a.agent_notice ?? "");
            return (
              <div key={a.id} className="rounded-xl border border-border bg-surface p-3">
                {/* السطر ١: الاسم + الخطة + السعر */}
                <div className="flex items-center gap-2">
                  <CircleUserRound size={22} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={a.username}>{a.username}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${PLAN_BADGE[plan]}`}>{PLAN_LABEL[plan]}</span>
                  <button onClick={() => openFee(a)} title="تعديل الرسم الشهري"
                    className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink transition hover:border-primary/50">
                    {fmt(fee)} <span className="text-[9px] text-muted">ريال</span>
                  </button>
                </div>

                {/* السطر ٢: الأيام الباقية + حالة الدفع */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                    style={{ color: sub.color, background: `${sub.color}22` }}>
                    <CalendarClock size={12} /> {sub.status === "expired" ? "منتهي — مقطوع" : sub.status === "none" ? "بدون اشتراك" : `${sub.daysLeft} يوم`}
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${
                      pstatus === "paid" ? "bg-emerald-500/15 text-emerald-500"
                      : pstatus === "partial" ? "bg-amber-500/15 text-amber-500"
                      : "bg-danger/15 text-danger"}`}>
                      {pstatus === "paid" ? "مدفوع ✓" : pstatus === "partial" ? "جزئي" : "لم يدفع"}
                    </span>
                    دفع <b className="text-ink">{fmt(paid)}</b>{remaining > 0 && <> · باقي <b className="text-danger">{fmt(remaining)}</b></>}
                  </span>
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

                {/* السطر ٤: ملاحظة خاصة بالأدمن (المندوب مش بيشوفها) */}
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
                  {a.agent_notice && <p className="mt-1 text-[10px] text-danger/80">شغّالة عنده دلوقتي ✓</p>}
                </div>

                {/* السطر ٦: أزرار */}
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button onClick={() => openPay(a)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-night transition active:scale-95">
                    <Plus size={14} /> دفعة
                  </button>
                  <button onClick={() => openHistory(a)}
                    className="flex items-center justify-center gap-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-bold text-muted transition hover:text-ink">
                    <Receipt size={14} /> السجل
                  </button>
                  {waDigits(a.phone) && (
                    <button onClick={() => remind(a)}
                      className="flex items-center justify-center gap-1 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-500 transition hover:bg-green-500/20" title="فتح واتساب المندوب">
                      <MessageCircle size={14} /> واتساب
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!loading && rows.length === 0 && !loadError && <p className="py-8 text-center text-sm text-muted">لا توجد نتائج.</p>}
        </div>
      </div>

      {/* مودال تسجيل دفعة */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => !paySaving && setPayFor(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">دفعة — {payFor.username}</h3>
              <button onClick={() => setPayFor(null)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <label className="text-[11px] font-bold text-muted">المبلغ (ريال)</label>
              <input type="number" inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center text-lg font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <div className="flex gap-1.5">
                {[["كاش", "كاش"], ["تحويل", "تحويل"], ["STC Pay", "stc"]].map(([label, val]) => (
                  <button key={val} onClick={() => setPayMethod(payMethod === val ? "" : val)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition ${payMethod === val ? "border-primary bg-primary/15 text-primary" : "border-border text-muted"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="text-[11px] font-bold text-muted">تاريخ الدفع</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} max={new Date().toISOString().slice(0, 10)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="ملاحظة على الدفعة (اختياري)" dir="rtl"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              {payError && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{payError}</p>}
              <div className="mt-1 flex gap-2">
                <button onClick={() => setPayFor(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted">إلغاء</button>
                <button onClick={submitPay} disabled={paySaving}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60">
                  {paySaving ? "جارٍ..." : "سجّل الدفعة"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* مودال تعديل الرسم الشهري */}
      {feeFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => !feeSaving && setFeeFor(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">الرسم الشهري — {feeFor.username}</h3>
              <button onClick={() => setFeeFor(null)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
              المقترح تلقائي حسب خطة المندوب ({PLAN_LABEL[agentPlanOf(feeFor)]} = {fmt(effectiveFee({ ...feeFor, monthly_fee: null }))} ريال).
              اكتب رقم لو عايز تحدد رسم مخصّص، أو سيبه فاضي عشان يرجع للمقترح.
            </p>
            <input type="number" inputMode="numeric" value={feeVal} onChange={(e) => setFeeVal(e.target.value)} dir="ltr"
              placeholder={`${effectiveFee({ ...feeFor, monthly_fee: null })} (مقترح)`}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-center text-lg font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="mt-3 flex gap-2">
              <button onClick={() => setFeeFor(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted">إلغاء</button>
              <button onClick={saveFee} disabled={feeSaving}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60">
                {feeSaving ? "جارٍ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال سجل الدفعات */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={() => setHistoryFor(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-bold text-ink"><Receipt size={16} /> سجل — {historyFor.username}</h3>
              <button onClick={() => setHistoryFor(null)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            {historyLoading ? (
              <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">مفيش دفعات متسجّلة.</p>
            ) : (
              <div className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
                {history.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{fmt(Number(p.amount))} <span className="text-[10px] font-normal text-muted">ريال</span>
                        {p.method && <span className="mr-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{p.method}</span>}
                      </p>
                      <p className="text-[11px] text-muted">{new Date(p.paid_at).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })}</p>
                      {p.note && <p className="truncate text-[11px] text-muted" title={p.note}>{p.note}</p>}
                    </div>
                    <button onClick={() => deletePayment(p.id)} title="مسح الدفعة"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-danger/15 hover:text-danger">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

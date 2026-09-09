"use client";

/**
 * /admin/accounts — «حسابات المناديب» (لأي أدمن، مش السوبر بس).
 *
 * بتساعد المالك يتابع فلوس المناديب:
 *  • كل مندوب: خطته وسعره الشهري (تلقائي من علمَي الصوت/الصفحات، وقابل للتعديل)،
 *    كام دفع الشهر ده، وحالته (مدفوع/جزئي/لم يدفع)، وملاحظة («قال هيسدد بعد يومين»).
 *  • إجمالي دخل الشهر + المتوقّع + المتبقّي.
 *  • تسجيل دفعة، سجل الدفعات، تذكير واتساب.
 *
 * الدفعات كلها بتمرّ على /api/admin/payments (service role) — الجدول مقفول بالـRLS.
 * ⚠️ لازم تشغّل docs/sql/agent-payments.sql مرة واحدة على Supabase قبل الاستخدام.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, ChevronRight, Search, Plus, Wallet, Receipt, MessageCircle,
  X, Trash2, Coins, TrendingUp, AlertCircle, Pencil, Check, CircleUserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
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

// نقل مفتاح الشهر شهر لقدّام/لورا (YYYY-MM).
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

// رابط واتساب من رقم المندوب — أرقام بس (زي صفحة الأدمن).
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

type StatusFilter = "all" | "unpaid" | "paid";

export default function AdminAccounts() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [month, setMonth] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // تعديل الملاحظة (inline) — مسوّدة لكل مندوب.
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState<string | null>(null);

  // مودال تسجيل دفعة.
  const [payFor, setPayFor] = useState<Agent | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // مودال سجل دفعات مندوب.
  const [historyFor, setHistoryFor] = useState<Agent | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // مودال تعديل الرسم الشهري.
  const [feeFor, setFeeFor] = useState<Agent | null>(null);
  const [feeVal, setFeeVal] = useState("");
  const [feeSaving, setFeeSaving] = useState(false);

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

  // Access guard — admins only (مش السوبر بس).
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

  // مجموع المدفوع لكل مندوب في الشهر المعروض.
  const paidByAgent = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.agent_id, (m.get(p.agent_id) ?? 0) + Number(p.amount || 0));
    return m;
  }, [payments]);

  // إحصائيات الشهر: محصّل / متوقّع (النشطين) / متبقّي / مين دفع.
  const stats = useMemo(() => {
    const collected = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const activeAgents = agents.filter((a) => a.is_active !== false);
    const expected = activeAgents.reduce((s, a) => s + effectiveFee(a), 0);
    const paidCount = agents.filter((a) => (paidByAgent.get(a.id) ?? 0) > 0).length;
    return { collected, expected, outstanding: expected - collected, paidCount, total: agents.length };
  }, [payments, agents, paidByAgent]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents
      .map((a) => {
        const fee = effectiveFee(a);
        const paid = paidByAgent.get(a.id) ?? 0;
        const status: StatusFilter | "partial" = paid <= 0 ? "unpaid" : paid >= fee ? "paid" : "partial";
        return { a, fee, paid, status };
      })
      .filter(({ a, status }) => {
        if (q && !(a.username?.toLowerCase().includes(q) || a.phone?.includes(q))) return false;
        if (statusFilter === "paid") return status === "paid";
        if (statusFilter === "unpaid") return status === "unpaid" || status === "partial";
        return true;
      })
      // اللي ماد فعوش الأول (عشان تشوف مين لسه عليه فلوس)، وبعدين بالاسم.
      .sort((x, y) => {
        const w = (s: string) => (s === "unpaid" ? 0 : s === "partial" ? 1 : 2);
        return w(x.status) - w(y.status) || (x.a.username ?? "").localeCompare(y.a.username ?? "");
      });
  }, [agents, paidByAgent, search, statusFilter]);

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch("/api/admin/payments", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
      const json = await res.json();
      return res.ok ? { ok: true } : { ok: false, error: json.error };
    } catch { return { ok: false, error: "تعذّر الاتصال بالخادم." }; }
  }

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
    const r = await post({ action: "add", agentId: payFor.id, amount, paidAt: payDate, method: payMethod || null, note: payNote || null });
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
    const r = await post({ action: "delete", id });
    if (!r.ok) { alert(r.error ?? "تعذّر المسح."); return; }
    setHistory((h) => h.filter((p) => p.id !== id));
    await loadPayments(month);
  }

  async function saveNote(a: Agent) {
    const note = noteDraft[a.id] ?? "";
    setNoteSaving(a.id);
    const r = await post({ action: "setNote", agentId: a.id, note });
    setNoteSaving(null);
    if (!r.ok) { alert(r.error ?? "تعذّر حفظ الملاحظة."); return; }
    setAgents((as) => as.map((x) => (x.id === a.id ? { ...x, payment_note: note || null } : x)));
    setNoteDraft((d) => { const n = { ...d }; delete n[a.id]; return n; });
  }

  function openFee(a: Agent) {
    setFeeFor(a);
    setFeeVal(a.monthly_fee != null ? String(a.monthly_fee) : "");
  }
  async function saveFee() {
    if (!feeFor) return;
    setFeeSaving(true);
    const fee = feeVal.trim() === "" ? null : Number(feeVal);
    const r = await post({ action: "setFee", agentId: feeFor.id, fee });
    setFeeSaving(false);
    if (!r.ok) { alert(r.error ?? "تعذّر الحفظ."); return; }
    setAgents((as) => as.map((x) => (x.id === feeFor.id ? { ...x, monthly_fee: fee } : x)));
    setFeeFor(null);
  }

  function remind(a: Agent, fee: number, paid: number) {
    const digits = waDigits(a.phone);
    if (!digits) { alert("مفيش رقم واتساب للمندوب ده."); return; }
    const remaining = Math.max(0, fee - paid);
    const msg = remaining > 0
      ? `السلام عليكم ${a.username}،\nاشتراكك في قناص عن ${monthLabel(month)}: ${fmt(fee)} ريال.\nالمتبقّي: ${fmt(remaining)} ريال. برجاء السداد، وشكراً 🌟`
      : `السلام عليكم ${a.username}،\nتم استلام اشتراك ${monthLabel(month)} (${fmt(fee)} ريال). شكراً لك 🌟`;
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
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
            <h1 className="flex items-center justify-center gap-1.5 text-lg font-bold text-ink"><Wallet size={18} /> حسابات المناديب</h1>
            <p className="text-[11px] text-muted">دفعات الاشتراكات وملاحظاتها</p>
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

        {/* ملخّص الشهر */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
            <p className="flex items-center justify-center gap-1 text-[19px] font-black text-emerald-500"><Coins size={15} /> {fmt(stats.collected)}</p>
            <p className="text-[10px] text-muted">محصّل الشهر</p>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5">
            <p className="flex items-center justify-center gap-1 text-[19px] font-black text-primary"><TrendingUp size={15} /> {fmt(stats.expected)}</p>
            <p className="text-[10px] text-muted">المتوقّع (النشطين)</p>
          </div>
          <div className={`rounded-xl border p-2.5 ${stats.outstanding > 0 ? "border-danger/30 bg-danger/10" : "border-border bg-surface"}`}>
            <p className={`text-[19px] font-black ${stats.outstanding > 0 ? "text-danger" : "text-muted"}`}>{fmt(Math.max(0, stats.outstanding))}</p>
            <p className="text-[10px] text-muted">المتبقّي</p>
          </div>
        </div>
        <p className="-mt-2 text-center text-[11px] text-muted">دفع {fmt(stats.paidCount)} من {fmt(stats.total)} مندوب</p>

        {/* بحث + فلترة */}
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالاسم أو التليفون..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex gap-1.5">
          {([["all", "الكل"], ["unpaid", "لم يدفع"], ["paid", "مدفوع"]] as [StatusFilter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              className={`flex-1 rounded-full border px-3 py-1.5 text-xs transition ${statusFilter === k ? "border-primary bg-primary/15 font-bold text-primary" : "border-border text-muted"}`}>
              {label}
            </button>
          ))}
        </div>

        {loadError && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-xs text-danger">
            <AlertCircle size={15} className="shrink-0" />
            <span>{loadError} — لو أول مرة، اتأكد إنك شغّلت <b>agent-payments.sql</b> على Supabase.</span>
          </div>
        )}

        {/* قائمة المناديب */}
        <div className="flex flex-col gap-2">
          {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}
          {!loading && rows.map(({ a, fee, paid, status }) => {
            const plan = agentPlanOf(a);
            const editing = noteDraft[a.id] !== undefined;
            const noteVal = editing ? noteDraft[a.id] : (a.payment_note ?? "");
            const remaining = Math.max(0, fee - paid);
            return (
              <div key={a.id} className="rounded-xl border border-border bg-surface p-3">
                {/* السطر ١: الاسم + الخطة + السعر */}
                <div className="flex items-center gap-2">
                  <CircleUserRound size={22} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={a.username}>{a.username}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${PLAN_BADGE[plan]}`}>{PLAN_LABEL[plan]}</span>
                  <button onClick={() => openFee(a)} title="تعديل الرسم الشهري"
                    className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink transition hover:border-primary/50">
                    {fmt(fee)} <span className="text-[9px] text-muted">ريال</span> <Pencil size={10} className="text-muted" />
                  </button>
                </div>

                {/* السطر ٢: حالة الدفع + المدفوع/المتبقّي */}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    status === "paid" ? "bg-emerald-500/15 text-emerald-500"
                    : status === "partial" ? "bg-amber-500/15 text-amber-500"
                    : "bg-danger/15 text-danger"}`}>
                    {status === "paid" ? "مدفوع ✓" : status === "partial" ? "دفع جزئي" : "لم يدفع"}
                  </span>
                  <span className="text-[11px] text-muted">
                    دفع <b className="text-ink">{fmt(paid)}</b>
                    {remaining > 0 && <> · متبقّي <b className="text-danger">{fmt(remaining)}</b></>}
                  </span>
                </div>

                {/* السطر ٣: ملاحظة الدفع (قابلة للتعديل) */}
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={noteVal}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                    placeholder="ملاحظة: مثلاً «قال هيسدد بعد يومين»..."
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted/50 focus:outline-none focus:border-primary" />
                  {editing && noteDraft[a.id] !== (a.payment_note ?? "") && (
                    <button onClick={() => saveNote(a)} disabled={noteSaving === a.id}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-night transition disabled:opacity-50" title="حفظ الملاحظة">
                      <Check size={15} />
                    </button>
                  )}
                </div>

                {/* السطر ٤: أزرار */}
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
                    <button onClick={() => remind(a, fee, paid)}
                      className="flex items-center justify-center gap-1 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-500 transition hover:bg-green-500/20" title="تذكير على واتساب">
                      <MessageCircle size={14} /> تذكير
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

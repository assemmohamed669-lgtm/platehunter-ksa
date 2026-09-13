"use client";

import { deviceBindingState } from "@/lib/deviceBinding";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus, Search, Users, ShieldCheck, ArrowRight, X, AlertCircle,
  ChevronLeft, CalendarClock, CircleUserRound, Gem, Clock, MapPin, MessageCircle, Megaphone, ShieldAlert, Lock, LockOpen, Mic, LayoutGrid, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus, type SubStatus } from "@/lib/subscription";
import { APP_VERSION } from "@/lib/appVersion";
import { fetchAppNotice, setAppNotice, NOTICE_DURATIONS, type AppNotice } from "@/lib/appNotice";
import { fetchActivePoll, createPoll, closePoll, fetchPollResults, type Poll, type PollVote } from "@/lib/polls";
import { BarChart3, BellRing } from "lucide-react";

interface AgentProfile {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: "admin" | "agent";
  is_super: boolean;
  is_trial: boolean;
  is_active: boolean;
  voicex_enabled?: boolean;      // صوت VoiceX مفعّل (افتراضي: مقفول → ديبجرام)
  rest_pages_enabled?: boolean;  // باقي صفحات البرنامج مفتوحة (افتراضي: مفتوحة)
  device_fingerprint: string | null;
  device_lock_exempt: boolean;
  last_seen: string | null;
  subscription_end: string | null;
  subscription_amount: number | null;
  owed_amount?: number | null;   // «عليه» — المتبقّي على المندوب (من صفحة الحسابات)
  app_version: string | null;
  team?: string | null;          // المجموعة — لاستهداف الإشعار بمجموعة واحدة
  created_at: string;
}

// مفتاح شهر YYYY-MM + اسمه بالعربي — لشارة الدفع في القائمة.
function curMonthKey(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function curMonthLabel(): string { return new Date().toLocaleDateString("ar-EG", { month: "long" }); }
const fmtSar = (n: number) => n.toLocaleString("ar-EG");

// رابط واتساب من رقم المندوب — أرقام بس (بيشيل + والمسافات)، وبيشيل بادئة 00
// الدولية. المفروض الرقم متسجّل بكود الدولة (مثلاً 9665… أو 20…).
function waLink(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d ? `https://wa.me/${d}` : null;
}

function addMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// حالة نشاط المندوب من آخر ظهور (last_seen). التطبيق بيحدّث last_seen كل ما
// المندوب يفتحه، فـ«نشط» = فتح التطبيق من ٥ دقايق أو أقل.
function activityStatus(lastSeen: string | null): { online: boolean; label: string } {
  if (!lastSeen) return { online: false, label: "لم يفتح البرنامج" };
  const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
  if (mins <= 5) return { online: true, label: "نشط الآن" };
  if (mins < 60) return { online: false, label: `آخر ظهور من ${mins} دقيقة` };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { online: false, label: `آخر ظهور من ${hrs} ساعة` };
  return { online: false, label: `آخر ظهور من ${Math.floor(hrs / 24)} يوم` };
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "active", label: "نشط" },
  { key: "expiring", label: "قرب ينتهي" },
  { key: "grace", label: "في السماح" },
  { key: "expired", label: "مقطوع" },
  { key: "any-device", label: "🔓 يدخل من أي جهاز" },
];

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  // فتح/قفل صوت VoiceX لكل المناديب مرة واحدة (سوبر أدمن بس) — بتأكيد قبل التنفيذ
  // عشان ضغطة غلط ماتقفلش الصوت على الأسطول كله.
  const [bulkConfirm, setBulkConfirm] = useState<"on" | "off" | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // رسالة الأدمن للمناديب — بتظهر في شريط البرنامج في كل الصفحات
  const [noticeActive, setNoticeActive] = useState<AppNotice | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [noticeHours, setNoticeHours] = useState(24);
  const [noticeWa, setNoticeWa] = useState(false);   // زر واتساب مع الرسالة
  const [noticeUrgent, setNoticeUrgent] = useState(false);   // عاجلة: أحمر + صفّارة
  const [noticeBusy, setNoticeBusy] = useState(false);
  // استطلاع رأي المناديب — الأدمن ينشئ سؤال + خيارات ويشوف مين اختار إيه
  const [activePoll, setActivePoll] = useState<Poll | null>(null);
  const [pollResults, setPollResults] = useState<PollVote[]>([]);
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState<string[]>(["", ""]);
  const [pollBusy, setPollBusy] = useState(false);
  // زرّين فوق البث للمناديب: رسالة عادية ولا استطلاع رأي (سوبر أدمن فقط)
  const [broadcastTab, setBroadcastTab] = useState<"notice" | "poll" | "push">("notice");
  // إشعار هاتف — بيوصل حتى والتطبيق مقفول (النسخة المثبّتة من المتجر).
  const [pushText, setPushText] = useState("");
  const [pushTarget, setPushTarget] = useState<"all" | "team">("all");
  const [pushTeam, setPushTeam] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  // مين الأدمن اللي ضاف كل مندوب — من حدث إنشاء الحساب في subscription_events.
  const [creatorOf, setCreatorOf] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  // مدفوع الشهر الحالي لكل مندوب (من صفحة الحسابات) — لشارة «دفع كامل / عليه».
  const [paidByAgent, setPaidByAgent] = useState<Record<string, number>>({});

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cRole, setCRole] = useState<"agent" | "admin">("agent");
  const [cTrial, setCTrial] = useState(false);
  // صلاحيتا المندوب الجديد — نفس افتراضيات السيرفر: الصوت مقفول (ديبجرام)
  // وباقي الصفحات مفتوحة. للسوبر أدمن بس (زي الأزرار في القائمة).
  const [cVoicex, setCVoicex] = useState(false);
  const [cRestPages, setCRestPages] = useState(true);
  const [cEnd, setCEnd] = useState(addMonths(1));
  const [cError, setCError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("username", { ascending: true });
    const list = (data ?? []) as AgentProfile[];
    if (data) setAgents(list);
    setLoading(false);
    // مين ضاف مين: أقدم حدث لكل مندوب = حدث الإنشاء (نفس منطق صفحة المندوب).
    // اسم الأدمن بيتحل من نفس قايمة البروفايلات — من غير أي استعلام زيادة.
    try {
      const { data: evs } = await supabase
        .from("subscription_events")
        .select("agent_id, created_by, created_at")
        .order("created_at", { ascending: true });
      if (evs) {
        const nameById = new Map(list.map((p) => [p.id, p.username]));
        const first: Record<string, string> = {};
        for (const e of evs as Array<{ agent_id: string; created_by: string | null }>) {
          if (!e.created_by || first[e.agent_id]) continue;
          first[e.agent_id] = nameById.get(e.created_by) ?? "غير معروف";
        }
        setCreatorOf(first);
      }
    } catch { /* مش مشكلة — الاسم مايظهرش بس */ }
    // مدفوع الشهر الحالي لكل مندوب — للشارة في القائمة. أي فشل = بلا شارة دفع.
    try {
      const res = await fetch(`/api/admin/payments?month=${curMonthKey()}`, { headers: await authHeaders() });
      if (res.ok) {
        const json = await res.json();
        const m: Record<string, number> = {};
        for (const p of (json.payments ?? []) as Array<{ agent_id: string; amount: number }>) {
          m[p.agent_id] = (m[p.agent_id] ?? 0) + Number(p.amount || 0);
        }
        setPaidByAgent(m);
      }
    } catch { /* بلا شارة */ }
  }, []);

  // الاستطلاع الشغّال + نتايجه (مين اختار إيه).
  const loadPoll = useCallback(async () => {
    const p = await fetchActivePoll();
    setActivePoll(p);
    setPollResults(p ? await fetchPollResults(p.id) : []);
  }, []);

  // Access guard — admins only.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (prof?.role !== "admin") { router.replace("/sorting"); return; }
      setIsSuper(!!prof?.is_super);
      if (prof?.is_super) {
        void fetchAppNotice().then(setNoticeActive); // الرسالة الشغّالة دلوقتي (سوبر فقط)
        void loadPoll();                              // الاستطلاع الشغّال + نتايجه (سوبر فقط)
      }
      setAuthorized(true);
      loadAgents();
    })();
  }, [router, loadAgents]);

  // الرجوع من صفحة المندوب كان بيرجّع القايمة لفوق خالص. بنحفظ مين اتفتح
  // وموضع التمرير، وأول ما القايمة ترجع تترسم بنزحلق لنفس المندوب.
  const RESTORE_KEY = "ph:admin:lastOpened";
  function openAgent(id: string) {
    try {
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ id, y: window.scrollY }));
    } catch { /* التخزين مقفول — الرجوع هيبقى لفوق زي الأول */ }
    router.push(`/admin/${id}`);
  }
  useEffect(() => {
    if (loading || filtered.length === 0) return;
    let saved: { id?: string; y?: number } | null = null;
    try {
      const raw = sessionStorage.getItem(RESTORE_KEY);
      if (raw) saved = JSON.parse(raw);
      sessionStorage.removeItem(RESTORE_KEY);   // مرة واحدة بس
    } catch { /* تجاهل */ }
    if (!saved) return;
    // الصف نفسه أدق من الرقم (الفلتر/البحث بيغيّروا الأطوال) — والرقم احتياطي.
    requestAnimationFrame(() => {
      const el = saved!.id ? document.querySelector(`[data-agent-id="${saved!.id}"]`) : null;
      if (el) el.scrollIntoView({ block: "center" });
      else if (typeof saved!.y === "number") window.scrollTo(0, saved!.y);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function handleCreate() {
    setCError(null);
    if (!cEmail.trim() || cPassword.length < 6) {
      setCError("الإيميل وكلمة مرور (٦ أحرف على الأقل) مطلوبان."); return;
    }
    // التليفون إجباري للمندوب العادي فقط — اختياري لحساب التجربة.
    if (cRole === "agent" && !cTrial && !cPhone.trim()) {
      setCError("رقم التليفون مطلوب للمندوب."); return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/create-agent", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          email: cEmail, password: cPassword, name: cName, phone: cPhone,
          role: cRole, trial: cTrial,
          subscriptionEnd: cRole === "agent" && !cTrial ? cEnd : null,
          voicexEnabled: cVoicex, restPagesEnabled: cRestPages,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCError(json.error ?? "خطأ غير متوقع."); return; }
      setShowCreate(false);
      setCName(""); setCEmail(""); setCPassword(""); setCPhone(""); setCRole("agent"); setCTrial(false); setCEnd(addMonths(1));
      setCVoicex(false); setCRestPages(true);
      loadAgents();
    } catch { setCError("تعذّر الاتصال بالخادم."); }
    finally { setCreating(false); }
  }

  // قفل/فتح مؤقت للمندوب — بيغيّر is_active بس، **من غير ما يلمس تواريخ الاشتراك**.
  // فلما تفتحه تاني، اشتراكه بيرجع بنفس اليوم اللي كنت محدّده. القفل بيمنعه من
  // استخدام البرنامج فوراً (SessionGuard بيطبّقه لايف).
  async function toggleActive(a: AgentProfile, e: React.MouseEvent) {
    e.stopPropagation();
    if (a.is_active && !confirm(`تقفل «${a.username}» مؤقتاً؟\nمش هيقدر يستخدم البرنامج لحد ما تفتحه تاني — واشتراكه هيفضل بنفس التواريخ.`)) return;
    try {
      const res = await fetch("/api/admin/manage-agent", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ agentId: a.id, action: "setActive", active: !a.is_active }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "تعذّر تنفيذ العملية."); return; }
      loadAgents();
    } catch { alert("تعذّر الاتصال بالخادم."); }
  }

  // #25 — تبديل سريع لعلم مندوب من القائمة (صوت VoiceX / باقي الصفحات).
  async function toggleAgentFlag(
    a: AgentProfile,
    action: "setVoicexEnabled" | "setRestPages",
    value: boolean,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    if (action === "setRestPages" && !value &&
        !confirm(`تقفل باقي صفحات البرنامج على «${a.username}» وتخليه صفحة صوت VoiceX فقط؟`)) return;
    try {
      const res = await fetch("/api/admin/manage-agent", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ agentId: a.id, action, enabled: value }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "تعذّر تنفيذ العملية."); return; }
      loadAgents();
    } catch { alert("تعذّر الاتصال بالخادم."); }
  }

  /**
   * فتح/قفل صوت VoiceX لكل **المناديب** مرة واحدة. الفلترة على المناديب بتتم
   * على السيرفر (`role = 'agent'`) — الأدمن والسوبر أدمن مايتأثروش نهائياً.
   */
  async function runVoicexBulk(enabled: boolean) {
    setBulkBusy(true);
    setBulkMsg(null);
    try {
      const res = await fetch("/api/admin/voicex-bulk", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBulkMsg({ ok: false, text: json.error ?? "تعذّر تنفيذ العملية." });
        return;
      }
      setBulkMsg({
        ok: true,
        text: `تم ${enabled ? "فتح" : "قفل"} الصوت لـ${json.count ?? 0} مندوب.`,
      });
      setBulkConfirm(null);
      loadAgents();
    } catch {
      setBulkMsg({ ok: false, text: "تعذّر الاتصال بالخادم." });
    } finally {
      setBulkBusy(false);
    }
  }

  const enriched = useMemo(() => agents.map((a) => ({ a, sub: subStatus(a.subscription_end) })), [agents]);

  // Super-admin first, then admins, then agents — alphabetical within each group.
  const rank = (a: AgentProfile) => (a.is_super ? 0 : a.role === "admin" ? 1 : 2);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched
      .filter(({ a, sub }) => {
        if (q && !(a.username?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) || a.phone?.includes(q))) return false;
        if (filter === "all") return true;
        // المناديب المعفيين من قفل الجهاز (بيدخلوا بإيميلهم من أي جهاز).
        if (filter === "any-device") return a.role === "agent" && a.device_lock_exempt === true;
        if (a.role === "admin") return false;
        // «تحذير» في كروت الملخّص = قرب ينتهي + في السماح مع بعض.
        if (filter === "warn") return sub.status === "expiring" || sub.status === "grace";
        return sub.status === (filter as SubStatus);
      })
      .sort((x, y) => rank(x.a) - rank(y.a) || (x.a.username ?? "").localeCompare(y.a.username ?? ""));
  }, [enriched, search, filter]);

  const agentsOnly = enriched.filter((e) => e.a.role === "agent");
  const stat = {
    total: agentsOnly.length,
    active: agentsOnly.filter((e) => e.sub.status === "active").length,
    warn: agentsOnly.filter((e) => e.sub.status === "expiring" || e.sub.status === "grace").length,
    cut: agentsOnly.filter((e) => e.sub.status === "expired").length,
  };

  if (authorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحقق...</div>;
  }

  return (
    <main className="min-h-screen bg-night">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.push("/sorting")}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-ink transition">
            <ChevronLeft size={15} /> رجوع
          </button>
          <div className="text-center">
            <h1 className="text-lg font-bold text-ink">إدارة المناديب</h1>
            <p className="text-[11px] text-muted">الحسابات والاشتراكات</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-night">
            <UserPlus size={14} /> جديد
          </button>
        </div>

        {/* Summary — كل كارت زر بيفلتر القايمة على حالته (تحذير = قرب ينتهي +
            في السماح). الضغط تاني على نفس الكارت بيرجّع «الكل». */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "الكل", val: stat.total, c: "text-ink", filterKey: "all" },
            { label: "نشط", val: stat.active, c: "text-brand", filterKey: "active" },
            { label: "تحذير", val: stat.warn, c: "text-alert", filterKey: "warn" },
            { label: "مقطوع", val: stat.cut, c: "text-danger", filterKey: "expired" },
          ].map((s) => {
            const on = filter === s.filterKey;
            return (
              <button
                key={s.label}
                onClick={() => setFilter(on && s.filterKey !== "all" ? "all" : s.filterKey)}
                className={`rounded-xl border p-2.5 text-center transition active:scale-95 ${
                  on ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-surface"
                }`}
              >
                <p className={`text-xl font-black ${s.c}`}>{s.val}</p>
                <p className="text-[11px] text-muted">{s.label}</p>
              </button>
            );
          })}
        </div>

        {/* بحث + فلترة — فوق كل حاجة عشان توصل للمندوب بسرعة بالاسم/الإيميل/التليفون */}
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المندوب أو الإيميل أو التليفون..."
            className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${filter === f.key ? "border-primary bg-primary/15 text-primary font-bold" : "border-border text-muted"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* حسابات المناديب — لكل الأدمنز (مش السوبر بس): دفعات + ملاحظات + دخل الشهر */}
        <button onClick={() => router.push("/admin/accounts")}
          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-sm font-bold text-emerald-500 transition hover:bg-emerald-500/20 active:scale-[0.99]">
          <Wallet size={16} /> حسابات المناديب — الدفعات والدخل
        </button>

        {/* المجموعات — لكل الأدمنز (بطلب المالك): مين مع مين + مفاتيح
            الإشعارات ومشاركة السجلات. */}
        <button onClick={() => router.push("/admin/groups")}
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-bold text-primary transition hover:bg-primary/20 active:scale-[0.99]">
          <Users size={16} /> المجموعات — مين مع مين
        </button>

        {/* مواقع المناديب على الخريطة — سوبر أدمن فقط */}
        {isSuper && (
          <button onClick={() => router.push("/admin/locations")}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-bold text-primary transition hover:bg-primary/20 active:scale-[0.99]">
            <MapPin size={16} /> مواقع المناديب على الخريطة
          </button>
        )}

        {/* سجل الأحداث الأمنية — سوبر أدمن فقط */}
        {isSuper && (
          <button onClick={() => router.push("/admin/security")}
            className="flex items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/5 py-3 text-sm font-bold text-danger transition hover:bg-danger/10 active:scale-[0.99]">
            <ShieldAlert size={16} /> سجل الأمان — مين حاول يدخل
          </button>
        )}

        {/* ── صوت VoiceX لكل المناديب مرة واحدة — سوبر أدمن فقط ────────────── */}
        {isSuper && (
          <div className="rounded-xl border border-brand/40 bg-brand/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Mic size={15} /> صوت VoiceX — كل المناديب مرة واحدة
            </div>
            <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
              بيأثّر على <b>المناديب بس</b> — الأدمن والسوبر أدمن مايتأثروش.
            </p>

            {bulkConfirm ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-bold leading-relaxed text-danger">
                  متأكد إنك عايز {bulkConfirm === "on" ? "تفتح" : "تقفل"} الصوت لكل المناديب؟
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => void runVoicexBulk(bulkConfirm === "on")}
                    disabled={bulkBusy}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold text-white transition disabled:opacity-50 ${
                      bulkConfirm === "on" ? "bg-emerald-600" : "bg-danger"
                    }`}
                  >
                    {bulkBusy ? "…" : `أيوه، ${bulkConfirm === "on" ? "افتح" : "اقفل"} للكل`}
                  </button>
                  <button onClick={() => setBulkConfirm(null)} disabled={bulkBusy}
                    className="flex-1 rounded-lg border border-border py-2.5 text-xs font-bold text-muted disabled:opacity-50">
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={() => { setBulkMsg(null); setBulkConfirm("on"); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-600/10 py-2.5 text-xs font-bold text-emerald-600 transition hover:bg-emerald-600/20">
                  <LockOpen size={14} /> افتح للكل
                </button>
                <button onClick={() => { setBulkMsg(null); setBulkConfirm("off"); }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 py-2.5 text-xs font-bold text-danger transition hover:bg-danger/20">
                  <Lock size={14} /> اقفل للكل
                </button>
              </div>
            )}

            {bulkMsg && (
              <p className={`mt-2 rounded-lg px-2.5 py-2 text-[11px] font-bold ${
                bulkMsg.ok ? "bg-emerald-600/10 text-emerald-600" : "bg-danger/10 text-danger"
              }`}>
                {bulkMsg.text}
              </p>
            )}
          </div>
        )}

        {/* بث للمناديب — رسالة عادية أو استطلاع رأي. سوبر أدمن فقط. */}
        {isSuper && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
          {/* زرّين جمب بعض — كل واحد يفتح قسمه بس */}
          <div className="mb-2 flex gap-1.5">
            <button onClick={() => setBroadcastTab("notice")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${broadcastTab === "notice" ? "bg-primary text-night" : "bg-surface-2 text-muted"}`}>
              <Megaphone size={13} /> رسالة للمناديب
            </button>
            <button onClick={() => setBroadcastTab("poll")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${broadcastTab === "poll" ? "bg-primary text-night" : "bg-surface-2 text-muted"}`}>
              <BarChart3 size={13} /> استطلاع رأي
            </button>
            <button onClick={() => setBroadcastTab("push")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${broadcastTab === "push" ? "bg-primary text-night" : "bg-surface-2 text-muted"}`}>
              <BellRing size={13} /> إشعار هاتف
            </button>
          </div>

          {broadcastTab === "notice" && (<>
          {noticeActive ? (
            <div className="mb-2 rounded-lg border border-primary/30 bg-surface p-2">
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-ink">{noticeActive.text}</p>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-muted">
                  {noticeActive.until
                    ? `تنتهي: ${new Date(noticeActive.until).toLocaleString("ar-EG")}`
                    : "من غير مدة — بتفضل لحد ما تشيلها"}
                </span>
                <button
                  disabled={noticeBusy}
                  onClick={async () => {
                    if (!confirm("متأكد تشيل الرسالة من عند كل المناديب؟")) return;
                    setNoticeBusy(true);
                    const r = await setAppNotice("", 0);
                    if (r.ok) { setNoticeActive(null); setNoticeText(""); }
                    else alert("تعذّر المسح: " + (r.error ?? ""));
                    setNoticeBusy(false);
                  }}
                  className={`shrink-0 rounded-full border border-danger/50 bg-danger/10 px-3 py-1 text-[11px] font-bold text-danger transition ${noticeBusy ? "opacity-50" : ""}`}>
                  شيل الرسالة
                </button>
              </div>
            </div>
          ) : (
            <p className="mb-2 text-[11px] text-muted">
              مفيش رسالة شغّالة دلوقتي. اكتب رسالة وحدد مدتها — هتظهر لكل المناديب في أي صفحة،
              ولو المندوب قفلها هترجع تظهرله في أول تسجيل دخول جديد.
            </p>
          )}
          <textarea
            value={noticeText}
            onChange={(e) => setNoticeText(e.target.value)}
            rows={2}
            placeholder="اكتب الرسالة هنا…"
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-ink outline-none focus:border-primary"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <input type="checkbox" checked={noticeWa} onChange={(e) => setNoticeWa(e.target.checked)} className="accent-primary" />
              زر واتساب
            </label>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-danger" title="تطلع بالأحمر ومعاها صفّارة تفضل رنّانة لحد ما المندوب يقفلها">
              <input type="checkbox" checked={noticeUrgent} onChange={(e) => setNoticeUrgent(e.target.checked)} className="accent-red-600" />
              عاجلة 🚨
            </label>
            <select
              value={noticeHours}
              onChange={(e) => setNoticeHours(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary">
              {NOTICE_DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>{d.label}</option>
              ))}
            </select>
            <button
              disabled={noticeBusy || !noticeText.trim()}
              onClick={async () => {
                setNoticeBusy(true);
                const r = await setAppNotice(noticeText, noticeHours, noticeWa, noticeUrgent);
                if (r.ok) { setNoticeActive(await fetchAppNotice()); alert("اتنشرت للمناديب."); }
                else alert("تعذّر النشر: " + (r.error ?? ""));
                setNoticeBusy(false);
              }}
              className={`shrink-0 rounded-full bg-primary px-4 py-1.5 text-[11px] font-bold text-night transition ${noticeBusy || !noticeText.trim() ? "opacity-50" : ""}`}>
              {noticeBusy ? "..." : "انشر"}
            </button>
          </div>
          </>)}

          {broadcastTab === "push" && (<>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            ده إشعار بيطلع على شاشة الموبايل <b className="text-ink">حتى لو التطبيق مقفول</b> —
            مش زي الرسالة اللي فوق اللي بتظهر جوّه البرنامج. بيوصل بس للمناديب اللي مركّبين
            النسخة من المتجر وسمحوا بالإشعارات.
          </p>
          {/* رسالة جاهزة — أكتر استخدام متوقّع */}
          <button
            onClick={() => setPushText("نزل تحديث جديد للبرنامج — حدّث التطبيق من المتجر.")}
            className="mb-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary transition hover:bg-primary/20">
            + رسالة «فيه تحديث»
          </button>
          <textarea
            value={pushText}
            onChange={(e) => { setPushText(e.target.value); setPushMsg(null); }}
            rows={2}
            maxLength={200}
            placeholder="اكتب نص الإشعار…"
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-ink outline-none focus:border-primary"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={pushTarget}
                onChange={(e) => setPushTarget(e.target.value as "all" | "team")}
                className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary">
                <option value="all">كل المناديب</option>
                <option value="team">مجموعة معيّنة</option>
              </select>
              {pushTarget === "team" && (
                <select
                  value={pushTeam}
                  onChange={(e) => setPushTeam(e.target.value)}
                  className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary">
                  <option value="">اختار المجموعة…</option>
                  {Array.from(new Set(agents.map((a) => a.team).filter(Boolean) as string[]))
                    .sort()
                    .map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
            <button
              disabled={pushBusy || !pushText.trim() || (pushTarget === "team" && !pushTeam)}
              onClick={async () => {
                const who = pushTarget === "team" ? `مجموعة «${pushTeam}»` : "كل المناديب";
                if (!confirm(`تبعت الإشعار ده لـ${who}؟\n\n${pushText.trim()}`)) return;
                setPushBusy(true); setPushMsg(null);
                try {
                  const res = await fetch("/api/admin/push", {
                    method: "POST", headers: await authHeaders(),
                    body: JSON.stringify({
                      body: pushText.trim(),
                      target: pushTarget,
                      ...(pushTarget === "team" ? { team: pushTeam } : {}),
                    }),
                  });
                  const j = await res.json();
                  if (!res.ok) setPushMsg({ ok: false, text: j.error ?? "تعذّر الإرسال." });
                  else if (j.devices === 0) setPushMsg({ ok: false, text: "مفيش أي جهاز مسجّل للإشعارات لسه — لازم المناديب يحدّثوا التطبيق من المتجر ويسمحوا بالإشعارات." });
                  else { setPushMsg({ ok: true, text: `اتبعت لـ${j.sent} جهاز من ${j.devices}.` }); setPushText(""); }
                } catch {
                  setPushMsg({ ok: false, text: "مافيش اتصال — جرّب تاني." });
                }
                setPushBusy(false);
              }}
              className={`shrink-0 rounded-full bg-primary px-4 py-1.5 text-[11px] font-bold text-night transition ${pushBusy || !pushText.trim() || (pushTarget === "team" && !pushTeam) ? "opacity-50" : ""}`}>
              {pushBusy ? "..." : "ابعت الإشعار"}
            </button>
          </div>
          {pushMsg && (
            <p className={`mt-2 rounded-lg px-2.5 py-2 text-[11px] font-bold ${pushMsg.ok ? "bg-emerald-600/10 text-emerald-600" : "bg-danger/10 text-danger"}`}>
              {pushMsg.text}
            </p>
          )}
          </>)}

          {broadcastTab === "poll" && (<>
          {activePoll ? (
            <div className="mb-3 rounded-lg border border-primary/30 bg-surface p-2.5">
              <p className="mb-2 text-[11px] font-bold text-ink">{activePoll.question}</p>
              {(() => {
                const total = pollResults.length;
                return activePoll.options.map((opt, i) => {
                  const voters = pollResults.filter((v) => v.choice === i);
                  const pct = total ? Math.round((voters.length / total) * 100) : 0;
                  return (
                    <div key={i} className="mb-2">
                      <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-ink">{opt}</span>
                        <span className="shrink-0 text-muted">{voters.length} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      {voters.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {voters.map((v) => (
                            <span key={v.agentId} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-ink">
                              {v.username || "—"}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted">صوّت {pollResults.length} مندوب</span>
                <div className="flex gap-1.5">
                  <button
                    disabled={pollBusy}
                    onClick={() => { setPollBusy(true); loadPoll().finally(() => setPollBusy(false)); }}
                    className={`shrink-0 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary transition ${pollBusy ? "opacity-50" : ""}`}>
                    تحديث
                  </button>
                  <button
                    disabled={pollBusy}
                    onClick={async () => {
                      if (!confirm("متأكد تقفل الاستطلاع؟ مش هيقدر حد يصوّت بعد كده.")) return;
                      setPollBusy(true);
                      const ok = await closePoll(activePoll.id);
                      if (ok) await loadPoll();
                      else alert("تعذّر القفل.");
                      setPollBusy(false);
                    }}
                    className={`shrink-0 rounded-full border border-danger/50 bg-danger/10 px-3 py-1 text-[11px] font-bold text-danger transition ${pollBusy ? "opacity-50" : ""}`}>
                    اقفل الاستطلاع
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="mb-2 text-[11px] text-muted">
              مفيش استطلاع شغّال. اكتب سؤال وخياراته — هيظهر لكل المناديب، وكل واحد يختار خيار
              واحد (يقدر يغيّره)، وتشوف هنا مين اختار إيه. نشر استطلاع جديد بيقفل القديم.
            </p>
          )}

          <textarea
            value={pollQ}
            onChange={(e) => setPollQ(e.target.value)}
            rows={2}
            placeholder="اكتب سؤال الاستطلاع…"
            className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs text-ink outline-none focus:border-primary"
          />
          <div className="mt-1.5 flex flex-col gap-1.5">
            {pollOpts.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={opt}
                  onChange={(e) => setPollOpts((os) => os.map((o, j) => (j === i ? e.target.value : o)))}
                  placeholder={`خيار ${i + 1}`}
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-ink outline-none focus:border-primary"
                />
                {pollOpts.length > 2 && (
                  <button
                    onClick={() => setPollOpts((os) => os.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-1 text-muted transition hover:text-danger" title="حذف الخيار">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <button
              onClick={() => setPollOpts((os) => [...os, ""])}
              className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary transition">
              + خيار
            </button>
            <button
              disabled={pollBusy || !pollQ.trim() || pollOpts.filter((o) => o.trim()).length < 2}
              onClick={async () => {
                setPollBusy(true);
                const res = await createPoll(pollQ, pollOpts);
                if (res.id) { setPollQ(""); setPollOpts(["", ""]); await loadPoll(); alert("اتنشر الاستطلاع للمناديب."); }
                else alert("تعذّر النشر: " + (res.error ?? "خطأ غير معروف"));
                setPollBusy(false);
              }}
              className={`shrink-0 rounded-full bg-primary px-4 py-1.5 text-[11px] font-bold text-night transition ${pollBusy || !pollQ.trim() || pollOpts.filter((o) => o.trim()).length < 2 ? "opacity-50" : ""}`}>
              {pollBusy ? "..." : "انشر الاستطلاع"}
            </button>
          </div>
          </>)}
        </div>
        )}

        {/* List */}
        <div className="flex flex-col gap-2">
          {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}
          {!loading && filtered.map(({ a, sub }) => {
            const act = activityStatus(a.last_seen);
            return (
            <div key={a.id} data-agent-id={a.id} role="button" tabIndex={0} onClick={() => openAgent(a.id)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-right transition ${
                a.is_super ? "border-2 bg-black hover:opacity-90" : "border-border bg-surface hover:border-primary/50"
              }`}
              style={a.is_super ? { borderColor: "#D4AF37" } : undefined}>
              <CircleUserRound size={26} className={`shrink-0 ${a.is_super ? "" : "text-muted"}`} style={a.is_super ? { color: "#D4AF37" } : undefined} />
              <div className="min-w-0 flex-1 leading-tight">
                {/* السطر ١: نقطة النشاط + الاسم (يتقصّ بلُطف) + الدور/تجربة/مقفول */}
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${act.online ? "bg-green-500 animate-pulse" : "bg-muted/40"}`} title={act.label} />
                  <span className="truncate text-sm font-bold text-ink" title={a.username} style={a.is_super ? { color: "#F4D160" } : undefined}>{a.username}</span>
                  {a.role === "admin" && (
                    a.is_super
                      ? <span className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ color: "#0a0a0a", background: "#D4AF37" }}><Gem size={9} /> سوبر</span>
                      : <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">أدمن</span>
                  )}
                  {a.is_trial && a.role === "agent" && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-bold text-brand"><Clock size={9} /> تجربة</span>
                  )}
                  {!a.is_active && <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold text-danger">مقفول</span>}
                  {/* شارة الدفع الشهر الحالي: «عليه مبلغ» (أحمر) أو «دفع اشتراك الشهر» (أخضر) */}
                  {a.role === "agent" && (() => {
                    const paid = paidByAgent[a.id] ?? 0;
                    const owed = Number(a.owed_amount || 0);
                    if (owed > 0) return <span className="shrink-0 rounded-full bg-danger/15 px-1.5 py-0.5 text-[9px] font-bold text-danger" title={`عليه ${fmtSar(owed)} ريال`}>عليه {fmtSar(owed)}</span>;
                    if (paid > 0) return <span className="shrink-0 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[9px] font-bold text-green-600" title={`دفع اشتراك شهر ${curMonthLabel()} كامل`}>✓ دفع {curMonthLabel()}</span>;
                    return null;
                  })()}
                </div>
                {/* مين الأدمن اللي ضاف المندوب ده */}
                {creatorOf[a.id] && (
                  <div className="mt-0.5 flex items-center gap-1 text-[9px] text-muted">
                    <UserPlus size={9} className="shrink-0" />
                    <span className="truncate">أضافه: {creatorOf[a.id]}</span>
                  </div>
                )}
                {/* السطر ٢: النسخة + الجهاز + حالة الاشتراك */}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {a.app_version
                    ? (a.app_version === APP_VERSION
                        ? <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[9px] font-bold text-green-500">أحدث نسخة</span>
                        : <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-bold text-orange-500" title={`المندوب على ${a.app_version} — الأحدث ${APP_VERSION}`}>نسخة {a.app_version}</span>)
                    : <span className="rounded-full bg-muted/15 px-1.5 py-0.5 text-[9px] text-muted">نسخة غير معروفة</span>}
                  {a.role === "agent" && (
                    a.device_lock_exempt
                      ? <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[9px] font-bold text-orange-500" title="يدخل من أي جهاز">🔓 أي جهاز</span>
                      : a.device_fingerprint
                        ? <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[9px] font-bold text-green-600" title="مربوط بجهاز واحد">📱 جهاز واحد</span>
                        : <span className="rounded-full bg-muted/15 px-1.5 py-0.5 text-[9px] text-muted" title={deviceBindingState(a.device_fingerprint, a.last_seen) === "reset" ? "اتعمله إعادة ضبط" : "لسه مادخلش"}>جهاز؟</span>
                  )}
                  {a.role === "agent" && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ color: sub.color, background: `${sub.color}22` }}>{sub.label}</span>
                  )}
                </div>
                {/* السطر ٣: آخر ظهور (كامل، بلا قصّ) */}
                <p className="mt-1 text-[11px]"><span className={act.online ? "font-bold text-green-500" : (a.is_super ? "" : "text-muted")} style={a.is_super && !act.online ? { color: "#D4AF37AA" } : undefined}>{act.label}</span></p>
                {/* التليفون + الإيميل — كاملين بلا قصّ */}
                <p className="text-[11px] text-muted" dir="ltr" style={a.is_super ? { color: "#D4AF37AA" } : undefined}>{a.phone || "بدون تليفون"}</p>
                {a.email && <p className="break-all text-[11px] text-muted" dir="ltr" style={a.is_super ? { color: "#D4AF37AA" } : undefined}>{a.email}</p>}
              </div>
              {/* أزرار مدمجة عمودياً عشان ماتاخدش عرض من بيانات المندوب */}
              <div className="flex shrink-0 flex-col items-center gap-1.5">
                {a.role === "agent" && (
                  <button
                    onClick={(e) => toggleActive(a, e)}
                    title={a.is_active ? "مفتوح — دوس للقفل المؤقت" : "مقفول — دوس للفتح (يرجع بنفس تواريخ الاشتراك)"}
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition ${a.is_active ? "bg-green-500/15 text-green-600 hover:bg-green-500/30" : "bg-danger/15 text-danger hover:bg-danger/30"}`}>
                    {a.is_active ? <LockOpen size={14} /> : <Lock size={14} />}
                  </button>
                )}
                {/* #25 — أيقونتين سريعتين: الصوت (VoiceX) + باقي صفحات البرنامج */}
                {a.role === "agent" && (() => {
                  const vx = !!a.voicex_enabled;
                  const rest = a.rest_pages_enabled !== false; // undefined → مفتوح
                  return (
                    <>
                      <button
                        onClick={(e) => toggleAgentFlag(a, "setVoicexEnabled", !vx, e)}
                        title={vx ? "صوت VoiceX مفعّل — دوس للرجوع لديبجرام" : "صوت ديبجرام — دوس لتفعيل VoiceX"}
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${vx ? "bg-green-500/15 text-green-600 hover:bg-green-500/30" : "bg-danger/15 text-danger hover:bg-danger/30"}`}>
                        <Mic size={14} />
                      </button>
                      <button
                        onClick={(e) => toggleAgentFlag(a, "setRestPages", !rest, e)}
                        title={rest ? "باقي الصفحات مفتوحة — دوس لقفلها (صوت فقط)" : "مقفولة (صوت فقط) — دوس لفتحها"}
                        className={`flex h-7 w-7 items-center justify-center rounded-full transition ${rest ? "bg-green-500/15 text-green-600 hover:bg-green-500/30" : "bg-danger/15 text-danger hover:bg-danger/30"}`}>
                        <LayoutGrid size={14} />
                      </button>
                    </>
                  );
                })()}
                {waLink(a.phone) && (
                  <a href={waLink(a.phone)!} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()} title="مراسلة على واتساب"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/15 text-green-500 transition hover:bg-green-500/30">
                    <MessageCircle size={14} />
                  </a>
                )}
              </div>
              <ArrowRight size={15} className={`shrink-0 ${a.is_super ? "" : "text-muted"}`} style={a.is_super ? { color: "#D4AF37" } : undefined} />
            </div>
            );
          })}
          {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">لا توجد نتائج.</p>}
        </div>
      </div>

      {/* Create modal.
          النافذة كانت بتتقصّ لما لوحة المفاتيح تطلع: بقت تتمرّر جوّه نفسها،
          وأول ما المندوب يدوس على خانة بتتزحلق لنص الشاشة بعد ما الكيبورد
          يخلّص حركته — فالكلام اللي بيتكتب يفضل باين. */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/70 p-4 sm:items-center">
          <div
            onFocus={(e) => {
              const el = e.target as HTMLElement;
              if (!el.matches?.("input, textarea, select")) return;
              setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 280);
            }}
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-surface p-5"
            style={{ maxHeight: "85dvh" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">حساب جديد</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="اسم المندوب (يظهر في القائمة)" dir="rtl"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="الإيميل ✱ إجباري" dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="كلمة المرور (٦ أحرف+)" dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <input value={cPhone} onChange={(e) => setCPhone(e.target.value)}
                placeholder={cTrial ? "رقم واتساب (اختياري)" : "رقم واتساب المندوب ✱ إجباري"} dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />

              {/* توجّل حساب التجربة المجانية */}
              <button
                onClick={() => { setCTrial((v) => !v); setCRole("agent"); }}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${cTrial ? "border-brand bg-brand/15 text-brand font-bold" : "border-border text-muted"}`}
              >
                <span className="flex items-center gap-2"><Clock size={15} /> تجربة مجانية ٣ أيام</span>
                <span className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${cTrial ? "bg-brand justify-end" : "bg-border justify-start"}`}>
                  <span className="h-4 w-4 rounded-full bg-white" />
                </span>
              </button>

              {cTrial ? (
                <p className="rounded-lg bg-brand/10 px-3 py-2 text-[11px] leading-relaxed text-brand">
                  الحساب هيشتغل ٣ أيام من دلوقتي، وبعدها يتقفل تلقائياً وتظهر رسالة انتهاء التجربة (بدون فترة سماح). التليفون اختياري.
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    {(["agent", "admin"] as const).map((r) => (
                      <button key={r} onClick={() => setCRole(r)}
                        className={`flex-1 rounded-lg border py-2 text-sm transition ${cRole === r ? "border-primary bg-primary/15 text-primary font-bold" : "border-border text-muted"}`}>
                        {r === "agent" ? "مندوب" : "أدمن"}
                      </button>
                    ))}
                  </div>
                  {cRole === "agent" && (
                    <label className="flex items-center justify-between gap-2 text-xs text-muted">
                      الاشتراك حتى:
                      <input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)}
                        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
                    </label>
                  )}
                </>
              )}

              {/* صلاحيتا المندوب من أول لحظة — أخضر = شغّال عنده، أحمر = واقف.
                  نفس زرّي القائمة وصفحة المندوب، عشان المالك مايضطرش ينشئ
                  الحساب الأول وبعدين يفتح صفحته يظبّطهم. للسوبر أدمن بس. */}
              {isSuper && cRole === "agent" && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                  <p className="text-[11px] font-bold text-muted">اللي هيشتغل عند المندوب:</p>
                  <button
                    onClick={() => setCVoicex((v) => !v)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${cVoicex ? "border-green-500 bg-green-500/15 text-green-600 font-bold" : "border-danger/50 bg-danger/10 text-danger"}`}
                  >
                    <span className="flex items-center gap-2"><Mic size={15} /> صوت VoiceX</span>
                    <span className="text-[11px] font-bold">{cVoicex ? "شغّال" : "واقف (ديبجرام)"}</span>
                  </button>
                  <button
                    onClick={() => setCRestPages((v) => !v)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${cRestPages ? "border-green-500 bg-green-500/15 text-green-600 font-bold" : "border-danger/50 bg-danger/10 text-danger"}`}
                  >
                    <span className="flex items-center gap-2"><LayoutGrid size={15} /> باقي صفحات البرنامج</span>
                    <span className="text-[11px] font-bold">{cRestPages ? "مفتوحة" : "مقفولة (صوت فقط)"}</span>
                  </button>
                  {!cRestPages && !cVoicex && (
                    <p className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-danger">
                      الاتنين واقفين = الحساب مقفول تماماً، مش هيقدر يفتح أي صفحة.
                    </p>
                  )}
                </div>
              )}
              {cError && (
                <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                  <AlertCircle size={14} /> {cError}
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted">إلغاء</button>
                <button onClick={handleCreate} disabled={creating}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60">
                  {creating ? "جارٍ..." : "إنشاء"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

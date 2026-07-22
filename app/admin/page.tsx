"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus, Search, Users, ShieldCheck, ArrowRight, X, AlertCircle,
  ChevronLeft, CalendarClock, CircleUserRound, Gem, Clock, MapPin, MessageCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus, type SubStatus } from "@/lib/subscription";
import { APP_VERSION } from "@/lib/appVersion";

interface AgentProfile {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: "admin" | "agent";
  is_super: boolean;
  is_trial: boolean;
  is_active: boolean;
  device_fingerprint: string | null;
  last_seen: string | null;
  subscription_end: string | null;
  subscription_amount: number | null;
  app_version: string | null;
  created_at: string;
}

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
];

export default function AdminDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cRole, setCRole] = useState<"agent" | "admin">("agent");
  const [cTrial, setCTrial] = useState(false);
  const [cEnd, setCEnd] = useState(addMonths(1));
  const [cError, setCError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("username", { ascending: true });
    if (data) setAgents(data as AgentProfile[]);
    setLoading(false);
  }, []);

  // Access guard — admins only.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (prof?.role !== "admin") { router.replace("/sorting"); return; }
      setIsSuper(!!prof?.is_super);
      setAuthorized(true);
      loadAgents();
    })();
  }, [router, loadAgents]);

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
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCError(json.error ?? "خطأ غير متوقع."); return; }
      setShowCreate(false);
      setCName(""); setCEmail(""); setCPassword(""); setCPhone(""); setCRole("agent"); setCTrial(false); setCEnd(addMonths(1));
      loadAgents();
    } catch { setCError("تعذّر الاتصال بالخادم."); }
    finally { setCreating(false); }
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
        if (a.role === "admin") return false;
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
  const expiringSoon = agentsOnly
    .filter((e) => e.sub.status === "expiring" || e.sub.status === "grace")
    .sort((x, y) => x.sub.daysLeft - y.sub.daysLeft);

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

        {/* Summary */}
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "الكل", val: stat.total, c: "text-ink" },
            { label: "نشط", val: stat.active, c: "text-brand" },
            { label: "تحذير", val: stat.warn, c: "text-alert" },
            { label: "مقطوع", val: stat.cut, c: "text-danger" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-2.5">
              <p className={`text-xl font-black ${s.c}`}>{s.val}</p>
              <p className="text-[11px] text-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {/* مواقع المناديب على الخريطة — سوبر أدمن فقط */}
        {isSuper && (
          <button onClick={() => router.push("/admin/locations")}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-bold text-primary transition hover:bg-primary/20 active:scale-[0.99]">
            <MapPin size={16} /> مواقع المناديب على الخريطة
          </button>
        )}

        {/* Expiring soon */}
        {expiringSoon.length > 0 && (
          <div className="rounded-xl border border-alert/40 bg-alert/5 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-alert">
              <CalendarClock size={14} /> قرب ينتهي اشتراكهم ({expiringSoon.length})
            </div>
            <div className="flex flex-col gap-1">
              {expiringSoon.slice(0, 5).map(({ a, sub }) => (
                <button key={a.id} onClick={() => router.push(`/admin/${a.id}`)}
                  className="flex items-center justify-between rounded-lg px-2 py-1 text-xs hover:bg-surface transition">
                  <span className="truncate text-ink">{a.username}</span>
                  <span className="shrink-0 font-bold" style={{ color: sub.color }}>{sub.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search + filter */}
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث بالإيميل/التليفون..."
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

        {/* List */}
        <div className="flex flex-col gap-2">
          {loading && <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>}
          {!loading && filtered.map(({ a, sub }) => {
            const act = activityStatus(a.last_seen);
            return (
            <div key={a.id} role="button" tabIndex={0} onClick={() => router.push(`/admin/${a.id}`)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-right transition ${
                a.is_super ? "border-2 bg-black hover:opacity-90" : "border-border bg-surface hover:border-primary/50"
              }`}
              style={a.is_super ? { borderColor: "#D4AF37" } : undefined}>
              <CircleUserRound size={30} className={`shrink-0 ${a.is_super ? "" : "text-muted"}`} style={a.is_super ? { color: "#D4AF37" } : undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {/* نقطة حالة النشاط قدام الاسم — أخضر = نشط، رمادي = مش فاتح */}
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${act.online ? "bg-green-500 animate-pulse" : "bg-muted/40"}`}
                    title={act.label} />
                  <span className="truncate text-sm font-bold text-ink" style={a.is_super ? { color: "#F4D160" } : undefined}>{a.username}</span>
                  {a.role === "admin" && (
                    a.is_super ? (
                      <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ color: "#0a0a0a", background: "#D4AF37" }}>
                        <Gem size={10} /> سوبر أدمن
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">أدمن</span>
                    )
                  )}
                  {a.is_trial && a.role === "agent" && (
                    <span className="flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand"><Clock size={10} /> تجربة</span>
                  )}
                  {!a.is_active && <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">معطّل</span>}
                  {/* نسخة البرنامج اللي المندوب شغّال بيها — أخضر=أحدث، برتقالي=قديمة، رمادي=غير معروفة */}
                  {a.app_version
                    ? (a.app_version === APP_VERSION
                        ? <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-500">أحدث نسخة</span>
                        : <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold text-orange-500" title={`المندوب على ${a.app_version} — الأحدث ${APP_VERSION}`}>نسخة قديمة {a.app_version}</span>)
                    : <span className="rounded-full bg-muted/15 px-1.5 py-0.5 text-[10px] text-muted">نسخة غير معروفة</span>}
                </div>
                <p className="truncate text-[11px]" style={a.is_super ? { color: "#D4AF37AA" } : undefined}>
                  <span className={act.online ? "font-bold text-green-500" : "text-muted"}>{act.label}</span>
                </p>
                {/* رقم التليفون + الإيميل — كل واحد في سطر مستقل تحت الاسم (واضحين) */}
                <p className="truncate text-[11px] text-muted" dir="ltr" style={a.is_super ? { color: "#D4AF37AA" } : undefined}>{a.phone || "بدون تليفون"}</p>
                {a.email && <p className="truncate text-[11px] text-muted" dir="ltr" style={a.is_super ? { color: "#D4AF37AA" } : undefined}>{a.email}</p>}
              </div>
              {a.role === "agent" && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: sub.color, background: `${sub.color}22` }}>
                  {sub.label}
                </span>
              )}
              {/* علامة واتساب — تفتح شات المندوب على رقمه (لو ليه تليفون). */}
              {waLink(a.phone) && (
                <a href={waLink(a.phone)!} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()} title="مراسلة على واتساب"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-500 transition hover:bg-green-500/30">
                  <MessageCircle size={16} />
                </a>
              )}
              <ArrowRight size={16} className={`shrink-0 ${a.is_super ? "" : "text-muted"}`} style={a.is_super ? { color: "#D4AF37" } : undefined} />
            </div>
            );
          })}
          {!loading && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted">لا توجد نتائج.</p>}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
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
                <span className="flex items-center gap-2"><Clock size={15} /> تجربة مجانية ١٥ يوم</span>
                <span className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${cTrial ? "bg-brand justify-end" : "bg-border justify-start"}`}>
                  <span className="h-4 w-4 rounded-full bg-white" />
                </span>
              </button>

              {cTrial ? (
                <p className="rounded-lg bg-brand/10 px-3 py-2 text-[11px] leading-relaxed text-brand">
                  الحساب هيشتغل ١٥ يوم من دلوقتي، وبعدها يتقفل تلقائياً وتظهر رسالة انتهاء التجربة. التليفون اختياري.
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

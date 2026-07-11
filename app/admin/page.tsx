"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus, Search, Users, ShieldCheck, ArrowRight, X, AlertCircle,
  ChevronLeft, CalendarClock, CircleUserRound, Gem,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus, type SubStatus } from "@/lib/subscription";

interface AgentProfile {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: "admin" | "agent";
  is_super: boolean;
  is_active: boolean;
  device_fingerprint: string | null;
  last_seen: string | null;
  subscription_end: string | null;
  subscription_amount: number | null;
  created_at: string;
}

function addMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
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
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [cEmail, setCEmail] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cRole, setCRole] = useState<"agent" | "admin">("agent");
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
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
      if (prof?.role !== "admin") { router.replace("/dashboard"); return; }
      setAuthorized(true);
      loadAgents();
    })();
  }, [router, loadAgents]);

  async function handleCreate() {
    setCError(null);
    if (!cEmail.trim() || cPassword.length < 6) {
      setCError("الإيميل وكلمة مرور (٦ أحرف على الأقل) مطلوبان."); return;
    }
    if (cRole === "agent" && !cPhone.trim()) {
      setCError("رقم التليفون مطلوب للمندوب."); return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/create-agent", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          email: cEmail, password: cPassword, phone: cPhone,
          role: cRole, subscriptionEnd: cRole === "agent" ? cEnd : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setCError(json.error ?? "خطأ غير متوقع."); return; }
      setShowCreate(false);
      setCEmail(""); setCPassword(""); setCPhone(""); setCRole("agent"); setCEnd(addMonths(1));
      loadAgents();
    } catch { setCError("تعذّر الاتصال بالخادم."); }
    finally { setCreating(false); }
  }

  const enriched = useMemo(() => agents.map((a) => ({ a, sub: subStatus(a.subscription_end) })), [agents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ a, sub }) => {
      if (q && !(a.username?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) || a.phone?.includes(q))) return false;
      if (filter === "all") return true;
      if (a.role === "admin") return false;
      return sub.status === (filter as SubStatus);
    });
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
          <button onClick={() => router.push("/dashboard")}
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
          {!loading && filtered.map(({ a, sub }) => (
            <button key={a.id} onClick={() => router.push(`/admin/${a.id}`)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-right transition ${
                a.is_super ? "border-2 bg-black hover:opacity-90" : "border-border bg-surface hover:border-primary/50"
              }`}
              style={a.is_super ? { borderColor: "#D4AF37" } : undefined}>
              <CircleUserRound size={30} className={`shrink-0 ${a.is_super ? "" : "text-muted"}`} style={a.is_super ? { color: "#D4AF37" } : undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
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
                  {!a.is_active && <span className="rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">معطّل</span>}
                </div>
                <p className="truncate text-[11px] text-muted" style={a.is_super ? { color: "#D4AF37AA" } : undefined}>{a.phone || "بدون تليفون"}</p>
              </div>
              {a.role === "agent" && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: sub.color, background: `${sub.color}22` }}>
                  {sub.label}
                </span>
              )}
              <ArrowRight size={16} className={`shrink-0 ${a.is_super ? "" : "text-muted"}`} style={a.is_super ? { color: "#D4AF37" } : undefined} />
            </button>
          ))}
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
              <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="الإيميل ✱ إجباري" dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <input type="password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="كلمة المرور (٦ أحرف+)" dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="رقم واتساب المندوب ✱ إجباري" dir="ltr"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
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

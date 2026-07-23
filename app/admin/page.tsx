"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus, Search, Users, ShieldCheck, ArrowRight, X, AlertCircle,
  ChevronLeft, CalendarClock, CircleUserRound, Gem, Clock, MapPin, MessageCircle, Database,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus, type SubStatus } from "@/lib/subscription";
import { APP_VERSION } from "@/lib/appVersion";
import { fetchLearningEnabled, setLearningEnabled } from "@/lib/learningSettings";

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
  const [learningOn, setLearningOn] = useState(false);   // مفتاح جمع/تعلّم الصوت (سوبر أدمن)
  const [learningBusy, setLearningBusy] = useState(false);
  const [trainingCount, setTrainingCount] = useState(0); // عيّنات متجمّعة على الجهاز
  const [trainingBusy, setTrainingBusy] = useState(false);
  const [pendingByAgent, setPendingByAgent] = useState<Array<{ agentId: string; count: number }>>([]); // معلّق مركزي
  const [centralBusy, setCentralBusy] = useState(false);
  const [centralLoaded, setCentralLoaded] = useState(false);
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
      if (prof?.is_super) {
        fetchLearningEnabled().then(setLearningOn);  // حالة مفتاح التعلّم
        import("@/lib/trainingStore").then((m) => m.countTrainingSamples().then(setTrainingCount).catch(() => {}));
      }
      setAuthorized(true);
      loadAgents();
    })();
  }, [router, loadAgents]);

  // ── تنزيل/مسح داتا التدريب المتجمّعة (سوبر أدمن) ──
  function downloadBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function handleDownloadTraining() {
    setTrainingBusy(true);
    try {
      const store = await import("@/lib/trainingStore");
      const { buildTrainingManifest, mimeToExt } = await import("@/lib/trainingExport");
      const [samples, sessions] = await Promise.all([store.getAllTrainingSamples(), store.getAllTrainingSessions()]);
      if (samples.length === 0) { alert("مفيش داتا تدريب متجمّعة على الجهاز ده لسه. سجّل صوت وصدّر الأول."); return; }
      const manifest = buildTrainingManifest(samples, sessions);
      downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }), "training-labels.json");
      for (const sess of sessions) {
        const buf = base64ToBytes(sess.audioBase64).buffer as ArrayBuffer;
        downloadBlob(new Blob([buf], { type: sess.mimeType }), `${sess.sessionId}.${mimeToExt(sess.mimeType)}`);
      }
      alert(`تم تنزيل ${manifest.count} لوحة في ${manifest.sessionCount} مقطع + ملف اللوحات (training-labels.json).`);
    } catch (e) { alert("تعذّر التنزيل: " + ((e as Error)?.message ?? "")); }
    finally { setTrainingBusy(false); }
  }
  async function handleClearTraining() {
    if (!confirm("متأكد؟ ده هيمسح كل داتا التدريب المتجمّعة على الجهاز ده. نزّلها الأول لو محتاجها.")) return;
    setTrainingBusy(true);
    try { const store = await import("@/lib/trainingStore"); await store.clearTrainingData(); setTrainingCount(0); }
    catch (e) { alert("تعذّر المسح: " + ((e as Error)?.message ?? "")); }
    finally { setTrainingBusy(false); }
  }

  // ── داتا المناديب المركزية (من Supabase) ──
  const usernameOf = (agentId: string) => agents.find((a) => a.id === agentId)?.username || agentId;
  async function loadPending() {
    try { const c = await import("@/lib/trainingCentral"); setPendingByAgent(await c.listPendingByAgent()); setCentralLoaded(true); }
    catch (e) { alert("تعذّر تحميل القائمة: " + ((e as Error)?.message ?? "")); }
  }
  async function downloadNew(agentId?: string) {
    setCentralBusy(true);
    try {
      const c = await import("@/lib/trainingCentral");
      const rows = await c.fetchPendingSamples(agentId);
      if (rows.length === 0) { alert("مفيش لوحات جديدة."); return; }
      const manifest = c.buildCentralManifest(rows);
      for (const agent of manifest.agents) {
        const sessions = [];
        for (const s of agent.sessions) {
          let audioBase64: string | null = null, mimeType: string | null = null;
          if (s.audioPath) { const a = await c.fetchAudioBase64(s.audioPath); if (a) { audioBase64 = a.base64; mimeType = a.mimeType; } }
          sessions.push({ sessionId: s.sessionId, audioBase64, mimeType, plates: s.plates });
        }
        const name = usernameOf(agent.agentId);
        const out = { agentId: agent.agentId, username: name, sampleCount: agent.sampleCount, sessions };
        downloadBlob(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }), `training-${name}-${Date.now()}.json`);
      }
      await c.markDownloaded(rows.map((r) => r.id));
      await loadPending();
      alert(`تم تنزيل ${rows.length} لوحة جديدة (${manifest.agents.length} مندوب) وتعليمها كمُنزَّلة — مش هتتكرر.`);
    } catch (e) { alert("تعذّر التنزيل: " + ((e as Error)?.message ?? "")); }
    finally { setCentralBusy(false); }
  }
  async function purgeDownloadedServer() {
    if (!confirm("مسح كل المُنزَّل من السيرفر (اللي نزّلته قبل كده)؟ ده بيفضّي مساحة Supabase. الجديد اللي لسه ماتنزّلش مش هيتمسح.")) return;
    setCentralBusy(true);
    try { const c = await import("@/lib/trainingCentral"); const r = await c.purgeDownloaded(); alert(`تم مسح ${r.deleted} عيّنة مُنزَّلة من السيرفر.`); }
    catch (e) { alert("تعذّر المسح: " + ((e as Error)?.message ?? "")); }
    finally { setCentralBusy(false); }
  }
  // تشخيص كامل لمسار التعلّم على الجهاز ده — يبيّن فين المشكلة بالظبط.
  async function handleLearningDiagnostics() {
    setCentralBusy(true);
    const lines: string[] = [];
    try {
      const on = await fetchLearningEnabled();
      lines.push(`المفتاح (من السيرفر): ${on ? "شغّال ✓" : "متوقّف ✗"}`);
    } catch (e) { lines.push("المفتاح: خطأ — " + ((e as Error)?.message ?? "")); }
    try {
      const s = await import("@/lib/trainingStore");
      const [samples, sessions, unsynced] = await Promise.all([s.getAllTrainingSamples(), s.getAllTrainingSessions(), s.getUnsyncedSamples()]);
      lines.push(`محلي على الجهاز ده: ${samples.length} لوحة، ${sessions.length} مقطع صوت، ${unsynced.length} لسه ما اترفعتش`);
    } catch (e) { lines.push("المحلي: خطأ — " + ((e as Error)?.message ?? "")); }
    try {
      const { syncTrainingData } = await import("@/lib/trainingSync");
      const r = await syncTrainingData();
      lines.push(`الرفع لـ Supabase: ${r.uploaded} اترفعت${r.error ? ` — خطأ: ${r.error}` : " ✓"}`);
    } catch (e) { lines.push("الرفع: خطأ — " + ((e as Error)?.message ?? "")); }
    try {
      const c = await import("@/lib/trainingCentral");
      const pend = await c.listPendingByAgent();
      lines.push(`على السيرفر (كل المناديب): ${pend.reduce((a, x) => a + x.count, 0)} لوحة معلّقة`);
    } catch (e) { lines.push("السيرفر: خطأ — " + ((e as Error)?.message ?? "")); }
    setCentralBusy(false);
    alert(lines.join("\n"));
  }

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

        {/* مفتاح جمع/تعلّم الصوت + تنزيل الداتا — سوبر أدمن فقط. الافتراضي متوقّف. */}
        {isSuper && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink">
              <Database size={14} /> جمع بيانات الصوت للتعلّم
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] leading-relaxed text-muted">
                لما يكون شغّال، البرنامج بيجمّع (صوت اللوحة + اللوحة الصح) للتدريب لاحقاً. الافتراضي متوقّف — سوبر أدمن فقط.
              </p>
              <button
                disabled={learningBusy}
                onClick={async () => {
                  setLearningBusy(true);
                  const next = !learningOn;
                  const r = await setLearningEnabled(next);
                  if (r.ok) setLearningOn(next);
                  else alert("تعذّر الحفظ: " + (r.error ?? ""));
                  setLearningBusy(false);
                }}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  learningOn ? "bg-green-600 text-white" : "border border-border bg-surface-2 text-muted"
                } ${learningBusy ? "opacity-50" : ""}`}>
                {learningBusy ? "..." : learningOn ? "شغّال ✓" : "متوقّف"}
              </button>
            </div>

            {/* داتا التدريب المتجمّعة على الجهاز — تنزيل (صوت + لوحات صح) + مسح. */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-primary/20 pt-2.5">
              <span className="text-[11px] text-muted">
                المتجمّع على الجهاز ده: <b className="text-ink">{trainingCount}</b> لوحة
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={trainingBusy}
                  onClick={handleDownloadTraining}
                  className={`shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-night transition ${trainingBusy ? "opacity-50" : ""}`}>
                  {trainingBusy ? "..." : "تنزيل الصوت + اللوحات"}
                </button>
                <button
                  disabled={trainingBusy}
                  onClick={handleClearTraining}
                  className={`shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[11px] text-muted transition ${trainingBusy ? "opacity-50" : ""}`}>
                  مسح
                </button>
              </div>
            </div>

            {/* داتا المناديب المركزية (من Supabase) — الجديد بس، مفصول بكل مندوب. */}
            <div className="mt-3 border-t border-primary/20 pt-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-ink">داتا المناديب (مركزي)</span>
                <div className="flex items-center gap-1.5">
                  <button disabled={centralBusy} onClick={handleLearningDiagnostics}
                    className={`rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-600 transition ${centralBusy ? "opacity-50" : ""}`}>
                    تشخيص
                  </button>
                  <button disabled={centralBusy} onClick={loadPending}
                    className={`rounded-full border border-border bg-surface-2 px-3 py-1 text-[11px] text-muted transition ${centralBusy ? "opacity-50" : ""}`}>
                    {centralBusy ? "..." : "تحديث القائمة"}
                  </button>
                  {pendingByAgent.length > 0 && (
                    <button disabled={centralBusy} onClick={() => downloadNew()}
                      className={`rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-night transition ${centralBusy ? "opacity-50" : ""}`}>
                      تنزيل الكل الجديد
                    </button>
                  )}
                </div>
              </div>
              {centralLoaded && pendingByAgent.length === 0 && (
                <p className="text-[11px] text-muted">مفيش لوحات جديدة عند أي مندوب دلوقتي.</p>
              )}
              {pendingByAgent.length > 0 && (
                <div className="flex flex-col gap-1">
                  {pendingByAgent.map(({ agentId, count }) => (
                    <div key={agentId} className="flex items-center justify-between rounded-lg bg-surface px-2 py-1">
                      <span className="truncate text-[11px] text-ink">{usernameOf(agentId)} <b className="text-primary">({count})</b></span>
                      <button disabled={centralBusy} onClick={() => downloadNew(agentId)}
                        className={`shrink-0 rounded-full border border-primary/40 px-2.5 py-0.5 text-[10px] font-bold text-primary transition ${centralBusy ? "opacity-50" : ""}`}>
                        تنزيل الجديد
                      </button>
                    </div>
                  ))}
                  <button disabled={centralBusy} onClick={purgeDownloadedServer}
                    className="mt-1 self-start text-[10px] text-muted underline">
                    مسح المُنزَّل من السيرفر (تفريغ مساحة)
                  </button>
                </div>
              )}
            </div>
          </div>
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
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* نقطة حالة النشاط قدام الاسم — أخضر = نشط، رمادي = مش فاتح */}
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${act.online ? "bg-green-500 animate-pulse" : "bg-muted/40"}`}
                    title={act.label} />
                  {/* الاسم كامل — يلتفّ لو طويل بدل ما يتقصّ */}
                  <span className="text-sm font-bold text-ink break-words" style={a.is_super ? { color: "#F4D160" } : undefined}>{a.username}</span>
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

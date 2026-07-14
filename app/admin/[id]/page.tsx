"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronLeft, KeyRound, Smartphone, ShieldOff, ShieldCheck, Trash2,
  MessageCircle, CalendarClock, Save, Clock, Mail, Phone, AlertCircle, Gem,
  Eye, EyeOff, Pencil, UserRound, X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { subStatus } from "@/lib/subscription";

interface Profile {
  id: string; username: string; email: string | null; phone: string | null;
  role: "admin" | "agent"; is_super: boolean; is_active: boolean; device_fingerprint: string | null;
  last_seen: string | null; subscription_start: string | null;
  subscription_end: string | null; subscription_amount: number | null; created_at: string;
}
interface SubEvent { id: string; new_end: string | null; months: number | null; amount: number | null; note: string | null; created_at: string; }

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
function waNumber(phone: string | null): string {
  return (phone ?? "").replace(/[^\d]/g, "").replace(/^00/, "");
}
function addMonthsTo(base: string | null, n: number): string {
  const d = base ? new Date(base + "T00:00:00") : new Date();
  const now = new Date(); if (!base || d < now) d.setTime(now.getTime());
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function daysAgo(iso: string | null): string {
  if (!iso) return "لم يدخل بعد";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff <= 0) {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return mins < 3 ? "نشط الآن" : `اليوم (من ${mins} دقيقة)`;
  }
  return `من ${diff} يوم`;
}

export default function AgentDetail() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Profile | null>(null);
  const [events, setEvents] = useState<SubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [newPass, setNewPass] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (data) {
      const prof = data as Profile;
      setP(prof); setEnd(prof.subscription_end ?? ""); setPhone(prof.phone ?? ""); setName(prof.username ?? ""); setEmail(prof.email ?? "");
      setAmount(prof.subscription_amount != null ? String(prof.subscription_amount) : "");
    }
    const { data: ev } = await supabase.from("subscription_events").select("*").eq("agent_id", id).order("created_at", { ascending: false });
    if (ev) setEvents(ev as SubEvent[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      const { data: prof } = await supabase.from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (prof?.role !== "admin") { router.replace("/sorting"); return; }
      setIsSuper(!!prof?.is_super);
      load();
    })();
  }, [router, load]);

  async function call(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/manage-agent", {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ agentId: id, action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg(`❌ ${json.error ?? "خطأ"}`); return false; }
      return true;
    } catch { setMsg("❌ تعذّر الاتصال."); return false; }
    finally { setBusy(false); }
  }

  async function saveSubscription() {
    if (!end) { setMsg("اختار تاريخ النهاية."); return; }
    if (await call("extendSubscription", { subscriptionEnd: end, amount: amount || null, note: "تمديد من الأدمن" })) {
      setMsg("✅ اتحفظ التمديد."); load();
    }
  }
  // حفظ بيانات المندوب (اسم/إيميل/تليفون) + باسوورد جديد لو المندوب كتبه.
  async function saveBio() {
    if (newPass.trim() && newPass.trim().length < 6) {
      setMsg("❌ كلمة المرور ٦ أحرف على الأقل."); return;
    }
    const payload: Record<string, unknown> = { name, phone };
    if (email.trim() && email.trim().toLowerCase() !== (p?.email ?? "").toLowerCase()) {
      payload.email = email.trim();
    }
    if (!(await call("updateContact", payload))) return;
    if (newPass.trim()) {
      if (!(await call("setPassword", { password: newPass.trim() }))) return;
      setNewPass("");
    }
    setMsg("✅ اتحفظت بيانات المندوب."); setEditingBio(false); setShowPass(false); load();
  }
  function cancelBio() {
    // رجّع القيم لأصلها وألغِ التعديل.
    setName(p?.username ?? ""); setEmail(p?.email ?? ""); setPhone(p?.phone ?? "");
    setNewPass(""); setShowPass(false); setEditingBio(false); setMsg(null);
  }
  // «إرسال بيانات الدخول»: يولّد باسوورد جديد، يحطّه، يفتح واتساب المندوب
  // بالإيميل + الباسوورد، ويعرضهم في خانة نسخ.
  async function sendCredentials() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let pass = "";
    const arr = new Uint32Array(10);
    (window.crypto || (window as any).msCrypto).getRandomValues(arr);
    for (let i = 0; i < 10; i++) pass += chars[arr[i] % chars.length];
    if (!(await call("setPassword", { password: pass }))) return;
    const email = p?.email ?? p?.username ?? "";
    setCreds({ email, password: pass });
    setMsg("✅ اتعمل باسوورد جديد.");
    const n = waNumber(p?.phone ?? null);
    if (n) {
      const text = `بيانات دخولك لتطبيق قناص اللوحات:\nالإيميل: ${email}\nكلمة المرور: ${pass}\n\nسجّل دخول بيهم من التطبيق.`;
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, "_blank");
    }
  }

  function remindWhatsApp() {
    const n = waNumber(p?.phone ?? null);
    if (!n) { setMsg("مفيش رقم تليفون للمندوب."); return; }
    const text = `مرحباً ${p?.username ?? ""}،\nبرجاء سداد الاشتراك الشهري لتطبيق قناص اللوحات لعدم قطع الخدمة.\nشكراً لتعاونك.`;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, "_blank");
  }
  async function del() {
    if (!confirm(`تحذف حساب «${p?.username}» نهائياً؟ ده مايترجعش.`)) return;
    if (await call("delete")) router.replace("/admin");
  }

  if (loading || !p) {
    return <div className="flex min-h-screen items-center justify-center bg-night text-sm text-muted">جارٍ التحميل...</div>;
  }
  const sub = subStatus(p.subscription_end);
  const isAgent = p.role === "agent";
  // ألوان ذهبية لبيانات السوبر-أدمن (قيم فاتحة، أيقونات/تفاصيل أغمق شوية).
  const goldText = p.is_super ? { color: "#F4D160" } : undefined;
  const goldDim = p.is_super ? { color: "#D4AF37" } : undefined;

  return (
    <main className="min-h-screen bg-night">
      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-5">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push("/admin")}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted hover:text-ink transition">
            <ChevronLeft size={15} /> رجوع
          </button>
          {isAgent && (
            <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: sub.color, background: `${sub.color}22` }}>{sub.label}</span>
          )}
        </div>

        {/* ── مربع «بيانات المندوب» ── */}
        <div className={`rounded-2xl border p-4 flex flex-col gap-3 ${p.is_super ? "border-2 bg-black" : "border-border bg-surface"}`}
          style={p.is_super ? { borderColor: "#D4AF37" } : undefined}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-ink" style={p.is_super ? { color: "#F4D160" } : undefined}>بيانات المندوب</span>
              {p.is_super && (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: "#0a0a0a", background: "#D4AF37" }}>
                  <Gem size={10} /> سوبر أدمن
                </span>
              )}
            </div>
            {!editingBio && (
              <button onClick={() => setEditingBio(true)}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:text-primary transition">
                <Pencil size={13} /> تعديل
              </button>
            )}
          </div>

          {!editingBio ? (
            /* ── وضع العرض ── */
            <div className="flex flex-col gap-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-ink"><UserRound size={13} className="text-muted" style={goldDim} /> <span className="font-bold" style={goldText}>{p.username}</span></div>
              <div className="flex items-center gap-1.5 text-muted" style={goldDim}><Mail size={13} /> <span className="text-ink" dir="ltr" style={goldText}>{p.email || "—"}</span></div>
              <div className="flex items-center gap-1.5 text-muted" style={goldDim}><KeyRound size={13} /> <span className="text-ink" style={goldText}>••••••••</span> <span className="text-[10px]">(مشفّر — للتغيير اضغط «تعديل»)</span></div>
              <div className="flex items-center gap-1.5 text-muted" style={goldDim}><Phone size={13} /> <span className="text-ink" dir="ltr" style={goldText}>{p.phone || "بدون تليفون"}</span></div>
              <div className="mt-1 flex items-center gap-1.5 text-muted" style={goldDim}><Clock size={12} /> آخر ظهور: {daysAgo(p.last_seen)}</div>
              <div className="flex items-center gap-1.5 text-muted" style={goldDim}><Smartphone size={12} /> {p.device_fingerprint ? "مرتبط بجهاز" : "غير مرتبط بجهاز"}</div>
            </div>
          ) : (
            /* ── وضع التعديل ── */
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-muted">الاسم
                <input value={name} onChange={(e) => setName(e.target.value)} dir="rtl"
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="text-[11px] text-muted">الإيميل
                <input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr"
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="text-[11px] text-muted">باسوورد جديد
                <div className="relative mt-1">
                  <input type={showPass ? "text" : "password"} value={newPass} onChange={(e) => setNewPass(e.target.value)}
                    placeholder="سيبه فاضي عشان متغيرش" dir="ltr"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 pl-10 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary" title={showPass ? "إخفاء" : "إظهار"}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label className="text-[11px] text-muted">رقم التليفون
                <input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr"
                  className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <div className="flex gap-2">
                <button onClick={saveBio} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-50">
                  <Save size={15} /> {busy ? "جارٍ..." : "حفظ التغييرات"}
                </button>
                <button onClick={cancelBio} disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm text-muted">
                  <X size={15} /> إلغاء
                </button>
              </div>
            </div>
          )}

          {/* بيانات الدخول (باسوورد جديد + واتساب) + ضبط الجهاز */}
          <div className="flex flex-col gap-2 border-t border-border pt-2">
            <button onClick={sendCredentials} disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand/90 py-2 text-xs font-bold text-night hover:bg-brand transition disabled:opacity-50">
              <MessageCircle size={13} /> إرسال بيانات دخول جديدة للمندوب (واتساب)
            </button>
            {creds && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-2 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">الإيميل:</span>
                  <span className="truncate font-mono text-ink" dir="ltr">{creds.email}</span>
                  <button onClick={() => navigator.clipboard.writeText(creds.email)} className="shrink-0 text-primary">نسخ</button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted">الباسوورد:</span>
                  <span className="truncate font-mono text-ink" dir="ltr">{creds.password}</span>
                  <button onClick={() => navigator.clipboard.writeText(creds.password)} className="shrink-0 text-primary">نسخ</button>
                </div>
                <button onClick={() => navigator.clipboard.writeText(`الإيميل: ${creds.email}\nالباسوورد: ${creds.password}`)}
                  className="mt-1 rounded-lg border border-border py-1 text-primary">نسخ الاتنين</button>
              </div>
            )}
            <button onClick={async () => { if (await call("resetDevice")) { setMsg("✅ اتفكّ ربط الجهاز."); load(); } }} disabled={!p.device_fingerprint || busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs text-muted hover:text-primary disabled:opacity-40">
              <Smartphone size={13} /> إعادة ضبط الجهاز
            </button>
          </div>
        </div>

        {msg && <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink">{msg}</div>}

        {/* Subscription */}
        {isAgent && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink"><CalendarClock size={16} className="text-primary" /> الاشتراك</div>
            <label className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
              الاشتراك حتى:
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <div className="mb-2 flex gap-1.5">
              {[["+شهر", 1], ["+٣ شهور", 3], ["+سنة", 12]].map(([lbl, n]) => (
                <button key={lbl as string} onClick={() => setEnd(addMonthsTo(end || null, n as number))}
                  className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted hover:text-primary hover:border-primary transition">{lbl}</button>
              ))}
            </div>
            <label className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
              مبلغ الاشتراك (اختياري):
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0"
                className="w-24 rounded-lg border border-border bg-surface-2 px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary" />
            </label>
            <div className="flex gap-2">
              <button onClick={saveSubscription} disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-50">
                <Save size={15} /> حفظ التمديد
              </button>
              <button onClick={remindWhatsApp}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-sm font-bold text-night">
                <MessageCircle size={15} /> تذكير السداد
              </button>
            </div>
          </div>
        )}

        {/* ── مربع «الحساب» — ترقية / تعطيل مؤقت / حذف ──
            للسوبر-أدمن فقط، ومش بيظهر على حساب السوبر-أدمن نفسه (حسابه مايتلغيش
            ولا يتعطّل ولا يترجّع مندوب من داخل البرنامج). */}
        {isSuper && !p.is_super && (
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2.5">
            <div className="text-sm font-bold text-ink">الحساب</div>

            {/* ترقية لأدمن / رجوع لمندوب */}
            <button
              onClick={async () => {
                const toAdmin = p.role !== "admin";
                if (!confirm(toAdmin ? `تخلّي «${p.username}» أدمن بكل الصلاحيات؟` : `ترجّع «${p.username}» مندوب عادي؟`)) return;
                if (await call("setRole", { role: toAdmin ? "admin" : "agent" })) { setMsg("✅ اتغيّر الدور."); load(); }
              }}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 py-2.5 text-xs font-bold text-primary hover:bg-primary/10 transition">
              <ShieldCheck size={13} /> {p.role === "admin" ? "تحويل لمندوب عادي" : "ترقية لأدمن"}
            </button>

            {/* تعطيل مؤقت / إرجاع تشغيل */}
            <button
              onClick={async () => {
                if (p.is_active && !confirm(`توقف حساب «${p.username}» مؤقتاً؟ (تقدر ترجّعه في أي وقت)`)) return;
                if (await call("setActive", { active: !p.is_active })) { setMsg(p.is_active ? "✅ اتعطّل الحساب مؤقتاً." : "✅ اترجّع تشغيل الحساب."); load(); }
              }}
              disabled={busy}
              className={`flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-xs font-bold transition ${p.is_active ? "border-alert/50 bg-alert/5 text-alert hover:bg-alert/10" : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"}`}>
              {p.is_active ? <><ShieldOff size={13} /> تعطيل الحساب مؤقتاً</> : <><ShieldCheck size={13} /> إرجاع تشغيل الحساب</>}
            </button>

            {/* حذف نهائي */}
            <button onClick={del} disabled={busy}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 bg-danger/5 py-2.5 text-xs font-bold text-danger hover:bg-danger/10 transition">
              <Trash2 size={13} /> حذف الحساب نهائياً
            </button>
            <p className="text-[10px] text-muted text-center">الحذف نهائي — بس تقدر ترجّع نفس الإيميل بإضافته كمستخدم جديد بعدين.</p>
          </div>
        )}

        {/* Subscription log */}
        {events.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-2 text-sm font-bold text-ink">سجل التمديدات</div>
            <div className="flex flex-col gap-1.5">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs text-muted">
                  <span>{e.note ?? "تمديد"}{e.amount ? ` · ${e.amount}` : ""}</span>
                  <span>{e.new_end ?? "—"} · {new Date(e.created_at).toLocaleDateString("ar-EG")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

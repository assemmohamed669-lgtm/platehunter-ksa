"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Smartphone,
  ShieldOff,
  ShieldCheck,
  RefreshCw,
  Search,
  Users,
  Database,
  AlertCircle,
  X,
  KeyRound,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface AgentProfile {
  id: string;
  username: string;
  role: "admin" | "agent";
  is_active: boolean;
  device_fingerprint: string | null;
  created_at: string;
}

export default function AdminDashboard() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [totalRecordings, setTotalRecordings] = useState<number | null>(null);
  const [secondaryPasswordSet, setSecondaryPasswordSet] = useState(false);
  const [showSecondaryModal, setShowSecondaryModal] = useState(false);
  const [secondaryPass, setSecondaryPass] = useState("");
  const [secondaryPassConfirm, setSecondaryPassConfirm] = useState("");
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  const [savingSecondary, setSavingSecondary] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) setAgents(data as AgentProfile[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAgents();
    supabase
      .from("recordings")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalRecordings(count ?? 0));
    supabase.rpc("secondary_password_is_set").then(({ data }) => {
      setSecondaryPasswordSet(!!data);
    });
  }, [loadAgents]);

  async function handleCreateAgent() {
    setCreateError(null);

    if (!newUsername.trim() || newPassword.length < 6) {
      setCreateError("اسم المستخدم مطلوب وكلمة المرور ٦ أحرف على الأقل.");
      return;
    }

    setCreating(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;

      const res = await fetch("/api/admin/create-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error ?? "حدث خطأ غير متوقع.");
        return;
      }

      setShowCreate(false);
      setNewUsername("");
      setNewPassword("");
      loadAgents();
    } catch {
      setCreateError("تعذّر الاتصال بالخادم.");
    } finally {
      setCreating(false);
    }
  }

  async function resetDevice(id: string) {
    await supabase.from("profiles").update({ device_fingerprint: null, session_token: null }).eq("id", id);
    loadAgents();
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("profiles").update({ is_active: !current }).eq("id", id);
    loadAgents();
  }

  async function handleSaveSecondaryPassword() {
    setSecondaryError(null);

    if (secondaryPass.length < 4) {
      setSecondaryError("كلمة المرور ٤ أحرف على الأقل.");
      return;
    }
    if (secondaryPass !== secondaryPassConfirm) {
      setSecondaryError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setSavingSecondary(true);
    const { error } = await supabase.rpc("set_secondary_password", {
      p_password: secondaryPass,
    });
    setSavingSecondary(false);

    if (error) {
      setSecondaryError("فشل الحفظ. تأكد أنك مسجّل كأدمن.");
      return;
    }

    setSecondaryPasswordSet(true);
    setShowSecondaryModal(false);
    setSecondaryPass("");
    setSecondaryPassConfirm("");
  }

  async function handleClearSecondaryPassword() {
    setSavingSecondary(true);
    await supabase.rpc("clear_secondary_password");
    setSavingSecondary(false);
    setSecondaryPasswordSet(false);
  }

  const filtered = agents.filter((a) =>
    a.username.toLowerCase().includes(search.toLowerCase())
  );

  const agentCount = agents.filter((a) => a.role === "agent").length;
  const activeCount = agents.filter((a) => a.is_active && a.role === "agent").length;
  const boundCount = agents.filter((a) => a.device_fingerprint && a.role === "agent").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink">إدارة العملاء</h1>
          <p className="text-xs text-muted">إنشاء الحسابات وضبط الأجهزة</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-night"
        >
          <UserPlus size={14} />
          عميل جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "عملاء نشطون", val: `${activeCount}/${agentCount}`, icon: <Users size={14} /> },
          { label: "أجهزة مربوطة", val: boundCount, icon: <Smartphone size={14} /> },
          { label: "إجمالي السجلات", val: totalRecordings ?? "—", icon: <Database size={14} /> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-1.5 text-primary mb-1">
              {s.icon}
              <span className="text-lg font-black text-ink">{s.val}</span>
            </div>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Secondary password protection */}
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-primary" />
            <div>
              <p className="text-sm font-bold text-ink">كلمة مرور التصدير/الاستيراد</p>
              <p className="text-xs text-muted">
                {secondaryPasswordSet ? "مفعّلة حاليًا" : "غير مفعّلة — أي عميل يقدر يصدّر/يستورد بحرية"}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => setShowSecondaryModal(true)}
            className="flex-1 rounded-lg border border-primary/40 py-1.5 text-xs text-primary hover:bg-primary/10 transition"
          >
            {secondaryPasswordSet ? "تغيير كلمة المرور" : "تفعيل كلمة مرور"}
          </button>
          {secondaryPasswordSet && (
            <button
              onClick={handleClearSecondaryPassword}
              disabled={savingSecondary}
              className="flex-1 rounded-lg border border-danger/40 py-1.5 text-xs text-danger hover:bg-danger/10 transition disabled:opacity-50"
            >
              إلغاء الحماية
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المستخدم..."
          className="w-full rounded-lg border border-border bg-surface-2 py-2.5 pr-9 pl-4 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Agent list */}
      <div className="flex flex-col gap-2">
        {loading && (
          <p className="py-6 text-center text-sm text-muted">جارٍ التحميل...</p>
        )}

        {!loading && filtered.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-ink">{agent.username}</span>
                {agent.role === "admin" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">أدمن</span>
                )}
                {agent.is_active ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">نشط</span>
                ) : (
                  <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">معطّل</span>
                )}
              </div>
            </div>

            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
              <Smartphone size={12} />
              {agent.device_fingerprint ? "مرتبط بجهاز" : "غير مرتبط بأي جهاز"}
            </div>

            {agent.role === "agent" && (
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => resetDevice(agent.id)}
                  disabled={!agent.device_fingerprint}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs text-muted transition hover:text-primary disabled:opacity-40"
                >
                  <RefreshCw size={12} />
                  إعادة ضبط الجهاز
                </button>
                <button
                  onClick={() => toggleActive(agent.id, agent.is_active)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs transition ${
                    agent.is_active
                      ? "border-danger/40 text-danger hover:bg-danger/10"
                      : "border-primary/40 text-primary hover:bg-primary/10"
                  }`}
                >
                  {agent.is_active ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                  {agent.is_active ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            )}
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">لا توجد نتائج.</p>
        )}
      </div>

      {/* Create agent modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">إنشاء عميل جديد</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>

            <label className="mb-1 block text-xs text-muted">اسم المستخدم</label>
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="مثال: agent02"
              className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <label className="mb-1 block text-xs text-muted">كلمة المرور</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="٦ أحرف على الأقل"
              className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {createError && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertCircle size={14} />
                {createError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateAgent}
                disabled={creating}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60"
              >
                {creating ? "جارٍ الإنشاء..." : "إنشاء"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Set secondary password modal */}
      {showSecondaryModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold text-ink">كلمة مرور التصدير/الاستيراد</h3>
              <button onClick={() => setShowSecondaryModal(false)} className="text-muted hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-xs text-muted">
              هذه الكلمة سيُطلب إدخالها من كل عميل قبل تصدير Excel أو استيراد قائمة بنك.
            </p>

            <label className="mb-1 block text-xs text-muted">كلمة المرور الجديدة</label>
            <input
              type="password"
              value={secondaryPass}
              onChange={(e) => setSecondaryPass(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <label className="mb-1 block text-xs text-muted">تأكيد كلمة المرور</label>
            <input
              type="password"
              value={secondaryPassConfirm}
              onChange={(e) => setSecondaryPassConfirm(e.target.value)}
              className="mb-3 w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {secondaryError && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertCircle size={14} />
                {secondaryError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowSecondaryModal(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted"
              >إلغاء</button>
              <button
                onClick={handleSaveSecondaryPassword}
                disabled={savingSecondary}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night disabled:opacity-60"
              >
                {savingSecondary ? "جارٍ الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, X, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

// On-device only — never sent anywhere but our /api/transcribe route, which
// forwards it straight to Groq. Same localStorage keys the recording flow reads.
const LS_GROQ_API_KEY = "ph:registration:groqApiKey";
const LS_GROQ_PIN_HASH = "ph:registration:groqPinHash";

async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Standalone editor for the agent's own Groq API key — full feature set moved
 * out of the registration page: enter/show/hide/clear, a local PIN that gates
 * revealing/clearing (reset via the account password), and a "test key" button.
 * The recording flow still just reads LS_GROQ_API_KEY.
 */
export default function GroqKeyEditor() {
  const [groqApiKey, setGroqApiKey] = useState("");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqTestStatus, setGroqTestStatus] = useState<"idle" | "testing" | "ok" | "failed">("idle");
  const [groqTestError, setGroqTestError] = useState<string | null>(null);
  const [groqPinHash, setGroqPinHash] = useState<string | null>(null);
  const [agentEmail, setAgentEmail] = useState("");

  const [pinPrompt, setPinPrompt] = useState<{ mode: "setup" | "verify" | "forgot"; onSuccess: () => void } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [forgotPasswordInput, setForgotPasswordInput] = useState("");
  const [pinFlowError, setPinFlowError] = useState<string | null>(null);
  const [pinFlowBusy, setPinFlowBusy] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);

  useEffect(() => {
    try {
      setGroqApiKey(localStorage.getItem(LS_GROQ_API_KEY) || "");
      setGroqPinHash(localStorage.getItem(LS_GROQ_PIN_HASH) || null);
    } catch { /* storage off */ }
    supabase.auth.getUser().then(({ data }) => setAgentEmail(data.user?.email ?? "")).catch(() => {});
  }, []);

  function handleGroqKeyChange(v: string) {
    setGroqApiKey(v);
    setGroqTestStatus("idle");
    setGroqTestError(null);
    try {
      if (v.trim()) localStorage.setItem(LS_GROQ_API_KEY, v.trim());
      else localStorage.removeItem(LS_GROQ_API_KEY);
    } catch { /* storage full */ }
  }

  function handleGroqKeyBlur() {
    if (groqApiKey.trim() && !groqPinHash) {
      setPinInput(""); setPinConfirmInput(""); setPinFlowError(null); setShowPinInput(false);
      setPinPrompt({ mode: "setup", onSuccess: () => {} });
    }
  }

  function clearGroqKey() {
    handleGroqKeyChange("");
    setGroqPinHash(null);
    try { localStorage.removeItem(LS_GROQ_PIN_HASH); } catch { /* storage full */ }
  }

  function handleShowGroqKeyClick() {
    if (showGroqKey) { setShowGroqKey(false); return; }
    if (!groqPinHash) { setShowGroqKey(true); return; }
    setPinInput(""); setPinFlowError(null); setShowPinInput(false);
    setPinPrompt({ mode: "verify", onSuccess: () => setShowGroqKey(true) });
  }

  function handleClearGroqKeyClick() {
    if (!groqApiKey.trim()) return;
    if (!groqPinHash) { clearGroqKey(); return; }
    setPinInput(""); setPinFlowError(null); setShowPinInput(false);
    setPinPrompt({ mode: "verify", onSuccess: () => clearGroqKey() });
  }

  async function submitPinSetup() {
    const pin = pinInput.trim();
    if (!/^\d{4,6}$/.test(pin)) { setPinFlowError("الرقم السري لازم يكون 4-6 أرقام."); return; }
    if (pin !== pinConfirmInput.trim()) { setPinFlowError("الرقمين مش متطابقين."); return; }
    const hash = await hashPin(pin);
    setGroqPinHash(hash);
    try { localStorage.setItem(LS_GROQ_PIN_HASH, hash); } catch { /* storage full */ }
    const onSuccess = pinPrompt?.onSuccess;
    setPinPrompt(null);
    setPinInput(""); setPinConfirmInput(""); setPinFlowError(null); setShowPinInput(false);
    onSuccess?.();
  }

  async function submitPinVerify() {
    const pin = pinInput.trim();
    if (!pin) return;
    const hash = await hashPin(pin);
    if (hash !== groqPinHash) { setPinFlowError("الرقم السري غلط."); return; }
    const onSuccess = pinPrompt?.onSuccess;
    setPinPrompt(null);
    setPinInput(""); setPinFlowError(null); setShowPinInput(false);
    onSuccess?.();
  }

  async function submitForgotPassword() {
    if (!agentEmail) { setPinFlowError("تعذّر التحقق من الحساب — سجّل خروج ودخول تاني وجرّب."); return; }
    if (!forgotPasswordInput) return;
    setPinFlowBusy(true);
    setPinFlowError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: agentEmail, password: forgotPasswordInput });
      if (error) { setPinFlowError("كلمة سر الحساب غلط."); return; }
      setPinInput(""); setPinConfirmInput(""); setForgotPasswordInput(""); setShowPinInput(false);
      setPinPrompt((prev) => prev && { ...prev, mode: "setup" });
    } finally {
      setPinFlowBusy(false);
    }
  }

  function cancelPinPrompt() {
    setPinPrompt(null);
    setPinInput(""); setPinConfirmInput(""); setForgotPasswordInput(""); setPinFlowError(null); setShowPinInput(false);
  }

  async function testGroqKey() {
    const key = groqApiKey.trim();
    if (!key) return;
    setGroqTestStatus("testing");
    setGroqTestError(null);
    try {
      const res = await fetch("/api/groq-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (data.ok) setGroqTestStatus("ok");
      else { setGroqTestStatus("failed"); setGroqTestError(data.hint || data.detail || data.error || "خطأ غير معروف"); }
    } catch (err: any) {
      setGroqTestStatus("failed");
      setGroqTestError(err?.message ?? String(err));
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-3 py-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-muted" dir="rtl">مفتاح Groq للتفريغ السحابي</label>
        {groqApiKey.trim() && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">مفعّل</span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type={showGroqKey ? "text" : "password"}
          value={groqApiKey}
          onChange={(e) => handleGroqKeyChange(e.target.value)}
          onBlur={handleGroqKeyBlur}
          placeholder="gsk_..."
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
          dir="ltr"
        />
        <button type="button" onClick={handleShowGroqKeyClick} aria-label={showGroqKey ? "إخفاء المفتاح" : "إظهار المفتاح"}
          className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary">
          {showGroqKey ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button type="button" onClick={handleClearGroqKeyClick} aria-label="مسح مفتاح Groq"
          className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-danger hover:text-danger">
          <X size={14} />
        </button>
      </div>
      {groqPinHash && (
        <p className="text-[11px] text-muted" dir="rtl">🔒 محمي برقم سري — هيتطلب منك لما تحب تشوف المفتاح أو تمسحه.</p>
      )}

      {groqApiKey.trim() && (
        <div className="flex items-center gap-2 pt-1">
          <button type="button" onClick={testGroqKey} disabled={groqTestStatus === "testing"}
            className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50">
            <RefreshCw size={12} className={groqTestStatus === "testing" ? "animate-spin" : ""} /> اختبار المفتاح
          </button>
          {groqTestStatus === "ok" && <span className="flex items-center gap-1 text-xs font-bold text-brand"><CheckCircle2 size={13} /> المفتاح شغال</span>}
          {groqTestStatus === "failed" && <span className="flex items-center gap-1 text-xs font-bold text-danger" title={groqTestError ?? undefined}><XCircle size={13} /> المفتاح مش شغال</span>}
        </div>
      )}
      {groqTestStatus === "failed" && groqTestError && <p className="text-[11px] text-danger" dir="rtl">{groqTestError}</p>}

      <p className="text-[11px] text-muted pt-1" dir="rtl">
        برجاء زيارة موقع{" "}
        <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
          console.groq.com
        </a>
        {" "}لعمل مفتاح خاص بك لزيادة دقة التسجيل الصوتي.
      </p>

      {/* PIN modal */}
      {pinPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" dir="rtl">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            {pinPrompt.mode === "setup" && (
              <>
                <p className="mb-1 text-sm font-bold text-ink">{groqPinHash ? "رقم سري جديد لمفتاح Groq" : "أنشئ رقم سري لحماية مفتاح Groq"}</p>
                <p className="mb-3 text-xs text-muted">هتحتاج الرقم ده كل مرة تحب تشوف المفتاح أو تمسحه — عشان محدش يقدر يشوفه أو يحذفه غيرك لو حد ثاني ماسك الموبايل.</p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input type={showPinInput ? "text" : "password"} inputMode="numeric" maxLength={6} value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))} placeholder="رقم سري (4-6 أرقام)" autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-widest text-ink focus:outline-none focus:border-primary" dir="ltr" />
                  <button type="button" onClick={() => setShowPinInput((v) => !v)} className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary">
                    {showPinInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <input type={showPinInput ? "text" : "password"} inputMode="numeric" maxLength={6} value={pinConfirmInput}
                  onChange={(e) => setPinConfirmInput(e.target.value.replace(/\D/g, ""))} placeholder="أعد كتابة الرقم"
                  className="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-widest text-ink focus:outline-none focus:border-primary" dir="ltr"
                  onKeyDown={(e) => { if (e.key === "Enter") submitPinSetup(); }} />
                {pinFlowError && <p className="mb-2 text-xs text-danger">{pinFlowError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitPinSetup} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition hover:bg-brand/90">حفظ الرقم السري</button>
                  <button onClick={cancelPinPrompt} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-ink">لاحقاً</button>
                </div>
              </>
            )}
            {pinPrompt.mode === "verify" && (
              <>
                <p className="mb-3 text-sm font-bold text-ink">أدخل الرقم السري</p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input type={showPinInput ? "text" : "password"} inputMode="numeric" maxLength={6} value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))} placeholder="الرقم السري" autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-widest text-ink focus:outline-none focus:border-primary" dir="ltr"
                    onKeyDown={(e) => { if (e.key === "Enter") submitPinVerify(); }} />
                  <button type="button" onClick={() => setShowPinInput((v) => !v)} className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary">
                    {showPinInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {pinFlowError && <p className="mb-2 text-xs text-danger">{pinFlowError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitPinVerify} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition hover:bg-brand/90">تأكيد</button>
                  <button onClick={cancelPinPrompt} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-ink">إلغاء</button>
                </div>
                <button onClick={() => { setPinFlowError(null); setPinInput(""); setShowPinInput(false); setPinPrompt((prev) => prev && { ...prev, mode: "forgot" }); }}
                  className="mt-3 w-full text-center text-xs text-primary underline">نسيت الرقم السري؟</button>
              </>
            )}
            {pinPrompt.mode === "forgot" && (
              <>
                <p className="mb-1 text-sm font-bold text-ink">تأكيد الهوية</p>
                <p className="mb-3 text-xs text-muted">أدخل كلمة سر حسابك (نفس اللي بتسجّل بيها دخول) عشان تقدر تعمل رقم سري جديد.</p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input type={showPinInput ? "text" : "password"} value={forgotPasswordInput}
                    onChange={(e) => setForgotPasswordInput(e.target.value)} placeholder="كلمة سر الحساب" autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:border-primary" dir="ltr"
                    onKeyDown={(e) => { if (e.key === "Enter") submitForgotPassword(); }} />
                  <button type="button" onClick={() => setShowPinInput((v) => !v)} className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary">
                    {showPinInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {pinFlowError && <p className="mb-2 text-xs text-danger">{pinFlowError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitForgotPassword} disabled={pinFlowBusy}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-50">
                    {pinFlowBusy ? "جارٍ التحقق..." : "تأكيد"}
                  </button>
                  <button onClick={cancelPinPrompt} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-ink">إلغاء</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

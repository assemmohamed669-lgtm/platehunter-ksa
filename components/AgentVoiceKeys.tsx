"use client";

import { useState } from "react";
import { Eye, EyeOff, Zap, Loader2, CheckCircle2, XCircle, Save, AudioLines, ExternalLink, Copy, Check, Mail, KeyRound, Info, ChevronDown } from "lucide-react";
import type { ServiceKeys, VoiceEngine } from "@/lib/voiceKeys";
import { supabase } from "@/lib/supabaseClient";

// نتيجة تشخيص مفتاح ElevenLabs الكاملة (من /api/elevenlabs-test).
interface ElDetails {
  ok: boolean;
  status: number | null;
  statusText?: string;
  endpoint: string;
  method: string;
  category: string;
  reason: string;
  errorCode?: string;
  message?: string;
  body?: string;
}

/**
 * إدارة مفاتيح الصوت لمندوب — للأدمن فقط (جوه صفحة المندوب). أربع محرّكات:
 * Deepgram / Speechmatics (لحظي) و Groq Whisper / ElevenLabs (تسجيل ثم تحليل)،
 * واحد نشط بس (حصري). اختبار كل مفتاح + لينك للتسجيل والرصيد تحته.
 * ملاحظة: Groq بيستخدم مفتاح Groq اللي المندوب حاطه من صفحة المفاتيح (مش هنا).
 */
type TestState = null | "ok" | "bad";

export default function AgentVoiceKeys({
  initial,
  onSave,
  busy,
}: {
  initial: ServiceKeys;
  onSave: (sk: ServiceKeys) => Promise<boolean>;
  busy: boolean;
}) {
  const [deepgram, setDeepgram] = useState(initial.deepgram ?? "");
  const [speechmatics, setSpeechmatics] = useState(initial.speechmatics ?? "");
  const [elevenlabs, setElevenlabs] = useState(initial.elevenlabs ?? "");
  const [engine, setEngine] = useState<VoiceEngine>(initial.engine ?? "deepgram");
  const [email, setEmail] = useState(initial.email ?? "");
  const [password, setPassword] = useState(initial.password ?? "");
  const [showDg, setShowDg] = useState(false);
  const [showSm, setShowSm] = useState(false);
  const [showEl, setShowEl] = useState(false);
  const [testDg, setTestDg] = useState<TestState>(null);
  const [testSm, setTestSm] = useState<TestState>(null);
  const [testEl, setTestEl] = useState<TestState>(null);
  const [testingDg, setTestingDg] = useState(false);
  const [testingSm, setTestingSm] = useState(false);
  const [testingEl, setTestingEl] = useState(false);
  const [elDetails, setElDetails] = useState<ElDetails | null>(null); // تشخيص ElevenLabs الكامل
  const [elDetailsOpen, setElDetailsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(field: string, value: string) {
    if (!value.trim()) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(field); setTimeout(() => setCopied(null), 1200);
    }, () => { /* ignore */ });
  }

  // اختبار Deepgram: نفتح نفس اتصال البث (WebSocket) — يفتح = المفتاح صح.
  function testDeepgram() {
    const k = deepgram.trim();
    if (!k || testingDg) return;
    setTestingDg(true); setTestDg(null);
    let settled = false; let ws: WebSocket | null = null;
    const finish = (r: TestState) => {
      if (settled) return; settled = true; clearTimeout(t);
      setTestingDg(false); setTestDg(r); try { ws?.close(); } catch { /* ignore */ }
    };
    const t = setTimeout(() => finish("bad"), 8000);
    try {
      ws = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-3&language=ar", ["token", k]);
      ws.onopen = () => finish("ok");
      ws.onerror = () => finish("bad");
      ws.onclose = () => finish("bad");
    } catch { finish("bad"); }
  }

  // اختبار Speechmatics: نطلب مفتاح مؤقّت — نجاح = المفتاح صح.
  async function testSpeechmatics() {
    const k = speechmatics.trim();
    if (!k || testingSm) return;
    setTestingSm(true); setTestSm(null);
    try {
      const r = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
        method: "POST",
        headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 60 }),
      });
      setTestSm(r.ok ? "ok" : "bad");
    } catch { setTestSm("bad"); }
    finally { setTestingSm(false); }
  }

  // اختبار ElevenLabs: على السيرفر (مفيش CORS) — بيرجّع تشخيص كامل ومابيخفيش
  // الخطأ الأصلي، وبيفرّق بين كل الأنواع (401/403/429/5xx/network/timeout...).
  async function testElevenlabs() {
    const k = elevenlabs.trim();
    if (!k || testingEl) return;
    setTestingEl(true); setTestEl(null); setElDetails(null); setElDetailsOpen(false);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const r = await fetch("/api/elevenlabs-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ apiKey: k }),
      });
      const d = (await r.json()) as ElDetails;
      setElDetails(d);
      setTestEl(d.ok ? "ok" : "bad");
      if (!d.ok) setElDetailsOpen(true); // افتح التفاصيل تلقائياً لما يفشل
    } catch (e) {
      // فشل الاتصال بالسيرفر نفسه (مش ElevenLabs) — برضه نعرضه مش نخفيه.
      setElDetails({ ok: false, status: null, endpoint: "/api/elevenlabs-test", method: "POST", category: "network_error", reason: "تعذّر الاتصال بسيرفر التطبيق نفسه", message: e instanceof Error ? e.message : String(e) });
      setTestEl("bad");
      setElDetailsOpen(true);
    } finally { setTestingEl(false); }
  }

  async function save() {
    const ok = await onSave({
      deepgram: deepgram.trim(), speechmatics: speechmatics.trim(), elevenlabs: elevenlabs.trim(),
      engine,
      email: email.trim(), password,
    });
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1800); }
  }

  const ENGINE_LABEL: Record<VoiceEngine, string> = {
    deepgram: "Deepgram", speechmatics: "Speechmatics", groq: "Groq Whisper", elevenlabs: "ElevenLabs",
  };

  const engineBtn = (val: VoiceEngine, label: string) => (
    <button type="button" onClick={() => setEngine(val)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
        engine === val ? "bg-primary text-night" : "border border-border text-muted hover:text-primary"
      }`}>
      {engine === val ? <CheckCircle2 size={14} /> : null} {label}
    </button>
  );

  const keyRow = (
    value: string, setValue: (v: string) => void, show: boolean, setShow: (b: boolean) => void,
    onTest: () => void, testing: boolean, result: TestState, placeholder: string,
    balanceUrl: string, signupUrl: string,
  ) => (
    <>
      <div className="flex items-center gap-1.5">
        <input type={show ? "text" : "password"} value={value}
          onChange={(e) => setValue(e.target.value)} placeholder={placeholder} dir="ltr"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
        <button type="button" onClick={() => setShow(!show)}
          className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted hover:text-primary transition">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onTest} disabled={testing || !value.trim()}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-bold text-muted hover:text-primary hover:border-primary transition disabled:opacity-50">
          {testing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
          {testing ? "جارٍ..." : "اختبر"}
        </button>
        {result === "ok" && <span className="flex items-center gap-1 text-xs font-bold text-brand"><CheckCircle2 size={13} /> شغّال ✓</span>}
        {result === "bad" && <span className="flex items-center gap-1 text-xs font-bold text-danger"><XCircle size={13} /> مرفوض</span>}
      </div>
      {/* لينكات: صفحة التسجيل/إنشاء الحساب + الرصيد/الخطة */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={signupUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
          <ExternalLink size={11} /> صفحة التسجيل / إنشاء حساب
        </a>
        <a href={balanceUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] font-bold text-muted hover:text-primary hover:underline">
          <ExternalLink size={11} /> الرصيد والخطة
        </a>
      </div>
    </>
  );

  // خانة إيميل/باسوورد الحساب — ظاهرة (نص عادي) + زر نسخ.
  const credRow = (
    label: string, icon: React.ReactNode, value: string, setValue: (v: string) => void,
    field: string, placeholder: string,
  ) => (
    <div>
      <label className="mb-1 flex items-center gap-1 text-[11px] text-muted">{icon} {label}</label>
      <div className="flex items-center gap-1.5">
        <input type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} dir="ltr"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
        <button type="button" onClick={() => copy(field, value)}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs font-bold text-muted hover:text-primary hover:border-primary transition">
          {copied === field ? <Check size={13} className="text-brand" /> : <Copy size={13} />} نسخ
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <AudioLines size={16} className="text-primary" /> مفاتيح الصوت (للأدمن)
      </div>

      {/* المحرك النشط — واحد بس */}
      <div>
        <p className="mb-1.5 text-[11px] text-muted">المحرك النشط للمندوب (واحد بس):</p>
        <div className="grid grid-cols-2 gap-2">
          {engineBtn("deepgram", "Deepgram")}
          {engineBtn("speechmatics", "Speechmatics")}
          {engineBtn("groq", "Groq Whisper")}
          {engineBtn("elevenlabs", "ElevenLabs")}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-brand">
          <CheckCircle2 size={12} /> المندوب هيستخدم: {ENGINE_LABEL[engine]}
          <span className="font-normal text-muted">— بعد ما تدوس حفظ</span>
        </p>
      </div>

      {/* Deepgram */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "deepgram" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">مفتاح Deepgram <span className="font-normal text-muted">(لحظي — أدق للحروف)</span></span>
        {keyRow(deepgram, setDeepgram, showDg, setShowDg, testDeepgram, testingDg, testDg, "مفتاح Deepgram", "https://console.deepgram.com/", "https://console.deepgram.com/signup")}
      </div>

      {/* Speechmatics */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "speechmatics" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">مفتاح Speechmatics <span className="font-normal text-muted">(لحظي)</span></span>
        {keyRow(speechmatics, setSpeechmatics, showSm, setShowSm, testSpeechmatics, testingSm, testSm, "مفتاح Speechmatics", "https://portal.speechmatics.com/", "https://portal.speechmatics.com/signup")}
      </div>

      {/* Groq Whisper — بيستخدم مفتاح Groq اللي المندوب حاطه من صفحة المفاتيح */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "groq" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">Groq Whisper <span className="font-normal text-muted">(تسجيل ثم تحليل)</span></span>
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-primary" />
          مافيش مفتاح هنا — بيستخدم <b>مفتاح Groq</b> اللي المندوب حاطه من القائمة ← «مفتاح Groq». اختَر Groq Whisper واحفظ عشان التسجيل يفرّغ بيه (مش لحظي).
        </p>
      </div>

      {/* ElevenLabs (Scribe) */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "elevenlabs" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">مفتاح ElevenLabs <span className="font-normal text-muted">(Scribe — تسجيل ثم تحليل)</span></span>
        {keyRow(elevenlabs, setElevenlabs, showEl, setShowEl, testElevenlabs, testingEl, testEl, "مفتاح ElevenLabs", "https://elevenlabs.io/app/subscription", "https://elevenlabs.io/app/sign-up")}
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
          <Info size={12} className="mt-0.5 shrink-0 text-primary" />
          محتاج كمان <b>مفتاح Groq</b> عند المندوب (للتسجيل والترتيب) — يُجرَّب عبر «تحليل ذكي» في صفحة التسجيل. ولو المفتاح مقيّد على Speech-to-Text بس، زر «اختبر» ممكن يقول «مرفوض» رغم إنه شغّال فعلياً.
        </p>

        {/* تشخيص كامل لنتيجة الاختبار — الواجهة القديمة (شغّال ✓/مرفوض) فوق، والتفاصيل هنا قابلة للطي */}
        {elDetails && (
          <div className={`rounded-lg border p-2 ${elDetails.ok ? "border-brand/40 bg-brand/5" : "border-danger/40 bg-danger/5"}`} dir="rtl">
            <button type="button" onClick={() => setElDetailsOpen((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] font-bold text-ink">
              <span className="flex items-center gap-1.5">
                {elDetails.ok ? <CheckCircle2 size={13} className="text-brand" /> : <XCircle size={13} className="text-danger" />}
                عرض التفاصيل (Show Details)
              </span>
              <ChevronDown size={14} className={`text-muted transition-transform ${elDetailsOpen ? "rotate-180" : ""}`} />
            </button>
            {elDetailsOpen && (
              <div className="mt-2 flex flex-col gap-1 text-[11px]">
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-ink">
                  <span><b>Status:</b> {elDetails.status ?? "—"}{elDetails.statusText ? ` (${elDetails.statusText})` : ""}</span>
                  <span><b>Method:</b> {elDetails.method}</span>
                  <span><b>Category:</b> {elDetails.category}</span>
                </div>
                <div className="text-ink"><b>السبب / Reason:</b> {elDetails.reason}</div>
                {elDetails.errorCode ? <div className="text-ink"><b>Error Code:</b> {elDetails.errorCode}</div> : null}
                {elDetails.message ? <div className="break-all text-ink"><b>Message:</b> {elDetails.message}</div> : null}
                <div className="break-all text-muted" dir="ltr"><b>Endpoint:</b> {elDetails.endpoint}</div>
                {elDetails.body ? (
                  <div>
                    <b className="text-ink">Response Body:</b>
                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-night/40 p-2 text-[10px] leading-relaxed text-muted" dir="ltr">{elDetails.body}</pre>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* بيانات حساب الخدمة (سجل للأدمن — ظاهرة وقابلة للنسخ) */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-2/40 p-2.5">
        <span className="text-xs font-bold text-ink">بيانات حساب الخدمة (سجل للأدمن)</span>
        {credRow("إيميل الحساب المسجّل بيه", <Mail size={12} />, email, setEmail, "email", "email@example.com")}
        {credRow("باسوورد الحساب", <KeyRound size={12} />, password, setPassword, "password", "الباسوورد")}
      </div>

      <button onClick={save} disabled={busy}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-50">
        <Save size={15} /> {busy ? "جارٍ الحفظ..." : saved ? "✓ اتحفظ للمندوب" : "حفظ مفاتيح المندوب"}
      </button>
      <p className="text-[10px] text-muted text-center">المفتاح المحفوظ ينزل لجهاز المندوب تلقائياً ويستخدمه في تشييك صوت والتسجيل.</p>
    </div>
  );
}

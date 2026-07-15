"use client";

import { useState } from "react";
import { Eye, EyeOff, Zap, Loader2, CheckCircle2, XCircle, Save, AudioLines, ExternalLink, Copy, Check, Mail, KeyRound } from "lucide-react";
import type { ServiceKeys, VoiceEngine } from "@/lib/voiceKeys";

/**
 * إدارة مفاتيح الصوت لمندوب — للأدمن فقط (جوه صفحة المندوب). محرّكين: Deepgram
 * و Speechmatics، واحد نشط بس (حصري). اختبار كل مفتاح + لينك للرصيد/الخطة تحته.
 * + بيانات حساب الخدمة (إيميل/باسوورد) ظاهرة وقابلة للنسخ — سجل للأدمن.
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
  const [engine, setEngine] = useState<VoiceEngine>(initial.engine ?? "deepgram");
  const [email, setEmail] = useState(initial.email ?? "");
  const [password, setPassword] = useState(initial.password ?? "");
  const [showDg, setShowDg] = useState(false);
  const [showSm, setShowSm] = useState(false);
  const [testDg, setTestDg] = useState<TestState>(null);
  const [testSm, setTestSm] = useState<TestState>(null);
  const [testingDg, setTestingDg] = useState(false);
  const [testingSm, setTestingSm] = useState(false);
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

  async function save() {
    const ok = await onSave({
      deepgram: deepgram.trim(), speechmatics: speechmatics.trim(), engine,
      email: email.trim(), password,
    });
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1800); }
  }

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
    onTest: () => void, testing: boolean, result: TestState, placeholder: string, balanceUrl: string,
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
      {/* لينك للرصيد/الخطة المتبقّية تحت المفتاح */}
      <a href={balanceUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
        <ExternalLink size={11} /> شوف الخطة والرصيد المتبقّي
      </a>
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
        <div className="flex gap-2">
          {engineBtn("deepgram", "Deepgram")}
          {engineBtn("speechmatics", "Speechmatics")}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-brand">
          <CheckCircle2 size={12} /> المندوب هيستخدم: {engine === "deepgram" ? "Deepgram" : "Speechmatics"}
          <span className="font-normal text-muted">— بعد ما تدوس حفظ</span>
        </p>
      </div>

      {/* Deepgram */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "deepgram" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">مفتاح Deepgram</span>
        {keyRow(deepgram, setDeepgram, showDg, setShowDg, testDeepgram, testingDg, testDg, "مفتاح Deepgram", "https://console.deepgram.com/")}
      </div>

      {/* Speechmatics */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "speechmatics" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">مفتاح Speechmatics</span>
        {keyRow(speechmatics, setSpeechmatics, showSm, setShowSm, testSpeechmatics, testingSm, testSm, "مفتاح Speechmatics", "https://portal.speechmatics.com/")}
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

"use client";

import { useState } from "react";
import { Eye, EyeOff, Zap, Loader2, CheckCircle2, XCircle, Save, AudioLines, ExternalLink, Info } from "lucide-react";
import type { ServiceKeys, VoiceEngine } from "@/lib/voiceKeys";

/**
 * إدارة مفاتيح الصوت لمندوب — للأدمن فقط (جوه صفحة المندوب). محرّكان بس:
 * Deepgram (لحظي) و Groq Whisper (تسجيل ثم تحليل)، واحد نشط بس (حصري).
 * (Speechmatics و ElevenLabs وبيانات حساب الخدمة اتشالوا بطلب المالك — بس القيم
 * المحفوظة القديمة بتتساب زي ما هي عند الحفظ، مش بتتمسح.)
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
  // لو المحرك المحفوظ قديم (speechmatics/elevenlabs) نبدأ من Deepgram.
  const [engine, setEngine] = useState<VoiceEngine>(
    initial.engine === "groq" ? "groq" : "deepgram"
  );
  const [showDg, setShowDg] = useState(false);
  const [testDg, setTestDg] = useState<TestState>(null);
  const [testingDg, setTestingDg] = useState(false);
  const [saved, setSaved] = useState(false);

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

  async function save() {
    // نحفظ Deepgram + المحرك، ونسيب القيم القديمة (speechmatics/elevenlabs/الحساب)
    // زي ما هي عشان مانمسحش حاجة اتحطّت قبل كده.
    const ok = await onSave({
      deepgram: deepgram.trim(),
      speechmatics: initial.speechmatics ?? "",
      elevenlabs: initial.elevenlabs ?? "",
      engine,
      email: initial.email ?? "",
      password: initial.password ?? "",
    });
    if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1800); }
  }

  const ENGINE_LABEL: Record<string, string> = {
    deepgram: "Deepgram", groq: "Groq Whisper",
  };

  const engineBtn = (val: VoiceEngine, label: string) => (
    <button type="button" onClick={() => setEngine(val)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
        engine === val ? "bg-primary text-night" : "border border-border text-muted hover:text-primary"
      }`}>
      {engine === val ? <CheckCircle2 size={14} /> : null} {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <AudioLines size={16} className="text-primary" /> مفاتيح الصوت (للأدمن)
      </div>

      {/* المحرك النشط — واحد بس (Deepgram / Groq) */}
      <div>
        <p className="mb-1.5 text-[11px] text-muted">المحرك النشط للمندوب (واحد بس):</p>
        <div className="grid grid-cols-2 gap-2">
          {engineBtn("deepgram", "Deepgram")}
          {engineBtn("groq", "Groq Whisper")}
        </div>
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-brand">
          <CheckCircle2 size={12} /> المندوب هيستخدم: {ENGINE_LABEL[engine] ?? "Deepgram"}
          <span className="font-normal text-muted">— بعد ما تدوس حفظ</span>
        </p>
      </div>

      {/* Deepgram */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "deepgram" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">مفتاح Deepgram <span className="font-normal text-muted">(لحظي — أدق للحروف)</span></span>
        <div className="flex items-center gap-1.5">
          <input type={showDg ? "text" : "password"} value={deepgram}
            onChange={(e) => setDeepgram(e.target.value)} placeholder="مفتاح Deepgram" dir="ltr"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
          <button type="button" onClick={() => setShowDg(!showDg)}
            className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted hover:text-primary transition">
            {showDg ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={testDeepgram} disabled={testingDg || !deepgram.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-bold text-muted hover:text-primary hover:border-primary transition disabled:opacity-50">
            {testingDg ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            {testingDg ? "جارٍ..." : "اختبر"}
          </button>
          {testDg === "ok" && <span className="flex items-center gap-1 text-xs font-bold text-brand"><CheckCircle2 size={13} /> شغّال ✓</span>}
          {testDg === "bad" && <span className="flex items-center gap-1 text-xs font-bold text-danger"><XCircle size={13} /> مرفوض</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href="https://console.deepgram.com/signup" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline">
            <ExternalLink size={11} /> صفحة التسجيل / إنشاء حساب
          </a>
          <a href="https://console.deepgram.com/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-muted hover:text-primary hover:underline">
            <ExternalLink size={11} /> الرصيد والخطة
          </a>
        </div>
      </div>

      {/* Groq Whisper — بيستخدم مفتاح Groq اللي المندوب حاطه من صفحة المفاتيح */}
      <div className={`flex flex-col gap-2 rounded-xl border p-2.5 ${engine === "groq" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className="text-xs font-bold text-ink">Groq Whisper <span className="font-normal text-muted">(تسجيل ثم تحليل)</span></span>
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-primary" />
          مافيش مفتاح هنا — بيستخدم <b>مفتاح Groq</b> اللي المندوب حاطه من القائمة ← «مفتاح Groq». اختَر Groq Whisper واحفظ عشان التسجيل يفرّغ بيه (مش لحظي).
        </p>
      </div>

      <button onClick={save} disabled={busy}
        className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-50">
        <Save size={15} /> {busy ? "جارٍ الحفظ..." : saved ? "✓ اتحفظ للمندوب" : "حفظ مفاتيح المندوب"}
      </button>
      <p className="text-[10px] text-muted text-center">المفتاح المحفوظ ينزل لجهاز المندوب تلقائياً ويستخدمه في تشييك صوت والتسجيل.</p>
    </div>
  );
}

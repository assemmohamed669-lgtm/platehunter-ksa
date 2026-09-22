"use client";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «التسجيل الجديد (تجربة)» — الموديل الجديد **حيّ**
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٢ سبتمبر ٢٠٢٦): «شيل كل حاجة في الصفحة دي، امسحها مش عايزها،
 * وحطّ الموديل الجديد مكانها».
 *
 * اللي كان هنا قبل كده (سجّل ← ارفع ← فرّغ مرة واحدة بالمحرك العام + مراجعة
 * موديلنا) **اتشال بالكامل**. مكانه: تسجيل حيّ — تقول اللوحة وتطلع قدامك،
 * نفس اللي المالك بيجرّبه في المعمل بالظبط.
 *
 * 🔬 **بيشتغل على سيرفر التجربة (ماليزيا)** — `checkpoint-7500`، نفس موديل
 *    المعمل بالبايت (md5 `6d7edc70…`)، ومخرَجه اتقارن ٣٢/٣٢ متطابق حرفياً.
 *
 * ⚙️ **الكود مشترك مش نسخة:** بينده `startVoicexEngine` — نفس محرّك صفحة
 *    التشييك بالحرف (ميك → كشف كلام → نوافذ → إجماع). الفرق الوحيد إن
 *    العنوان بيروح لسيرفر التجربة بدل مؤشّر فويس اكس. كده أي فرق في النتيجة
 *    يبقى **الموديل** مش الصفحة.
 *
 * 🔒 **للأدمنز والسوبر أدمن** — الحارس في `canOpenTrialPage`.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic, Square, Loader2, AlertTriangle, Cpu, Trash2, Copy, Check, RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { readJudgeEndpoint, saveJudgeEndpoint } from "@/lib/plateJudgeGate";
import {
  canOpenTrialPage, planTrialRun, resolveTrialEndpoint,
} from "@/lib/trialModelGate";
import type { VoicexEngineController, VoicexPlateMeta } from "@/lib/voicexEngine";
import PlateBadge from "@/components/PlateBadge";

interface LiveRow {
  id: string;
  plate: string;
  /** 🟢 مؤكّدة (نافذتين+) · 🟡 محتاجة نظرة (نافذة واحدة) */
  tier: "green" | "yellow";
  conf: number;
  at: number;
}

export default function RegistrationV2Page() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** كام نافذة اتخطّت — بيتملا من `onSkip` (الرمي الصامت كان الباج الأصلي). */
  const [skipped, setSkipped] = useState(0);

  const [modelUrl, setModelUrl] = useState("");
  const [modelToken, setModelToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; msg: string } | null>(null);

  const engineRef = useRef<VoicexEngineController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ─── الصلاحية + العنوان المثبّت ──────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data.user) { setDenied("مش مسجّل دخول — ادخل الأول وبعدين افتح الصفحة دي تاني."); return; }
      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (profErr) { setDenied("مش قادر أقرا صلاحيتك: " + profErr.message); return; }
      if (!canOpenTrialPage(prof)) { setDenied("الصفحة دي للأدمنز بس، وحسابك الحالي مش أدمن."); return; }
      const ep = resolveTrialEndpoint(readJudgeEndpoint());
      setModelUrl(ep.base);
      setModelToken(ep.token);
      setAllowed(true);
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { engineRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  /* ─── فحص الاتصال — تلقائي عند الفتح ─────────────────────────────── */
  const probeModel = useCallback(async (base?: string, token?: string) => {
    const b = (base ?? modelUrl).trim().replace(/\/+$/, "");
    const t = (token ?? modelToken).trim();
    if (!b || !t) { setProbe({ ok: false, msg: "مافيش عنوان أو توكن." }); return; }
    setProbing(true);
    setProbe(null);
    try {
      const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(20000) : undefined;
      const res = await fetch(b + "/health", { headers: { "X-Plate-Token": t }, signal: timeout });
      if (res.status === 401) setProbe({ ok: false, msg: "واصل بس التوكن مرفوض." });
      else if (!res.ok) setProbe({ ok: false, msg: "السيرفر ردّ بكود " + res.status + "." });
      else {
        const body = await res.json() as { model?: string; device?: string };
        setProbe({
          ok: true,
          msg: (body.model ?? "الموديل") + " على " + (body.device === "cuda" ? "كارت الشاشة" : body.device ?? "الجهاز"),
        });
      }
    } catch {
      setProbe({ ok: false, msg: "مافيش رد — السيرفر مقفول أو عنوان النفق اتغيّر." });
    } finally {
      setProbing(false);
    }
  }, [modelUrl, modelToken]);

  useEffect(() => {
    if (allowed !== true || !modelUrl || !modelToken) return;
    void probeModel();
    // مرة واحدة عند الفتح — الإعادة بزرار «أعِد الفحص».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  /* ─── التسجيل الحيّ ───────────────────────────────────────────────── */
  async function start() {
    setError(null);
    setSkipped(0);
    const plan = planTrialRun({ base: modelUrl, token: modelToken });
    if (!plan.ok) { setError(plan.message); return; }
    try {
      const { startVoicexEngine } = await import("@/lib/voicexEngine");
      const ctrl = await startVoicexEngine({
        transcribeUrl: modelUrl.trim().replace(/\/+$/, ""),
        token: modelToken.trim(),
        onPlate: (plate: string, meta: VoicexPlateMeta) => {
          setRows((prev) => {
            // نفس اللوحة في نفس اللحظة = ترفرف نوافذ، مش لوحة تانية.
            if (prev.some((r) => r.plate === plate && Math.abs(r.at - meta.tMs) < 3000)) return prev;
            return [{ id: plate + "-" + meta.tMs, plate, tier: meta.tier, conf: meta.conf, at: meta.tMs }, ...prev];
          });
        },
        onSpeech: (active: boolean) => setSpeaking(active),
        onLevel: (lvl: number) => setLevel(lvl),
        // 🔴 الرمي الصامت كان الباج الأصلي — هنا بيتعدّ ويتعرض.
        onSkip: () => setSkipped((n) => n + 1),
        onFatal: (reason: string) => {
          try { engineRef.current?.stop(); } catch { /* ignore */ }
          engineRef.current = null;
          stopTimer();
          setListening(false);
          setError(reason === "mic_denied"
            ? "الميكروفون مرفوض — اسمح للمتصفّح بالتسجيل وجرّب تاني."
            : "السيرفر فصل وسط التسجيل. دوس «أعِد الفحص» واتأكد إنه واصل.");
        },
      });
      if (!ctrl) { setError("مش قادر يفتح الميكروفون — اسمح بالتسجيل وجرّب تاني."); return; }
      engineRef.current = ctrl;
      setListening(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("مش قادر يشغّل المحرك — جرّب تاني.");
    }
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function stop() {
    try { engineRef.current?.stop(); } catch { /* ignore */ }
    engineRef.current = null;
    stopTimer();
    setListening(false);
    setSpeaking(false);
    setLevel(0);
  }

  /* ─── العرض ──────────────────────────────────────────────────────── */
  if (denied) {
    return (
      <div className="py-10">
        <div className="mx-auto flex max-w-sm items-start gap-2 rounded-xl border border-border bg-surface p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-alert" />
          <p className="flex-1 text-xs leading-relaxed text-ink">{denied}</p>
        </div>
      </div>
    );
  }
  if (allowed === null) return <div className="py-16 text-center text-sm text-muted">جارٍ التحقق…</div>;

  const statusLabel = probing ? "بفحص…" : probe?.ok ? "🟢 متصل" : probe ? "🔴 مش واصل" : "بفحص…";
  const statusTone = probe?.ok ? "text-brand" : probe ? "text-danger" : "text-amber-500";
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  const mmss = pad(seconds / 60) + ":" + pad(seconds % 60);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div>
        <h1 className="text-xl font-black text-ink">التسجيل الجديد</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          <b className="text-ink">الموديل الجديد — تجربة.</b> دوس تسجيل وقول اللوحات
          ورا بعض؛ كل لوحة هتظهر قدامك أول ما تتقال.
        </p>
      </div>

      {/* ── حالة سيرفر التجربة ── */}
      <section className="rounded-xl border border-border bg-surface p-3">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Cpu size={14} className="shrink-0 text-brand" />
          <h2 className="text-xs font-bold text-ink">سيرفر التجربة</h2>
          <span className={"mr-auto text-[10px] font-bold " + statusTone}>{statusLabel}</span>
        </div>
        {probe && (
          <p className={"mb-2 text-[11px] leading-relaxed " + (probe.ok ? "text-brand" : "text-danger")}>
            {probe.ok ? "✓ " : "✗ "}{probe.msg}
          </p>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={() => void probeModel()}
            disabled={probing || listening}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 py-2 text-xs font-bold text-ink disabled:opacity-50"
          >
            {probing ? <><Loader2 size={14} className="animate-spin" /> بفحص…</> : <><RefreshCw size={14} /> أعِد الفحص</>}
          </button>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            disabled={listening}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-bold text-muted disabled:opacity-50"
          >
            {showAdvanced ? "إخفاء" : "تغيير العنوان"}
          </button>
        </div>
        <div className={showAdvanced ? "mt-2 flex flex-col gap-1.5" : "hidden"}>
          <p className="text-[11px] leading-relaxed text-muted">
            العنوان نفق مؤقّت وممكن يتغيّر لو السيرفر اتعاد تشغيله — حطّ الجديد هنا.
          </p>
          <input
            dir="ltr" inputMode="url" autoComplete="off" spellCheck={false}
            value={modelUrl}
            onChange={(e) => { setModelUrl(e.target.value); setSaved(false); setProbe(null); }}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary"
          />
          <input
            dir="ltr" autoComplete="off" spellCheck={false}
            value={modelToken}
            onChange={(e) => { setModelToken(e.target.value); setSaved(false); setProbe(null); }}
            className="w-full rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-[11px] text-ink outline-none focus:border-primary"
          />
          <button
            onClick={() => {
              const ok = saveJudgeEndpoint(modelUrl, modelToken);
              setSaved(ok);
              if (!ok) setError("العنوان أو التوكن شكلهم مش سليم — العنوان لازم يبدأ بـhttps.");
              else void probeModel();
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 py-2 text-xs font-bold text-ink"
          >
            {saved ? <><Check size={14} className="text-brand" /> اتحفظ</> : "احفظ وافحص"}
          </button>
        </div>
      </section>

      {/* ── زرار التسجيل ── */}
      <section className="rounded-2xl border border-border bg-surface p-4">
        <button
          onClick={listening ? stop : () => void start()}
          className={"flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-black text-white transition "
            + (listening ? "bg-danger" : "bg-primary")}
        >
          {listening ? <><Square size={20} /> إيقاف التسجيل</> : <><Mic size={20} /> ابدأ التسجيل</>}
        </button>

        {listening && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <span className="font-mono text-lg font-black tabular-nums text-danger">{mmss}</span>
            <span className={"text-xs font-bold " + (speaking ? "text-brand" : "text-muted")}>
              {speaking ? "● بيسمع صوتك" : "○ مستني…"}
            </span>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-brand transition-all" style={{ width: Math.round(Math.min(1, level) * 100) + "%" }} />
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-alert" />
            <p className="flex-1 text-[11px] leading-relaxed text-ink">{error}</p>
          </div>
        )}
      </section>

      {/* ── اللوحات ── */}
      <section className="rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-black text-ink">اللوحات</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">{rows.length}</span>
          {skipped > 0 && (
            /* شفافية: النوافذ اللي المحرّك تخطّاها. صفر = مافيش ضغط. */
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-amber-500">
              اتخطّى {skipped}
            </span>
          )}
          {rows.length > 0 && (
            <div className="mr-auto flex gap-1.5">
              <button
                onClick={() => {
                  try {
                    void navigator.clipboard.writeText(rows.map((r) => r.plate).join("\n"));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink"
              >
                {copied ? <><Check size={12} className="text-brand" /> اتنسخ</> : <><Copy size={12} /> نسخ</>}
              </button>
              <button
                onClick={() => setRows([])}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[11px] font-bold text-danger"
              >
                <Trash2 size={12} /> مسح
              </button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">
            {listening ? "قول لوحة…" : "مافيش لوحات لسه — دوس ابدأ التسجيل."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2 py-1.5">
                <PlateBadge value={r.plate} size="sm" />
                <span className={"mr-auto text-[10px] font-bold " + (r.tier === "green" ? "text-brand" : "text-amber-500")}>
                  {r.tier === "green" ? "مؤكّدة" : "محتاجة نظرة"}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted">
                  {Math.round(r.conf * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

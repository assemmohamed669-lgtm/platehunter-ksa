"use client";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «التسجيل الجديد (تجربة)» — الموديل الجديد حيّ + شيت التشييك
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٢ سبتمبر ٢٠٢٦): «يبقى مربوط بشيت التشييك اللي في صفحة التشييك،
 * والصفحة دي تشتغل بنفس شغل الصوت اللي في صفحة التشييك في كل حاجة، وشكلها
 * زي المجمع بس اللون أبيض واللوحات لونها وخطها مختلف، ويبقى فيه صفّارة
 * تحذيرية لو فيه تطابق تام بين اللي بيقوله المندوب واللي في شيت التشييك».
 *
 * ⚙️ **كله كود مشترك مش نسخة:**
 *   · الصوت    → `startVoicexEngine` (نفس محرّك صفحة التشييك بالحرف)
 *   · الشيت    → `getUploadedFile("local", "check")` — **نفس الـslot** اللي
 *                صفحة التشييك بترفع فيه، فأي ملف يترفع هناك يشتغل هنا فوراً
 *   · الفهرس   → `buildCombinedCheckIndex` (نفس دالة التشييك)
 *   · الصفّارة  → `startAlertSiren` (نفس صفّارة المطلوب)
 *
 * 🔴 **تطابق تام بس** — زي قاعدة «المطلوب» في التشييك. التقريبي بيزوّر
 *    «مطلوبة» ويطلّع صفّارة على عربية مش مطلوبة، وده أوحش من إننا نفوّت.
 *
 * 🔬 الموديل على **سيرفر التجربة (ماليزيا)** — `checkpoint-7500`.
 * 🔒 للأدمنز والسوبر أدمن.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Mic, Square, Loader2, AlertTriangle, Cpu, Trash2, Copy, Check, RefreshCw,
  FileSpreadsheet, BellRing, BellOff,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadedFile } from "@/lib/idb";
import type { ExcelTable } from "@/lib/excel";
import { buildCombinedCheckIndex } from "@/lib/checkSheets";
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "@/lib/plateParser";
import { startAlertSiren, stopAlertSiren, ensureSirenAudioUnlocked } from "@/lib/alertSiren";
import { readJudgeEndpoint, saveJudgeEndpoint } from "@/lib/plateJudgeGate";
import { canOpenTrialPage, planTrialRun, resolveTrialEndpoint } from "@/lib/trialModelGate";
import type { VoicexEngineController, VoicexPlateMeta } from "@/lib/voicexEngine";

interface LiveRow {
  id: string;
  plate: string;
  tier: "green" | "yellow";
  conf: number;
  at: number;
  /** الصف من شيت التشييك لو فيه **تطابق تام** — وإلا `null`. */
  match: Record<string, string> | null;
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
  const [skips, setSkips] = useState<Record<string, number>>({});
  const [sirenOn, setSirenOn] = useState(false);

  /** شيت التشييك — **نفس slot صفحة التشييك** (`local:check`). */
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkName, setCheckName] = useState<string>("");

  const [modelUrl, setModelUrl] = useState("");
  const [modelToken, setModelToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; msg: string } | null>(null);

  const engineRef = useRef<VoicexEngineController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** الفهرس المطبّع — نفس بناء صفحة التشييك بالحرف. */
  const checkIndex = useMemo(
    () => buildCombinedCheckIndex(checkTable ? [checkTable] : []),
    [checkTable],
  );
  /**
   * 🔴 ref عشان مسار الصوت يقرا **آخر** فهرس.
   * التصوير (closure) وقت الضغط كان بيخلّي الشيت اللي بيوصل بعد الضغطة
   * مايتشافش خالص — باج مسجّل في صفحة التشييك.
   */
  const checkIndexRef = useRef(checkIndex);
  useEffect(() => { checkIndexRef.current = checkIndex; }, [checkIndex]);

  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers, checkTable.rows) : null;

  /* ─── الصلاحية + العنوان ──────────────────────────────────────────── */
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
      try { stopAlertSiren(); } catch { /* ignore */ }
    };
  }, []);

  /** الشيت من نفس slot التشييك. */
  const loadCheck = useCallback(() => {
    getUploadedFile("local", "check")
      .then((rec) => {
        if (!rec) { setCheckTable(null); setCheckName(""); return; }
        setCheckTable({ headers: rec.headers, rows: rec.rows });
        setCheckName(rec.fileName || "ملف التشييك");
      })
      .catch(() => { /* مفيش شيت — الصفحة بتفضل شغّالة بلا مطابقة */ });
  }, []);
  useEffect(() => { if (allowed === true) loadCheck(); }, [allowed, loadCheck]);

  /* ─── فحص السيرفر — تلقائي ───────────────────────────────────────── */
  const probeModel = useCallback(async () => {
    const b = modelUrl.trim().replace(/\/+$/, "");
    const t = modelToken.trim();
    if (!b || !t) { setProbe({ ok: false, msg: "مافيش عنوان أو توكن." }); return; }
    setProbing(true); setProbe(null);
    try {
      const timeout = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(20000) : undefined;
      const res = await fetch(b + "/health", { headers: { "X-Plate-Token": t }, signal: timeout });
      if (res.status === 401) setProbe({ ok: false, msg: "واصل بس التوكن مرفوض." });
      else if (!res.ok) setProbe({ ok: false, msg: "السيرفر ردّ بكود " + res.status + "." });
      else {
        const body = await res.json() as { model?: string; device?: string };
        setProbe({ ok: true, msg: (body.model ?? "الموديل") + " على " + (body.device === "cuda" ? "كارت الشاشة" : body.device ?? "الجهاز") });
      }
    } catch {
      setProbe({ ok: false, msg: "مافيش رد — السيرفر مقفول أو عنوان النفق اتغيّر." });
    } finally { setProbing(false); }
  }, [modelUrl, modelToken]);

  useEffect(() => {
    if (allowed !== true || !modelUrl || !modelToken) return;
    void probeModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  /* ─── التسجيل ─────────────────────────────────────────────────────── */
  async function start() {
    setError(null);
    setSkips({});
    const plan = planTrialRun({ base: modelUrl, token: modelToken });
    if (!plan.ok) { setError(plan.message); return; }
    // 🔊 الصفّارة لازم تتفكّ بلمسة مستخدم حيّة — من غير كده المتصفّح بيكتمها
    // وأول «مطلوبة» بتعدّي في صمت (باج مسجّل عندنا قبل كده).
    try { ensureSirenAudioUnlocked(); } catch { /* ignore */ }
    loadCheck();                                   // آخر نسخة من الشيت
    try {
      const { startVoicexEngine } = await import("@/lib/voicexEngine");
      const ctrl = await startVoicexEngine({
        transcribeUrl: modelUrl.trim().replace(/\/+$/, "") + "/transcribe",
        token: modelToken.trim(),
        onPlate: (plate: string, meta: VoicexPlateMeta) => {
          // 🔴 **تطابق تام بس** — نفس تطبيع التشييك بالحرف.
          const key = normalizePlate(bankPlateToArabic(plate));
          const hit = checkIndexRef.current.get(key) ?? null;
          setRows((prev) => {
            if (prev.some((r) => r.plate === plate && Math.abs(r.at - meta.tMs) < 3000)) return prev;
            return [{ id: plate + "-" + meta.tMs, plate, tier: meta.tier, conf: meta.conf, at: meta.tMs, match: hit }, ...prev];
          });
          if (hit) { try { startAlertSiren(); setSirenOn(true); } catch { /* ignore */ } }
        },
        onSpeech: (active: boolean) => setSpeaking(active),
        onLevel: (lvl: number) => setLevel(lvl),
        onSkip: (reason: string) => setSkips((m) => ({ ...m, [reason]: (m[reason] ?? 0) + 1 })),
        onFatal: (reason: string) => {
          try { engineRef.current?.stop(); } catch { /* ignore */ }
          engineRef.current = null;
          stopTimer(); setListening(false);
          setError(reason === "mic_denied"
            ? "الميكروفون مرفوض — اسمح للمتصفّح بالتسجيل وجرّب تاني."
            : "السيرفر فصل وسط التسجيل. دوس «أعِد الفحص» واتأكد إنه واصل.");
        },
      });
      if (!ctrl) { setError("مش قادر يفتح الميكروفون — اسمح بالتسجيل وجرّب تاني."); return; }
      engineRef.current = ctrl;
      setListening(true); setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("مش قادر يشغّل المحرك — جرّب تاني.");
    }
  }

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }

  function stop() {
    try { engineRef.current?.stop(); } catch { /* ignore */ }
    engineRef.current = null;
    stopTimer(); setListening(false); setSpeaking(false); setLevel(0);
  }

  function silence() {
    try { stopAlertSiren(); } catch { /* ignore */ }
    setSirenOn(false);
  }

  /* ─── العرض ───────────────────────────────────────────────────────── */
  if (denied) {
    return (
      <div className="py-10">
        <div className="mx-auto flex max-w-sm items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="flex-1 text-xs leading-relaxed text-slate-800">{denied}</p>
        </div>
      </div>
    );
  }
  if (allowed === null) return <div className="py-16 text-center text-sm text-slate-500">جارٍ التحقق…</div>;

  const statusLabel = probing ? "بفحص…" : probe?.ok ? "🟢 متصل" : probe ? "🔴 مش واصل" : "بفحص…";
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  const mmss = pad(seconds / 60) + ":" + pad(seconds % 60);
  const hits = rows.filter((r) => r.match).length;

  return (
    /* ⬜ أبيض بالكامل — بطلب المالك. مش بنستعمل توكنات الثيم هنا عشان الصفحة
       تفضل بيضا حتى لو الجهاز على الوضع الداكن. */
    <div dir="rtl" className="-mx-4 -mt-4 min-h-screen bg-white px-4 pb-10 pt-4 text-slate-900">
      <h1 className="text-2xl font-black tracking-tight text-slate-900">التسجيل الجديد</h1>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        الموديل الجديد — تجربة. قول اللوحات ورا بعض؛ اللي في شيت التشييك هتطلع
        <b className="text-rose-600"> بصفّارة</b>.
      </p>

      {/* ── شيت التشييك ── */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <FileSpreadsheet size={16} className={checkIndex.size ? "text-emerald-600" : "text-slate-300"} />
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-900">
              {checkIndex.size ? checkName : "مافيش ملف تشييك"}
            </p>
            <p className="text-[11px] text-slate-500">
              {checkIndex.size
                ? checkIndex.size.toLocaleString("ar-EG") + " لوحة · عمود «" + (checkPlateCol ?? "؟") + "»"
                : "ارفعه من صفحة التشييك — الصفحتين على نفس الملف"}
            </p>
          </div>
          <button onClick={loadCheck} className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600">
            تحديث
          </button>
        </div>
      </section>

      {/* ── سيرفر التجربة ── */}
      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <Cpu size={14} className="shrink-0 text-indigo-600" />
          <h2 className="text-xs font-bold text-slate-900">سيرفر التجربة</h2>
          <span className={"mr-auto text-[10px] font-bold " + (probe?.ok ? "text-emerald-600" : probe ? "text-rose-600" : "text-amber-500")}>
            {statusLabel}
          </span>
        </div>
        {probe && (
          <p className={"mt-1 text-[11px] " + (probe.ok ? "text-emerald-600" : "text-rose-600")}>
            {probe.ok ? "✓ " : "✗ "}{probe.msg}
          </p>
        )}
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => void probeModel()} disabled={probing || listening}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
            {probing ? <><Loader2 size={14} className="animate-spin" /> بفحص…</> : <><RefreshCw size={14} /> أعِد الفحص</>}
          </button>
          <button onClick={() => setShowAdvanced((v) => !v)} disabled={listening}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 disabled:opacity-50">
            {showAdvanced ? "إخفاء" : "تغيير العنوان"}
          </button>
        </div>
        <div className={showAdvanced ? "mt-2 flex flex-col gap-1.5" : "hidden"}>
          <input dir="ltr" inputMode="url" autoComplete="off" spellCheck={false} value={modelUrl}
            onChange={(e) => { setModelUrl(e.target.value); setSaved(false); setProbe(null); }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-indigo-500" />
          <input dir="ltr" autoComplete="off" spellCheck={false} value={modelToken}
            onChange={(e) => { setModelToken(e.target.value); setSaved(false); setProbe(null); }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-900 outline-none focus:border-indigo-500" />
          <button onClick={() => {
            const ok = saveJudgeEndpoint(modelUrl, modelToken);
            setSaved(ok);
            if (!ok) setError("العنوان أو التوكن شكلهم مش سليم — العنوان لازم يبدأ بـhttps.");
            else void probeModel();
          }} className="rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700">
            {saved ? "اتحفظ ✓" : "احفظ وافحص"}
          </button>
        </div>
      </section>

      {/* ── التسجيل ── */}
      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button onClick={listening ? stop : () => void start()}
          className={"flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-black text-white shadow-sm transition "
            + (listening ? "bg-rose-600" : "bg-indigo-600")}>
          {listening ? <><Square size={20} /> إيقاف التسجيل</> : <><Mic size={20} /> ابدأ التسجيل</>}
        </button>

        {listening && (
          <div className="mt-3 flex flex-col items-center gap-1.5">
            <span className="font-mono text-2xl font-black tabular-nums text-rose-600">{mmss}</span>
            <span className={"text-xs font-bold " + (speaking ? "text-emerald-600" : "text-slate-400")}>
              {speaking ? "● بيسمع صوتك" : "○ مستني…"}
            </span>
            <div className="h-1.5 w-44 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: Math.round(Math.min(1, level) * 100) + "%" }} />
            </div>
          </div>
        )}

        {sirenOn && (
          <button onClick={silence}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 py-3 text-sm font-black text-white">
            <BellOff size={18} /> اسكت الصفّارة
          </button>
        )}

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="flex-1 text-[11px] leading-relaxed text-amber-900">{error}</p>
          </div>
        )}
      </section>

      {/* ── اللوحات ── */}
      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-black text-slate-900">اللوحات</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{rows.length}</span>
          {hits > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700">
              <BellRing size={11} /> مطلوبة {hits}
            </span>
          )}
          {rows.length > 0 && (
            <div className="mr-auto flex gap-1.5">
              <button onClick={() => {
                try {
                  void navigator.clipboard.writeText(rows.map((r) => r.plate + (r.match ? "  ← مطلوبة" : "")).join("\n"));
                  setCopied(true); setTimeout(() => setCopied(false), 1500);
                } catch { /* ignore */ }
              }} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">
                {copied ? <><Check size={12} className="text-emerald-600" /> اتنسخ</> : <><Copy size={12} /> نسخ</>}
              </button>
              <button onClick={() => setRows([])}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-rose-600">
                <Trash2 size={12} /> مسح
              </button>
            </div>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {listening ? "قول لوحة…" : "مافيش لوحات لسه — دوس ابدأ التسجيل."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id}
                className={"flex items-center gap-2 rounded-xl border px-3 py-2.5 "
                  + (r.match ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white")}>
                {/* 🔤 اللوحة بخط ولون مختلفين — بطلب المالك */}
                <span dir="ltr" className={"font-mono text-xl font-black tracking-[0.2em] tabular-nums "
                  + (r.match ? "text-rose-700" : "text-indigo-700")}>
                  {r.plate}
                </span>
                {r.match ? (
                  <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                    <BellRing size={10} /> مطلوبة
                  </span>
                ) : (
                  <span className={"text-[10px] font-bold " + (r.tier === "green" ? "text-emerald-600" : "text-amber-500")}>
                    {r.tier === "green" ? "مؤكّدة" : "محتاجة نظرة"}
                  </span>
                )}
                <span className="mr-auto font-mono text-[10px] tabular-nums text-slate-400">
                  {Math.round(r.conf * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── تشخيص ── */}
      {Object.keys(skips).length > 0 && (
        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="mb-1.5 text-xs font-bold text-slate-900">🔍 نوافذ ماتبعتتش</h2>
          <ul className="flex flex-col gap-1">
            {Object.entries(skips).map(([reason, n]) => (
              <li key={reason} className="flex items-center gap-2 text-[11px]">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono font-bold text-amber-600">{n}</span>
                <span className="text-slate-700">{SKIP_LABEL[reason] ?? SKIP_LABEL[reason.split(":")[0]] ?? reason}</span>
                {reason.includes(":") && (
                  <span dir="ltr" className="mr-auto font-mono text-[10px] text-slate-400">{reason.split(":").slice(1).join(":")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const SKIP_LABEL: Record<string, string> = {
  silence_gate: "بوابة السكوت رفضت — الصوت واطي أوي أو مافيش كلام واضح",
  slice_failed: "القصّ رجع فاضي — الميك مش بيملا الذاكرة",
  empty_slice: "المقطع طلع فاضي عملياً (بايت)",
  too_short: "النافذة أقصر من ٠.٦ ثانية",
  busy_window: "الموديل كان مشغول (نافذة زاحفة — عادي)",
  yield_to_utterance: "اتنازلت لقراءة نطق مستنية (عادي)",
  utterance_queue_full: "الطابور اتملا — بتتكلّم أسرع من رد السيرفر",
  request_failed: "🔴 الطلب اتبعت وفشل",
};

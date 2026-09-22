"use client";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  «التسجيل الجديد (تجربة)» — الموديل الجديد حيّ + شيت التشييك + تقرير شامل
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٢ سبتمبر ٢٠٢٦):
 *   «موقع اللوحة مش طالع · النوع والملاحظة مفيش عمود ليهم · التاريخ ولينك
 *    السيارة مش موجودين · عايز تقرير شامل مؤقّت يعرّفنا كل حاجة — إيه اللي
 *    ناقص والغلط جاي منين ولو فيه هلوسة ولو فيه رقم مااتكتبش، حتى سرعة ظهور
 *    اللوحة وليه اتأخرت · وأزرار مسح وتصدير زي اللي في التشييك · ومؤشّر
 *    الصوت زي بتاع المعمل».
 *
 * ⚙️ **كله كود مشترك مش نسخة:**
 *   الصوت `startVoicexEngine` · الشيت `getUploadedFile("local","check")`
 *   الفهرس `buildCombinedCheckIndex` · الصفّارة `startAlertSiren`
 *   الموقع `gpsService` · التصدير `buildExcelBlob`/`shareExcelBlob`
 *
 * 🔴 **تطابق تام بس** للصفّارة — التقريبي بيزوّر «مطلوبة».
 * 🔬 الموديل على سيرفر التجربة (ماليزيا) · النوع من كوهير على نفق منفصل.
 * 🔒 للأدمنز والسوبر أدمن.
 *
 * ⚠️ **التقرير مؤقّت** — بطلب المالك، بيتشال بعد ما التجربة تخلص.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Mic, Square, Loader2, AlertTriangle, Cpu, Trash2, Copy, Check, RefreshCw,
  FileSpreadsheet, BellRing, BellOff, MapPin, Download, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadedFile } from "@/lib/idb";
import { type ExcelTable, buildExcelBlob, shareExcelBlob } from "@/lib/excel";
import { buildCombinedCheckIndex } from "@/lib/checkSheets";
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "@/lib/plateParser";
import { startAlertSiren, stopAlertSiren, ensureSirenAudioUnlocked } from "@/lib/alertSiren";
import { toMapsLink, gpsService, gpsAccuracyLevel, type GpsCoords } from "@/lib/gps";
import { readJudgeEndpoint, saveJudgeEndpoint } from "@/lib/plateJudgeGate";
import {
  canOpenTrialPage, planTrialRun, resolveTrialEndpoint, TRIAL_TYPE_BASE,
} from "@/lib/trialModelGate";
import type { VoicexEngineController, VoicexPlateMeta } from "@/lib/voicexEngine";

/** صف لوحة ظهرت. */
interface LiveRow {
  id: string;
  plate: string;
  tier: "green" | "yellow";
  conf: number;
  /** زمن **النطق** (مركز النافذة) داخل الجلسة */
  atMs: number;
  /** ساعة الحائط لما الصف اتعرض — الفرق بينه وبين النطق = التأخير */
  shownAt: number;
  /** التأخير من لحظة النطق لحد ما ظهر (مللي) */
  latencyMs: number;
  match: Record<string, string> | null;
  type: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
}

/** قراءة خام من الموديل — للتقرير. */
interface ReadLog {
  t: number;
  rawText: string;
  plate: string;
  accepted: boolean;
  conf: number;
  minLogprob: number | null;
  blocked: boolean;
  tMs: number;
  msModel: number | null;
  msWall: number;
}

const WELL = /^[ء-ي]{3}\d{4}$/;

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
  const [reads, setReads] = useState<ReadLog[]>([]);
  const [showReport, setShowReport] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkName, setCheckName] = useState<string>("");
  const [gps, setGps] = useState<GpsCoords | null>(null);

  const [modelUrl, setModelUrl] = useState("");
  const [modelToken, setModelToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; msg: string } | null>(null);
  const [typeProbe, setTypeProbe] = useState<{ ok: boolean; msg: string } | null>(null);

  const engineRef = useRef<VoicexEngineController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const gpsRef = useRef<GpsCoords | null>(null);
  /**
   * 🔴 **طابور أنواع بيتستهلك مرة واحدة** — مش «آخر نوع سمعناه».
   *
   * النوافذ **متداخلة بالتصميم** (٥ث كل ١.٥ث)، فكلمة «ونيت» اتقالت مرة
   * بتظهر في ٣-٤ نوافذ ورا بعض. لما كنا بنمسك «آخر نوع» كان بيلزق على
   * **كل لوحة** بعدها (شكوى المالك: «كل لوحة بيكتب قدامها ونيت»).
   *
   * القاعدة دلوقتي: كل نوع **يتصرف لأقرب لوحة مرة واحدة وخلاص**، والتكرار
   * من نفس النطق بيتلغى بمفتاح (النص + أقرب ثانيتين).
   */
  const typeQueueRef = useRef<Array<{ type: string | null; note: string | null; tMs: number; used: boolean }>>([]);
  const typeSeenRef = useRef<Set<string>>(new Set());

  const checkIndex = useMemo(
    () => buildCombinedCheckIndex(checkTable ? [checkTable] : []),
    [checkTable],
  );
  const checkIndexRef = useRef(checkIndex);
  useEffect(() => { checkIndexRef.current = checkIndex; }, [checkIndex]);
  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers, checkTable.rows) : null;

  /* ─── الصلاحية ────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data, error: authErr } = await supabase.auth.getUser();
      if (authErr || !data.user) { setDenied("مش مسجّل دخول — ادخل الأول وبعدين افتح الصفحة دي تاني."); return; }
      const { data: prof, error: profErr } = await supabase
        .from("profiles").select("role, is_super").eq("id", data.user.id).single();
      if (profErr) { setDenied("مش قادر أقرا صلاحيتك: " + profErr.message); return; }
      if (!canOpenTrialPage(prof)) { setDenied("الصفحة دي للأدمنز بس، وحسابك الحالي مش أدمن."); return; }
      const ep = resolveTrialEndpoint(readJudgeEndpoint());
      setModelUrl(ep.base); setModelToken(ep.token); setAllowed(true);
    })();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { engineRef.current?.stop(); } catch { /* ignore */ }
      try { stopAlertSiren(); } catch { /* ignore */ }
    };
  }, []);

  /* ─── 📍 الموقع — متتبّع حيّ طول ما الصفحة مفتوحة ─────────────────── */
  useEffect(() => {
    if (allowed !== true) return;
    gpsService.startTracking().catch(() => { /* المستخدم رفض — الصفحة بتفضل شغّالة */ });
    const unsub = gpsService.subscribe((c) => { gpsRef.current = c; setGps(c); });
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, [allowed]);

  /* ─── الشيت ───────────────────────────────────────────────────────── */
  const loadCheck = useCallback(() => {
    getUploadedFile("local", "check")
      .then((rec) => {
        if (!rec) { setCheckTable(null); setCheckName(""); return; }
        setCheckTable({ headers: rec.headers, rows: rec.rows });
        setCheckName(rec.fileName || "ملف التشييك");
      })
      .catch(() => { /* مفيش شيت */ });
  }, []);
  useEffect(() => { if (allowed === true) loadCheck(); }, [allowed, loadCheck]);

  /* ─── فحص السيرفرين ──────────────────────────────────────────────── */
  const probeModel = useCallback(async () => {
    const b = modelUrl.trim().replace(/\/+$/, "");
    const t = modelToken.trim();
    if (!b || !t) { setProbe({ ok: false, msg: "مافيش عنوان أو توكن." }); return; }
    setProbing(true); setProbe(null); setTypeProbe(null);
    const to = () => (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(20000) : undefined);
    try {
      const res = await fetch(b + "/health", { headers: { "X-Plate-Token": t }, signal: to() });
      if (res.status === 401) setProbe({ ok: false, msg: "واصل بس التوكن مرفوض." });
      else if (!res.ok) setProbe({ ok: false, msg: "السيرفر ردّ بكود " + res.status + "." });
      else {
        const body = await res.json() as { model?: string; device?: string };
        setProbe({ ok: true, msg: (body.model ?? "الموديل") + " على " + (body.device === "cuda" ? "كارت الشاشة" : body.device ?? "الجهاز") });
      }
    } catch {
      setProbe({ ok: false, msg: "مافيش رد — السيرفر مقفول أو عنوان النفق اتغيّر." });
    } finally { setProbing(false); }
    // 🏷️ سيرفر النوع منفصل — فشله **مايمنعش** اللوحات، بس لازم يبان.
    try {
      const r2 = await fetch(TRIAL_TYPE_BASE.replace(/\/+$/, "") + "/health", { signal: to() });
      if (!r2.ok) setTypeProbe({ ok: false, msg: "كود " + r2.status });
      else {
        const b2 = await r2.json() as { types?: number };
        setTypeProbe({ ok: true, msg: (b2.types ?? 0) + " عنصر" });
      }
    } catch { setTypeProbe({ ok: false, msg: "مافيش رد" }); }
  }, [modelUrl, modelToken]);

  useEffect(() => {
    if (allowed !== true || !modelUrl || !modelToken) return;
    void probeModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  /** 🏷️ يسأل كوهير عن النوع/الملاحظة لنفس النافذة. فشله بيتبلع بالقصد. */
  const askType = useCallback(async (wav: Blob, tMs: number) => {
    try {
      const res = await fetch(TRIAL_TYPE_BASE.replace(/\/+$/, "") + "/type", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", "Authorization": "Bearer " + modelToken.trim() },
        body: wav,
      });
      if (!res.ok) return;
      const j = await res.json() as { ok?: boolean; type?: string | null; note?: string | null };
      if (!j?.ok) return;
      if (!j.type && !j.note) return;
      // نفس النطق بيوصل في كذا نافذة متداخلة — بنعدّه **مرة واحدة**.
      const sig = (j.type ?? "") + "|" + (j.note ?? "") + "|" + Math.round(tMs / 2000);
      if (typeSeenRef.current.has(sig)) return;
      typeSeenRef.current.add(sig);
      const entry = { type: j.type ?? null, note: j.note ?? null, tMs, used: false };
      typeQueueRef.current.push(entry);
      // لوحة ظهرت خلاص في نفس النافذة ولسه بلا نوع؟ تاخده بأثر رجعي (كوهير أبطأ).
      let consumed = false;
      setRows((prev) => prev.map((r) => {
        if (consumed || r.type || r.note || Math.abs(r.atMs - tMs) > 2500) return r;
        consumed = true;
        return { ...r, type: entry.type, note: entry.note };
      }));
      if (consumed) entry.used = true;
    } catch { /* النوع إضافة — مايوقّفش اللوحات */ }
  }, [modelToken]);

  /* ─── التسجيل ─────────────────────────────────────────────────────── */
  async function start() {
    setError(null); setSkips({}); setReads([]);
    typeQueueRef.current = []; typeSeenRef.current = new Set();
    const plan = planTrialRun({ base: modelUrl, token: modelToken });
    if (!plan.ok) { setError(plan.message); return; }
    try { ensureSirenAudioUnlocked(); } catch { /* ignore */ }
    loadCheck();
    startedAtRef.current = Date.now();
    try {
      const { startVoicexEngine } = await import("@/lib/voicexEngine");
      const ctrl = await startVoicexEngine({
        transcribeUrl: modelUrl.trim().replace(/\/+$/, "") + "/transcribe",
        token: modelToken.trim(),
        onPlate: (plate: string, meta: VoicexPlateMeta) => {
          const key = normalizePlate(bankPlateToArabic(plate));
          const hit = checkIndexRef.current.get(key) ?? null;
          const g = gpsRef.current;
          // أقرب نوع غير مستهلَك في نافذة اللوحة — ويتستهلك فوراً فمايتكررش.
          let ty: { type: string | null; note: string | null } | null = null;
          let best = Infinity;
          let bestEntry: { used: boolean } | null = null;
          for (const e of typeQueueRef.current) {
            if (e.used) continue;
            const d = Math.abs(e.tMs - meta.tMs);
            if (d < 2500 && d < best) { best = d; ty = { type: e.type, note: e.note }; bestEntry = e; }
          }
          if (bestEntry) bestEntry.used = true;
          const now = Date.now();
          setRows((prev) => {
            if (prev.some((r) => r.plate === plate && Math.abs(r.atMs - meta.tMs) < 3000)) return prev;
            return [{
              id: plate + "-" + meta.tMs, plate, tier: meta.tier, conf: meta.conf,
              atMs: meta.tMs, shownAt: now,
              // التأخير = من لحظة النطق لحد ما الصف ظهر قدام المندوب.
              latencyMs: Math.max(0, now - startedAtRef.current - meta.tMs),
              match: hit, type: ty?.type ?? null, note: ty?.note ?? null,
              lat: g?.lat ?? null, lng: g?.lng ?? null, gpsAccuracy: g?.accuracy ?? null,
            }, ...prev];
          });
          if (hit) { try { startAlertSiren(); setSirenOn(true); } catch { /* ignore */ } }
        },
        onRead: (r) => setReads((prev) => [{ ...r, t: Date.now() }, ...prev].slice(0, 400)),
        onAudioWindow: (wav, tMs) => { void askType(wav, tMs); },
        onSpeech: (active: boolean) => setSpeaking(active),
        onLevel: (lvl: number) => setLevel(lvl),
        onSkip: (reason: string) => setSkips((m) => ({ ...m, [reason]: (m[reason] ?? 0) + 1 })),
        onFatal: (reason: string) => {
          try { engineRef.current?.stop(); } catch { /* ignore */ }
          engineRef.current = null; stopTimer(); setListening(false);
          setError(reason === "mic_denied"
            ? "الميكروفون مرفوض — اسمح للمتصفّح بالتسجيل وجرّب تاني."
            : "السيرفر فصل وسط التسجيل. دوس «أعِد الفحص» واتأكد إنه واصل.");
        },
      });
      if (!ctrl) { setError("مش قادر يفتح الميكروفون — اسمح بالتسجيل وجرّب تاني."); return; }
      engineRef.current = ctrl;
      setListening(true); setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch { setError("مش قادر يشغّل المحرك — جرّب تاني."); }
  }

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  function stop() {
    try { engineRef.current?.stop(); } catch { /* ignore */ }
    engineRef.current = null; stopTimer(); setListening(false); setSpeaking(false); setLevel(0);
  }
  function silence() { try { stopAlertSiren(); } catch { /* ignore */ } setSirenOn(false); }

  /* ─── 📤 التصدير — نفس أسلوب التشييك ─────────────────────────────── */
  async function exportRows() {
    if (!rows.length) return;
    setBusy("بحضّر الملف…");
    try {
      const data = rows.slice().reverse().map((r, i) => ({
        "#": i + 1,
        "رقم اللوحة": r.plate,
        "النوع": r.type ?? "",
        "الملاحظة": r.note ?? "",
        "مطلوبة": r.match ? "نعم" : "",
        "التاريخ": new Date(r.shownAt).toLocaleDateString("ar-EG"),
        "الوقت": new Date(r.shownAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        "الموقع": r.lat != null && r.lng != null ? toMapsLink(r.lat, r.lng) : "",
        "دقة الموقع (متر)": r.gpsAccuracy != null ? Math.round(r.gpsAccuracy) : "",
        "الحالة": r.tier === "green" ? "مؤكّدة" : "محتاجة نظرة",
        "الثقة %": Math.round(r.conf * 100),
        "زمن النطق (ث)": (r.atMs / 1000).toFixed(1),
        "التأخير (ث)": (r.latencyMs / 1000).toFixed(1),
      }));
      const blob = buildExcelBlob(data, "تجربة الموديل الجديد");
      const name = "تجربة-الموديل-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".xlsx";
      await shareExcelBlob(blob, name, "تجربة الموديل الجديد");
    } catch {
      setError("تعذّر التصدير — جرّب تاني.");
    } finally { setBusy(null); }
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
  const gpsLevel = gps ? gpsAccuracyLevel(gps.accuracy) : null;

  /* ── حسابات التقرير ── */
  const blocked = reads.filter((r) => r.blocked).length;
  const refused = reads.filter((r) => !r.accepted && !r.blocked).length;
  const shown = new Set(rows.map((r) => r.plate));
  /** قراءات فيها لوحة سليمة الشكل ومع ذلك ماظهرتش — «فين راحت؟» */
  const heardNotShown = reads
    .filter((r) => r.accepted && !r.blocked)
    .flatMap((r) => (r.plate || "").split(/\s+/).filter((p) => WELL.test(p)))
    .filter((p) => !shown.has(p));
  /** نص فيه أرقام بس اللوحة مالهاش الشكل الصح = رقم/حرف ضاع في الكتابة */
  const malformed = reads.filter((r) => /\d/.test(r.rawText || "") && !(r.plate || "").split(/\s+/).some((p) => WELL.test(p)));
  const lat = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const medLatency = lat.length ? lat[Math.floor(lat.length / 2)] : null;
  const mw = reads.map((r) => r.msWall).sort((a, b) => a - b);
  const medWall = mw.length ? mw[Math.floor(mw.length / 2)] : null;
  const mm = reads.map((r) => r.msModel ?? 0).filter(Boolean).sort((a, b) => a - b);
  const medModel = mm.length ? mm[Math.floor(mm.length / 2)] : null;
  const withType = rows.filter((r) => r.type || r.note).length;
  const withGps = rows.filter((r) => r.lat != null).length;

  return (
    <div dir="rtl" className="-mx-4 -mt-4 min-h-screen bg-white px-4 pb-10 pt-4 text-slate-900">
      <h1 className="text-2xl font-black tracking-tight">التسجيل الجديد</h1>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        الموديل الجديد — تجربة. اللي في شيت التشييك هتطلع <b className="text-rose-600">بصفّارة</b>.
      </p>

      {/* ── الحالة: الشيت · الموديل · النوع · الموقع ── */}
      <section className="mt-4 grid grid-cols-2 gap-2">
        <Stat icon={<FileSpreadsheet size={13} />} ok={checkIndex.size > 0}
          title={checkIndex.size ? checkIndex.size.toLocaleString("ar-EG") + " لوحة" : "مافيش شيت"}
          sub={checkIndex.size ? (checkName || "") : "ارفعه من صفحة التشييك"} />
        <Stat icon={<Cpu size={13} />} ok={!!probe?.ok} title={statusLabel} sub={probe?.msg ?? ""} />
        <Stat icon={<span className="text-[11px]">🏷️</span>} ok={!!typeProbe?.ok}
          title={typeProbe?.ok ? "النوع 🟢" : "النوع 🔴"} sub={typeProbe?.msg ?? "بفحص…"} />
        <Stat icon={<MapPin size={13} />} ok={!!gps && gpsLevel !== "poor"}
          title={gps ? "الموقع " + (gpsLevel === "good" ? "🟢" : gpsLevel === "ok" ? "🟡" : "🔴") : "مافيش موقع"}
          sub={gps ? "±" + Math.round(gps.accuracy) + " متر" : "اسمح بالموقع"} />
      </section>

      <div className="mt-2 flex gap-1.5">
        <button onClick={() => { void probeModel(); loadCheck(); }} disabled={probing || listening}
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
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-500" />
        <input dir="ltr" autoComplete="off" spellCheck={false} value={modelToken}
          onChange={(e) => { setModelToken(e.target.value); setSaved(false); setProbe(null); }}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] outline-none focus:border-indigo-500" />
        <button onClick={() => {
          const ok = saveJudgeEndpoint(modelUrl, modelToken); setSaved(ok);
          if (!ok) setError("العنوان أو التوكن شكلهم مش سليم."); else void probeModel();
        }} className="rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700">
          {saved ? "اتحفظ ✓" : "احفظ وافحص"}
        </button>
      </div>

      {/* ── التسجيل + مؤشّر الصوت ── */}
      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button onClick={listening ? stop : () => void start()}
          className={"flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-black text-white shadow-sm transition "
            + (listening ? "bg-rose-600" : "bg-indigo-600")}>
          {listening ? <><Square size={20} /> إيقاف التسجيل</> : <><Mic size={20} /> ابدأ التسجيل</>}
        </button>

        {listening && (
          <div className="mt-3 flex flex-col items-center gap-2">
            <span className="font-mono text-2xl font-black tabular-nums text-rose-600">{mmss}</span>
            <span className={"text-xs font-bold " + (speaking ? "text-emerald-600" : "text-slate-400")}>
              {speaking ? "● بيسمع صوتك" : "○ مستني…"}
            </span>
            {/* 🎚️ مؤشّر أعمدة زي المعمل — بيتحرك مع الصوت بوضوح أكتر من شريط واحد */}
            <VuMeter level={level} speaking={speaking} />
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
          <h2 className="text-sm font-black">اللوحات</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{rows.length}</span>
          {hits > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700">
              <BellRing size={11} /> مطلوبة {hits}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            {listening ? "قول لوحة…" : "مافيش لوحات لسه — دوس ابدأ التسجيل."}
          </p>
        ) : (
          /* 📊 جدول زي الإكسل — كل عمود فيه حاجة واحدة، بطلب المالك.
             بيتمرّر أفقياً على الموبايل بدل ما الأعمدة تتلخبط فوق بعض. */
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[11px]">
              <thead>
                <tr className="border-b-2 border-slate-200 text-[10px] text-slate-500">
                  <Th className="w-8">#</Th>
                  <Th className="w-32">رقم اللوحة</Th>
                  <Th className="w-20">النوع</Th>
                  <Th className="w-24">الملاحظة</Th>
                  <Th className="w-16">مطلوبة</Th>
                  <Th className="w-20">الوقت</Th>
                  <Th className="w-16">الموقع</Th>
                  <Th className="w-14">الثقة</Th>
                  <Th className="w-16">الحالة</Th>
                  <Th className="w-16">ظهرت بعد</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}
                    className={"border-b border-slate-100 " + (r.match ? "bg-rose-50" : "")}>
                    <Td className="text-slate-400">{rows.length - i}</Td>
                    <Td>
                      {/* 🔤 اللوحة بخط ولون مختلفين — بطلب المالك */}
                      <span dir="ltr" className={"font-mono text-base font-black tracking-[0.15em] tabular-nums "
                        + (r.match ? "text-rose-700" : "text-indigo-700")}>{r.plate}</span>
                    </Td>
                    <Td className={r.type ? "font-bold text-slate-900" : "text-slate-300"}>{r.type || "—"}</Td>
                    <Td className={r.note ? "font-bold text-slate-900" : "text-slate-300"}>{r.note || "—"}</Td>
                    <Td>
                      {r.match
                        ? <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] font-black text-white">مطلوبة</span>
                        : <span className="text-slate-300">—</span>}
                    </Td>
                    <Td className="font-mono tabular-nums text-slate-600">
                      {new Date(r.shownAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </Td>
                    <Td>
                      {r.lat != null && r.lng != null
                        ? <a href={toMapsLink(r.lat, r.lng)} target="_blank" rel="noreferrer"
                            className="flex items-center gap-0.5 font-bold text-indigo-600 underline"><MapPin size={10} /> فتح</a>
                        : <span className="text-rose-500">مافيش</span>}
                    </Td>
                    <Td className="font-mono tabular-nums text-slate-500">{Math.round(r.conf * 100)}%</Td>
                    <Td className={r.tier === "green" ? "text-emerald-600" : "text-amber-500"}>
                      {r.tier === "green" ? "مؤكّدة" : "محتاجة نظرة"}
                    </Td>
                    <Td className="font-mono tabular-nums text-slate-400">{(r.latencyMs / 1000).toFixed(1)}ث</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 🧹📤 مسح وتصدير — زي التشييك */}
        {rows.length > 0 && (
          <div className="mt-3 flex gap-1.5">
            <button onClick={() => void exportRows()} disabled={!!busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</> : <><Download size={14} /> تصدير إكسل</>}
            </button>
            <button onClick={() => {
              try {
                void navigator.clipboard.writeText(rows.slice().reverse()
                  .map((r) => [r.plate, r.type ?? "", r.note ?? "", r.match ? "مطلوبة" : ""].filter(Boolean).join("  ")).join("\n"));
                setCopied(true); setTimeout(() => setCopied(false), 1500);
              } catch { /* ignore */ }
            }} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">
              {copied ? <><Check size={13} className="text-emerald-600" /> اتنسخ</> : <><Copy size={13} /> نسخ</>}
            </button>
            <button onClick={() => { if (confirm("تمسح كل اللوحات؟")) { setRows([]); setReads([]); setSkips({}); } }}
              className="flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-600">
              <Trash2 size={13} /> مسح
            </button>
          </div>
        )}
      </section>

      {/* ══ 📋 التقرير الشامل — مؤقّت ══ */}
      <section className="mt-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
        <button onClick={() => setShowReport((v) => !v)} className="flex w-full items-center gap-2">
          <h2 className="text-sm font-black">📋 التقرير الشامل</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">مؤقّت</span>
          <span className="mr-auto text-slate-400">{showReport ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>

        {showReport && (
          <div className="mt-2 flex flex-col gap-3">
            <Block title="الحصيلة">
              <Kv k="لوحات ظهرت" v={String(rows.length)} />
              <Kv k="منها مطلوبة (تطابق تام)" v={String(hits)} tone={hits ? "bad" : undefined} />
              <Kv k="معاها نوع أو ملاحظة" v={withType + " / " + rows.length} tone={rows.length && !withType ? "bad" : undefined} />
              <Kv k="معاها موقع GPS" v={withGps + " / " + rows.length} tone={rows.length && !withGps ? "bad" : undefined} />
            </Block>

            <Block title="سرعة الظهور — وليه اتأخرت">
              <Kv k="وسيط التأخير من النطق للظهور" v={medLatency != null ? (medLatency / 1000).toFixed(1) + " ث" : "—"} />
              <Kv k="وسيط زمن الموديل نفسه" v={medModel != null ? Math.round(medModel) + " مللي" : "—"} />
              <Kv k="وسيط الرحلة كاملة (شبكة + موديل)" v={medWall != null ? Math.round(medWall) + " مللي" : "—"} />
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                التأخير = الموديل + الشبكة + <b>الإجماع</b> (اللوحة بتستنى نافذة تانية تأكّدها قبل
                ما تتعرض 🟢). لو الرحلة أكبر من الموديل بكتير ⇒ الشبكة هي السبب، مش الموديل.
              </p>
            </Block>

            <Block title="الهلوسة والفقد">
              <Kv k="قراءات اتحجبت كاختراع (min_logprob &lt; -0.5)" v={String(blocked)} />
              <Kv k="قراءات السيرفر رفضها (accepted=false)" v={String(refused)} />
              <Kv k="لوحة سليمة الشكل اتسمعت وماظهرتش" v={String(heardNotShown.length)}
                tone={heardNotShown.length ? "bad" : undefined} />
              <Kv k="نص فيه أرقام والشكل مش لوحة (رقم/حرف ضاع)" v={String(malformed.length)}
                tone={malformed.length ? "bad" : undefined} />
              {heardNotShown.length > 0 && (
                <p dir="ltr" className="mt-1 font-mono text-[10px] text-rose-600">{heardNotShown.slice(0, 12).join(" · ")}</p>
              )}
            </Block>

            <Block title="نوافذ ماتبعتتش">
              {Object.keys(skips).length === 0
                ? <p className="text-[11px] text-emerald-600">✓ ولا نافذة اتخطّت</p>
                : Object.entries(skips).map(([reason, n]) => (
                  <Kv key={reason} k={(SKIP_LABEL[reason] ?? SKIP_LABEL[reason.split(":")[0]] ?? reason)
                    + (reason.includes(":") ? " — " + reason.split(":").slice(1).join(":") : "")} v={String(n)}
                    tone={reason.startsWith("request_failed") || reason === "slice_failed" ? "bad" : undefined} />
                ))}
            </Block>

            <Block title={"كل قراءة خام من الموديل (" + reads.length + ")"}>
              {reads.length === 0 ? <p className="text-[11px] text-slate-400">مافيش قراءات لسه.</p> : (
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {reads.map((r, i) => (
                    <li key={i} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-slate-400">{(r.tMs / 1000).toFixed(1)}ث</span>
                        <span dir="ltr" className={"font-mono font-bold " + (r.blocked ? "text-rose-600 line-through" : r.accepted ? "text-indigo-700" : "text-slate-400")}>
                          {r.plate || "—"}
                        </span>
                        {r.blocked && <span className="text-rose-600">اختراع</span>}
                        {!r.accepted && !r.blocked && <span className="text-slate-400">مرفوضة</span>}
                        <span className="mr-auto font-mono tabular-nums text-slate-400">
                          {Math.round(r.conf * 100)}% · {r.msModel ?? "?"}/{r.msWall}ms
                        </span>
                      </div>
                      {r.rawText && r.rawText !== r.plate && (
                        <div dir="rtl" className="mt-0.5 text-slate-500">سمع: «{r.rawText}»</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </div>
        )}
      </section>
    </div>
  );
}

/* ─── مكوّنات صغيرة ──────────────────────────────────────────────────── */

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={"whitespace-nowrap px-1.5 py-1.5 text-right font-bold " + className}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={"whitespace-nowrap px-1.5 py-2 text-right align-middle " + className}>{children}</td>;
}

function Stat({ icon, ok, title, sub }: { icon: React.ReactNode; ok: boolean; title: string; sub: string }) {
  return (
    <div className={"rounded-xl border bg-white p-2.5 " + (ok ? "border-emerald-200" : "border-slate-200")}>
      <div className="flex items-center gap-1.5">
        <span className={ok ? "text-emerald-600" : "text-slate-300"}>{icon}</span>
        <span className="truncate text-[11px] font-bold">{title}</span>
      </div>
      <p className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <h3 className="mb-1.5 text-[11px] font-black text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function Kv({ k, v, tone }: { k: string; v: string; tone?: "bad" }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-slate-100 py-0.5 last:border-0">
      <span className="text-[11px] text-slate-600">{k}</span>
      <span className={"mr-auto font-mono text-[11px] font-bold tabular-nums " + (tone === "bad" ? "text-rose-600" : "text-slate-900")}>{v}</span>
    </div>
  );
}

/**
 * 🎚️ مؤشّر أعمدة زي بتاع المعمل — المالك قال إنه «بيبيّن بطريقة كويسة».
 * عمود واحد بيوصل لقيمة واحدة؛ الأعمدة بتخلّي الفرق بين الهمس والكلام واضح.
 */
function VuMeter({ level, speaking }: { level: number; speaking: boolean }) {
  const bars = 16;
  const lit = Math.round(Math.min(1, Math.max(0, level)) * bars);
  return (
    <div className="flex h-8 items-end gap-[3px]" dir="ltr">
      {Array.from({ length: bars }, (_, i) => {
        const on = i < lit;
        const h = 25 + (i / bars) * 75;
        return (
          <span key={i}
            className={"w-[5px] rounded-sm transition-all duration-75 "
              + (on ? (i > bars * 0.8 ? "bg-rose-500" : i > bars * 0.55 ? "bg-amber-400" : "bg-emerald-500")
                    : speaking ? "bg-slate-200" : "bg-slate-100")}
            style={{ height: h + "%" }} />
        );
      })}
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

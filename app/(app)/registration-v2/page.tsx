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
 *   الفهرس `buildCombinedCheckIndex` · التنبيه `fireWantedAlert` (الحدث
 *   الموحّد — بيطلّع الـoverlay **ويبلّغ المجموعة**)
 *   الموقع `gpsService` · التصدير `saveFieldCheckEntry` (شيت السجلات)
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
  Pencil, Building2, Hash, Car,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getUploadedFile } from "@/lib/idb";
import { type ExcelTable } from "@/lib/excel";
import { buildCombinedCheckIndex, loadAllCheckSources } from "@/lib/checkSheets";
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "@/lib/plateParser";
import {
  pickTypeForPlate,
  pruneTypeQueue,
  nearestWindow,
  pruneWindows,
  type TypeWindow,
  type AudioWindow,
} from "@/lib/typeForPlate";
import { stopAlertSiren, ensureSirenAudioUnlocked } from "@/lib/alertSiren";
import { fireWantedAlert } from "@/lib/wantedAlert";
import { browserScreenWake } from "@/lib/screenWake";
import { toMapsLink, gpsService, gpsAccuracyLevel, type GpsCoords } from "@/lib/gps";
import { readJudgeEndpoint, saveJudgeEndpoint } from "@/lib/plateJudgeGate";
import {
  canOpenTrialPage, planTrialRun, resolveTrialEndpoint, TRIAL_TYPE_BASE, shouldAskType,
} from "@/lib/trialModelGate";
import { sameCarTwin, heardNotShown, isExactRepeatNearby } from "@/lib/trialTwin";
import { resolveCheckColumns } from "@/lib/wantedColumns";
import { detectChassisColumn } from "@/lib/chassis";
import {
  trialEntryId, carDetails, buildTrialFieldRow, exportableTrialRows, savedIds,
  stripForDraft, rehydrateMatch,
} from "@/lib/trialRecords";
import { saveFieldCheckEntry, type FieldCheckEntry } from "@/lib/idb";
import { loadDraft, saveDraft, unexportedDeleteWarning } from "@/lib/checkDrafts";
import CertificateBadge from "@/components/CertificateBadge";
import VehicleTypeSelect from "@/components/VehicleTypeSelect";
import { typeToCode } from "@/lib/vehicleType";
import { VEHICLE_CONDITION_KINDS, VEHICLE_PLACE_KINDS } from "@/lib/vehicleTypes";
import { showProvisional, confirmedWins, PROVISIONAL_TTL_MS } from "@/lib/provisionalRow";
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
  /** كام نافذة أكّدت اللوحة — بيحسم مين يفضل لما تتلمّ توأمين. */
  mult: number;
  /** 🟡 ظهرت من القراءة الأولى ولسه الإجماع مأكّدهاش. */
  provisional: boolean;
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

/* 🏷️ ثوابت نافذة النوع وقرارها في `lib/typeForPlate.ts` — مغطّاة باختبار. */

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
  const [reportCopied, setReportCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  /** كل ملفات التشييك (الأساسي + الإضافية) — مش الأساسي بس. */
  const [checkSources, setCheckSources] = useState<ExcelTable[]>([]);
  /** لوحة ← رقم الهيكل، من كل ورقات الملف (الشاص كتير في ورقة تانية). */
  const [plateChassis, setPlateChassis] = useState<Map<string, string>>(new Map());
  /** الخانة اللي المندوب بيعدّلها دلوقتي (النوع أو الملاحظة). */
  const [editing, setEditing] = useState<{ id: string; field: "type" | "note" | "plate" } | null>(null);
  const [checkName, setCheckName] = useState<string>("");
  const [gps, setGps] = useState<GpsCoords | null>(null);

  const [modelUrl, setModelUrl] = useState("");
  const [modelToken, setModelToken] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saved, setSaved] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; msg: string } | null>(null);
  const [typeProbe, setTypeProbe] = useState<{ ok: boolean; msg: string } | null>(null);
  /**
   * آخر نتيجة فحص لسيرفر النوع — **كمرجع** مش state.
   * `askType` بيتمسك في غلاف `startVoicexEngine` وقت التشغيل، فأي state
   * بيتقرا جوّاه بيفضل على قيمته وقت البداية. المرجع بيدّي القيمة الحيّة.
   */
  const typeProbeRef = useRef<{ ok: boolean; msg: string } | null>(null);

  const engineRef = useRef<VoicexEngineController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const gpsRef = useRef<GpsCoords | null>(null);
  /**
   * 🔴 **طابور نصوص كوهير الخام** — النوع بيتحسب **لكل لوحة على حدة**.
   *
   * ── العلّة اللي ده بيصلّحها ───────────────────────────────────────
   * بلاغ المالك (٢٢ سبتمبر ٢٠٢٦): «أقول `حبك1234` — يحطّ قدامها ونيت
   * وأنا مقولتهاش». السبب إن الصفحة كانت بتاخد النوع **بالتوقيت وحده**:
   * كوهير بيمسح النافذة (٥ث) **كلها** ويرجّع أي نوع فيها، والصفحة
   * بتلزّقه على أقرب لوحة خلال ١.٢ث. والنافذة بتبدأ ٢.٥ث قبل مركزها،
   * يعني أولها **ذيل اللوحة اللي قبلها** — فنوع الجارة بيترحّل.
   *
   * ── الحارس المقيس ──────────────────────────────────────────────
   * الحل مش توقيت أدقّ — الحل إن النوع يتقصّ **عند أرقام لوحتنا** في
   * نصّ كوهير، وناخد أول مطابقة **بعدها**. ده الحارس المقيس في المعمل
   * على ١١١ حالة بحقيقة مكتوبة بإيد المالك:
   *
   *     القصّ نجح : صح ٧٥ · غلط ٤  ⇒ ٩٤.٩٪
   *     القصّ فشل : صح  ٦ · غلط ٩  ⇒ ٤٠.٠٪   ← بترجع فاضية بالقصد
   *
   * فبنخزّن **النص الخام** بدل نوع محسوب، والقرار بيتاخد وقت التصريف
   * لما نبقى عارفين اللوحة. شوف `lib/vehicleTypeScan.ts`.
   *
   * ⇒ و`used` اتشالت: نافذة ٥ث ممكن تشيل **لوحتين**، وكل واحدة بتقصّ
   *   عند أرقامها هي. لو أول لوحة «استهلكت» النافذة كانت التانية تضيع.
   *   اللي بيمنع الكتابة فوق بعضها هو إن الصف اللي عنده نوع بيتخطّى.
   */
  const typeQueueRef = useRef<TypeWindow[]>([]);
  /**
   * 🎯 **مخزن آخر نوافذ الصوت** — بنسأل سيرفر النوع **لكل لوحة** مش لكل
   * نافذة.
   *
   * المندوب بيبعت نافذة كل ١.٥ث واللوحة بتتغطّى بـ٣-٤ نوافذ، فالسؤال عن
   * كل نافذة = **٣-٤ أضعاف** الشغل، وأغلبه على نوافذ مالهاش لوحة أصلاً.
   * وسيرفر النوع طاقته ~٤ متوازي (عند ١٠ مناديب كان بيرفض ٦٠٪).
   * ⇒ بنخزّن، وأول ما الإجماع يأكّد لوحة بنبعت **نافذة واحدة** أقربها ليها.
   */
  const winBufRef = useRef<AudioWindow<Blob>[]>([]);
  /** النوافذ اللي اتسألت خلاص — لوحتين في نافذة واحدة مايسألوش مرتين. */
  const askedWinRef = useRef<Set<number>>(new Set());

  /**
   * 🔴 كل ملفات التشييك، مش الأساسي بس. كانت `[checkTable]` — يعني سلوت
   * `local:check` لوحده، واللوحة اللي في ملف إضافي (`check-2`…) مكانتش
   * بتطلّع صفّارة خالص. صفحة التشييك بتقراهم من زمان.
   */
  const checkIndex = useMemo(
    () => buildCombinedCheckIndex(checkSources),
    [checkSources],
  );
  const checkIndexRef = useRef(checkIndex);
  useEffect(() => { checkIndexRef.current = checkIndex; }, [checkIndex]);
  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers, checkTable.rows) : null;
  /**
   * 🏷️ أعمدة نوع السيارة والشركة (البنك) — بتتحل بالاسم من رؤوس كل
   * الملفات. مش بـ`matchesPreferred` لأنها بتستبعد «رقم الهيكل» عن قصد
   * (موثّق في CLAUDE.md وعليه اختبارات) وتعديلها كان هيغيّر صفحة الفرز.
   */
  const checkCols = useMemo(
    () => resolveCheckColumns(checkSources.flatMap((t) => t.headers)),
    [checkSources],
  );

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

  /**
   * 🔒 **قفل الشاشة أثناء التسجيل.**
   *
   * 🔴 من غيره: مهلة الشاشة العادية بتطفيها والمندوب بيسجّل، و**أندرويد
   * بيعتبر إطفاء الشاشة إخفاءً للصفحة** فالمتصفّح بيوقف المايك —
   * والمندوب بيشوفها «التسجيل بيقف لوحده». صفحة التشييك عندها القفل ده
   * من زمان، ودي كانت من غيره.
   *
   * القفل اختياري: لو الويب-ڤيو مش داعم أو النظام رفض، التسجيل بيكمّل.
   */
  useEffect(() => {
    if (!listening) return;
    const wake = browserScreenWake();
    void wake.acquire();
    // النظام بيسحب القفل لما الصفحة تتخفي — نمسكه تاني لما المندوب يرجع.
    const onVis = () => { if (document.visibilityState === "visible") void wake.acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void wake.release();
    };
  }, [listening]);

  /* ─── 💾 مسودّة الجلسة ────────────────────────────────────────────── */
  /**
   * 🔴 **الصفوف كانت في الذاكرة بس** — جلسة ٢٣٥ لوحة بتضيع بالكامل لو
   * التطبيق اتقفل أو الموبايل عمل ريستارت. صفحة التشييك بتحفظ مسودّاتها من
   * زمان؛ دي كانت ناقصة الحماية دي.
   *
   * بنحفظ **بلا صف شيت التشييك** (`match`) عشان الحصّة — ونرجّعه من الفهرس.
   * شوف `stripForDraft` / `rehydrateMatch`.
   */
  const draftReady = useRef(false);
  useEffect(() => {
    if (allowed !== true) return;
    void loadDraft<LiveRow>("trial", "rv2-rows")
      .then((saved) => { if (saved.length) setRows(saved); })
      .catch(() => { /* مافيش مسودّة */ })
      .finally(() => { draftReady.current = true; });
  }, [allowed]);
  useEffect(() => {
    // ⚠️ مانكتبش قبل ما نقرا — وإلا أول رسم (صفوف فاضية) بيمسح المسودّة.
    if (!draftReady.current) return;
    void saveDraft("trial", "rv2-rows", stripForDraft(rows));
  }, [rows]);
  /** أول ما شيت التشييك يجهز، الصفوف المحمّلة تاخد «مطلوبة» بتاعتها. */
  useEffect(() => {
    if (!draftReady.current || checkIndex.size === 0) return;
    setRows((prev) => (prev.some((r) => !r.match)
      ? rehydrateMatch(prev, checkIndex, (pl) => normalizePlate(bankPlateToArabic(pl)))
      : prev));
  }, [checkIndex]);

  /* ─── الشيت ───────────────────────────────────────────────────────── */
  const loadCheck = useCallback(() => {
    void (async () => {
      try {
        const rec = await getUploadedFile("local", "check").catch(() => null);
        if (!rec) { setCheckTable(null); setCheckSources([]); setCheckName(""); return; }
        setCheckTable({ headers: rec.headers, rows: rec.rows });
        setCheckName(rec.fileName || "ملف التشييك");

        const all = await loadAllCheckSources().catch(() => [] as ExcelTable[]);
        const sources = all.length ? all : [{ headers: rec.headers, rows: rec.rows }];
        setCheckSources(sources);

        /**
         * 🔧 لوحة ← رقم الهيكل من **كل ورقات** الملف.
         *
         * `parseExcelFile` بيقرا ورقة واحدة (بيفضّل «تشييك»)، وعمود الهيكل
         * كتير بيكون في ورقة تانية — فالاعتماد على صف التشييك لوحده بيسيب
         * الشاص فاضي. بنعمل زي مود «شاص» في صفحة التشييك: نقرا الـblob كله.
         * فشل القراءة مابيوقّفش حاجة — الشاص بس بيفضل فاضي.
         */
        const map = new Map<string, string>();
        const addSheet = (headers: string[], rows: Record<string, string>[]) => {
          const pCol = detectPlateColumn(headers, rows);
          const cCol = detectChassisColumn(headers, rows);
          if (!pCol || !cCol) return;
          for (const row of rows) {
            const key = normalizePlate(bankPlateToArabic(String(row[pCol] ?? "")));
            const vin = String(row[cCol] ?? "").trim();
            if (key && vin && !map.has(key)) map.set(key, vin);
          }
        };
        for (const t of sources) addSheet(t.headers, t.rows);
        if (rec.fileBlob) {
          try {
            const { readAllSheets } = await import("@/lib/excel");
            const f = new File([rec.fileBlob], rec.fileName || "check.xlsx");
            for (const sh of await readAllSheets(f)) addSheet(sh.headers, sh.rows);
          } catch { /* blob مش مقروء — نكتفي بالورقة المحمّلة */ }
        }
        setPlateChassis(map);
      } catch { /* مفيش شيت */ }
    })();
  }, []);
  useEffect(() => { if (allowed === true) loadCheck(); }, [allowed, loadCheck]);

  /* ─── فحص السيرفرين ──────────────────────────────────────────────── */
  const probeModel = useCallback(async () => {
    const b = modelUrl.trim().replace(/\/+$/, "");
    const t = modelToken.trim();
    if (!b || !t) { setProbe({ ok: false, msg: "مافيش عنوان أو توكن." }); return; }
    setProbing(true); setProbe(null); setTypeProbe(null); typeProbeRef.current = null;
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
      if (!r2.ok) { const v = { ok: false, msg: "كود " + r2.status }; setTypeProbe(v); typeProbeRef.current = v; }
      else {
        const b2 = await r2.json() as { types?: number };
        const v = { ok: true, msg: (b2.types ?? 0) + " عنصر" };
        setTypeProbe(v); typeProbeRef.current = v;
      }
    } catch { const v = { ok: false, msg: "مافيش رد" }; setTypeProbe(v); typeProbeRef.current = v; }
  }, [modelUrl, modelToken]);

  useEffect(() => {
    if (allowed !== true || !modelUrl || !modelToken) return;
    void probeModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  /**
   * 🧹 **المبدئي اللي ماحدش أكّده بيتشال.**
   *
   * القراءة عالية الثقة ممكن تكون اختراع برضه (وسيط ثقة الاختراع ٠.٩٩ زي
   * الصح — مقيس). الإجماع هو اللي بيفرّق، فاللي ماوصلوش تأكيد خلال المهلة
   * **مايفضلش معروض**. من غير الكنس ده الظهور الفوري بيتحوّل لعرض اختراع.
   */
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => {
      const cut = Date.now() - PROVISIONAL_TTL_MS;
      setRows((prev) => prev.some((r) => r.provisional && r.shownAt < cut)
        ? prev.filter((r) => !(r.provisional && r.shownAt < cut))
        : prev);
    }, 2000);
    return () => clearInterval(id);
  }, [listening]);

  /**
   * 🏷️ يسأل كوهير عن **نصّ** النافذة. فشله بيتبلع بالقصد.
   *
   * ⚠️ بناخد `text` **مش** `type`/`note` اللي السيرفر حسبهم: السيرفر
   * بيمسح النافذة كلها بلا ما يعرف لوحتنا، والقصّ عند أرقامها هو اللي
   * بيمنع نوع الجارة. شوف تعليق `typeQueueRef`.
   */
  const askType = useCallback(async (wav: Blob, tMs: number) => {
    /**
     * 🔴 **سيرفر النوع مقفول ⇒ ماننداهوش.** النداء بيرفع **الصوت كامل**
     * (~١٦٠ كيلو للنافذة) قبل ما ياخد 502، يعني ~٦ ميجا/دقيقة من داتا
     * موبايل المندوب على الفاضي. الفحص متعمل أصلاً عند فتح الصفحة.
     */
    if (!shouldAskType(typeProbeRef.current)) return;
    try {
      const res = await fetch(TRIAL_TYPE_BASE.replace(/\/+$/, "") + "/type", {
        method: "POST",
        headers: { "Content-Type": "audio/wav", "Authorization": "Bearer " + modelToken.trim() },
        body: wav,
      });
      if (!res.ok) return;
      const j = await res.json() as { ok?: boolean; text?: string | null };
      if (!j?.ok) return;
      const text = String(j.text ?? "").trim();
      if (!text) return;
      /**
       * 🔴 **مافيش إلغاء تكرار بالنص هنا بعد دلوقتي.**
       *
       * كان فيه مفتاح «نفس النص خلال ٦ث = نفس النطق» عشان يمنع الكلمة
       * تتعدّ مرتين من نافذتين متداخلتين وتلحق اللوحة **اللي بعدها**.
       * القصّ عند أرقام اللوحة بيمنع ده **بنيوياً** (النافذة التانية
       * بتقصّ عند نفس الأرقام فبتدّي نفس النتيجة لنفس الصف، والصف اللي
       * عنده نوع بيتخطّى) — والمفتاح بقى بيأذي: مندوبين بيقولوا «ونيت»
       * لعربيتين ورا بعض، والتانية كانت بتتلغى.
       */
      typeQueueRef.current = pruneTypeQueue([...typeQueueRef.current, { text, tMs }], tMs);
      /**
       * لوحة ظهرت خلاص ولسه بلا نوع؟ تاخده بأثر رجعي (كوهير أبطأ من
       * الموديل). كل صف بيقصّ النص عند **أرقامه هو** — فصفّين في نفس
       * النافذة كل واحد بياخد نوعه.
       */
      setRows((prev) => {
        let touched = false;
        const one = [{ text, tMs }];
        const next = prev.map((r) => {
          if (r.type || r.note) return r;
          // نفس القرار المغطّى باختبار — بنافذة واحدة (اللي لسه وصلت).
          const sc = pickTypeForPlate(one, r.plate, r.atMs);
          if (!sc) return r;
          touched = true;
          return { ...r, type: sc.type, note: sc.note };
        });
        return touched ? next : prev;
      });
    } catch { /* النوع إضافة — مايوقّفش اللوحات */ }
  }, [modelToken]);

  /* ─── التسجيل ─────────────────────────────────────────────────────── */
  async function start() {
    setError(null); setSkips({}); setReads([]);
    typeQueueRef.current = []; winBufRef.current = []; askedWinRef.current = new Set();
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
        // 🔒 الإصلاحات الجديدة مفتوحة **هنا بس** — بطلب المالك «خليها في
        // صفحة الموديل الجديد فقط لحد ما أجرّب». صفحة التشييك على السلوك
        // القديم بالحرف لحد ما يتأكّد على جهاز حقيقي.
        fixes: true,
        onPlate: (plate: string, meta: VoicexPlateMeta) => {
          const key = normalizePlate(bankPlateToArabic(plate));
          const hit = checkIndexRef.current.get(key) ?? null;
          const g = gpsRef.current;
          /**
           * 🏷️ النوع من **أقرب نافذة أرقام اللوحة دي فيها**.
           *
           * مش أقرب نافذة وخلاص: بنقصّ نصّ كل نافذة قريبة عند أرقام
           * `plate` وناخد أول واحدة بتدّي نتيجة. لو أرقامنا مش في نصّ
           * أي نافذة ⇒ **الخانة تفضل فاضية** — الفاضية بتبان وتتملّى،
           * والغلط بيتكتب في داتا المالك في صمت.
           */
          /**
           * 🎯 اسأل سيرفر النوع عن **نافذة واحدة** أقربها لزمن اللوحة —
           * ومرة واحدة لكل نافذة حتى لو فيها لوحتين (القصّ عند الأرقام
           * بيدّي كل لوحة نوعها من نفس النص).
           */
          const w = nearestWindow(winBufRef.current, meta.tMs);
          if (w && !askedWinRef.current.has(w.tMs)) {
            askedWinRef.current.add(w.tMs);
            void askType(w.wav, w.tMs);
          }
          const ty = pickTypeForPlate(typeQueueRef.current, plate, meta.tMs);
          const now = Date.now();
          const fresh: LiveRow = {
            id: plate + "-" + meta.tMs, plate, tier: meta.tier, conf: meta.conf,
            mult: meta.mult, provisional: false,
            atMs: meta.tMs, shownAt: now,
            latencyMs: Math.max(0, now - startedAtRef.current - meta.tMs),
            match: hit, type: ty?.type ?? null, note: ty?.note ?? null,
            lat: g?.lat ?? null, lng: g?.lng ?? null, gpsAccuracy: g?.accuracy ?? null,
          };
          setRows((prev) => {
            /**
             * 🔴 **لمّ التوائم على مستوى الصف.** الإجماع بيشتغل بنافذة ٢ث،
             * والقراءات المختلفة لنفس اللوحة ممكن تمتد ٩ ثواني (`دطس2177`
             * طلعت ٤ صفوف في تقرير المالك). القاعدة والحد في `trialTwin.ts`.
             *
             * مين يفضل؟ **الأكتر تأكيداً** (عدد النوافذ)، وبعدين الأعلى ثقة،
             * وبعدين **الأحدث** (القراءة الأخيرة شافت النطق كامل).
             */
            /**
             * 🔴 **نفس اللوحة بالحرف تتلمّ بس لو هي آخر صف.**
             * لو بينهم لوحات تانية فدي **إعادة مقصودة** (المالك قال
             * `دمس5284` مرتين بينهم ٤ لوحات). شوف `isExactRepeatOfLatest`.
             */
            /**
             * 🔴 **نفس اللوحة تتلمّ لو قريبة في الصفوف *و* في الوقت.**
             * النطقة الواحدة صفوفها متلاصقة وثوانيها قليلة — حتى لو
             * المندوب بيقول لوحتين بالتبادل. والإعادة المقصودة بينها
             * لوحات وثواني أكتر. شوف `isExactRepeatNearby`.
             */
            const nearby = isExactRepeatNearby(fresh.plate, prev.map((r) => r.plate));
            const twin = prev.find((r) => (r.plate === fresh.plate
              ? nearby && sameCarTwin(r, fresh, 12000)
              : sameCarTwin(r, fresh, 12000)));
            if (!twin) return [fresh, ...prev];
            // المؤكّد بيغلب المبدئي دايماً — القاعدة في `provisionalRow.ts`.
            if (!confirmedWins(fresh, twin)) return prev;
            /**
             * 🕐 **زمن الظهور = أول مرة المندوب شافها**، مش وقت التأكيد.
             *
             * كان الصف المؤكّد بيكتب زمنه هو، فالتقرير كان بيقول ٦ث بينما
             * اللوحة كانت بانت مبدئية في ~٣ث. الرقم ده بيتقاس عليه قرار
             * السرعة، فلازم يكون **اللي المندوب عاشه** مش اللي النظام عمله.
             */
            const merged: LiveRow = {
              ...fresh,
              shownAt: Math.min(fresh.shownAt, twin.shownAt),
              latencyMs: Math.min(fresh.latencyMs, twin.latencyMs),
              type: fresh.type ?? twin.type,
              note: fresh.note ?? twin.note,
              match: fresh.match ?? twin.match,
            };
            return [merged, ...prev.filter((r) => r.id !== twin.id)];
          });
          if (hit) alertWanted(plate, hit);
        },
        onRead: (r) => {
          setReads((prev) => [{ ...r, t: Date.now() }, ...prev].slice(0, 400));
          /**
           * ⚡ **الظهور الفوري.** القراءة عالية الثقة بتطلع صف 🟡 «مبدئية» على
           * طول (~٣ث)، والإجماع لما ييجي (~٧ث) يأكّدها 🟢 أو يصحّحها — لمّ
           * التوائم بيدمجهم. البوابة والمهلة في `provisionalRow.ts`.
           */
          if (!showProvisional(r)) return;
          const g2 = gpsRef.current;
          const now2 = Date.now();
          for (const raw of String(r.plate || "").trim().split(/\s+/)) {
            const p2 = raw.replace(/\s+/g, "");
            if (!WELL.test(p2)) continue;
            const prov: LiveRow = {
              id: "prov-" + p2 + "-" + r.tMs, plate: p2, tier: "yellow", conf: r.conf,
              mult: 1, provisional: true, atMs: r.tMs, shownAt: now2,
              latencyMs: Math.max(0, now2 - startedAtRef.current - r.tMs),
              match: checkIndexRef.current.get(normalizePlate(bankPlateToArabic(p2))) ?? null,
              type: null, note: null,
              lat: g2?.lat ?? null, lng: g2?.lng ?? null, gpsAccuracy: g2?.accuracy ?? null,
            };
            setRows((prev) => {
              const nearbyP = isExactRepeatNearby(prov.plate, prev.map((x) => x.plate));
              const twin = prev.find((x) => (x.plate === prov.plate
                ? nearbyP && sameCarTwin(x, prov, 12000)
                : sameCarTwin(x, prov, 12000)));
              if (!twin) return [prov, ...prev];
              if (!confirmedWins(prov, twin)) return prev;
              return [{ ...prov, shownAt: Math.min(prov.shownAt, twin.shownAt),
                latencyMs: Math.min(prov.latencyMs, twin.latencyMs),
                type: twin.type, note: twin.note, match: prov.match ?? twin.match },
                ...prev.filter((x) => x.id !== twin.id)];
            });
            // 🔔 المطلوب بيصفّر فوراً — الانتظار ٧ث على عربية مطلوبة غالي.
            if (prov.match) alertWanted(p2, prov.match);
          }
        },
        // 🎯 نخزّن بس — السؤال بيحصل لما لوحة تتأكّد (شوف `winBufRef`).
        onAudioWindow: (wav, tMs) => {
          winBufRef.current = pruneWindows([...winBufRef.current, { tMs, wav }], tMs);
        },
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

  /**
   * ✏️ حفظ تعديل المندوب على النوع/الملاحظة.
   * القيمة الفاضية بترجّع الخانة `null` (مش نص فاضي) عشان تفضل «فاضية»
   * بنفس معنى اللي الصوت مجابهاش.
   */
  /**
   * ✏️ تصحيح اللوحة بإيد المندوب.
   *
   * 🔴 بنعيد حساب **المطابقة مع شيت التشييك** على القيمة الجديدة — من غير
   * كده اللوحة المصحّحة تفضل «مش مطلوبة» غلط، وهي أصلاً اتصحّحت عشان
   * الموديل غلط فيها. والصفّارة بتشتغل لو طلعت مطلوبة.
   */
  const savePlate = useCallback((id: string, value: string) => {
    const p = value.replace(/\s+/g, "").trim();
    if (!p) return;
    const hit = checkIndexRef.current.get(normalizePlate(bankPlateToArabic(p))) ?? null;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, plate: p, match: hit } : r)));
    if (hit) alertWanted(p, hit);
  }, []);

  /**
   * 🚨 **تنبيه اللوحة المطلوبة — بالحدث الموحّد مش بالصفّارة المباشرة.**
   *
   * 🔴 الصفحة كانت بتنادي `startAlertSiren()` على طول. ده بيدّي صوت
   * عند المندوب **وبس** — و`GroupFindNotifier` بيسمع لحدث
   * `fireWantedAlert` عشان يكتب في `group_finds` ويبعت **إشعار لكل
   * الفريق**. يعني العربية المطلوبة كانت بتتلاقى والمجموعة **عمرها ما
   * بتتبلّغ**. (متحقَّق: `components/GroupFindNotifier.tsx:88`.)
   *
   * والحدث كمان بيطلّع الـoverlay الموحّد بزرّ «تم» — نفس اللي المندوب
   * شايفه في التشييك بالظبط، فمابيتلغبطش.
   */
  const alertWanted = useCallback((plate: string, row: Record<string, string> | null) => {
    try {
      fireWantedAlert({
        plate,
        matchType: "exact",
        source: "voice",
        info: row
          ? Object.entries(row)
              .filter(([, v]) => String(v ?? "").trim())
              .map(([k, v]) => [k, String(v)] as [string, string])
          : [],
      });
      setSirenOn(true);
    } catch { /* التنبيه إضافة — مايوقّفش التسجيل */ }
  }, []);

  const saveCell = useCallback((id: string, field: "type" | "note", value: string) => {
    const v = value.trim() || null;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
  }, []);

  /* ─── 📤 التصدير — نفس أسلوب التشييك ─────────────────────────────── */
  /**
   * ══════════════════════════════════════════════════════════════════
   *  📤 التصدير → **شيت السجلات** (مش ملف إكسل)
   * ══════════════════════════════════════════════════════════════════
   *
   * طلب المالك: «لما يدوس تصدير اللوحات تتصدّر لصفحة السجلات، وبعد ما
   * تتسجّل يطلع رسالة للمندوب إنه تم التصدير واللي اتصدّر، وتتأكد إنه
   * اتصدّر يتمسح خلاص من صفحة التسجيل — زي اللي في صفحة التشييك».
   *
   * نفس حراس صفحة التشييك بالحرف:
   *   · معرّف **ثابت** مشتق من الصف ⇒ مية ضغطة = سجل واحد
   *   · `Promise.allSettled` ⇒ **اللي اتكتب بس** هو اللي يتمسح
   *   · «مفيش تصدير بلا موقع» ⇒ اللي لسه ماخدش GPS يفضل مكانه
   *
   * ⚠️ الكتابة IndexedDB أولاً (ده «اتصدّر»)، والرفع لـSupabase بيحصل
   *    بعدين عبر `pushPendingFieldChecks` — بننده عليها هنا كمان عشان
   *    توصل السيرفر بدل ما تستنى فتح صفحة التشييك.
   */
  async function exportRows() {
    if (!rows.length) return;
    const ready = exportableTrialRows(rows);
    const waiting = rows.length - ready.length;
    if (!ready.length) {
      setError("مفيش لوحة معاها موقع لسه — التصدير بيستنى الموقع (" + waiting + " مستنية).");
      return;
    }
    setBusy("ببعت للسجلات…");
    try {
      // 🪪 وسم السجل باسم المندوب — نفس اللي بتستعمله صفحة التشييك
      const uid = await supabase.auth.getUser()
        .then((r) => r.data.user?.id ?? undefined).catch(() => undefined);
      const agentId = uid;
      const entries: FieldCheckEntry[] = ready.map((r) => {
        const vin = plateChassis.get(normalizePlate(bankPlateToArabic(r.plate)));
        const d = carDetails(r.match, checkCols, vin);
        return {
          id: trialEntryId(r.id),
          agentId,
          plate: r.plate,
          /**
           * 🔴 النوع بيتصدّر **بالحرف المختصر** زي صفحة التشييك بالحرف
           * (`typeToCode(...) || الأصل`) — عشان السجلات تبقى شكل واحد،
           * سواء المندوب اختاره من المنسدلة أو الصوت قاله كلمة كاملة.
           */
          row: buildTrialFieldRow(
            { ...r, type: r.type ? (typeToCode(r.type) || r.type) : null }, d),
          method: "تجربة الموديل الجديد",
          lat: r.lat ?? undefined,
          lng: r.lng ?? undefined,
          mapsLink: r.lat != null && r.lng != null ? toMapsLink(r.lat, r.lng) : undefined,
          checkedAt: new Date(r.shownAt).toISOString(),
        };
      });
      const settled = await Promise.allSettled(entries.map((e) => saveFieldCheckEntry(e)));
      const okIds = savedIds(entries.map((e) => e.id), settled);
      if (!okIds.length) { setError("مانفعش يتحفظ ولا سجل — جرّب تاني."); return; }

      // 🧹 اللي اتكتب بس يتشال — الباقي يفضل قدام المندوب
      const savedRowIds = new Set(ready.filter((r) => okIds.includes(trialEntryId(r.id))).map((r) => r.id));
      setRows((prev) => prev.filter((r) => !savedRowIds.has(r.id)));

      // ☁️ نحاول نوصّلها السيرفر فوراً — فشلها مايأثرش، هتتزامن بعدين
      try {
        if (uid) {
          const { pushPendingFieldChecks } = await import("@/lib/syncFieldCheck");
          await pushPendingFieldChecks(uid);
        }
      } catch { /* المزامنة بتتم بعدين */ }

      const failed = entries.length - okIds.length;
      alert(
        "✅ تم التصدير للسجلات: " + okIds.length + " لوحة."
        + (waiting ? "\n⏳ " + waiting + " مستنية الموقع (ماتصدّرتش)." : "")
        + (failed ? "\n⚠️ " + failed + " مانفعتش تتحفظ وفضلت مكانها." : "")
      );
    } catch {
      setError("تعذّر التصدير — جرّب تاني.");
    } finally { setBusy(null); }
  }

  /**
   * 📋 **التقرير كامل كنص** — المالك بينسخه ويبعته عشان نشوف الغلط سوا
   * (نفس أسلوب المعمل). بيتكتب **كل حاجة**: الإعدادات، الحصيلة، الأزمنة،
   * الهلوسة، النوافذ اللي ماتبعتتش، جدول اللوحات، وكل قراءة خام بنصّها.
   *
   * ⚠️ بلا اختصار ولا «…» — التقرير المقصوص بيخفي بالظبط الحاجة اللي
   * بندوّر عليها.
   */
  function buildReportText(): string {
    const L: string[] = [];
    const t = (ms: number) => (ms / 1000).toFixed(1) + "ث";
    L.push("════════ تقرير تجربة الموديل الجديد ════════");
    L.push("التاريخ: " + new Date().toLocaleString("ar-EG"));
    L.push("مدة التسجيل: " + mmss);
    L.push("");
    L.push("── الإعداد ──");
    L.push("سيرفر اللوحات: " + modelUrl + "  [" + (probe?.ok ? "متصل ✓ " + probe.msg : probe ? "مش واصل ✗ " + probe.msg : "لم يُفحص") + "]");
    L.push("سيرفر النوع  : " + TRIAL_TYPE_BASE + "  [" + (typeProbe?.ok ? "متصل ✓ " + typeProbe.msg : typeProbe ? "مش واصل ✗ " + typeProbe.msg : "لم يُفحص") + "]");
    L.push("شيت التشييك  : " + (checkIndex.size ? checkName + " · " + checkIndex.size + " لوحة · عمود «" + (checkPlateCol ?? "؟") + "»" : "مافيش"));
    L.push("الموقع       : " + (gps ? gps.lat.toFixed(6) + "," + gps.lng.toFixed(6) + " ±" + Math.round(gps.accuracy) + "م" : "مافيش"));
    L.push("");
    L.push("── الحصيلة ──");
    L.push("لوحات ظهرت: " + rows.length + " (منها مبدئية لسه: " + rows.filter((r) => r.provisional).length + ") · مطلوبة: " + hits + " · معاها نوع/ملاحظة: " + withType + " · معاها موقع: " + withGps);
    L.push("وسيط التأخير من النطق للظهور: " + (medLatency != null ? t(medLatency) : "—"));
    L.push("وسيط زمن الموديل: " + (medModel != null ? Math.round(medModel) + "ms" : "—")
      + " · وسيط الرحلة كاملة: " + (medWall != null ? Math.round(medWall) + "ms" : "—"));
    L.push("");
    L.push("── الهلوسة والفقد ──");
    L.push("اتحجبت كاختراع: " + blocked + " · السيرفر رفضها: " + refused);
    L.push("لوحة اتسمعت وماظهرتش: " + missed.length + (missed.length ? "  [" + missed.join(" ") + "]" : ""));
    L.push("نص فيه أرقام والشكل مش لوحة: " + malformed.length);
    for (const m of malformed) L.push("   • «" + m.rawText + "» → «" + m.plate + "»");
    L.push("");
    L.push("── نوافذ ماتبعتتش ──");
    if (!Object.keys(skips).length) L.push("ولا نافذة اتخطّت ✓");
    for (const [r, n] of Object.entries(skips)) L.push(n + " × " + (SKIP_LABEL[r] ?? SKIP_LABEL[r.split(":")[0]] ?? r) + (r.includes(":") ? " [" + r.split(":").slice(1).join(":") + "]" : ""));
    L.push("");
    L.push("── اللوحات (" + rows.length + ") ──");
    L.push("#\tاللوحة\tالنوع\tالملاحظة\tمطلوبة\tالوقت\tالثقة\tالحالة\tظهرت بعد\tالموقع");
    rows.slice().reverse().forEach((r, i) => {
      L.push([
        i + 1, r.plate, r.type ?? "-", r.note ?? "-", r.match ? "مطلوبة" : "-",
        new Date(r.shownAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        Math.round(r.conf * 100) + "%", r.mult + " نافذة",
        r.provisional ? "مبدئية-لم-تتأكد" : r.tier === "green" ? "مؤكّدة" : "محتاجة-نظرة",
        t(r.latencyMs), r.lat != null ? r.lat.toFixed(5) + "," + r.lng!.toFixed(5) : "-",
      ].join("\t"));
    });
    L.push("");
    L.push("── كل قراءة خام من الموديل (" + reads.length + ") ──");
    L.push("زمن\tاللوحة\tالحالة\tالثقة\tمودل/رحلة\tالنص الخام");
    reads.slice().reverse().forEach((r) => {
      L.push([
        (r.tMs / 1000).toFixed(1), r.plate || "-",
        r.blocked ? "اختراع-محجوب" : r.accepted ? "مقبولة" : "مرفوضة",
        /**
         * 🔬 **بخانتين عشريتين عن قصد.** تقرير المالك (٢٢ سبتمبر) طلّع
         * `دعع1670` و`دعع1676` الاتنين «١٠٠٪» — ومكانش فيه طريقة نعرف بيها
         * لو الثقتين متعادلتين فعلاً ولا الفرق اتقرّب. والتعادل بقى بيتحسم
         * باللي كسب نوافذ أكتر، فلازم يبان.
         */
        (r.conf * 100).toFixed(2) + "%",
        (r.msModel ?? "?") + "/" + r.msWall + "ms",
        r.rawText || "-",
      ].join("\t"));
    });
    L.push("");
    L.push("════════ آخر التقرير ════════");
    return L.join("\n");
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
  /**
   * قراءات فيها لوحة سليمة الشكل ومع ذلك ماظهرتش — «فين راحت؟»
   *
   * 🔴 بيستبعد **توائم** اللوحات المعروضة: القراءة المسخّمة بخانة واحدة
   * لـلوحة ظهرت فعلاً مش ضياع. شوف `heardNotShown` في `lib/trialTwin.ts`.
   */
  const missed = heardNotShown(reads, rows);
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
                {rows.flatMap((r, i) => [
                  <tr key={r.id}
                    className={"border-b border-slate-100 "
                      + (r.match ? "bg-rose-50 " : "")
                      /**
                       * 🔴 كان `opacity-60` — والمالك قال «بتظهر مطفية
                       * وبتقعد فترة طويلة». اللوحة **موجودة وصحيحة**
                       * وقتها، بس شكلها كان بيقول العكس فبيستنى الغامق.
                       * بقت واضحة بخلفية صفرا خفيفة تقول «بتتأكّد» —
                       * بيبان فوراً وبرضه متميّز عن المؤكّد.
                       */
                      + (r.provisional ? "bg-amber-50/70" : "")}>
                    <Td className="text-slate-400">{rows.length - i}</Td>
                    <Td>
                      {/* ✏️ اللوحة نفسها قابلة للتعديل — لو الموديل غلط المندوب يصحّحها.
                          طلب المالك ٢٣ سبتمبر: «قلم عند اللوحة علشان لو غلط المندوب يعدلها بإيده». */}
                      {editing?.id === r.id && editing.field === "plate" ? (
                        <input autoFocus defaultValue={r.plate} dir="ltr"
                          onBlur={(e) => { savePlate(r.id, e.currentTarget.value); setEditing(null); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { savePlate(r.id, e.currentTarget.value); setEditing(null); }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="w-28 rounded-md border border-indigo-400 bg-white px-1 py-0.5 text-center font-mono text-sm font-black tracking-wider outline-none" />
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: r.id, field: "plate" })}
                          className="group flex items-center gap-1">
                          <span dir="ltr" className={"font-mono text-base font-black tracking-[0.15em] tabular-nums "
                            + (r.match ? "text-rose-700" : r.provisional ? "text-amber-700" : "text-indigo-700")}>{r.plate}</span>
                          <Pencil size={9} className="shrink-0 text-slate-300 group-hover:text-indigo-600" />
                        </button>
                      )}
                    </Td>
                    {/* 🏷️ النوع: نفس منسدلة صفحة التشييك بالحرف (`VehicleTypeSelect`) */}
                    <td className="px-1 py-1.5 align-top">
                      <VehicleTypeSelect value={r.type ?? ""}
                        onChange={(code) => saveCell(r.id, "type", code)}
                        className={"w-full rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[11px] outline-none "
                          + (r.type ? "font-bold text-slate-900" : "text-slate-400")} />
                    </td>
                    <td className="px-1 py-1.5 align-top">
                      <NoteSelect value={r.note ?? ""} onChange={(v) => saveCell(r.id, "note", v)} />
                    </td>
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
                    <Td className={r.provisional ? "text-amber-600" : r.tier === "green" ? "text-emerald-600" : "text-amber-500"}>
                      {r.provisional
                        ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> مبدئية</span>
                        : r.tier === "green" ? "مؤكّدة" : "محتاجة نظرة"}
                    </Td>
                    <Td className="font-mono tabular-nums text-slate-400">{(r.latencyMs / 1000).toFixed(1)}ث</Td>
                  </tr>,
                  /* 🚨 تفاصيل المطلوبة تحت الصف — نوع/شركة/شاص/شهادة */
                  r.match ? (
                    <tr key={r.id + "-d"} className="border-b border-rose-100 bg-rose-50">
                      <td colSpan={10} className="px-2 pb-2">
                        <MatchDetails row={r} cols={checkCols}
                          vin={plateChassis.get(normalizePlate(bankPlateToArabic(r.plate)))} />
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        )}

        {/* 🧹📤 مسح وتصدير — زي التشييك */}
        {rows.length > 0 && (
          <div className="mt-3 flex gap-1.5">
            <button onClick={() => void exportRows()} disabled={!!busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50">
              {busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</> : <><Download size={14} /> تصدير للسجلات</>}
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
            <button onClick={() => {
              // 🔴 نفس تحذير التشييك: اللي مش متصدّر بيضيع — لازم يتقال بالعدد.
              const warn = unexportedDeleteWarning(rows.length);
              if (warn && !confirm(warn)) return;
              if (!warn && !confirm("تمسح كل اللوحات؟")) return;
              setRows([]); setReads([]); setSkips({});
            }}
              className="flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2.5 text-xs font-bold text-rose-600">
              <Trash2 size={13} /> مسح
            </button>
          </div>
        )}
      </section>

      {/* ══ 📋 التقرير الشامل — مؤقّت ══ */}
      <section className="mt-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowReport((v) => !v)} className="flex flex-1 items-center gap-2">
            <h2 className="text-sm font-black">📋 التقرير الشامل</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">مؤقّت</span>
            <span className="mr-auto text-slate-400">{showReport ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
        </div>
        {/* 📋 نسخ التقرير كامل — المالك بيبعته وإحنا نشوف الغلط سوا (أسلوب المعمل) */}
        <button
          onClick={() => {
            try {
              void navigator.clipboard.writeText(buildReportText());
              setReportCopied(true);
              setTimeout(() => setReportCopied(false), 2000);
            } catch { setError("المتصفّح رفض النسخ — افتح التقرير وانسخه بإيدك."); }
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-black text-white">
          {reportCopied
            ? <><Check size={15} className="text-emerald-400" /> اتنسخ — ابعته كده زي ما هو</>
            : <><Copy size={15} /> انسخ التقرير كامل</>}
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
              <Kv k="لوحة سليمة الشكل اتسمعت وماظهرتش" v={String(missed.length)}
                tone={missed.length ? "bad" : undefined} />
              <Kv k="نص فيه أرقام والشكل مش لوحة (رقم/حرف ضاع)" v={String(malformed.length)}
                tone={malformed.length ? "bad" : undefined} />
              {missed.length > 0 && (
                <p dir="ltr" className="mt-1 font-mono text-[10px] text-rose-600">{missed.slice(0, 12).join(" · ")}</p>
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

/**
 * 🚨 تفاصيل اللوحة **المطلوبة** — نوع السيارة وتبع أي شركة ورقم الشاص
 * والشهادة. بتتعرض تحت الصف مش كأعمدة زيادة عشان الجدول يفضل مقروء على
 * الموبايل. بتظهر للمطابقة التامة بس (طلب المالك).
 */
/**
 * 📝 **ملاحظة المندوب — منسدلة بنفس خيارات صفحة التشييك + كتابة حرّة.**
 *
 * طلب المالك (٢٣ سبتمبر ٢٠٢٦): «لو قال النوع أو الملاحظة بالصوت ومطلعتش
 * قدامه يقدر يختارها يدوي». الخيارات هي **نفس** اللي الصوت بيدوّر عليها
 * (`VEHICLE_CONDITION_KINDS` + `VEHICLE_PLACE_KINDS`) — فاللي بيتكتب
 * بالإيد يبقى نفس اللي بيتكتب بالصوت بالحرف.
 *
 * و«أخرى…» بتحوّل الخانة لكتابة حرّة. ولو الصوت جاب قيمة مش في القايمة
 * بتتعرض في المنسدلة زي ما هي — **مابتتشالش**.
 */
function NoteSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [free, setFree] = useState(false);
  const opts = useMemo(() => {
    const all = [...VEHICLE_CONDITION_KINDS, ...VEHICLE_PLACE_KINDS] as readonly string[];
    return value && !all.includes(value) ? [value, ...all] : all;
  }, [value]);
  if (free) {
    return (
      <input autoFocus defaultValue={value}
        onBlur={(e) => { onChange(e.currentTarget.value); setFree(false); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { onChange(e.currentTarget.value); setFree(false); }
          if (e.key === "Escape") setFree(false);
        }}
        className="w-full rounded-md border border-indigo-400 bg-white px-1 py-0.5 text-[11px] outline-none" />
    );
  }
  return (
    <select value={value} dir="rtl"
      onChange={(e) => { if (e.target.value === "__free") setFree(true); else onChange(e.target.value); }}
      className={"w-full rounded-md border border-slate-200 bg-white px-1 py-0.5 text-[11px] outline-none "
        + (value ? "font-bold text-slate-900" : "text-slate-400")}>
      <option value="">—</option>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value="__free">أخرى…</option>
    </select>
  );
}

function MatchDetails({ row, cols, vin }: {
  row: { plate: string; match: Record<string, string> | null };
  cols: { brandCol: string | null; typeCol: string | null; bankCol: string | null };
  vin?: string;
}) {
  const d = carDetails(row.match, cols, vin);
  const Item = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) => (
    <span className="flex items-center gap-1">
      <span className="text-rose-400">{icon}</span>
      <span className="text-rose-400">{label}</span>
      <span className={value ? "font-black text-rose-900" : "text-rose-300"}>{value || "—"}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
      <Item icon={<Car size={10} />} label="نوع السيارة" value={d.car} />
      <Item icon={<Building2 size={10} />} label="الشركة" value={d.company} />
      <Item icon={<Hash size={10} />} label="الهيكل" value={d.chassis} />
      {/* 🔎 الشهادة بتتبحث تلقائياً بالشاص وإلا باللوحة، وبتختفي لو مفيش */}
      <CertificateBadge plate={row.plate} chassis={d.chassis ?? undefined} />
    </div>
  );
}

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

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
  Pencil, Building2, Hash, Car, X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord } from "@/lib/idb";
import { type ExcelTable } from "@/lib/excel";
import { cachedCombinedCheckIndex } from "@/lib/checkSheets";
import { currentSession } from "@/lib/authSession";
import { rememberTrialGate, cachedTrialGate, forgetTrialGate } from "@/lib/trialGateCache";
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
import { startGpsAutoRefresh } from "@/lib/gpsAutoRefresh";
import { voiceProNames } from "@/lib/voiceProName";
import { rowCheckCols } from "@/lib/wantedColumns";
import { splitByAgent, isMine } from "@/lib/draftByAgent";

/** صفوف بلا تكرار بالـid (الأحدث يكسب) — للوحات المستخبية. */
function uniqueById<T extends { id: string }>(xs: readonly T[]): T[] {
  return [...new Map(xs.map((x) => [x.id, x])).values()];
}
import { readJudgeEndpoint, saveJudgeEndpoint, clearJudgeEndpoint } from "@/lib/plateJudgeGate";
import {
  canOpenTrialPage, planTrialRun, resolveTrialEndpoint, TRIAL_TYPE_BASE, shouldAskType, fetchTrialToken,
  tokenProbeVerdict,
} from "@/lib/trialModelGate";
import { heardNotShown, blockedNotShown } from "@/lib/trialTwin";
import { placeLiveRow } from "@/lib/placeLiveRow";
import { FleetMemory } from "@/lib/fleetPairs";
import { resolveCheckColumns } from "@/lib/wantedColumns";
import { detectChassisColumn } from "@/lib/chassis";
import {
  trialEntryId, carDetails, buildTrialFieldRow, exportableTrialRows, savedIds,
  stripForDraft, rehydrateMatch, restoreDraftRows, TRIAL_EXPORT_METHOD, sessionStamp, firstFailureReason,
} from "@/lib/trialRecords";
import { saveFieldCheckEntry, type FieldCheckEntry } from "@/lib/idb";
import { loadDraft, saveDraft, unexportedDeleteWarning } from "@/lib/checkDrafts";
import CertificateBadge from "@/components/CertificateBadge";
import VehicleTypeSelect from "@/components/VehicleTypeSelect";
import FileUploadBox from "@/components/FileUploadBox";
import { notifyCheckSheetChanged, onCheckSheetChanged, lastCheckSheetStamp } from "@/lib/checkSheetSync";
import { backfillMissingGps } from "@/lib/gpsBackfill";
import { checkFingerprint, getCachedChassis, setCachedChassis } from "@/lib/chassisCache";
import { noGpsWarning, autoExportPrompt, autoExportStopPrompt, trialExcelRows, modelBoxDetail } from "@/lib/trialToggles";
import { clampZoom, stepZoom, zoomedMinWidth, ZOOM_MIN, ZOOM_MAX } from "@/lib/tableZoom";
import { startupBreakdown, type Mark } from "@/lib/startupMarks";
import { type Edited } from "@/lib/trialRowMerge";
import { speechEndLatencyMs } from "@/lib/trialLatency";
import { wantedHits, shouldAlertNow, sweepKeeps, confirmWanted, wantedReadCount } from "@/lib/wantedFastPath";
import { setMicBusy } from "@/lib/micBusy";
import { createBusyHold, type BusyHold } from "@/lib/busyHold";
import { micLostNotice, type AutoStopReason } from "@/lib/micLoss";
import SessionField from "@/components/SessionField";
import { AreaResolver, areaSource, autoAreaEligible, fallbackArea } from "@/lib/autoArea";
import { reverseGeocode } from "@/lib/geocoding";
import { typeToCode } from "@/lib/vehicleType";
import { VEHICLE_CONDITION_KINDS, VEHICLE_PLACE_KINDS } from "@/lib/vehicleTypes";
import { showProvisional, PROVISIONAL_TTL_MS } from "@/lib/provisionalRow";
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
  /**
   * الخانات اللي المندوب عدّلها **بإيده** — بتغلب أي حاجة جاية من الموديل
   * في كل دمج جاي. شوف `lib/trialRowMerge.ts`.
   */
  edited?: Edited;
  /**
   * 🔴 **الحي والمسجّل مختومين لحظة النطق** — مابيتغيّروش بعد كده.
   * المالك: «ميضيفش على القديم لأني بغيّر دايماً في نفس الجلسة».
   */
  area?: string | null;
  recorder?: string | null;
  /**
   * 🏘️ الصف مستني «الحي تلقائي» — اتعلّم **لحظة النطق** (الزرار مفتوح والمربع
   * فاضي). بيتملّى بعدين من إحداثيات الصف نفسه، وبعدها بيبقى `false`.
   */
  areaAuto?: boolean;
  /** 🏘️ الـGPS ضعيف أو العنوان فشل ⇒ بياخد حي أقرب عربية (`fallbackArea`). */
  areaFallback?: boolean;
  /** 🔴 حساب المندوب اللي قال اللوحة — لوحات حساب تاني بتتخبّى ومابتتصدّرش (`lib/draftByAgent.ts`). */
  agentId?: string | null;
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

/**
 * أقصى انتظار لآخر اللوحات بعد «إيقاف» قبل ما نسأل عن التصدير ونسمح بالتحديث.
 * النافذة الواحدة مهلتها ٩ث (`REQ_TIMEOUT_MS`)، فـ١٥ث بتغطّي نافذة جارية +
 * واحدة من الطابور — وعطل مايأجّلش التحديث للأبد.
 */
const STOP_SETTLE_MAX_MS = 15_000;

/** 🏘️ حالة زرار «الحي تلقائي» على الموبايل. */
const AUTO_AREA_KEY = "rv2-auto-area";

/** رسالة «مافيش توكن» — ثابتة عشان تتشال لوحدها لو التوكن وصل بعدين. */
const NO_TRIAL_TOKEN_MSG = "مافيش توكن للموديل. شغّل docs/sql/trial-model-token.sql وبعدين "
  + "select public.set_trial_token('<السرّ>') — أو حطّه بإيدك في مربّع الإعداد تحت.";

export default function RegistrationV2Page() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  /**
   * 🔒 **السوبر أدمن بس** — التقرير الشامل ومربّع الإعداد.
   *
   * المالك (٢٣ سبتمبر ٢٠٢٦): «عايزك متظهرش التقرير الشامل ده لحد غيري…
   * شيله من صفحة المناديب والأدمن، بس السوبر أدمن اللي يظهرله».
   * والصفحة بتفتح لـ`admin || is_super`، فالأدمن العادي مايشوفهمش.
   */
  const [isSuper, setIsSuper] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [skips, setSkips] = useState<Record<string, number>>({});
  /** 🔴 نوافذ فايتة اتبعتت تاني بعد وقعة الشبكة — عشان الاسترجاع يبان في التقرير. */
  const [replays, setReplays] = useState(0);
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
  const [checkFile, setCheckFile] = useState<File | null>(null);
  /** آخر ختم تغيير للشيت اتقرا عنده — الرجوع من الخلفية بيقارن بيه. */
  const loadedStampRef = useRef<string | null>(null);
  /** ② بيدوّر على قراءة أدقّ لما المندوب يدوس التحديث اليدوي. */
  const [gpsBusy, setGpsBusy] = useState(false);
  /**
   * ⑦ حقول الجلسة — المندوب بيكتبها **مرة** فوق الجدول وبتتكرّر على كل لوحة.
   * فاضي ⇒ **مافيش عمود ومافيش حاجة تتكتب** (قرار المالك بالحرف).
   */
  const [areaName, setAreaName] = useState("");
  const [recorderName, setRecorderName] = useState("");
  /**
   * مراجع حيّة: `onPlate` بيتمسك في غلاف المحرّك **وقت التشغيل**، فقراءة
   * الـstate جوّاه بتفضل على قيمتها وقت البداية — والمندوب بيغيّر الشارع
   * **وهو بيسجّل**. المرجع بيدّي اللي في المربّع دلوقتي.
   */
  const areaRef = useRef("");
  /**
   * 🏘️ **«الحي تلقائي»** — المالك (٢٥ سبتمبر ٢٠٢٦): «زر لما يفتحه المندوب ياخد
   * اسم الحي واسم الشارع تلقائي… لو المندوب كتب في المربع يتطبق اللي كاتبه، ولو
   * فاضي ياخد من الجي بي اس ويكون دقيق». محفوظ على الموبايل (تسهيل للمندوب).
   * القواعد والاختبارات في `lib/autoArea.ts`.
   */
  const [autoArea, setAutoArea] = useState(false);
  const autoAreaRef = useRef(false);
  const areaResolverRef = useRef<AreaResolver | null>(null);
  if (!areaResolverRef.current) areaResolverRef.current = new AreaResolver(reverseGeocode);
  /** الصفوف اللي اتطلب ليها عنوان — مايتطلبش مرتين. */
  const areaAskedRef = useRef<Set<string>>(new Set());
  const recorderRef = useRef("");
  useEffect(() => { areaRef.current = areaName; }, [areaName]);
  useEffect(() => {
    try { if (localStorage.getItem(AUTO_AREA_KEY) === "1") setAutoArea(true); } catch { /* مش متاح */ }
  }, []);
  useEffect(() => {
    autoAreaRef.current = autoArea;
    try { localStorage.setItem(AUTO_AREA_KEY, autoArea ? "1" : "0"); } catch { /* مش متاح */ }
  }, [autoArea]);
  useEffect(() => { recorderRef.current = recorderName; }, [recorderName]);
  /**
   * ⑩أ **قفل أخد الموقع** — بطلب المالك. لما يتفعّل، اللوحات **الجاية**
   * بتتسجّل بلا موقع. اللي اتسجّل قبله مايتلمسش.
   * ⚠️ مرجع كمان مش state بس: `onPlate` بيتمسك في غلاف المحرّك وقت
   * التشغيل، فقراءة الـstate جوّاه بتفضل على قيمتها وقت البداية.
   */
  const [noGps, setNoGps] = useState(false);
  const noGpsRef = useRef(false);
  useEffect(() => { noGpsRef.current = noGps; }, [noGps]);
  /** ⑩ب التصدير التلقائي — بيسأل عند قفل التسجيل. */
  const [autoExport, setAutoExport] = useState(false);
  /** ⑫ زوم جدول اللوحات — جوّه المربّع بس، مش زوم الصفحة. */
  const [zoom, setZoom] = useState(1);
  /** ⑭ شكل تاني للمربّع — «فخم وعصري وبخط مختلف» بطلب المالك. */
  const [fancy, setFancy] = useState(false);
  /**
   * 🔴 **«بدوس ابدأ التسجيل بيأخر»** — بلاغ المالك ٢٣ سبتمبر ٢٠٢٦.
   * الزرّ بيرد **فوراً** بحالة «بيجهّز» بدل ما يفضل شكله واقف، والقياس
   * بيتسجّل عشان نعرف مين البطيء بالظبط (`lib/startupMarks.ts`).
   */
  const [starting, setStarting] = useState(false);
  const [startMs, setStartMs] = useState<string | null>(null);
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
  /**
   * 🔄 **التحديث التلقائي مايقطعش التسجيل** — المالك (٢٣ سبتمبر ٢٠٢٦): «لما
   * بنزّل تحديث بيتعمل تحديث تلقائي معايا وأنا مشغّل المايك وبقول لوحات،
   * فبيفصل مني التسجيل. خلّي التحديث يتعمل بعد ما أقفل المسجّل».
   *
   * `UpdateBanner` بيأجّل نفسه طول ما `isMicBusy()` — و«صوتي» بتبلّغه من
   * زمان، بس «الجديد» **ماكانتش بتبلّغه خالص**. والمسكة بتفضل لحد **آخر
   * خطوة**: آخر لوحات من السيرفر ← سؤال التصدير ← التصدير. شوف `lib/busyHold.ts`.
   */
  const holdRef = useRef<BusyHold | null>(null);
  if (!holdRef.current) holdRef.current = createBusyHold(setMicBusy);
  /** سيب مسكة جلسة التسجيل الحالية (لو فيه). */
  const recReleaseRef = useRef<(() => void) | null>(null);
  /** 📞 رسالة «التسجيل وقف لوحده» — مكالمة أو تطبيق تاني أخد المايك. */
  const [notice, setNotice] = useState<string | null>(null);
  /** ساعة الصوت للتأخير — بتفضل بعد الإيقاف عشان آخر اللوحات تتحسب صح. */
  const clockRef = useRef<VoicexEngineController | null>(null);
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
  /**
   * ⚡ `cached…` — الفهرس بيتبني **مرة لكل ملف** مش مع كل فتحة للصفحة
   * (~١٥٠ مللي على الموبايل لـ٥٦ ألف صف). شوف `lib/checkSheets.ts`.
   */
  const checkIndex = useMemo(
    () => cachedCombinedCheckIndex(checkSources),
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
  /**
   * ⚡ **الرجوع للصفحة فوري** — المالك (٢٣ سبتمبر ٢٠٢٦): «صفحة الجديد لما
   * بروح عليها بتبقى تقيلة شوي، خليها أسرع».
   *
   * 🔴 كانت بتستنى **٣ نداءات شبكة ورا بعض** قبل ما ترسم أي حاجة («جارٍ
   * التحقق…»): `getUser` ← البروفايل ← التوكن. دلوقتي:
   *   · الجلسة من **الموبايل نفسه** (`currentSession` — بلا شبكة)
   *   · البروفايل والتوكن **مع بعض** مش ورا بعض
   *   · الرجوع بيفتح **على طول** من اللي اتفتكر (`lib/trialGateCache.ts`)
   *     والتأكيد بيحصل في الخلفية — ولو الصلاحية اتقفلت الصفحة بتتقفل
   */
  useEffect(() => {
    let alive = true;
    /** يفتح الصفحة بالصلاحية والتوكن — من اللي اتفتكر أو من السيرفر. */
    const openWith = (sup: boolean, dbToken: string | null) => {
      /**
       * 🔴 **التوكن من الداتابيز مش من الكود.**
       *
       * كان مكتوب صريح في `trialModelGate.ts`، يعني بيتشحن جوّه التطبيق
       * لكل موبايل — وأي حد يفتح ملفات التطبيق ياخده ويبعت صوت على طول
       * للسيرفر. دلوقتي بيتجاب من `app_settings` (جدول مالوش سياسة SELECT)
       * زي ما صفحة التشييك بتعمل بالظبط.
       *
       * ⚠️ فشل القراءة = توكن فاضي = `planTrialRun` بيرفض التشغيل برسالة
       * واضحة. **الفشل بيقفل** — مافيش رجوع لتوكن مكتوب.
       */
      const ep = resolveTrialEndpoint(readJudgeEndpoint(), dbToken);
      setIsSuper(sup);
      setModelUrl(ep.base); setModelToken(ep.token); setAllowed(true);
      if (!ep.token) setError(NO_TRIAL_TOKEN_MSG);
      // التوكن وصل في التأكيد ⇒ رسالة «مافيش توكن» اللي طلعت من الكاش تتشال
      else setError((e) => (e === NO_TRIAL_TOKEN_MSG ? null : e));
    };
    (async () => {
      const sess = await currentSession();
      let userId = sess.userId;
      if (!userId && !sess.signedOut) {
        // شك مش خروج (القراية المحلية ماجابتش حاجة) — نسأل السيرفر زي الأول
        try { userId = (await supabase.auth.getUser()).data.user?.id ?? null; } catch { /* نت */ }
      }
      if (!alive) return;
      if (!userId) { setDenied("مش مسجّل دخول — ادخل الأول وبعدين افتح الصفحة دي تاني."); return; }
      agentRef.current = userId;
      /** 🔒 السوبر أدمن: لوحات الحسابات التانية على الموبايل تتخبّى (مابتتمسحش). */
      const uidForSplit = userId;
      const applySplit = (sup: boolean) => {
        if (splitUidRef.current === uidForSplit) return;
        splitUidRef.current = uidForSplit;
        setRows((prev) => {
          const { mine, others } = splitByAgent(prev, uidForSplit);
          if (!others.length) return prev;
          othersRef.current = uniqueById([...othersRef.current, ...others]);
          return mine;
        });
      };

      const hit = cachedTrialGate(userId);
      if (hit) { openWith(hit.isSuper, hit.token); applySplit(hit.isSuper); }

      const [profRes, dbToken] = await Promise.all([
        supabase.from("profiles").select("role, is_super, voicex_enabled, voicex_until").eq("id", userId).single(),
        fetchTrialToken(),
      ]);
      if (!alive) return;
      const { data: prof, error: profErr } = profRes;
      if (profErr) {
        // مفتوحة من اللي اتفتكر ⇒ عطل شبكة لحظي مايقفلهاش
        if (!hit) setDenied("مش قادر أقرا صلاحيتك: " + profErr.message);
        return;
      }
      /**
       * 🔴 **نفس قاعدة «صوتي» بالظبط** — زرّ «فتح الصوت» (عند عمل الإيميل
       * وفي صفحة كل مندوب) بيقفل ويفتح الاتنين مع بعض. شوف `canOpenTrialPage`.
       * ولو الصوت اتقفل وهو فاتح من الذاكرة ⇒ الصفحة بتتقفل في التأكيد.
       */
      if (!canOpenTrialPage(prof)) {
        forgetTrialGate();
        try { engineRef.current?.stop(); } catch { /* ignore */ }
        setListening(false); setAllowed(false);
        setDenied("الصفحة دي لمشتركين خدمة الصوت. كلّم الإدارة تفتحلك الصوت.");
        return;
      }
      const sup = prof?.is_super === true;
      // فشل قراية التوكن والكاش فيه توكن من الداتابيز ⇒ نكمّل بيه
      const token = dbToken || hit?.token || null;
      rememberTrialGate(userId, { isSuper: sup, token });
      if (!hit || hit.isSuper !== sup || hit.token !== token) openWith(sup, token);
      applySplit(sup);
      /**
       * ☁️ **ارفع اللي مستني أول ما الصفحة تفتح** — زي صفحة التشييك بالظبط. لوحة اتصدّرت
       * والنت فاصل كانت بتفضل على الموبايل لحد تصدير جاي أو فتح التشييك (و«صوتي» هتستخبى).
       * لوحات المندوب ده بس (`requireSession` + فلتر الحساب). للكل (المالك: «يلا ارفع»).
       */
      void import("@/lib/syncFieldCheck")
        .then(({ pushPendingFieldChecks }) => pushPendingFieldChecks(userId as string))
        .catch(() => { /* هتتزامن بعدين */ });
    })();
    return () => {
      alive = false;
      if (timerRef.current) clearInterval(timerRef.current);
      try { engineRef.current?.stop(); } catch { /* ignore */ }
      try { stopAlertSiren(); } catch { /* ignore */ }
    };
  }, []);

  /* ─── 📍 الموقع — متتبّع حيّ طول ما الصفحة مفتوحة ─────────────────── */
  useEffect(() => {
    if (allowed !== true) return;
    gpsService.startTracking().catch(() => { /* المستخدم رفض — الصفحة بتفضل شغّالة */ });
    const unsub = gpsService.subscribe((c) => {
      gpsRef.current = c; setGps(c);
      /**
       * ② 🔴 **«كل لوحة تاخد موقع»** — بطلب المالك.
       *
       * الموقع بيتختم على الصف لحظة ما يتعمل، وأول ثواني بعد فتح الصفحة
       * الـGPS لسه بيقفل ⇒ أول لوحات المندوب بتتسجّل **بلا موقع**
       * و`exportableTrialRows` بترميها من التصدير — شغل ضايع في صمت.
       *
       * فأول ما موقع ييجي بنختم الصفوف اللي فاضية **والجديدة بس**
       * (مهلة دقيقتين) — الصف القديم ممكن يكون في حي تاني، وموقع غلط
       * أسوأ من مافيش موقع. القرار مغطّى باختبارات في `lib/gpsBackfill.ts`.
       */
      setRows((prev) => backfillMissingGps(prev, c, Date.now()) as LiveRow[]);
    });
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, [allowed]);

  /**
   * 📍 **تحديث الموقع لوحده كل ٣ ثواني** — المالك (٢٤ سبتمبر): «عايز الجي بي اس يعمل
   * تحديث لنفسه كل ٣ ثواني». نفس زرار «تحديث» بس لوحده، قراية واحدة في المرة.
   * للكل — المالك جرّبه كسوبر أدمن وقال «انشر للمناديب». شوف `lib/gpsAutoRefresh.ts`.
   */
  useEffect(() => {
    if (allowed !== true) return;
    return startGpsAutoRefresh({
      getFix: () => gpsService.getFreshFix({ maxAgeMs: 0, timeoutMs: 2800 }),
      onFix: (c) => { gpsRef.current = c; setGps(c); },
    });
  }, [allowed]);

  /** ☁️ النت رجع ⇒ ارفع اللي مستني (السوبر أدمن الأول) — نفس الدالة والحساب. */
  useEffect(() => {
    if (allowed !== true) return;
    const onOnline = () => {
      const uid = agentRef.current;
      if (!uid) return;
      void import("@/lib/syncFieldCheck")
        .then(({ pushPendingFieldChecks }) => pushPendingFieldChecks(uid))
        .catch(() => { /* هتتزامن بعدين */ });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [allowed]);

  /** ② 🔄 تحديث الموقع بإيد المندوب — بيدوّر على قراءة أدقّ وأحدث. */
  const refreshGps = useCallback(async () => {
    setGpsBusy(true);
    try {
      const c = await gpsService.getFreshFix({ maxAgeMs: 0, timeoutMs: 15000 });
      if (c) {
        gpsRef.current = c; setGps(c);
        setRows((prev) => backfillMissingGps(prev, c, Date.now()) as LiveRow[]);
      }
    } catch { /* المستخدم رفض أو الشبكة — الحالة بتفضل زي ما هي */ }
    finally { setGpsBusy(false); }
  }, []);

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

  /**
   * 📞 **المكالمة ليها الأولوية** — نفس حارس «صوتي» بالظبط، وكان ناقص هنا.
   *
   * المالك (٢٣ سبتمبر ٢٠٢٦): «مش عايز لو جه مكالمة والمندوب بيسجّل تتعارض
   * مع المايك، وتقفل المايك للمكالمة… سواء مكالمة تليفون أو على أي تطبيق
   * تواصل». أول ما التطبيق يروح للخلفية (فتح المكالمة، أو بدّل تطبيق، أو
   * قفل الشاشة بإيده) بنسيب الميك فوراً. واللي التطبيق فيه قدام الشاشة
   * والمكالمة أخدت الميك برضه بيتكشف من المحرك (`onMicLost`).
   */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden" && engineRef.current) stopRef.current("background");
    };
    const onHide = () => { if (engineRef.current) stopRef.current("background"); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      // الصفحة اتقفلت ⇒ «الميك مشغول» يتشال (وإلا التحديث يفضل مستني للأبد)
      holdRef.current?.reset();
    };
  }, []);

  /**
   * 🏘️ **يملا «الحي تلقائي»** للصفوف اللي اتعلّمت لحظة النطق — من إحداثيات
   * **الصف نفسه** (مش مكان المندوب دلوقتي). الصف اللي موقعه لسه ماوصلش بيستنى
   * (ختم الموقع المتأخر بيملاه). والطلبات واحد ورا التاني (`AreaResolver`).
   *
   * 🔴 **مفيش خانة فاضية** — المالك (٢٥ سبتمبر ٢٠٢٦): «لو سيئة ياخد نفس اسم
   * الحي والشارع تبع السيارة اللي قبلها». الـGPS أضعف من ٣٥م أو خدمة العناوين
   * فشلت ⇒ حي أقرب عربية قبلها (أو بعدها لو أول الجلسة) — `fallbackArea`.
   */
  useEffect(() => {
    const updates = new Map<string, string>();
    for (const r of rows) {
      if (!r.areaAuto || r.area) continue;
      if (r.areaFallback) {
        const fb = fallbackArea(rows, r.id);
        if (fb) updates.set(r.id, fb);
        continue;
      }
      if (areaAskedRef.current.has(r.id)) continue;
      if (r.lat == null || r.lng == null) continue;          // الموقع لسه جاي
      areaAskedRef.current.add(r.id);
      const id = r.id;
      if (!autoAreaEligible(r)) {
        setRows((prev) => prev.map((x) => (x.id === id ? { ...x, areaFallback: true } : x)));
        continue;
      }
      void areaResolverRef.current!.resolve(r.lat, r.lng).then((label) => {
        setRows((prev) => prev.map((x) => {
          if (x.id !== id || x.area) return x;
          return label ? { ...x, area: label, areaAuto: false } : { ...x, areaFallback: true };
        }));
      });
    }
    if (updates.size) {
      setRows((prev) => prev.map((x) => (updates.has(x.id) && !x.area
        ? { ...x, area: updates.get(x.id)!, areaAuto: false, areaFallback: false }
        : x)));
    }
  }, [rows]);

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
  /** 🔴 حساب المندوب الحالي (من الموبايل) — بيتختم على كل لوحة جديدة. */
  const agentRef = useRef<string | null>(null);
  /**
   * 🔒 لوحات **حسابات تانية** على نفس الموبايل — مستخبية ومحفوظة في المسودّة لحد ما
   * صاحبها يدخل (مابتتمسحش ومابتتصدّرش باسم حد تاني). السوبر أدمن الأول.
   */
  const othersRef = useRef<LiveRow[]>([]);
  const splitUidRef = useRef<string | null>(null);
  /**
   * ⚡ بتتقري **على طول** مع فتح الصفحة — مش بعد ما الصلاحية ترجع من الشبكة
   * (بيانات المندوب على موبايله، والصفحة مابتترسمش لحد ما الصلاحية تيجي).
   *
   * 🔴 و«مطلوبة» بترجع **وهي بتوصل** (`restoreDraftRows`): لو الشيت جه قبلها
   * — وده اللي بيحصل في الرجوع للصفحة — الإرجاع اللي تحت كان فات خلاص،
   * واللوحات المطلوبة كانت بترجع عادية.
   */
  useEffect(() => {
    void loadDraft<LiveRow>("trial", "rv2-rows")
      .then((saved) => {
        if (saved.length) {
          const restored = restoreDraftRows(saved, checkIndexRef.current, (pl) => normalizePlate(bankPlateToArabic(pl)));
          // 🔒 الحساب اتعرف قبل المسودّة ⇒ لوحات الحسابات التانية تتخبّى من الأول
          const uidNow = splitUidRef.current;
          if (uidNow) {
            const { mine, others } = splitByAgent(restored, uidNow);
            othersRef.current = uniqueById([...othersRef.current, ...others]);
            setRows(mine);
          } else setRows(restored);
        }
      })
      .catch(() => { /* مافيش مسودّة */ })
      .finally(() => { draftReady.current = true; });
  }, []);
  useEffect(() => {
    // ⚠️ مانكتبش قبل ما نقرا — وإلا أول رسم (صفوف فاضية) بيمسح المسودّة.
    if (!draftReady.current) return;
    // 🔒 المستخبية بتتحفظ مع الظاهرة — مسح/تصدير المندوب ده مايلمسش لوحات غيره
    void saveDraft("trial", "rv2-rows", stripForDraft([...rows, ...othersRef.current]));
  }, [rows]);
  /** أول ما شيت التشييك يجهز، الصفوف المحمّلة تاخد «مطلوبة» بتاعتها. */
  useEffect(() => {
    if (!draftReady.current || checkIndex.size === 0) return;
    setRows((prev) => (prev.some((r) => !r.match)
      ? rehydrateMatch(prev, checkIndex, (pl) => normalizePlate(bankPlateToArabic(pl)))
      : prev));
  }, [checkIndex]);

  /* ─── الشيت ───────────────────────────────────────────────────────── */
  /**
   * 📥 تحميل شيت التشييك — **خفيف**.
   *
   * 🔴 المالك (٢٣ سبتمبر ٢٠٢٦): «التنقل بين الصفحات بقى تقيل بعد ما ضيفنا
   * الجديد». كانت كل فتحة للصفحة (وكل ما الموبايل يصحى) بتعمل:
   *   ① تقرا الـ٤٩ ألف لوحة من IndexedDB
   *   ② **تقراهم تاني** (`loadAllCheckSources` بيبدأ من الملف الأساسي نفسه)
   *   ③ **تحلّل ملف الإكسيل كله من جديد** (`readAllSheets`) عشان الشاص
   * والتالتة أتقل حاجة — ثواني على الخيط الرئيسي.
   *
   * دلوقتي:
   *   · قراية واحدة للملف الأساسي، والإضافية بس بعده
   *   · الصفحة بتتملى **على طول** (الشيت والصفّارة شغّالين فوراً)
   *   · خريطة الشاص من **الكاش** لو نفس الملف (`lib/chassisCache.ts`)،
   *     وإلا بتتحسب **بعد ما الصفحة تترسم** — فمابتعطّلش التنقل
   */
  const loadCheck = useCallback(() => {
    void (async () => {
      try {
        const rec = await getUploadedFile("local", "check").catch(() => null);
        loadedStampRef.current = lastCheckSheetStamp();
        if (!rec) {
          /**
           * 📥 الأساسي اتمسح والإضافية موجودة ⇒ الإضافية لوحدها — زي «صوتي» بالظبط (كانت
           * بتتجاهلهم كلهم فمفيش ولا لوحة بتطلع مطلوبة). للكل (المالك: «يلا ارفع»).
           */
          const extrasOnly: ExcelTable[] = [];
          for (let n = 2; n < 100; n++) {
            const x = await getUploadedFile("local", `check-${n}`).catch(() => null);
            if (!x) break;
            extrasOnly.push({ headers: x.headers, rows: x.rows });
          }
          setCheckTable(null); setCheckSources(extrasOnly); setCheckFile(null);
          setCheckName(extrasOnly.length ? "ملفات تشييك إضافية" : "");
          const chassisOnly = new Map<string, string>();
          for (const t of extrasOnly) {
            const pCol = detectPlateColumn(t.headers, t.rows);
            const cCol = detectChassisColumn(t.headers, t.rows);
            if (!pCol || !cCol) continue;
            for (const row of t.rows) {
              const k = normalizePlate(bankPlateToArabic(String(row[pCol] ?? "")));
              const v = String(row[cCol] ?? "").trim();
              if (k && v && !chassisOnly.has(k)) chassisOnly.set(k, v);
            }
          }
          setPlateChassis(chassisOnly);
          return;
        }
        const main: ExcelTable = { headers: rec.headers, rows: rec.rows };
        // الإضافية (`check-2`، `check-3`…) — **من غير** ما نقرا الأساسي تاني
        const sources: ExcelTable[] = [main];
        for (let n = 2; n < 100; n++) {
          const x = await getUploadedFile("local", `check-${n}`).catch(() => null);
          if (!x) break;
          sources.push({ headers: x.headers, rows: x.rows });
        }
        // ⚡ الصفحة بتتملى هنا — الشيت والصفّارة شغّالين من اللحظة دي
        setCheckTable(main);
        setCheckName(rec.fileName || "ملف التشييك");
        setCheckSources(sources);
        // المربّع بيعرض الملف المرفوع — بنعيد بناء `File` من الـblob المحفوظ.
        try {
          if (rec.fileBlob) setCheckFile(new File([rec.fileBlob], rec.fileName || "check.xlsx"));
        } catch { /* الـblob مش مقروء — الاسم لوحده كفاية */ }

        /**
         * 🔧 لوحة ← رقم الهيكل من **كل ورقات** الملف.
         *
         * `parseExcelFile` بيقرا ورقة واحدة (بيفضّل «تشييك»)، وعمود الهيكل
         * كتير بيكون في ورقة تانية — فلازم نقرا الـblob كله. **بس مرة واحدة
         * لكل ملف**: البصمة (من غير تاريخ) بتقول لو اتحسبت قبل كده.
         */
        const extraKey = sources.slice(1).map((t) => t.rows.length).join(",");
        const fp = (checkFingerprint(rec) ?? "") + "#" + extraKey;
        const cached = getCachedChassis(fp);
        if (cached) { setPlateChassis(cached); return; }

        // ⏳ الحساب بعد ما الصفحة تترسم — مايعطّلش التنقل ولا أول لمسة.
        await new Promise<void>((res) => {
          const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
          if (typeof ric === "function") ric(() => res(), { timeout: 1500 });
          else setTimeout(res, 50);
        });
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
        setCachedChassis(fp, map);
        setPlateChassis(map);
      } catch { /* مفيش شيت */ }
    })();
  }, []);

  /**
   * ① 📥 **الشيت مشترك بين الصفحتين — والتحديث تلقائي.**
   *
   * المالك (٢٣ سبتمبر ٢٠٢٦): «ممكن يترفع من صفحة التشييك عادي وممكن من
   * صفحة الجديد، واللي يترفع سواء هنا أو هنا تظهر في التانية».
   *
   * الملف نفسه مشترك من الأول (سلوت `local:check`)، اللي كان ناقص هو
   * **الإشارة**: الصفحة التانية مكانتش تعرف إن فيه حاجة اتغيّرت فبتفضل
   * على النسخة اللي في ذاكرتها.
   *
   * وبنعيد القراءة كمان لما المندوب **يرجع للصفحة** (`visibilitychange`)
   * — لأن الصفحتين مسارين منفصلين وواحدة بس بتكون متركّبة.
   */
  useEffect(() => {
    // `idbEvent`: الشيت الجاي من واتساب كمان — كان مابيوصلش للصفحة دي.
    const off = onCheckSheetChanged(() => loadCheck(), { idbEvent: true });
    /**
     * 🔴 الرجوع من الخلفية **بيعيد القراية بس لو فاتنا تغيير** — كانت بتقرا
     * الـ٤٩ ألف لوحة من الأول كل ما الموبايل يصحى من القفل.
     */
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (lastCheckSheetStamp() !== loadedStampRef.current) loadCheck();
    };
    try { document.addEventListener("visibilitychange", onVis); } catch { /* ignore */ }
    return () => {
      off();
      try { document.removeEventListener("visibilitychange", onVis); } catch { /* ignore */ }
    };
  }, [loadCheck]);

  /**
   * رفع/تغيير ملف التشييك **من الصفحة دي** — نفس سلوت «التشييك» بالظبط
   * (`local:check`)، فاللي يترفع هنا بيشتغل هناك والعكس.
   *
   * ⛔ **مابنمسحش لوحات المندوب** لما الملف يتغيّر — نفس قرار صفحة التشييك:
   * حالة «مطلوبة» ممكن تبقى قديمة، لكن اللوحة والموقع والوقت شغل المندوب.
   */
  const onCheckParsed = useCallback(async (table: ExcelTable, file: File) => {
    const record: UploadedFileRecord = {
      key: "local:check", agentId: "local", slot: "check",
      fileName: file.name, headers: table.headers, rows: table.rows,
      uploadedAt: new Date().toISOString(), fileBlob: file,
    };
    await saveUploadedFile(record);
    notifyCheckSheetChanged();
    loadCheck();
  }, [loadCheck]);

  const onCheckClear = useCallback(async () => {
    await deleteUploadedFile("local", "check").catch(() => {});
    notifyCheckSheetChanged();
    loadCheck();
  }, [loadCheck]);

  /** ⚡ الشيت بيتقري **مع فتح الصفحة** — بالتوازي مع الصلاحية مش بعدها. */
  useEffect(() => { loadCheck(); }, [loadCheck]);

  /**
   * 🔥 **تسخين شنك المحرّك** — من أسباب «بدء التسجيل بيأخر».
   *
   * `import("@/lib/voicexEngine")` أول مرة بينزّل الشنك ويفكّه **جوّه
   * الضغطة**. بنسحبه في الخلفية أول ما الصفحة تفتح، فالضغطة بتلاقيه جاهز.
   * فشله مايأثرش — الاستيراد هيتم عادي وقت الضغط.
   */
  useEffect(() => {
    if (allowed !== true) return;
    void import("@/lib/voicexEngine").catch(() => { /* هيتحمّل وقت الضغط */ });
  }, [allowed]);

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
        /**
         * 🔴 **`/health` مابيطلبش توكن** — فنجاحه **مش** دليل إن التوكن سليم.
         *
         * بلاغ المالك (٢٣ سبتمبر ٢٠٢٦): الصفحة قالت «متصل ✓» وكل نافذة
         * بتترفض بصمت (توكن قديم محفوظ) ⇒ ولا لوحة طلعت. ده أخطر من عطل
         * واضح لأنه بيسجّل وهو مطمّن.
         *
         * فبنبعت `POST /transcribe` **بجسم فاضي**: السيرفر بيتحقق من التوكن
         * قبل ما يبص على الصوت، فـ401 = توكن غلط و400 = توكن تمام. رخيص —
         * مافيش صوت بيترفع ومافيش شغل على الكارت.
         */
        let verdict: ReturnType<typeof tokenProbeVerdict> = "other";
        try {
          const r = await fetch(b + "/transcribe", {
            method: "POST", headers: { "X-Plate-Token": t }, body: new Blob([]), signal: to(),
          });
          verdict = tokenProbeVerdict(r.status);
        } catch { /* الشبكة — بنسيبها "other" */ }

        if (verdict === "bad_token") {
          setProbe({ ok: false, msg: "واصل بس **التوكن مرفوض** — اضغط «مسح الإعداد» تحت وافتح الصفحة تاني." });
        } else {
          const dev = body.device === "cuda" ? "كارت الشاشة" : body.device ?? "الجهاز";
          setProbe({ ok: true, msg: (body.model ?? "الموديل") + " على " + dev + (verdict === "ok" ? " · التوكن سليم ✓" : "") });
        }
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
      /**
       * 🔴 المطلوبة مابتتكنسش — الصفّارة ضربت والمندوب ممكن يكون واقف قدامها.
       * 🔴 واللي من **جلسة فاتت** مابتتكنسش كمان: المكالمة بتقطع التسجيل قبل
       * التأكيد، والكنس كان بيمسحها أول ما المندوب يكمّل. شوف `sweepKeeps`.
       */
      const since = startedAtRef.current;
      setRows((prev) => prev.every((r) => sweepKeeps(r, cut, since))
        ? prev
        : prev.filter((r) => sweepKeeps(r, cut, since)));
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

  /**
   * ① ⏱️ **«ظهرت بعد» من آخر كلام المندوب** — مش من نص النافذة.
   *
   * كان `now - startedAt - tMs`: `tMs` = **نص نافذة الـ٥ث** (٢.٥ث قبل آخرها)
   * فالرقم كان بيزوّد ٢.٥ث هندسة مالهاش علاقة بالسرعة — ومن تقرير المالك:
   * 2.5 + 0.57 (الرحلة) = 3.07ث، بالظبط الـ«٣ ثواني» اللي شافها. وكمان كان
   * بيقارن ساعة الضغطة بساعة المايك، فزمن فتح المايك كان بيتضاف عليه.
   * دلوقتي ساعة واحدة (ساعة الصوت نفسها). شوف `lib/trialLatency.ts`.
   */
  const latencyNow = (tMs: number): number => {
    // ⚠️ `clockRef` مش `engineRef`: الإيقاف بيمسح `engineRef` وبعدين المحرّك
    // بيصرّف آخر اللوحات — فكانت آخر لوحة بتاخد تأخير «صفر» غلط.
    const e = clockRef.current;
    if (!e) return 0;
    return speechEndLatencyMs({ nowMs: e.audioNowMs, tMs, lastVoiceEndMs: e.lastVoiceEndMs });
  };

  /* ─── التسجيل ─────────────────────────────────────────────────────── */
  async function start() {
    setError(null); setNotice(null); setSkips({}); setReads([]); setReplays(0);
    wantedSeenRef.current = new Map();
    // 🚚 التسلسل الفوري للكل — المالك جرّبه (٢٤ سبتمبر): «شغّال زي الفل، ارفعوه للكل»
    fleetRef.current = new FleetMemory({ sequence: true, firstCar: true });   // 🚚 أول عربية: للكل (المالك جرّبه ٢٤ سبتمبر)
    typeQueueRef.current = []; winBufRef.current = []; askedWinRef.current = new Set();
    const plan = planTrialRun({ base: modelUrl, token: modelToken });
    if (!plan.ok) { setError(plan.message); return; }
    try { ensureSirenAudioUnlocked(); } catch { /* ignore */ }
    /**
     * 🔴 **`loadCheck()` اتشال من هنا** — ده كان سبب «بيأخر على ما بيبدأ».
     *
     * `loadCheck` بيعمل `readAllSheets` على ملف التشييك **كله** (٤٩ ألف
     * لوحة) عشان يبني خريطة الشاص — تحليل إكسل كامل **على الخيط الرئيسي**
     * جوّه الضغطة نفسها، فالصفحة بتتجمّد.
     *
     * وهو **مالوش لازمة هنا**: الشيت بيتحمّل عند فتح الصفحة، وبقى بيتحدّث
     * لوحده مع أي رفع في أي صفحة (`onCheckSheetChanged`) ولما المندوب
     * يرجع للصفحة (`visibilitychange`).
     */
    setStarting(true);
    // 🔄 من اللحظة دي التحديث التلقائي بيستنى — لحد آخر خطوة في الإيقاف
    recReleaseRef.current?.();
    recReleaseRef.current = holdRef.current!.hold();
    const pressedAt = Date.now();
    const marks: Mark[] = [];
    startedAtRef.current = pressedAt;
    try {
      const { startVoicexEngine } = await import("@/lib/voicexEngine");
      marks.push({ label: "المحرّك", at: Date.now() });
      const ctrl = await startVoicexEngine({
        transcribeUrl: modelUrl.trim().replace(/\/+$/, "") + "/transcribe",
        token: modelToken.trim(),
        // 🔒 الإصلاحات الجديدة مفتوحة **هنا بس** — بطلب المالك «خليها في
        // صفحة الموديل الجديد فقط لحد ما أجرّب». صفحة التشييك على السلوك
        // القديم بالحرف لحد ما يتأكّد على جهاز حقيقي.
        fixes: true,
        // 🚚 الأسطول المتسلسل مايتلمّش في لوحة واحدة — «الجديد» بس
        fleetSplit: true,
        fleetSequence: true,
        // 🚚 «أول عربية في الأسطول» للكل — المالك جرّبه كسوبر أدمن وقال «انشر للكل»
        fleetFirstCar: true,
        onPlate: (plate: string, meta: VoicexPlateMeta) => {
          const key = normalizePlate(bankPlateToArabic(plate));
          /**
           * 🔔 **مطلوبة بعد التأكد بس** — الإجماع شافها في نافذتين أو أكتر، أو
           * القراءات المباشرة أكّدتها قبله. لوحة الإجماع طلّعها من نافذة واحدة
           * (`mult = 1`) مش متأكّدة ⇒ مابتتعلّمش ولا بتصفّر.
           */
          const inSheet = checkIndexRef.current.get(key) ?? null;
          const hit = inSheet && (meta.mult >= 2 || wantedReadCount(wantedSeenRef.current, key, meta.tMs) >= 2)
            ? inSheet : null;
          /**
           * ⑩أ 🚫 **قفل أخد الموقع** — بطلب المالك. لما يبقى مفعّل،
           * اللوحة بتتسجّل **بلا موقع** (واللي اتسجّل قبله مايتلمسش).
           * مرجع مش state: الغلاف ده اتمسك وقت تشغيل المحرّك.
           */
          const g = noGpsRef.current ? null : gpsRef.current;
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
            latencyMs: latencyNow(meta.tMs),
            match: hit, type: ty?.type ?? null, note: ty?.note ?? null,
            lat: g?.lat ?? null, lng: g?.lng ?? null, gpsAccuracy: g?.accuracy ?? null,
            // 🔴 الختم **دلوقتي** — اللي في المربّع وقت ما المندوب قالها.
            ...sessionStamp(areaRef.current, recorderRef.current),
            areaAuto: areaSource(areaRef.current, autoAreaRef.current) === "auto",
            agentId: agentRef.current,
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
            /**
             * 🔴 **«نفس الأرقام + حرفين» = نفس العربية، والأقدم صح** — قبل أي
             * لمّ تاني. اتقاس على ٦ جلسات بحقيقة المالك (٣٣٢ لوحة): ٣ زيادات
             * اتشالت وصفر لوحة حقيقية ضاعت. `sameCarTwin` بيلمّ حرف واحد بس،
             * و«الأقوى يكسب» كان بيشيل الصح (`بنط9093` عنده نوافذ أكتر).
             * شوف `lib/letterTwin.ts`.
             *
             * ⚠️ **الصفّارة تحت بتضرب برضه لو القراية دي مطلوبة** — عن قصد.
             * لو في الحالة النادرة المتأخّرة هي اللي صح وكانت مطلوبة، المندوب
             * لسه بيتنبّه. صفّارة زيادة أرخص بكتير من عربية مطلوبة تعدّي.
             */
            /**
             * 🔴 **أو نفس النطقة بزمن الصوت** — القراية المتأخّرة بعد وقعة
             * الشبكة (`voicexReplay`) بتيجي بعد ما اللوحة نزلت تحت أول ٣
             * صفوف، فـ`nearby` لوحده كان هيطلّعها صف مكرّر.
             *
             * المؤكّد بيغلب المبدئي دايماً — القاعدة في `provisionalRow.ts`.
             */
            /**
             * 🕐 **زمن الظهور = أول مرة المندوب شافها**، مش وقت التأكيد.
             *
             * كان الصف المؤكّد بيكتب زمنه هو، فالتقرير كان بيقول ٦ث بينما
             * اللوحة كانت بانت مبدئية في ~٣ث. الرقم ده بيتقاس عليه قرار
             * السرعة، فلازم يكون **اللي المندوب عاشه** مش اللي النظام عمله.
             */
            /**
             * 🔴 **الصف بيحافظ على هويته، وشغل المندوب بيغلب.**
             *
             * بلاغ المالك: «لما بختار النوع أو الملاحظة يدوي مش بتظهر».
             * كان `{ ...fresh }` ⇒ `id` جديد في كل تأكيد (أول ٢-٣ ثواني،
             * بالظبط وقت ما المندوب بيختار) ⇒ React بيعيد تركيب الصف
             * فالمنسدلة بتتقفل تحت إيده، واختياره بيروح لـid مابقاش موجود.
             * القاعدة والاختبارات في `lib/trialRowMerge.ts`.
             *
             * ⚠️ **الترتيب زي ما كان** (الصف المتأكّد بيطلع لفوق): قاعدة
             * لمّ التكرار `isExactRepeatNearby` بتبص على **أول ٣ صفوف**،
             * ولو الصف بطّل يطلع لفوق، قراءة متأخرة ليه كانت هتطلع صف مكرر.
             * وجلسة الـ٩٩/٩٩ اتقاست على الترتيب ده. ومع الـid الثابت React
             * بينقل الصف **من غير ما يعيد تركيبه**، فالمنسدلة مابتتقفلش.
             */
            /**
             * 🚚 **أسطول متسلسل** (`حبل1234 حبل1235`) اتسمع في نافذة واحدة ⇒
             * عربيتين، مايتلمّوش — بلاغ المالك ٢٤ سبتمبر. شوف `fleetPairs.ts`.
             * الخطوات كلها في `lib/placeLiveRow.ts` (نفس المبدئي تحت بالحرف).
             */
            return placeLiveRow(prev, fresh, fleetDistinct);
          });
          if (hit) alertWanted(plate, hit);
        },
        onRead: (r) => {
          setReads((prev) => [{ ...r, t: Date.now() }, ...prev].slice(0, 400));
          /**
           * 🚚 **دليل الأسطول قبل أي صف** — النافذة دي سمعت `حبل1234 حبل1235`
           * مع بعض ⇒ عربيتين. نفس القرايات اللي المحرّك بيدّيها للإجماع
           * (المقبولة بس) فالطبقتين بيحكموا بنفس الدليل.
           */
          if (r.accepted) {
            fleetRef.current.note(String(r.plate || "").trim().split(/\s+/).map((x) => x.replace(/\s+/g, "")), r.tMs, r.conf);
          }
          /**
           * ⚡ **الظهور الفوري.** القراءة عالية الثقة بتطلع صف 🟡 «مبدئية» على
           * طول (~٣ث)، والإجماع لما ييجي (~٧ث) يأكّدها 🟢 أو يصحّحها — لمّ
           * التوائم بيدمجهم. البوابة والمهلة في `provisionalRow.ts`.
           */
          /**
           * 🔴 **الصفّارة من أول قراية — قبل أي بوابة.**
           *
           * المالك: «السيارة المطلوبة بتأخر ٦ ثواني… الصفّارة متأخرش أبداً».
           * البوابة اللي تحت (ثقة ≥٩٠٪ ومش محجوبة) كانت بتخلّي العربية
           * المطلوبة تستنى الإجماع لو أول قراية ليها أقل من كده.
           * ⇒ الشيت بيتفحص **هنا الأول**، وتطابق تام ⇒ صفّارة + صف فوراً.
           * شوف `lib/wantedFastPath.ts`.
           */
          /**
           * 🔔 **بعد التأكد** — المالك (٢٥ سبتمبر ٢٠٢٦): «عايزه يظهر بعد التأكد
           * من اللوحة، مش يطلع بعد القراية المباشرة اللي قبل التعديل». كانت
           * بتصفّر من أول قراية، فقراية واحدة غلط («رلم6146» اتسمعت «رلم6113»)
           * صفّرت على عربية مش مطلوبة. دلوقتي: نافذتين بنفس اللوحة بالظبط
           * (~١.٥ث زيادة، مش ~٦ث بتوع الإجماع).
           */
          const hits = wantedHits(r, checkIndexRef.current, (x) => normalizePlate(bankPlateToArabic(x)))
            .filter((h) => confirmWanted(wantedSeenRef.current, normalizePlate(bankPlateToArabic(h.plate)), r.tMs));
          for (const h of hits) alertWanted(h.plate, h.row);
          const wantedMap = new Map(hits.map((h) => [h.plate, h.row]));

          // المطلوبة **المتأكّدة** بتطلع صف حتى لو ثقتها أقل من بوابة الظهور.
          if (!showProvisional(r) && wantedMap.size === 0) return;
          const g2 = gpsRef.current;
          const now2 = Date.now();
          for (const raw of String(r.plate || "").trim().split(/\s+/)) {
            const p2 = raw.replace(/\s+/g, "");
            if (!WELL.test(p2)) continue;
            // لو القراية مش عالية الثقة، بس المطلوبة منها اللي تطلع صف
            if (!showProvisional(r) && !wantedMap.has(p2)) continue;
            const prov: LiveRow = {
              id: "prov-" + p2 + "-" + r.tMs, plate: p2, tier: "yellow", conf: r.conf,
              mult: 1, provisional: true, atMs: r.tMs, shownAt: now2,
              latencyMs: latencyNow(r.tMs),
              // 🔔 مبدئية ⇒ **من غير «مطلوبة»** لحد ما تتأكّد (نافذتين)
              match: wantedMap.get(p2) ?? null,
              type: null, note: null,
              lat: g2?.lat ?? null, lng: g2?.lng ?? null, gpsAccuracy: g2?.accuracy ?? null,
              ...sessionStamp(areaRef.current, recorderRef.current),
              areaAuto: areaSource(areaRef.current, autoAreaRef.current) === "auto",
            agentId: agentRef.current,
            };
            setRows((prev0) => {
              /**
               * 🔔 التأكيد وصل ⇒ الصف اللي ظاهر بنفس اللوحة ياخد «مطلوبة» **على
               * طول** — حتى لو القراية دي مش هتتدمج فيه (`confirmedWins`).
               * اللي المندوب صحّح لوحته بإيده مايتلمسش.
               */
              const wRow = wantedMap.get(p2);
              const prev = wRow
                ? prev0.map((x) => (x.plate === p2 && !x.match && !x.edited?.plate ? { ...x, match: wRow } : x))
                : prev0;
              /**
               * 🔴 نفس القاعدة — المبدئي كمان بيطلع صف زيادة لو اتسابت. وكان
               * `{ ...prov }` بـid جديد (نفس علّة الدمج المؤكّد): الصف المبدئي
               * بيتبدّل بمبدئي أقوى في أول ثانيتين، وده وقت ما المندوب بيختار
               * النوع. الهوية بتفضل، وشغل المندوب بيغلب — `placeLiveRow`.
               */
              return placeLiveRow(prev, prov, fleetDistinct);
            });
            // 🔔 الصفّارة ضربت فوق لما اتأكّدت (نافذتين) — مش هنا من أول قراية.
          }
        },
        // 🎯 نخزّن بس — السؤال بيحصل لما لوحة تتأكّد (شوف `winBufRef`).
        onAudioWindow: (wav, tMs) => {
          winBufRef.current = pruneWindows([...winBufRef.current, { tMs, wav }], tMs);
        },
        onSpeech: (active: boolean) => setSpeaking(active),
        onLevel: (lvl: number) => setLevel(lvl),
        onSkip: (reason: string) => setSkips((m) => ({ ...m, [reason]: (m[reason] ?? 0) + 1 })),
        onReplay: () => setReplays((n) => n + 1),
        /**
         * 📞 **الميك اتاخد** — مكالمة (تليفون/واتساب) أو تطبيق تاني. المالك:
         * «المكالمة يبقى ليها الأولوية، وتلقائي المسجّل يفصل لو جه مكالمة».
         * اللوحات **كلها بتفضل** — الإيقاف مابيمسحش حاجة.
         */
        onMicLost: (reason) => stopRef.current(reason),
        onFatal: (reason: string) => {
          stopRef.current("fatal");
          setError(reason === "mic_denied"
            ? "الميكروفون مرفوض — اسمح للمتصفّح بالتسجيل وجرّب تاني."
            : "السيرفر فصل وسط التسجيل. دوس «أعِد الفحص» واتأكد إنه واصل.");
        },
      });
      if (!ctrl) {
        recReleaseRef.current?.(); recReleaseRef.current = null;
        setError("مش قادر يفتح الميكروفون — اسمح بالتسجيل وجرّب تاني.");
        return;
      }
      marks.push({ label: "المايك", at: Date.now() });
      engineRef.current = ctrl; clockRef.current = ctrl;
      setListening(true); setSeconds(0);
      // 📞 التطبيق راح للخلفية وهو بيفتح الميك (مكالمة جت في النص) ⇒ نقفل على طول
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        stopRef.current("background");
        return;
      }
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      // 📏 الرقم بيتعرض في التقرير — عشان المرة الجاية نعرف مين البطيء
      // بالظبط بدل ما نخمّن. شوف `lib/startupMarks.ts`.
      setStartMs(startupBreakdown(marks, pressedAt).text);
    } catch {
      if (!engineRef.current) { recReleaseRef.current?.(); recReleaseRef.current = null; }
      setError("مش قادر يشغّل المحرك — جرّب تاني.");
    }
    finally { setStarting(false); }
  }

  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }
  /**
   * ⏹️ إيقاف التسجيل — بإيد المندوب (`manual`) أو **لوحده** (مكالمة/خلفية/
   * الميك اتاخد) أو عطل (`fatal`).
   *
   * 🔴 **مابيمسحش ولا لوحة.** المالك (٢٣ سبتمبر ٢٠٢٦): «اللوحات اللي اتقالت
   * متتمسحش أبداً وتفضل محفوظة حتى لو المكالمة فصلت المايك… اللوحة متتمسحش
   * غير لو المندوب مسحها بإيده أو صدّرها». الصفوف في المسودّة (IndexedDB)
   * مع كل تغيير، والمحرك بيكمّل آخر النوافذ من ذاكرة الميك بعد ما يسيبه.
   */
  function stop(why: "manual" | "fatal" | AutoStopReason = "manual") {
    const ctrl = engineRef.current;
    engineRef.current = null; stopTimer(); setListening(false); setSpeaking(false); setLevel(0);
    const release = recReleaseRef.current;
    recReleaseRef.current = null;
    let done: Promise<void> = Promise.resolve();
    try { if (ctrl) done = ctrl.stop() ?? Promise.resolve(); } catch { /* ignore */ }
    if (why !== "manual" && why !== "fatal") setNotice(micLostNotice(why));
    void (async () => {
      try {
        // ⏳ آخر اللوحات توصل الأول (بحد أقصى — عطل مايأجّلش التحديث للأبد)
        await Promise.race([done.catch(() => {}), new Promise((r) => setTimeout(r, STOP_SETTLE_MAX_MS))]);
        /**
         * ⑩ب 📤 **التصدير التلقائي** — بطلب المالك: «لما تتفعّل، يحصل بعد ما
         * المندوب يقفل التسجيل: تيجيله رسالة سيتم تصدير عدد كذا ويظهر
         * اللوحات اللي متصدرتش عددها، هل تريد التصدير للسجلات؟».
         *
         * 🔴 **بيسأل، مش بيصدّر لوحده.** ده طلبه بالحرف، وكمان التصدير
         * بيمسح اللي اتصدّر — فحاجة بتمسح شغل المندوب لازم تعدّي على عينه.
         *
         * والعدد **في الرسالة** مش «تمام؟» مجرّدة — بيدوس وهو واقف في
         * الشارع، فلازم يعرف هو موافق على إيه.
         *
         * 📞 **بيسأل بس لو المندوب هو اللي قفل.** الوقف لوحده (مكالمة) مايسألش —
         * الرسالة كانت هتطلعله وهو في المكالمة. هيتسأل لما يقفل بإيده بعدين.
         * ⏳ وبيسأل **بعد** ما آخر لوحات توصل — فالعدد والتصدير بيشملوهم.
         */
        if (why !== "manual" || !autoExportRef.current) return;
        // المندوب بدأ تسجيل جديد وإحنا مستنيين ⇒ مانقاطعوش بسؤال
        if (engineRef.current) return;
        const msg = autoExportStopPrompt(rowsRef.current.length);
        if (!msg) return;
        // مهلة صغيرة عشان الواجهة تحدّث حالة «وقف» الأول بدل ما الحوار يتجمّد فوقها
        await new Promise((r) => setTimeout(r, 150));
        if (engineRef.current) return;
        if (confirm(msg)) await exportRowsRef.current();
      } finally {
        release?.();   // 🔄 دلوقتي بس التحديث التلقائي يقدر يشتغل
      }
    })();
  }
  /** آخر نسخة من `stop` — الكولباكس (المكالمة/الخلفية) بتتربط مرة واحدة. */
  const stopRef = useRef(stop);
  stopRef.current = stop;
  /** آخر نسخة من الصفوف والتصدير — الإيقاف بيستنى آخر لوحات قبل ما يسأل. */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const exportRowsRef = useRef(exportRows);
  exportRowsRef.current = exportRows;
  const autoExportRef = useRef(autoExport);
  autoExportRef.current = autoExport;

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
    // ✋ التصحيح بإيد المندوب بيغلب أي قراءة جاية من الإجماع لنفس الصف.
    setRows((prev) => prev.map((r) => (r.id === id
      ? { ...r, plate: p, match: hit, edited: { ...r.edited, plate: true } }
      : r)));
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
  /** 🔴 آخر مرة كل عربية صفّرت — الصفّارة مرة واحدة لكل عربية في الدقيقة. */
  const alertedRef = useRef<Map<string, number>>(new Map());
  /**
   * 🔔 نوافذ سمعت كل لوحة مطلوبة — «مطلوبة» والصفّارة **بعد التأكد** (نافذتين).
   * المالك (٢٥ سبتمبر ٢٠٢٦): «عايزه يظهر بعد التأكد من اللوحة، مش بعد القراية
   * المباشرة». شوف `confirmWanted` في `lib/wantedFastPath.ts`.
   */
  const wantedSeenRef = useRef<Map<string, number[]>>(new Map());
  /**
   * 🚚 عربيات الأسطول المؤكّدة في الجلسة دي (اتسمعت في نافذة مع جارتها في
   * التسلسل) — لمّ الصفوف مابيلمّهاش في بعض. جديد مع كل «ابدأ».
   */
  const fleetRef = useRef<FleetMemory>(new FleetMemory());
  const fleetDistinct = (a: string, b: string) => fleetRef.current.distinct(a, b);
  const alertWanted = useCallback((plate: string, row: Record<string, string> | null) => {
    /**
     * 🔴 **مرة واحدة لكل عربية** — الطابور بيمنع التكرار طول ما اللوحة فيه
     * بس، فلو المندوب داس «تم» والإجماع أكّد بعدها كانت بتصفّر تاني. ومع
     * الفحص على كل قراية كانت هتصفّر ٣-٤ مرات. شوف `shouldAlertNow`.
     */
    const key = normalizePlate(bankPlateToArabic(plate));
    const now = Date.now();
    if (!shouldAlertNow(alertedRef.current, key, now)) return;
    alertedRef.current.set(key, now);
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
    // ✋ علامة «المندوب عدّلها بإيده» — بتخلّي أي تأكيد جاي من الإجماع
    // مايكتبش فوق اختياره. شوف `lib/trialRowMerge.ts`.
    setRows((prev) => prev.map((r) => (r.id === id
      ? { ...r, [field]: v, edited: { ...r.edited, [field]: true } }
      : r)));
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
    // 🔄 التحديث التلقائي مايقطعش تصدير في النص
    const releaseExport = holdRef.current!.hold();
    try { await exportRowsInner(); } finally { releaseExport(); }
  }
  async function exportRowsInner() {
    const ready = exportableTrialRows(rows);
    const waiting = rows.length - ready.length;
    if (!ready.length) {
      setError("مفيش لوحة معاها موقع لسه — التصدير بيستنى الموقع (" + waiting + " مستنية).");
      return;
    }
    setBusy("ببعت للسجلات…");
    try {
      // 🪪 وسم السجل باسم المندوب — نفس اللي بتستعمله صفحة التشييك
      /**
       * ⚡ **أسرع زي «صوتي»** — المالك (٢٤ سبتمبر): «تصدير اللوحات بياخد وقت… كان في
       * صوتي أسرع». `getUser()` نداء للسيرفر عبر النت؛ `getSession()` قراية من الموبايل
       * بلا نت (نفس الحساب). للكل بعد تجربة المالك.
       */
      const uid = await supabase.auth.getSession()
        .then((r) => r.data.session?.user?.id ?? undefined).catch(() => undefined);
      /**
       * 🔴 **مفيش تصدير من غير حساب المندوب** — السجل اللي من غير `agentId` بيتعرض ويترفع
       * لأي مندوب يفتح بعد كده على نفس الموبايل (`getAllFieldCheckEntries`: «السجلات القديمة
       * من غير ختم»). فاللوحات بتفضل مكانها لحد ما الحساب يبان. للكل (المالك: «يلا ارفع»).
       */
      if (!uid) {
        setError("مش قادر أعرف حسابك دلوقتي — اقفل الصفحة وافتحها تاني، واللوحات فاضلة مكانها.");
        return;
      }
      const agentId = uid;
      // 🔒 المعرّف الفريد (حساب + وقت الظهور) للسوبر أدمن الأول — `trialEntryId`
      const entryId = (r: LiveRow) => trialEntryId(r, uid);
      // 🔴 حارس زيادة: لوحة مختومة بحساب تاني ماتتصدّرش بالحساب ده (السوبر أدمن الأول)
      const mineReady = ready.filter((r) => isMine(r, uid));
      const entries: FieldCheckEntry[] = mineReady.map((r) => {
        const vin = plateChassis.get(normalizePlate(bankPlateToArabic(r.plate)));
        // 📥 بيانات العربية من أعمدة ملفها هي (ملف تشييك إضافي بأسامي تانية) — للكل
        const d = carDetails(r.match, rowCheckCols(r.match, checkCols), vin);
        return {
          id: entryId(r),
          agentId,
          plate: r.plate,
          /**
           * 🔴 النوع بيتصدّر **بالحرف المختصر** زي صفحة التشييك بالحرف
           * (`typeToCode(...) || الأصل`) — عشان السجلات تبقى شكل واحد،
           * سواء المندوب اختاره من المنسدلة أو الصوت قاله كلمة كاملة.
           */
          /**
           * ⑦ **حقول الجلسة بتتصدّر مع كل لوحة** — المالك: «كل حاجة في
           * المربّع تتصدّر للسجلات زي ما هي مينقصش منها». والفاضي
           * مابيتكتبش (مغطّى باختبارات في `buildTrialFieldRow`).
           */
          row: buildTrialFieldRow(
            { ...r, type: r.type ? (typeToCode(r.type) || r.type) : null }, d, null,
            { area: r.area, recorder: r.recorder }),
          // 🔴 زي «صوتي» بالحرف — وإلا اللوحة **مابتدخلش النسخة الاحتياطية**
          // وبتظهر على الخريطة بأيقونة يدوي. شوف `TRIAL_EXPORT_METHOD`.
          method: TRIAL_EXPORT_METHOD,
          lat: r.lat ?? undefined,
          lng: r.lng ?? undefined,
          mapsLink: r.lat != null && r.lng != null ? toMapsLink(r.lat, r.lng) : undefined,
          checkedAt: new Date(r.shownAt).toISOString(),
        };
      });
      const settled = await Promise.allSettled(entries.map((e) => saveFieldCheckEntry(e)));
      const okIds = savedIds(entries.map((e) => e.id), settled);
      if (!okIds.length) {
        // 🔎 السبب في آخر الرسالة — من غيره صورة الشاشة ماكانتش بتقول حاجة
        const why = firstFailureReason(settled);
        setError("مانفعش يتحفظ ولا سجل — جرّب تاني." + (why ? " (السبب: " + why + ")" : ""));
        return;
      }

      // 🧹 اللي اتكتب بس يتشال — الباقي يفضل قدام المندوب
      const savedRowIds = new Set(mineReady.filter((r) => okIds.includes(entryId(r))).map((r) => r.id));
      setRows((prev) => prev.filter((r) => !savedRowIds.has(r.id)));

      // ☁️ نحاول نوصّلها السيرفر فوراً — فشلها مايأثرش، هتتزامن بعدين
      /**
       * ⚡ زي «صوتي»: الرسالة **على طول** بعد الحفظ في الموبايل، والرفع للسيرفر بيكمل في
       * الخلفية (كان المندوب بيستنى الرفع يخلص قبل ما يشوف «تم»). الرفع بيبدأ **قبل**
       * الرسالة فمابيتأخرش. ولو فشل: هتتزامن بعدين زي ما هي.
       */
      if (uid) {
        void import("@/lib/syncFieldCheck")
          .then(({ pushPendingFieldChecks }) => pushPendingFieldChecks(uid))
          .catch(() => { /* المزامنة بتتم بعدين */ });
      }

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
    L.push("اتحجبت بثقة ≥٨٦٪ وماظهرتش (غالباً لوحة ضاعت): " + lostToGuard.length
      + (lostToGuard.length ? "  [" + lostToGuard.join(" ") + "]" : ""));
    L.push("نص فيه أرقام والشكل مش لوحة: " + malformed.length);
    for (const m of malformed) L.push("   • «" + m.rawText + "» → «" + m.plate + "»");
    L.push("");
    L.push("🔁 نوافذ فايتة اتبعتت تاني بعد وقعة الشبكة: " + replays);
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

  /**
   * ④ **«متصل» اتشالت** بطلب المالك — الدايرة الخضرا بتقول اللي هي بتقوله
   * وبلا زحمة كلام. والتفصيل (اسم الموديل وحالة التوكن) في السطر اللي تحت.
   */
  const statusLabel = probing ? "بفحص…" : probe?.ok ? "🟢" : probe ? "🔴 مش واصل" : "بفحص…";
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  const mmss = pad(seconds / 60) + ":" + pad(seconds % 60);
  const hits = rows.filter((r) => r.match).length;
  /**
   * العمود بيبان لو **أي لوحة** عندها ختم — مش لو المربّع مكتوب فيه.
   * لو المندوب فضّى المربّع، لوحاته القديمة لسه عندها شارعها ولازم يبان.
   */
  const showArea = rows.some((r) => !!r.area);
  const showRecorder = rows.some((r) => !!r.recorder);
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
  /**
   * 🔴 **الضياع اللي `missed` مابيشوفوش** — لوحة كل قرايتها اتحجبت.
   * جلسة المالك (٢٣ سبتمبر · ١٠٠ لوحة): `اوه1552` ضاعت والتقرير قال «صفر».
   * شوف `blockedNotShown` في `lib/trialTwin.ts`.
   */
  const lostToGuard = blockedNotShown(reads, rows);
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

  /**
   * 🧹📤 صف «تصدير · إكسيل · مسح». المالك (٢٤ سبتمبر): «عايز أنقل زر تصدير اللوحات
   * أخليه فوق المربع بتاع اللوحات، علشان المندوب بيسكرول كتير على ما بينزل للزر».
   * فوق الجدول للكل — المالك جرّبه كسوبر أدمن وقال «انشر للمناديب».
   */
  const renderActions = (top: boolean) => rows.length > 0 && (
    <div className={top ? "mb-3 flex gap-1.5" : "mt-3 flex gap-1.5"}>
      <button onClick={() => void exportRows()} disabled={!!busy}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50">
        {busy ? <><Loader2 size={14} className="animate-spin" /> {busy}</> : <><Download size={14} /> تصدير للسجلات</>}
      </button>
      {/*
        * ⑨ 📄 **مشاركة إكسيل** — بطلب المالك بدل «نسخ»: «يشارك التشييك
        * اللي في المربّع في ملف إكسيل». الأعمدة هي اللي المندوب شايفها
        * بالظبط + حقول الجلسة (`trialExcelRows`، مغطّى باختبارات).
        */}
      <button onClick={async () => {
        if (!rows.length) return;
        setBusy("ببعت الإكسيل…");
        try {
          const { buildExcelBlob, shareExcelBlob } = await import("@/lib/excel");
          const data = trialExcelRows(rows);
          const blob = buildExcelBlob(data, "اللوحات");
          const stamp = new Date().toISOString().slice(0, 10);
          await shareExcelBlob(blob, "لوحات-" + stamp + ".xlsx", voiceProNames(isSuper).share);
          setCopied(true); setTimeout(() => setCopied(false), 1500);
        } catch (e) {
          setError("مانفعش يتشارك الإكسيل: " + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(null); }
      }} disabled={!!busy}
        className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">
        {copied ? <><Check size={13} className="text-emerald-600" /> اتبعت</> : <><FileSpreadsheet size={13} /> إكسيل</>}
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
  );

  return (
    <div dir="rtl" className="-mx-4 -mt-4 min-h-screen bg-white px-4 pb-10 pt-4 text-slate-900">
      {/* سطر «الموديل الجديد — تجربة…» اللي تحت العنوان اتشال بطلب المالك (٢٣ سبتمبر ٢٠٢٦). */}
      {/* 🏷️ «Voice PRO» — للكل (`lib/voiceProName.ts`) */}
      <h1 className="text-2xl font-black tracking-tight">{voiceProNames(isSuper).title}</h1>

      {/*
        * ── الحالة: الشيت · الموديل · الموقع ──
        * ③ **مربّع «النوع» اتشال** بطلب المالك: «شيل المربّع اللي فيه النوع
        * مفيش رد ده مالوش لازمة». كوهير مقفول بقراره، فالمربّع كان بيقول
        * «🔴 مافيش رد» على طول ومالوش أي فايدة للمندوب.
        */}
      <section className="mt-4 grid grid-cols-2 gap-2">
        <Stat icon={<FileSpreadsheet size={13} />} ok={checkIndex.size > 0}
          title={checkIndex.size ? checkIndex.size.toLocaleString("ar-EG") + " لوحة" : "مافيش شيت"}
          sub={checkIndex.size ? (checkName || "") : "ارفعه من تحت"} />
        <Stat icon={<Cpu size={13} />} ok={!!probe?.ok} title={statusLabel} sub={modelBoxDetail(probe?.msg, isSuper)} />
        {/*
          * ② 🔴 **المربّع كله بيتلوّن بدقّة الشبكة** — بطلب المالك:
          * «مربّع حالة الجي بي إس يتغيّر لونه كله على حسب دقّة الشبكة،
          * أخضر دقّة ممتازة برتقالي متوسطة أحمر ضعيفة، ويبقى فيه علامة
          * تحديث يدوي وبرضه يحدّث تلقائي زي اللي في صفحة التشييك».
          *
          * اللون على **المربّع كله** مش أيقونة صغيرة: المندوب بيبص بطرف
          * عينه وهو بيسوق، فالفرق لازم يبان من غير قراية.
          */}
        <GpsBox level={gpsLevel} accuracy={gps?.accuracy ?? null} busy={gpsBusy} onRefresh={() => void refreshGps()} />
      </section>

      {/*
        * ① 📥 **مربّع رفع شيت التشييك — نفس سلوت «التشييك» بالحرف.**
        *
        * المالك (٢٣ سبتمبر ٢٠٢٦): «هنظهر المربّع اللي بيترفع فيه شيت
        * التشييك في صفحة الجديد كمان… واللي يترفع سواء هنا أو هنا تظهر في
        * التانية، يعني لو المندوب حدّث التشييك يتحدّث تلقائي ويشتغل تلقائي
        * في الصفحتين».
        *
        * السلوت واحد (`local:check`) فالملف مشترك أصلاً؛ الإشارة في
        * `lib/checkSheetSync.ts` هي اللي بتخلّي الصفحة التانية تعيد قراءته.
        */}
      <section className="mt-3">
        <FileUploadBox
          title="ملف التشييك"
          hint="اللي فيه هيطلع بصفّارة"
          parsedFile={checkFile}
          parsedRowCount={checkTable?.rows.length ?? null}
          plateCount={checkIndex.size}
          onParsed={onCheckParsed}
          onClear={onCheckClear}
          showReplaceButtons
          sky
        />
      </section>

      {/*
        * ⑤ **«أعِد الفحص» و«تغيير العنوان» اتشالوا من عين المندوب.**
        *
        * المالك: «شيل كلمتين أعد الفحص وتغيير العنوان». والمربّع اللي
        * جوّاه فيه **عنوان السيرفر والتوكن** — دول مالهمش لازمة عند
        * المندوب أصلاً، والتوكن بقى بيتجاب من الداتابيز لوحده.
        * سايبينهم **للسوبر أدمن** عشان يفضل عنده طريق طوارئ بلا نشر.
        */}
      <div className={isSuper ? "mt-2 flex gap-1.5" : "hidden"}>
        <button onClick={() => { void probeModel(); loadCheck(); }} disabled={probing || listening}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
          {probing ? <><Loader2 size={14} className="animate-spin" /> بفحص…</> : <><RefreshCw size={14} /> أعِد الفحص</>}
        </button>
        <button onClick={() => setShowAdvanced((v) => !v)} disabled={listening}
          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 disabled:opacity-50">
          {showAdvanced ? "إخفاء" : "تغيير العنوان"}
        </button>
      </div>
      <div className={showAdvanced && isSuper ? "mt-2 flex flex-col gap-1.5" : "hidden"}>
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
        {/*
          * 🧹 **مسح الإعداد** — بيرجّع الصفحة للعنوان المثبّت وتوكن الداتابيز.
          *
          * لازم لأن الإعداد المحفوظ بيعيش في تخزين الموبايل: المالك كان حافظ
          * التوكن القديم، وبعد ما غيّرناه فضلت كل نافذة تترفض بـ401 **وولا
          * لوحة تطلع** — والصفحة كانت بتقول «متصل ✓» لأن /health مابيطلبش توكن.
          */}
        <button onClick={async () => {
          try { clearJudgeEndpoint(); } catch { /* ignore */ }
          setSaved(false); setProbe(null); setError(null);
          const dbToken = await fetchTrialToken();
          const ep = resolveTrialEndpoint(null, dbToken);
          setModelUrl(ep.base); setModelToken(ep.token);
          if (!ep.token) setError("مافيش توكن في الداتابيز — شغّل docs/sql/trial-model-token.sql.");
          else void probeModel();
        }} className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 py-2 text-xs font-bold text-amber-800">
          🧹 مسح الإعداد وارجع للمثبّت
        </button>
      </div>

      {/* ── التسجيل + مؤشّر الصوت ── */}
      <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {/*
          * 🔴 **الزرّ بيرد فوراً** — بلاغ المالك «بيأخر على ما بيبدأ».
          * فتح المايك بياخد وقته مهما عملنا (إذن + جهاز)، فاللي بيفرق إن
          * المندوب يشوف إن ضغطته **وصلت** بدل ما الزرّ يفضل شكله واقف
          * فيدوس تاني.
          */}
        <button onClick={listening ? () => stop("manual") : () => void start()} disabled={starting}
          className={"flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-black text-white shadow-sm transition disabled:opacity-80 "
            + (listening ? "bg-rose-600" : "bg-indigo-600")}>
          {starting
            ? <><Loader2 size={20} className="animate-spin" /> بيجهّز المايك…</>
            : listening ? <><Square size={20} /> إيقاف التسجيل</> : <><Mic size={20} /> ابدأ التسجيل</>}
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
        {/* 📞 التسجيل وقف لوحده (مكالمة/خلفية) — واللوحات محفوظة */}
        {notice && !listening && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5">
            <p className="flex-1 text-[11px] font-bold leading-relaxed text-sky-900">{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="إخفاء"
              className="shrink-0 text-sky-700"><X size={14} /></button>
          </div>
        )}
      </section>

      {/*
        * ⑦ 🏘️ **الحي والشارع واسم المسجّل** — تحت زرّ التسجيل وفوق الجدول.
        *
        * المالك (٢٣ سبتمبر ٢٠٢٦): «المندوب لما يكتب فيهم يتضاف عمود جديد
        * في المربّع بتاع اللوحات… ولو شالهم من المربّعات ميتكتبش حاجة.
        * وكل مربّع يتكتب فيه يبقى ليه عمود لوحده».
        *
        * ⇒ العمود **مايظهرش غير لما يتكتب فيه**، وبيتصدّر مع كل لوحة
        *   (`buildTrialFieldRow` — مغطّى باختبارات).
        */}
      <section className="mt-3 grid grid-cols-2 gap-2">
        <SessionField label="الحي واسم الشارع" value={areaName} onChange={setAreaName}
          placeholder={autoArea ? "📍 تلقائي من الـGPS (أو اكتب)" : "مثال: النسيم - شارع ٣٠"} />
        <SessionField label="اسم المسجّل" value={recorderName} onChange={setRecorderName}
          placeholder="اسم المندوب" />
      </section>
      {/*
        * 🏘️ **«الحي تلقائي»** — مفتوح: المربع فاضي ⇒ «الشارع - الحي» من الـGPS لكل
        * لوحة لحظة ما اتقالت؛ المندوب كاتب ⇒ اللي كتبه. «اسم المسجّل» مالوش دعوة.
        */}
      <div className="mt-2 grid">
        <ToggleButton on={autoArea} onLabel="🏘️ الحي تلقائي من الـGPS" offLabel="🏘️ الحي تلقائي — مقفول"
          tone={autoArea ? "on" : "off"}
          onClick={() => setAutoArea((v) => !v)} />
      </div>

      {/*
        * ── اللوحات ──
        * ⑭ **شكلين**: العادي، و«الفخم» اللي المالك طلبه — خلفية غامقة
        * متدرّجة وحدود ذهبية وخط أوسع. الزرّ جنب العنوان بيبدّل بينهم،
        * وبيغيّر **خروج اللوحات** كمان (الصفوف بتبقى أوسع وأوضح).
        */}
      <section className={"mt-3 rounded-2xl p-3 shadow-sm transition "
        + (fancy
          ? "border-2 border-amber-300/70 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-slate-100 shadow-lg shadow-amber-900/10"
          : "border border-slate-200 bg-white")}>
        <div className="mb-2 flex items-center gap-2">
          <h2 className={"text-sm font-black " + (fancy ? "tracking-widest" : "")}>اللوحات</h2>
          {/*
            * ⑭ 🎨 **زرّ الشكل** — جنب كلمة «اللوحات» بطلب المالك:
            * «ضيف في المربّع من فوق شكل تاني مختلف تماماً وعصري وبخط مختلف،
            * يبقى زي ديزاين للمربّع يكون فخم، ولما المندوب يدوس عليه وعايز
            * يغيّر شكل ديزاين المربّع وخروج اللوحات يظهر معاه».
            */}
          <button onClick={() => setFancy((v) => !v)} title="غيّر شكل المربّع"
            className={"rounded-full border px-2 py-0.5 text-[10px] font-black transition "
              + (fancy
                ? "border-amber-400/60 bg-gradient-to-l from-amber-200 to-amber-50 text-amber-900"
                : "border-slate-200 bg-white text-slate-500")}>
            ✨ الشكل
          </button>
          <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold "
            + (fancy ? "bg-amber-400/15 text-amber-200" : "bg-slate-100 text-slate-600")}>{rows.length}</span>
          {hits > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700">
              <BellRing size={11} /> مطلوبة {hits}
            </span>
          )}
          {/* ⑫ ➖ ➕ — والبنش بالصباعين شغّال كمان (touch-pinch-zoom) */}
          {rows.length > 0 && (
            <div className="mr-auto flex items-center gap-0.5">
              <button onClick={() => setZoom((z) => stepZoom(z, -1))} disabled={zoom <= ZOOM_MIN}
                title="تصغير" className="rounded-lg border border-slate-200 px-2 py-0.5 text-sm font-black text-slate-600 disabled:opacity-40">−</button>
              <span className="w-9 text-center font-mono text-[10px] tabular-nums text-slate-400">
                {Math.round(zoom * 100)}%
              </span>
              <button onClick={() => setZoom((z) => stepZoom(z, +1))} disabled={zoom >= ZOOM_MAX}
                title="تكبير" className="rounded-lg border border-slate-200 px-2 py-0.5 text-sm font-black text-slate-600 disabled:opacity-40">+</button>
            </div>
          )}
        </div>

        {renderActions(true)}

        {rows.length === 0 ? (
          <p className={"py-8 text-center text-xs " + (fancy ? "text-slate-400" : "text-slate-400")}>
            {listening ? "قول لوحة…" : "مافيش لوحات لسه — دوس ابدأ التسجيل."}
          </p>
        ) : (
          /* 📊 جدول زي الإكسل — كل عمود فيه حاجة واحدة، بطلب المالك.
             بيتمرّر أفقياً على الموبايل بدل ما الأعمدة تتلخبط فوق بعض. */
          /*
             * ⑫ **الزوم جوّه المربّع** — `touch-pinch-zoom` بيدّي البنش
             * بالصباعين، و`scale` مع `zoomedMinWidth` بيدّي الزرّين.
             *
             * 🔴 **وليه العرض الأدنى بيتكبّر مع الزوم**: `scale` بيكبّر
             * المحتوى **من غير** ما يكبّر المساحة اللي بيتمرّر فيها، فآخر
             * عمود بيتقص ومافيش تمرير يوصّله. تكبير العرض بنفس النسبة هو
             * اللي بيحقّق شرط المالك «ميتاكلش منه حاجة».
             * (`origin-top-right` عشان الجدول عربي بيبدأ من اليمين.)
             */
          <div className="-mx-1 overflow-x-auto" style={{ touchAction: "pinch-zoom pan-x pan-y" }}>
            {/*
              * ⑬ **فواصل بين كل عمود والتاني** بطلب المالك — `divide-x` على
              * الصف بيرسم خط بين كل خليتين. والجدول نفسه محاط بحدود.
              */}
            <table
              className={"w-full border-collapse origin-top-right transition-[transform] "
                + (fancy
                  ? "text-[12px] font-[system-ui] tracking-wide"
                  : "text-[11px]")}
              style={{
                minWidth: zoomedMinWidth(640, zoom) + "px",
                transform: "scale(" + clampZoom(zoom) + ")",
                width: (100 / clampZoom(zoom)) + "%",
              }}>
              <thead>
                <tr className={"divide-x border-b-2 text-[10px] "
                  + (fancy
                    ? "divide-slate-700 border-amber-400/50 bg-slate-950/40 text-amber-300/80"
                    : "divide-slate-200 border-slate-300 bg-slate-50 text-slate-500")}>
                  {/* ⑥ عمود صغير للمسح — على قد العلامة بالظبط */}
                  <Th className="w-7">{""}</Th>
                  <Th className="w-8">#</Th>
                  <Th className="w-32">رقم اللوحة</Th>
                  {/*
                    * المالك: «العمود بتاعهم صغير». كانوا w-20/w-24 (٨٠/٩٦px)
                    * وجوّاهم القلم + سهم المنسدلة ⇒ النص الفعلي ~٤٥px
                    * فـ«و (ونيت)» و«تحت تنده» كانوا بيتقصّوا.
                    */}
                  <Th className="min-w-[7.5rem]">النوع</Th>
                  <Th className="min-w-[8.5rem]">الملاحظة</Th>
                  {showArea && <Th className="w-28">اسم الحي - الشارع</Th>}
                  {showRecorder && <Th className="w-24">اسم المسجّل</Th>}
                  <Th className="w-16">مطلوبة</Th>
                  <Th className="w-20">الوقت</Th>
                  <Th className="w-16">الموقع</Th>
                  {/*
                    * ⑧ **الثقة والحالة وظهرت بعد — للسوبر أدمن بس.**
                    * المالك: «شيلهم… أخفيهم بس خليهم لينا احنا علشان لو
                    * عملنا اختبار بعد كده ونعرف منه لو فيه تأخير أو أي
                    * غلطات. المهم المندوب ميشوفهمش».
                    * ⇒ **إخفاء مش حذف**: البيانات لسه متحسوبة وفي التقرير.
                    */}
                  {isSuper && <><Th className="w-14">الثقة</Th>
                  <Th className="w-16">الحالة</Th>
                  <Th className="w-16">ظهرت بعد</Th></>}
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((r, i) => [
                  <tr key={r.id}
                    className={"divide-x border-b "
                      /* ⑭ الشكل الفخم بيغيّر **خروج اللوحات** كمان — صفوف
                         أوسع وحدود أهدى وخلفية غامقة، زي ما المالك طلب. */
                      + (fancy ? "divide-slate-800 border-slate-700/70 [&>td]:py-2.5 " : "divide-slate-100 border-slate-200 ")
                      + (r.match ? (fancy ? "bg-rose-950/40 " : "bg-rose-50 ") : "")
                      /**
                       * 🔴 كان `opacity-60` — والمالك قال «بتظهر مطفية
                       * وبتقعد فترة طويلة». اللوحة **موجودة وصحيحة**
                       * وقتها، بس شكلها كان بيقول العكس فبيستنى الغامق.
                       * بقت واضحة بخلفية صفرا خفيفة تقول «بتتأكّد» —
                       * بيبان فوراً وبرضه متميّز عن المؤكّد.
                       */
                      + (r.provisional ? "bg-amber-50/70" : "")}>
                    {/*
                      * ⑥ 🗑️ **مسح اللوحة الواحدة** — بطلب المالك: «عمود صغير
                      * على قد علامة مسح لكل لوحة يقدر المندوب يمسح بيها
                      * اللوحة لو لقى فيها غلط».
                      * بلا سؤال تأكيد: صف واحد غلط، والسؤال على كل صف بيوجع.
                      */}
                    <td className="px-0.5 py-1.5 align-top">
                      <button type="button" title="امسح اللوحة دي"
                        onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                        className="rounded-md p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600">
                        <X size={12} />
                      </button>
                    </td>
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
                          <span dir="ltr" className={"font-mono font-black tabular-nums "
                            /* ⑭ في الشكل الفخم اللوحة أكبر وحروفها أوسع */
                            + (fancy ? "text-lg tracking-[0.25em] " : "text-base tracking-[0.15em] ")
                            + (fancy
                              ? (r.match ? "text-rose-300" : r.provisional ? "text-amber-300" : "text-amber-100")
                              : (r.match ? "text-rose-700" : r.provisional ? "text-amber-700" : "text-indigo-700"))}>{r.plate}</span>
                          <Pencil size={9} className="shrink-0 text-slate-300 group-hover:text-indigo-600" />
                        </button>
                      )}
                    </Td>
                    {/*
                      * 🏷️ النوع والملاحظة: نفس منسدلة صفحة التشييك بالحرف
                      * (`VehicleTypeSelect`) — نفس الخيارات بالظبط.
                      *
                      * ✏️ **والقلم جنبها بطلب المالك** (٢٣ سبتمبر ٢٠٢٦): سيرفر
                      * النوع (كوهير) مقفول دلوقتي فالخانتين بيوصلوا **فاضيين**،
                      * والمنسدلة الفاضية شكلها «مافيش حاجة» مش «اكتب هنا».
                      * القلم بيقول للمندوب إنها بتتعدّل بإيده.
                      */}
                    <td className="min-w-[7.5rem] px-1 py-1.5 align-top">
                      <div className="flex items-center gap-0.5">
                        <VehicleTypeSelect value={r.type ?? ""}
                          onChange={(code) => saveCell(r.id, "type", code)}
                          className={"min-w-[6.25rem] w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-[12px] outline-none "
                            + (r.type ? "font-bold text-slate-900" : "text-slate-400")} />
                        <Pencil size={9} className="shrink-0 text-slate-300" />
                      </div>
                    </td>
                    <td className="min-w-[8.5rem] px-1 py-1.5 align-top">
                      <div className="flex items-center gap-0.5">
                        <NoteSelect value={r.note ?? ""} onChange={(v) => saveCell(r.id, "note", v)} />
                        <Pencil size={9} className="shrink-0 text-slate-300" />
                      </div>
                    </td>
                    {/* ⑦ نفس القيمة على كل الصفوف — المندوب كتبها مرة فوق */}
                    {/* 🔴 ختم **الصف** — مش اللي في المربّع دلوقتي */}
                    {showArea && <Td className="text-slate-700">{r.area ?? ""}</Td>}
                    {showRecorder && <Td className="text-slate-700">{r.recorder ?? ""}</Td>}
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
                    {/* ⑧ إخفاء عن المندوب — البيانات لسه محسوبة ومتاحة في التقرير */}
                    {isSuper && <>
                    <Td className="font-mono tabular-nums text-slate-500">{Math.round(r.conf * 100)}%</Td>
                    <Td className={r.provisional ? "text-amber-600" : r.tier === "green" ? "text-emerald-600" : "text-amber-500"}>
                      {r.provisional
                        ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> مبدئية</span>
                        : r.tier === "green" ? "مؤكّدة" : "محتاجة نظرة"}
                    </Td>
                    <Td className="font-mono tabular-nums text-slate-400">{(r.latencyMs / 1000).toFixed(1)}ث</Td>
                    </>}
                  </tr>,
                  /* 🚨 تفاصيل المطلوبة تحت الصف — نوع/شركة/شاص/شهادة */
                  r.match ? (
                    <tr key={r.id + "-d"} className="border-b border-rose-100 bg-rose-50">
                      <td colSpan={8 + (showArea ? 1 : 0) + (showRecorder ? 1 : 0) + (isSuper ? 3 : 0)} className="px-2 pb-2">
                        <MatchDetails row={r} cols={rowCheckCols(r.match, checkCols)}
                          vin={plateChassis.get(normalizePlate(bankPlateToArabic(r.plate)))} />
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        )}

        {/*
          * ⑩ **زرّين**: قفل الموقع · التصدير التلقائي.
          * الاتنين بيسألوا قبل ما يتفعّلوا. إلغاؤهم رجوع للوضع الطبيعي
          * فمالوش خطر ومابيسألش.
          */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <ToggleButton on={noGps} onLabel="🚫 الموقع مقفول" offLabel="📍 الموقع شغّال"
            tone={noGps ? "warn" : "ok"}
            onClick={() => {
              if (!noGps) { if (!confirm(noGpsWarning())) return; setNoGps(true); }
              else setNoGps(false);
            }} />
          <ToggleButton on={autoExport} onLabel="⚡ تصدير تلقائي" offLabel="✋ تصدير يدوي"
            tone={autoExport ? "on" : "off"}
            onClick={() => {
              if (!autoExport) { if (!confirm(autoExportPrompt())) return; setAutoExport(true); }
              else setAutoExport(false);
            }} />
        </div>

      </section>

      {/*
        * ══ 📋 التقرير الشامل — **للسوبر أدمن بس** ══
        * المالك (٢٣ سبتمبر ٢٠٢٦): «عايزك متظهرش التقرير الشامل ده لحد
        * غيري علشان لو هنجرّب حاجة — اقفله وشيله من صفحة المناديب والأدمن،
        * بس السوبر أدمن اللي يظهرله».
        */}
      <section className={isSuper
        ? "mt-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3"
        : "hidden"}>
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
              <Kv k="⏱️ بدء التسجيل (من الضغطة للمايك)" v={startMs ?? "—"} />
              <Kv k="وسيط زمن الموديل نفسه" v={medModel != null ? Math.round(medModel) + " مللي" : "—"} />
              <Kv k="وسيط الرحلة كاملة (شبكة + موديل)" v={medWall != null ? Math.round(medWall) + " مللي" : "—"} />
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                التأخير بيتحسب <b>من آخر كلامك</b> لحد ما اللوحة ظهرت = انتظار النافذة الجاية
                (٠–١.٥ث) + الشبكة + الموديل. لو الرحلة أكبر من الموديل بكتير ⇒ الشبكة هي السبب.
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
              {/* 🔴 الضياع اللي كان بيعدّي في صمت — كل قرايات اللوحة اتحجبت */}
              <Kv k="اتحجبت بثقة ≥٨٦٪ وماظهرتش (غالباً لوحة ضاعت)" v={String(lostToGuard.length)}
                tone={lostToGuard.length ? "bad" : undefined} />
              {lostToGuard.length > 0 && (
                <p dir="ltr" className="mt-1 font-mono text-[10px] text-rose-600">{lostToGuard.slice(0, 12).join(" · ")}</p>
              )}
            </Block>

            <Block title="🔁 الاسترجاع بعد وقعة الشبكة">
              <Kv k="نوافذ فايتة اتبعتت تاني" v={String(replays)} />
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                لما الشبكة تقع، النوافذ اللي ماوصلتش بتتحفظ، وأول ما ترجع بتتبعت تاني
                من ذاكرة الموبايل (آخر ٩٠ ثانية) — فاللوحات ماتضيعش.
              </p>
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
/**
 * ② 📍 **مربّع حالة الموقع** — لونه كله بيقول الدقّة.
 *   🟢 ≤١٥م ممتازة · 🟠 ≤٣٥م متوسطة · 🔴 أوحش (أو مافيش إذن)
 * وفيه زرّ تحديث يدوي جنب الحالة. الحدود المستعملة هي `gpsAccuracyLevel`
 * نفسها اللي صفحة التشييك ماشية عليها — مش أرقام جديدة.
 */
/** ⑩ زرّ تشغيل/إيقاف — الحالة باينة من اللون والكلمة مع بعض. */
function ToggleButton({ on, onLabel, offLabel, tone, onClick }: {
  on: boolean; onLabel: string; offLabel: string;
  tone: "ok" | "warn" | "on" | "off"; onClick: () => void;
}) {
  const skin = tone === "warn" ? "border-rose-300 bg-rose-50 text-rose-800"
    : tone === "on" ? "border-indigo-300 bg-indigo-50 text-indigo-800"
    : tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-slate-200 bg-white text-slate-600";
  return (
    <button onClick={onClick}
      className={"rounded-xl border-2 py-2 text-[11px] font-black transition " + skin}>
      {on ? onLabel : offLabel}
    </button>
  );
}

/** ⑦ مربّع حقل جلسة — عنوان صغير فوق وخانة كتابة، بحدود واضحة (⑬). */
function GpsBox({ level, accuracy, busy, onRefresh }: {
  level: "good" | "ok" | "poor" | null;
  accuracy: number | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const skin = level === "good"
    ? { box: "border-emerald-300 bg-emerald-50", text: "text-emerald-900", sub: "text-emerald-700", dot: "🟢", label: "دقّة ممتازة" }
    : level === "ok"
    ? { box: "border-orange-300 bg-orange-50", text: "text-orange-900", sub: "text-orange-700", dot: "🟠", label: "دقّة متوسطة" }
    : level === "poor"
    ? { box: "border-rose-300 bg-rose-50", text: "text-rose-900", sub: "text-rose-700", dot: "🔴", label: "دقّة ضعيفة" }
    : { box: "border-slate-200 bg-slate-50", text: "text-slate-700", sub: "text-slate-500", dot: "⚪", label: "مافيش موقع" };

  return (
    <div className={"flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 " + skin.box}>
      <MapPin size={15} className={"shrink-0 " + skin.text} />
      <div className="min-w-0 flex-1">
        <p className={"truncate text-[11px] font-black " + skin.text}>{skin.dot} {skin.label}</p>
        <p className={"truncate text-[10px] " + skin.sub}>
          {accuracy != null ? "±" + Math.round(accuracy) + " متر" : "اسمح بالموقع"}
        </p>
      </div>
      <button onClick={onRefresh} disabled={busy} title="حدّث الموقع دلوقتي"
        className={"shrink-0 rounded-lg border bg-white/70 p-1.5 disabled:opacity-50 " + skin.box}>
        <RefreshCw size={14} className={(busy ? "animate-spin " : "") + skin.text} />
      </button>
    </div>
  );
}

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
        className="min-w-[7.25rem] w-full rounded-md border border-indigo-400 bg-white px-1 py-1 text-[12px] outline-none" />
    );
  }
  return (
    <select value={value} dir="rtl"
      onChange={(e) => { if (e.target.value === "__free") setFree(true); else onChange(e.target.value); }}
      className={"min-w-[7.25rem] w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-[12px] outline-none "
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
  busy_window: "الموديل كان مشغول (نافذة زاحفة — بتتسجّل وتتبعت تاني)",
  yield_to_utterance: "اتنازلت لقراءة نطق مستنية (عادي)",
  utterance_queue_full: "الطابور اتملا — بتتكلّم أسرع من رد السيرفر",
  request_failed: "🔴 الطلب اتبعت وفشل (بيتسجّل ويتبعت تاني لما الشبكة ترجع)",
  replay_failed: "🔁 إعادة إرسال فشلت (الشبكة لسه مش مستقرّة — هتتعاد)",
};

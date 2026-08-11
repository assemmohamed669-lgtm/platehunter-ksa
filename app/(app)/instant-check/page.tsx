"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Camera, Images, Type, Mic, ChevronDown, X, CheckCircle2, XCircle, Loader2, Trash2, MapPin, AlertTriangle, Download, Share2, Copy, Check, ZoomIn, ZoomOut, CheckSquare, Square, ClipboardCheck, Search, History, Pencil, Navigation, RefreshCw, Wifi, WifiOff, Pause, Play, Barcode } from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import { saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord, type FieldCheckEntry, saveFieldCheckEntry, getAllFieldCheckEntries, deleteFieldCheckEntry } from "@/lib/idb";
import { type ExcelTable, buildExcelBlob, openExcelBlob, shareExcelBlob, readAllSheets } from "@/lib/excel";
import { detectPlateColumn, normalizePlate, bankPlateToArabic, parsePlateFromTranscript, pickBestHypothesis, similarityPercent, isStandardPlate, EN_TO_AR, mapEgyptianSpeech, extractVehicleType, deserializeLetterConfusions, deserializeWordBlend, plateNeedsReview, isValidManualPlate, type LetterConfusionMap, type WordBlendMap } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import { detectChassisColumn, buildChassisIndex, matchChassis, type ChassisMatch } from "@/lib/chassis";
import { getChassisRecords, addChassisRecord, deleteChassisRecord, updateChassisRecord, type ChassisRecord } from "@/lib/chassisRecords";
import { toMapsLink, gpsService, haversineKm, gpsAccuracyLevel, gpsCellCoords, type GpsCoords } from "@/lib/gps";
import { reverseGeocode } from "@/lib/geocoding";
import { pushBackHandler } from "@/lib/backStack";
import { parseSessionChunk, newSessionState, type SessionState } from "@/lib/sessionParser";
import { getActiveDeepgramKey, getDeepgramKey, PLATE_LETTER_KEYTERMS } from "@/lib/deepgramKey";
import { getVoiceEngine, getSpeechmaticsKey } from "@/lib/voiceKeys";
import { startSpeechmatics, type SpeechmaticsHandle } from "@/lib/speechmaticsRT";
import { createSpeechGate, type SpeechGate } from "@/lib/audioGate";
import PlateImagesButton from "@/components/PlateImagesButton";
import ZoomControl, { zoomFontPx } from "@/components/ZoomControl";
import { usePinchZoom } from "@/components/usePinchZoom";
import { objToPlateRow, type PlateImageRow } from "@/lib/plateImage";
import { findDuplicateEntry, filterFieldEntries, plateKey } from "@/lib/fieldCheck";
import { buildScopedDupeColorMap } from "@/lib/dupeColors";
import { authHeader } from "@/lib/authHeader";
import { pushPendingFieldChecks, restoreFieldChecks } from "@/lib/syncFieldCheck";
import { pushOneChassis, pushChassisRecords, restoreChassisRecords } from "@/lib/syncChassis";
import { supabase } from "@/lib/supabaseClient";
import { shareImageWithText, buildPlateShareText, shareTextViaChooser } from "@/lib/share";
import { fireWantedAlert } from "@/lib/wantedAlert";
import { readDeepgramWords, type DgWord, type DgFinal } from "@/lib/deepgramWords";
import { fetchLearningEnabled } from "@/lib/learningSettings";
import { isPilotOwner, fetchPlateJudgeEnabled, readJudgeEndpoint, saveJudgeEndpoint, clearJudgeEndpoint } from "@/lib/plateJudgeGate";
import type { FusionSource } from "@/lib/plateFusion";
// أنواع بس (بتتشال وقت البناء) — الدوال نفسها بتتقرا من `judgeModsRef` عشان
// chunk المالك يفضل كسول ومايتحمّلش على أجهزة باقي المناديب.
import type { JudgeSessionCounts } from "@/lib/plateJudgeLog";
import type { JudgeTranscribeProbeResult } from "@/lib/plateJudgeClient";
import { classifyForCollection, type CollectAction } from "@/lib/trainingCollector";
import { saveTrainingSample, saveTrainingSession, countTrainingToday } from "@/lib/trainingStore";
import { syncTrainingData } from "@/lib/trainingSync";
import OpenDownloadButton from "@/components/OpenDownloadButton";
import PlateBadge from "@/components/PlateBadge";
import VehicleTypeSelect from "@/components/VehicleTypeSelect";
import { typeToCode } from "@/lib/vehicleType";
import { applyEntryEdit, entryType, entryNotes, NOTES_KEY, TYPE_KEY, type EntryEdit } from "@/lib/fieldCheckEdit";
import { PAGE_STEP, pageSlice, hasMore, growShown } from "@/lib/pagedRows";

const INVALID_AR_LETTERS_SET = new Set(["ت","ث","ج","خ","ذ","ز","ش","ض","ظ","غ","ف"]);
const HIT_ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];
// Distinct row tints for duplicated plates in the recordings sheet — each
// repeated plate group gets its own colour so it stands out at a glance.
const FIELD_DUPE_COLORS = [
  "bg-amber-500/20", "bg-purple-500/20", "bg-pink-500/20", "bg-cyan-500/20",
  "bg-orange-500/20", "bg-lime-500/20", "bg-rose-500/20", "bg-indigo-500/20",
];

// Shared with the registration page so a correction on EITHER screen teaches
// the other — same device, same voice, same mishearings.
const LS_LETTER_CONFUSIONS = "ph:registration:letterConfusions";
const LS_WORD_BLENDS = "ph:registration:wordBlends";
// منظّم الإيقاع في التشييك الصوتي — اهتزاز + وميض بين اللوحات (نفس فكرة التسجيل).
const LS_CHECK_PACER = "ph:check:pacer";
// لو المندوب بيتكلم ومفيش أي نص من المحرك المدة دي → القناة اتعطّلت، نعيد التشغيل.
const DG_SILENT_MS = 20000;
// ── طيّار «الرأي التاني» (موديلنا المدرَّب جنب Deepgram) — للمالك وحده ──
// **المقيس على جلسة المالك (٣٠ لوحة):** ٥ لوحات اتسكتت `busy` بالسقف ١ — هو
// بيقول لوحة كل ٢٫٩٨ث (وسيط) وتأخّر وصول النتيجة النهائية بيتلخبط ٠٫٣–٢٫٢ث،
// فنتيجتين بيوصلوا ورا بعض بجزء من الثانية والتانية كانت **بتتضيّع**.
// السقف ٢ + طابور ٢ (`planJudgeAdmission`): التانية تمشي فوراً، والتالتة/الرابعة
// **تستنى** بدل ما تتضيّع (استنى ≈ زمن خدمة واحد؛ المهلة بتبدأ عند الإرسال مش عند
// الحجز)، والخامسة بتتسجّل `queue_full` — سبب مميّز، مش سكوت مجهول.
// ليه ٢ ومش أكتر؟ الخدمة بتسمح ٤ مع بعض (`--max-inflight`) فسيبنا سلوتين
// (للفحص/جهاز تاني) ومابنخلّيهاش ترمي ٥٠٣؛ والبادئة المرفوعة بتكبر مع الجلسة
// (المقيس: ٥١ كيلو أول لوحة → **١٫٤٥ ميجا** آخر لوحة، ~١٤٫٣ كيلو/ث) والبث الحي
// عايش على نفس الرفع — فطلبين سقف، مش أربعة.
const JUDGE_MAX_INFLIGHT = 2;
const JUDGE_MAX_QUEUE = 2;
// كل جزء من MediaRecorder = ٢٥٠ms (rec.start(250)) — الأساس اللي بنحوّل بيه
// زمن الميديا لفهرس جزء وقت تقطيع بادئة الجلسة.
const JUDGE_CHUNK_MS = 250;
// كام نتيجة نهائية نفضل شايلين كلماتها للنافذة **المقسومة** (لوحة اتقالت «حروف …
// سكتة … أرقام» فـDeepgram نهّى نصّها).
//   • **٢ يكفّوا لكل حالة مقيسة**: كل اللوحات المقسومة في جلسة المالك حروفها في
//     النتيجة اللي قبل والأرقام في الحالية (٩ لوحات من ٣٠، الوقفة ١٢٠–٩٣٠ms).
//   • التالت لنتيجة **مكرّرة** بينهم — Deepgram بيبعت نفس النتيجة النهائية مرتين
//     (نفس السبب اللي عشانه فيه حارس تكرار ٢ث في `addOnePttRow`)، وساعتها نصّ
//     اللوحة يبقى نتيجتين لورا.
//   • أكتر من كده مالوش فايدة: **السقف الزمني** (`JUDGE_MAX_SPLIT_SPAN_MS` =
//     ٤٢٧٠ms) هو اللي بيحدّ النافذة، مش عدد النتايج — فنتايج أقدم من كده مستحيل
//     تدخل نافذة صالحة، وبتزوّد شغل متزامن على الثريد الرئيسي ببلاش.
const JUDGE_FINALS_HISTORY = 3;

/**
 * مكوّنات نافذة الرأي التاني **الخام** — بلا أي حساب في الصفحة. الحساب كله في
 * `planPlateWindow` (دالة نقية مغطّاة باختبار على أرقام القياس الحقيقية).
 * ⚠️ ده **مش** توقيت التدريب: `curTimingRef` (نافذة واسعة بحشوة ٣ث) سايب زي ما
 * هو بالحرف لجمع الداتا — الواسعة صح للتدريب، وقاتلة للاستنتاج.
 */
type JudgeTiming = {
  /** بداية/نهاية كلام النبضة من كلمات Deepgram — **زمن التيار = زمن الميديا**. */
  wordStartMs: number | null;
  wordEndMs: number | null;
  /** لحظة وصول النتيجة النهائية بساعة الحقيقة نسبةً لبداية المسجّل. */
  arrivalMs: number | null;
  /** زمن الميديا المتجمّع — لكشف ساعة كلمات مش من التيار ده. */
  mediaElapsedMs: number | null;
  /** الرسالة من نفس جيل المسجّل/السوكيت الحالي؟ */
  streamFresh: boolean;
  /** أجزاء صوت فشل إرسالها للمحرك على التيار ده (تزحّف ساعة Deepgram). */
  audioDrops: number;
  /**
   * كلمات النتيجة النهائية بتوقيتها زي ما جت. `planPlateWindow` بيبني عليها نطق
   * **آخر لوحة** ويتحقّق إنه لوحة الصف — بدل min(starts)…max(ends) اللي كان
   * بيسرّب اللوحة السابقة (مقيس ٤٥٠–٥٤٠ms في ٤ نوافذ من ٢٥).
   */
  words: DgWord[];
  /**
   * نهاية آخر كلمة في النتيجة النهائية **اللي قبل دي** على نفس التيار (ms).
   * حدّ سفلي للنافذة: Deepgram نفسه قال إن كلام النبضة السابقة خلص هناك.
   */
  prevWordEndMs: number | null;
  /**
   * صورة من تاريخ آخر `JUDGE_FINALS_HISTORY` نتيجة نهائية على نفس التيار (آخر
   * عنصر = النتيجة الحالية). لازمة للوحة اللي المالك قالها «حروف … سكتة …
   * أرقام»: Deepgram بينهّي نصّها، والمحلّل بيلمّها carry-over، فكلمات النتيجة
   * الأخيرة لوحدها مافيهاش لوحة الصف ⇒ كانت سكوت. المخطِّط بيبني عليها المدى
   * بنفس التحقّق بالحرف (`provePlateSpanAcrossFinals`).
   */
  finals: DgFinal[];
};

/** الوحدات الكسولة للطيّار — بتتحمّل جوّه فرع المالك بس (chunks منفصلة). */
type JudgeMods = {
  client: typeof import("@/lib/plateJudgeClient");
  fusion: typeof import("@/lib/plateFusion");
  log: typeof import("@/lib/plateJudgeLog");
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

interface CheckHit {
  id: string;
  plate: string;
  row: Record<string, string>;
  found?: boolean;                 // مطلوبة (في ملف التشييك) أو لأ
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  lat?: number;
  lng?: number;
  mapsLink?: string;
  gpsError?: boolean;
  checkedAt: string;
}

type CheckMode = "manual" | "camera" | "ptt" | "sheet" | "chassis";

interface PlateResult {
  plate: string;
  normalized: string;
  found: boolean;
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  row?: Record<string, string>;
}

// One spoken plate in the voice (PTT) results window — compact row with its
// details, the manually-typed location name, and its captured GPS.
interface PttRow {
  id: string;
  plate: string;                 // displayed plate (after any learned correction / manual edit)
  originalPlate: string;         // what the parser produced before correction — diffed on edit to teach
  found: boolean;
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  row?: Record<string, string>;
  vehicleType?: string;          // نوع السيارة spoken after the plate (ونيت/فان/…)
  needsReview?: boolean;         // الشكل مكسور (أرقام بس/حرف غريب) → محتاجة مراجعة
  /** (مهجور) اسم موقع كان بيتكتب بإيد المندوب — اتشال، «الحي-الشارع» بيغني عنه. */
  locationName?: string;
  lat?: number;
  lng?: number;
  mapsLink?: string;
  gpsError?: boolean;
  checkedAt: string;
  // توقيت اللوحة في صوت الجلسة (من كلمات Deepgram) + ثقة الكلمات — لجمع التدريب فقط.
  sessionId?: string;
  startMs?: number;
  endMs?: number;
  wordConfidenceOk?: boolean;
  /**
   * الرأي التاني من موديلنا المدرَّب — **طيّار المالك وحده**. الحقل ده مش موجود
   * خالص على صفوف أي حد تاني، فالواجهة والتصدير والتدريب كلهم زي النهاردة.
   */
  judge?: {
    oursPlate: string;        // نص موديلنا الخام
    dgPlate: string;          // لوحة Deepgram المطبّعة (اللي الصف طلع بيها أصلاً)
    fusedPlate: string;       // قرار fusePlate
    source: FusionSource;
    reason: string;
    agreed: boolean;          // ٩٩٫٠٪ صح عند الاتفاق (٩٨/١٢٠ مقطع مقيس)
    needsReview: boolean;
    accepted: boolean;        // قرار بوابة الثقة على مخرَج موديلنا
    refuseReason?: string | null;
    serverMs?: number | null;
  };
}

// Blob → base64 (بدون بادئة data:) — لحفظ صوت الجلسة في مخزن التدريب.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onloadend = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function extractPlateFromOcrText(rawText: string): string | null {
  const text = rawText.replace(/\s+/g, '');
  if (!text) return null;
  const ar1 = text.match(/[؀-ۿ]{2,3}[0-9٠-٩]{3,4}/)?.[0];
  const ar2 = text.match(/[0-9٠-٩]{3,4}[؀-ۿ]{2,3}/)?.[0];
  const en1 = text.match(/[A-Za-z]{2,3}[0-9]{3,4}/)?.[0];
  const en2 = text.match(/[0-9]{3,4}[A-Za-z]{2,3}/)?.[0];
  return ar1 ?? ar2 ?? en1 ?? en2 ?? null;
}

// ── Speech recognition types ─────────────────────────────────────────────────
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function createSpeechRecognition(): SpeechRecognitionInstance | null {
  const W = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!SR) return null;
  return new SR();
}

function buildGpsLink(value: string): string | null {
  const v = String(value).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const m = v.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (m) return toMapsLink(parseFloat(m[1]), parseFloat(m[2]));
  return null;
}

// ── Result card ───────────────────────────────────────────────────────────────
// صف بيانات قابل للتعديل بالقلم — لعرض/تعديل خانات نتيجة الشاصي (نوع السيارة/ملاحظات/المنطقة).
function EditableField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 text-[11px] font-medium text-muted">{label}</span>
      {editing ? (
        <input
          dir="rtl"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => { if (e.key === "Enter") setEditing(false); }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-brand bg-surface-2 px-2 py-1 text-sm text-ink outline-none"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="flex min-w-0 flex-1 items-center justify-end gap-2 text-sm active:opacity-70">
          <span className={`truncate ${value ? "text-ink" : "text-muted"}`}>{value || placeholder || "اضغط للتعديل"}</span>
          <Pencil size={13} className="shrink-0 text-primary" />
        </button>
      )}
    </div>
  );
}

// خانة جدول قابلة للتعديل — لتعديل بيانات سجل شاصي محفوظ (نوع/ملاحظات/منطقة) من جدول السجلات.
function EditableCell({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return editing ? (
    <input
      dir="rtl"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full min-w-[70px] rounded border border-brand bg-surface-2 px-1 py-0.5 text-xs text-ink outline-none"
    />
  ) : (
    <button onClick={() => setEditing(true)} className="flex w-full items-center justify-between gap-1 text-right active:opacity-70">
      <span className={value ? "text-ink" : "text-muted"}>{value || placeholder || "—"}</span>
      <Pencil size={11} className="shrink-0 text-primary/60" />
    </button>
  );
}

function ResultCard({ result, plateCol, selectedCols, onExport, onShare, priorCheck }: { result: PlateResult; plateCol: string | null; selectedCols?: Set<string>; onExport?: (result: PlateResult) => void | Promise<void>; onShare?: (result: PlateResult) => void | Promise<void>; priorCheck?: FieldCheckEntry }) {
  const [exportState, setExportState] = useState<"idle" | "saving" | "done">("idle");
  const [shareState, setShareState] = useState<"idle" | "sharing">("idle");

  async function handleExport() {
    if (!onExport || exportState !== "idle") return;
    setExportState("saving");
    try {
      await onExport(result);
      setExportState("done");
    } catch {
      setExportState("idle");
    }
  }

  async function handleShare() {
    if (!onShare || shareState !== "idle") return;
    setShareState("sharing");
    try {
      await onShare(result);
    } catch {
      /* ignore — share fell back or was cancelled */
    } finally {
      setShareState("idle");
    }
  }

  if (!result.found) {
    return (
      <div className="rounded-xl border-2 border-danger/40 bg-danger/10 p-4">
        <div className="flex items-center justify-center gap-2 mb-3">
          <XCircle size={16} className="text-danger shrink-0" />
          <span className="text-xs font-bold text-danger">غير موجود في ملف التشييك</span>
        </div>
        <div className="flex justify-center">
          <PlateBadge value={result.plate} size="md" />
        </div>
      </div>
    );
  }

  const isFuzzy = result.matchType === "fuzzy";
  const extras = result.row
    ? Object.entries(result.row).filter(([k, v]) => {
        if (k === plateCol || !String(v).trim()) return false;
        if (selectedCols && selectedCols.size > 0 && !selectedCols.has(k)) return false;
        return true;
      })
    : [];

  return (
    <div className={`rounded-xl border-2 p-4 ${isFuzzy ? "border-alert/60 bg-alert/10" : "border-brand/60 bg-brand/10"}`}>
      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-3">
        {isFuzzy
          ? <AlertTriangle size={16} className="text-alert shrink-0" />
          : <CheckCircle2 size={16} className="text-brand shrink-0" />}
        <span className={`text-xs font-bold ${isFuzzy ? "text-alert" : "text-brand"}`}>
          {isFuzzy ? `مشتبه به ${result.similarity}%` : "موجود!"}
        </span>
      </div>
      {/* Already-checked notice */}
      {priorCheck && (
        <div className="mb-3 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-500">
          <History size={13} className="shrink-0" />
          <span>اتشيّكت قبل كده — {formatDate(priorCheck.checkedAt)}</span>
        </div>
      )}
      {/* Plate badge */}
      <div className="flex justify-center mb-3">
        <PlateBadge value={result.plate} size="md" />
      </div>
      {/* Extra details */}
      {extras.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-white/10 pt-3 mt-1">
          {extras.map(([k, v]) => {
            const gpsLink = buildGpsLink(String(v));
            return (
              <div key={k} className="flex flex-col min-w-0">
                <span className="text-[10px] text-muted leading-tight">{k}</span>
                {gpsLink ? (
                  <a href={gpsLink} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary">
                    <MapPin size={11} className="shrink-0" />خريطة
                  </a>
                ) : (
                  <span className="text-xs text-ink truncate">{String(v)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* Actions: export to the protected sheet + share (with photo) to WhatsApp */}
      {(onExport || onShare) && (
        <div className="mt-3 flex gap-2">
          {onExport && (
            <button
              onClick={handleExport}
              disabled={exportState !== "idle"}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition active:scale-95 disabled:active:scale-100 ${
                exportState === "done" ? "bg-brand/20 text-brand" : "bg-brand text-night"
              }`}
            >
              {exportState === "saving" ? (
                <><Loader2 size={15} className="animate-spin" /> جارٍ...</>
              ) : exportState === "done" ? (
                <><Check size={15} /> أُضيفت</>
              ) : (
                <><ClipboardCheck size={15} /> تصدير للتشييك</>
              )}
            </button>
          )}
          {onShare && (
            <button
              onClick={handleShare}
              disabled={shareState !== "idle"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition active:scale-95 disabled:opacity-60"
            >
              {shareState === "sharing" ? (
                <><Loader2 size={15} className="animate-spin" /> جارٍ...</>
              ) : (
                <><Share2 size={15} /> نشر واتساب</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * مفتاح لوحة صف الشاص لأغراض التلوين — بيكتشف عمود اللوحة من **أعمدة الصف نفسه**
 * (الصف ممكن ييجي من ورقة تانية بأعمدة مختلفة عن ملف التشييك)، وبيتحقّق من شكل
 * اللوحة (٣ حروف + ٤ أرقام) — لأن detectPlateColumn بيرجّع أول عمود لو مالقاش،
 * فبدون التحقّق ممكن قيمة عشوائية (بنك/رقم) تتلوّن كأنها لوحة مكررة.
 */
function plateKeyFromRow(row: Record<string, string>): string {
  const col = detectPlateColumn(Object.keys(row), [row]);
  const k = plateKey(String(col ? row[col] ?? "" : ""));
  const letters = k.replace(/[0-9]/g, "");
  const digits = k.replace(/[^0-9]/g, "");
  return letters.length === 3 && digits.length === 4 ? k : "";
}

// كاش على مستوى الموديول — بيخلّي قوائم التشييك (يدوي/كاميرا/صوتي) تعيش عبر
// التنقّل بين الصفحات وفتح/قفل التطبيق (طول ما الجلسة شغّالة)، مايتأثرش بحد
// مساحة localStorage. القوائم تتمسح بس لما المندوب يمسحها بنفسه.
let icHitsCache: CheckHit[] | null = null;
let icPttCache: PttRow[] | null = null;
let icManualDraftCache: FieldCheckEntry[] | null = null;
// أي صفوف (كاميرا/صوت) اتصدّرت للسجلات — لازم تفضل محفوظة زي القوائم نفسها،
// وإلا بعد إعادة فتح التطبيق نفس التشييك يتحسب مرتين (القائمة + السجلات) فيظهر
// «مكرر» وهو مرة واحدة، وكمان زر التصدير يعيد تصدير اللي اتصدّر.
let icHitsExportedCache: string[] | null = null;
let icPttExportedCache: string[] | null = null;

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InstantCheckPage() {
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkColsOpen, setCheckColsOpen] = useState(false);
  // حالة الـ GPS (منقولة من صفحة التسجيل) — تظهر فوق مربع ملف التشييك عشان
  // المندوب يتأكد إن الموقع شغّال بدقّة قبل التشييك (الموقع مهم لكل صف).
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("جارٍ تحديد الموقع...");
  const [gpsBoxOpen, setGpsBoxOpen] = useState(true);
  const [gpsRefreshing, setGpsRefreshing] = useState(false);
  // رسالة سبب فشل «تحديث» — بتتعرض للمندوب. كانت `catch {}` صامتة، فالزرار
  // كان يبان بايظ (شكوى مندوب ٢٠٢٦/٠٨/٠٢). السبب مهم: يخرج برّه؟ يفتح الأذونات؟
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<CheckMode>(() => {
    if (typeof window === "undefined") return "manual";
    const saved = window.localStorage.getItem("ph:check:mode");
    return saved === "camera" || saved === "ptt" || saved === "sheet" ? saved : "manual";
  });
  // تذكّر التبويب النشط — يرجّع المندوب لنفس التبويب لما يرجع لصفحة تشييك.
  useEffect(() => {
    try { window.localStorage.setItem("ph:check:mode", mode); } catch { /* ignore */ }
  }, [mode]);

  // Manual
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<PlateResult | null>(null);
  // Manual working-list (draft) — plates typed here stay local until the
  // delegate presses «تصدير للسجلات», mirroring the voice (PTT) flow.
  const [manualDraft, setManualDraft] = useState<FieldCheckEntry[]>([]);
  const [draftEdit, setDraftEdit] = useState<{ id: string; field: string } | null>(null);
  const [draftEditValue, setDraftEditValue] = useState("");
  const [manualSel, setManualSel] = useState<Set<string>>(new Set());
  const [manualCopiedId, setManualCopiedId] = useState<string | null>(null);
  const [manualExporting, setManualExporting] = useState(false);
  const [manualZoom, setManualZoom] = useState(3);
  const manualPinchRef = usePinchZoom(manualZoom, setManualZoom);
  // زوم نافذة نتيجة التشييك الصوتي (+ زوم بإصبعين).
  const [pttZoom, setPttZoom] = useState(3);
  const pttPinchRef = usePinchZoom(pttZoom, setPttZoom);

  // Camera
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraResult, setCameraResult] = useState<PlateResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRawText, setCameraRawText] = useState<string | null>(null);
  const [cameraInputPlate, setCameraInputPlate] = useState("");
  // GPS captured at the moment the photo was taken — reused by export + share
  const [cameraGps, setCameraGps] = useState<{ lat: number; lng: number } | null>(null);
  // نتيجة تشييك الشاصي (VIN) — مود «شاص».
  const [cameraChassisResult, setCameraChassisResult] = useState<{ vin: string; match: ChassisMatch } | null>(null);
  // لوحة تسجيل الشاصي: خانات يكتبها المندوب + GPS/تاريخ تلقائي.
  const [chVehicleType, setChVehicleType] = useState("");
  const [chNotes, setChNotes] = useState("");
  const [chRegion, setChRegion] = useState("");
  const [chDate, setChDate] = useState<string>("");
  const [chSaved, setChSaved] = useState(false);
  const [chLastSavedId, setChLastSavedId] = useState<string | null>(null);
  const [chLocEditing, setChLocEditing] = useState(false);
  const [chLocInput, setChLocInput] = useState("");
  // رابط موقع مخصّص (لو المندوب لصق رابط خرائط مختصر مفهوش إحداثيات) — يفوت على cameraGps.
  const [chLocLink, setChLocLink] = useState<string | null>(null);
  const [chassisRecords, setChassisRecords] = useState<ChassisRecord[]>([]);
  useEffect(() => { setChassisRecords(getChassisRecords()); }, []);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const chassisCamInputRef = useRef<HTMLInputElement>(null);
  const chassisGalInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // تثبيت صورة الكاميرا: تفضل بعد الخروج من التطبيق، وتتمسح فقط لما المندوب
  // يدوس «مسح» (resetCamera). نخزّنها في localStorage ونرجّعها عند التحميل.
  useEffect(() => {
    try {
      const img = window.localStorage.getItem("ph:check:camImage");
      if (!img) return;
      setCameraImage(img);
      setCameraInputPlate(window.localStorage.getItem("ph:check:camPlate") ?? "");
      const r = window.localStorage.getItem("ph:check:camResult");
      if (r) setCameraResult(JSON.parse(r) as PlateResult);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      if (cameraImage) {
        window.localStorage.setItem("ph:check:camImage", cameraImage);
        window.localStorage.setItem("ph:check:camPlate", cameraInputPlate);
        window.localStorage.setItem("ph:check:camResult", cameraResult ? JSON.stringify(cameraResult) : "");
      } else {
        window.localStorage.removeItem("ph:check:camImage");
        window.localStorage.removeItem("ph:check:camPlate");
        window.localStorage.removeItem("ph:check:camResult");
      }
    } catch { /* quota / unavailable */ }
  }, [cameraImage, cameraInputPlate, cameraResult]);

  // Live camera viewfinder
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // PTT
  const [pttListening, setPttListening] = useState(false);
  const [pttLiveText, setPttLiveText] = useState("");
  // أي محرك تفريغ شغّال دلوقتي (عشان المستخدم يعرف مش بيخمّن) + هل بيسمع فعلاً (VAD).
  const [pttEngine, setPttEngine] = useState<null | "deepgram" | "speechmatics" | "whisper" | "local">(null);
  const [pttMicActive, setPttMicActive] = useState(false);
  // التشخيص التقني (اسم المحرك + النص الخام) يظهر **للسوبر أدمن فقط** — لا
  // المناديب ولا الأدمنز العاديين.
  const [isSuper, setIsSuper] = useState(false);
  // آخر نصوص خام سمعها المحرك (قبل التحليل) — لوحة ديبج للسوبر أدمن لتشخيص الدقة.
  const [pttRawLog, setPttRawLog] = useState<string[]>([]);
  const pttRawLogRef = useRef<string[]>([]);
  // منظّم الإيقاع: اهتزاز + وميض بصري كل X ثانية أثناء الاستماع (بدون صوت،
  // فمايدخلش على الميكروفون ولا يأثّر على التفريغ) — بينظّم المندوب: لوحة كل نبضة.
  const [pacerOn, setPacerOn] = useState(false);
  const [pacerSec, setPacerSec] = useState(3);
  const [pacerPulse, setPacerPulse] = useState(false);
  const [pttResults, setPttResults] = useState<PttRow[]>([]);
  // «الأقرب» — ترتيب قوائم اللوحات (يدوي/صوتي/سجل) حسب أقرب سيارة لموقع المندوب.
  // مشترك بين القوائم التلاتة: زر في أي قائمة يفعّل الترتيب في كلها.
  const [icNearest, setIcNearest] = useState(false);
  const [icUserLoc, setIcUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [icLocating, setIcLocating] = useState(false);
  const [pttError, setPttError] = useState<string | null>(null);
  const [pttSel, setPttSel] = useState<Set<string>>(new Set());
  const [pttCopiedId, setPttCopiedId] = useState<string | null>(null);
  // The most recent MATCHED (wanted) plate — shown as a big prominent alert.
  const [pttAlert, setPttAlert] = useState<PttRow | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  // Elapsed listening time (seconds) shown under the mic button while recording.
  const [pttSeconds, setPttSeconds] = useState(0);
  const pttTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // إيقاف مؤقت للتسجيل — المندوب يوقف عشان يعدّل لوحة غلط من غير ما يكبر وقت
  // التسجيل، وبعدين يكمّل. الـref للقراءة الفورية جوه معالِجات التفريغ (البوابة).
  const [pttPaused, setPttPaused] = useState(false);
  const pttPausedRef = useRef(false);
  // ── مسار Whisper السحابي المتواصل (لو فيه مفتاح Groq) ──
  const pttChunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pttChunkBusyRef = useRef(false);            // جزء بيتبدّل/بيترفع دلوقتي؟
  const pttSessionStateRef = useRef<SessionState>(newSessionState()); // carry-over للمحلّل
  const pttRowIdxRef = useRef(0);                    // ترقيم فريد لصفوف نفس الملّي ثانية
  // ── Deepgram streaming (لو فيه مفتاح Deepgram — أدق تفريغ بالمصري) ──
  const dgSocketRef = useRef<WebSocket | null>(null);
  const dgRecorderRef = useRef<MediaRecorder | null>(null);
  const dgRecStartRef = useRef<number | null>(null); // لحظة بدء التسجيل (ساعة حقيقية) — لتوقيت التدريب المحكم
  const dgStreamRef = useRef<MediaStream | null>(null);
  const dgGateRef = useRef<SpeechGate | null>(null);   // بوابة الكلام (VAD)
  const dgKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dgMicPollRef = useRef<ReturnType<typeof setInterval> | null>(null); // تحديث مؤشّر "بيسمع"
  // شبكة أمان: آخر لحظة وصل فيها نص من المحرك + مؤقّت الحارس. لو المندوب بيتكلم
  // ومفيش أي نص بقاله فترة طويلة، يبقى القناة اتعطّلت (مايك/بوابة/سوكيت) —
  // نعيد تشغيل البث تلقائياً بدل ما المندوب يفضل يتكلم والكلام رايح في الهوا.
  const dgLastTextAtRef = useRef<number>(0);
  const dgWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dgAutoRestartsRef = useRef(0);
  const dgReconnectsRef = useRef(0); // عدّاد إعادة اتصال Deepgram (محدود عشان مايعملش لوب)
  // جيل التيار: بيزيد مع كل `startDeepgramPtt`. إعادة الاتصال بتعمل سوكيت **ومسجّل**
  // جديدين، فساعة Deepgram و`dgRecStartRef` و`judgeStreamBaseRef` يتصفّروا مع بعض.
  // نتيجة نهائية متأخّرة من السوكيت القديم صوتها **قبل** البادئة الحالية = مافيش
  // مرساة سليمة ⇒ الرأي التاني بيسكت `stale_stream` بدل ما يقصّ صوت لوحة تانية.
  const dgStreamSeqRef = useRef(0);
  // أجزاء صوت فشل إرسالها لـDeepgram على التيار ده. أي جزء ضايع = المحرك سمع صوت
  // أقصر مننا ⇒ ساعة كلماته زحفت بمقدار مش معروف ⇒ نرجع لساعة الحقيقة المحكمة.
  const dgAudioDropRef = useRef(0);
  const smHandleRef = useRef<SpeechmaticsHandle | null>(null); // جلسة Speechmatics
  // حارس تكرار الصوت: آخر لوحة اتفرّغت + وقتها — عشان لو نفس النطق اتفرّغ مرتين
  // (Deepgram بيبعت النتيجة النهائية مرتين: نهاية المقطع + نقطة الصمت) مايتكتبش مرتين.
  const lastPttEmitRef = useRef<{ norm: string; at: number } | null>(null);

  // Self-learning maps (shared with the registration page). A voice-check edit
  // teaches the same models the recording page uses, and vice versa.
  const letterConfusionsRef = useRef<LetterConfusionMap>(new Map());
  const wordBlendRef = useRef<WordBlendMap>(new Map());
  // Inline plate editing in the voice results table
  const [editingPttId, setEditingPttId] = useState<string | null>(null);
  const [editPttValue, setEditPttValue] = useState("");
  // Rows already pushed to the field-check sheet (shows a "تم" tick)
  const [pttExportedIds, setPttExportedIds] = useState<Set<string>>(new Set());

  // ── جمع داتا التدريب (مربوط بمفتاح السوبر أدمن، افتراضي مقفول = آمن) ──
  // كل ده معزول: لو المفتاح مقفول مافيش أي التقاط بيحصل خالص.
  const learningGateRef = useRef(false);              // حالة المفتاح (تُقرأ عند التحميل)
  const pttSessionIdRef = useRef<string>("");         // معرّف جلسة الصوت الحالية
  const pttAudioChunksRef = useRef<Blob[]>([]);       // أجزاء صوت الجلسة (للحفظ مرة واحدة)
  const pttAudioMimeRef = useRef<string>("audio/webm"); // صيغة صوت الجلسة
  const curTimingRef = useRef<{ startMs: number; endMs: number; confOk: boolean } | null>(null); // توقيت آخر نتيجة نهائية
  const pttEditedIdsRef = useRef<Set<string>>(new Set()); // صفوف عدّلها المندوب يدوياً (ليبل ذهبي)
  const trainingSessionSavedRef = useRef<string>(""); // آخر جلسة اتحفظ صوتها (منعاً للتكرار)
  const [trainingToday, setTrainingToday] = useState(0); // عدّاد المتجمّع النهاردة (يظهر لو المفتاح شغّال)
  const [learningOn, setLearningOn] = useState(false);   // نسخة تفاعلية من المفتاح (لإظهار العدّاد)

  // ── طيّار «الرأي التاني»: موديلنا المدرَّب (٩٥٫٨٪) يحكم جنب Deepgram (٨١٫٧٪) ──
  // **المالك وحده**، والافتراضي **مقفول** حتى له (مفتاح مركزي + إعداد جهاز).
  // لو مش مسلَّح: مافيش fetch، مافيش مؤقّت، مافيش مستمع، ولا حتى تحميل الكود.
  const judgeArmedRef = useRef(false);                   // الهوية + المفتاح المركزي عدّوا
  const judgeOwnerIdRef = useRef<string | null>(null);   // معرّف المالك المتحقَّق منه (وسم السجل)
  const judgeModsRef = useRef<JudgeMods | null>(null);   // الوحدات الكسولة (chunk المالك)
  const judgeInflightRef = useRef(0);                    // طلبات جوّه (سقف JUDGE_MAX_INFLIGHT)
  // مكوّنات نافذة آخر نتيجة نهائية للرأي التاني — **منفصل تماماً** عن
  // `curTimingRef` بتاع التدريب (اللي نافذته الواسعة صح للتدريب وقاتلة للاستنتاج).
  const judgeTimingRef = useRef<JudgeTiming | null>(null);
  // طابور قصير (FIFO) بدل ما اللوحة تتضيّع لو المالك بيتكلم أسرع من الخدمة.
  // كل عنصر شايل **صفّه** وجيل تياره وجلسته، فالرد المتأخّر بيرقّع الصف الصح
  // (الترقيع بيمشي على `r.id`) والعنصر اللي جلسته/تياره اتغيّروا بيسكت `stale_stream`.
  const judgeQueueRef = useRef<Array<{
    row: PttRow; timing: JudgeTiming | null; pausedMs: number;
    streamSeq: number; sessionId: string;
    seq: number; emit: { index: number; count: number; fromCarry: boolean };
  }>>([]);
  const judgeStreamBaseRef = useRef(0);                  // فهرس أول جزء للتيار الحالي (ترويسة webm)
  // نهاية آخر كلمة في آخر نتيجة نهائية على التيار ده — حدّ سفلي لنافذة النبضة
  // اللي بعدها. بيتصفّر مع التيار (سوكيت/مسجّل جديد ⇒ ساعة Deepgram من الصفر).
  const judgePrevWordEndRef = useRef<number | null>(null);
  // تاريخ آخر نتايج نهائية (كلماتها + حدّ الجار بتاع كل واحدة) — للنافذة
  // **المقسومة**. زمن ميديا لتيار **واحد**، فبيتصفّر مع التيار بالظبط زي
  // `judgePrevWordEndRef` فوق: كلمات من ساعة قديمة + كلمات من ساعة جديدة في
  // مصفوفة واحدة = نافذة على صوت غلط.
  const judgeFinalsRef = useRef<DgFinal[]>([]);
  // ترتيب الصفوف في الجلسة — عدّاد تصاعدي. الكارت بيتكتب لـ**الأحدث** بس، فرد
  // متأخّر لصف قديم مايمسحش كارت أحدث (`canJudgeWriteAlert`). الـ`id` فيه
  // `Date.now()` فمش صالح للمقارنة (ساعة الجهاز تقدر ترجع لورا).
  const pttSeqRef = useRef(0);
  const pttRowSeqRef = useRef<Map<string, number>>(new Map());
  // أيدي الصفوف **الموجودة فعلاً** — قراءة حيّة بلا انتظار إعادة رسم. لازمة لأن
  // رد الطيّار بيوصل بعد ٤١٠–٢٣٠٢ms (المقيس)، وفي الوقت ده المالك يقدر يمسح الصف؛
  // ورد لصف ممسوح كان بيلفّ صفّارة ويفتح كارت «مطلوبة» لصف مش في القائمة.
  const pttRowIdsRef = useRef<Set<string>>(new Set());
  const judgePausedMsRef = useRef(0);                    // مجموع الإيقاف المؤقت (ساعة الحقيقة ≠ زمن الميديا)
  const judgePauseAtRef = useRef<number | null>(null);
  const [judgeVisible, setJudgeVisible] = useState(false);   // مربّع الإعداد + علامات الصفوف
  const [judgeCfgOk, setJudgeCfgOk] = useState(false);       // النفق + التوكن محفوظين وسليمين
  const [judgeUrlInput, setJudgeUrlInput] = useState("");
  const [judgeTokenInput, setJudgeTokenInput] = useState("");
  const [judgeOpenId, setJudgeOpenId] = useState<string | null>(null); // الصف المفتوح تفاصيله
  // عدّاد الجلسة (عرض بس) — بيعدّ **المسكوت زي المجاوب**. العدّاد القديم كان
  // بيعدّ المجاوب لوحده ومايظهرش غير لو > ٠، فجلسة صفر طلب كان شكلها زي الطيّار
  // مقفول: مافيش أي سطر. الصفر لازم يبان صفر.
  const [judgeCounts, setJudgeCounts] = useState<JudgeSessionCounts>(
    { answered: 0, agree: 0, skipped: 0, reasons: {} });
  // كود نتيجة **آخر نبضة** (answered أو سبب السكوت). «متوصّل» بتوصف التخزين بس،
  // فبلا ده الطيّار يقدر يموت بصمت والمربّع لسه بيقول «متوصّل» — وده اللي حصل.
  const [judgeLast, setJudgeLast] = useState<string | null>(null);
  // نتيجة «جرّب الاتصال» — رحلة حقيقية للخدمة. `null` = لسه ماتجرّبتش، وده
  // **مختلف** عن «الإعداد محفوظ»: الإعداد بيوصف التخزين، ودي بتوصف الطريق.
  const [judgeProbe, setJudgeProbe] = useState<JudgeTranscribeProbeResult | null>(null);
  const [judgeProbing, setJudgeProbing] = useState(false);
  // صور الكاميرا اللي اتصدّرت خلاص — عشان «تصدير الكل» يبعت الجديد بس (مايكررش).
  const [hitsExportedIds, setHitsExportedIds] = useState<Set<string>>(new Set());
  // معرّف آخر صف كاميرا اتسجّل — عشان تصدير كارت النتيجة يعلّمه «اتصدّر» فمايتحسبش
  // مرتين (مرة في قائمة الكاميرا ومرة في السجلات) ويظهر «مكرر» وهو مرة واحدة.
  const lastHitIdRef = useRef<string | null>(null);

  // Load the learned-correction maps once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_LETTER_CONFUSIONS);
      if (raw) letterConfusionsRef.current = deserializeLetterConfusions(JSON.parse(raw));
    } catch { /* corrupt/missing — start fresh */ }
    try {
      const raw = localStorage.getItem(LS_WORD_BLENDS);
      if (raw) wordBlendRef.current = deserializeWordBlend(JSON.parse(raw));
    } catch { /* corrupt/missing — start fresh */ }
  }, []);

  // اقرأ حالة مفتاح جمع التدريب مرة عند التحميل (سوبر أدمن هو اللي بيتحكم فيه من
  // صفحة الأدمن). مقفول افتراضياً = مافيش أي التقاط. آمن للفشل (أوفلاين → يفضل مقفول).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const on = await fetchLearningEnabled();
        if (alive) { learningGateRef.current = on; setLearningOn(on); }
        if (on) {
          try { if (alive) setTrainingToday(await countTrainingToday()); } catch { /* لسه فاضي */ }
          // فلَّش أي داتا متجمّعة محلياً لسه ماترفعتش (مثلاً فشلت وقت التصدير لأن
          // SQL ماكانش اتشغّل بعد) — تحاول ترفع تاني كل ما الصفحة تفتح.
          void syncTrainingData();
        }
      } catch { /* افتراضي مقفول */ }
    })();
    return () => { alive = false; };
  }, []);

  // تسليح طيّار «الرأي التاني» مرّة عند التحميل. تلات بوابات بالترتيب، وأي واحدة
  // تفشل = خروج صامت والسلوك يفضل **زي النهاردة بالحرف** (Deepgram لوحده):
  //   ١. الهوية: المالك وحده (`isPilotOwner` — فحص شكل UUID على الطرفين، فأي
  //      هوية ماتحلّتش/فاضية/أوفلاين تفشل **مغلقة**؛ لاحظ إن الهوية بتفضل null
  //      عند التحميل لكل مستخدم، والجلسة كلها لو أوفلاين).
  //   ٢. المفتاح المركزي: افتراضي مقفول، وأي خطأ RPC = مقفول.
  //   ٣. الإعداد على الجهاز (نفق + توكن) — نص إعداد = مقفول.
  // الكود نفسه بيتحمّل **كسول** جوّه الفرع ده بس، فـwebpack بيطلّعه chunks
  // منفصلة مانديب تانية عمرها ما تحمّلها.
  //
  // ⚠️ الهوية بتتقرا بـ`getSession()` **مش** `getUser()`، وده فرق سلوك حقيقي على
  //    كل المستخدمين: في supabase-js 2.108.2 `getUser()` بيعمل
  //    `GET /auth/v1/user` على الشبكة **كل مرة** بلا أي مسار محلي
  //    (auth-js/GoTrueClient.js:2611-2635)، وده كان معناه طلب مصادقة تالت زيادة
  //    عند تحميل أكتر صفحة مستخدَمة في التطبيق — تأخير وبطارية وطلب زيادة تحت
  //    حدّ المعدّل، لكل مندوب، عشان بوابة بتقفل عند الجميع أصلاً.
  //    `getSession()` بيقرا الجلسة المحفوظة من التخزين بلا شبكة
  //    (GoTrueClient.js:2333 → `__loadSession` :2431-2484)، وبيرجّع
  //    `session.user.id` — نفس المعرّف اللي البوابة محتاجاه (مافيش `userStorage`
  //    مضبوط في lib/supabaseClient.ts، فـ`session.user` هو الكائن الحقيقي).
  //    وبيفشل **مغلق** في كل الحالات المهمة: مافيش جلسة ⇒ `session: null`؛
  //    الجلسة منتهية والتحديث فشل (أوفلاين مثلاً) ⇒ `session: null` + خطأ
  //    (:2486-2507) ⇒ `uid = null` ⇒ `isPilotOwner(null) === false` ⇒ الطيّار
  //    مقفول والسلوك زي النهاردة بالحرف.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let uid: string | null = null;
        try { uid = (await supabase.auth.getSession()).data.session?.user?.id ?? null; } catch { /* أوفلاين */ }
        if (!isPilotOwner(uid)) return;                          // ← الباب الأول
        if (!(await fetchPlateJudgeEnabled())) return;            // ← الباب التاني
        if (!alive) return;
        const [client, fusion, log] = await Promise.all([
          import("@/lib/plateJudgeClient"),
          import("@/lib/plateFusion"),
          import("@/lib/plateJudgeLog"),
        ]);
        if (!alive) return;
        judgeModsRef.current = { client, fusion, log };
        judgeOwnerIdRef.current = uid;
        judgeArmedRef.current = true;
        setJudgeVisible(true);
        const cfg = readJudgeEndpoint();                          // ← الباب التالت
        setJudgeCfgOk(!!cfg);
        if (cfg) { setJudgeUrlInput(cfg.base); setJudgeTokenInput(cfg.token); }
      } catch { /* أي فشل = مقفول */ }
    })();
    return () => { alive = false; };
  }, []);

  // Keep a live GPS watch running the whole time the page is open, so stamping
  // a plate reads an already-fresh coordinate instantly (see getCurrentGps).
  // Also feed the GPS-status box (coords + reverse-geocoded address).
  useEffect(() => {
    gpsService.startTracking().catch(() => {});
    const unsub = gpsService.subscribe((coords) => {
      setGps(coords);
      if (coords) {
        reverseGeocode(coords.lat, coords.lng)
          .then((addr) => setGpsAddress(`${addr.street} • ${addr.district}`))
          .catch(() => {});
      }
    });
    return () => { unsub(); gpsService.stopTracking(); };
  }, []);

  // زر «تحديث» في خانة الـ GPS.
  //
  // كان `catch {}` صامت تماماً: لو الفيكس فشل، `pinCurrentLocation` بترجّع
  // الفيكس القديم والواجهة تحدّث نفسها بنفس الإحداثيات ⇒ المندوب يشوف **صفر
  // تغيير** ويفتكر الزرار بايظ. (شكوى مندوب ٢٠٢٦/٠٨/٠٢: «بدوس تحديث ومفيش أي
  // استجابة».) دلوقتي الخدمة بتعلّم الفيكس القديم بـ`stale`، والغلط بيوصل
  // للمندوب بسببه — لأن السبب بيغيّر اللي هو هيعمله (يخرج برّه؟ يفتح الأذونات؟).
  async function refreshGps() {
    setGpsRefreshing(true);
    setGpsMsg(null);
    try {
      const coords = await gpsService.pinCurrentLocation();
      setGps(coords);
      if (coords.stale) {
        setGpsMsg("مافيش إشارة GPS جديدة — المعروض آخر موقع قديم. اطلع في مكان مفتوح وجرّب تاني.");
      } else {
        const addr = await reverseGeocode(coords.lat, coords.lng);
        setGpsAddress(`${addr.street} • ${addr.district}`);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setGpsMsg(
        /denied|permission/i.test(m) ? "إذن الموقع مرفوض — افتحه من إعدادات التطبيق."
        : /unsupported|not supported/i.test(m) ? "الجهاز مش بيدعم تحديد الموقع."
        : "مش قادر يجيب الموقع — اطلع في مكان مفتوح وجرّب تاني.",
      );
    }
    finally { setGpsRefreshing(false); }
  }

  // هل المستخدم الحالي **سوبر أدمن**؟ (التشخيص التقني — اسم المحرك + النص الخام —
  // للسوبر أدمن فقط: لا المناديب ولا الأدمنز العاديين يشوفوه).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        setIsSuper(!!prof?.is_super);
      } catch { /* غير متاح — يفضل مخفي */ }
    })();
  }, []);

  // استرجاع إعداد منظّم الإيقاع المحفوظ.
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(LS_CHECK_PACER) || "null");
      if (p && typeof p === "object") {
        if (typeof p.on === "boolean") setPacerOn(p.on);
        if (typeof p.sec === "number" && p.sec >= 2 && p.sec <= 6) setPacerSec(p.sec);
      }
    } catch { /* ignore */ }
  }, []);

  // نبضة الإيقاع: اهتزاز + وميض كل X ثانية أثناء الاستماع — بدون أي صوت.
  useEffect(() => {
    if (!pttListening || !pacerOn) { setPacerPulse(false); return; }
    const ms = Math.max(1500, pacerSec * 1000);
    const id = setInterval(() => {
      try { navigator.vibrate?.(90); } catch { /* مايدعمش الاهتزاز */ }
      setPacerPulse(true);
      window.setTimeout(() => setPacerPulse(false), 500);
    }, ms);
    return () => clearInterval(id);
  }, [pttListening, pacerOn, pacerSec]);

  function savePacer(on: boolean, sec: number) {
    setPacerOn(on); setPacerSec(sec);
    try { localStorage.setItem(LS_CHECK_PACER, JSON.stringify({ on, sec })); } catch { /* ignore */ }
  }

  // يسجّل النص الخام (اللي المحرك سمعه قبل التحليل) في لوحة ديبج الأدمن — آخر ١٥.
  function logRawTranscript(text: string) {
    const t = text.trim();
    if (!t) return;
    const next = [...pttRawLogRef.current, t].slice(-40);
    pttRawLogRef.current = next;
    setPttRawLog(next);
  }

  // Check hits history (session-only)
  const [manualHits, setManualHits] = useState<CheckHit[]>([]);
  const [copiedHitId, setCopiedHitId] = useState<string | null>(null);
  const [hitsZoom, setHitsZoom] = useState(3);
  const [hitsSelected, setHitsSelected] = useState<Set<string>>(new Set());

  // Recordings sheet (شيت التسجيلات) — persisted in IDB, fixed log the agent
  // can only download or share (no delete / no edit).
  const [fieldEntries, setFieldEntries] = useState<FieldCheckEntry[]>([]);
  // أي مشاركة/تصدير شغّالة دلوقتي (لعرض «جاري التجهيز» ومنع الضغط المتكرر).
  const [shareBusy, setShareBusy] = useState<string | null>(null);
  const [fieldZoom, setFieldZoom] = useState(3);
  const [fieldSearch, setFieldSearch] = useState("");
  // فلتر عدادات شيت السجلات: الكل / صوتي / يدوي / مطلوب.
  const [fieldFilter, setFieldFilter] = useState<"all" | "voice" | "manual" | "wanted">("all");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldValue, setEditFieldValue] = useState("");
  // «إظهار اللوحات»: نافذة تعديل/حذف على نسخة draft — التغييرات ماتتحفظش في
  // IDB إلا لما المندوب يدوس «حفظ التعديلات». «إلغاء» بترمي الـ draft.
  const [platesEditorOpen, setPlatesEditorOpen] = useState(false);
  const [draftFieldEntries, setDraftFieldEntries] = useState<FieldCheckEntry[]>([]);
  const [peSearch, setPeSearch] = useState("");            // بحث برقم اللوحة داخل المحرّر
  // ── ترقيم الرسم ──────────────────────────────────────────────────────────
  // بنرسم دفعة وبنزوّد مع التمرير. من غير كده مندوب عنده ٦٠٠٠ سجل بيرسم عشرات
  // الآلاف من العناصر مرة واحدة وسفاري على الأيفون بيقتل الصفحة. العدّادات
  // والبحث والتصدير والمشاركة بتفضل على **كل** الصفوف — الحد على الرسم بس.
  const [fieldShown, setFieldShown] = useState(PAGE_STEP);   // جدول السجلات
  const [peShown, setPeShown] = useState(PAGE_STEP);         // نافذة تعديل اللوحات
  const [restoringChecks, setRestoringChecks] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ done: number; total: number } | null>(null);
  const fieldMoreRef = useRef<HTMLDivElement | null>(null);
  const peMoreRef = useRef<HTMLDivElement | null>(null);
  // أول لوحة مطابقة — بنتنطّ عليها عشان تبان في وسط الشاشة مع اللي حواليها.
  const peFirstHitRef = useRef<HTMLTableRowElement | null>(null);

  // مراقب التمرير: أول ما آخر الجدول يبان، نزوّد دفعة. كده المندوب بيوصل لكل
  // سجلاته بالتمرير العادي من غير ما نرسمهم كلهم من الأول.
  useEffect(() => {
    const el = fieldMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setFieldShown((s) => s + PAGE_STEP);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
    // mode لازم يكون في القايمة — المستشعر موجود في تبويب «السجلات» بس، ومن
    // غيره المراقب مايتركّبش لما المندوب يفتح التبويب.
  }, [fieldShown, fieldEntries.length, fieldFilter, fieldSearch, mode]);

  useEffect(() => {
    const el = peMoreRef.current;
    if (!el || !platesEditorOpen || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setPeShown((s) => s + PAGE_STEP);
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [peShown, platesEditorOpen, peSearch, draftFieldEntries.length]);

  // بحث أو فلتر جديد → نرجع لأول دفعة عشان النتيجة تبان من فوق
  useEffect(() => { setFieldShown(PAGE_STEP); }, [fieldSearch, fieldFilter]);
  useEffect(() => { setPeShown(PAGE_STEP); }, [peSearch]);

  useEffect(() => {
    if (!peSearch.trim()) return;
    const t = setTimeout(() => {
      peFirstHitRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);   // بعد ما الجدول يترسم
    return () => clearTimeout(t);
  }, [peSearch]);
  const [peCols, setPeCols] = useState<Set<string>>(new Set()); // الأعمدة المعروضة في المحرّر
  // زر الرجوع (الهاتف) يقفل نافذة «إظهار وتعديل اللوحات» بدل ما يتنقّل بعيد.
  useEffect(() => { if (platesEditorOpen) return pushBackHandler(() => setPlatesEditorOpen(false)); }, [platesEditorOpen]);


  // Owner of new field-check rows — so a shared device doesn't mix two agents.
  const agentIdRef = useRef<string | null>(null);
  const [syncingRecords, setSyncingRecords] = useState(false);

  // «مزامنة» — يرفع سجلات التشييك (شيت السجلات) للسيرفر تدريجياً: أول ضغطة كله،
  // وبعدين الجديد فقط (سريع). بيعرض نتيجة قصيرة.
  async function handleSyncRecords() {
    const uid = agentIdRef.current;
    if (!uid) { alert("مفيش جلسة مسجّلة — سجّل دخول الأول."); return; }
    setSyncingRecords(true);
    try {
      const res = await pushPendingFieldChecks(uid);
      if (res.error) alert(`❌ فشل المزامنة:\n${res.error}`);
      else if (res.pending === 0) alert("مفيش سجلات جديدة — الكل متزامن ✅");
      else alert(`✅ اترفع ${res.synced} من ${res.pending} سجل للسيرفر.`);
    } catch (err) {
      alert(`❌ خطأ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncingRecords(false);
    }
  }

  // Load the field-check sheet from IDB on mount (scoped to this agent), then
  // sync with the server: restore what the agent saved elsewhere, push local up.
  useEffect(() => {
    (async () => {
      let uid: string | undefined;
      // getSession() = قراءة محلية بلا شبكة. getUser() كان بيعمل نداء بيفشل على
      // شبكة الموبايل فالاسترجاع مايحصلش والمندوب يلاقي سجلاته فاضية.
      try { uid = (await supabase.auth.getSession()).data.session?.user?.id; } catch { /* offline */ }
      agentIdRef.current = uid ?? null;
      setFieldEntries(await getAllFieldCheckEntries(uid).catch(() => []));
      if (!uid) return;
      try {
        setRestoringChecks(true);
        // تقدّم حقيقي («٢٠٠٠ من ٦١١٠») + عرض أول دفعة فور وصولها بدل ما المندوب
        // يفضل قدام شاشة فاضية لحد ما الكل يخلص.
        await restoreFieldChecks(uid, (done, total) => {
          setRestoreProgress({ done, total });
          if (done > 0) void getAllFieldCheckEntries(uid).then(setFieldEntries).catch(() => {});
        });
        pushPendingFieldChecks(uid).catch(() => {}); // تدريجي — يعلّم المرفوع عشان الزر يبقى سريع
        setFieldEntries(await getAllFieldCheckEntries(uid));
        // سجلات الشاص: استرجاع من السيرفر + رفع المحلي (نفس فكرة اللوحات).
        await restoreChassisRecords(uid);
        pushChassisRecords(uid).catch(() => {});
        setChassisRecords(getChassisRecords());
      } catch { /* offline / no session */ }
      finally { setRestoringChecks(false); }
    })();
  }, []);

  // hydrated: يبقى true بعد ما الاسترجاع يخلّص — عشان تأثيرات الحفظ ماتكتبش
  // القيمة الابتدائية الفاضية فوق المحفوظ (clobber) وقت التحميل.
  const listsHydrated = useRef(false);

  // استرجاع القوائم عند التحميل: الكاش في الذاكرة أولاً (بيعيش عبر التنقّل)،
  // وإلا localStorage. القوائم متتمسحش إلا لما المندوب يمسحها بنفسه.
  useEffect(() => {
    try {
      if (icHitsCache) setManualHits(icHitsCache);
      else { const s = localStorage.getItem("ic-hits"); if (s) { const v = JSON.parse(s) as CheckHit[]; icHitsCache = v; setManualHits(v); } }
    } catch {}
    try {
      if (icPttCache) setPttResults(icPttCache);
      else { const s = localStorage.getItem("ic-ptt-results"); if (s) { const v = JSON.parse(s) as PttRow[]; icPttCache = v; setPttResults(v); } }
    } catch {}
    try {
      if (icManualDraftCache) setManualDraft(icManualDraftCache);
      else { const s = localStorage.getItem("ic-manual-draft"); if (s) { const v = JSON.parse(s) as FieldCheckEntry[]; icManualDraftCache = v; setManualDraft(v); } }
    } catch {}
    try {
      const h = icHitsExportedCache ?? JSON.parse(localStorage.getItem("ic-hits-exported") || "null");
      if (Array.isArray(h)) { icHitsExportedCache = h; setHitsExportedIds(new Set(h)); }
      const t = icPttExportedCache ?? JSON.parse(localStorage.getItem("ic-ptt-exported") || "null");
      if (Array.isArray(t)) { icPttExportedCache = t; setPttExportedIds(new Set(t)); }
    } catch {}
  }, []);

  // حفظ كل قائمة (كاش الذاكرة + localStorage) عند أي تغيير — بس بعد الاسترجاع.
  useEffect(() => {
    if (!listsHydrated.current) return;
    icHitsCache = manualHits;
    try { localStorage.setItem("ic-hits", JSON.stringify(manualHits)); } catch {}
  }, [manualHits]);

  useEffect(() => {
    if (!listsHydrated.current) return;
    icPttCache = pttResults;
    try { localStorage.setItem("ic-ptt-results", JSON.stringify(pttResults)); } catch {}
  }, [pttResults]);

  // مرآة أيدي الصفوف — **مصدر الحقيقة** لسؤال «الصف لسه موجود؟» بلا ما نقرا حالة
  // React جوّه دالة تحديث (ممنوع: الـupdater لازم يفضل نقي، وStrictMode بينادّيه
  // مرتين). بتغطّي كل مسارات الشيل (مسح صف · مسح المحدَّد · مسح الكل · استرجاع من
  // التخزين)، والمسح الفردي بيشيل من الريف فوراً كمان فمافيش ولا ms سباق.
  useEffect(() => {
    pttRowIdsRef.current = new Set(pttResults.map((r) => r.id));
  }, [pttResults]);

  useEffect(() => {
    if (!listsHydrated.current) return;
    icManualDraftCache = manualDraft;
    try { localStorage.setItem("ic-manual-draft", JSON.stringify(manualDraft)); } catch {}
  }, [manualDraft]);

  useEffect(() => {
    if (!listsHydrated.current) return;
    const arr = [...hitsExportedIds];
    icHitsExportedCache = arr;
    try { localStorage.setItem("ic-hits-exported", JSON.stringify(arr)); } catch {}
  }, [hitsExportedIds]);

  useEffect(() => {
    if (!listsHydrated.current) return;
    const arr = [...pttExportedIds];
    icPttExportedCache = arr;
    try { localStorage.setItem("ic-ptt-exported", JSON.stringify(arr)); } catch {}
  }, [pttExportedIds]);

  // بعد ما تأثيرات الاسترجاع + الحفظ الابتدائية تعدّي، نعلّم إن الاسترجاع خلّص.
  // (لازم يكون آخر تأثير عشان تأثيرات الحفظ فوقه تتخطّى الكتابة الابتدائية
  // الفاضية على المحفوظ.) بعد إعادة الرندر بالقيم المسترجَعة، الحفظ يكتب عادي.
  useEffect(() => { listsHydrated.current = true; }, []);

  // Attach live camera stream to video element whenever stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveStream) return;
    video.srcObject = liveStream;
    video.play().catch(() => {});
    return () => { liveStream.getTracks().forEach((t) => t.stop()); };
  }, [liveStream]);

  // أول ما المندوب يدخل وضع «كاميرا» تفتح الكاميرا الخلفية على طول (من غير شاشة
  // اختيار كاميرا/معرض). لو قفلها بيرجع لشاشة الاختيار عادي.
  useEffect(() => {
    if (mode === "camera" && !liveStream && !cameraImage) openLiveCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Load check file from IDB on mount — AND whenever it changes underneath us.
  useEffect(() => {
    const loadCheck = () => {
      getUploadedFile("local", "check")
        .then((rec) => {
          if (rec) {
            setCheckTable({ headers: rec.headers, rows: rec.rows });
            setCheckFile(new File([rec.fileBlob ?? new Blob()], rec.fileName, {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }));
            const plate = detectPlateColumn(rec.headers);
            setSelectedCheckCols(new Set(rec.headers.filter((h) => h !== plate && matchesPreferred(h))));
          }
        })
        .catch(() => {});
    };
    loadCheck();
    // لو ملف التشييك اتضاف من نافذة «الإكسيل الوارد من واتساب» والصفحة مفتوحة
    // بالفعل (router.push لنفس الصفحة مابيعملش remount)، نعيد قراءته فور ما
    // الحدث ييجي — بدل ما المندوب يضطر يطلع من الصفحة ويرجع عشان الملف يبان.
    const onIdbUpdate = (e: Event) => {
      const slot = (e as CustomEvent<{ slot?: string }>).detail?.slot;
      if (!slot || slot === "check") loadCheck();
    };
    window.addEventListener("idbFileUpdated", onIdbUpdate);
    return () => window.removeEventListener("idbFileUpdated", onIdbUpdate);
  }, []);

  // Pass the rows so detection works by CONTENT (robust to unusual column
  // names) — name-only detection would fall back to the first column and
  // silently break matching.
  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers, checkTable.rows) : null;
  const [selectedCheckCols, setSelectedCheckCols] = useState<Set<string>>(new Set());

  // ── تلوين اللوحات المكررة — موحّد على كل نوافذ التشييك ────────────────────────
  // أي لوحة اتشيّكت أكتر من مرة (بأي طريقة: يدوي/صوت/كاميرا/شاص أو في السجلات)
  // بتتلوّن — وكل لوحة مكررة بلون خاص بيها، **نفس اللون في كل النوافذ** — فالمندوب
  // يعرف فوراً إن السيارة دي ليها أكتر من موقع أو سبق تشييكها.
  //
  // مهم: الصفوف اللي اتصدّرت للسجلات بالفعل (hitsExportedIds/pttExportedIds)
  // مابتتحسبش تاني — عشان نفس التشييك مايظهرش «مكرر» وهو مرة واحدة.
  /** مفتاح لوحة سجل الشاصي (من أعمدة الصف المطابق نفسه) — "" لو مفيش لوحة. */
  const chassisPlateKeyOf = useCallback((r: ChassisRecord): string => (r.row ? plateKeyFromRow(r.row) : ""), []);

  const dupeColorMap = useMemo(() => {
    // نطاق «الشغل الحالي» (اللي لسه في القوائم): يدوي + كاميرا + صوت مع بعض —
    // فلوحة اتشيّكت بطريقتين قبل التصدير تبان مكررة.
    const live: string[] = [];
    for (const e of manualDraft) live.push(plateKey(e.plate));
    for (const h of manualHits) if (!hitsExportedIds.has(h.id)) live.push(plateKey(h.plate));
    for (const r of pttResults) if (!pttExportedIds.has(r.id)) live.push(plateKey(r.plate));
    // نطاق السجلات (الشيت الدائم) ونطاق الشاص — كل واحد لوحده.
    const sheet = fieldEntries.map((e) => plateKey(e.plate));
    const chass = chassisRecords.map((r) => chassisPlateKeyOf(r));
    return buildScopedDupeColorMap([live, sheet, chass], FIELD_DUPE_COLORS.length);
  }, [fieldEntries, manualDraft, manualHits, pttResults, chassisRecords, hitsExportedIds, pttExportedIds, chassisPlateKeyOf]);

  /** كلاس لون اللوحة المكررة (أو "" لو مش مكررة) — يُستخدم في كل الجداول. */
  function dupeBgByKey(key: string): string {
    const i = dupeColorMap.get(key);
    return i === undefined ? "" : FIELD_DUPE_COLORS[i];
  }
  function dupeBg(plate: string): string { return dupeBgByKey(plateKey(plate)); }
  const DUPE_TITLE = "لوحة مكررة — اتشيّكت أكتر من مرة (ممكن يكون ليها أكتر من موقع)";

  const checkIndex = useMemo(() => {
    if (!checkTable || !checkPlateCol) return new Map<string, Record<string, string>>();
    const map = new Map<string, Record<string, string>>();
    for (const row of checkTable.rows) {
      const key = normalizePlate(bankPlateToArabic(String(row[checkPlateCol] ?? "")));
      if (key) map.set(key, row);
    }
    return map;
  }, [checkTable, checkPlateCol]);

  // فهرس الشاصي (VIN مطبّع → صف) مبني من *كل ورقات* ملف التشييك — لمود «شاص».
  // بيدوّر على عمود الشاصي في كل ورقة (بالاسم أو بالمحتوى) ويجمّعهم في فهرس واحد.
  const [chassisIndex, setChassisIndex] = useState<Map<string, Record<string, string>>>(new Map());
  const [chassisSheetFound, setChassisSheetFound] = useState(false);
  const [chassisColByRow, setChassisColByRow] = useState<Map<Record<string, string>, string>>(new Map());
  // فهرس الشاص بيتبنى مرة واحدة لكل ملف، وأول ما المندوب يفتح تبويب «شاص» بس
  const chassisBuiltForRef = useRef<unknown>(null);
  const [chassisBuilding, setChassisBuilding] = useState(false);

  useEffect(() => {
    // **مهم — سبب تجميد الصفحة عند الدخول:** بناء فهرس الشاص بيعمل تحليل كامل
    // تاني لملف الإكسل (readAllSheets = XLSX.read على الـ main thread) وبيولّد
    // نسخة تانية من كل صفوف الملف. مع ملف ٥٣ ألف صف ده ثواني شلل + طفرة ذاكرة
    // كانت بتخلّي سفاري يقتل الصفحة — وكان بيحصل حتى لو المندوب عمره ما فتح
    // «شاص». دلوقتي مابيتبنيش إلا لما يفتح التبويب فعلاً، ومرة واحدة لكل ملف.
    if (mode !== "chassis") return;
    const token = checkFile ?? checkTable;
    if (!token || chassisBuiltForRef.current === token) return;

    let cancelled = false;
    setChassisBuilding(true);
    (async () => {
      const combined = new Map<string, Record<string, string>>();
      const colMap = new Map<Record<string, string>, string>();
      let found = false;
      const addSheet = (headers: string[], rows: Record<string, string>[]) => {
        const col = detectChassisColumn(headers, rows);
        if (!col) return;
        found = true;
        for (const [k, row] of buildChassisIndex(rows, col)) { combined.set(k, row); colMap.set(row, col); }
      };
      // 1) الورقة المحمّلة نفسها — ضمان لو الـ blob مش متاح (ملفات قديمة/مشفّرة).
      if (checkTable) addSheet(checkTable.headers, checkTable.rows);
      // 2) كل ورقات الملف من الـ blob (بيمسك عمود الشاص لو في الورقة التانية).
      if (checkFile) {
        try {
          for (const s of await readAllSheets(checkFile)) addSheet(s.headers, s.rows);
        } catch { /* blob غير قابل للقراءة — نكتفي بالورقة المحمّلة */ }
      }
      if (!cancelled) {
        setChassisIndex(combined);
        setChassisSheetFound(found);
        setChassisColByRow(colMap);
        chassisBuiltForRef.current = token;   // اتبنى لهذا الملف — مايتعادش
      }
      if (!cancelled) setChassisBuilding(false);
    })();
    return () => { cancelled = true; setChassisBuilding(false); };
  }, [checkFile, checkTable, mode]);

  // اللوحة المرتبطة برقم الشاص (من الصف المطابق) — عشان تظهر بارزة قدّام الشاص.
  function chassisPlate(row: Record<string, string>): string | null {
    const col = detectPlateColumn(Object.keys(row), [row]);
    const v = col ? String(row[col] ?? "").trim() : "";
    return v || null;
  }

  // كل بيانات السيارة من الصف المطابق (كل الأعمدة غير الفاضية) — ماعدا عمود الشاصي.
  // + لو فيه لوحة في الصف وموجودة في شيت التشييك بأعمدة زيادة (بنك/ماركة...)، نجمّعها
  //   (join باللوحة) عشان كل البيانات تظهر حتى لو متوزّعة على الورقتين.
  function chassisRowToInfo(row: Record<string, string>): [string, string][] {
    const vinCol = chassisColByRow.get(row);
    const merged: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) if (k !== vinCol && String(v ?? "").trim()) merged[k] = String(v);
    const plate = chassisPlate(row);
    if (plate) {
      const prow = checkIndex.get(normalizePlate(bankPlateToArabic(plate)));
      if (prow && prow !== row) {
        for (const [k, v] of Object.entries(prow)) if (String(v ?? "").trim() && !(k in merged)) merged[k] = String(v);
      }
    }
    return Object.entries(merged);
  }

  function toggleCheckCol(col: string) {
    setSelectedCheckCols((prev) => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  }

  // تفاصيل السيارة من صف التشييك (بالأعمدة المختارة) — تظهر في تنبيه المطلوبة الموحّد.
  function rowToAlertInfo(row: Record<string, string>): [string, string][] {
    return Object.entries(row)
      .filter(([k, v]) =>
        k !== checkPlateCol &&
        String(v ?? "").trim() &&
        (selectedCheckCols.size === 0 || selectedCheckCols.has(k))
      )
      .map(([k, v]) => [k, String(v)] as [string, string]);
  }

  /**
   * بحث اللوحة في ملف التشييك.
   *
   * ⚠️ `opts.silent` (الافتراضي **false** = سلوك النهاردة بالحرف لكل المنادين
   * الحاليين): الدالة دي بتنادي `fireWantedAlert` جوّاها، واللي بيطلّع صفّارة
   * **بتلفّ** لحد ما المندوب يدوس «تم» (WantedAlertOverlay). فممنوع تتنادى
   * مرتين لنفس النبضة — تاني نداء = صفّارة تانية لنفس العربية.
   * `silent: true` بيستخدمه **الرأي التاني بس** لما لوحته تختلف عن اللي الصف
   * طلع بيها: العربية دي **اتنبّه عليها خلاص** وقت النطق، فاللي إحنا محتاجينه
   * هنا تصحيح حالة المطابقة على الصف، مش إنذار جديد.
   */
  function searchInCheck(rawPlate: string, opts?: { silent?: boolean }): PlateResult | null {
    if (!checkPlateCol || checkIndex.size === 0) return null;
    const normalized = normalizePlate(bankPlateToArabic(rawPlate));
    if (!normalized) return null;
    const silent = opts?.silent === true;

    // O(1) exact lookup
    const exactRow = checkIndex.get(normalized);
    if (exactRow) {
      if (!silent) fireWantedAlert({ plate: rawPlate, matchType: "exact", info: rowToAlertInfo(exactRow) });
      return { plate: rawPlate, normalized, found: true, matchType: "exact", row: exactRow };
    }

    // Fuzzy fallback (88% threshold, first-char optimization)
    //
    // **الطرفين لازم يكونوا لوحة سعودية قياسية (٣ حروف + ٤ أرقام).** من غير
    // الشرط ده، مدخل بـ٨ خانات (٤ حروف بالغلط) بيطلع ٨٨٪ ضد لوحة سليمة —
    // لأن فرق خانة من ٨ = 87.5 وبتتقرّب لـ٨٨ — فبيدّي إنذار كاذب لعربية مش
    // مطلوبة (حصل فعلاً في الميدان). وده مابيلغيش أي مطابقة صحيحة: غلطة
    // حقيقية بين لوحتين سليمتين بتطلع ٨٦٪ وكانت مرفوضة أصلاً تحت العتبة.
    if (isStandardPlate(normalized)) {
      let bestSim = 0;
      let bestRow: Record<string, string> | undefined;
      for (const [key, row] of checkIndex) {
        if (key[0] !== normalized[0]) continue;
        if (!isStandardPlate(key)) continue;
        const sim = similarityPercent(normalized, key);
        if (sim > bestSim) { bestSim = sim; bestRow = row; }
      }
      if (bestSim >= 88 && bestRow) {
        if (!silent) fireWantedAlert({ plate: rawPlate, matchType: "fuzzy", similarity: Math.round(bestSim), info: rowToAlertInfo(bestRow) });
        return { plate: rawPlate, normalized, found: true, matchType: "fuzzy", similarity: Math.round(bestSim), row: bestRow };
      }
    }

    return { plate: rawPlate, normalized, found: false };
  }

  // ── Manual ────────────────────────────────────────────────────────────────
  function handleManualChange(val: string) {
    const converted = val.toUpperCase().split("").map((ch) => EN_TO_AR[ch] ?? ch).join("");
    setManualInput(converted);
    setManualResult(null);

    const invalid: string[] = [];
    for (const ch of converted) {
      if (INVALID_AR_LETTERS_SET.has(ch) && !invalid.includes(ch)) invalid.push(ch);
    }

    if (invalid.length > 0) {
      setManualError(`حروف غير موجودة في اللوحات السعودية: ${invalid.join(" ")}`);
    } else {
      setManualError(null);
    }
  }

  function dismissManualError() {
    setManualError(null);
    setManualInput("");
    setManualResult(null);
  }

  function saveHitWithGps(result: PlateResult) {
    const hitId = `${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`;
    lastHitIdRef.current = hitId; // الكارت المعروض بيعبّر عن الصف ده — لو اتصدّر نعلّمه
    const hit: CheckHit = {
      id: hitId, plate: result.plate, row: result.row ?? {},
      found: result.found, matchType: result.matchType, similarity: result.similarity,
      checkedAt: new Date().toISOString(),
    };
    setManualHits((prev) => [hit, ...prev]);
    void fetchGpsForHit(hitId);
  }

  // Read the current position. Prefers the warm coordinate from the always-on
  // watch (gpsService) so stamping a plate is INSTANT — the old per-plate
  // getCurrentPosition() call took seconds each. Falls back to a fresh lookup
  // only when the watch hasn't produced a fix yet.
  async function getCurrentGps(): Promise<{ lat: number; lng: number } | null> {
    const warm = gpsService.getLastCoords();
    if (warm) return { lat: warm.lat, lng: warm.lng };

    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        await Geolocation.requestPermissions();
        const pos = await Geolocation.getCurrentPosition({ timeout: 12000, enableHighAccuracy: false });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch { /* not native or plugin error — fall through to web API */ }

    try {
      if (!navigator.geolocation) return null;
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false })
      );
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }

  // «الأقرب»: يجيب موقع المندوب الحالي ويفعّل ترتيب القوائم بالمسافة. لو مفعّل
  // بالفعل، الضغطة بتطفّيه (toggle) فترجع القوائم لترتيبها الأصلي.
  async function handleNearestIC() {
    if (icNearest) { setIcNearest(false); return; }
    setIcLocating(true);
    try {
      const gps = await getCurrentGps();
      if (!gps) { alert("تعذّر الوصول للموقع. تأكد من إذن الـ GPS."); return; }
      setIcUserLoc(gps);
      setIcNearest(true);
    } finally { setIcLocating(false); }
  }

  // ترتيب أي قائمة لوحات (فيها lat/lng) حسب الأقرب لموقع المندوب. لو الترتيب
  // مش مفعّل بيرجّع القائمة زي ما هي. التحديد في القوائم دي بالـ id مش بالرقم،
  // فإعادة الترتيب مابتخربطش أي لوحة متحدّدة.
  function sortNear<T extends { lat?: number; lng?: number }>(list: T[]): T[] {
    if (!icNearest || !icUserLoc) return list;
    const distOf = (x: T) =>
      x.lat != null && x.lng != null ? haversineKm(icUserLoc.lat, icUserLoc.lng, x.lat, x.lng) : Infinity;
    return [...list].sort((a, b) => distOf(a) - distOf(b));
  }

  // اسم «الحي-الشارع» من إحداثيات — بنفس صيغة خانة حالة الـGPS (شارع - حي).
  // بيتخزّن جوّه row["الحي-الشارع"] فبيظهر في كل نافذة تسجيل وبيتزامن تلقائياً
  // (بيركب في عمود extra مع باقي بيانات الصف — من غير أي تعديل على السيرفر).
  async function regionTextFor(lat: number, lng: number): Promise<string> {
    try {
      const a = await reverseGeocode(lat, lng);
      return [a.street, a.district].filter((s) => s && s !== "غير معروف").join(" - ");
    } catch { return ""; }
  }

  // Fetch GPS for a hit and stamp it (or mark gpsError on failure)
  async function fetchGpsForHit(hitId: string) {
    const gps = await getCurrentGps();
    if (gps) {
      const region = await regionTextFor(gps.lat, gps.lng);
      setManualHits((prev) => prev.map((h) => h.id === hitId ? { ...h, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng), row: region ? { ...h.row, "الحي-الشارع": region } : h.row } : h));
    } else {
      setManualHits((prev) => prev.map((h) => h.id === hitId ? { ...h, gpsError: true } : h));
    }
  }

  // Retry GPS for a specific hit (user taps 📍 button)
  async function retryGpsForHit(hitId: string) {
    setManualHits((prev) => prev.map((h) => h.id === hitId ? { ...h, gpsError: false } : h));
    await fetchGpsForHit(hitId);
  }

  // GPS for a voice (PTT) row — stamps its coords, or marks gpsError on failure.
  async function fetchGpsForPttRow(id: string) {
    const gps = await getCurrentGps();
    if (gps) {
      const region = await regionTextFor(gps.lat, gps.lng);
      setPttResults((prev) => prev.map((r) => r.id === id ? { ...r, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng), row: region ? { ...(r.row ?? {}), "الحي-الشارع": region } : r.row } : r));
    } else {
      setPttResults((prev) => prev.map((r) => r.id === id ? { ...r, gpsError: true } : r));
    }
  }

  async function retryGpsForPttRow(id: string) {
    setPttResults((prev) => prev.map((r) => r.id === id ? { ...r, gpsError: false } : r));
    await fetchGpsForPttRow(id);
  }

  // Manual entry = check against the wanted list AND record it in شيت التسجيلات
  // (with type / location / notes / GPS), just like the registration manual entry.
  async function handleManualSearch() {
    const raw = manualInput.trim();
    if (!raw || manualError) return;
    // صيغة اللوحة لازم تكون 3 حروف + 4 أرقام (سيارة) أو حرفين + 4 أرقام (موتوسيكل)
    if (!isValidManualPlate(raw)) {
      setManualError("تأكد من رقم اللوحة — لازم 3 حروف و4 أرقام (سيارة) أو حرفين و4 أرقام (موتوسيكل)");
      return;
    }
    const result = searchInCheck(raw); // beeps + returns match (or {found:false})
    setManualResult(result);

    const row: Record<string, string> = {};
    if (result?.found && result.row) {
      for (const [k, v] of Object.entries(result.row)) {
        if (k !== checkPlateCol && String(v).trim()) row[k] = v;
      }
    }
    const id = `man-${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`;
    const base: FieldCheckEntry = {
      id,
      agentId: agentIdRef.current ?? undefined,
      plate: result?.plate ?? raw,
      row,
      method: "متشيكة يدوي",
      checkedAt: new Date().toISOString(),
    };
    // Add to the local working list only — NOT the field sheet yet.
    setManualDraft((prev) => [base, ...prev]);
    const gps = await getCurrentGps();
    if (gps) {
      const region = await regionTextFor(gps.lat, gps.lng);
      const withGps: FieldCheckEntry = { ...base, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng), row: region ? { ...base.row, "الحي-الشارع": region } : base.row };
      setManualDraft((prev) => prev.map((e) => (e.id === id ? withGps : e)));
    }

    setManualInput(""); // ready for the next plate; keep the location for the run
  }

  // ── Manual draft (working list) helpers ──────────────────────────────────
  function startDraftEdit(id: string, field: string, current: string) {
    setDraftEdit({ id, field });
    setDraftEditValue(current);
  }

  function applyDraftEdit() {
    if (!draftEdit) return;
    const { id, field } = draftEdit;
    const value = draftEditValue.trim();
    setManualDraft((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e;
        if (field === "plate") return { ...e, plate: value || e.plate };
        const row = { ...e.row };
        if (value) row[field] = value; else delete row[field];
        return { ...e, row };
      })
    );
    setDraftEdit(null);
    setDraftEditValue("");
  }

  function deleteDraftEntry(id: string) {
    setManualDraft((prev) => prev.filter((e) => e.id !== id));
  }

  // اختيار نوع السيارة (حرف مختصر) لصف كاميرا — بيتخزّن في row["النوع"].
  function setHitType(id: string, code: string) {
    setManualHits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const row = { ...h.row };
      if (code) row[TYPE_KEY] = code; else delete row[TYPE_KEY];
      return { ...h, row };
    }));
    void editExportedEntry(id, { type: code });   // لو الصف اتصدّر خلاص، عدّل السجل كمان
  }

  // اختيار نوع السيارة (حرف مختصر) لصف يدوي — بيتخزّن في row["النوع"].
  function setManualDraftType(id: string, code: string) {
    setManualDraft((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const row = { ...e.row };
      if (code) row["النوع"] = code; else delete row["النوع"];
      return { ...e, row };
    }));
  }

  function draftRowText(e: FieldCheckEntry): string {
    const lines = [`🚗 اللوحة: ${e.plate}`];
    for (const [k, v] of Object.entries(e.row)) {
      if (String(v).trim()) lines.push(`${k}: ${v}`);
    }
    if (e.mapsLink) lines.push(`📍 الموقع: ${e.mapsLink}`);
    return lines.join("\n");
  }

  function shareDraftRow(e: FieldCheckEntry) {
    void shareTextViaChooser(draftRowText(e));
  }

  async function copyDraftRow(e: FieldCheckEntry) {
    try { await navigator.clipboard.writeText(draftRowText(e)); } catch { /* ignore */ }
    setManualCopiedId(e.id);
    setTimeout(() => setManualCopiedId(null), 1200);
  }

  // هل لوحة القائمة مطلوبة؟ (للتعليم الأخضر)
  function isDraftMatched(e: FieldCheckEntry): boolean {
    return checkIndex.has(normalizePlate(bankPlateToArabic(e.plate)));
  }

  function toggleManualSel(id: string) {
    setManualSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleManualSelAll() {
    setManualSel((prev) => (prev.size === manualDraft.length ? new Set() : new Set(manualDraft.map((e) => e.id))));
  }
  function shareManualSelected() {
    const rows = manualDraft.filter((e) => manualSel.has(e.id));
    if (!rows.length) return;
    const text = `*لوحات متشيّكة (${rows.length})*\n\n` + rows.map((e, i) => `${i + 1}. ${draftRowText(e)}`).join("\n\n──────────\n\n");
    void shareTextViaChooser(text);
  }
  function deleteManualSelected() {
    setManualDraft((prev) => prev.filter((e) => !manualSel.has(e.id)));
    setManualSel(new Set());
  }
  function clearAllManualDraft() {
    if (manualDraft.length === 0) return;
    if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${manualDraft.length} لوحة من القائمة؟`)) return;
    setManualDraft([]);
    setManualSel(new Set());
  }

  // Commit the whole working list to شيت التسجيلات (field_check), then clear it.
  async function exportManualDraft() {
    if (manualDraft.length === 0) return;
    setManualExporting(true);
    try {
      const toSave = [...manualDraft].reverse(); // keep chronological order in the sheet
      for (const e of toSave) await saveFieldCheckEntry(e);
      setFieldEntries((prev) => [...manualDraft, ...prev]);
      setManualDraft([]);
      alert(`تم تصدير ${toSave.length} لوحة لشيت التسجيلات.`);
    } finally {
      setManualExporting(false);
    }
  }

  async function deleteFieldEntry(id: string) {
    await deleteFieldCheckEntry(id);
    setFieldEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // ── Hit helpers ────────────────────────────────────────────────────────────
  function formatHitText(hit: CheckHit): string {
    const lines = [`🚗 لوحة مطلوبة: ${hit.plate}`];
    for (const [k, v] of Object.entries(hit.row)) {
      if (k === checkPlateCol || !String(v).trim()) continue;
      if (selectedCheckCols.size > 0 && !selectedCheckCols.has(k)) continue;
      lines.push(`${k}: ${v}`);
    }
    if (hit.mapsLink) lines.push(`📍 الموقع: ${hit.mapsLink}`);
    lines.push(`التاريخ: ${formatDate(hit.checkedAt)}`);
    return lines.join("\n");
  }

  function shareHitWhatsApp(hit: CheckHit) {
    void shareTextViaChooser(formatHitText(hit));
  }

  async function copyHit(hit: CheckHit) {
    await navigator.clipboard.writeText(formatHitText(hit));
    setCopiedHitId(hit.id);
    setTimeout(() => setCopiedHitId(null), 1200);
  }

  function deleteHit(id: string) {
    setManualHits((prev) => prev.filter((h) => h.id !== id));
    setHitsSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  function toggleHitSelect(id: string) {
    setHitsSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleHitsAll() {
    setHitsSelected(hitsSelected.size === manualHits.length && manualHits.length > 0
      ? new Set()
      : new Set(manualHits.map((h) => h.id))
    );
  }

  function shareSelectedHits() {
    const hits = manualHits.filter((h) => hitsSelected.has(h.id));
    const text = hits.map((h, i) => `${i + 1}. ${formatHitText(h)}`).join("\n\n──────────\n\n");
    void shareTextViaChooser(`*لوحات مطلوبة (${hits.length})*\n\n${text}`);
  }

  // يصدّر صور الكاميرا لشيت التسجيلات — الجديد بس (اللي ما اتصدّرش قبل كده).
  // التكرار مسموح (لوحة تتصوّر مرتين = صفّين)، لكن إعادة الضغط مابتعيدش تصدير
  // اللي اتصدّر خلاص — بيبعت الجديد اللي اتضاف بعد آخر تصدير فقط.
  async function exportAllHitsToField() {
    const fresh = manualHits.filter((h) => !hitsExportedIds.has(h.id));
    if (fresh.length === 0) { alert("كل اللوحات اتصدّرت خلاص — مفيش لوحات جديدة."); return; }
    const stamp = Date.now();
    const toSave: FieldCheckEntry[] = fresh.map((h, i) => ({
      id: `${stamp}-${i}`,
      agentId: agentIdRef.current ?? undefined,
      plate: h.plate,
      row: h.row,
      srcId: h.id,
      method: "متشيكة بالكاميرا",
      lat: h.lat,
      lng: h.lng,
      mapsLink: h.mapsLink,
      checkedAt: h.checkedAt,
    }));
    try {
      for (const e of toSave) await saveFieldCheckEntry(e);
      setFieldEntries((prev) => [...toSave, ...prev]);
      setHitsExportedIds((s) => { const n = new Set(s); fresh.forEach((h) => n.add(h.id)); return n; });
      alert(`تم تصدير ${toSave.length} لوحة لشيت التسجيلات.`);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر تصدير اللوحات.");
    }
  }

  // ── Field-check sheet (protected) ───────────────────────────────────────────
  const methodLabel: Record<CheckMode, string> = {
    camera: "متشيكة بالكاميرا",
    ptt: "متشيكة بالصوت",
    manual: "متشيكة يدوي",
    chassis: "متشيكة بالشاصي",
    sheet: "متشيكة يدوي", // unused (the sheet tab never exports)
  };

  // Collect the extra (selected) detail columns for a matched row.
  function resultDetails(result: PlateResult): [string, string][] {
    if (!result.row) return [];
    return Object.entries(result.row).filter(([k, v]) =>
      k !== checkPlateCol && String(v).trim() && (selectedCheckCols.size === 0 || selectedCheckCols.has(k))
    );
  }

  // Push a confirmed car onto the field-check sheet, stamping GPS. Duplicates
  // are ALLOWED on purpose — the same plate checked again (another day/area) is
  // a new row; the sheet colour-codes repeated plates so they're easy to spot.
  async function exportToFieldCheck(result: PlateResult, mode: CheckMode, prefetchedGps?: { lat: number; lng: number } | null) {
    if (!result.found) return;
    const gpsPromise = prefetchedGps ? Promise.resolve(prefetchedGps) : getCurrentGps();

    const id = `${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`;
    const base: FieldCheckEntry = {
      id,
      agentId: agentIdRef.current ?? undefined,
      plate: result.plate,
      row: result.row ?? {},
      method: methodLabel[mode],
      checkedAt: new Date().toISOString(),
    };
    // Optimistic add + persist locally
    setFieldEntries((prev) => [base, ...prev]);
    await saveFieldCheckEntry(base);
    // Stamp GPS (best-effort) and persist the update — the image itself is
    // intentionally NOT stored on the sheet.
    const gps = await gpsPromise;
    if (gps) {
      const region = await regionTextFor(gps.lat, gps.lng);
      const withGps: FieldCheckEntry = { ...base, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng), row: region ? { ...base.row, "الحي-الشارع": region } : base.row };
      setFieldEntries((prev) => prev.map((e) => (e.id === id ? withGps : e)));
      await saveFieldCheckEntry(withGps);
    }
  }

  // كل تفاصيل اللوحة (كل أعمدة الصف) — للمشاركة عشان متروحش أي معلومة.
  function allResultDetails(result: PlateResult): [string, string][] {
    if (!result.row) return [];
    return Object.entries(result.row)
      .filter(([k, v]) => k !== checkPlateCol && String(v).trim())
      .map(([k, v]) => [k, String(v)] as [string, string]);
  }

  // Share the camera finding (كل التفاصيل + GPS + الصورة) to WhatsApp.
  async function shareCameraResult(result: PlateResult) {
    if (!cameraImage) return;
    const gps = cameraGps ?? (await getCurrentGps());
    const text = buildPlateShareText({
      plate: result.plate,
      status: result.found ? "متشيكة بالكاميرا — مطلوبة" : "متشيكة بالكاميرا",
      details: allResultDetails(result),
      mapsLink: gps ? toMapsLink(gps.lat, gps.lng) : undefined,
      dateText: formatDate(new Date().toISOString()),
    });
    await shareImageWithText(cameraImage, text, `لوحة-${result.plate}.jpg`, "لوحة السيارة");
  }

  // Correct a wrong (mis-transcribed) plate in the sheet — and teach the
  // learners so the same mistake auto-corrects next time. The sheet stays
  // un-deletable; only the plate value can be fixed.
  async function applyFieldEdit(id: string) {
    const entry = fieldEntries.find((e) => e.id === id);
    const trimmed = editFieldValue.trim();
    setEditingFieldId(null);
    if (!entry || !trimmed || trimmed === entry.plate) return;

    // التعلّم التلقائي الحي متوقّف — التعديل مابيغذّيش خرايط التصحيح المحلية تاني.
    await editFieldEntry(id, { plate: trimmed });
  }

  /**
   * أي تعديل على سجل تشييك (لوحة / نوع / ملاحظات) بيتحفظ **على طول** في قاعدة
   * الجهاز — مش في الذاكرة بس. كده التعديل بيفضل قدام السيارة في التصدير
   * والمشاركة، وبيطلع في نتيجة الفرز بعد كده (الفرز بيبني شيت السجلات من
   * السجلات المحفوظة وبينشر `row` كله).
   */
  async function editFieldEntry(id: string, edit: EntryEdit) {
    const entry = fieldEntries.find((e) => e.id === id);
    if (!entry) return;
    const updated = applyEntryEdit(entry, edit);
    if (updated === entry) return;
    setFieldEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    await saveFieldCheckEntry(updated);
  }

  /**
   * تعديل اتعمل على صف لسه ظاهر في قائمة الصوت/الكاميرا **بعد** ما اتصدّر —
   * لازم يوصل للسجل المحفوظ كمان، وإلا التعديل يفضل في الذاكرة ويضيع.
   * (قبل التصدير مافيش سجل محفوظ، والتصدير بياخد آخر حالة للصف أصلاً.)
   */
  async function editExportedEntry(srcId: string, edit: EntryEdit) {
    const entry = fieldEntries.find((e) => e.srcId === srcId);
    if (entry) await editFieldEntry(entry.id, edit);
  }

  // ── «إظهار اللوحات»: نافذة تعديل/حذف بتأكيد حفظ ──────────────────────────
  function openPlatesEditor() {
    // نسخة عميقة من الصفوف (نسخ row كمان) عشان التعديل يفضل معزول لحد الحفظ.
    setDraftFieldEntries(fieldEntries.map((e) => ({ ...e, row: { ...e.row } })));
    setPeShown(PAGE_STEP);   // نبدأ من أول دفعة كل مرة تتفتح النافذة
    // كل الأعمدة المتاحة تظهر افتراضياً، والبحث يبدأ فاضي.
    const dyn = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
    setPeCols(new Set(dyn));
    setPeSearch("");
    setPlatesEditorOpen(true);
  }
  function peUpdatePlate(id: string, value: string) {
    const norm = value.toUpperCase().split("").map((c) => EN_TO_AR[c] ?? c).join("");
    setDraftFieldEntries((prev) => prev.map((e) => (e.id === id ? { ...e, plate: norm } : e)));
  }
  function peUpdateField(id: string, col: string, value: string) {
    setDraftFieldEntries((prev) => prev.map((e) => (e.id === id ? { ...e, row: { ...e.row, [col]: value } } : e)));
  }
  function peDeleteEntry(id: string) {
    setDraftFieldEntries((prev) => prev.filter((e) => e.id !== id));
  }
  // في تغييرات لسه ماتحفظتش؟ (حذف صف، أو تعديل لوحة/خانة)
  const platesEditorDirty = useMemo(() => {
    if (draftFieldEntries.length !== fieldEntries.length) return true;
    const byId = new Map(fieldEntries.map((e) => [e.id, e]));
    for (const d of draftFieldEntries) {
      const o = byId.get(d.id);
      if (!o) return true;
      if (d.plate !== o.plate) return true;
      const keys = new Set([...Object.keys(d.row), ...Object.keys(o.row)]);
      for (const k of keys) if ((d.row[k] ?? "") !== (o.row[k] ?? "")) return true;
    }
    return false;
  }, [draftFieldEntries, fieldEntries]);

  async function savePlatesEditor() {
    const draftIds = new Set(draftFieldEntries.map((e) => e.id));
    const removed = fieldEntries.filter((e) => !draftIds.has(e.id));
    // تأكيد قبل تطبيق التعديل على شيت السجلات (بما فيه الحذف).
    const delMsg = removed.length > 0 ? ` (هيتمسح ${removed.length} لوحة)` : "";
    if (!window.confirm(`هيتم تطبيق التعديلات على شيت السجلات${delMsg}. موافق؟`)) return;
    for (const r of removed) await deleteFieldCheckEntry(r.id);
    const byId = new Map(fieldEntries.map((e) => [e.id, e]));
    for (const d of draftFieldEntries) {
      const o = byId.get(d.id);
      const changed = !o || d.plate !== o.plate || JSON.stringify(d.row) !== JSON.stringify(o.row);
      // synced=false على المعدّل عشان المزامنة التدريجية ترفعه تاني.
      if (changed && d.plate.trim()) await saveFieldCheckEntry({ ...d, synced: false });
    }
    setFieldEntries(await getAllFieldCheckEntries(agentIdRef.current ?? undefined).catch(() => []));
    setPlatesEditorOpen(false);
  }

  function buildFieldRows() {
    // النوع والملاحظات ليهم أعمدة خاصة تحت — نستبعدهم عشان مايتكرروش
    const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h) && h !== TYPE_KEY && !/ملاح/.test(h)) ?? [];
    return fieldEntries.map((e) => {
      const obj: Record<string, unknown> = { "رقم اللوحة": e.plate };
      obj["النوع"] = typeToCode(entryType(e)) || entryType(e);
      // ملاحظات المندوب — لازم تطلع في التصدير والمشاركة زي ما هي قدام السيارة
      obj[NOTES_KEY] = entryNotes(e);
      obj["الحي-الشارع"] = e.row["الحي-الشارع"] ?? "";
      for (const h of dynCols) obj[h] = e.row[h] ?? "";
      obj["الحالة"] = e.method;
      obj["GPS"] = e.mapsLink ?? "";
      obj["التاريخ"] = formatDate(e.checkedAt);
      return obj;
    });
  }

  async function exportFieldExcel() {
    const blob = buildExcelBlob(buildFieldRows(), "التشييك الميداني");
    try {
      await openExcelBlob(blob, `التشييك-الميداني-${Date.now()}.xlsx`);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    }
  }

  // بناء الشيت + المشاركة شغل تقيل. من غير مؤشّر، المندوب بيفتكر البرنامج
  // متجمّد ويدوس تاني. runShare بيعلّم الزر «جاري التجهيز» **ويسيب الواجهة
  // ترسمه** قبل ما الشغل التقيل يبدأ، ويمنع الضغط المتكرر.
  async function runShare(key: string, fn: () => Promise<void>) {
    if (shareBusy) return;
    setShareBusy(key);
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try { await fn(); }
    catch (err) { alert((err as { message?: string })?.message ?? "تعذّرت المشاركة"); }
    finally { setShareBusy(null); }
  }

  async function shareFieldExcel() {
    await runShare("field", async () => {
      const blob = buildExcelBlob(buildFieldRows(), "التشييك الميداني");
      await shareExcelBlob(blob, "التشييك-الميداني.xlsx", "التشييك الميداني");
    });
  }

  // ── Camera ────────────────────────────────────────────────────────────────
  function resizeImageForOCR(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Open live camera viewfinder; fall back to file input if getUserMedia unavailable.
  // نفرض الكاميرا الخلفية: {exact:"environment"} بيلزم الجهاز يفتح الخلفية (بعض
  // الأجهزة بتتجاهل النص العادي "environment" وبتفتح الأمامية). لو الجهاز مافيهوش
  // كاميرا خلفية (زي الديسكتوب) بنرجّع للتفضيل العادي ثم لمُدخل الملف.
  async function openLiveCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    const dims = { width: { ideal: 1280 }, height: { ideal: 720 } };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: "environment" }, ...dims },
      });
      setLiveStream(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", ...dims },
        });
        setLiveStream(stream);
      } catch {
        cameraInputRef.current?.click();
      }
    }
  }

  function closeLiveCamera() {
    liveStream?.getTracks().forEach((t) => t.stop());
    setLiveStream(null);
  }

  // Capture the frame cropped to the plate zone (center 90% × 42%) and run OCR
  async function captureFromLive() {
    const video = videoRef.current;
    if (!video || !liveStream) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sx = Math.round(0.05 * vw);
    const sy = Math.round(0.29 * vh);
    const sw = Math.round(0.90 * vw);
    const sh = Math.round(0.42 * vh);
    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    closeLiveCamera();
    await runOCR(dataUrl);
  }

  // File-input fallback: read file and run OCR directly (no crop step)
  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runOCR(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleChassisCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => runOCR(reader.result as string, "chassis");
    reader.readAsDataURL(file);
  }

  // كل ما نتيجة شاصي تظهر (كاميرا/رفع/يدوي): صفّر خانات اللوحة، خُد GPS + تاريخ
  // تلقائي، واملأ اسم المنطقة من العنوان، وصفّر الإنذار لو مطلوب.
  function onChassisResult(vin: string, match: ChassisMatch) {
    setCameraChassisResult({ vin, match });
    setChVehicleType("");
    setChNotes("");
    setChRegion("");
    setChSaved(false);
    setChLastSavedId(null);
    setChLocEditing(false);
    setChLocInput("");
    setChLocLink(null);
    setChDate(new Date().toISOString());
    void getCurrentGps().then((g) => {
      setCameraGps(g);
      if (g) regionTextFor(g.lat, g.lng).then((t) => { if (t) setChRegion(t); }).catch(() => {});
    });
    if (match.found) {
      fireWantedAlert({ plate: vin, matchType: match.matchType === "exact" ? "exact" : "fuzzy", similarity: match.similarity, info: match.row ? chassisRowToInfo(match.row) : [] });
    }
  }

  // تطبيق تعديل الموقع (زر «حفظ» أو Enter): يحوّل lat,lng لإحداثيات، أو يخزّن
  // الرابط المختصر زي ما هو كموقع للسيارة، ويقفل وضع التعديل.
  function applyChassisLocation() {
    const v = chLocInput.trim();
    const c = gpsCellCoords(v);
    if (c) { setCameraGps({ lat: c.lat, lng: c.lng }); setChLocLink(null); }
    else if (/^https?:\/\//i.test(v)) { setChLocLink(v); }
    setChLocEditing(false);
  }

  // حفظ سجل الشاصي في شيت رقم الشاص المنفصل (localStorage).
  async function saveChassisRecord() {
    const cr = cameraChassisResult;
    if (!cr) return;
    const gps = cameraGps ?? (await getCurrentGps());
    const rec: ChassisRecord = {
      id: `ch-${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`,
      chassis: cr.vin,
      vehicleType: chVehicleType.trim() || undefined,
      notes: chNotes.trim() || undefined,
      region: chRegion.trim() || undefined,
      row: cr.match.row,
      found: cr.match.found,
      lat: chLocLink ? undefined : gps?.lat,
      lng: chLocLink ? undefined : gps?.lng,
      mapsLink: chLocLink || (gps ? toMapsLink(gps.lat, gps.lng) : undefined),
      checkedAt: chDate || new Date().toISOString(),
    };
    setChassisRecords(addChassisRecord(rec));
    setChSaved(true);
    setChLastSavedId(rec.id);
    void pushOneChassis(agentIdRef.current, rec); // رفع الجديد للسيرفر على طول
  }

  // تصدير كل سجلات الشاصي لشيت «شيت رقم الشاص».
  async function exportChassisSheet() {
    const recs = getChassisRecords();
    if (!recs.length) { alert("مفيش سجلات شاصي بعد."); return; }
    const rows = recs.map((r) => ({
      "رقم الشاص": r.chassis,
      "نوع السيارة": r.vehicleType ?? "",
      "ملاحظات": r.notes ?? "",
      "اسم المنطقة": r.region ?? "",
      "GPS": r.mapsLink ?? (r.lat != null && r.lng != null ? `${r.lat},${r.lng}` : ""),
      "التاريخ": formatDate(r.checkedAt),
      "الحالة": r.found ? "مطلوب" : "غير مطلوب",
    }));
    const blob = buildExcelBlob(rows, "شيت رقم الشاص");
    await shareExcelBlob(blob, `شيت-رقم-الشاص-${Date.now()}.xlsx`, "شيت رقم الشاص");
  }

  // مشاركة شيت رقم الشاص كنص على واتساب.
  function shareChassisWhatsApp() {
    const recs = getChassisRecords();
    if (!recs.length) { alert("مفيش سجلات شاصي بعد."); return; }
    const text = `*شيت رقم الشاص (${recs.length})*\n\n` + recs.map((r, i) => {
      const lines = [`${i + 1}. الشاص: ${r.chassis}`, `الحالة: ${r.found ? "مطلوب" : "غير مطلوب"}`];
      if (r.vehicleType) lines.push(`النوع: ${r.vehicleType}`);
      if (r.notes) lines.push(`ملاحظات: ${r.notes}`);
      if (r.region) lines.push(`المنطقة: ${r.region}`);
      if (r.mapsLink) lines.push(`📍 الموقع: ${r.mapsLink}`);
      return lines.join("\n");
    }).join("\n\n──────────\n\n");
    void shareTextViaChooser(text);
  }

  // Read the VIN/chassis from a (resized) image and check it against the
  // chassis column of the loaded check file — the شاص counterpart of the plate OCR.
  async function processChassis(resized: string) {
    let vin: string | null = null;
    let debugLine = "";
    try {
      const base64 = resized.split(",")[1];
      let groqKey = "";
      try { groqKey = localStorage.getItem("ph:registration:groqApiKey") || ""; } catch { /* storage off */ }
      const apiRes = await fetch("/api/read-plate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ image: base64, mediaType: "image/jpeg", apiKey: groqKey.trim(), mode: "chassis" }),
      });
      const json = await apiRes.json().catch(() => null);
      if (apiRes.ok && json?.chassis) { vin = String(json.chassis); debugLine = `[VIN] ${vin}`; }
      else { const hint = json?.hint ?? json?.detail ?? json?.error ?? `HTTP ${apiRes.status}`; debugLine = `خطأ OCR: ${String(hint).slice(0, 120)}`; }
    } catch (err) {
      debugLine = `شبكة: ${err instanceof Error ? err.message : String(err)}`.slice(0, 100);
    }
    setCameraRawText(debugLine || null);
    setCameraInputPlate(vin ?? "");
    if (vin) {
      onChassisResult(vin, matchChassis(vin, chassisIndex));
    } else {
      setCameraError("لم يُتعرَّف على رقم الشاصي — صحّح أدناه يدوياً");
    }
  }

  // Run OCR on a dataUrl (plate by default, or VIN when kind==="chassis")
  async function runOCR(dataUrl: string, kind: "plate" | "chassis" = "plate") {
    setCameraImage(dataUrl);
    setCameraLoading(true);
    setCameraError(null);
    setCameraResult(null);
    setCameraChassisResult(null);
    setCameraRawText(null);
    setCameraGps(null);
    try {
      const resized = await resizeImageForOCR(dataUrl);
      if (kind === "chassis") { await processChassis(resized); return; }
      let plate: string | null = null;
      let debugLine = "";

      // ── Try 1: Groq API ────────────────────────────────────────────────────
      try {
        const base64 = resized.split(",")[1];
        // Agent's own Groq key (same one entered on the registration page,
        // shared via localStorage) so camera usage bills to their account,
        // not a shared one. Empty → server falls back / on-device TextDetector.
        let groqKey = "";
        try { groqKey = localStorage.getItem("ph:registration:groqApiKey") || ""; } catch { /* storage off */ }
        const apiRes = await fetch("/api/read-plate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeader()) },
          body: JSON.stringify({ image: base64, mediaType: "image/jpeg", apiKey: groqKey.trim() }),
        });
        const json = await apiRes.json().catch(() => null);
        if (apiRes.ok && json?.plate) {
          plate = json.plate as string;
          debugLine = `[Claude] ${plate}`;
        } else {
          const hint = json?.hint ?? json?.detail ?? json?.error ?? `HTTP ${apiRes.status}`;
          debugLine = `خطأ OCR: ${String(hint).slice(0, 120)}`;
          console.warn("OCR error:", hint);
        }
      } catch (err) {
        debugLine = `شبكة: ${err instanceof Error ? err.message : String(err)}`.slice(0, 100);
      }

      // ── Try 2: native TextDetector (Chrome/Android ML Kit) ────────────────
      if (!plate && typeof window !== "undefined" && "TextDetector" in window) {
        try {
          const imgEl = document.createElement("img");
          await new Promise<void>((res, rej) => { imgEl.onload = () => res(); imgEl.onerror = () => rej(new Error("img")); imgEl.src = resized; });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).TextDetector();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blocks: Array<{ rawValue: string }> = await detector.detect(imgEl);
          if (blocks.length > 0) {
            const combined = blocks.map((b) => b.rawValue).join(" ").trim();
            for (const b of blocks) {
              plate = extractPlateFromOcrText(b.rawValue);
              if (plate) break;
            }
            if (!plate) plate = extractPlateFromOcrText(combined);
            if (plate) debugLine = `[ML Kit] ${plate}`;
          }
        } catch { /* TextDetector not available */ }
      }

      setCameraRawText(debugLine || null);
      const displayPlate = plate ? (bankPlateToArabic(plate) || plate) : null;
      setCameraInputPlate(displayPlate ?? "");
      if (displayPlate) {
        const result = searchInCheck(displayPlate);
        setCameraResult(result);
        // تُسجّل كل صورة اتصوّرت في قائمة الكاميرا تحت — مطلوبة أو مش مطلوبة —
        // مع موقعها، وتتصدّر بعدين لشيت السجلات. (searchInCheck بيطلّع التنبيه
        // لوحده لو مطلوبة.)
        if (result) {
          saveHitWithGps(result);
          void getCurrentGps().then(setCameraGps); // GPS of where the photo was taken
        }
      } else {
        setCameraError("لم يُتعرَّف على نمط لوحة — صحّح أدناه يدوياً");
      }
    } catch {
      setCameraError("خطأ في قراءة الصورة — جرّب مرة أخرى");
    } finally {
      setCameraLoading(false);
      // تصفير قيمة الخانات عشان اختيار نفس الصورة تاني (بعد المسح) يشتغل.
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (chassisCamInputRef.current) chassisCamInputRef.current.value = "";
      if (chassisGalInputRef.current) chassisGalInputRef.current.value = "";
    }
  }

  function resetCamera() {
    closeLiveCamera();
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (chassisCamInputRef.current) chassisCamInputRef.current.value = "";
    if (chassisGalInputRef.current) chassisGalInputRef.current.value = "";
    setCameraImage(null);
    setCameraResult(null);
    setCameraChassisResult(null);
    setChSaved(false);
    setChLastSavedId(null);
    setChLocEditing(false);
    setChLocInput("");
    setChLocLink(null);
    setCameraError(null);
    setCameraRawText(null);
    setCameraInputPlate("");
    setCameraGps(null);
  }

  // ── PTT ───────────────────────────────────────────────────────────────────
  // addResult: parse one utterance and append to results list
  function addPttResult(utterance: string) {
    if (pttPausedRef.current) return; // إيقاف مؤقت — نتجاهل أي كلام لحد ما يكمّل
    logRawTranscript(utterance); // ديبج الأدمن — النص الخام قبل أي تحليل
    // Pull the vehicle type (ونيت/فان/مصدومة/…) out FIRST so it lands in its
    // own column and isn't misread as plate letters.
    const { vehicleType, rest } = extractVehicleType(utterance);

    // أول محاولة: ترجمة حرف حرف بالنطق المصري ("دال حه ره واحد اتنين...")
    const egyptianMapped = mapEgyptianSpeech(rest);
    const egyptianNorm   = normalizePlate(bankPlateToArabic(egyptianMapped));
    const letterPart     = egyptianNorm.replace(/[0-9]/g, "");
    const hasDigits      = /[0-9]/.test(egyptianNorm);
    // لوحة سعودية صحيحة: 1-3 حروف + أرقام — لو أكثر من 3 حروف يعني كلمات ما اتحولتش
    const isPlausiblePlate = hasDigits && letterPart.length >= 1 && letterPart.length <= 3;

    const rawPlate = isPlausiblePlate
      ? egyptianMapped
      : (parsePlateFromTranscript(rest).plate || "");

    if (!rawPlate) return;
    addOnePttRow(rawPlate, vehicleType);
  }

  // يضيف صف لوحة واحدة للقائمة: تصحيح متعلَّم → تشييك ضد الملف → صفّ + تنبيه لو
  // مطلوبة. مشترك بين المحرك المحلي (لوحة لكل نتيجة) ومسار Whisper (كل لوحة
  // بيطلّعها sessionParser من المقطع). idx بيميّز الـ id لو أكتر من لوحة اتضافت
  // في نفس الملّي ثانية.
  function addOnePttRow(
    rawPlate: string, vehicleType?: string, idx = 0, uncertain?: boolean,
    // من أنهي سجل في أنهي رسالة. الافتراضي = سجل وحيد بلا ترحيل، وده بالظبط
    // حالة المحرك المحلي (لوحة واحدة لكل نتيجة) ⇒ سلوكه بالحرف زي ما هو.
    emit: { index: number; count: number; fromCarry: boolean } = { index: 0, count: 1, fromCarry: false },
  ) {
    if (pttPausedRef.current) return; // إيقاف مؤقت — نتجاهل أي لوحة لحد ما يكمّل
    // التعلّم التلقائي الحي (blend/confusions) **متوقّف** — كان بيلوّث النتايج
    // بتصحيحات غير مُدقّقة (أخطاء غريبة زي «الا5121»). التفريغ دلوقتي = Deepgram +
    // الكلمات المفتاحية بس؛ التحسين الحقيقي هيبقى من الموديل المدرّب على داتا موثوقة.
    const norm = normalizePlate(bankPlateToArabic(rawPlate));
    const corrected = norm;

    // فلتر صارم — لوحات بس (٣ حروف + ٤ أرقام). أي كلام بعيد عن شكل اللوحة يتسمع
    // ويتجاهل (ما يتفرّغش). شبكة أمان: القريب جداً من اللوحة (٢-٣ حروف + ٣-٤ أرقام)
    // بيظهر بعلامة «راجع» عشان لوحة حقيقية اتسمعت ناقصة ما تفوتش.
    const cLetters = corrected.replace(/[0-9٠-٩]/g, "");
    const cDigits = corrected.replace(/[^0-9٠-٩]/g, "");
    if (cLetters.length < 2 || cLetters.length > 3 || cDigits.length < 3 || cDigits.length > 4) return;
    // حارس التكرار: نفس النطق أحياناً بيتفرّغ مرتين (Deepgram بيبعت النتيجة النهائية
    // مرتين — نهاية المقطع + نقطة الصمت). لو نفس اللوحة اتضافت خلال ثانيتين (مستحيل
    // المندوب ينطقها مرتين بالسرعة دي) نتجاهل التكرار.
    const nowMs = Date.now();
    const le = lastPttEmitRef.current;
    if (le && le.norm === norm && nowMs - le.at < 2000) return;
    lastPttEmitRef.current = { norm, at: nowMs };
    const isComplete = cLetters.length === 3 && cDigits.length === 4 && !plateNeedsReview(corrected);

    const result = searchInCheck(corrected);
    if (!result) return; // no check file loaded

    // Every spoken plate becomes a compact row (found or not), tagged with the
    // current location name; `originalPlate` keeps the pre-correction value so
    // a later edit can teach the learners. GPS is captured in the background.
    const id = `${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}-${idx}`;
    const row: PttRow = {
      id,
      plate: result.plate,
      originalPlate: norm,
      found: result.found,
      matchType: result.matchType,
      similarity: result.similarity,
      row: result.row,
      vehicleType,
      needsReview: !isComplete || !!uncertain, // مش كاملة (٣+٤) أو المحلّل شكّك (رقم ناقص اتحشى صفر) → «راجع»
      checkedAt: new Date().toISOString(),
      // توقيت + ثقة من آخر نتيجة نهائية (Deepgram) — لجمع التدريب فقط (لو المفتاح شغّال).
      sessionId: pttSessionIdRef.current || undefined,
      startMs: curTimingRef.current?.startMs,
      endMs: curTimingRef.current?.endMs,
      wordConfidenceOk: curTimingRef.current?.confOk ?? false,
    };
    // ترتيب الصف في الجلسة — الكارت بيتكتب للأحدث بس (`canJudgeWriteAlert`).
    const seq = ++pttSeqRef.current;
    pttRowSeqRef.current.set(id, seq);
    // الصف بقى «موجود» من دلوقتي — قبل أي إعادة رسم، فرد سريع مايتحسبش لصف ممسوح.
    pttRowIdsRef.current.add(id);
    setPttResults((prev) => [row, ...prev]);
    // A matched (wanted) plate — exact OR suspected — pops the big alert.
    if (result.found) setPttAlert(row);
    void fetchGpsForPttRow(id);

    // ── الرأي التاني (طيّار المالك) — **آخر حاجة**، بعد ما الصف اترسم وإنذاره
    //    طلع. الاستدعاء `void` بلا انتظار، فمافيش أي ملي ثانية تأخير على الواجهة.
    //    التوقيت بيتصوّر **دلوقتي** لأن أول نتيجة نهائية جديدة بتكتب فوق
    //    judgeTimingRef قبل ما الرد يوصل.
    if (judgeArmedRef.current) {
      const t = judgeTimingRef.current;
      void requestSecondOpinion(row, t ? { ...t } : null, judgePausedMsRef.current, seq, emit);
    }
  }

  /**
   * يطلب رأي موديلنا المدرَّب على نفس النبضة، ويدمجه بـ`fusePlate`، ويحدّث الصف
   * **في مكانه**. الدالة كلها اختيارية: أي خروج بدري = الصف يفضل زي ما هو
   * (Deepgram لوحده) + سطر في سجل القياس يقول ليه سكتنا.
   *
   * ─── قرار التقطيع: بادئة الجلسة + القصّ على السيرفر ──────────────────────────
   *  المشكلة: `pttAudioChunksRef` فيه أجزاء ٢٥٠ms من تيار webm/opus **واحد
   *  متصل**. الترويسة (EBML + Segment + Tracks) في **الجزء الأول بس**، فأي
   *  `new Blob(chunks.slice(i, j))` من الوسط **مش ملف يتفك** أصلاً.
   *  المشحون: نبعت `chunks[base .. آخر جزء فيه اللوحة]` (بادئة من ترويسة التيار
   *  الحالي) + `start`/`end` والخدمة هي اللي تقصّ بـffmpeg. **متحقَّق منه**:
   *  بادئة webm حي مقطوعة (بلا ذيل ولا Cues) بتتفك rc=0، والقصّ بيرجّع النافذة
   *  بالظبط (٣٫٥٠٠ث = ٥٦٠٠٠ عيّنة)، وتكلفة البحث **ثابتة** (٢٢٥ms عند -ss 0
   *  و٢٢٥ms عند -ss 580 على بادئة ٢٫٩٨ ميجا / ١٠ دقايق) لأن `-ss` **قبل** `-i`
   *  بيعدّي الحزم بلا فك ترميز.
   *  البدايل اللي اترفضت:
   *   • لزق الجزء صفر + أجزاء الوسط: صغير بس **غير متحقَّق منه** — الأجزاء مش
   *     مضمونة إنها متراصّة على حدود Cluster، والطوابع الزمنية مطلقة فالملف
   *     الناتج بيبقى فيه سكوت أول بطول startMs، والسكوت بيحرّك `mean_db` اللي
   *     بوابة الثقة بتقرا منه ⇒ ممكن يقلب قرار البوابة. مرفوض بلا قياس.
   *   • مسجّل تاني على نفس الـMediaStream: كان بيدّي ملفات مستقلة، بس بيضاعف
   *     ترميز opus على تليفون بيبث لايف، وحدود النبضة بنعرفها **بعد** is_final
   *     فالتقطيع بيقصّ لوحات. أي ضغط زيادة على المسار الحي مرفوض — هو الأساس.
   *   • APK جديد (تسجيل خام PCM من الأصل): مش محتاجينه — كل ده JS بيتنزّل من
   *     Vercel فوراً، والشرط كان «بلا إعادة بناء APK».
   *  السقف: لو البادئة > `JUDGE_MAX_PREFIX_BYTES` (٢ ميجا ≈ ٧ دقايق جلسة على
   *  المقيس ~٥ كيلو/ث) بنسكت ونسجّل `prefix_too_large` — أحسن من إننا نزنق نفس
   *  الرفع اللي بث Deepgram (الأساس) عايش عليه.
   *
   * ─── النافذة: نطق **آخر لوحة** متحقَّق منه، مش حدود الرسالة ──────────────────
   *  الدالة دي **مابتحسبش** النافذة: بتمرّر المكوّنات الخام (الكلمات + لوحة الصف +
   *  نهاية النبضة السابقة + لحظة الوصول + جيل التيار) لـ`planPlateWindow` جوّه
   *  `planJudgeSlice`. تطوّر القاعدة، وكله مقيس على صوت المالك:
   *   ١. لحظة الوصول → نافذة ٥٫٩ث فيها **لوحتين** في ٢٣ من ٢٥ (الوصول متأخّر ١ث).
   *   ٢. min(starts)…max(ends) + سقف ٣٤٠٠ مربوط على النهاية → ٦ من ٢٥ لسه فيها
   *      كلام الجار (١٠–٥٤٠ms)، والسقف كان بياكل من قدّام النطق كمان (لغاية
   *      ١٨٦٠ms، منها ٢١٠ms كلام حقيقي) لأنه مايعرفش يفرّق بين «لزق نبضتين»
   *      و«لوحة بوقفة جوّانية».
   *   ٣. نطق آخر لوحة من ذرّات `plateAtoms`، ومتحقَّق إنه يطبّع لنفس لوحة الصف
   *      بالظبط ⇒ ٠ من ٢٥ فيها كلام الجار، وولا ms من صوت الصف مقصوص. فشل
   *      التحقّق = سكوت `window_unproven`، مش نافذة على تخمين.
   *   ٤. **الحالي**: نفس (٣)، وإن فشل بنعيد **نفس** البناء والتحقّق على كلمات آخر
   *      `JUDGE_FINALS_HISTORY` نتيجة **موصولة** — عشان اللوحة اللي المالك قالها
   *      «حروف … سكتة … أرقام» (٩ من ٣٠ مقيسة، الوقفة توصل ٩٣٠ms) بيبقى نصّها في
   *      نتيجة والباقي في اللي بعدها. الحدود ساعتها بكلمات الجار نفسها + سقف
   *      ٤٢٧٠ms، وفوقه سكوت (`split_too_long`) — **مش** قصّ، لأن القصّ هنا بيرمي
   *      حروف اللوحة.
   *  واللي فضل من بوابة الإصدار: الصف اللي مش السجل الوحيد لرسالته أو نصّه اتلمّ
   *  من رسالتين **ممنوع** ياخد نافذة رسالة (احتياطي min/max أو ساعة الحقيقة) —
   *  نافذة مثبَتة أو سكوت. البوابة القديمة كانت بتسكّته أصلاً، والمقيس إنها كانت
   *  بتسكّت لوحات الموديل جابها **صح** (كهط٥٢٥١ · بدك١٥٨٨).
   */
  async function requestSecondOpinion(
    baseRow: PttRow,
    timing: JudgeTiming | null,
    pausedMs: number,
    /** ترتيب الصف في الجلسة — للحرس على كارت الإنذار. */
    seq: number,
    /** من أنهي سجل في أنهي رسالة طلع الصف — بيحدّد هل النافذة لازم تبقى مثبَتة. */
    emit: { index: number; count: number; fromCarry: boolean },
  ) {
    const rowId = baseRow.id;
    // اللوحة اللي الصف طلع بيها = `corrected` بالحرف (`row.plate = result.plate`،
    // و`result.plate` هو نفس النص اللي اندَه بيه `searchInCheck`).
    const dgPlateNorm = baseRow.plate;
    // هل الصفّارة اتشغّلت وقت النطق؟ `searchInCheck` غير الصامت بينادي
    // `fireWantedAlert` جوّاه لو لقى، و`row.found = result.found` — فدي بالظبط
    // «صفّارة واحدة اتشغّلت خلاص».
    const wasFound = baseRow.found;
    const mods = judgeModsRef.current;
    const owner = judgeOwnerIdRef.current;
    if (!judgeArmedRef.current || !mods || !owner) return;
    const t0 = Date.now();
    const sessionId = pttSessionIdRef.current;
    /** سطر «سكتنا وده السبب» — القياس لازم يبان فيه المسكوت زي المجاوب. */
    const logSkip = (why: string, extra: Record<string, unknown> = {}) => {
      setJudgeLast(why);                 // يبان فوراً في مربّع المالك
      // والعدّاد كمان: المسكوت بيتعدّ زي المجاوب، فجلسة صفر بتبان صفر.
      setJudgeCounts((c) => mods.log.bumpJudgeCounts(c, why, false));
      void mods.log.appendJudgeLog(mods.log.newJudgeLogRecord({
        id: rowId, agentId: owner, sessionId,
        dgPlate: dgPlateNorm, fusedPlate: dgPlateNorm,
        source: "skipped", reason: why, skipped: why,
        // حدود كلام النبضة زي ما Deepgram قالها (زمن ميديا) — للتحليل بعدين.
        startMs: timing?.wordStartMs ?? null, endMs: timing?.wordEndMs ?? null,
        ...extra,
      }));
    };
    // الطابور: لو السقف ملآن وفيه مكان، النبضة **تستنى** بدل ما تتضيّع. القرار
    // من نفس الدالة النقية اللي `planJudgeSlice` بينادّيها (فمستحيل يختلفوا)،
    // والدرين بيحصل أول ما سلوت يفضى (في `finally` تحت).
    if (mods.client.planJudgeAdmission({
      inflight: judgeInflightRef.current, queued: judgeQueueRef.current.length,
      maxInflight: JUDGE_MAX_INFLIGHT, maxQueue: JUDGE_MAX_QUEUE,
    }) === "queue") {
      judgeQueueRef.current.push({
        row: baseRow, timing, pausedMs, seq, emit,
        streamSeq: dgStreamSeqRef.current, sessionId,
      });
      return;
    }
    try {
      // الإعداد بيتقرا كل نبضة عشان لزق النفق/التوكن وسط الجلسة يشتغل فوراً.
      const cfg = readJudgeEndpoint();
      const all = pttAudioChunksRef.current;
      // كل قرارات السكوت + حساب النافذة في **دالة نقية واحدة** مغطّاة باختبار
      // (`planJudgeSlice`): نفس الأرقام بالحرف، بس كل سبب بقى قابل للوصول
      // والإثبات، والنافذة مضمون إنها محدودة (مافيش قصّة بلا ترويسة تيار، ولا
      // نافذة NaN بتتسجّل بسبب غلط، ولا بادئة أكبر من السقف).
      const plan = mods.client.planJudgeSlice({
        hasConfig: !!cfg,
        // مافيش نافذة جاهزة — المكوّنات الخام بس، والمخطِّط هو اللي يحسب.
        timing: null,
        // الكلمات + لوحة الصف = المسار المثبَت: نطق **آخر لوحة** متحقَّق إنه
        // لوحة الصف دي بالظبط. فشل التحقّق = سكوت `window_unproven`.
        words: timing?.words ?? null,
        // وتاريخ آخر نتايج نهائية: لو لوحة الصف مش في كلمات النتيجة الأخيرة
        // (اتقالت «حروف … سكتة … أرقام») المخطِّط يعيد نفس البناء والتحقّق على
        // الكلمات موصولة. فشل التحقّق = سكوت زي النهاردة بالحرف.
        finals: timing?.finals ?? null,
        expectPlateNorm: dgPlateNorm,
        prevWordEndMs: timing?.prevWordEndMs ?? null,
        // ومين أصدر الصف — رسالة بلوحتين أو لوحة اتلمّت من رسالتين = سكوت.
        emit,
        wordStartMs: timing?.wordStartMs ?? null,
        wordEndMs: timing?.wordEndMs ?? null,
        arrivalMs: timing?.arrivalMs ?? null,
        mediaElapsedMs: timing?.mediaElapsedMs ?? null,
        // `undefined` لما مافيش توقيت خالص — عشان السبب يطلع `no_timing` (السبب
        // الحقيقي) مش `stale_stream`. الأخير لـ**رسالة موجودة** من تيار قديم بس.
        streamFresh: timing?.streamFresh,
        audioDrops: timing?.audioDrops ?? 0,
        inflight: judgeInflightRef.current,
        queued: judgeQueueRef.current.length,
        chunkSizes: all.map((p) => p.size),
        base: judgeStreamBaseRef.current,
        pausedMs,
        maxInflight: JUDGE_MAX_INFLIGHT,
        maxQueue: JUDGE_MAX_QUEUE,
        chunkMs: JUDGE_CHUNK_MS,
      });
      if (plan.skip !== null || !cfg) {
        logSkip(plan.skip ?? "not_configured", plan.bytes == null ? {} : { bytes: plan.bytes });
        return;
      }
      const { base, endIdx, startMs, endMs, bytes } = plan;
      const parts = all.slice(base, endIdx);

      const mime = pttAudioMimeRef.current;
      const blob = new Blob(parts, { type: mime });
      let errCode: string | null = null;
      judgeInflightRef.current += 1;
      let resp: Awaited<ReturnType<JudgeMods["client"]["postAudioForPlate"]>> = null;
      try {
        resp = await mods.client.postAudioForPlate(blob, {
          transcribeUrl: cfg.transcribeUrl, token: cfg.token, mimeType: mime,
          startMs, endMs, debug: true,
          onError: (c) => { errCode = c; },
        });
      } finally {
        judgeInflightRef.current -= 1;
        drainJudgeQueue();          // سلوت فضي ⇒ اللي مستني يمشي
      }
      const clientMs = Date.now() - t0;
      if (!resp) { logSkip(errCode ?? "no_answer", { clientMs, bytes }); return; }

      // الدمج — دالة نقية مغطّاة بـ٤٠ اختبار. الاتفاق = الحالة الوحيدة بلا مراجعة.
      const fused = mods.fusion.fusePlate({
        deepgramPlate: dgPlateNorm,
        ours: {
          plate: resp.plate, accepted: resp.accepted, reason: resp.refuseReason ?? "ok",
          meanLogprob: resp.meanLogprob, minLogprob: resp.minLogprob, noSpeechProb: resp.noSpeechProb,
        },
        // الشيت هو الدليل الخارجي الوحيد وقت التنفيذ. قراءة Map بس — بلا إنذار.
        onCheckSheet: (p) => checkIndex.has(p),
      });

      // لوحة مختلفة ⇒ نعيد البحث **صامت**. الصفّارة اتشغّلت للنبضة دي خلاص،
      // وتاني نداء عادي كان هيلفّ صفّارة تانية لنفس العربية.
      const changed = !!fused.plate && fused.plate !== dgPlateNorm;
      const re = changed ? searchInCheck(fused.plate, { silent: true }) : null;

      // هل الترقيع هيتطبّق فعلاً؟ محسوبة **بره** الـupdater عشان قرار الإنذار تحت
      // يبقى مبنيّ على نفس الشرط بالظبط (الـupdater دالة نقية — ممنوع أي أثر
      // جانبي جوّاها، وReact في StrictMode بينادّيها مرتين).
      // `pttEditedIdsRef` ريف فالقراءة دايماً حيّة. وفحص `r.plate !== dgPlateNorm`
      // اللي جوّه الـupdater مايقدرش يختلف عنها: `applyPttEdit` هو **الكاتب
      // الوحيد** للوحة صف موجود (page.tsx:2277-2279) وبيسجّل الـid في الريف قبلها
      // (page.tsx:2274)، وباقي الكُتّاب بيلمسوا vehicleType/GPS بس.
      const userEdited = pttEditedIdsRef.current.has(rowId);
      // والصف لسه موجود؟ `deletePttRow` بيشيل الصف ويقفل الكارت بس **مابيلغيش**
      // الطلب اللي في الطريق. بلا الفحص ده كان `patched` بتفضل `true` لصف ممسوح
      // ⇒ `fire` ⇒ صفّارة + كارت «مطلوبة» لصف مش في القائمة (وحرس الترتيب تحت
      // بيسمح بالكتابة لأن الكارت مقفول). الريف قراءة حيّة، فمافيش سباق.
      const rowAlive = pttRowIdsRef.current.has(rowId);
      const patched = changed && !userEdited && !!re && rowAlive;

      setPttResults((prev) => prev.map((r) => {
        if (r.id !== rowId) return r;
        // المندوب عدّل الصف بإيده وسط ما الرد في الطريق؟ عينه أعلى من الاتنين.
        const patch = (patched && r.plate === dgPlateNorm && re)
          ? { plate: fused.plate, found: re.found, matchType: re.matchType, similarity: re.similarity, row: re.row }
          : {};
        return {
          ...r,
          ...patch,
          // اتجاه واحد: بنزوّد علامة المراجعة، وعمرنا ما نشيل واحدة موجودة.
          needsReview: r.needsReview || fused.needsReview,
          judge: {
            oursPlate: resp!.plate, dgPlate: dgPlateNorm, fusedPlate: fused.plate,
            source: fused.source, reason: fused.reason, agreed: fused.agreed,
            needsReview: fused.needsReview, accepted: resp!.accepted,
            refuseReason: resp!.refuseReason, serverMs: resp!.serverMs,
          },
        };
      }));

      // ── مزامنة الإنذار مع الحالة الجديدة — **صفّارة واحدة بالظبط لكل نبضة** ──
      // إعادة البحث فوق كانت صامتة عن قصد، فلولا البلوك ده كان الصف يقدر يقلب
      // «مطلوبة» بلا صفّارة وبلا كارت (F→T)، أو يقلب «غير مطلوبة» والكارت فاضل
      // واقف على اللوحة القديمة «مطلوبة» بعد ما الصفّارة اتشغّلت (T→F، وبيحصل
      // فعلاً من مسار fuzzy ≥٨٨٪ لأن `found=true` بينما `checkIndex.has()=false`).
      // القرار في دالة نقية مغطّاة بـ٣٢ حالة: lib/plateFusion.decideJudgeAlertAction.
      const alertAction = mods.fusion.decideJudgeAlertAction({
        patched, prevPlate: dgPlateNorm, nextPlate: fused.plate,
        wasFound, nowFound: re?.found === true,
        // حزام تانٍ مستقل: صف اتمسح = مافيش أي فعل، حتى لو `patched` اتحسبت غلط.
        rowAlive,
      });
      if (alertAction === "fire" && re) {
        // `wasFound=false` ⇒ نداء النطق مافجّرش إنذار، وإعادة البحث كانت صامتة
        // ⇒ دي أول وآخر صفّارة للنبضة دي.
        fireWantedAlert({
          plate: fused.plate,
          matchType: re.matchType,
          similarity: re.similarity,
          info: re.row ? rowToAlertInfo(re.row) : undefined,
        });
        // نفس سلوك النطق: أحدث لوحة مطلوبة هي اللي تكسب الكارت — بس **الترتيب
        // لازم يتحسب**. الكتابة كانت غير مشروطة، وبسقف ٢ + طابور ٢ بقى فيه
        // ردّين في الهوا، فرد **متأخّر** لصف قديم كان يقدر يمسح كارت أحدث
        // (٥ من ٢٤ زوج صفوف متتابعة في جلسة المالك بينهم ١٫٥٦–٢٫٣٩ث فقط).
        // القرار في دالة نقية (`canJudgeWriteAlert`) وجوّه updater عشان يتاخد
        // على الحالة **الحيّة** — نفس مصطلح فرعي `clear`/`repoint` تحت.
        // ⚠️ الصفّارة فوق **بره** الحرس عن قصد: نبضة قلبت «مطلوبة» لازم تسمع
        //    مرة واحدة بالظبط أياً كان الكارت المعروض. الحرس على العرض بس.
        // الكارت بيقرا id/plate/found/matchType/similarity/row بس، وكلهم دقيقين
        // هنا؛ الباقي من صورة الصف وقت إنشائه.
        setPttAlert((a) => (mods.fusion.canJudgeWriteAlert(
          a ? { rowId: a.id, seq: pttRowSeqRef.current.get(a.id) ?? 0 } : null,
          { rowId, seq },
        )
          ? { ...baseRow, plate: fused.plate, found: true, matchType: re.matchType, similarity: re.similarity, row: re.row }
          : a));
      } else if (alertAction === "clear") {
        // نفس مصطلح deletePttRow (page.tsx:2340) — بيقفل بس لو الكارت على الصف ده.
        setPttAlert((a) => (a?.id === rowId ? null : a));
      } else if (alertAction === "repoint" && re) {
        // الصفّارة اتشغّلت خلاص ⇒ الكارت يلحق اللوحة الجديدة بلا صفّارة تانية.
        setPttAlert((a) => (a?.id === rowId
          ? { ...a, plate: fused.plate, found: true, matchType: re.matchType, similarity: re.similarity, row: re.row }
          : a));
      }

      setJudgeLast("answered");
      setJudgeCounts((c) => mods.log.bumpJudgeCounts(c, "answered", fused.agreed));

      void mods.log.appendJudgeLog(mods.log.newJudgeLogRecord({
        id: rowId, agentId: owner, sessionId,
        dgPlate: dgPlateNorm, oursPlate: resp.plate, fusedPlate: fused.plate,
        source: fused.source, reason: fused.reason, agreed: fused.agreed,
        needsReview: fused.needsReview, accepted: resp.accepted, refuseReason: resp.refuseReason,
        meanLogprob: resp.meanLogprob, minLogprob: resp.minLogprob, noSpeechProb: resp.noSpeechProb,
        serverMs: resp.serverMs, clientMs, bytes, startMs, endMs,
        windowSource: plan.windowSource,
      }));
    } catch { /* الرأي التاني عمره ما يكسر مسار الصوت */ }
  }

  /**
   * يفضّي الطابور: كل ما سلوت يفضى، اللي مستني يمشي بالترتيب (FIFO).
   *
   * ليه ده آمن مع رد متأخّر؟ نافذة كل عنصر **زمن ميديا مطلق**، فهي صح مهما
   * استنى. والترقيع بيمشي على `r.id` (`setPttResults … r.id !== rowId`) فالرد
   * بيروح لصفّه هو؛ ولو المالك عدّل الصف وسط الاستنى، `pttEditedIdsRef` بتخلّي
   * `patched=false` فالرد بيضيف علامة الطيّار بس ومايكتبش فوق اللوحة؛ ولو الصف
   * اتمسح فـ`map` مالقاهوش = مافيش حاجة بتحصل.
   * ولو الجلسة أو التيار اتغيّروا وهو مستني، الصوت اللي النافذة بتشاور عليه بقى
   * مش موجود ⇒ `streamFresh=false` ⇒ سكوت `stale_stream`، مش قصّة على صوت غلط.
   */
  function drainJudgeQueue() {
    const mods = judgeModsRef.current;
    if (!judgeArmedRef.current || !mods) { judgeQueueRef.current = []; return; }
    while (judgeQueueRef.current.length > 0 && mods.client.planJudgeAdmission({
      inflight: judgeInflightRef.current, queued: 0,
      maxInflight: JUDGE_MAX_INFLIGHT, maxQueue: JUDGE_MAX_QUEUE,
    }) === "run") {
      const item = judgeQueueRef.current.shift();
      if (!item) break;
      const fresh = item.streamSeq === dgStreamSeqRef.current
        && item.sessionId === pttSessionIdRef.current;
      const timing = item.timing
        ? { ...item.timing, streamFresh: item.timing.streamFresh && fresh }
        : null;
      void requestSecondOpinion(item.row, timing, item.pausedMs, item.seq, item.emit);
    }
  }

  /** يعلّم صفوف الطيّار «اتصدّرت» — للقياس بس، وللمالك بس. */
  function markJudgeExportedIfArmed(ids: string[]) {
    const mods = judgeModsRef.current;
    if (!judgeArmedRef.current || !mods || ids.length === 0) return;
    void mods.log.markJudgeExported(ids);
  }

  // Save a manual edit of a voice row: teach the learners (same logic as the
  // registration page), then re-check the corrected plate against the file.
  function applyPttEdit(rowId: string) {
    const row = pttResults.find((r) => r.id === rowId);
    const trimmed = editPttValue.trim();
    setEditingPttId(null);
    if (!row || !trimmed || trimmed === row.plate) return;

    // التعلّم التلقائي الحي **متوقّف** — التعديل مابيغذّيش خرايط التصحيح المحلية تاني
    // (كانت بتلوّث النتايج). التعديل بيتحفظ كليبل ذهبي في داتا التدريب فقط.

    // المندوب عدّلها يدوياً → ليبل ذهبي مؤكّد وقت جمع التدريب.
    pttEditedIdsRef.current.add(rowId);

    const res = searchInCheck(trimmed);
    const finalPlate = res?.plate ?? trimmed;
    setPttResults((prev) => prev.map((r) => r.id === rowId
      ? { ...r, plate: finalPlate, found: res?.found ?? false, matchType: res?.matchType, similarity: res?.similarity, row: res?.row }
      : r));
    void editExportedEntry(rowId, { plate: finalPlate });   // لو الصف اتصدّر خلاص، عدّل السجل كمان
  }

  // ── Voice-list Excel export ─────────────────────────────────────────────
  function buildPttRows() {
    const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
    return pttResults.map((r) => {
      const obj: Record<string, unknown> = {
        "الحالة": r.found ? (r.matchType === "fuzzy" ? `مطلوبة؟ ${r.similarity}%` : "مطلوبة") : "غير مطلوبة",
        "رقم اللوحة": r.plate,
        "الحي-الشارع": r.row?.["الحي-الشارع"] ?? "",
        "النوع": typeToCode(r.vehicleType ?? "") || (r.vehicleType ?? ""),
      };
      for (const h of dynCols) obj[h] = r.row?.[h] ?? "";
      obj["GPS"] = r.mapsLink ?? "";
      obj["التاريخ"] = formatDate(r.checkedAt);
      return obj;
    });
  }

  // ── صفوف الصورة (بند 2) — تحويل قوائم اللوحات لـ PlateImageRow ──────────────
  function fieldEntryImgRows(list: FieldCheckEntry[]): PlateImageRow[] {
    const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
    return list.map((e) => {
      const obj: Record<string, unknown> = { "رقم اللوحة": e.plate };
      for (const h of dynCols) obj[h] = e.row[h] ?? "";
      obj["الحالة"] = e.method;
      obj["التاريخ"] = formatDate(e.checkedAt);   // التاريخ يفضل مع اللوحة في الصورة كمان
      return objToPlateRow(obj);
    });
  }
  function pttImgRows(list: PttRow[]): PlateImageRow[] {
    const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
    return list.map((r) => {
      const obj: Record<string, unknown> = {
        "رقم اللوحة": r.plate,
        "الحالة": r.found ? (r.matchType === "fuzzy" ? `مطلوبة؟ ${r.similarity}%` : "مطلوبة") : "غير مطلوبة",
        "النوع": r.vehicleType ?? "",
      };
      for (const h of dynCols) obj[h] = r.row?.[h] ?? "";
      obj["التاريخ"] = formatDate(r.checkedAt);   // التاريخ يفضل مع اللوحة في الصورة كمان
      return objToPlateRow(obj);
    });
  }

  // Push one voice row onto the protected field-check sheet (only matched ones).
  async function exportPttRowToField(r: PttRow) {
    const mergedRow = { ...(r.row ?? {}) };
    if (r.vehicleType) mergedRow["النوع"] = r.vehicleType;
    const result: PlateResult = { plate: r.plate, normalized: "", found: r.found, matchType: r.matchType, similarity: r.similarity, row: mergedRow };
    const gps = (r.lat != null && r.lng != null) ? { lat: r.lat, lng: r.lng } : undefined;
    await exportToFieldCheck(result, "ptt", gps);
  }

  // اختيار نوع السيارة (حرف مختصر) لصف صوتي — بيتخزّن في vehicleType.
  function setPttType(id: string, code: string) {
    setPttResults((prev) => prev.map((r) => (r.id === id ? { ...r, vehicleType: code || undefined } : r)));
    void editExportedEntry(id, { type: code });   // لو الصف اتصدّر خلاص، عدّل السجل كمان
  }

  // Remove a single voice row.
  function deletePttRow(id: string) {
    // فوراً، قبل إعادة الرسم: أي رد طيّار في الطريق للصف ده يبقى بلا أي فعل
    // (لا ترقيع ولا صفّارة ولا كارت) — `deletePttRow` مابيلغيش الطلب نفسه.
    pttRowIdsRef.current.delete(id);
    setPttResults((prev) => prev.filter((r) => r.id !== id));
    setPttExportedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setPttAlert((a) => (a?.id === id ? null : a));
    setPttSel((s) => { const n = new Set(s); n.delete(id); return n; });
  }

  // نص صف الصوت — للنسخ والمشاركة.
  function pttRowText(r: PttRow): string {
    const lines = [`🚗 اللوحة: ${r.plate}`];
    lines.push(r.found ? (r.matchType === "fuzzy" ? `الحالة: مطلوبة؟ ${r.similarity}%` : "الحالة: مطلوبة") : "الحالة: غير مطلوبة");
    if (r.vehicleType) lines.push(`النوع: ${r.vehicleType}`);
    for (const [k, v] of Object.entries(r.row ?? {})) { if (String(v).trim()) lines.push(`${k}: ${v}`); }
    if (r.mapsLink) lines.push(`📍 الموقع: ${r.mapsLink}`);
    return lines.join("\n");
  }
  async function copyPttRow(r: PttRow) {
    try { await navigator.clipboard.writeText(pttRowText(r)); } catch { /* ignore */ }
    setPttCopiedId(r.id);
    setTimeout(() => setPttCopiedId(null), 1200);
  }
  function togglePttSel(id: string) {
    setPttSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function togglePttSelAll() {
    setPttSel((prev) => (prev.size === pttResults.length ? new Set() : new Set(pttResults.map((r) => r.id))));
  }
  function sharePttSelected() {
    const rows = pttResults.filter((r) => pttSel.has(r.id));
    if (!rows.length) return;
    const text = `*لوحات متشيّكة بالصوت (${rows.length})*\n\n` + rows.map((r, i) => `${i + 1}. ${pttRowText(r)}`).join("\n\n──────────\n\n");
    void shareTextViaChooser(text);
  }
  function deletePttSelected() {
    const ids = pttSel;
    ids.forEach((i) => pttRowIdsRef.current.delete(i));   // نفس سبب `deletePttRow`
    setPttResults((prev) => prev.filter((r) => !ids.has(r.id)));
    setPttExportedIds((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; });
    setPttSel(new Set());
  }
  async function sharePttDraftFile() {
    await runShare("ptt", async () => {
      const blob = buildExcelBlob(buildPttRows(), "تشييك صوتي");
      await shareExcelBlob(blob, `تشييك-صوتي-${Date.now()}.xlsx`, "تشييك صوتي");
    });
  }

  // يصدّر لوحات الصوت لشيت التسجيلات — الجديد بس (اللي ما اتصدّرش قبل كده).
  // التكرار مسموح، لكن إعادة الضغط بتبعت اللوحات اللي اتضافت بعد آخر تصدير فقط
  // مش كل القائمة تاني.
  async function exportAllPttToField() {
    const freshRows = pttResults.filter((r) => !pttExportedIds.has(r.id));
    if (freshRows.length === 0) { alert("كل اللوحات اتصدّرت خلاص — مفيش لوحات جديدة."); return; }
    const stamp = Date.now();
    const toSave: FieldCheckEntry[] = freshRows.map((r, i) => {
      const mergedRow: Record<string, string> = { ...(r.row ?? {}) };
      if (r.vehicleType) mergedRow["النوع"] = typeToCode(r.vehicleType) || r.vehicleType;
      mergedRow["الحالة"] = r.found ? (r.matchType === "fuzzy" ? `مطلوبة؟ ${r.similarity}%` : "مطلوبة") : "غير مطلوبة";
      return {
        id: `${stamp}-${i}`,
        agentId: agentIdRef.current ?? undefined,
        plate: r.plate,
        row: mergedRow,
        srcId: r.id,
        method: "متشيكة بالصوت",
        lat: r.lat,
        lng: r.lng,
        mapsLink: r.mapsLink,
        checkedAt: new Date().toISOString(),
      };
    });
    try {
      for (const e of toSave) await saveFieldCheckEntry(e);
      setFieldEntries(await getAllFieldCheckEntries(agentIdRef.current ?? undefined));
      // نضيف اللي اتصدّر دلوقتي للمصدَّرين (union) — مش نستبدل، عشان القديم
      // يفضل متعلّم إنه اتصدّر والجديد بس هو اللي يتصدّر المرة الجاية.
      setPttExportedIds((s) => { const n = new Set(s); freshRows.forEach((r) => n.add(r.id)); return n; });
      markJudgeExportedIfArmed(freshRows.map((r) => r.id)); // قياس الطيّار: الصف اتصدّر فعلاً
      alert(`تم تصدير ${toSave.length} لوحة لشيت التسجيلات.`);
      // جمع داتا التدريب (خلفية، مربوط بالمفتاح) — بعد التصدير الناجح، مايعطّلش المندوب.
      void collectTrainingFrom(freshRows);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر تصدير اللوحات.");
    }
  }

  // يجمع عيّنات تدريب من اللوحات المُصدَّرة — **بس لو مفتاح السوبر أدمن شغّال**.
  // القرار عبر classifyForCollection (ذهبي=معدّلة، موثوق=مُصدَّرة بثقة). بيحفظ صوت
  // الجلسة مرة واحدة + عيّنة لكل لوحة موثوقة، وبعدين يزامن للخلفية. أي فشل مايأثرش
  // على التصدير نفسه (اتعمل خلاص). معزول تماماً: مقفول = مايتنفّذش أصلاً.
  async function collectTrainingFrom(rows: PttRow[]) {
    if (!learningGateRef.current) return;
    // نجمّع كل صف صالح الشكل — **بلا تقييد بالجلسة الحالية** (اللوحات بترجع من
    // التخزين بعد إعادة الفتح لكن معرّف الجلسة في الذاكرة بيتصفّر، فالتقييد القديم
    // كان بيلغي الجمع كله). كل صف بيتحفظ بمعرّف جلسته هو (المحفوظ معاه).
    const decided = rows
      .map((r) => {
        const norm = normalizePlate(bankPlateToArabic(r.plate));
        const validShape = norm.replace(/[0-9]/g, "").length === 3 && norm.replace(/[^0-9]/g, "").length === 4;
        const action: CollectAction = pttEditedIdsRef.current.has(r.id) ? "edited" : "exported";
        const dec = classifyForCollection({
          action,
          uncertain: !!r.needsReview,
          validShape,
          listMatch: !!r.found && r.matchType === "exact",
          wordConfidenceOk: !!r.wordConfidenceOk,
        });
        return { r, norm, dec };
      })
      .filter((x) => x.dec.collect);
    if (decided.length === 0) return;
    try {
      // احفظ صوت الجلسة الحالية لو لسه في الذاكرة (حالة التصدير في نفس الجلسة).
      // حالة إعادة الفتح متغطّية بحفظ الصوت وقت الإيقاف (persistPttAudio في stopPtt).
      const curSid = pttSessionIdRef.current;
      if (curSid && trainingSessionSavedRef.current !== curSid && pttAudioChunksRef.current.length > 0) {
        const blob = new Blob(pttAudioChunksRef.current, { type: pttAudioMimeRef.current });
        const audioBase64 = await blobToBase64(blob);
        await saveTrainingSession({
          sessionId: curSid, audioBase64, mimeType: pttAudioMimeRef.current,
          agentId: agentIdRef.current ?? "", createdAt: new Date().toISOString(), synced: false,
        });
        trainingSessionSavedRef.current = curSid;
      }
      for (const { r, norm, dec } of decided) {
        const sid = r.sessionId || curSid || "no-session";
        await saveTrainingSample({
          id: `${sid}-${r.id}`, sessionId: sid, plate: norm,
          tier: dec.tier as "gold" | "trusted", reason: dec.reason,
          startMs: r.startMs ?? 0, endMs: r.endMs ?? 0,
          agentId: agentIdRef.current ?? "", createdAt: new Date().toISOString(), synced: false,
        });
      }
      try { setTrainingToday(await countTrainingToday()); } catch { /* ignore */ }
      void syncTrainingData(); // خلفية — يرفع لـ Supabase ويعلّم المتزامن
    } catch { /* فشل الجمع مايوقفش الشغل */ }
  }

  // تشخيص جمع التعلّم — يظهر على جهاز أي مستخدم (اضغط شارة «تعلّم»). بيبيّن نسخة
  // الكود + المفتاح + المعرّف + المحلي + نتيجة الرفع (بالخطأ) — عشان نعرف فين
  // المشكلة على جهاز المندوب من غير ما يكون سوبر أدمن.
  async function pttLearnDiag() {
    const lines: string[] = ["نسخة الكود: collect-v4 ✓"];
    try { lines.push("المفتاح: " + ((await fetchLearningEnabled()) ? "شغّال ✓" : "متوقّف ✗")); }
    catch (e) { lines.push("المفتاح: خطأ — " + ((e as Error)?.message ?? "")); }
    lines.push("معرّفي (agent): " + (agentIdRef.current || "مفيش ✗ (سجّل دخول)"));
    try {
      const s = await import("@/lib/trainingStore");
      const [all, sess, un] = await Promise.all([s.getAllTrainingSamples(), s.getAllTrainingSessions(), s.getUnsyncedSamples()]);
      lines.push(`محلي على الجهاز: ${all.length} لوحة، ${sess.length} مقطع صوت، ${un.length} لسه ما اترفعتش`);
      // إعادة رفع كاملة: نتجاهل العلامة المحلية ونرفع كل الصوت واللوحات تاني (إصلاح
      // حالات اتعلّمت مرفوعة غلط بنسخة قديمة).
      await s.forceResyncAll();
    } catch (e) { lines.push("محلي: خطأ — " + ((e as Error)?.message ?? "")); }
    try {
      const r = await syncTrainingData();
      lines.push(`الرفع لـ Supabase: ${r.uploaded} لوحة + ${r.audioUploaded ?? 0} صوت${r.error ? ` — خطأ: ${r.error}` : " ✓"}`);
    } catch (e) { lines.push("الرفع: خطأ — " + ((e as Error)?.message ?? "")); }
    try { setTrainingToday(await countTrainingToday()); } catch { /* ignore */ }
    alert(lines.join("\n"));
  }

  // يحفظ صوت جلسة الصوت الحالية في مخزن التدريب فوراً (وقت الإيقاف) — عشان لو
  // المندوب خرج/قفل التطبيق قبل التصدير، الصوت مايضيعش (الذاكرة بتتصفّر لكن
  // IndexedDB بيفضل). العيّنات نفسها بتتجمّع وقت التصدير وبتربط بنفس معرّف الجلسة.
  async function persistPttAudio() {
    try {
      const sid = pttSessionIdRef.current;
      if (!learningGateRef.current || !sid) return;
      if (trainingSessionSavedRef.current === sid || pttAudioChunksRef.current.length === 0) return;
      const blob = new Blob(pttAudioChunksRef.current, { type: pttAudioMimeRef.current });
      const audioBase64 = await blobToBase64(blob);
      await saveTrainingSession({
        sessionId: sid, audioBase64, mimeType: pttAudioMimeRef.current,
        agentId: agentIdRef.current ?? "", createdAt: new Date().toISOString(), synced: false,
      });
      trainingSessionSavedRef.current = sid;
    } catch { /* مايأثرش على الإيقاف */ }
  }

  function startPttTimer() {
    if (pttTimerRef.current) clearInterval(pttTimerRef.current);
    setPttSeconds(0);
    pttTimerRef.current = setInterval(() => setPttSeconds((s) => s + 1), 1000);
  }
  function stopPttTimer() {
    if (pttTimerRef.current) { clearInterval(pttTimerRef.current); pttTimerRef.current = null; }
  }
  // يكمّل العدّاد من نفس النقطة (بعكس startPttTimer اللي بيصفّره) — للاستئناف.
  function resumePttTimer() {
    if (pttTimerRef.current) clearInterval(pttTimerRef.current);
    pttTimerRef.current = setInterval(() => setPttSeconds((s) => s + 1), 1000);
  }
  // إيقاف مؤقت/استئناف التسجيل الصوتي. الإيقاف: يوقف العدّاد + يوقف المايك مؤقتاً +
  // يتجاهل أي لوحة جاية (البوابة في addOnePttRow/addPttResult) عشان المندوب يعدّل
  // بأمان. الاستئناف: يكمّل العدّاد والمايك من نفس النقطة، والصفوف تفضل زي ما هي.
  function togglePttPause() {
    const next = !pttPausedRef.current;
    pttPausedRef.current = next;
    setPttPaused(next);
    if (next) {
      // الطيّار: زمن الميديا بيتجمّد مع pause() والساعة ماشية — نجمّع الفرق عشان
      // القصّ مايزحفش. (بيتنفّذ للمالك المسلَّح بس؛ لغيره فحص بوليان واحد.)
      if (judgeArmedRef.current) judgePauseAtRef.current = performance.now();
      stopPttTimer();
      try { if (dgRecorderRef.current?.state === "recording") dgRecorderRef.current.pause(); } catch {}
    } else {
      if (judgeArmedRef.current && judgePauseAtRef.current != null) {
        judgePausedMsRef.current += performance.now() - judgePauseAtRef.current;
        judgePauseAtRef.current = null;
      }
      resumePttTimer();
      try { if (dgRecorderRef.current?.state === "paused") dgRecorderRef.current.resume(); } catch {}
    }
  }
  // Clear the timer if the component unmounts mid-listen.
  useEffect(() => () => {
    // مهم: علّم إن الاستماع خلص **قبل** ما نقفل السوكيت، عشان منطق إعادة الاتصال
    // في onclose مايرجعش يفتح المايك في الخلفية بعد ما المندوب خرج من الصفحة
    // (ده كان بيسيب علامة المايك شغّالة رغم إن التسجيل «مقفول»).
    isListeningRef.current = false;
    if (pttTimerRef.current) clearInterval(pttTimerRef.current);
    if (pttChunkTimerRef.current) clearInterval(pttChunkTimerRef.current);
    if (dgKeepAliveRef.current) { clearInterval(dgKeepAliveRef.current); dgKeepAliveRef.current = null; }
    if (dgMicPollRef.current) { clearInterval(dgMicPollRef.current); dgMicPollRef.current = null; }
    if (dgWatchdogRef.current) { clearInterval(dgWatchdogRef.current); dgWatchdogRef.current = null; }
    // نظّف بث Deepgram لو الصفحة اتقفلت والمايك شغّال.
    try { dgGateRef.current?.close(); } catch {}
    dgGateRef.current = null;
    try { dgRecorderRef.current?.stop(); } catch {}
    try { dgSocketRef.current?.close(); } catch {}
    try { dgStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
  }, []);

  // مفتاح Groq المحفوظ (نفس بتاع التسجيل/الكاميرا) — لو موجود بنستخدم Whisper.
  function getGroqKey(): string {
    try { return (localStorage.getItem("ph:registration:groqApiKey") || "").trim(); } catch { return ""; }
  }

  // يرفع مقطع صوت لـ Whisper (عبر /api/transcribe) ويرجّع النص المفرَّغ.
  async function transcribeChunk(recordDataBase64: string, mimeType: string, apiKey: string): Promise<string> {
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ audio: recordDataBase64, mimeType, apiKey }),
      });
      const data = await res.json().catch(() => null);
      return typeof data?.text === "string" ? data.text.trim() : "";
    } catch { return ""; }
  }

  // يعالج نص مقطع مفرَّغ: parseSessionChunk (نفس محلّل التسجيل — carry-over
  // ومتعدد اللوحات) ثم يضيف صف لكل لوحة مكتملة + تشييك + تنبيه لو مطلوبة.
  function processWhisperText(text: string, final: boolean) {
    if (text.trim()) { setPttLiveText(text.trim()); logRawTranscript(text); }
    const res = parseSessionChunk(text, pttSessionStateRef.current, { final });
    pttSessionStateRef.current = res.state;
    // ⚠️ `index`/`count`/`fromCarry` **لازم** يوصلوا: كل السجلات في الرسالة دي
    // بتقرا **نفس** `judgeTimingRef` (كائن واحد لكل نتيجة نهائية)، فالصف اللي مش
    // وحيد في رسالته — أو نصّه اتلمّ من رسالتين — ممنوع ياخد نافذة **رسالة**
    // (اللي كانت بتتشارك بين صفّين). النافذة المثبَتة بترتكز على لوحة الصف نفسه
    // وبتتحقّق منها، فسجلّين في رسالة واحدة بياخدوا نافذتين مختلفتين.
    res.records.forEach((r, i) => addOnePttRow(
      r.plate, r.vehicleType, pttRowIdxRef.current++, r.uncertain,
      { index: i, count: res.records.length, fromCarry: r.fromCarry === true },
    ));
  }

  // مسار Deepgram: بث صوت مباشر (WebSocket) لـ Deepgram nova-3 بلهجة مصرية
  // (ar-EG) مع تعزيز حروف اللوحة (keyterm) — تفريغ لحظي مستمر بدون تقطيع/فجوات.
  // النتائج النهائية بتتغذّى على نفس محلّل الجلسة (متعدد اللوحات + carry-over).
  async function startDeepgramPtt(apiKey: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return false;
    }
    // اختار صيغة تسجيل مدعومة (WebView أندرويد يدعم webm/opus).
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      .find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } });
    if (!mime) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      dgStreamRef.current = stream;
      // بوابة الكلام: نبعت الصوت وقت الكلام بس (الصمت مايتبعتش فمايتحسّبش). لو
      // فشلت التهيئة بنسيبها null → بنبعت كل حاجة زي الأول (مايضيّعش لوحات).
      try { dgGateRef.current = createSpeechGate(stream); } catch { dgGateRef.current = null; }
      pttSessionStateRef.current = newSessionState();
      pttRowIdxRef.current = 0;

      const params = new URLSearchParams({
        model: "nova-3",
        language: "ar",          // عربي عام — بيغطّي المصري والسعودي والعامية
        interim_results: "true", // نتائج حيّة أثناء الكلام
        smart_format: "false",
        punctuate: "false",
        numerals: "true",        // يرجّع الأرقام رقمياً (1234) بدل كلمات — أدق وأنضف للّوحات
        // endpointing أقصر (100ms بدل 300): لما المندوب يقول اللوحات بسرعة ورا بعض،
        // Deepgram بيقفل كل لوحة في مقطع أقصر لوحدها بدل ما يلزقهم في مقطع طويل
        // واحد (اللزق ده كان بيخلّيه يرمي/يخلط أرقام). لو لوحة اتقطعت نصّين
        // (حروف / أرقام) الـ carry-over في sessionParser بيلحمها تاني — متأكّدين
        // بالاختبار ( end-to-end: ["قلم","2470"] → قلم2470).
        endpointing: "100",
        // إشارة «نهاية النطق»: Deepgram يبعت UtteranceEnd بعد ١ث سكوت فعلي بعد
        // الكلام. بنستخدمها نفرّغ أي لوحة متعلّقة في الـ carry-over فوراً (تطلع
        // كاملة + إنذارها في وقته) بدل ما تستنى الكلام اللي بعدها. بيحل «مفيش
        // نتيجة» و«لوحة مقصوصة».
        utterance_end_ms: "1000",
      });
      for (const t of PLATE_LETTER_KEYTERMS) params.append("keyterm", t);
      const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
      // المتصفح مايقدرش يبعت هيدر Authorization على WebSocket — Deepgram بيدعم
      // تمرير المفتاح عبر الـ subprotocol: ["token", KEY].
      const ws = new WebSocket(url, ["token", apiKey]);
      dgSocketRef.current = ws;

      // ابدأ التسجيل فوراً (قبل ما الاتصال يفتح) عشان مانفقدش أول حرف أثناء فتح
      // الاتصال (كان بيبدأ في onopen فيضيع أول ~نص ثانية). الأجزاء اللي تتسجّل
      // قبل الفتح تتخزّن وتتبعت بالترتيب أول ما يفتح. إرسال متصل — تيار WebM
      // مترابط فمنعش نرمي أجزاء.
      const rec = new MediaRecorder(stream, { mimeType: mime });
      dgRecorderRef.current = rec;
      pttAudioMimeRef.current = mime;
      const pending: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        // جمّع صوت الجلسة دايماً أثناء التسجيل — مش معتمد على توقيت تحميل المفتاح
        // (كان لو المفتاح لسه ماتحمّلش وقت بداية التسجيل، الصوت يضيع). الحفظ نفسه
        // مربوط بالمفتاح (persistPttAudio/collectTrainingFrom)، فمقفول = مايتحفظش.
        pttAudioChunksRef.current.push(e.data);
        if (ws.readyState === WebSocket.OPEN) {
          // أي جزء مابيوصلش للمحرك = ساعة كلماته بتزحف عن زمن الميديا بمقداره،
          // فنعدّه: الرأي التاني بيرجع لساعة الحقيقة لما يشوف العدّاد > ٠.
          while (pending.length) { try { ws.send(pending.shift()!); } catch { dgAudioDropRef.current += 1; } }
          try { ws.send(e.data); } catch { dgAudioDropRef.current += 1; }
        } else {
          pending.push(e.data); // الاتصال لسه بيفتح — خزّن بالترتيب
        }
      };
      dgRecStartRef.current = performance.now(); // مرجع الساعة الحقيقية لتوقيت التدريب
      // الطيّار: التيار الجديد ترويسته في الجزء ده — مهم بعد **إعادة الاتصال**
      // (pttAudioChunksRef مابيتصفّرش، فمسجّل جديد = ترويسة جديدة وسط المصفوفة،
      // وdgRecStartRef بيتصفّر معاه فعدّاد الإيقاف المؤقت لازم يتصفّر برضه).
      judgeStreamBaseRef.current = pttAudioChunksRef.current.length;
      judgePausedMsRef.current = 0;
      judgePauseAtRef.current = null;
      // ساعة Deepgram رجعت للصفر مع التيار ده، فحدّ «نهاية النبضة السابقة»
      // (بساعته) بقى بلا معنى — لازم يتصفّر معاهم، وإلا أول نبضة في التيار
      // الجديد تتقصّ بحدّ من التيار القديم. ونفس الكلام على تاريخ النتايج:
      // كلمات بساعة قديمة جوّه نافذة جديدة = نافذة على صوت غلط.
      judgePrevWordEndRef.current = null;
      judgeFinalsRef.current = [];
      // بصمة التيار ده: `dgRecStartRef` + `judgeStreamBaseRef` + ساعة Deepgram
      // كلهم اتصفّروا **مع بعض** فوق. أي نتيجة نهائية جاية من سوكيت أقدم بصمتها
      // أقدم ⇒ توقيتها مش قابل للمطابقة على البادئة الحالية (شوف `stale_stream`).
      dgStreamSeqRef.current += 1;
      dgAudioDropRef.current = 0;
      const streamSeq = dgStreamSeqRef.current;
      rec.start(250); // يبعت جزء صوت كل 250ms

      ws.onopen = () => {
        if (!isListeningRef.current) { try { ws.close(); } catch {} try { rec.stop(); } catch {} return; }
        dgReconnectsRef.current = 0; // اتصال ناجح → صفّر عدّاد إعادة الاتصال
        // فضّي أي أجزاء اتسجّلت قبل ما الاتصال يفتح.
        while (pending.length && ws.readyState === WebSocket.OPEN) { try { ws.send(pending.shift()!); } catch { dgAudioDropRef.current += 1; } }
        // KeepAlive عشان Deepgram مايقفلش الاتصال في فترات الصمت.
        dgKeepAliveRef.current = setInterval(() => {
          const s = dgSocketRef.current;
          const speaking = dgGateRef.current ? dgGateRef.current.isSpeaking() : true;
          if (s && s.readyState === WebSocket.OPEN && !speaking) {
            try { s.send(JSON.stringify({ type: "KeepAlive" })); } catch {}
          }
        }, 7000);
        // مؤشّر "بيسمع" — بيعكس حالة بوابة الكلام (VAD) للعرض للمستخدم.
        dgMicPollRef.current = setInterval(() => {
          setPttMicActive(dgGateRef.current ? dgGateRef.current.isSpeaking() : true);
        }, 150);
        // الحارس: لو عدّى DG_SILENT_MS وإحنا «بنبعت» (المندوب بيتكلم) ومفيش أي نص
        // وصل، نعيد تشغيل البث (محدود بـ3 مرات عشان مايعملش لوب).
        dgLastTextAtRef.current = performance.now();
        dgWatchdogRef.current = setInterval(() => {
          if (!isListeningRef.current || pttPausedRef.current) return;
          const speaking = dgGateRef.current ? dgGateRef.current.isSpeaking() : true;
          const silentFor = performance.now() - dgLastTextAtRef.current;
          if (!speaking || silentFor < DG_SILENT_MS) return;
          if (dgAutoRestartsRef.current >= 3) {
            setPttError("التفريغ مش راجع — أوقف المايك وشغّله تاني.");
            return;
          }
          dgAutoRestartsRef.current += 1;
          dgLastTextAtRef.current = performance.now();
          try { dgSocketRef.current?.close(); } catch {}  // onclose بيعيد الاتصال
        }, 5000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          // نهاية النطق (سكتة المندوب): فرّغ أي لوحة متعلّقة في الـ carry-over فوراً
          // → تطلع كاملة + searchInCheck + الإنذار في وقته (من غير ما يعيد اللوحة).
          if (msg.type === "UtteranceEnd") { processWhisperText("", true); return; }
          const text: string = msg?.channel?.alternatives?.[0]?.transcript?.trim() ?? "";
          if (!text) return;
          dgLastTextAtRef.current = performance.now(); // القناة سليمة — صفّر الحارس
          dgAutoRestartsRef.current = 0;
          setPttLiveText(text);
          // بس النتيجة النهائية للجملة بتتفرّغ للوحات (interim للعرض فقط).
          if (msg.is_final) {
            // اقرأ توقيت + ثقة الكلمات (لجمع التدريب) قبل التفريغ — addOnePttRow بيقراها.
            // ⚠️ البوابة اتوسّعت بـOR **ومااتشالتش**: الطيّار محتاج نفس التوقيت
            // عشان يقصّ نبضة اللوحة. لو شلناها كنّا بدأنا نكتب
            // startMs/endMs/wordConfidenceOk في **كل** صف لكل مستخدم والتعلّم
            // مقفول — والصفوف دي بتتخزّن في localStorage وبتغذّي
            // collectTrainingFrom، يعني تغيير سلوك عابر للمستخدمين.
            if (learningGateRef.current || judgeArmedRef.current) {
              const words: DgWord[] = readDeepgramWords(msg);
              if (words.length > 0) {
                const starts = words.map((w) => w.start).filter((n): n is number => typeof n === "number");
                const ends = words.map((w) => w.end).filter((n): n is number => typeof n === "number");
                const confs = words.map((w) => w.confidence).filter((n): n is number => typeof n === "number");
                const confOk = confs.length > 0 && confs.every((c) => c >= 0.6);
                // توقيت التدريب: بالساعة الحقيقية بالنسبة لبداية التسجيل — محكم ضد إعادة
                // اتصال Deepgram (اللي بترجّع ساعته للصفر) وضد فرق بداية الـ stream.
                // نافذة واسعة تضمن إن المقطع يحتوي اللوحة (التدريب مايحتاجش قصّة مضبوطة).
                // ملاحظة: ده لجمع التدريب فقط — مالوش أي أثر على التفريغ/المطابقة/العرض.
                if (dgRecStartRef.current != null && starts.length && ends.length) {
                  const nowMs = performance.now() - dgRecStartRef.current;
                  const durMs = (Math.max(...ends) - Math.min(...starts)) * 1000; // مدة النطق النسبية (محكمة)
                  curTimingRef.current = {
                    startMs: Math.max(0, nowMs - durMs - 3000),
                    endMs: nowMs + 500,
                    confOk,
                  };
                } else {
                  // fallback للسلوك القديم (توقيت Deepgram) لو مرجع التسجيل مش متاح.
                  curTimingRef.current = {
                    startMs: starts.length ? Math.min(...starts) * 1000 : 0,
                    endMs: ends.length ? Math.max(...ends) * 1000 : 0,
                    confOk,
                  };
                }
                // ── الرأي التاني: **مكوّنات خام، ومرجع تانية خالص** ──────────────
                // النافذة الواسعة فوق (حشوة ٣ث) صح للتدريب — التدريب مايحتاجش قصّة
                // مضبوطة — و**قاتلة** للاستنتاج: الموديل مدرَّب على لوحة واحدة في
                // المقطع، والمقيس على صوت المالك إنها كانت بتطلّع ٥٫٩ث فيها لوحتين.
                // فالطيّار له ريف مستقل بمكوّنات خام، و`planPlateWindow` هو اللي
                // يحسب. مسار التدريب فوق **مالمسوش**.
                if (judgeArmedRef.current) {
                  const epoch = dgRecStartRef.current;
                  const nowRel = epoch == null ? null : performance.now() - epoch;
                  const wordEndMs = ends.length ? Math.max(...ends) * 1000 : null;
                  // التاريخ: كل نتيجة بكلماتها **وحدّ الجار بتاعها** (نهاية اللي
                  // قبلها) — لأن النطق المقسوم يقدر يبدأ عند أول كلمة في أقدم
                  // نتيجة، وساعتها الحدّ السفلي بيجي من هناك.
                  const hist = judgeFinalsRef.current;
                  // ⚠️ بصمة التيار **لازم** تتحفظ مع النتيجة. نتيجة نهائية متأخّرة
                  //    من سوكيت قديم بتوصل بعد ما التاريخ اتصفّر (التصفير مع كل
                  //    مسجّل جديد تحت)، فبتدخل تاريخ التيار الجديد وتوقيتها بساعة
                  //    تانية خالص ⇒ مدى مثبَت على صوت **مش** صوت اللوحة.
                  //    `provePlateSpanAcrossFinals` بيقطع التاريخ عند آخر نتيجة
                  //    موسومة `false` فمابيعبرهاش (شوف `DgFinal.streamFresh`).
                  hist.push({
                    words,
                    prevWordEndMs: judgePrevWordEndRef.current,
                    streamFresh: dgStreamSeqRef.current === streamSeq,
                  });
                  if (hist.length > JUDGE_FINALS_HISTORY) {
                    hist.splice(0, hist.length - JUDGE_FINALS_HISTORY);
                  }
                  judgeTimingRef.current = {
                    wordStartMs: starts.length ? Math.min(...starts) * 1000 : null,
                    wordEndMs,
                    arrivalMs: nowRel,
                    mediaElapsedMs: nowRel == null ? null : nowRel - judgePausedMsRef.current,
                    streamFresh: dgStreamSeqRef.current === streamSeq,
                    audioDrops: dgAudioDropRef.current,
                    // الكلمات نفسها — أساس نافذة «آخر لوحة».
                    words,
                    // نهاية كلام النبضة **السابقة**، تُقرا قبل ما نكتب فوقها.
                    prevWordEndMs: judgePrevWordEndRef.current,
                    // صورة (مش الريف نفسه) عشان النتايج الجديدة مايغيّروش نافذة
                    // نبضة لسه ردّها في الطريق.
                    finals: hist.slice(),
                  };
                  if (wordEndMs != null) judgePrevWordEndRef.current = wordEndMs;
                }
              } else {
                curTimingRef.current = null;
                // مافيش كلمات خالص: الطيّار لسه عنده مرساة ساعة الحقيقة ⇒ نافذة
                // احتياطية محكمة (٢٫٩ث)، مش سكوت ومش نافذة ٦ث.
                if (judgeArmedRef.current) {
                  const epoch = dgRecStartRef.current;
                  const nowRel = epoch == null ? null : performance.now() - epoch;
                  judgeTimingRef.current = {
                    wordStartMs: null, wordEndMs: null,
                    arrivalMs: nowRel,
                    mediaElapsedMs: nowRel == null ? null : nowRel - judgePausedMsRef.current,
                    streamFresh: dgStreamSeqRef.current === streamSeq,
                    audioDrops: dgAudioDropRef.current,
                    // مافيش كلمات خالص ⇒ مافيش مسار مثبَت، والاحتياطي المحكم
                    // (ساعة الحقيقة، ٢٫٩ث) هو اللي يمشي — زي ما هو بالحرف.
                    // والتاريخ فاضي عن قصد: المسار المقسوم بيبدأ من كلمات
                    // النتيجة الحالية، ومافيش كلمات هنا.
                    words: [], prevWordEndMs: judgePrevWordEndRef.current, finals: [],
                  };
                }
              }
            }
            processWhisperText(text, false);
          }
        } catch { /* رسالة مش JSON — تجاهل */ }
      };
      ws.onerror = () => setPttError("خطأ في الاتصال بـ Deepgram — راجع المفتاح والإنترنت.");
      // لو الاتصال قفل فجأة والمندوب لسه فاتح المايك → أعِد الاتصال تلقائياً (المفروض
      // ميفصلش). محدود بـ 5 محاولات عشان مايعملش لوب لانهائي لو المفتاح غلط أو النت
      // مقطوع؛ العدّاد بيتصفّر مع كل اتصال ناجح (في onopen).
      ws.onclose = () => {
        if (dgKeepAliveRef.current) { clearInterval(dgKeepAliveRef.current); dgKeepAliveRef.current = null; }
        if (dgMicPollRef.current) { clearInterval(dgMicPollRef.current); dgMicPollRef.current = null; }
        if (dgWatchdogRef.current) { clearInterval(dgWatchdogRef.current); dgWatchdogRef.current = null; }
        if (!isListeningRef.current) return; // المندوب أوقف بنفسه — مفيش إعادة اتصال
        // نضّف تيار/مسجّل/بوابة القديمة قبل ما نبدأ واحدة جديدة (منعاً للتسريب).
        try { rec.stop(); } catch {}
        try { stream.getTracks().forEach((t) => t.stop()); } catch {}
        try { dgGateRef.current?.close(); } catch {}
        dgGateRef.current = null;
        if (dgReconnectsRef.current < 5) {
          dgReconnectsRef.current += 1;
          setTimeout(() => { if (isListeningRef.current) void startDeepgramPtt(apiKey); }, 1200);
        } else {
          setPttError("انقطع الاتصال بـ Deepgram كذا مرة — أوقف المايك وشغّله تاني.");
        }
      };
      return true;
    } catch (err) {
      setPttError(`تعذّر بدء التفريغ اللحظي: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // مسار Whisper المتواصل: تسجيل متواصل، وكل ~7 ثواني نوقف المقطع الحالي ونشغّل
  // واحد جديد ونفرّغ القديم في الخلفية — فمفيش صوت بيضيع (غير فجوة التبديل
  // الصغيرة اللي بيصلّحها لزق نص المقاطع في المحلّل). بيرجّع true لو بدأ بنجاح.
  async function startWhisperPtt(apiKey: string): Promise<boolean> {
    try {
      const { VoiceRecorder } = await import("@independo/capacitor-voice-recorder");
      const perm = await VoiceRecorder.requestAudioRecordingPermission();
      if (!perm.value) { setPttError("محتاج صلاحية الميكروفون عشان التفريغ السحابي يشتغل."); return false; }
      await VoiceRecorder.startRecording();
      pttSessionStateRef.current = newSessionState();
      pttChunkBusyRef.current = false;
      pttRowIdxRef.current = 0;
      pttChunkTimerRef.current = setInterval(async () => {
        if (!isListeningRef.current || pttChunkBusyRef.current) return;
        pttChunkBusyRef.current = true;
        try {
          const { VoiceRecorder: VR } = await import("@independo/capacitor-voice-recorder");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let chunk: any = null;
          try { chunk = await VR.stopRecording(); } catch { /* EMPTY_RECORDING بين اللوحات — عادي */ }
          try { if (isListeningRef.current) await VR.startRecording(); } catch { /* هنحاول تاني الدورة الجاية */ }
          if (chunk?.value?.recordDataBase64) {
            const text = await transcribeChunk(chunk.value.recordDataBase64, chunk.value.mimeType, apiKey);
            if (text) processWhisperText(text, false);
          }
        } finally {
          pttChunkBusyRef.current = false;
        }
      }, 7000);
      return true;
    } catch (err) {
      setPttError(`تعذّر بدء التفريغ السحابي: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  async function startPtt() {
    setPttError(null);
    setPttLiveText("");
    pttRawLogRef.current = []; setPttRawLog([]); // ابدأ ديبج نظيف لكل جلسة
    // جلسة تدريب جديدة: معرّف + بَفر صوت نظيف (بيتجمّع بس لو المفتاح شغّال).
    pttSessionIdRef.current = `s-${Date.now()}-${Math.floor(performance.now())}`;
    pttAudioChunksRef.current = [];
    trainingSessionSavedRef.current = "";
    curTimingRef.current = null;
    // عدّاد الطيّار بيتصفّر مع كل جلسة — «الجلسة» لازم تعني الجلسة دي، وإلا أرقام
    // جلسة قديمة ناجحة بتغطّي على جلسة جديدة صفر. (للمالك بس؛ حالة عرض بحتة.)
    if (judgeArmedRef.current) {
      setJudgeCounts({ answered: 0, agree: 0, skipped: 0, reasons: {} });
      setJudgeLast(null);
      // جلسة جديدة = بَفر صوت جديد (`pttAudioChunksRef` اتصفّر فوق)، فأي عنصر
      // مستني في الطابور نافذته بتشاور على صوت **مش موجود** ⇒ يتشال دلوقتي.
      judgeQueueRef.current = [];
      judgeTimingRef.current = null;
      judgePrevWordEndRef.current = null;
      judgeFinalsRef.current = [];
    }
    // ⚠️ `pttSeqRef`/`pttRowSeqRef` **مابيتصفّروش** مع الجلسة عن قصد: `pttResults`
    //    (والكارت المفتوح) بيعيشوا عبر الجلسات، فلو العدّاد رجع للصفر كان كارت
    //    قديم (تسلسل ٥) يقدر يمنع صف جديد (تسلسل ١) من فتح كارته. تصاعدي لعمر
    //    الصفحة = «الأحدث» تعني الأحدث فعلاً. وصف مستعاد من localStorage مالوش
    //    تسلسل ⇒ `?? 0` ⇒ أي صف جديد يكسبه، وده الصح.
    isListeningRef.current = true;
    pttPausedRef.current = false; setPttPaused(false); // جلسة جديدة — مش متوقّفة
    setPttListening(true);
    startPttTimer();

    // (٠) Speechmatics لو هو المحرك المختار وفيه مفتاح — نفس مسار المحلّل.
    if (getVoiceEngine() === "speechmatics" && getSpeechmaticsKey()) {
      pttSessionStateRef.current = newSessionState();
      pttRowIdxRef.current = 0;
      const h = await startSpeechmatics(getSpeechmaticsKey(), {
        onPartial: (t) => setPttLiveText(t),
        onFinal: (t) => processWhisperText(t, false),
        onError: (m) => setPttError(m),
      });
      if (h) { smHandleRef.current = h; setPttEngine("speechmatics"); return; }
      // فشل البدء → نكمّل بالمسارات التانية.
    }

    // (١) الأولوية لـ Deepgram طول ما فيه مفتاح — أدق تفريغ لحظي (streaming) وأسرع
    // ظهور. صفحة التشييك «لايف» بطبيعتها، فبتفضّل Deepgram *بغضّ النظر عن المحرك
    // العام* (اللي بيخدم التسجيل — مثلاً Groq batch للدقة). ده يمنع رجوعها لمسار
    // Whisper اللي بيقطّع كل ٧ث فتتأخّر اللوحة. (نيّة #23: Deepgram → التشييك لحظي.)
    const dgKey = getDeepgramKey() || getActiveDeepgramKey();
    if (dgKey) {
      const ok = await startDeepgramPtt(dgKey);
      if (ok) { setPttEngine("deepgram"); return; }
      // فشل البدء → نكمّل بالمسارات التانية.
    }

    // Native (Capacitor)
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        // لو المندوب مفعّل مفتاح Groq → تفريغ سحابي بـ Whisper (أدق بكتير من
        // المحرك المحلي). لو البدء فشل بنكمّل بالمحرك المحلي.
        const groqKey = getGroqKey();
        if (groqKey) {
          const ok = await startWhisperPtt(groqKey);
          if (ok) { setPttEngine("whisper"); return; }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { SpeechRecognition } = (await import("@capacitor-community/speech-recognition")) as any;
        const perm = await SpeechRecognition.requestPermissions();
        // requestPermissions() resolves with a status — it does NOT throw when
        // denied. Ignoring that (as before) let the mic show "listening" forever
        // with zero result: start() below fails every time on denied permission,
        // and the loop's "never give up" retry swallows every failure silently.
        if (perm?.speechRecognition && perm.speechRecognition !== "granted") {
          setPttError("لازم تسمح للتطبيق باستخدام الميكروفون — من إعدادات الهاتف ← التطبيقات ← قناص اللوحات ← الأذونات.");
          stopPttTimer();
          setPttListening(false);
          isListeningRef.current = false;
          return;
        }
        // Continuous listening = a loop of one-shot recognitions. Android's
        // SpeechRecognizer needs a beat to reset between sessions; starting
        // again too fast throws ERROR_RECOGNIZER_BUSY. Every transient error
        // (busy / no-speech / silence) must NOT end the session — the mic only
        // stops when the USER presses stop (isListeningRef flips false). So we
        // never give up on transient errors — we just back off and keep looping.
        // But a run of NOTHING-but-errors isn't transient anymore (broken plugin,
        // unsupported locale, permission revoked mid-session) — that must surface
        // an error instead of spinning the mic forever with no feedback.
        setPttEngine("local");
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 10;
        while (isListeningRef.current) {
          try {
            const result = await SpeechRecognition.start({
              language: "ar-SA",
              maxResults: 5,          // get several hypotheses, keep the most plate-like
              partialResults: false,
              popup: false,
            });
            consecutiveFailures = 0;
            const text: string = pickBestHypothesis(result?.matches ?? []);
            if (text) {
              setPttLiveText(text);
              addPttResult(text);
            }
            // Let the recognizer fully reset before the next plate.
            await new Promise((r) => setTimeout(r, 250));
          } catch {
            // User pressed stop mid-session → exit cleanly.
            if (!isListeningRef.current) break;
            consecutiveFailures++;
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              setPttError("التعرف الصوتي مش بيستجيب على جهازك — جرّب تحديث التطبيق من القائمة (☰) أو أعد تشغيل الميكروفون.");
              break;
            }
            // Transient error between plates → back off briefly and retry.
            await new Promise((r) => setTimeout(r, 350));
          }
        }
        stopPttTimer();
        setPttListening(false);
        isListeningRef.current = false;
        return;
      }
    } catch {}

    // Web fallback
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setPttError("المتصفح لا يدعم التعرف الصوتي — استخدم Chrome أو Edge");
      setPttListening(false);
      isListeningRef.current = false;
      stopPttTimer();
      return;
    }

    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;   // get several hypotheses, keep the most plate-like
    recognitionRef.current = recognition;
    setPttEngine("local");

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Pick the plate-likeliest alternative, not just the first —
          // recognizer confidence breaks near-ties between plate-shaped ones.
          const alts: string[] = [];
          const confs: number[] = [];
          for (let a = 0; a < result.length; a++) {
            alts.push(result[a].transcript);
            confs.push(result[a].confidence);
          }
          finalText += pickBestHypothesis(alts, confs);
        } else {
          interim += result[0].transcript;
        }
      }
      setPttLiveText((finalText || interim).trim());
      if (finalText.trim()) addPttResult(finalText.trim());
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setPttError(`خطأ: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        // Restart on a short delay — calling start() synchronously inside onend
        // can throw "already started" mid-teardown, which would silently end
        // the session after one plate. The delay lets it fully reset.
        setTimeout(() => {
          if (!isListeningRef.current) return;
          try { recognition.start(); } catch { setTimeout(() => { if (isListeningRef.current) { try { recognition.start(); } catch {} } }, 400); }
        }, 250);
      } else {
        setPttListening(false);
      }
    };

    recognition.start();
  }

  async function stopPtt() {
    isListeningRef.current = false;
    pttPausedRef.current = false; setPttPaused(false); // إيقاف كامل — صفّر الإيقاف المؤقت
    setPttListening(false);
    setPttLiveText("");
    setPttEngine(null);
    setPttMicActive(false);
    stopPttTimer();

    // مسار Speechmatics شغّال؟ وقّفه وفلّش المحلّل.
    if (smHandleRef.current) {
      const h = smHandleRef.current;
      smHandleRef.current = null;
      try { await h!.stop(); } catch {}
      processWhisperText("", true);
      return;
    }

    // مسار Deepgram شغّال؟ وقّف المسجّل، اقفل السوكيت، وفلّش المحلّل.
    if (dgSocketRef.current || dgRecorderRef.current || dgStreamRef.current) {
      // احفظ صوت الجلسة للتدريب دلوقتي (قبل ما ننضّف) — عشان يفضل موجود حتى لو
      // المندوب خرج/قفل التطبيق قبل التصدير (المفتاح لو شغّال بس).
      void persistPttAudio();
      if (dgKeepAliveRef.current) { clearInterval(dgKeepAliveRef.current); dgKeepAliveRef.current = null; }
      if (dgMicPollRef.current) { clearInterval(dgMicPollRef.current); dgMicPollRef.current = null; }
      try { dgGateRef.current?.close(); } catch {}
      dgGateRef.current = null;
      try { dgRecorderRef.current?.stop(); } catch {}
      try { dgSocketRef.current?.send(JSON.stringify({ type: "CloseStream" })); } catch {}
      try { dgSocketRef.current?.close(); } catch {}
      try { dgStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
      dgRecorderRef.current = null; dgSocketRef.current = null; dgStreamRef.current = null;
      processWhisperText("", true); // flush أي لوحة مقطوعة في المحلّل
      return;
    }

    // مسار Whisper المتواصل شغّال؟ وقّف المؤقّت والمسجّل وفرّغ آخر مقطع (final).
    if (pttChunkTimerRef.current) {
      clearInterval(pttChunkTimerRef.current);
      pttChunkTimerRef.current = null;
      try {
        const { VoiceRecorder } = await import("@independo/capacitor-voice-recorder");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let last: any = null;
        try { last = await VoiceRecorder.stopRecording(); } catch { /* مفيش مقطع أخير */ }
        if (last?.value?.recordDataBase64) {
          const text = await transcribeChunk(last.value.recordDataBase64, last.value.mimeType, getGroqKey());
          if (text) processWhisperText(text, true);
        } else {
          processWhisperText("", true); // flush أي بقايا في المحلّل
        }
      } catch { /* ignore */ }
      return;
    }

    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { SpeechRecognition } = (await import("@capacitor-community/speech-recognition")) as any;
        try { await SpeechRecognition.stop(); } catch {}
        return;
      }
    } catch {}

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
  }

  // ── IDB handlers ─────────────────────────────────────────────────────────
  async function handleParsed(table: ExcelTable, file: File) {
    const record: UploadedFileRecord = {
      key: "local:check",
      agentId: "local",
      slot: "check",
      fileName: file.name,
      headers: table.headers,
      rows: table.rows,
      uploadedAt: new Date().toISOString(),
      fileBlob: file,
    };
    await saveUploadedFile(record);
    setCheckTable(table);
    setCheckFile(file);
    const plate = detectPlateColumn(table.headers);
    setSelectedCheckCols(new Set(table.headers.filter((h) => h !== plate && matchesPreferred(h))));
    setCheckColsOpen(false);
    setManualInput("");
    setManualError(null);
    setManualResult(null);
    setCameraResult(null);
    setPttResults([]);
  }

  async function handleClear() {
    await deleteUploadedFile("local", "check");
    setCheckTable(null);
    setCheckFile(null);
    setSelectedCheckCols(new Set());
    setManualInput("");
    setManualError(null);
    setManualResult(null);
    setCameraResult(null);
    setPttResults([]);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">التشييك</h1>
        <p className="text-xs text-muted">فحص لوحات السيارات مقابل ملف الإحالة</p>
      </div>

      {/* ── حالة الـ GPS (فوق مربع ملف التشييك) ── */}
      <div className="flex flex-col gap-1.5">
        <button onClick={() => setGpsBoxOpen((v) => !v)} className="flex items-center gap-2 self-start text-xs font-bold text-ink">
          حالة الـ GPS
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${gps ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"}`}>
            {gps ? <><Wifi size={11} /> متصل</> : <><WifiOff size={11} /> غير متصل</>}
          </span>
          <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${gpsBoxOpen ? "rotate-180" : ""}`} />
        </button>
        {gpsBoxOpen && (
          <>
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${gps ? "border-border bg-surface" : "border-danger/50 bg-danger/5"}`}>
            <MapPin size={16} className={gps ? "text-primary" : "text-danger"} />
            <div className="flex-1 min-w-0">
              <p className={`truncate text-sm ${gps ? "text-ink" : "text-danger font-bold"}`}>
                {gps ? gpsAddress : "الموقع مش متقري — دوس تحديث"}
              </p>
              {gps && (() => {
                const lvl = gpsAccuracyLevel(gps.accuracy);
                const cls = lvl === "good" ? "text-brand" : lvl === "ok" ? "text-alert" : "text-danger";
                const hint = lvl === "good" ? "دقة ممتازة"
                  : lvl === "ok" ? "دقة متوسطة — لو الموقع غلط دوس تحديث"
                  : "دقة ضعيفة — استنى ثانية أو دوس تحديث";
                return (
                  <p className="text-xs text-muted">
                    {gps.lat.toFixed(5)}°N, {gps.lng.toFixed(5)}°E • <span className={`font-bold ${cls}`}>±{Math.round(gps.accuracy)}م</span>
                    <span className={`block ${cls}`}>{hint}</span>
                  </p>
                );
              })()}
            </div>
            <button onClick={refreshGps} disabled={gpsRefreshing} title="تحديث الموقع"
              className={`shrink-0 rounded-lg border p-1.5 transition disabled:opacity-50 ${gps ? "border-border text-muted hover:text-primary" : "border-danger/50 text-danger hover:bg-danger/10"}`}>
              <RefreshCw size={15} className={gpsRefreshing ? "animate-spin" : ""} />
            </button>
          </div>
          {/* سبب فشل «تحديث» — لازم يبان، وإلا الزرار يبان كأنه مايعملش حاجة. */}
          {gpsMsg && (
            <p className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-[12px] font-bold leading-relaxed text-warning" dir="rtl">
              {gpsMsg}
            </p>
          )}
          <p className="rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-[12px] font-bold leading-relaxed text-danger" dir="rtl">
            ⚠️ اتأكد إن خانة الـ GPS شغّالة كويس وبدقّة عالية قبل ما تبدأ — الموقع الدقيق مهم جداً في التشييك الصوتي واليدوي.
          </p>
          </>
        )}
      </div>

      {/* ── ملف التشييك ── */}
      <div className="flex flex-col gap-2">
        <FileUploadBox
          title="ملف التشييك"
          hint="القائمة المرجعية للبحث"
          parsedFile={checkFile}
          parsedRowCount={checkTable?.rows.length ?? null}
          plateCount={checkIndex.size}
          onParsed={handleParsed}
          onClear={handleClear}
          showReplaceButtons
        />
        {checkTable && (
          <div className="rounded-xl border border-border bg-surface">
            <button
              onClick={() => setCheckColsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink"
            >
              <span>الأعمدة ({checkTable.headers.length})</span>
              <ChevronDown
                size={14}
                className={`text-muted transition-transform duration-200 ${checkColsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {checkColsOpen && (
              <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                {/* Fixed plate search col */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted shrink-0">عمود البحث:</span>
                  <span className="rounded-full border border-primary bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
                    {checkPlateCol ?? "—"}
                  </span>
                  {!checkPlateCol && (
                    <span className="text-[11px] text-danger">لم يُعثر تلقائياً</span>
                  )}
                </div>
                {/* Multi-select display cols */}
                <div>
                  <p className="mb-1.5 text-[11px] text-muted">أعمدة النتيجة — اضغط لإظهار/إخفاء:</p>
                  <div className="flex flex-wrap gap-2">
                    {checkTable.headers
                      .filter((h) => h !== checkPlateCol)
                      .map((h) => (
                        <button
                          key={h}
                          onClick={() => toggleCheckCol(h)}
                          className={`rounded-full border px-3 py-1 text-xs transition ${
                            selectedCheckCols.has(h)
                              ? "bg-primary text-night font-bold border-primary"
                              : "border-border text-muted"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── No file notice ── */}
      {!checkTable && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          ارفع ملف التشييك أولاً لتفعيل البحث
        </div>
      )}

      {/* ── Mode tabs + content (only shown when file is loaded) ── */}
      {checkTable && (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-ink">التشييك</h2>
            {/* زر المزامنة — يرفع سجلات التشييك للسيرفر (تدريجي: الجديد بس) */}
            <button onClick={handleSyncRecords} disabled={syncingRecords}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50">
              <RefreshCw size={13} className={syncingRecords ? "animate-spin" : ""} />
              {syncingRecords ? "جارٍ..." : "مزامنة"}
            </button>
          </div>
          {/* Tabs */}
          <div className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {(
              [
                { key: "manual", Icon: Type, label: "يدوي" },
                { key: "camera", Icon: Camera, label: "كاميرا" },
                { key: "ptt", Icon: Mic, label: "صوتي" },
                { key: "chassis", Icon: Barcode, label: "شاص" },
                { key: "sheet", Icon: ClipboardCheck, label: "السجلات" },
              ] as const
            ).map(({ key, Icon, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center justify-center gap-1 rounded-lg py-2.5 text-xs font-bold transition ${
                  mode === key ? "bg-primary text-night" : "text-muted"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Manual ── */}
          {mode === "manual" && (
            <div className="flex flex-col gap-3">
              {/* مربع «اسم الموقع» اتشال — عمود «الحي-الشارع» (تلقائي من الـGPS) بيغني عنه. */}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="text"
                  placeholder="مثال: ق ن ص 1 2 3 4"
                  value={manualInput}
                  onChange={(e) => handleManualChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleManualSearch()}
                  className={`flex-1 rounded-xl border bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-muted focus:outline-none ${
                    manualError ? "border-danger focus:border-danger" : "border-border focus:border-primary"
                  }`}
                  dir="rtl"
                  autoComplete="off"
                />
                <button
                  onClick={handleManualSearch}
                  disabled={!manualInput.trim() || !!manualError}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-night transition disabled:opacity-40 active:scale-95"
                >
                  تشييك
                </button>
              </div>

              {/* Error with dismiss button */}
              {manualError && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2">
                  <p className="text-xs text-danger">{manualError}</p>
                  <button onClick={dismissManualError} className="shrink-0 text-danger hover:text-danger/70 transition">
                    <X size={14} />
                  </button>
                </div>
              )}

              <p className="text-xs text-muted" dir="rtl">
                يدعم الحروف العربية والإنجليزية (A→ا، B→ب، G→ق، ...) — كل لوحة تتشيّك ضد المطلوبين وتتضاف للقائمة تحت. تقدر تعدّل النوع والموقع والملاحظات من علامة القلم، وتصدّرهم للسجلات لما تخلّص.
              </p>

              {manualResult?.found && (
                <ResultCard result={manualResult} plateCol={checkPlateCol} selectedCols={selectedCheckCols} priorCheck={findDuplicateEntry(fieldEntries, manualResult.plate)} />
              )}

              {/* قائمة الشغل اليدوية (محلية — تتصدّر للسجلات بالزر تحت) */}
              {manualDraft.length > 0 && (() => {
                const draftCell = (e: FieldCheckEntry, field: string) => {
                  const cur = field === "plate" ? e.plate : (e.row[field] || "");
                  if (draftEdit?.id === e.id && draftEdit.field === field) {
                    return (
                      <span className="inline-flex items-center gap-1">
                        <input dir="rtl" value={draftEditValue}
                          onChange={(ev) => setDraftEditValue(
                            field === "plate"
                              ? ev.target.value.toUpperCase().split("").map((c) => EN_TO_AR[c] ?? c).join("")
                              : ev.target.value
                          )}
                          onKeyDown={(ev) => { if (ev.key === "Enter") applyDraftEdit(); if (ev.key === "Escape") setDraftEdit(null); }}
                          autoFocus className="w-24 rounded border border-primary bg-surface-2 px-2 py-1 text-ink outline-none" />
                        <button onClick={applyDraftEdit} className="text-brand"><Check size={14} /></button>
                        <button onClick={() => setDraftEdit(null)} className="text-muted"><X size={14} /></button>
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      {field === "plate" ? e.plate : (cur || "—")}
                      <button onClick={() => startDraftEdit(e.id, field, cur)} className="text-muted hover:text-primary transition" title="تعديل"><Pencil size={12} /></button>
                    </span>
                  );
                };
                const allSel = manualSel.size === manualDraft.length && manualDraft.length > 0;
                return (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted">{manualDraft.length} لوحة في القائمة</span>
                      {/* «تحديد الكل» على اليمين والزوم على الشمال (بطلب المستخدم) */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={toggleManualSelAll} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                          {allSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                          {allSel ? "إلغاء الكل" : "تحديد الكل"}
                        </button>
                        <ZoomControl zoom={manualZoom} setZoom={setManualZoom} />
                      </div>
                    </div>
                    <div ref={manualPinchRef} className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "45vh", touchAction: "pan-x pan-y" }}>
                      <table className="border-collapse w-full" style={{ direction: "rtl", fontSize: `${zoomFontPx(manualZoom)}px` }}>
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-surface-2 text-muted">
                            <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">☐</th>
                            <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                            <th className="border-b border-l border-border px-3 py-2 text-center font-bold whitespace-nowrap">الحالة</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">النوع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحي-الشارع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">ملاحظات</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                            <th className="border-b border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortNear(manualDraft).map((e, i) => {
                            const matched = isDraftMatched(e);
                            const sel = manualSel.has(e.id);
                            const dup = dupeBg(e.plate);
                            const rowBg = sel ? "bg-primary/15" : dup || (matched ? "bg-brand/10" : i % 2 === 0 ? "bg-surface" : "bg-surface-2/40");
                            return (
                            <tr key={e.id} title={dup ? DUPE_TITLE : undefined} className={`border-b border-border ${rowBg}`}>
                              <td className="border-l border-border px-2 py-2 text-center">
                                <button onClick={() => toggleManualSel(e.id)} className="text-muted hover:text-primary transition">
                                  {sel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                                </button>
                              </td>
                              {/* ترقيم + نسخ/واتساب/حذف — تاني عمود بعد التحديد */}
                              <td className="border-l border-border px-2 py-2">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                                  <button onClick={() => copyDraftRow(e)} className="text-muted hover:text-primary transition" title="نسخ">
                                    {manualCopiedId === e.id ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                                  </button>
                                  <button onClick={() => shareDraftRow(e)} className="text-muted hover:text-primary transition" title="مشاركة واتساب"><Share2 size={13} /></button>
                                  <button onClick={() => deleteDraftEntry(e.id)} className="text-muted hover:text-danger transition" title="حذف"><Trash2 size={13} /></button>
                                </div>
                              </td>
                              <td className={`border-l border-border px-3 py-2 whitespace-nowrap font-bold ${matched ? "text-brand" : "text-ink"}`}>
                                {draftCell(e, "plate")}
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-center">
                                {matched && <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-bold text-brand">مطلوبة</span>}
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink"><VehicleTypeSelect value={e.row["النوع"] ?? ""} onChange={(code) => setManualDraftType(e.id, code)} /></td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{e.row["الحي-الشارع"] ?? ""}</td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{draftCell(e, "ملاحظات")}</td>
                              <td className="border-l border-border px-3 py-2">
                                {e.mapsLink ? (
                                  <a href={e.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline whitespace-nowrap"><MapPin size={10} /> خريطة</a>
                                ) : <span className="text-muted text-[10px] animate-pulse">جاري...</span>}
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{formatDate(e.checkedAt)}</td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* شريط جماعي — يظهر لما يبقى فيه محدّد */}
                    {manualSel.size > 0 && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                        <span className="text-xs font-bold text-ink">{manualSel.size} محددة</span>
                        <div className="flex gap-2">
                          <button onClick={shareManualSelected} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90"><Share2 size={13} /> واتساب</button>
                          <button onClick={deleteManualSelected} className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20"><Trash2 size={13} /> مسح</button>
                        </div>
                      </div>
                    )}

                    {/* تصدير للسجلات — الشيت الموحّد الوحيد لكل طرق التشييك */}
                    <button
                      onClick={exportManualDraft}
                      disabled={manualExporting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 py-2.5 text-sm font-bold text-primary transition disabled:opacity-40 active:scale-95"
                    >
                      <Download size={16} /> {manualExporting ? "جاري التصدير..." : `تصدير ${manualDraft.length} لوحة للسجلات`}
                    </button>
                    <button
                      onClick={clearAllManualDraft}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/10 py-2.5 text-sm font-bold text-danger transition active:scale-95"
                    >
                      <Trash2 size={16} /> مسح الكل
                    </button>
                  </div>
                );
              })()}

            </div>
          )}

          {/* ── Camera ── */}
          {mode === "camera" && (
            <div className="flex flex-col gap-3">
              {/* Hidden inputs */}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraCapture} />
              <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handleCameraCapture} />

              {/* ── Live viewfinder ── */}
              {liveStream && !cameraImage && (
                <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "4/3" }}>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

                  {/* Dark mask outside the plate zone (29% top/bottom, 5% sides) */}
                  <div className="absolute pointer-events-none bg-black/55" style={{ top: 0, left: 0, right: 0, height: "29%" }} />
                  <div className="absolute pointer-events-none bg-black/55" style={{ bottom: 0, left: 0, right: 0, top: "71%" }} />
                  <div className="absolute pointer-events-none bg-black/55" style={{ top: "29%", bottom: "29%", left: 0, width: "5%" }} />
                  <div className="absolute pointer-events-none bg-black/55" style={{ top: "29%", bottom: "29%", right: 0, width: "5%" }} />

                  {/* Plate zone border */}
                  <div className="absolute pointer-events-none border-2 border-white" style={{ top: "29%", left: "5%", right: "5%", bottom: "29%" }} />

                  {/* Corner accents */}
                  {[["top-[29%] left-[5%]","border-t-2 border-l-2"],["top-[29%] right-[5%]","border-t-2 border-r-2"],["bottom-[29%] left-[5%]","border-b-2 border-l-2"],["bottom-[29%] right-[5%]","border-b-2 border-r-2"]].map(([pos,border],i) => (
                    <div key={i} className={`absolute pointer-events-none w-5 h-5 border-brand ${pos} ${border}`} />
                  ))}

                  {/* Guide label */}
                  <p className="absolute pointer-events-none text-white/80 text-[11px] font-bold w-full text-center" style={{ top: "22%" }}>
                    وجّه اللوحة داخل الإطار
                  </p>

                  {/* Capture button */}
                  <button onClick={captureFromLive}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/25 active:scale-95 transition">
                    <Camera size={26} className="text-white" />
                  </button>

                  {/* Close */}
                  <button onClick={closeLiveCamera} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5">
                    <X size={14} className="text-white" />
                  </button>
                </div>
              )}

              {/* ── No stream, no image: two entry points ── */}
              {!liveStream && !cameraImage && (
                <div className="flex gap-2">
                  <button
                    onClick={openLiveCamera}
                    disabled={cameraLoading}
                    className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 py-8 text-muted transition active:scale-95"
                  >
                    <Camera size={26} />
                    <span className="text-xs font-medium">كاميرا</span>
                  </button>
                  <button
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={cameraLoading}
                    className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 py-8 text-muted transition active:scale-95"
                  >
                    <Images size={26} />
                    <span className="text-xs font-medium">المعرض</span>
                  </button>
                </div>
              )}

              {/* ── Captured image (after OCR) ── */}
              {cameraImage && (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cameraImage} alt="لوحة" className="w-full object-cover max-h-48" />
                  {cameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                      <Loader2 size={28} className="animate-spin text-white" />
                      <span className="text-sm text-white">جاري قراءة اللوحة...</span>
                    </div>
                  )}
                  {!cameraLoading && (
                    <button onClick={resetCamera} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5">
                      <X size={14} className="text-white" />
                    </button>
                  )}
                </div>
              )}

              {!cameraLoading && cameraImage && (
                <div className="flex gap-2">
                  <button onClick={openLiveCamera}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted">
                    <Camera size={14} /> كاميرا
                  </button>
                  <button onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted">
                    <Images size={14} /> المعرض
                  </button>
                  <button onClick={resetCamera}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 py-2.5 text-sm font-bold text-danger active:scale-95 transition">
                    <Trash2 size={14} /> مسح
                  </button>
                </div>
              )}

              {cameraError && <p className="text-center text-xs text-danger">{cameraError}</p>}

              {/* Editable plate + search */}
              {!cameraLoading && cameraImage && (
                <div className="flex gap-2 items-center">
                  <input dir="rtl" value={cameraInputPlate}
                    onChange={(e) => { const v = e.target.value.toUpperCase().split("").map((c) => EN_TO_AR[c] ?? c).join(""); setCameraInputPlate(v); }}
                    placeholder="اكتب أو صحّح رقم اللوحة..."
                    className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-center focus:border-brand outline-none"
                  />
                  <button
                    onClick={() => { const v = cameraInputPlate.trim(); if (!v) return; setCameraError(null); const result = searchInCheck(v); setCameraResult(result); if (result) { saveHitWithGps(result); void getCurrentGps().then(setCameraGps); } }}
                    className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white active:scale-95 transition shrink-0"
                  >
                    بحث
                  </button>
                </div>
              )}

              {!cameraLoading && cameraRawText && (
                <p className="text-center text-[10px] text-muted" dir="ltr">
                  <span className="font-mono">{cameraRawText.slice(0, 120)}</span>
                </p>
              )}

              {cameraResult && <ResultCard result={cameraResult} plateCol={checkPlateCol} selectedCols={selectedCheckCols} onExport={async (r) => { await exportToFieldCheck(r, "camera", cameraGps); const id = lastHitIdRef.current ?? manualHits.find((h) => plateKey(h.plate) === plateKey(r.plate) && !hitsExportedIds.has(h.id))?.id; if (id) setHitsExportedIds((s) => new Set(s).add(id)); }} onShare={shareCameraResult} priorCheck={cameraResult.found ? findDuplicateEntry(fieldEntries, cameraResult.plate) : undefined} />}
            </div>
          )}

          {/* ── Chassis (شاص) ── */}
          {mode === "chassis" && (
            <div className="flex flex-col gap-3">
              <input ref={chassisCamInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChassisCapture} />
              <input ref={chassisGalInputRef} type="file" accept="image/*" className="hidden" onChange={handleChassisCapture} />

              <p className="text-center text-xs text-muted">صوّر رقم الشاصي (VIN) أو ارفع صورة أو اكتبه — ويتشيّك على عمود الهيكل في كل ورقات ملف التشييك.</p>
              {chassisBuilding && (
                <p className="text-center text-xs font-bold text-primary animate-pulse">جاري تجهيز فهرس الشاص من ملف التشييك…</p>
              )}
              {checkTable && !chassisBuilding && !chassisSheetFound && (
                <p className="text-center text-xs text-alert">⚠️ مفيش عمود شاصي/هيكل في ملف التشييك — هيقرا الرقم بس من غير تشييك.</p>
              )}

              {!cameraImage && (
                <div className="flex gap-2">
                  <button onClick={() => chassisCamInputRef.current?.click()} disabled={cameraLoading}
                    className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 py-8 text-muted transition active:scale-95">
                    <Camera size={26} />
                    <span className="text-xs font-medium">صوّر الشاصي</span>
                  </button>
                  <button onClick={() => chassisGalInputRef.current?.click()} disabled={cameraLoading}
                    className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 py-8 text-muted transition active:scale-95">
                    <Images size={26} />
                    <span className="text-xs font-medium">ارفع صورة</span>
                  </button>
                </div>
              )}

              {cameraImage && (
                <div className="relative overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cameraImage} alt="شاصي" className="w-full object-cover max-h-48" />
                  {cameraLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                      <Loader2 size={28} className="animate-spin text-white" />
                      <span className="text-sm text-white">جاري قراءة الشاصي...</span>
                    </div>
                  )}
                  {!cameraLoading && (
                    <button onClick={resetCamera} className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5">
                      <X size={14} className="text-white" />
                    </button>
                  )}
                </div>
              )}

              {!cameraLoading && cameraImage && (
                <div className="flex gap-2">
                  <button onClick={() => chassisCamInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted"><Camera size={14} /> كاميرا</button>
                  <button onClick={() => chassisGalInputRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted"><Images size={14} /> المعرض</button>
                  <button onClick={resetCamera} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger/40 bg-danger/10 py-2.5 text-sm font-bold text-danger active:scale-95 transition"><Trash2 size={14} /> مسح</button>
                </div>
              )}

              {cameraError && <p className="text-center text-xs text-danger">{cameraError}</p>}

              <div className="flex gap-2 items-center">
                <input dir="ltr" value={cameraInputPlate}
                  onChange={(e) => setCameraInputPlate(e.target.value.toUpperCase())}
                  placeholder="أو اكتب رقم الشاصي (VIN) للبحث..."
                  className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-center font-mono focus:border-brand outline-none"
                />
                <button
                  onClick={() => { const v = cameraInputPlate.trim(); if (!v) return; setCameraError(null); onChassisResult(v, matchChassis(v, chassisIndex)); }}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white active:scale-95 transition shrink-0"
                >بحث</button>
              </div>

              {!cameraLoading && cameraRawText && (
                <p className="text-center text-[10px] text-muted" dir="ltr"><span className="font-mono">{cameraRawText.slice(0, 120)}</span></p>
              )}

              {cameraChassisResult && (
                <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                  {/* رأس: رقم الشاص + الحالة */}
                  <div className={`flex items-center justify-between gap-2 px-4 py-3 ${cameraChassisResult.match.found ? "bg-danger/10" : "bg-brand/10"}`}>
                    <span className="font-mono text-sm font-bold break-all" dir="ltr">{cameraChassisResult.vin}</span>
                    <span className={`flex shrink-0 items-center gap-1 text-sm font-bold ${cameraChassisResult.match.found ? "text-danger" : "text-brand"}`}>
                      {cameraChassisResult.match.found ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                      {cameraChassisResult.match.found
                        ? (cameraChassisResult.match.matchType === "fuzzy" ? `مطلوب ${cameraChassisResult.match.similarity}%`
                          : cameraChassisResult.match.matchType === "partial" ? "مطلوب (آخر الأرقام)"
                          : "مطلوب")
                        : "غير مطلوب"}
                    </span>
                  </div>

                  {/* اللوحة المرتبطة بالشاصي — بارزة قدّام رقم الشاص */}
                  {cameraChassisResult.match.found && cameraChassisResult.match.row && chassisPlate(cameraChassisResult.match.row) && (
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
                      <span className="shrink-0 text-[11px] font-medium text-muted">اللوحة</span>
                      <span className="rounded-lg bg-danger/15 px-3 py-1 text-sm font-bold text-danger" dir="rtl">{chassisPlate(cameraChassisResult.match.row)}</span>
                    </div>
                  )}

                  {/* الخانات — بيانات السيارة (عرض) + خانات قابلة للتعديل بالقلم + الموقع/التاريخ */}
                  <div className="flex flex-col divide-y divide-border">
                    {cameraChassisResult.match.found && cameraChassisResult.match.row &&
                      chassisRowToInfo(cameraChassisResult.match.row).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="shrink-0 text-[11px] font-medium text-muted">{k}</span>
                          <span className="min-w-0 flex-1 truncate text-left text-sm text-ink">{v}</span>
                        </div>
                      ))}

                    {/* نوع السيارة بقائمة الحروف المختصرة — نفس اللي في جداول اللوحات */}
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="shrink-0 text-[11px] font-medium text-muted">نوع السيارة</span>
                      <VehicleTypeSelect value={chVehicleType} onChange={setChVehicleType} className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm text-ink outline-none focus:border-primary" />
                    </div>
                    <EditableField label="ملاحظات" value={chNotes} onChange={setChNotes} placeholder="ملاحظات" />
                    <EditableField label="اسم المنطقة" value={chRegion} onChange={setChRegion} placeholder="اسم المنطقة" />

                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="shrink-0 text-[11px] font-medium text-muted">الموقع</span>
                      {chLocEditing ? (
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <input
                            dir="ltr"
                            autoFocus
                            value={chLocInput}
                            onChange={(e) => setChLocInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") applyChassisLocation(); }}
                            placeholder="الصق رابط خرائط أو lat,lng"
                            className="min-w-0 flex-1 rounded-lg border border-brand bg-surface-2 px-2 py-1 text-xs text-ink outline-none"
                          />
                          <button onClick={applyChassisLocation} className="shrink-0 rounded-lg bg-primary px-3 py-1 text-xs font-bold text-night active:scale-95 transition">حفظ</button>
                        </div>
                      ) : (
                        <div className="flex min-w-0 items-center justify-end gap-2">
                          {(chLocLink || cameraGps) ? (
                            <a href={chLocLink || toMapsLink(cameraGps!.lat, cameraGps!.lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-bold text-primary">
                              <MapPin size={14} /> فتح الدبوس {chLocLink ? "(موقع السيارة)" : ""}
                            </a>
                          ) : (
                            <span className="text-sm text-muted">جاري تحديد الموقع...</span>
                          )}
                          <button onClick={() => { setChLocInput(chLocLink || (cameraGps ? `${cameraGps.lat},${cameraGps.lng}` : "")); setChLocEditing(true); }} className="shrink-0" aria-label="تعديل الموقع لموقع السيارة الأصلي">
                            <Pencil size={13} className="text-primary" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="shrink-0 text-[11px] font-medium text-muted">التاريخ</span>
                      <span className="text-sm text-ink">{chDate ? new Date(chDate).toLocaleString("ar-EG") : ""}</span>
                    </div>
                  </div>

                  {/* زرين: تسجيل + حذف */}
                  <div className="flex gap-2 border-t border-border p-3">
                    <button onClick={saveChassisRecord} disabled={chSaved}
                      className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition active:scale-95 ${chSaved ? "bg-surface-2 text-muted" : "bg-primary text-night"}`}>
                      {chSaved ? "✓ اتصدّر لشيت الشاص" : "تصدير لشيت الشاص"}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm("متأكد إنك عايز تحذف نتيجة الشاصي دي؟")) return;
                        if (chLastSavedId) setChassisRecords(deleteChassisRecord(chLastSavedId));
                        resetCamera();
                      }}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-bold text-danger active:scale-95 transition">
                      <Trash2 size={15} /> حذف
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── PTT ── */}
          {mode === "ptt" && (
            <div className="flex flex-col items-center gap-4">
              {/* مربع «اسم الموقع» اتشال — عمود «الحي-الشارع» (تلقائي من الـGPS) بيغني عنه. */}
              {/* منظّم الإيقاع — اهتزاز + وميض بين اللوحات (بدون صوت، مايأثّرش على التفريغ) */}
              <div className="flex w-full max-w-xs flex-col items-center gap-1">
                <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2" dir="rtl">
                  <span className="text-xs font-bold text-ink">منظّم الإيقاع (اهتزاز)</span>
                  <button type="button" onClick={() => savePacer(!pacerOn, pacerSec)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${pacerOn ? "bg-primary text-night" : "border border-border text-muted"}`}>
                    {pacerOn ? "شغّال" : "مطفي"}
                  </button>
                </div>
                {pacerOn && (
                  <div className="flex items-center gap-1" dir="rtl">
                    <span className="text-[10px] text-muted">نبضة كل:</span>
                    {[2, 3, 4, 5].map((s) => (
                      <button key={s} type="button" onClick={() => savePacer(true, s)}
                        className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition ${pacerSec === s ? "bg-primary text-night" : "border border-border text-muted"}`}>
                        {s}ث
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── الرأي التاني (موديلنا المدرَّب) — **المالك وحده**، والمفتاح المركزي شغّال ──
                  المربّع ده مايظهرش لأي حد تاني: judgeVisible بيتحوّل true بس بعد
                  isPilotOwner + المفتاح. النفق والتوكن بيتحفظوا على الجهاز
                  (ph:plateJudge:url / ph:plateJudge:token) — مافيش سر في الريبو. */}
              {judgeVisible && (
                <div className="w-full max-w-xs rounded-xl border border-dashed border-primary/50 bg-surface-2 p-2" dir="rtl">
                  {/* ── الحالة: **إعداد محفوظ ≠ واصل** ─────────────────────────
                      الكلمة «متوصّل» هي اللي غشّت المالك جلسة كاملة: كانت بتتكتب
                      من `readJudgeEndpoint()` بس، يعني «فيه نفق وتوكن مخزّنين
                      وشكلهم سليم» — ولا بايت اتحرّك على الشبكة. دلوقتي «محفوظ»
                      بتوصف التخزين، و«واصل ✓» مابتتكتبش غير بعد **رحلة حقيقية**
                      (زر «جرّب الاتصال» أو نبضة جاوبت فعلاً). */}
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary">🧪 الرأي التاني (طيّار)</span>
                    {(() => {
                      const verified = judgeProbe?.ok === true || judgeLast === "answered";
                      const label = !judgeCfgOk ? "محتاج إعداد"
                        : verified ? "واصل ✓"
                        : (judgeProbe && !judgeProbe.ok) ? "مش واصل ✗"
                        : "محفوظ (مش متجرَّب)";
                      const tone = !judgeCfgOk ? "text-muted"
                        : verified ? "text-brand"
                        : (judgeProbe && !judgeProbe.ok) ? "text-alert"
                        : "text-amber-500";
                      return <span className={`text-[10px] font-bold ${tone}`}>{label}</span>;
                    })()}
                  </div>
                  <div className="flex flex-col gap-1">
                    <input
                      dir="ltr" inputMode="url" autoComplete="off" spellCheck={false}
                      value={judgeUrlInput} onChange={(e) => setJudgeUrlInput(e.target.value)}
                      placeholder="https://xxx.trycloudflare.com"
                      className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-primary"
                    />
                    <input
                      dir="ltr" type="password" autoComplete="off" spellCheck={false}
                      value={judgeTokenInput} onChange={(e) => setJudgeTokenInput(e.target.value)}
                      placeholder="التوكن المشترك"
                      className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-ink outline-none focus:border-primary"
                    />
                    <div className="flex items-center gap-1">
                      <button type="button"
                        onClick={() => {
                          const ok = saveJudgeEndpoint(judgeUrlInput, judgeTokenInput);
                          setJudgeCfgOk(ok);
                          // إعداد جديد ⇒ أي «واصل ✓» قديم بقى بلا معنى.
                          setJudgeProbe(null);
                          if (!ok) alert("العنوان لازم https (أو localhost) بلا استعلام، والتوكن ١٢ محرف على الأقل بلا مسافات.");
                          else { const cfg = readJudgeEndpoint(); if (cfg) setJudgeUrlInput(cfg.base); }
                        }}
                        className="flex-1 rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-night">حفظ</button>
                      <button type="button"
                        onClick={() => { clearJudgeEndpoint(); setJudgeCfgOk(false); setJudgeProbe(null); setJudgeUrlInput(""); setJudgeTokenInput(""); }}
                        className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted">مسح</button>
                      <button type="button"
                        onClick={async () => {
                          const mods = judgeModsRef.current;
                          if (!mods) return;
                          try {
                            const jsonl = await mods.log.judgeLogJsonl();
                            const s = mods.log.summarizeJudgeLog(await mods.log.getJudgeLog());
                            if (jsonl) await navigator.clipboard.writeText(jsonl);
                            alert(`سجل الطيّار: ${s.total} نبضة · مجاوبة ${s.answered} · اتفاق ${s.agreed} (${s.agreeRate}٪) · مسكوتة ${s.skipped} · مُصدَّرة ${s.exported} · متوسط الخدمة ${s.avgServerMs ?? "—"}ms\n${jsonl ? "اتنسخ JSONL للحافظة ✓" : "لسه فاضي"}`);
                          } catch { alert("تعذّر نسخ السجل."); }
                        }}
                        className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted">السجل</button>
                    </div>
                    {/* ── «جرّب الاتصال»: رحلة **حقيقية** كاملة قبل أي كلام ──────
                        بيبعت مقطع WAV صناعي ٤٠٠ms على نفس `POST /transcribe` اللي
                        النبضة بتمشي عليه — نفس الترويسة، نفس الـpreflight، نفس
                        النفق، نفس ffmpeg، نفس الموديل، نفس فحص الرد. فالنتيجة
                        بتسمّي المشكلة بالحرف (لوحة وزمن، أو ٤٠١/٤٠٤/مخرجش) قبل ما
                        المالك يقرا جلسة كاملة في الهوا. */}
                    <button type="button" disabled={judgeProbing || !judgeCfgOk}
                      onClick={async () => {
                        const mods = judgeModsRef.current;
                        const cfg = readJudgeEndpoint();
                        if (!mods || !cfg) { setJudgeProbe(null); return; }
                        setJudgeProbing(true);
                        try {
                          setJudgeProbe(await mods.client.probeJudgeTranscribe({
                            transcribeUrl: cfg.transcribeUrl, token: cfg.token,
                          }));
                        } finally { setJudgeProbing(false); }
                      }}
                      className="rounded-lg border border-primary/60 px-2 py-1 text-[11px] font-bold text-primary disabled:opacity-40">
                      {judgeProbing ? "بيجرّب…" : "جرّب الاتصال"}
                    </button>
                    {judgeProbe && (
                      <span className={`text-[10px] ${judgeProbe.ok ? "text-brand" : "text-alert"}`}>
                        {judgeProbe.ok
                          ? `الفحص: وصل ✓ «${judgeProbe.plate || "—"}» · ${judgeProbe.serverMs ?? "?"}ms خدمة · ${judgeProbe.clientMs}ms إجمالي · ${judgeProbe.model ?? "—"}`
                          : `الفحص فشل: ${judgeModsRef.current?.log.describeJudgeOutcome(judgeProbe.code) ?? judgeProbe.code}`}
                      </span>
                    )}
                    {/* آخر نبضة — «محفوظ» بتوصف التخزين بس، ودي بتوصف الواقع.
                        بلا السطر ده الطيّار يقدر يموت بصمت (٤٠٤/٤٠١ كانوا بيرجعوا
                        من الخدمة قبل أي تسجيل) والمربّع يفضل مطمّن. للمالك بس. */}
                    {judgeLast && (
                      <span className={`text-[10px] ${judgeLast === "answered" ? "text-brand" : "text-alert"}`}>
                        آخر نبضة: {judgeModsRef.current?.log.describeJudgeOutcome(judgeLast) ?? judgeLast}
                      </span>
                    )}
                    {/* عدّاد الجلسة — **دايماً** ظاهر، بالمسكوت وأعلى سببه. قبل كده
                        كان بيظهر بس لو فيه نبضة مجاوبة، فجلسة صفر طلب كان شكلها
                        بالحرف زي الطيّار مقفول: مافيش سطر خالص. الصفر لازم يبان. */}
                    <span className="text-[10px] text-muted">
                      {judgeModsRef.current?.log.formatJudgeSessionLine(judgeCounts) ?? ""}
                    </span>
                  </div>
                </div>
              )}

              {/* زر الميكروفون الكبير + زر الإيقاف المؤقت الأصغر جنبه (أثناء التسجيل) */}
              <div className="flex items-center justify-center gap-3">
                {/* Big mic button — أخضر في السكون، أحمر أثناء الاستماع (مايومضش وقت الإيقاف المؤقت) */}
                <button
                  onClick={pttListening ? stopPtt : startPtt}
                  className={`flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-full border-4 text-white transition active:scale-95 ${
                    pttListening
                      ? `border-red-600 bg-red-500 shadow-[0_0_22px_rgba(239,68,68,0.55)] ${pttPaused ? "" : "animate-pulse"}`
                      : "border-emerald-600 bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.45)]"
                  }`}
                >
                  <Mic size={28} />
                  <span className="text-xs font-bold">
                    {pttListening ? "إيقاف" : "ابدأ"}
                  </span>
                </button>

                {/* إيقاف مؤقت/استئناف — أصغر، جنب زر التسجيل. يوقف العدّاد والمايك
                    عشان المندوب يعدّل لوحة غلط من غير ما يكبر وقت التسجيل، وبعدين يكمّل. */}
                {pttListening && (
                  <button
                    type="button"
                    onClick={togglePttPause}
                    title={pttPaused ? "استئناف التسجيل" : "إيقاف مؤقت (للتعديل)"}
                    aria-label={pttPaused ? "استئناف التسجيل" : "إيقاف مؤقت"}
                    className={`flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-full border-4 transition active:scale-95 ${
                      pttPaused
                        ? "border-emerald-600 bg-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.5)]"
                        : "border-amber-500 bg-amber-400 text-night shadow-[0_0_14px_rgba(245,158,11,0.5)]"
                    }`}
                  >
                    {pttPaused ? <Play size={20} /> : <Pause size={20} />}
                    <span className="text-[9px] font-bold leading-none">{pttPaused ? "كمّل" : "إيقاف مؤقت"}</span>
                  </button>
                )}
              </div>

              {/* نبضة منظّم الإيقاع — "قول اللوحة دلوقتي" (اهتزاز + وميض، بدون صوت) */}
              {pttListening && pacerOn && (
                <div className={`rounded-full px-5 py-2 text-sm font-black transition-all duration-150 ${pacerPulse ? "scale-110 bg-brand text-night shadow-brand-glow" : "bg-surface-2 text-muted"}`} dir="rtl">
                  {pacerPulse ? "🔵 قول اللوحة" : "…"}
                </div>
              )}

              {/* مؤقّت مدة التسجيل — يظهر تحت الزر أثناء الاستماع (بيتجمّد وقت الإيقاف المؤقت) */}
              {pttListening && (
                <div
                  dir="ltr"
                  className={`flex items-center gap-1.5 font-mono text-lg font-black tabular-nums ${pttPaused ? "text-amber-500" : "text-red-500"}`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${pttPaused ? "bg-amber-500" : "animate-pulse bg-red-500"}`} />
                  {String(Math.floor(pttSeconds / 60)).padStart(2, "0")}:
                  {String(pttSeconds % 60).padStart(2, "0")}
                  {pttPaused && <span dir="rtl" className="mr-1 text-[11px] font-bold text-amber-500">⏸ متوقّف مؤقتاً — عدّل وكمّل</span>}
                </div>
              )}

              {/* مؤشّر السماع (VAD) — لـ Deepgram فقط (هو اللي فيه بوابة كلام) */}
              {pttListening && pttEngine === "deepgram" && (
                <span className={`flex items-center gap-1 text-[11px] font-bold ${pttMicActive ? "text-brand" : "text-muted"}`}>
                  <span className={`h-2 w-2 rounded-full ${pttMicActive ? "animate-pulse bg-brand" : "bg-muted"}`} />
                  {pttMicActive ? "بيسمع صوتك" : "هدوء"}
                </span>
              )}

              {/* اسم المحرك النشط — للسوبر أدمن فقط (تشخيص، مخفي عن المناديب والأدمنز) */}
              {pttListening && isSuper && (
                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-bold text-primary" dir="ltr">
                  🎙 {pttEngine === "deepgram" ? "Deepgram (لحظي)"
                    : pttEngine === "speechmatics" ? "Speechmatics (لحظي)"
                    : pttEngine === "whisper" ? "Whisper/Groq (تقطيع ٧ث)"
                    : pttEngine === "local" ? "المحرك المحلي"
                    : "..."}
                </span>
              )}

              {pttListening && (
                <p className="text-center text-xs text-muted">
                  {pttLiveText ? `"${pttLiveText}"` : "جاري الاستماع..."}
                </p>
              )}

              {pttError && (
                <p className="text-center text-xs text-danger">{pttError}</p>
              )}

              {/* لوحة ديبج النص الخام — للسوبر أدمن فقط (اللي المحرك سمعه قبل التحليل) */}
              {isSuper && pttRawLog.length > 0 && (
                <div className="w-full max-w-xs rounded-xl border border-dashed border-primary/40 bg-surface-2 p-2" dir="rtl">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-primary">🐞 النص الخام (سوبر أدمن)</span>
                    <button type="button" onClick={() => { pttRawLogRef.current = []; setPttRawLog([]); }}
                      className="text-[10px] text-muted underline">مسح</button>
                  </div>
                  <div className="flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                    {[...pttRawLog].reverse().map((t, i) => (
                      <span key={i} className="text-[11px] text-ink" dir="auto">• {t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── تنبيه كبير: يظهر فقط لما اللوحة تطلع مطلوبة (تطابق تام أو مشتبه) ── */}
              {pttAlert && (
                <div className="w-full relative">
                  <div className="mb-1 flex items-center justify-center gap-1.5 text-danger">
                    <AlertTriangle size={16} className="animate-pulse" />
                    <span className="text-sm font-black">🚨 لوحة مطلوبة!</span>
                  </div>
                  <button
                    onClick={() => setPttAlert(null)}
                    className="absolute left-2 top-7 z-10 rounded-full bg-black/50 p-1.5"
                    title="إخفاء"
                  >
                    <X size={14} className="text-white" />
                  </button>
                  <ResultCard
                    result={{ plate: pttAlert.plate, normalized: "", found: pttAlert.found, matchType: pttAlert.matchType, similarity: pttAlert.similarity, row: pttAlert.row }}
                    plateCol={checkPlateCol}
                    selectedCols={selectedCheckCols}
                    onExport={async (r) => { await exportToFieldCheck(r, "ptt"); setPttExportedIds((s) => new Set(s).add(pttAlert.id)); markJudgeExportedIfArmed([pttAlert.id]); }}
                    priorCheck={findDuplicateEntry(fieldEntries, pttAlert.plate)}
                  />
                </div>
              )}

              {/* نافذة النتائج — كل لوحة تتقال كصف مضغوط بتفاصيلها وموقعها */}
              {pttResults.length > 0 && (() => {
                const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
                return (
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted flex items-center gap-2">
                        {pttResults.length} لوحة
                        {learningOn && (
                          <button type="button" onClick={pttLearnDiag} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary" title="اضغط لتشخيص جمع التعلّم">
                            تعلّم: {trainingToday}
                          </button>
                        )}
                      </span>
                      {/* «تحديد الكل» على اليمين والزوم على الشمال (بطلب المستخدم) */}
                      <div className="flex items-center gap-1.5">
                        <button onClick={togglePttSelAll}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                          {pttSel.size === pttResults.length && pttResults.length > 0 ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                          {pttSel.size === pttResults.length && pttResults.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
                        </button>
                        <button onClick={handleNearestIC} disabled={icLocating} title="ترتيب حسب الأقرب لموقعك"
                          className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition ${icNearest ? "bg-primary text-night font-bold" : "border border-border bg-surface-2 text-muted hover:text-primary"}`}>
                          <Navigation size={13} /> {icLocating ? "..." : "الأقرب"}
                        </button>
                        <PlateImagesButton title="لوحات التشييك (صوتي)"
                          build={() => pttImgRows(sortNear(pttResults))}
                          className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-primary transition" />
                        <ZoomControl zoom={pttZoom} setZoom={setPttZoom} />
                      </div>
                    </div>
                    <div ref={pttPinchRef} className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh", touchAction: "pan-x pan-y" }}>
                      <table className="border-collapse w-full" style={{ direction: "rtl", fontSize: `${zoomFontPx(pttZoom)}px` }}>
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-surface-2 text-muted">
                            <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">☐</th>
                            <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                            <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">الحالة</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">النوع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحي-الشارع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">ملاحظات</th>
                            {dynCols.map((h) => (
                              <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                            ))}
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                            <th className="border-b border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortNear(pttResults).map((r, i) => (
                            <tr key={r.id} title={dupeBg(r.plate) ? DUPE_TITLE : undefined} className={`border-b border-border ${pttSel.has(r.id) ? "bg-primary/15" : dupeBg(r.plate) || (r.found ? (r.matchType === "fuzzy" ? "bg-alert/10" : "bg-brand/10") : "bg-surface")}`}>
                              <td className="border-l border-border px-2 py-2 text-center">
                                <button onClick={() => togglePttSel(r.id)} className="text-muted hover:text-primary transition">
                                  {pttSel.has(r.id) ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                                </button>
                              </td>
                              {/* ترقيم + تشييك/نسخ/حذف — تاني عمود بعد التحديد */}
                              <td className="border-l border-border px-2 py-2 text-center whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                                  {r.found && (
                                    pttExportedIds.has(r.id) ? (
                                      <span className="inline-flex items-center gap-0.5 text-brand text-[10px]"><Check size={13} /> تم</span>
                                    ) : (
                                      <button
                                        onClick={async () => { await exportPttRowToField(r); setPttExportedIds((s) => new Set(s).add(r.id)); markJudgeExportedIfArmed([r.id]); }}
                                        className="inline-flex items-center gap-0.5 rounded-lg bg-brand/15 px-2 py-1 text-[10px] font-bold text-brand"
                                        title="تصدير للتشييك"
                                      >
                                        <ClipboardCheck size={12} /> تشييك
                                      </button>
                                    )
                                  )}
                                  <button onClick={() => copyPttRow(r)} className="text-muted hover:text-primary transition" title="نسخ">
                                    {pttCopiedId === r.id ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                                  </button>
                                  <button onClick={() => deletePttRow(r.id)} className="text-muted hover:text-danger transition" title="مسح اللوحة">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-ink">
                                {editingPttId === r.id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <input
                                      dir="rtl"
                                      value={editPttValue}
                                      onChange={(e) => setEditPttValue(e.target.value.toUpperCase().split("").map((c) => EN_TO_AR[c] ?? c).join(""))}
                                      onKeyDown={(e) => { if (e.key === "Enter") applyPttEdit(r.id); if (e.key === "Escape") setEditingPttId(null); }}
                                      autoFocus
                                      className="w-24 rounded border border-primary bg-surface-2 px-2 py-1 text-center text-ink outline-none"
                                    />
                                    <button onClick={() => applyPttEdit(r.id)} className="text-brand" title="حفظ"><Check size={14} /></button>
                                    <button onClick={() => setEditingPttId(null)} className="text-muted" title="إلغاء"><X size={14} /></button>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    {r.plate}
                                    <button onClick={() => { setEditingPttId(r.id); setEditPttValue(r.plate); }} className="text-muted hover:text-primary transition" title="تعديل اللوحة">
                                      <Pencil size={12} />
                                    </button>
                                    {r.needsReview && (
                                      <span className="inline-flex items-center gap-0.5 rounded-full bg-alert/15 px-1.5 py-0.5 text-[10px] font-bold text-alert"
                                        title={r.judge && !r.judge.agreed ? "المحرّكان اختلفوا — راجع اللوحة" : "الشكل مكسور — راجع اللوحة وعدّلها"}>
                                        <AlertTriangle size={10} /> راجع
                                      </span>
                                    )}
                                    {/* علامة الرأي التاني — نقطة صغيرة (كهرماني = اختلاف، أخضر =
                                        اتفاق ⇒ ٩٩٫٠٪ صح). للمالك بس؛ الصفوف التانية مافيهاش judge. */}
                                    {judgeVisible && r.judge && (
                                      <button type="button"
                                        onClick={() => setJudgeOpenId((v) => (v === r.id ? null : r.id))}
                                        title={r.judge.agreed ? "المحرّكان اتفقوا — اضغط للتفاصيل" : "المحرّكان اختلفوا — اضغط تشوف المرشّحين"}
                                        className="inline-flex items-center">
                                        <span className={`h-2 w-2 rounded-full ${r.judge.agreed ? "bg-brand" : "bg-amber-500"}`} />
                                      </button>
                                    )}
                                  </span>
                                )}
                                {judgeVisible && r.judge && judgeOpenId === r.id && (
                                  <span className="mt-1 block whitespace-normal rounded-lg border border-border bg-surface-2 px-2 py-1 text-[10px] font-normal leading-4 text-muted" dir="rtl">
                                    <span className="block">موديلنا: <b className="text-ink">{r.judge.oursPlate || "—"}</b>{!r.judge.accepted && ` (مرفوض: ${r.judge.refuseReason ?? "—"})`}</span>
                                    <span className="block">Deepgram: <b className="text-ink">{r.judge.dgPlate || "—"}</b></span>
                                    <span className="block">القرار: {r.judge.fusedPlate || "—"} · {r.judge.reason} · {r.judge.serverMs ?? "?"}ms</span>
                                  </span>
                                )}
                              </td>
                              <td className="border-l border-border px-2 py-2 text-center whitespace-nowrap">
                                {r.found && (r.matchType === "fuzzy" ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-alert"><AlertTriangle size={12} /> مطلوبة؟ {r.similarity}%</span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-brand"><CheckCircle2 size={13} /> مطلوبة</span>
                                ))}
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink"><VehicleTypeSelect value={r.vehicleType ?? ""} onChange={(code) => setPttType(r.id, code)} /></td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{r.row?.["الحي-الشارع"] || "—"}</td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{r.row?.["ملاحظات"] || "—"}</td>
                              {dynCols.map((h) => (
                                <td key={h} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{r.row?.[h] || "—"}</td>
                              ))}
                              <td className="border-l border-border px-3 py-2">
                                {r.mapsLink ? (
                                  <a href={r.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline whitespace-nowrap">
                                    <MapPin size={10} /> خريطة
                                  </a>
                                ) : r.gpsError ? (
                                  <button onClick={() => retryGpsForPttRow(r.id)} className="flex items-center gap-0.5 text-muted text-[10px]" title="إعادة المحاولة">
                                    <MapPin size={10} /> إعادة
                                  </button>
                                ) : (
                                  <span className="text-muted text-[10px] animate-pulse">جاري...</span>
                                )}
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{formatDate(r.checkedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* شريط جماعي — يظهر لما يبقى فيه محدّد */}
                    {pttSel.size > 0 && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                        <span className="text-xs font-bold text-ink">{pttSel.size} محددة</span>
                        <div className="flex gap-2">
                          <button onClick={sharePttSelected} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90"><Share2 size={13} /> واتساب</button>
                          <button onClick={deletePttSelected} className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20"><Trash2 size={13} /> مسح</button>
                        </div>
                      </div>
                    )}

                    {/* تصدير كل لوحات الصوت لشيت التسجيلات — الشيت الموحّد الوحيد */}
                    <button onClick={exportAllPttToField}
                      className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition active:scale-95">
                      <ClipboardCheck size={15} /> تصدير كل اللوحات لشيت التسجيلات
                    </button>

                    {/* مسح النتائج — أحمر، بتأكيد */}
                    <button
                      onClick={() => {
                        if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${pttResults.length} نتيجة؟ مش هترجع تاني.`)) return;
                        setPttResults([]); setPttAlert(null); setPttSel(new Set());
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl border border-danger bg-danger/10 py-2.5 text-sm font-bold text-danger transition active:scale-95 hover:bg-danger/20">
                      <Trash2 size={15} /> مسح النتائج
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── قائمة الكاميرا (اللوحات المتصوّرة) — تظهر في وضع الكاميرا فقط ── */}
          {/* manualHits بتتملّى من saveHitWithGps (مسارات الكاميرا بس)، فماينفعش
              تظهر في اليدوي/الصوتي — كل وضع ليه قائمته. */}
          {mode === "camera" && manualHits.length > 0 && (() => {
            const scale = HIT_ZOOM_LEVELS[hitsZoom];
            const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
            const allSel = hitsSelected.size === manualHits.length;
            const someSel = hitsSelected.size > 0;
            return (
              <div className="flex flex-col gap-2 pt-2 border-t border-border mt-2">
                {/* Stats */}
                <div className="rounded-xl border border-border bg-surface p-2 text-center">
                  <p className="text-lg font-black text-brand">{manualHits.length}</p>
                  <p className="text-[11px] text-muted">إجمالي</p>
                </div>

                {/* «تحديد الكل» على اليمين والزوم على الشمال (بطلب المستخدم) */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
                  <button onClick={toggleHitsAll}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                    {allSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                    {allSel ? "إلغاء الكل" : "تحديد الكل"}
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setHitsZoom((z) => Math.max(z - 1, 0))} disabled={hitsZoom === 0}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 transition">
                      <ZoomOut size={14} />
                    </button>
                    <span className="text-xs text-muted w-10 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setHitsZoom((z) => Math.min(z + 1, HIT_ZOOM_LEVELS.length - 1))} disabled={hitsZoom === HIT_ZOOM_LEVELS.length - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 transition">
                      <ZoomIn size={14} />
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "50vh" }}>
                  <div style={{ fontSize: `${scale * 12}px`, minWidth: "max-content" }}>
                    <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-surface-2 text-muted">
                          <th className="border-b border-l border-border px-2 py-2 font-bold whitespace-nowrap">☐</th>
                          <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                          <th className="border-b border-l border-border px-3 py-2 text-center font-bold whitespace-nowrap">الحالة</th>
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">النوع</th>
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحي-الشارع</th>
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">ملاحظات</th>
                          {dynCols.map((h) => (
                            <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                          ))}
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                          <th className="border-b border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualHits.map((hit, i) => (
                          <tr key={hit.id}
                            title={dupeBg(hit.plate) ? DUPE_TITLE : undefined}
                            className={`border-b border-border transition ${hitsSelected.has(hit.id) ? "bg-primary/15" : dupeBg(hit.plate) || (i % 2 === 0 ? "bg-surface" : "bg-surface-2/40")}`}>
                            <td className="border-l border-border px-2 py-2 text-center">
                              <button onClick={() => toggleHitSelect(hit.id)} className="text-muted hover:text-primary transition">
                                {hitsSelected.has(hit.id) ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                              </button>
                            </td>
                            {/* ترقيم + نسخ/واتساب/حذف — تاني عمود بعد التحديد */}
                            <td className="border-l border-border px-2 py-2">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                                <button onClick={() => copyHit(hit)} title="نسخ" className="text-muted hover:text-primary transition">
                                  {copiedHitId === hit.id ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                                </button>
                                <button onClick={() => shareHitWhatsApp(hit)} title="واتساب" className="text-muted hover:text-primary transition">
                                  <Share2 size={13} />
                                </button>
                                <button onClick={() => deleteHit(hit.id)} title="حذف" className="text-muted hover:text-danger transition">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-brand">
                              {hit.plate}
                            </td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap text-center">
                              {hit.found && (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${hit.matchType === "fuzzy" ? "bg-alert/15 text-alert" : "bg-brand/15 text-brand"}`}>
                                  {hit.matchType === "fuzzy" ? `مطلوبة؟ ${hit.similarity ?? ""}%` : "مطلوبة"}
                                </span>
                              )}
                            </td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink"><VehicleTypeSelect value={hit.row["النوع"] ?? ""} onChange={(code) => setHitType(hit.id, code)} /></td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{hit.row["الحي-الشارع"] || "—"}</td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{hit.row["ملاحظات"] || "—"}</td>
                            {dynCols.map((h) => (
                              <td key={h} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                                {hit.row[h] || "—"}
                              </td>
                            ))}
                            <td className="border-l border-border px-3 py-2">
                              {hit.mapsLink ? (
                                <a href={hit.mapsLink} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-0.5 text-primary underline whitespace-nowrap">
                                  <MapPin size={10} /> خريطة
                                </a>
                              ) : hit.gpsError ? (
                                <button onClick={() => retryGpsForHit(hit.id)}
                                  className="flex items-center gap-0.5 text-muted text-[10px] hover:text-primary transition"
                                  title="اضغط لإعادة المحاولة">
                                  <MapPin size={10} /> إعادة
                                </button>
                              ) : (
                                <span className="text-muted text-[10px] animate-pulse">جاري...</span>
                              )}
                            </td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">
                              {formatDate(hit.checkedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bulk action bar */}
                {someSel && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
                    <span className="text-xs font-bold text-ink">{hitsSelected.size} محددة</span>
                    <div className="flex gap-2">
                      <button onClick={shareSelectedHits}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition">
                        <Share2 size={13} /> واتساب
                      </button>
                      <button onClick={() => { const ids = Array.from(hitsSelected); setManualHits((prev) => prev.filter((h) => !ids.includes(h.id))); setHitsSelected(new Set()); }}
                        className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition">
                        <Trash2 size={13} /> مسح
                      </button>
                    </div>
                  </div>
                )}

                {/* تصدير الكل لشيت التسجيلات — الشيت الموحّد الوحيد */}
                <button onClick={exportAllHitsToField}
                  className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition active:scale-95">
                  <ClipboardCheck size={15} /> تصدير كل اللوحات لشيت التسجيلات
                </button>
              </div>
            );
          })()}
        </>
      )}

      {/* شيت رقم الشاص المنفصل — يظهر في السجلات مستقل عن اللوحات (قابل للتعديل + مشاركة/تصدير) */}
      {mode === "sheet" && chassisRecords.length > 0 && (
        <div className="mb-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center gap-2">
            <Barcode size={16} className="text-brand shrink-0" />
            <span className="text-sm font-bold text-ink">شيت رقم الشاص</span>
            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-bold text-brand">{chassisRecords.length}</span>
          </div>
          <p className="mt-1 text-[11px] text-muted">اضغط على أي خانة (نوع/ملاحظات/منطقة) لتعديلها ✏️ — والتغيير بيتحفظ تلقائياً.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs" dir="rtl">
              <thead>
                <tr className="text-muted">
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">رقم الشاص</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-bold">الحالة</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">نوع السيارة</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">الحي-الشارع</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">ملاحظات</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-bold">GPS</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-bold">التاريخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {chassisRecords.slice(0, 200).map((r) => (
                  <tr key={r.id} title={dupeBgByKey(chassisPlateKeyOf(r)) ? DUPE_TITLE : undefined} className={`border-t border-border ${dupeBgByKey(chassisPlateKeyOf(r)) || (r.found ? "bg-danger/10" : "")}`}>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono" dir="ltr">{r.chassis}</td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-center font-bold ${r.found ? "text-danger" : ""}`}>{r.found ? "مطلوب" : ""}</td>
                    <td className="min-w-[80px] px-2 py-1.5"><VehicleTypeSelect value={r.vehicleType || ""} onChange={(code) => setChassisRecords(updateChassisRecord(r.id, { vehicleType: code }))} /></td>
                    <td className="min-w-[80px] px-2 py-1.5"><EditableCell value={r.region || ""} onSave={(v) => setChassisRecords(updateChassisRecord(r.id, { region: v }))} /></td>
                    <td className="min-w-[80px] px-2 py-1.5"><EditableCell value={r.notes || ""} onSave={(v) => setChassisRecords(updateChassisRecord(r.id, { notes: v }))} /></td>
                    <td className="px-2 py-1.5 text-center">
                      {(r.mapsLink || (r.lat != null && r.lng != null)) ? (
                        <a href={r.mapsLink || toMapsLink(r.lat as number, r.lng as number)} target="_blank" rel="noopener noreferrer" className="inline-flex text-primary" aria-label="الموقع"><MapPin size={15} /></a>
                      ) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-center text-muted">{formatDate(r.checkedAt)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button onClick={() => { if (window.confirm("متأكد إنك عايز تحذف الشاصي ده؟")) setChassisRecords(deleteChassisRecord(r.id)); }} className="text-muted hover:text-danger transition" aria-label="حذف"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* خيارات تحت الشيت: مشاركة واتساب + تصدير Excel */}
          <div className="mt-3 flex gap-2">
            <button onClick={shareChassisWhatsApp} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-night active:scale-95 transition"><Share2 size={14} /> مشاركة واتساب</button>
            <button onClick={exportChassisSheet} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 py-2 text-xs font-bold text-ink active:scale-95 transition"><Download size={14} /> فتح في إكسيل</button>
          </div>
        </div>
      )}

      {/* ── تبويب «السجلات»: شيت التسجيلات (صوتي+يدوي) ── */}
      {/* لسه بنسترجع من السيرفر → مانقولش «مفيش تسجيلات» (المندوب كان بيفتكرها
          ضاعت وهي لسه بتحمّل من حسابه). */}
      {mode === "sheet" && restoringChecks && fieldEntries.length === 0 && chassisRecords.length === 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-8 text-center text-sm font-bold text-primary">
          <span className="animate-pulse">
            جاري استرجاع سجلاتك…
            {restoreProgress && restoreProgress.total > 0 && ` ${restoreProgress.done} من ${restoreProgress.total}`}
          </span>
          <p className="mt-1 text-[11px] font-normal text-muted">سجلاتك محفوظة على حسابك وبترجع على أي جهاز تدخل منه</p>
        </div>
      )}
      {mode === "sheet" && !restoringChecks && fieldEntries.length === 0 && chassisRecords.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          لسه مفيش تسجيلات — صدّر لوحات من التشييك (يدوي/كاميرا/صوت) وهتظهر هنا.
        </div>
      )}
      {mode === "sheet" && fieldEntries.length > 0 && (() => {
        const scale = HIT_ZOOM_LEVELS[fieldZoom];
        // النوع والملاحظات ليهم أعمدة تعديل خاصة فوق — نستبعدهم من الأعمدة العادية
        const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h) && h !== TYPE_KEY && !/ملاح/.test(h)) ?? [];
        // عدادات الفئات (على كل السجلات، مش المفلترة)
        const cVoice = fieldEntries.filter((e) => /صوت/.test(e.method)).length;
        const cManual = fieldEntries.filter((e) => /يدوي/.test(e.method)).length;
        const cWanted = fieldEntries.filter(isDraftMatched).length;
        const matchCat = (e: FieldCheckEntry) =>
          fieldFilter === "voice" ? /صوت/.test(e.method)
          : fieldFilter === "manual" ? /يدوي/.test(e.method)
          : fieldFilter === "wanted" ? isDraftMatched(e)
          : true;
        const visible = filterFieldEntries(fieldEntries, fieldSearch).filter(matchCat);
        const catName = fieldFilter === "voice" ? "المسجّل صوتياً" : fieldFilter === "manual" ? "المسجّل يدوياً" : fieldFilter === "wanted" ? "المطلوب" : "كل السجلات";
        return (
          <div className="flex flex-col gap-2 pt-3 mt-2 border-t-2 border-brand/30">
            <div className="flex items-center gap-1.5 min-w-0">
              <ClipboardCheck size={15} className="text-brand shrink-0" />
              <h2 className="text-sm font-bold text-ink truncate">شيت التسجيلات (صوتي+يدوي)</h2>
              <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-bold text-brand shrink-0">{fieldEntries.length}</span>
              <PlateImagesButton title="شيت التسجيلات"
                build={() => fieldEntryImgRows(sortNear(visible))}
                className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs shrink-0 text-muted hover:text-primary transition" />
              <button onClick={handleNearestIC} disabled={icLocating} title="ترتيب حسب الأقرب لموقعك"
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs shrink-0 transition ${icNearest ? "bg-primary text-night font-bold" : "border border-border bg-surface-2 text-muted hover:text-primary"}`}>
                <Navigation size={13} /> {icLocating ? "..." : "الأقرب"}
              </button>
            </div>
            <p className="text-[11px] text-muted" dir="rtl">
              سجل محفوظ على الجهاز — للتحميل والمشاركة، والتعديل/الحذف من زر «إظهار وتعديل اللوحات»
            </p>

            {/* عدادات قابلة للضغط — الكل / صوتي / يدوي / مطلوب. الضغط يفلتر العرض للفئة. */}
            <div className="flex flex-wrap gap-2" dir="rtl">
              {([
                { key: "all", label: "الكل", n: fieldEntries.length },
                { key: "voice", label: "صوتي", n: cVoice },
                { key: "manual", label: "يدوي", n: cManual },
                { key: "wanted", label: "مطلوب", n: cWanted },
              ] as const).map(({ key, label, n }) => (
                <button key={key} onClick={() => setFieldFilter(key)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${
                    fieldFilter === key ? "border-primary bg-primary text-night" : "border-border bg-surface-2 text-muted hover:text-primary"
                  }`}>
                  {label} <span className={`rounded-full px-1.5 ${fieldFilter === key ? "bg-night/20 text-night" : "bg-border/60 text-ink"}`}>{n}</span>
                </button>
              ))}
            </div>
            {fieldFilter !== "all" && (
              <p className="text-[11px] font-bold text-primary" dir="rtl">عرض: {catName} ({visible.length})</p>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                dir="rtl"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="بحث برقم اللوحة أو الحي..."
                className="w-full rounded-xl border border-border bg-surface-2 py-2 pr-9 pl-8 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
              {fieldSearch && (
                <button onClick={() => setFieldSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </div>
            {fieldSearch.trim() && (
              <p className="text-[11px] text-muted">{visible.length} من {fieldEntries.length}</p>
            )}

            {/* Zoom */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 w-fit">
              <button onClick={() => setFieldZoom((z) => Math.max(z - 1, 0))} disabled={fieldZoom === 0}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 transition">
                <ZoomOut size={14} />
              </button>
              <span className="text-xs text-muted w-10 text-center">{Math.round(scale * 100)}%</span>
              <button onClick={() => setFieldZoom((z) => Math.min(z + 1, HIT_ZOOM_LEVELS.length - 1))} disabled={fieldZoom === HIT_ZOOM_LEVELS.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 transition">
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Table */}
            <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "50vh" }}>
              <div style={{ fontSize: `${scale * 12}px`, minWidth: "max-content" }}>
                <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface-2 text-muted">
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                      {/* النوع والملاحظات بيتعدّلوا من هنا وبيتحفظوا على طول */}
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">النوع</th>
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">ملاحظات</th>
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحي-الشارع</th>
                      {dynCols.map((h) => (
                        <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                      ))}
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحالة</th>
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                      <th className="border-b border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageSlice(sortNear(visible), fieldShown).map((e, i) => {
                      const dup = dupeBg(e.plate);
                      const rowBg = dup || (i % 2 === 0 ? "bg-surface" : "bg-surface-2/40");
                      return (
                      <tr key={e.id} title={dup ? DUPE_TITLE : undefined} className={`border-b border-border ${rowBg}`}>
                        <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-brand">
                          {editingFieldId === e.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                dir="rtl"
                                value={editFieldValue}
                                onChange={(ev) => setEditFieldValue(ev.target.value.toUpperCase().split("").map((c) => EN_TO_AR[c] ?? c).join(""))}
                                onKeyDown={(ev) => { if (ev.key === "Enter") applyFieldEdit(e.id); if (ev.key === "Escape") setEditingFieldId(null); }}
                                autoFocus
                                className="w-24 rounded border border-primary bg-surface-2 px-2 py-1 text-center text-ink outline-none"
                              />
                              <button onClick={() => applyFieldEdit(e.id)} className="text-brand" title="حفظ"><Check size={14} /></button>
                              <button onClick={() => setEditingFieldId(null)} className="text-muted" title="إلغاء"><X size={14} /></button>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {e.plate}
                              <button onClick={() => { setEditingFieldId(e.id); setEditFieldValue(e.plate); }} className="text-muted hover:text-primary transition" title="تعديل اللوحة">
                                <Pencil size={12} />
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                          <VehicleTypeSelect value={entryType(e)} onChange={(code) => void editFieldEntry(e.id, { type: code })} />
                        </td>
                        <td className="border-l border-border px-3 py-2 min-w-[120px] text-ink">
                          <EditableCell value={entryNotes(e)} placeholder="ملاحظة…" onSave={(v) => void editFieldEntry(e.id, { notes: v })} />
                        </td>
                        <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{e.row["الحي-الشارع"] || "—"}</td>
                        {dynCols.map((h) => (
                          <td key={h} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{e.row[h] || "—"}</td>
                        ))}
                        <td className="border-l border-border px-3 py-2 whitespace-nowrap">
                          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand">{e.method}</span>
                        </td>
                        <td className="border-l border-border px-3 py-2">
                          {e.mapsLink ? (
                            <a href={e.mapsLink} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-0.5 text-primary underline whitespace-nowrap">
                              <MapPin size={10} /> خريطة
                            </a>
                          ) : (
                            <span className="text-muted text-[10px] animate-pulse">جاري...</span>
                          )}
                        </td>
                        <td className="border-border px-3 py-2 whitespace-nowrap text-muted">{formatDate(e.checkedAt)}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
                {/* مستشعر آخر الجدول — أول ما يبان بنزوّد دفعة تلقائياً */}
                {hasMore(visible.length, fieldShown) && (
                  <div ref={fieldMoreRef} className="flex flex-col items-center gap-1 py-3">
                    <span className="text-[11px] text-muted">
                      معروض {Math.min(fieldShown, visible.length)} من {visible.length}
                    </span>
                    <button onClick={() => setFieldShown((s) => growShown(visible.length, s))}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-bold text-primary transition hover:bg-surface">
                      عرض المزيد
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* إظهار وتعديل اللوحات — نافذة تعديل/حذف بتأكيد حفظ */}
            <button onClick={openPlatesEditor}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/10">
              <Pencil size={15} /> إظهار وتعديل اللوحات
            </button>

            {/* Export / Share Excel */}
            <div className="flex gap-2">
              <OpenDownloadButton
                build={() => ({ blob: buildExcelBlob(buildFieldRows(), "التشييك الميداني"), name: `التشييك-الميداني-${Date.now()}.xlsx` })}
                label="فتح الشيت"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted hover:text-ink transition disabled:opacity-60"
              />
              <button onClick={shareFieldExcel} disabled={shareBusy !== null}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition disabled:opacity-60">
                <Share2 size={14} /> {shareBusy === "field" ? "جاري التجهيز..." : "مشاركة واتساب"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── نافذة «إظهار وتعديل اللوحات» — تعديل/حذف بتأكيد حفظ ── */}
      {platesEditorOpen && (() => {
        const allCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
        const shownCols = allCols.filter((h) => peCols.has(h));
        // بحث برقم اللوحة — نطبّع الاتنين عشان المطابقة تشتغل مع/بدون فراغات وحروف EN.
        const q = normalizePlate(bankPlateToArabic(peSearch.trim()));
        // البحث **مايخفيش** الباقي: القايمة بتفضل كاملة واللوحة المطابقة بتتعلّم
        // وبيتنطّ عليها — عشان المندوب يشوف اللي قبلها واللي بعدها في السياق.
        const matchIds = new Set(
          q ? draftFieldEntries.filter((e) => normalizePlate(bankPlateToArabic(e.plate)).includes(q)).map((e) => e.id) : []
        );
        const firstMatchIdx = q ? draftFieldEntries.findIndex((e) => matchIds.has(e.id)) : -1;
        const firstMatchId = firstMatchIdx >= 0 ? draftFieldEntries[firstMatchIdx].id : undefined;
        // بنرسم دفعة وبنزوّد مع التمرير — ٦٠٠٠ صف بخانات إدخال مرة واحدة كانت
        // بتقتل الصفحة على الأيفون. البحث والحفظ بيشتغلوا على **الكل** زي ما هما،
        // ولو أول لوحة مطابقة برّه الدفعة بنوسّع لحد ما توصلها عشان النطّ يشتغل.
        const effShown = firstMatchIdx >= 0 ? Math.max(peShown, firstMatchIdx + 1) : peShown;
        const rows = pageSlice(draftFieldEntries, effShown);
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border-t border-border bg-surface sm:rounded-2xl" style={{ direction: "rtl" }}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-bold text-ink">تعديل اللوحات ({draftFieldEntries.length})</h3>
                <button onClick={() => setPlatesEditorOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
              </div>

              {/* بحث برقم اللوحة */}
              <div className="border-b border-border px-3 py-2">
                <div className="relative">
                  <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input dir="rtl" value={peSearch} onChange={(e) => setPeSearch(e.target.value)}
                    placeholder="ابحث برقم اللوحة..."
                    className="w-full rounded-xl border border-border bg-surface-2 py-2 pr-9 pl-8 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
                  {peSearch && (
                    <button onClick={() => setPeSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"><X size={14} /></button>
                  )}
                </div>
                {q && (
                  <p className="mt-1 text-[11px] text-muted">
                    {matchIds.size > 0
                      ? `${matchIds.size} نتيجة — متعلّمة في مكانها وسط باقي اللوحات`
                      : "مفيش لوحة مطابقة"}
                  </p>
                )}
                {/* تحديد الأعمدة المعروضة */}
                {allCols.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {allCols.map((h) => {
                      const on = peCols.has(h);
                      return (
                        <button key={h}
                          onClick={() => setPeCols((prev) => { const n = new Set(prev); n.has(h) ? n.delete(h) : n.add(h); return n; })}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${on ? "border-primary bg-primary/15 text-primary font-bold" : "border-border text-muted"}`}>
                          {on ? "✓ " : ""}{h}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* جدول زي الإكسيل — كل خانة قابلة للتعديل، وكل صف فيه زر حذف */}
              <div className="flex-1 overflow-auto p-2">
                {rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">{q ? "مفيش لوحة بالرقم ده." : "مفيش لوحات في الشيت."}</p>
                ) : (
                  <table className="border-collapse w-full text-xs" style={{ direction: "rtl" }}>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-surface-2 text-muted">
                        <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                        {shownCols.map((h) => (
                          <th key={h} className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                        ))}
                        <th className="border-b border-border px-2 py-2 text-center font-bold whitespace-nowrap">حذف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => {
                        const hit = matchIds.has(e.id);
                        return (
                        <tr key={e.id}
                          ref={e.id === firstMatchId ? peFirstHitRef : undefined}
                          className={`border-b border-border ${hit ? "bg-primary/15" : ""}`}>
                          <td className="border-l border-border p-1 whitespace-nowrap">
                            <input dir="rtl" value={e.plate} onChange={(ev) => peUpdatePlate(e.id, ev.target.value)}
                              className={`w-28 rounded border border-transparent bg-transparent px-2 py-1 text-ink hover:border-border focus:border-primary focus:bg-surface-2 focus:outline-none ${hit ? "font-black text-primary" : "font-bold"}`} />
                          </td>
                          {shownCols.map((h) => (
                            <td key={h} className="border-l border-border p-1 whitespace-nowrap">
                              <input dir="rtl" value={e.row[h] ?? ""} onChange={(ev) => peUpdateField(e.id, h, ev.target.value)}
                                className="w-28 rounded border border-transparent bg-transparent px-2 py-1 text-ink hover:border-border focus:border-primary focus:bg-surface-2 focus:outline-none" />
                            </td>
                          ))}
                          <td className="p-1 text-center">
                            <button onClick={() => peDeleteEntry(e.id)} title="حذف اللوحة"
                              className="rounded-lg border border-danger/40 bg-danger/10 p-1.5 text-danger transition hover:bg-danger/20"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {/* مستشعر آخر القايمة — بيزوّد دفعة تلقائياً مع التمرير */}
                {hasMore(draftFieldEntries.length, effShown) && (
                  <div ref={peMoreRef} className="flex flex-col items-center gap-1 py-3">
                    <span className="text-[11px] text-muted">
                      معروض {Math.min(effShown, draftFieldEntries.length)} من {draftFieldEntries.length}
                    </span>
                    <button onClick={() => setPeShown((s) => growShown(draftFieldEntries.length, Math.max(s, effShown)))}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-1 text-xs font-bold text-primary transition hover:bg-surface">
                      عرض المزيد
                    </button>
                  </div>
                )}
              </div>

              <div className="border-t border-border p-3">
                {platesEditorDirty ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-center text-[11px] text-alert">عملت تعديلات — تحب تحفظها؟</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPlatesEditorOpen(false)}
                        className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted transition active:scale-95">لا، إلغاء</button>
                      <button onClick={savePlatesEditor}
                        className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition active:scale-95">نعم، احفظ التعديلات</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setPlatesEditorOpen(false)}
                    className="w-full rounded-xl border border-border py-2.5 text-sm text-muted">إغلاق</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

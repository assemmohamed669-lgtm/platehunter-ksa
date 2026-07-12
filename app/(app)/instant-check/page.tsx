"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Camera, Images, Type, Mic, ChevronDown, X, CheckCircle2, XCircle, Loader2, Trash2, MapPin, AlertTriangle, Download, Share2, Copy, Check, ZoomIn, ZoomOut, CheckSquare, Square, ClipboardCheck, Search, History, Pencil } from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import { saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord, type FieldCheckEntry, saveFieldCheckEntry, getAllFieldCheckEntries, deleteFieldCheckEntry } from "@/lib/idb";
import { type ExcelTable, buildExcelBlob, openExcelBlob, shareExcelBlob } from "@/lib/excel";
import { detectPlateColumn, normalizePlate, bankPlateToArabic, parsePlateFromTranscript, similarityPercent, EN_TO_AR, mapEgyptianSpeech, extractVehicleType, applyLetterConfusions, recordLetterCorrections, serializeLetterConfusions, deserializeLetterConfusions, applyWordBlend, recordWordBlend, serializeWordBlend, deserializeWordBlend, type LetterConfusionMap, type WordBlendMap } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import { toMapsLink, gpsService } from "@/lib/gps";
import { findDuplicateEntry, filterFieldEntries, plateKey } from "@/lib/fieldCheck";
import { authHeader } from "@/lib/authHeader";
import { pushFieldChecks, restoreFieldChecks } from "@/lib/syncFieldCheck";
import { supabase } from "@/lib/supabaseClient";
import { shareImageWithText, buildPlateShareText } from "@/lib/share";
import { fireWantedAlert } from "@/lib/wantedAlert";
import PlateBadge from "@/components/PlateBadge";

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

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

interface CheckHit {
  id: string;
  plate: string;
  row: Record<string, string>;
  lat?: number;
  lng?: number;
  mapsLink?: string;
  gpsError?: boolean;
  checkedAt: string;
}

type CheckMode = "manual" | "camera" | "ptt" | "sheet";

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
  locationName: string;
  lat?: number;
  lng?: number;
  mapsLink?: string;
  gpsError?: boolean;
  checkedAt: string;
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InstantCheckPage() {
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkColsOpen, setCheckColsOpen] = useState(false);
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
  const [manualLocationName, setManualLocationName] = useState("");
  // Manual working-list (draft) — plates typed here stay local until the
  // delegate presses «تصدير للسجلات», mirroring the voice (PTT) flow.
  const [manualDraft, setManualDraft] = useState<FieldCheckEntry[]>([]);
  const [draftEdit, setDraftEdit] = useState<{ id: string; field: string } | null>(null);
  const [draftEditValue, setDraftEditValue] = useState("");
  const [manualExporting, setManualExporting] = useState(false);

  // Camera
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraResult, setCameraResult] = useState<PlateResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraRawText, setCameraRawText] = useState<string | null>(null);
  const [cameraInputPlate, setCameraInputPlate] = useState("");
  // GPS captured at the moment the photo was taken — reused by export + share
  const [cameraGps, setCameraGps] = useState<{ lat: number; lng: number } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
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
  const [pttResults, setPttResults] = useState<PttRow[]>([]);
  const [pttError, setPttError] = useState<string | null>(null);
  const [pttLocationName, setPttLocationName] = useState("");
  // The most recent MATCHED (wanted) plate — shown as a big prominent alert.
  const [pttAlert, setPttAlert] = useState<PttRow | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);
  // Mirror of pttLocationName so the listening loop reads the latest value
  // (the loop's addPttResult closure would otherwise capture a stale one).
  const pttLocationNameRef = useRef("");

  // Self-learning maps (shared with the registration page). A voice-check edit
  // teaches the same models the recording page uses, and vice versa.
  const letterConfusionsRef = useRef<LetterConfusionMap>(new Map());
  const wordBlendRef = useRef<WordBlendMap>(new Map());
  // Inline plate editing in the voice results table
  const [editingPttId, setEditingPttId] = useState<string | null>(null);
  const [editPttValue, setEditPttValue] = useState("");
  // Rows already pushed to the field-check sheet (shows a "تم" tick)
  const [pttExportedIds, setPttExportedIds] = useState<Set<string>>(new Set());

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

  // Keep a live GPS watch running the whole time the page is open, so stamping
  // a plate reads an already-fresh coordinate instantly (see getCurrentGps).
  useEffect(() => {
    gpsService.startTracking();
    return () => gpsService.stopTracking();
  }, []);

  // Check hits history (session-only)
  const [manualHits, setManualHits] = useState<CheckHit[]>([]);
  const [copiedHitId, setCopiedHitId] = useState<string | null>(null);
  const [hitsZoom, setHitsZoom] = useState(3);
  const [hitsSelected, setHitsSelected] = useState<Set<string>>(new Set());

  // Recordings sheet (شيت التسجيلات) — persisted in IDB, fixed log the agent
  // can only download or share (no delete / no edit).
  const [fieldEntries, setFieldEntries] = useState<FieldCheckEntry[]>([]);
  const [fieldZoom, setFieldZoom] = useState(3);
  const [fieldSearch, setFieldSearch] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldValue, setEditFieldValue] = useState("");

  // Colour index per DUPLICATED plate (plates appearing more than once).
  const fieldColorMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of fieldEntries) { const k = plateKey(e.plate); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
    const map = new Map<string, number>();
    let ci = 0;
    for (const [k, c] of counts) { if (c > 1) { map.set(k, ci % FIELD_DUPE_COLORS.length); ci++; } }
    return map;
  }, [fieldEntries]);

  // Owner of new field-check rows — so a shared device doesn't mix two agents.
  const agentIdRef = useRef<string | null>(null);

  // Load the field-check sheet from IDB on mount (scoped to this agent), then
  // sync with the server: restore what the agent saved elsewhere, push local up.
  useEffect(() => {
    (async () => {
      let uid: string | undefined;
      try { uid = (await supabase.auth.getUser()).data.user?.id; } catch { /* offline */ }
      agentIdRef.current = uid ?? null;
      setFieldEntries(await getAllFieldCheckEntries(uid).catch(() => []));
      if (!uid) return;
      try {
        await restoreFieldChecks(uid);
        pushFieldChecks(uid).catch(() => {});
        setFieldEntries(await getAllFieldCheckEntries(uid));
      } catch { /* offline / no session */ }
    })();
  }, []);

  // Load hits from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ic-hits");
      if (saved) setManualHits(JSON.parse(saved));
    } catch {}
  }, []);

  // Save hits to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem("ic-hits", JSON.stringify(manualHits));
    } catch {}
  }, [manualHits]);

  // Voice (PTT) results + location name persist too, so leaving the page and
  // coming back doesn't wipe what was already checked.
  useEffect(() => {
    try {
      const savedRows = localStorage.getItem("ic-ptt-results");
      if (savedRows) setPttResults(JSON.parse(savedRows));
      const savedLoc = localStorage.getItem("ic-ptt-location");
      if (savedLoc) { setPttLocationName(savedLoc); pttLocationNameRef.current = savedLoc; }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("ic-ptt-results", JSON.stringify(pttResults)); } catch {}
  }, [pttResults]);

  // Manual draft persists across reloads too — an unexported working list.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ic-manual-draft");
      if (saved) setManualDraft(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem("ic-manual-draft", JSON.stringify(manualDraft)); } catch {}
  }, [manualDraft]);

  useEffect(() => {
    try { localStorage.setItem("ic-ptt-location", pttLocationName); } catch {}
  }, [pttLocationName]);

  // Attach live camera stream to video element whenever stream changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveStream) return;
    video.srcObject = liveStream;
    video.play().catch(() => {});
    return () => { liveStream.getTracks().forEach((t) => t.stop()); };
  }, [liveStream]);

  // Load check file from IDB on mount
  useEffect(() => {
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
  }, []);

  // Pass the rows so detection works by CONTENT (robust to unusual column
  // names) — name-only detection would fall back to the first column and
  // silently break matching.
  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers, checkTable.rows) : null;
  const [selectedCheckCols, setSelectedCheckCols] = useState<Set<string>>(new Set());

  const checkIndex = useMemo(() => {
    if (!checkTable || !checkPlateCol) return new Map<string, Record<string, string>>();
    const map = new Map<string, Record<string, string>>();
    for (const row of checkTable.rows) {
      const key = normalizePlate(bankPlateToArabic(String(row[checkPlateCol] ?? "")));
      if (key) map.set(key, row);
    }
    return map;
  }, [checkTable, checkPlateCol]);

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

  function searchInCheck(rawPlate: string): PlateResult | null {
    if (!checkPlateCol || checkIndex.size === 0) return null;
    const normalized = normalizePlate(bankPlateToArabic(rawPlate));
    if (!normalized) return null;

    // O(1) exact lookup
    const exactRow = checkIndex.get(normalized);
    if (exactRow) {
      fireWantedAlert({ plate: rawPlate, matchType: "exact", info: rowToAlertInfo(exactRow) });
      return { plate: rawPlate, normalized, found: true, matchType: "exact", row: exactRow };
    }

    // Fuzzy fallback (88% threshold, first-char optimization)
    if (normalized.length >= 4) {
      let bestSim = 0;
      let bestRow: Record<string, string> | undefined;
      for (const [key, row] of checkIndex) {
        if (key[0] !== normalized[0]) continue;
        const sim = similarityPercent(normalized, key);
        if (sim > bestSim) { bestSim = sim; bestRow = row; }
      }
      if (bestSim >= 88 && bestRow) {
        fireWantedAlert({ plate: rawPlate, matchType: "fuzzy", similarity: Math.round(bestSim), info: rowToAlertInfo(bestRow) });
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
    const hitId = String(Date.now());
    const hit: CheckHit = { id: hitId, plate: result.plate, row: result.row ?? {}, checkedAt: new Date().toISOString() };
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

  // Fetch GPS for a hit and stamp it (or mark gpsError on failure)
  async function fetchGpsForHit(hitId: string) {
    const gps = await getCurrentGps();
    if (gps) {
      setManualHits((prev) => prev.map((h) => h.id === hitId ? { ...h, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng) } : h));
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
      setPttResults((prev) => prev.map((r) => r.id === id ? { ...r, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng) } : r));
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
    const result = searchInCheck(raw); // beeps + returns match (or {found:false})
    setManualResult(result);

    const row: Record<string, string> = {};
    if (manualLocationName.trim()) row["اسم الموقع"] = manualLocationName.trim();
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
      const withGps: FieldCheckEntry = { ...base, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng) };
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

  function shareDraftRow(e: FieldCheckEntry) {
    const lines = [`🚗 اللوحة: ${e.plate}`];
    for (const [k, v] of Object.entries(e.row)) {
      if (String(v).trim()) lines.push(`${k}: ${v}`);
    }
    if (e.mapsLink) lines.push(`📍 الموقع: ${e.mapsLink}`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
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
    window.open(`https://wa.me/?text=${encodeURIComponent(formatHitText(hit))}`, "_blank");
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
    window.open(`https://wa.me/?text=${encodeURIComponent(`*لوحات مطلوبة (${hits.length})*\n\n${text}`)}`, "_blank");
  }

  function buildHitsRows() {
    return manualHits.map((hit) => {
      const obj: Record<string, unknown> = { "رقم اللوحة": hit.plate };
      for (const [k, v] of Object.entries(hit.row)) {
        if (k !== checkPlateCol) obj[k] = v;
      }
      obj["GPS"] = hit.mapsLink ?? "";
      obj["التاريخ"] = formatDate(hit.checkedAt);
      return obj;
    });
  }

  async function exportHitsExcel() {
    const blob = buildExcelBlob(buildHitsRows(), "لوحات مطلوبة");
    try {
      await openExcelBlob(blob, `لوحات-مطلوبة-${Date.now()}.xlsx`);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    }
  }

  async function shareHitsExcel() {
    const blob = buildExcelBlob(buildHitsRows(), "لوحات مطلوبة");
    try {
      await shareExcelBlob(blob, "لوحات-مطلوبة.xlsx", "لوحات مطلوبة");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت المشاركة");
    }
  }

  // ── Field-check sheet (protected) ───────────────────────────────────────────
  const methodLabel: Record<CheckMode, string> = {
    camera: "متشيكة بالكاميرا",
    ptt: "متشيكة بالصوت",
    manual: "متشيكة يدوي",
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
      const withGps: FieldCheckEntry = { ...base, lat: gps.lat, lng: gps.lng, mapsLink: toMapsLink(gps.lat, gps.lng) };
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

    const origLetters = normalizePlate(bankPlateToArabic(entry.plate)).replace(/[0-9]/g, "");
    const corrLetters = normalizePlate(bankPlateToArabic(trimmed)).replace(/[0-9]/g, "");
    if (origLetters && corrLetters && origLetters.length !== corrLetters.length) {
      recordWordBlend(wordBlendRef.current, origLetters, corrLetters);
      try { localStorage.setItem(LS_WORD_BLENDS, JSON.stringify(serializeWordBlend(wordBlendRef.current))); } catch { /* full */ }
    } else if (origLetters && corrLetters) {
      recordLetterCorrections(letterConfusionsRef.current, entry.plate, trimmed);
      try { localStorage.setItem(LS_LETTER_CONFUSIONS, JSON.stringify(serializeLetterConfusions(letterConfusionsRef.current))); } catch { /* full */ }
    }

    const updated: FieldCheckEntry = { ...entry, plate: trimmed };
    setFieldEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    await saveFieldCheckEntry(updated);
  }

  function buildFieldRows() {
    const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
    return fieldEntries.map((e) => {
      const obj: Record<string, unknown> = { "رقم اللوحة": e.plate };
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

  async function shareFieldExcel() {
    const blob = buildExcelBlob(buildFieldRows(), "التشييك الميداني");
    try {
      await shareExcelBlob(blob, "التشييك-الميداني.xlsx", "التشييك الميداني");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت المشاركة");
    }
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

  // Open live camera viewfinder; fall back to file input if getUserMedia unavailable
  async function openLiveCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setLiveStream(stream); // useEffect handles attaching to <video>
    } catch {
      cameraInputRef.current?.click();
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

  // Run OCR on a dataUrl
  async function runOCR(dataUrl: string) {
    setCameraImage(dataUrl);
    setCameraLoading(true);
    setCameraError(null);
    setCameraResult(null);
    setCameraRawText(null);
    setCameraGps(null);
    try {
      const resized = await resizeImageForOCR(dataUrl);
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
        if (result?.found) {
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
      // تصفير قيمة الخانتين عشان اختيار نفس الصورة تاني (بعد المسح) يشتغل.
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  function resetCamera() {
    closeLiveCamera();
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    setCameraImage(null);
    setCameraResult(null);
    setCameraError(null);
    setCameraRawText(null);
    setCameraInputPlate("");
    setCameraGps(null);
  }

  // ── PTT ───────────────────────────────────────────────────────────────────
  // addResult: parse one utterance and append to results list
  function addPttResult(utterance: string) {
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

    // Apply what past edits taught: whole-fragment blend first, then per-letter
    // confusion — so a mishearing corrected once auto-corrects next time.
    const norm = normalizePlate(bankPlateToArabic(rawPlate));
    const letters = norm.replace(/[0-9]/g, "");
    const digits = norm.replace(/[^0-9]/g, "");
    const blended = applyWordBlend(letters, wordBlendRef.current) || letters;
    const corrected = applyLetterConfusions(blended + digits, letterConfusionsRef.current);

    const result = searchInCheck(corrected);
    if (!result) return; // no check file loaded

    // Every spoken plate becomes a compact row (found or not), tagged with the
    // current location name; `originalPlate` keeps the pre-correction value so
    // a later edit can teach the learners. GPS is captured in the background.
    const id = `${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}`;
    const row: PttRow = {
      id,
      plate: result.plate,
      originalPlate: norm,
      found: result.found,
      matchType: result.matchType,
      similarity: result.similarity,
      row: result.row,
      vehicleType,
      locationName: pttLocationNameRef.current.trim(),
      checkedAt: new Date().toISOString(),
    };
    setPttResults((prev) => [row, ...prev]);
    // A matched (wanted) plate — exact OR suspected — pops the big alert.
    if (result.found) setPttAlert(row);
    void fetchGpsForPttRow(id);
  }

  // Save a manual edit of a voice row: teach the learners (same logic as the
  // registration page), then re-check the corrected plate against the file.
  function applyPttEdit(rowId: string) {
    const row = pttResults.find((r) => r.id === rowId);
    const trimmed = editPttValue.trim();
    setEditingPttId(null);
    if (!row || !trimmed || trimmed === row.plate) return;

    const origLetters = normalizePlate(bankPlateToArabic(row.originalPlate)).replace(/[0-9]/g, "");
    const corrLetters = normalizePlate(bankPlateToArabic(trimmed)).replace(/[0-9]/g, "");

    if (origLetters && corrLetters && origLetters.length !== corrLetters.length) {
      // Whole letter group was wrong (length changed) → learn the fragment.
      recordWordBlend(wordBlendRef.current, origLetters, corrLetters);
      try { localStorage.setItem(LS_WORD_BLENDS, JSON.stringify(serializeWordBlend(wordBlendRef.current))); } catch { /* full */ }
    } else if (origLetters && corrLetters) {
      // One/few letters drifted → per-letter confusion learner.
      recordLetterCorrections(letterConfusionsRef.current, row.originalPlate, trimmed);
      try { localStorage.setItem(LS_LETTER_CONFUSIONS, JSON.stringify(serializeLetterConfusions(letterConfusionsRef.current))); } catch { /* full */ }
    }

    const res = searchInCheck(trimmed);
    setPttResults((prev) => prev.map((r) => r.id === rowId
      ? { ...r, plate: res?.plate ?? trimmed, found: res?.found ?? false, matchType: res?.matchType, similarity: res?.similarity, row: res?.row }
      : r));
  }

  // ── Voice-list Excel export ─────────────────────────────────────────────
  function buildPttRows() {
    const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
    return pttResults.map((r) => {
      const obj: Record<string, unknown> = {
        "الحالة": r.found ? (r.matchType === "fuzzy" ? `مطلوبة؟ ${r.similarity}%` : "مطلوبة") : "غير مطلوبة",
        "رقم اللوحة": r.plate,
        "النوع": r.vehicleType ?? "",
      };
      for (const h of dynCols) obj[h] = r.row?.[h] ?? "";
      obj["اسم الموقع"] = r.locationName;
      obj["GPS"] = r.mapsLink ?? "";
      obj["التاريخ"] = formatDate(r.checkedAt);
      return obj;
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

  // Remove a single voice row.
  function deletePttRow(id: string) {
    setPttResults((prev) => prev.filter((r) => r.id !== id));
    setPttExportedIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setPttAlert((a) => (a?.id === id ? null : a));
  }

  // Append ALL voice rows to the field-check sheet, below whatever is already
  // there. Duplicates are kept (a repeated plate = a new row).
  async function exportAllPttToField() {
    if (pttResults.length === 0) return;
    const stamp = Date.now();
    const toSave: FieldCheckEntry[] = pttResults.map((r, i) => {
      const mergedRow: Record<string, string> = { ...(r.row ?? {}) };
      if (r.vehicleType) mergedRow["النوع"] = r.vehicleType;
      if (r.locationName) mergedRow["اسم الموقع"] = r.locationName;
      mergedRow["الحالة"] = r.found ? (r.matchType === "fuzzy" ? `مطلوبة؟ ${r.similarity}%` : "مطلوبة") : "غير مطلوبة";
      return {
        id: `${stamp}-${i}`,
        agentId: agentIdRef.current ?? undefined,
        plate: r.plate,
        row: mergedRow,
        method: "متشيكة بالصوت",
        lat: r.lat,
        lng: r.lng,
        mapsLink: r.mapsLink,
        checkedAt: new Date().toISOString(),
      };
    });
    for (const e of toSave) await saveFieldCheckEntry(e);
    setFieldEntries(await getAllFieldCheckEntries(agentIdRef.current ?? undefined));
    setPttExportedIds(new Set(pttResults.map((r) => r.id)));
  }

  async function exportPttExcel() {
    try {
      await openExcelBlob(buildExcelBlob(buildPttRows(), "تشييك صوتي"), `تشييك-صوتي-${Date.now()}.xlsx`);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    }
  }

  async function sharePttExcel() {
    try {
      await shareExcelBlob(buildExcelBlob(buildPttRows(), "تشييك صوتي"), "تشييك-صوتي.xlsx", "تشييك صوتي");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت المشاركة");
    }
  }

  async function startPtt() {
    setPttError(null);
    setPttLiveText("");
    isListeningRef.current = true;
    setPttListening(true);

    // Native (Capacitor)
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { SpeechRecognition } = (await import("@capacitor-community/speech-recognition")) as any;
        await SpeechRecognition.requestPermissions();
        // Continuous listening = a loop of one-shot recognitions. Android's
        // SpeechRecognizer needs a beat to reset between sessions; starting
        // again too fast throws ERROR_RECOGNIZER_BUSY. That transient error
        // must NOT end the whole session (the old code broke on any error, so
        // it stopped after the first plate) — back off briefly and keep going.
        let consecutiveErrors = 0;
        while (isListeningRef.current) {
          try {
            const result = await SpeechRecognition.start({
              language: "ar-SA",
              maxResults: 1,
              partialResults: false,
              popup: false,
            });
            consecutiveErrors = 0;
            const text: string = result?.matches?.[0] ?? "";
            if (text) {
              setPttLiveText(text);
              addPttResult(text);
            }
            // Let the recognizer fully reset before the next plate.
            await new Promise((r) => setTimeout(r, 250));
          } catch {
            // User pressed stop mid-session → exit cleanly.
            if (!isListeningRef.current) break;
            // Transient error between plates (busy / no-speech) → retry, don't quit.
            consecutiveErrors++;
            if (consecutiveErrors >= 6) {
              setPttError("توقف الاستماع — اضغط «ابدأ» من جديد");
              break;
            }
            await new Promise((r) => setTimeout(r, 350));
          }
        }
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
      return;
    }

    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
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
    setPttListening(false);
    setPttLiveText("");

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
          {/* Tabs */}
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {(
              [
                { key: "manual", Icon: Type, label: "يدوي" },
                { key: "camera", Icon: Camera, label: "كاميرا" },
                { key: "ptt", Icon: Mic, label: "صوت" },
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
              {/* اسم الموقع (يتسجّل على كل لوحة تدخلها) */}
              <div className="relative">
                <MapPin size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                <input dir="rtl" value={manualLocationName} onChange={(e) => setManualLocationName(e.target.value)}
                  placeholder="اسم الموقع اللي بتشيّك فيه (اختياري)"
                  className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
              </div>

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
                return (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border">
                    <span className="text-xs text-muted">{manualDraft.length} لوحة في القائمة</span>
                    <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "45vh" }}>
                      <table className="border-collapse w-full" style={{ direction: "rtl", fontSize: "12px" }}>
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-surface-2 text-muted">
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">النوع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">اسم الموقع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">ملاحظات</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                            <th className="border-b border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {manualDraft.map((e, i) => (
                            <tr key={e.id} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-surface-2/40"}`}>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-brand">{draftCell(e, "plate")}</td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{draftCell(e, "النوع")}</td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{draftCell(e, "اسم الموقع")}</td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{draftCell(e, "ملاحظات")}</td>
                              <td className="border-l border-border px-3 py-2">
                                {e.mapsLink ? (
                                  <a href={e.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline whitespace-nowrap"><MapPin size={10} /> خريطة</a>
                                ) : <span className="text-muted text-[10px] animate-pulse">جاري...</span>}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => shareDraftRow(e)} className="text-muted hover:text-primary transition" title="مشاركة واتساب"><Share2 size={13} /></button>
                                  <button onClick={() => deleteDraftEntry(e.id)} className="text-muted hover:text-danger transition" title="حذف"><Trash2 size={13} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={exportManualDraft}
                      disabled={manualExporting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition disabled:opacity-40 active:scale-95"
                    >
                      <Download size={16} /> {manualExporting ? "جاري التصدير..." : `تصدير ${manualDraft.length} لوحة للسجلات`}
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
                    onClick={() => { const v = cameraInputPlate.trim(); if (!v) return; setCameraError(null); const result = searchInCheck(v); setCameraResult(result); if (result?.found) { saveHitWithGps(result); void getCurrentGps().then(setCameraGps); } }}
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

              {cameraResult && <ResultCard result={cameraResult} plateCol={checkPlateCol} selectedCols={selectedCheckCols} onExport={(r) => exportToFieldCheck(r, "camera", cameraGps)} onShare={shareCameraResult} priorCheck={cameraResult.found ? findDuplicateEntry(fieldEntries, cameraResult.plate) : undefined} />}
            </div>
          )}

          {/* ── PTT ── */}
          {mode === "ptt" && (
            <div className="flex flex-col items-center gap-4">
              {/* اسم الموقع — يتسجّل على كل لوحة تتقال بعد كتابته */}
              <div className="w-full">
                <label className="mb-1 block text-[11px] text-muted">اسم الموقع اللي بتشيّك فيه</label>
                <div className="relative">
                  <MapPin size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    dir="rtl"
                    value={pttLocationName}
                    onChange={(e) => { setPttLocationName(e.target.value); pttLocationNameRef.current = e.target.value; }}
                    placeholder="مثال: حي النرجس - شارع 15"
                    className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Big mic button */}
              <button
                onClick={pttListening ? stopPtt : startPtt}
                className={`flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-full border-4 transition active:scale-95 ${
                  pttListening
                    ? "border-brand bg-brand/20 text-brand animate-pulse"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                <Mic size={28} />
                <span className="text-xs font-bold">
                  {pttListening ? "إيقاف" : "ابدأ"}
                </span>
              </button>

              {pttListening && (
                <p className="text-center text-xs text-muted">
                  {pttLiveText ? `"${pttLiveText}"` : "جاري الاستماع..."}
                </p>
              )}

              {pttError && (
                <p className="text-center text-xs text-danger">{pttError}</p>
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
                    onExport={(r) => exportToFieldCheck(r, "ptt")}
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
                      <span className="text-xs text-muted">{pttResults.length} لوحة</span>
                      <button
                        onClick={() => { setPttResults([]); setPttAlert(null); }}
                        className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted"
                      >
                        <Trash2 size={12} /> مسح
                      </button>
                    </div>
                    <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
                      <table className="border-collapse w-full" style={{ direction: "rtl", fontSize: "12px" }}>
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-surface-2 text-muted">
                            <th className="border-b border-l border-border px-2 py-2 font-bold whitespace-nowrap">الحالة</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">النوع</th>
                            {dynCols.map((h) => (
                              <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                            ))}
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">اسم الموقع</th>
                            <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                            <th className="border-b border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pttResults.map((r) => (
                            <tr key={r.id} className={`border-b border-border ${r.found ? (r.matchType === "fuzzy" ? "bg-alert/10" : "bg-brand/10") : "bg-surface"}`}>
                              <td className="border-l border-border px-2 py-2 text-center whitespace-nowrap">
                                {!r.found ? (
                                  <span className="inline-flex items-center gap-0.5 text-muted"><XCircle size={13} /> غير مطلوبة</span>
                                ) : r.matchType === "fuzzy" ? (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-alert"><AlertTriangle size={12} /> مطلوبة؟ {r.similarity}%</span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 font-bold text-brand"><CheckCircle2 size={13} /> مطلوبة</span>
                                )}
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
                                  </span>
                                )}
                              </td>
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{r.vehicleType || "—"}</td>
                              {dynCols.map((h) => (
                                <td key={h} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{r.row?.[h] || "—"}</td>
                              ))}
                              <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">{r.locationName || "—"}</td>
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
                              <td className="px-2 py-2 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-2">
                                  {r.found && (
                                    pttExportedIds.has(r.id) ? (
                                      <span className="inline-flex items-center gap-0.5 text-brand text-[10px]"><Check size={13} /> تم</span>
                                    ) : (
                                      <button
                                        onClick={async () => { await exportPttRowToField(r); setPttExportedIds((s) => new Set(s).add(r.id)); }}
                                        className="inline-flex items-center gap-0.5 rounded-lg bg-brand/15 px-2 py-1 text-[10px] font-bold text-brand"
                                        title="تصدير للتشييك"
                                      >
                                        <ClipboardCheck size={12} /> تشييك
                                      </button>
                                    )
                                  )}
                                  <button onClick={() => deletePttRow(r.id)} className="text-muted hover:text-danger transition" title="مسح اللوحة">
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* تصدير كل لوحات الصوت لشيت التسجيلات */}
                    <button onClick={exportAllPttToField}
                      className="flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition active:scale-95">
                      <ClipboardCheck size={15} /> تصدير كل اللوحات لشيت التسجيلات
                    </button>

                    {/* فتح / مشاركة Excel */}
                    <div className="flex gap-2">
                      <button onClick={exportPttExcel}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted hover:text-ink transition">
                        <Download size={14} /> فتح في Excel
                      </button>
                      <button onClick={sharePttExcel}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition">
                        <Share2 size={14} /> مشاركة Excel
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Hits history table — hidden on the السجلات tab ── */}
          {mode !== "sheet" && manualHits.length > 0 && (() => {
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

                {/* Zoom + select all */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
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
                  <button onClick={toggleHitsAll}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                    {allSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                    {allSel ? "إلغاء الكل" : "تحديد الكل"}
                  </button>
                </div>

                {/* Table */}
                <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "50vh" }}>
                  <div style={{ fontSize: `${scale * 12}px`, minWidth: "max-content" }}>
                    <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-surface-2 text-muted">
                          <th className="border-b border-l border-border px-2 py-2 font-bold whitespace-nowrap">☐</th>
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                          {dynCols.map((h) => (
                            <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                          ))}
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                          <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                          <th className="border-b border-border px-2 py-2 text-right font-bold whitespace-nowrap">⋮</th>
                        </tr>
                      </thead>
                      <tbody>
                        {manualHits.map((hit, i) => (
                          <tr key={hit.id}
                            className={`border-b border-border transition ${hitsSelected.has(hit.id) ? "bg-primary/15" : i % 2 === 0 ? "bg-surface" : "bg-surface-2/40"}`}>
                            <td className="border-l border-border px-2 py-2 text-center">
                              <button onClick={() => toggleHitSelect(hit.id)} className="text-muted hover:text-primary transition">
                                {hitsSelected.has(hit.id) ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                              </button>
                            </td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-brand">
                              {hit.plate}
                            </td>
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
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2">
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

                {/* Export / Share Excel */}
                <div className="flex gap-2">
                  <button onClick={exportHitsExcel}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted hover:text-ink transition">
                    <Download size={14} /> فتح في Excel
                  </button>
                  <button onClick={shareHitsExcel}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition">
                    <Share2 size={14} /> مشاركة Excel
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── تبويب «السجلات»: شيت التسجيلات (صوتي+يدوي) ── */}
      {mode === "sheet" && fieldEntries.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          لسه مفيش تسجيلات — صدّر لوحات من التشييك (يدوي/كاميرا/صوت) وهتظهر هنا.
        </div>
      )}
      {mode === "sheet" && fieldEntries.length > 0 && (() => {
        const scale = HIT_ZOOM_LEVELS[fieldZoom];
        const dynCols = checkTable?.headers.filter((h) => h !== checkPlateCol && selectedCheckCols.has(h)) ?? [];
        const visible = filterFieldEntries(fieldEntries, fieldSearch);
        return (
          <div className="flex flex-col gap-2 pt-3 mt-2 border-t-2 border-brand/30">
            <div className="flex items-center gap-1.5 min-w-0">
              <ClipboardCheck size={15} className="text-brand shrink-0" />
              <h2 className="text-sm font-bold text-ink truncate">شيت التسجيلات (صوتي+يدوي)</h2>
              <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-bold text-brand shrink-0">{fieldEntries.length}</span>
            </div>
            <p className="text-[11px] text-muted" dir="rtl">
              سجل ثابت محفوظ على الجهاز — للتحميل أو المشاركة فقط (لا يُحذف ولا يُعدّل)
            </p>

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
                      {dynCols.map((h) => (
                        <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                      ))}
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحالة</th>
                      <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                      <th className="border-b border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((e, i) => {
                      const cIdx = fieldColorMap.get(plateKey(e.plate));
                      const rowBg = cIdx !== undefined ? FIELD_DUPE_COLORS[cIdx] : (i % 2 === 0 ? "bg-surface" : "bg-surface-2/40");
                      return (
                      <tr key={e.id} className={`border-b border-border ${rowBg}`}>
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
              </div>
            </div>

            {/* Export / Share Excel */}
            <div className="flex gap-2">
              <button onClick={exportFieldExcel}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted hover:text-ink transition">
                <Download size={14} /> فتح في Excel
              </button>
              <button onClick={shareFieldExcel}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-night transition">
                <Share2 size={14} /> مشاركة واتساب
              </button>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

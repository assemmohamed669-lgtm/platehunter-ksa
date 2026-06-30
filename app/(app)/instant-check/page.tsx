"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Camera, Type, Mic, ChevronDown, X, CheckCircle2, XCircle, Loader2, Trash2, MapPin, AlertTriangle, Download, Share2, Copy, Check, ZoomIn, ZoomOut, CheckSquare, Square } from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import { saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord } from "@/lib/idb";
import { type ExcelTable, buildExcelBlob, openExcelBlob, shareExcelBlob } from "@/lib/excel";
import { detectPlateColumn, normalizePlate, bankPlateToArabic, parsePlateFromTranscript, similarityPercent, EN_TO_AR, mapEgyptianSpeech } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import { toMapsLink } from "@/lib/gps";
import PlateBadge from "@/components/PlateBadge";

const INVALID_AR_LETTERS_SET = new Set(["ت","ث","ج","خ","ذ","ز","ش","ض","ظ","غ","ف"]);
const HIT_ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];

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
  checkedAt: string;
}

type CheckMode = "manual" | "camera" | "ptt";

interface PlateResult {
  plate: string;
  normalized: string;
  found: boolean;
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  row?: Record<string, string>;
}

function playMatchAlert() {
  try {
    const ctx = new AudioContext();
    [0, 0.18, 0.36].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = "sine";
      gain.gain.setValueAtTime(0.5, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  } catch { /* audio unavailable */ }
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
function ResultCard({ result, plateCol, selectedCols }: { result: PlateResult; plateCol: string | null; selectedCols?: Set<string> }) {
  if (!result.found) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 flex items-center gap-3">
        <XCircle size={20} className="text-danger shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{result.plate}</p>
          <p className="text-xs text-danger">غير موجود في ملف التشييك</p>
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
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function InstantCheckPage() {
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkColsOpen, setCheckColsOpen] = useState(false);
  const [mode, setMode] = useState<CheckMode>("manual");

  // Manual
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<PlateResult | null>(null);

  // Camera
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraResult, setCameraResult] = useState<PlateResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // PTT
  const [pttListening, setPttListening] = useState(false);
  const [pttLiveText, setPttLiveText] = useState("");
  const [pttResults, setPttResults] = useState<PlateResult[]>([]);
  const [pttError, setPttError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);

  // Check hits history (session-only)
  const [manualHits, setManualHits] = useState<CheckHit[]>([]);
  const [copiedHitId, setCopiedHitId] = useState<string | null>(null);
  const [hitsZoom, setHitsZoom] = useState(3);
  const [hitsSelected, setHitsSelected] = useState<Set<string>>(new Set());

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

  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers) : null;
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

  function searchInCheck(rawPlate: string): PlateResult | null {
    if (!checkPlateCol || checkIndex.size === 0) return null;
    const normalized = normalizePlate(bankPlateToArabic(rawPlate));
    if (!normalized) return null;

    // O(1) exact lookup
    const exactRow = checkIndex.get(normalized);
    if (exactRow) {
      playMatchAlert();
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
        playMatchAlert();
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

  function handleManualSearch() {
    const raw = manualInput.trim();
    if (!raw || manualError) return;
    const result = searchInCheck(raw);
    setManualResult(result);
    if (result?.found) {
      const hitId = String(Date.now());
      const hit: CheckHit = { id: hitId, plate: result.plate, row: result.row ?? {}, checkedAt: new Date().toISOString() };
      setManualHits((prev) => [hit, ...prev]);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setManualHits((prev) => prev.map((h) => h.id === hitId ? { ...h, lat, lng, mapsLink: toMapsLink(lat, lng) } : h));
          },
          () => {},
          { timeout: 6000, maximumAge: 30000 }
        );
      }
    }
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
    await openExcelBlob(blob, `لوحات-مطلوبة-${Date.now()}.xlsx`);
  }

  async function shareHitsExcel() {
    const blob = buildExcelBlob(buildHitsRows(), "لوحات مطلوبة");
    await shareExcelBlob(blob, "لوحات-مطلوبة.xlsx", "لوحات مطلوبة");
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

  function handleCameraCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setCameraResult(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setCameraImage(dataUrl);
      setCameraLoading(true);
      try {
        const resized = await resizeImageForOCR(dataUrl);
        const base64 = resized.split(",")[1];
        const res = await fetch("/api/read-plate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType: "image/jpeg" }),
        });
        const json = await res.json().catch(() => ({ plate: null, error: `http_${res.status}` }));
        if (!res.ok) {
          const reason = json?.error ?? "";
          const detail = json?.detail ? String(json.detail) : "";
          if (reason === "missing_api_key") throw new Error("api_key");
          if (reason === "invalid_model") throw new Error("model");
          throw new Error(`http_${res.status}:${detail}`);
        }
        if (json.plate) {
          setCameraResult(searchInCheck(json.plate));
        } else {
          setCameraError("لم يُتعرَّف على لوحة في الصورة — جرّب زاوية أوضح");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "api_key") {
          setCameraError("ANTHROPIC_API_KEY غير مضبوط على Vercel");
        } else if (msg === "model") {
          setCameraError("خطأ في إعدادات الخادم");
        } else if (msg.includes("413") || msg.includes("414")) {
          setCameraError("الصورة كبيرة جداً — جرّب مرة أخرى");
        } else {
          setCameraError(`خطأ: ${msg || "server_error"}`);
        }
      } finally {
        setCameraLoading(false);
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  }

  function resetCamera() {
    setCameraImage(null);
    setCameraResult(null);
    setCameraError(null);
  }

  // ── PTT ───────────────────────────────────────────────────────────────────
  // addResult: parse one utterance and append to results list
  function addPttResult(utterance: string) {
    // أول محاولة: ترجمة حرف حرف بالنطق المصري ("دال حه ره واحد اتنين...")
    const egyptianMapped = mapEgyptianSpeech(utterance);
    const egyptianNorm   = normalizePlate(bankPlateToArabic(egyptianMapped));
    const letterPart     = egyptianNorm.replace(/[0-9]/g, "");
    const hasDigits      = /[0-9]/.test(egyptianNorm);
    // لوحة سعودية صحيحة: 1-3 حروف + أرقام — لو أكثر من 3 حروف يعني كلمات ما اتحولتش
    const isPlausiblePlate = hasDigits && letterPart.length >= 1 && letterPart.length <= 3;

    const plate = isPlausiblePlate
      ? egyptianMapped
      : (parsePlateFromTranscript(utterance).plate || "");

    if (!plate) return;
    const result = searchInCheck(plate);
    if (result) {
      setPttResults((prev) => [result, ...prev]);
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
        while (isListeningRef.current) {
          try {
            const result = await SpeechRecognition.start({
              language: "ar-SA",
              maxResults: 1,
              partialResults: false,
              popup: false,
            });
            const text: string = result?.matches?.[0] ?? "";
            if (text) {
              setPttLiveText(text);
              addPttResult(text);
            }
          } catch {
            break;
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
        try { recognition.start(); } catch {}
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
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {(
              [
                { key: "manual", Icon: Type, label: "يدوي" },
                { key: "camera", Icon: Camera, label: "كاميرا" },
                { key: "ptt", Icon: Mic, label: "صوت" },
              ] as const
            ).map(({ key, Icon, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold transition ${
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
                  بحث
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
                يدعم الحروف العربية والإنجليزية (A→ا، B→ب، G→ق، ...)
              </p>

              {manualResult && (
                <ResultCard result={manualResult} plateCol={checkPlateCol} selectedCols={selectedCheckCols} />
              )}

              {/* ── Hits history table ── */}
              {manualHits.length > 0 && (() => {
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
                                  ) : (
                                    <span className="text-muted text-[10px]">جاري...</span>
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
            </div>
          )}

          {/* ── Camera ── */}
          {mode === "camera" && (
            <div className="flex flex-col gap-3">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />

              {!cameraImage ? (
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={cameraLoading}
                  className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted transition active:scale-95"
                >
                  <Camera size={28} />
                  <span className="text-sm">التقط صورة اللوحة</span>
                </button>
              ) : (
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
                    <button
                      onClick={resetCamera}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5"
                    >
                      <X size={14} className="text-white" />
                    </button>
                  )}
                </div>
              )}

              {!cameraLoading && cameraImage && (
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-xl border border-border bg-surface-2 py-2.5 text-sm text-muted"
                >
                  التقط صورة أخرى
                </button>
              )}

              {cameraError && (
                <p className="text-center text-xs text-danger">{cameraError}</p>
              )}
              {cameraResult && (
                <ResultCard result={cameraResult} plateCol={checkPlateCol} selectedCols={selectedCheckCols} />
              )}
            </div>
          )}

          {/* ── PTT ── */}
          {mode === "ptt" && (
            <div className="flex flex-col items-center gap-4">
              {/* Big mic button */}
              <button
                onClick={pttListening ? stopPtt : startPtt}
                className={`flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-full border-4 transition active:scale-95 ${
                  pttListening
                    ? "border-brand bg-brand/20 text-brand animate-pulse"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                <Mic size={32} />
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

              {pttResults.length > 0 && (
                <div className="w-full flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                      {pttResults.length} نتيجة
                    </span>
                    <button
                      onClick={() => setPttResults([])}
                      className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted"
                    >
                      <Trash2 size={12} />
                      مسح
                    </button>
                  </div>
                  {pttResults.map((r, i) => (
                    <ResultCard key={i} result={r} plateCol={checkPlateCol} selectedCols={selectedCheckCols} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

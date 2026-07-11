"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import {
  Mic,
  MicOff,
  MapPin,
  Wifi,
  WifiOff,
  Download,
  RefreshCw,
  AlertCircle,
  X,
  AlertTriangle,
  Share2,
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Upload,
  Check,
  KeyRound,
} from "lucide-react";
import Link from "next/link";
import PlateBadge from "@/components/PlateBadge";
import RecordingsTable from "@/components/RecordingsTable";
import FileUploadBox from "@/components/FileUploadBox";
import { gpsService, toMapsLink, type GpsCoords } from "@/lib/gps";
import { reverseGeocode } from "@/lib/geocoding";
import {
  saveRecording,
  getAllRecordings,
  deleteRecording,
  updateGeodata,
  updateNotes,
  updatePlate,
  updateRecordingField,
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  saveFieldCheckEntry,
  type RecordingEntry,
  type FieldCheckEntry,
} from "@/lib/idb";
import { parsePlateFromTranscript, extractMultiplePlates, extractNotePhrases, findDuplicates, normalizePlate, bankPlateToArabic, detectPlateColumn, pickBestHypothesis, applyLetterConfusions, recordLetterCorrections, serializeLetterConfusions, deserializeLetterConfusions, applyWordBlend, recordWordBlend, serializeWordBlend, deserializeWordBlend, type LetterConfusionMap, type WordBlendMap, EN_TO_AR } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import { syncPending, registerOnlineSync } from "@/lib/sync";
import { supabase } from "@/lib/supabaseClient";
import { authHeader } from "@/lib/authHeader";
import { exportRecordingsToExcel, parseExcelFile, buildSpreadsheetBlob, openExcelBlob, toSafeCacheFilename, type ExcelTable } from "@/lib/excel";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

const INVALID_AR_LETTERS_SET = new Set(["ت","ث","ج","خ","ذ","ز","ش","ض","ظ","غ","ف"]);

const LS_LETTER_CONFUSIONS = "ph:registration:letterConfusions";
const LS_WORD_BLENDS = "ph:registration:wordBlends";

// Vercel rejects any serverless function request over 4.5MB — at this
// recorder's fixed 96kbps bitrate that's roughly 5 minutes of audio, so 180s
// per chunk (~2.2MB) still leaves a healthy margin. The longer chunk is a
// deliberate trade: each live chunk-switch stops/restarts the recorder, and
// the sub-second gap in between can clip a plate spoken right on the boundary.
// Fewer switches ⇒ fewer boundaries ⇒ fewer chances to lose a plate. (Chunk
// TEXTS are joined before parsing, so a lossless cut is healed automatically —
// only the live switch-gap actually drops audio, which this reduces.)
const GROQ_CHUNK_MS = 180_000;

interface GroqChunkResult {
  text: string;
  audioBase64: string;
  mimeType: string;
}

// Uploads one finished recording chunk and returns its transcribed text
// alongside the raw audio (kept so the session's audio can be saved for
// playback later). Retries once on a genuine network failure (fetch()
// throwing — offline, DNS blip, timeout) since that's transient; an actual
// error response from Groq (bad key, bad format) is not retried since
// repeating the identical request would just fail identically again.
async function uploadGroqChunk(
  chunk: { value: { recordDataBase64: string; mimeType: string } },
  apiKey: string,
  retriesLeft = 1
): Promise<GroqChunkResult> {
  let res: Response;
  try {
    res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({
        audio: chunk.value.recordDataBase64,
        mimeType: chunk.value.mimeType,
        apiKey,
      }),
    });
  } catch (networkErr) {
    if (retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return uploadGroqChunk(chunk, apiKey, retriesLeft - 1);
    }
    throw networkErr;
  }
  const data = await res.json();
  if (!data.text) {
    // Tag the error with Groq's error code (e.g. "unsupported_format") so
    // callers — specifically handleUploadAudioFile's re-encode fallback —
    // can react to THAT specific failure without string-matching Groq's
    // human-readable message text.
    const err = new Error(data.hint || data.detail || data.error || "unknown") as Error & { code?: string };
    err.code = data.error;
    throw err;
  }
  return {
    text: String(data.text).trim(),
    audioBase64: chunk.value.recordDataBase64,
    mimeType: chunk.value.mimeType,
  };
}

// Byte-concatenates base64-encoded audio parts. Only valid for self-framed
// formats where decoders read frame-by-frame regardless of file boundaries
// (verified for raw ADTS AAC, the native recorder's output) — callers must
// not use this for container formats like mp4/webm where it would produce
// a corrupt file.
function concatBase64Audio(parts: string[]): string {
  const buffers = parts.map((b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  });
  const total = buffers.reduce((sum, b) => sum + b.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { combined.set(b, offset); offset += b.length; }
  let binary = "";
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return btoa(binary);
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Assembles one playable audio clip from successfully-transcribed chunks —
// only when every chunk shares the same MIME type. Byte-concatenating raw
// ADTS AAC (the native recorder's format, and this file's own compression
// output) produces valid playable audio (self-framed, verified); other
// container formats (web's mp4/webm) are NOT safely concatenable this way,
// so a single audio clip is kept as-is and multi-chunk sessions in those
// formats skip audio-saving rather than risk producing a corrupt file.
function assembleSessionAudio(chunks: GroqChunkResult[]): { base64: string; mimeType: string } | null {
  if (chunks.length === 1) return { base64: chunks[0].audioBase64, mimeType: chunks[0].mimeType };
  if (chunks.length > 1 && chunks[0].mimeType === "audio/aac" && chunks.every((c) => c.mimeType === chunks[0].mimeType)) {
    try {
      return { base64: concatBase64Audio(chunks.map((c) => c.audioBase64)), mimeType: chunks[0].mimeType };
    } catch {
      return null;
    }
  }
  return null;
}

const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

// Compresses a picked audio file to a small AAC (adequate for speech, not
// music) and, if it's still over the limit after compression (a genuinely
// long recording rather than just an inefficient format), segments it into
// GROQ_CHUNK_MS-ish pieces — same reasoning as live-recording chunking.
// Loads ffmpeg.wasm lazily (only when a file actually needs it — the core
// is a ~31MB one-time download, too heavy to load on every page visit).
async function compressAndChunkAudioFile(
  file: File,
  maxBytes: number,
  onStatus: (s: string) => void
): Promise<{ base64: string; mimeType: string }[]> {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");

  onStatus("⏳ جارٍ تحميل أداة الضغط (أول مرة بس)…");
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    onStatus("⏳ جارٍ ضغط الملف…");
    const inputExt = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] || ".dat";
    await ffmpeg.writeFile(`input${inputExt}`, await fetchFile(file));
    // Mono + 64kbps is well above what's needed to understand dictated speech,
    // and shrinks even an uncompressed WAV drastically.
    await ffmpeg.exec(["-i", `input${inputExt}`, "-vn", "-ac", "1", "-b:a", "64k", "-f", "adts", "compressed.aac"]);
    const compressed = await ffmpeg.readFile("compressed.aac");
    const compressedBytes = compressed instanceof Uint8Array ? compressed : new TextEncoder().encode(String(compressed));

    if (compressedBytes.byteLength <= maxBytes) {
      return [{ base64: uint8ToBase64(compressedBytes), mimeType: "audio/aac" }];
    }

    onStatus("⏳ الملف لسه طويل بعد الضغط، جارٍ تقسيمه…");
    await ffmpeg.exec([
      "-i", "compressed.aac",
      "-f", "segment", "-segment_time", String(GROQ_CHUNK_MS / 1000), "-c", "copy",
      "seg%03d.aac",
    ]);
    const entries = await ffmpeg.listDir("/");
    const segmentNames = entries
      .map((e: { name: string }) => e.name)
      .filter((name: string) => /^seg\d+\.aac$/.test(name))
      .sort((a: string, b: string) => parseInt(a.match(/\d+/)![0], 10) - parseInt(b.match(/\d+/)![0], 10));

    const chunks: { base64: string; mimeType: string }[] = [];
    for (const name of segmentNames) {
      const data = await ffmpeg.readFile(name);
      const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
      chunks.push({ base64: uint8ToBase64(bytes), mimeType: "audio/aac" });
    }
    return chunks;
  } finally {
    // Each call spins up a fresh worker + WASM instance — without an explicit
    // terminate, uploading several oversized files in one session would pile
    // up terminated-in-name-only workers that never actually release memory.
    ffmpeg.terminate();
  }
}

// A plate freshly extracted from a transcript, ready to save immediately.
// `originalPlate` is the raw pre-correction value the recognizer/parser produced —
// kept on the saved RecordingEntry so a later edit in the table can be diffed
// against it to learn a letter confusion.
type ExtractedPlate = { plate: string; originalPlate: string; vehicleType: string; notes: string; uncertain: boolean; rawLetterSource?: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function uid(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const LS_RECORDER_NAME = "ph:registration:recorderName";
const LS_DISTRICT = "ph:registration:district";
const LS_EXCEL_NAME = "ph:registration:excelName";
// Each agent's own Groq key — stored on-device only, never sent anywhere but
// our own /api/transcribe route (which forwards it straight to Groq). Usage
// is billed against the agent's own free-tier account, not a shared one.
const LS_GROQ_API_KEY = "ph:registration:groqApiKey";
const LS_GROQ_PIN_HASH = "ph:registration:groqPinHash";

// SHA-256 hash of a PIN, hex-encoded — the raw PIN is never persisted.
async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function defaultExcelName(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `اكسيل-${dd}-${mm}-${yyyy}`;
}

function emailToName(email: string): string {
  return email.replace("@platehunter.local", "").replace(/@.*/, "");
}

// ── Audio alert ─────────────────────────────────────────────────────────────
function playMatchAlert() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.6, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.2);
    });
  } catch {
    // Audio not available
  }
}

// ── Web Speech API types ─────────────────────────────────────────────────────
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

// ── Match modal ───────────────────────────────────────────────────────────────
interface MatchedPlate {
  plate: string;
  vehicleType?: string;
  street?: string;
  district?: string;
  mapsLink?: string;
}

function MatchModal({ matches, onClose }: { matches: MatchedPlate[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-brand p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="mb-4 flex items-center justify-center gap-2 shrink-0">
          <AlertTriangle size={28} className="text-night animate-bounce" />
          <span className="text-xl font-black text-night">
            {matches.length === 1 ? "لوحة متطابقة!" : `${matches.length} لوحات متطابقة!`}
          </span>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto flex-1">
          {matches.map((match, i) => (
            <div key={i} className="rounded-xl bg-white/15 p-3 text-center">
              <div className="mb-2 flex justify-center">
                <PlateBadge value={match.plate} size="lg" />
              </div>
              {match.vehicleType && (
                <p className="mb-1 text-base font-bold text-night">{match.vehicleType}</p>
              )}
              {(match.street || match.district) && (
                <p className="mb-1 text-sm text-night/80">
                  {match.street}{match.district ? ` • ${match.district}` : ""}
                </p>
              )}
              {match.mapsLink && (
                <a
                  href={match.mapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-night underline"
                >
                  📍 افتح الموقع في الخريطة
                </a>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-night py-3 text-base font-bold text-brand transition hover:bg-night/80 shrink-0"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}

export default function RegistrationPage() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [recorderName, setRecorderName] = useState<string>("");
  const [manualDistrict, setManualDistrict] = useState<string>("");
  const [excelName, setExcelName] = useState<string>("");
  // When set, recording switches from the local (free, less accurate) device
  // speech recognizer to actual audio capture sent to Groq's cloud Whisper —
  // each agent's own key, so usage never pools onto a shared account.
  const [groqApiKey, setGroqApiKey] = useState<string>("");
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqSectionOpen, setGroqSectionOpen] = useState(false); // collapse/expand the whole Groq-key box
  const [groqTestStatus, setGroqTestStatus] = useState<"idle" | "testing" | "ok" | "failed">("idle");
  const [groqTestError, setGroqTestError] = useState<string | null>(null);
  // PIN-gates revealing/clearing the Groq key — someone who grabs the phone
  // while the key happens to be shown (or reachable via the clear button)
  // shouldn't be able to see or wipe it without this. Stored as a hash only,
  // never the raw PIN. Recovery has no email on file to reset via (agent
  // accounts use a synthetic @platehunter.local address, not a real inbox —
  // see lib/auth.ts) — so "forgot PIN" re-verifies the agent's own account
  // password instead, then lets them set a new PIN for the same key.
  const [agentEmail, setAgentEmail] = useState<string>("");
  const [groqPinHash, setGroqPinHash] = useState<string | null>(null);
  const [pinPrompt, setPinPrompt] = useState<{ mode: "setup" | "verify" | "forgot"; onSuccess: () => void } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [forgotPasswordInput, setForgotPasswordInput] = useState("");
  const [pinFlowError, setPinFlowError] = useState<string | null>(null);
  const [pinFlowBusy, setPinFlowBusy] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("جارٍ تحديد الموقع...");
  const [gpsBoxOpen, setGpsBoxOpen] = useState(true);
  const [gpsRefreshing, setGpsRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>("");

  // Transcript captured from the last recording session, held until the user
  // presses "احفظ وصدّر الإكسيل" to extract + save plates from it.
  const [pendingTranscript, setPendingTranscript] = useState<string>("");

  // Recordings list
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());

  // Audio playback
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playSpeed, setPlaySpeed] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Manual plate entry
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualPlatePreview, setManualPlatePreview] = useState("");

  // Pin counter
  const [pinCount, setPinCount] = useState(0);

  // Check file (bank list for matching)
  const [checkPlates, setCheckPlates] = useState<Set<string>>(new Set());
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkHeaders, setCheckHeaders] = useState<string[]>([]);
  const [selectedCheckCols, setSelectedCheckCols] = useState<Set<string>>(new Set());
  const [checkColsOpen, setCheckColsOpen] = useState(false);

  const checkPlateCol = checkHeaders.length ? detectPlateColumn(checkHeaders) : null;

  function toggleCheckCol(col: string) {
    setSelectedCheckCols((prev) => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  }

  // Match modal
  const [matchedPlates, setMatchedPlates] = useState<MatchedPlate[]>([]);

  // Matched recordings (IDs of recordings that triggered check alert)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());

  // Debug panel
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugRaw, setDebugRaw] = useState("");
  const [debugFinal, setDebugFinal] = useState("");
  const [debugNormalized, setDebugNormalized] = useState("");
  const [debugPlate, setDebugPlate] = useState("");
  const [debugVehicle, setDebugVehicle] = useState("");
  const [debugNotes, setDebugNotes] = useState("");

  const gpsAtRecordRef = useRef<GpsCoords | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  // Guards the window between a record-button tap and isRecordingRef flipping
  // true — startRecording awaits a permission prompt + native calls before
  // that happens, so a rapid double-tap would otherwise start two concurrent
  // recording sessions (two chunk timers, one leaked and uncancelable).
  const startingRecordingRef = useRef(false);

  // Learned letter-confusion corrections (heard → actual), calibrated per device/mic
  // from the user's own edits in the review step. Loaded once on mount, persisted
  // to localStorage whenever a save teaches it something new.
  const letterConfusionsRef = useRef<LetterConfusionMap>(new Map());
  // Learned whole-fragment corrections (raw garbled word/overflow run → actual
  // letters) — the complement of letterConfusionsRef for guesses where the
  // whole letter group was wrong, not one letter drifting. See handlePlateEdit.
  const wordBlendRef = useRef<WordBlendMap>(new Map());

  // Groq cloud transcription: chunk timer + in-flight/finished chunk uploads
  // (ordered — must be stitched back together in this order, not arrival order).
  const groqChunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const groqChunksRef = useRef<Promise<GroqChunkResult>[]>([]);
  const groqChunkBusyRef = useRef(false); // guards against overlapping chunk switches
  // Session audio ready to attach to whatever plates get saved from
  // `pendingTranscript` — set on stop, consumed (and cleared) on save.
  const pendingAudioRef = useRef<{ base64: string; mimeType: string } | null>(null);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const liveTranscriptRef  = useRef<string>("");
  const isRecordingRef     = useRef<boolean>(false); // ref so onend auto-restart sees current state

  // SR status for debug
  const [debugStatus, setDebugStatus] = useState("");

  // ── Bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_LETTER_CONFUSIONS);
      if (raw) letterConfusionsRef.current = deserializeLetterConfusions(JSON.parse(raw));
    } catch { /* corrupt/missing — start fresh */ }

    try {
      const raw = localStorage.getItem(LS_WORD_BLENDS);
      if (raw) wordBlendRef.current = deserializeWordBlend(JSON.parse(raw));
    } catch { /* corrupt/missing — start fresh */ }

    try {
      const savedKey = localStorage.getItem(LS_GROQ_API_KEY) || "";
      setGroqApiKey(savedKey);
      const savedPinHash = localStorage.getItem(LS_GROQ_PIN_HASH) || null;
      setGroqPinHash(savedPinHash);
      // Safety net: a key saved before setup finished (app closed mid-setup)
      // would otherwise sit unprotected forever with no trigger to fix it.
      if (savedKey.trim() && !savedPinHash) {
        setPinPrompt({ mode: "setup", onSuccess: () => {} });
      }
    } catch { /* storage unavailable */ }

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const uid = data.user.id;
        setAgentId(uid);
        setAgentEmail(data.user.email ?? "");
        try {
          const savedName = localStorage.getItem(LS_RECORDER_NAME);
          setRecorderName(savedName || emailToName(data.user.email ?? ""));
          setManualDistrict(localStorage.getItem(LS_DISTRICT) || "");
          setExcelName(localStorage.getItem(LS_EXCEL_NAME) || defaultExcelName());
        } catch {
          setRecorderName(emailToName(data.user.email ?? ""));
          setExcelName(defaultExcelName());
        }
        loadRecordings(uid);
        registerOnlineSync(uid);

        // Restore check file — read from shared "local:check" slot
        const checkRec = await getUploadedFile("local", "check");
        if (checkRec) {
          const plateCol = detectPlateColumn(checkRec.headers) ?? checkRec.headers[0];
          const plates = new Set(
            checkRec.rows
              .map((r) => normalizePlate(bankPlateToArabic(String(r[plateCol] ?? ""))))
              .filter(Boolean)
          );
          setCheckPlates(plates);
          setCheckFile(new File([checkRec.fileBlob ?? new Blob()], checkRec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }));
          setCheckHeaders(checkRec.headers);
          setSelectedCheckCols(new Set(checkRec.headers.filter((h) => h !== plateCol && matchesPreferred(h))));
        }
      }
    });

    gpsService.startTracking().catch(() => {});
    const unsub = gpsService.subscribe((coords) => {
      setGps(coords);
      if (coords) {
        reverseGeocode(coords.lat, coords.lng).then((addr) => {
          setGpsAddress(`${addr.street} • ${addr.district}`);
        });
      }
    });

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      unsub();
      gpsService.stopTracking();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (groqChunkTimerRef.current) clearInterval(groqChunkTimerRef.current);
    };
  }, []);

  function handleRecorderNameChange(v: string) {
    setRecorderName(v);
    try { localStorage.setItem(LS_RECORDER_NAME, v); } catch { /* storage full */ }
  }
  function clearRecorderName() { handleRecorderNameChange(""); }

  function handleDistrictChange(v: string) {
    setManualDistrict(v);
    try { localStorage.setItem(LS_DISTRICT, v); } catch { /* storage full */ }
  }
  function clearDistrict() { handleDistrictChange(""); }

  function handleExcelNameChange(v: string) {
    setExcelName(v);
    try { localStorage.setItem(LS_EXCEL_NAME, v); } catch { /* storage full */ }
  }
  function clearExcelName() { handleExcelNameChange(""); }

  function handleGroqKeyChange(v: string) {
    setGroqApiKey(v);
    setGroqTestStatus("idle"); // stale result from a since-edited key would be misleading
    setGroqTestError(null);
    try {
      if (v.trim()) localStorage.setItem(LS_GROQ_API_KEY, v.trim());
      else localStorage.removeItem(LS_GROQ_API_KEY);
    } catch { /* storage full */ }
  }

  // Fires once editing finishes (not per keystroke — a PIN prompt popping up
  // mid-paste would be jarring). A key entered with no PIN yet is either a
  // brand-new key, or was saved before setup finished last time (see the
  // bootstrap safety net above) — either way, it needs a PIN before it's
  // usable, so this always wins over just silently leaving it unprotected.
  function handleGroqKeyBlur() {
    if (groqApiKey.trim() && !groqPinHash) {
      setPinInput(""); setPinConfirmInput(""); setPinFlowError(null); setShowPinInput(false);
      setPinPrompt({ mode: "setup", onSuccess: () => {} });
    }
  }

  function clearGroqKey() {
    handleGroqKeyChange("");
    // The PIN protected THIS key — once it's gone, a freshly-entered key
    // starts over with its own new PIN rather than inheriting the old one.
    setGroqPinHash(null);
    try { localStorage.removeItem(LS_GROQ_PIN_HASH); } catch { /* storage full */ }
  }

  // Reveal/clear both touch the saved key, so both require the PIN — but
  // hiding an already-shown key back never needs it (it's only making
  // information LESS visible).
  function handleShowGroqKeyClick() {
    if (showGroqKey) { setShowGroqKey(false); return; }
    if (!groqPinHash) { setShowGroqKey(true); return; } // no PIN configured — nothing to gate against
    setPinInput(""); setPinFlowError(null); setShowPinInput(false);
    setPinPrompt({ mode: "verify", onSuccess: () => setShowGroqKey(true) });
  }

  function handleClearGroqKeyClick() {
    if (!groqApiKey.trim()) return;
    if (!groqPinHash) { clearGroqKey(); return; }
    setPinInput(""); setPinFlowError(null); setShowPinInput(false);
    setPinPrompt({ mode: "verify", onSuccess: () => clearGroqKey() });
  }

  async function submitPinSetup() {
    const pin = pinInput.trim();
    if (!/^\d{4,6}$/.test(pin)) { setPinFlowError("الرقم السري لازم يكون 4-6 أرقام."); return; }
    if (pin !== pinConfirmInput.trim()) { setPinFlowError("الرقمين مش متطابقين."); return; }
    const hash = await hashPin(pin);
    setGroqPinHash(hash);
    try { localStorage.setItem(LS_GROQ_PIN_HASH, hash); } catch { /* storage full */ }
    const onSuccess = pinPrompt?.onSuccess;
    setPinPrompt(null);
    setPinInput(""); setPinConfirmInput(""); setPinFlowError(null); setShowPinInput(false);
    onSuccess?.();
  }

  async function submitPinVerify() {
    const pin = pinInput.trim();
    if (!pin) return;
    const hash = await hashPin(pin);
    if (hash !== groqPinHash) { setPinFlowError("الرقم السري غلط."); return; }
    const onSuccess = pinPrompt?.onSuccess;
    setPinPrompt(null);
    setPinInput(""); setPinFlowError(null); setShowPinInput(false);
    onSuccess?.();
  }

  // Re-verifies the agent's OWN account password (the same one used to log
  // in) via Supabase — there's no real email to send a reset link to (see
  // the note by groqPinHash's declaration above). On success, chains into
  // "setup" so they immediately pick a new PIN, then the original
  // reveal/clear action they wanted still goes through once that's saved.
  async function submitForgotPassword() {
    if (!agentEmail) { setPinFlowError("تعذّر التحقق من الحساب — سجّل خروج ودخول تاني وجرّب."); return; }
    if (!forgotPasswordInput) return;
    setPinFlowBusy(true);
    setPinFlowError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: agentEmail, password: forgotPasswordInput });
      if (error) { setPinFlowError("كلمة سر الحساب غلط."); return; }
      setPinInput(""); setPinConfirmInput(""); setForgotPasswordInput(""); setShowPinInput(false);
      setPinPrompt((prev) => prev && { ...prev, mode: "setup" });
    } finally {
      setPinFlowBusy(false);
    }
  }

  function cancelPinPrompt() {
    setPinPrompt(null);
    setPinInput(""); setPinConfirmInput(""); setForgotPasswordInput(""); setPinFlowError(null); setShowPinInput(false);
  }

  async function testGroqKey() {
    const key = groqApiKey.trim();
    if (!key) return;
    setGroqTestStatus("testing");
    setGroqTestError(null);
    try {
      const res = await fetch("/api/groq-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (data.ok) {
        setGroqTestStatus("ok");
      } else {
        setGroqTestStatus("failed");
        setGroqTestError(data.hint || data.detail || data.error || "خطأ غير معروف");
      }
    } catch (err: any) {
      setGroqTestStatus("failed");
      setGroqTestError(err?.message ?? String(err));
    }
  }

  const loadRecordings = useCallback(async (aid: string) => {
    const recs = await getAllRecordings(aid);
    setRecordings(recs);
    setDuplicates(findDuplicates(recs.map((r) => r.plate)));
  }, []);

  async function handleCheckFile(table: ExcelTable, file: File) {
    const plateCol = detectPlateColumn(table.headers) ?? table.headers[0];
    const plates = new Set(
      table.rows
        .map((r) => normalizePlate(bankPlateToArabic(String(r[plateCol] ?? ""))))
        .filter(Boolean)
    );
    await saveUploadedFile({
      key: "local:check",
      agentId: "local",
      slot: "check",
      fileName: file.name,
      headers: table.headers,
      rows: table.rows,
      uploadedAt: new Date().toISOString(),
      fileBlob: file,
    });
    setCheckPlates(plates);
    setCheckFile(file);
    setCheckHeaders(table.headers);
    setSelectedCheckCols(new Set(table.headers.filter((h) => h !== plateCol && matchesPreferred(h))));
  }

  async function handleDeleteCheck() {
    await deleteUploadedFile("local", "check");
    setCheckPlates(new Set());
    setCheckFile(null);
    setCheckHeaders([]);
    setSelectedCheckCols(new Set());
  }

  function checkPlateMatch(plate: string, entry: RecordingEntry) {
    if (checkPlates.size === 0) return;
    const norm = normalizePlate(plate);
    if (checkPlates.has(norm)) {
      setMatchedIds((prev) => new Set(prev).add(entry.localId));
      playMatchAlert();
      setMatchedPlates((prev) => [
        ...prev,
        {
          plate,
          vehicleType: entry.vehicleType,
          street: entry.street,
          district: entry.district,
          mapsLink: entry.mapsLink,
        },
      ]);
    }
  }

  // ── Web Speech API recording ─────────────────────────────────────────
  async function startRecording() {
    if (isRecordingRef.current || startingRecordingRef.current) return;
    startingRecordingRef.current = true;
    try {
      await startRecordingInner();
    } finally {
      startingRecordingRef.current = false;
    }
  }

  async function startRecordingInner() {
    // A previous session's transcript/audio is still sitting unsaved (the
    // "جاهز للتفريغ" card) — starting a new one would silently overwrite
    // pendingAudioRef/pendingTranscript with no trace of the old recording.
    // Save it first, exactly as if the agent had tapped "احفظ" themselves.
    if (pendingTranscript.trim()) {
      const { ok } = await extractAndSaveTranscript();
      if (!ok) {
        setRecordingError("فيه تسجيل سابق لسه محفوظش — تعامل معاه الأول (الكرت اللي فوق) قبل ما تسجل تاني.");
        return;
      }
    }

    setRecordingError(null);
    setLiveTranscript("");
    setDebugStatus("");
    finalTranscriptRef.current = "";
    liveTranscriptRef.current  = "";

    // ── Cloud transcription (Groq Whisper) — used when the agent configured
    // their own key. Captures raw audio instead of running the on-device
    // recognizer; the audio is sent to Groq in chunks (see GROQ_CHUNK_MS)
    // rather than as one upload for the whole session.
    if (groqApiKey.trim()) {
      try {
        const { VoiceRecorder } = await import("@independo/capacitor-voice-recorder");
        const perm = await VoiceRecorder.requestAudioRecordingPermission();
        if (!perm.value) {
          setRecordingError("محتاج صلاحية الميكروفون عشان التسجيل السحابي يشتغل.");
          return;
        }
        await VoiceRecorder.startRecording();
        gpsAtRecordRef.current = gpsService.getLastCoords();
        isRecordingRef.current = true;
        setIsRecording(true);
        setDebugStatus("✅ STARTED (Groq Cloud)");
        groqChunksRef.current = [];
        groqChunkBusyRef.current = false;

        // A single upload covering a long session risks exceeding Vercel's
        // hard 4.5MB request-body limit (~5 minutes of audio at this
        // bitrate) — the request would be rejected before our code even
        // runs. Instead, seamlessly swap to a fresh recording segment every
        // GROQ_CHUNK_MS and transcribe the finished one in the background;
        // chunks are stitched back together in order when the user stops.
        groqChunkTimerRef.current = setInterval(async () => {
          if (!isRecordingRef.current || groqChunkBusyRef.current) return;
          groqChunkBusyRef.current = true;
          const { VoiceRecorder: VR } = await import("@independo/capacitor-voice-recorder");

          // Stop and resume are attempted independently — if stopping this
          // segment fails (e.g. EMPTY_RECORDING), we still must try to
          // resume recording so the session doesn't silently go dead for
          // the rest of the interval.
          let chunk: Awaited<ReturnType<typeof VR.stopRecording>> | null = null;
          try {
            chunk = await VR.stopRecording();
          } catch (err: any) {
            setRecordingError(`تعذّر إنهاء جزء من التسجيل: ${err?.message ?? err}`);
          }
          try {
            if (isRecordingRef.current) await VR.startRecording();
          } catch (err: any) {
            setRecordingError(`تعذّر استئناف التسجيل: ${err?.message ?? err}`);
          }
          if (chunk) groqChunksRef.current.push(uploadGroqChunk(chunk, groqApiKey.trim()));
          groqChunkBusyRef.current = false;
        }, GROQ_CHUNK_MS);
      } catch (err: any) {
        setRecordingError(`تعذّر بدء التسجيل السحابي: ${err?.message ?? err}`);
      }
      return;
    }

    // ── Native Android: Capacitor Speech Recognition ──────────────────
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { SpeechRecognition } = await import("@capacitor-community/speech-recognition") as any;

        setIsRecording(true);
        isRecordingRef.current = true;
        gpsAtRecordRef.current = gpsService.getLastCoords();
        setDebugStatus("✅ STARTED (Native)");

        await SpeechRecognition.requestPermissions();

        // Auto-restart loop — keeps listening until user taps stop.
        // Native speech recognizers throw on every brief silence/no-match/timeout
        // between utterances — that must NOT end the session, only an explicit stop should.
        while (isRecordingRef.current) {
          try {
            const result = await SpeechRecognition.start({
              language: "ar-SA",
              maxResults: 5,          // get several hypotheses, keep the most plate-like
              partialResults: false,
              popup: false,
            });
            const text: string = pickBestHypothesis(result?.matches ?? []);
            if (text) {
              finalTranscriptRef.current = (finalTranscriptRef.current + " " + text).trim() + " ";
              setLiveTranscript(finalTranscriptRef.current);
              setDebugRaw(finalTranscriptRef.current);
            }
          } catch (err: any) {
            if (!isRecordingRef.current) break;
            setDebugStatus(`🔄 RESTARTING… (${err?.message ?? err ?? "صمت/لا يوجد كلام"})`);
            await new Promise((r) => setTimeout(r, 300));
          }
        }

        isRecordingRef.current = false;
        setIsRecording(false);

        // Nothing gets extracted/saved until the user presses "ابدأ التفريغ" themselves.
        const transcript = finalTranscriptRef.current.trim();
        setLiveTranscript("");
        liveTranscriptRef.current = "";
        finalTranscriptRef.current = "";
        setPendingTranscript(transcript);
        setDebugFinal(transcript || "(فارغ)");
        return;
      }
    } catch (err) {
      console.warn("Capacitor SR unavailable, falling back to Web SR:", err);
      isRecordingRef.current = false;
      setIsRecording(false);
    }

    // ── Web fallback (browser / Chrome) ───────────────────────────────
    const recognition = createSpeechRecognition();
    if (!recognition) {
      setRecordingError("المتصفح لا يدعم التعرف الصوتي. استخدم Chrome أو Edge.");
      return;
    }

    recognition.lang = "ar-SA";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;   // get several hypotheses, keep the most plate-like

    recognition.onstart = () => { setDebugStatus("✅ STARTED"); };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Pick the plate-likeliest alternative, not just the first.
          // Recognizer confidence breaks near-ties between equally plate-shaped alternatives.
          const alts: string[] = [];
          const confs: number[] = [];
          for (let a = 0; a < result.length; a++) {
            alts.push(result[a].transcript);
            confs.push(result[a].confidence);
          }
          final += pickBestHypothesis(alts, confs) + " ";
        }
        else { interim += result[0].transcript; }
      }
      finalTranscriptRef.current = final;
      liveTranscriptRef.current  = final + interim;
      setLiveTranscript(final + interim);
      setDebugRaw(final + interim);
    };

    recognition.onerror = (event: { error: string }) => {
      setDebugStatus(`❌ ERROR: ${event.error}`);
      if (event.error !== "aborted" && event.error !== "no-speech") {
        setRecordingError(`خطأ في التعرف الصوتي: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setDebugStatus((prev) => prev.startsWith("✅") ? "🔄 RESTARTING…" : prev);
      if (isRecordingRef.current) {
        try { recognition.start(); } catch { /* stopping */ }
      }
    };

    recognitionRef.current = recognition;
    gpsAtRecordRef.current = gpsService.getLastCoords();
    isRecordingRef.current = true;

    recognition.start();
    setIsRecording(true);
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecordingRef.current = false;
    setIsRecording(false);

    // ── Cloud transcription (Groq Whisper) ──────────────────────────────
    if (groqApiKey.trim()) {
      if (groqChunkTimerRef.current) {
        clearInterval(groqChunkTimerRef.current);
        groqChunkTimerRef.current = null;
      }
      // If the user tapped stop right as a scheduled chunk-switch was mid-flight,
      // wait it out rather than racing it for the recorder — both call
      // VoiceRecorder.stopRecording(), and only one can win.
      while (groqChunkBusyRef.current) await new Promise((r) => setTimeout(r, 50));
      setDebugStatus("⏳ جارٍ رفع آخر جزء…");
      setIsTranscribing(true);
      try {
        const { VoiceRecorder } = await import("@independo/capacitor-voice-recorder");
        try {
          const lastChunk = await VoiceRecorder.stopRecording();
          groqChunksRef.current.push(uploadGroqChunk(lastChunk, groqApiKey.trim()));
        } catch (err: any) {
          // EMPTY_RECORDING when the user stops right after a chunk-switch —
          // fine, just means there's nothing new to add.
          setDebugStatus(`⚠️ آخر جزء فشل: ${err?.message ?? err}`);
        }

        setDebugStatus("⏳ جارٍ تجميع كل الأجزاء…");
        const settled = await Promise.allSettled(groqChunksRef.current);
        const ok = settled.filter((s): s is PromiseFulfilledResult<GroqChunkResult> => s.status === "fulfilled").map((s) => s.value);
        const failedCount = settled.length - ok.length;
        const transcript = ok.map((c) => c.text).join(" ").trim();

        // Save the session's audio for later playback/deletion/sharing.
        pendingAudioRef.current = assembleSessionAudio(ok);

        if (transcript) {
          setPendingTranscript(transcript);
          setDebugFinal(transcript);
          setDebugRaw(transcript);
          setDebugStatus(
            failedCount > 0
              ? `⚠️ تم التفريغ (${failedCount} جزء فشل ولوحاته اتفقدت)`
              : "✅ تم التفريغ السحابي"
          );
          if (failedCount > 0) {
            setRecordingError(`${failedCount} جزء من التسجيل فشل تفريغه — أي لوحات فيه اتفقدت. النص الباقي جاهز تحت.`);
          }
        } else {
          const firstFailure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
          const reason = firstFailure ? String(firstFailure.reason?.message ?? firstFailure.reason) : "سبب غير معروف";
          setRecordingError(`فشل التفريغ السحابي بالكامل — ${reason}`);
          setDebugStatus(`❌ ERROR: كل الأجزاء فشلت — ${reason}`);
        }
      } catch (err: any) {
        setRecordingError(`تعذّر التفريغ السحابي: ${err?.message ?? err}`);
        setDebugStatus(`❌ ERROR: ${err?.message ?? err}`);
      } finally {
        setIsTranscribing(false);
        groqChunksRef.current = [];
      }
      return;
    }

    // Native: stop Capacitor SR — startRecording's loop handles the rest
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { SpeechRecognition } = await import("@capacitor-community/speech-recognition") as any;
        try { await SpeechRecognition.stop(); } catch {}
        return;
      }
    } catch {}

    // Web fallback
    recognitionRef.current?.stop();
    await new Promise((r) => setTimeout(r, 400));

    // Nothing gets extracted/saved until the user presses "ابدأ التفريغ" themselves.
    const transcript = finalTranscriptRef.current.trim();
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    finalTranscriptRef.current = "";
    setPendingTranscript(transcript);
    setDebugFinal(transcript || "(فارغ)");
  }

  // Extract plates from the transcript and pre-correct their letters using
  // patterns learned from this device's past mishearings. Updates the debug
  // panel with the extraction result.
  function extractPlates(transcript: string): ExtractedPlate[] {
    setDebugFinal(transcript);
    setDebugNormalized("");
    setDebugPlate("جارٍ الاستخراج...");
    setDebugVehicle("");
    setDebugNotes("");

    // Pull the delegate's fixed note phrases (الشارع بيلف يمين / جراج يسار رقم ٥ …)
    // out FIRST — snapped to their canonical form even if mis-heard — so their
    // words (especially a garage number) never get mistaken for plate letters
    // or plate digits. The plate extractor then runs on the leftover text.
    const { notes: notePhrases, rest } = extractNotePhrases(transcript);
    const phraseNote = notePhrases.join(" ، ");

    let plates = extractMultiplePlates(rest);
    if (plates.length === 0) {
      const parsed = parsePlateFromTranscript(rest);
      if (parsed.plate) {
        plates = [{ plate: parsed.plate, vehicleType: parsed.vehicleType, notes: parsed.notes, normalized: parsed.normalized, uncertain: parsed.uncertain }];
      }
    }

    if (plates.length === 0) {
      setDebugPlate("(لم يُستخرج)");
      setDebugNotes(phraseNote || "(لا توجد لوحات)");
      return [];
    }

    // Attach the recognised note phrase(s) to the last plate — a spoken note
    // almost always follows the plate it describes.
    if (phraseNote) {
      const last = plates.length - 1;
      plates[last] = { ...plates[last], notes: [plates[last].notes, phraseNote].filter(Boolean).join(" ، ") };
    }

    setDebugPlate(plates.map((p) => p.plate).join(" | "));
    setDebugVehicle(plates.map((p) => p.vehicleType || "—").join(" | "));
    setDebugNotes(plates.map((p) => p.notes || "—").join(" | "));

    return plates.map((p) => {
      // A confidently-learned whole-fragment correction (only ever applicable
      // when the extraction had to guess — rawLetterSource is unset on a
      // clean extraction) is tried FIRST, then per-letter confusion on top —
      // the two learners never fight over the same input.
      let working = p.plate;
      if (p.rawLetterSource) {
        const learnedLetters = applyWordBlend(p.rawLetterSource, wordBlendRef.current);
        if (learnedLetters) working = learnedLetters + p.plate.replace(/^\D+/, "");
      }
      const corrected = applyLetterConfusions(working, letterConfusionsRef.current);
      return {
        plate: corrected,
        originalPlate: p.plate,
        vehicleType: p.vehicleType ?? "",
        notes: p.notes ?? "",
        // Flag for a quick glance if the parser itself was unsure, OR if we just
        // auto-corrected it — either learner is a heuristic, not a certainty.
        uncertain: !!p.uncertain || corrected !== p.plate,
        rawLetterSource: p.rawLetterSource,
      };
    });
  }

  // Save extracted plates to IndexedDB immediately + return them. No review gate —
  // field agents dictate plate after plate while moving through a street, so a
  // blocking per-letter review isn't practical. `originalPlate` is kept on the
  // saved entry so a later table edit can still teach the letter-confusion learner.
  async function savePlateList(plates: ExtractedPlate[]): Promise<RecordingEntry[]> {
    if (!agentId) return [];

    const coords = gpsAtRecordRef.current;
    const audio = pendingAudioRef.current;
    const savedIds: string[] = [];
    const savedEntries: RecordingEntry[] = [];

    for (const { plate, originalPlate, vehicleType, notes, uncertain, rawLetterSource } of plates) {
      const cleanPlate = plate.trim();
      if (!cleanPlate) continue;
      const localId = uid();
      savedIds.push(localId);
      const entry: RecordingEntry = {
        localId,
        agentId,
        plate: cleanPlate,
        originalPlate: originalPlate !== cleanPlate ? originalPlate : undefined,
        uncertain: uncertain || undefined,
        rawLetterSource,
        // Field convention: a car with no type dictated in front of it
        // (ونيت/فان/دباب/…) is a regular private car — default it to "ملاكي"
        // so the vehicle-type column is never blank for a real plate.
        vehicleType: vehicleType?.trim() || "ملاكي",
        notes: notes?.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        recordedAt: new Date().toISOString(),
        mapsLink: coords ? toMapsLink(coords.lat, coords.lng) : undefined,
        recorderName,
        district: manualDistrict.trim() || undefined,
        audioBlobBase64: audio?.base64,
        audioMimeType: audio?.mimeType,
        synced: false,
      };
      await saveRecording(entry);
      savedEntries.push(entry);
      if (!coords) checkPlateMatch(plate, entry);
    }
    pendingAudioRef.current = null; // consumed — don't leak into an unrelated later save

    if (coords) {
      reverseGeocode(coords.lat, coords.lng)
        .then(async (addr) => {
          for (const localId of savedIds) {
            await updateGeodata(localId, addr.street, manualDistrict.trim() || addr.district);
          }
          if (agentId) {
            const updated = await getAllRecordings(agentId);
            for (const localId of savedIds) {
              const updatedEntry = updated.find((r) => r.localId === localId);
              if (updatedEntry) checkPlateMatch(updatedEntry.plate, updatedEntry);
            }
            setRecordings(updated);
            setDuplicates(findDuplicates(updated.map((r) => r.plate)));
          }
        })
        .catch(() => {});
    }

    await loadRecordings(agentId);
    if (isOnline) syncPending(agentId);
    return savedEntries;
  }

  // ── Manual plate entry ──────────────────────────────────────────────
  function handleManualChange(val: string) {
    // Convert English letters to Arabic plate equivalents
    const converted = val.toUpperCase().split("").map((ch) => EN_TO_AR[ch] ?? ch).join("");
    setManualInput(converted);

    // Detect invalid Arabic letters (ت ث ج خ ذ ز ش ض ظ غ ف)
    const invalid: string[] = [];
    for (const ch of converted) {
      if (INVALID_AR_LETTERS_SET.has(ch) && !invalid.includes(ch)) invalid.push(ch);
    }

    if (invalid.length > 0) {
      setManualError(`حروف غير موجودة في اللوحات السعودية: ${invalid.join(" ")}`);
      setManualPlatePreview("");
    } else {
      setManualError(null);
      setManualPlatePreview(converted.replace(/\s+/g, ""));
    }
  }

  function dismissManualError() {
    setManualError(null);
    setManualInput("");
    setManualPlatePreview("");
  }

  async function handleManualSave() {
    if (!agentId) return;
    const raw = manualInput.trim();
    if (!raw || manualError) return;

    const finalPlate = raw.replace(/\s+/g, "");
    if (!finalPlate) { setManualError("أدخل رقم اللوحة"); return; }

    setManualInput("");
    setManualPlatePreview("");
    setManualError(null);

    const coords = gps ?? gpsService.getLastCoords();
    const localId = uid();
    const entry: RecordingEntry = {
      localId,
      agentId,
      plate: finalPlate,
      vehicleType: "ملاكي", // same default as voice: a typed plate with no type is a private car
      lat: coords?.lat,
      lng: coords?.lng,
      recordedAt: new Date().toISOString(),
      mapsLink: coords ? toMapsLink(coords.lat, coords.lng) : undefined,
      recorderName,
      district: manualDistrict.trim() || undefined,
      isManual: true,
      synced: false,
    };

    await saveRecording(entry);

    if (coords) {
      reverseGeocode(coords.lat, coords.lng).then(async (addr) => {
        await updateGeodata(localId, addr.street, manualDistrict.trim() || addr.district);
        if (agentId) {
          const updated = await getAllRecordings(agentId);
          const updatedEntry = updated.find((r) => r.localId === localId);
          if (updatedEntry) checkPlateMatch(finalPlate, updatedEntry);
          setRecordings(updated);
          setDuplicates(findDuplicates(updated.map((r) => r.plate)));
        }
      }).catch(() => { checkPlateMatch(finalPlate, entry); });
    } else {
      checkPlateMatch(finalPlate, entry);
    }

    await loadRecordings(agentId);
    if (isOnline) syncPending(agentId);
  }

  // Force a fresh high-accuracy GPS read (the «تحديث» button on the GPS box).
  async function refreshGps() {
    setGpsRefreshing(true);
    try {
      const coords = await gpsService.pinCurrentLocation();
      setGps(coords);
      const addr = await reverseGeocode(coords.lat, coords.lng);
      setGpsAddress(`${addr.street} • ${addr.district}`);
    } catch {
      /* still no fix — box stays red */
    } finally {
      setGpsRefreshing(false);
    }
  }

  // ── Manual GPS pin ──────────────────────────────────────────────────
  async function handlePin() {
    if (!agentId) return;
    try {
      const coords = await gpsService.pinCurrentLocation();
      const addr = await reverseGeocode(coords.lat, coords.lng);
      const localId = uid();
      const entry: RecordingEntry = {
        localId,
        agentId,
        plate: "📍 دبوس يدوي",
        lat: coords.lat,
        lng: coords.lng,
        street: addr.street,
        district: manualDistrict.trim() || addr.district,
        recordedAt: new Date().toISOString(),
        mapsLink: toMapsLink(coords.lat, coords.lng),
        recorderName,
        synced: false,
      };
      await saveRecording(entry);
      setPinCount((n) => n + 1);
      await loadRecordings(agentId);
      if (isOnline) syncPending(agentId);
    } catch (err) {
      console.error("Pin failed:", err);
    }
  }

  // ── Audio playback ──────────────────────────────────────────────────
  function togglePlay(entry: RecordingEntry) {
    if (!entry.audioBlobBase64) return;

    if (playingId === entry.localId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    const binary = atob(entry.audioBlobBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: entry.audioMimeType || "audio/mp4" });
    const url = URL.createObjectURL(blob);

    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
    }

    const audio = new Audio(url);
    audio.playbackRate = playSpeed[entry.localId] ?? 1;
    audio.onended = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(entry.localId);
  }

  function setSpeed(id: string, speed: number) {
    setPlaySpeed((prev) => ({ ...prev, [id]: speed }));
    if (playingId === id && audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }

  async function shareAudio(entry: RecordingEntry) {
    if (!entry.audioBlobBase64) return;
    const binary = atob(entry.audioBlobBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = (entry.audioMimeType?.split("/")[1] ?? "m4a").split(";")[0];
    const blob = new Blob([bytes], { type: entry.audioMimeType || "audio/mp4" });
    try {
      await shareBlob(blob, `${entry.plate}.${ext}`, `تسجيل صوتي — ${entry.plate}`);
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت مشاركة المقطع الصوتي");
    }
  }

  async function handleDelete(localId: string) {
    await deleteRecording(localId);
    if (agentId) loadRecordings(agentId);
  }

  async function handleSync() {
    if (!agentId || !isOnline) return;
    await syncPending(agentId);
    loadRecordings(agentId);
  }

  async function handleNotesChange(localId: string, notes: string) {
    await updateNotes(localId, notes);
    setRecordings((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, notes } : r))
    );
  }

  function buildRows(recs: typeof recordings) {
    return recs
      .filter((r) => !r.plate.startsWith("📍"))
      .map((r) => {
        return {
          "رقم اللوحة": r.plate,
          "نوع السيارة": r.vehicleType ?? "",
          "الشارع": r.street ?? "",
          "الحي": r.district ?? "",
          "تاريخ التسجيل": formatDate(r.recordedAt),
          "GPS": r.mapsLink ?? "",
          "ملاحظات": r.notes ?? "",
        };
      });
  }

  async function handleExport(recs = recordings) {
    const rows = buildRows(recs);
    if (rows.length === 0) { alert("مفيش لوحات تتصدّر."); return; }
    // buildSpreadsheetBlob falls back to CSV if xlsx build fails on-device.
    const { blob, ext } = buildSpreadsheetBlob(rows, "اللوحات");
    const filename = `${excelName.trim() || defaultExcelName()}.${ext}`;
    try {
      await openExcelBlob(blob, filename);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    }
  }

  async function handleShareExcelFor(recs = recordings) {
    const rows = buildRows(recs);
    if (rows.length === 0) { alert("مفيش لوحات تتشارك."); return; }
    const { blob, ext } = buildSpreadsheetBlob(rows, "اللوحات");
    const filename = `${excelName.trim() || defaultExcelName()}.${ext}`;
    try {
      await shareBlob(blob, filename, "سجلات اللوحات");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت المشاركة");
    }
  }

  async function shareBlob(blob: Blob, filename: string, title: string) {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      // On native Android: write to cache then share via native intent. A
      // real failure here (FileProvider misconfigured, no share target,
      // plugin not registered in this APK build) must NOT be swallowed and
      // silently fall through to <a download>, which doesn't work inside a
      // Capacitor WebView either — that's exactly why the buttons using this
      // previously appeared to "do nothing" with no way to tell why.
      try {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const { uri } = await Filesystem.writeFile({ path: toSafeCacheFilename(filename), data: base64, directory: Directory.Cache });
        await Share.share({ title, url: uri, dialogTitle: "مشاركة الملف" });
      } catch (e: any) {
        if (e?.name === "AbortError" || /cancel/i.test(e?.message ?? "")) return; // user dismissed the sheet
        // Rethrow so the caller can surface it where the button is (alert),
        // instead of swallowing it into the top banner the user can't see.
        throw new Error(`تعذّرت المشاركة: ${e?.message ?? e}`);
      }
      return;
    }

    // Web fallback: navigator.share with file
    const nav = navigator as any;
    if (nav.share) {
      const file = new File([blob], filename, { type: blob.type });
      try {
        await nav.share({ files: [file], title });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }

    // Last resort: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleShareExcel() {
    await handleShareExcelFor(recordings);
  }

  // Extract + save the pending transcript's plates (no export side effect) —
  // shared by the "احفظ" button and the auto-flush guards in
  // startRecordingInner/handleUploadAudioFile. Those guards must NOT trigger
  // an Excel export: on native that opens/switches to a spreadsheet app,
  // which would fight the very "start a new recording" action they run in
  // front of. Returns ok:false only when there was a pending transcript that
  // couldn't be saved (nothing extracted) — callers use this to avoid
  // silently discarding the unresolved one.
  async function extractAndSaveTranscript(): Promise<{ ok: boolean; savedEntries: RecordingEntry[] }> {
    const transcript = pendingTranscript.trim();
    if (!transcript) return { ok: true, savedEntries: [] };

    const extracted = extractPlates(transcript);
    if (extracted.length === 0) {
      alert("لم يتم استخراج أي لوحة من التسجيل. جرّب تسجيل تاني أو أضف يدوياً.");
      return { ok: false, savedEntries: [] };
    }

    setPendingTranscript("");
    setIsTranscribing(true);
    const savedEntries = await savePlateList(extracted);
    setIsTranscribing(false);
    return { ok: true, savedEntries };
  }

  // "حفظ التسجيل" button → transcribe + save only. NO auto-open of Excel —
  // the delegate opens or shares from the buttons below if they want to.
  // No review gate — mistakes are fixed later by tapping the plate directly
  // in the table below.
  async function handleTranscribeAndSave(): Promise<boolean> {
    const { ok } = await extractAndSaveTranscript();
    return ok;
  }

  // "تجاهل" — explicitly discard a pending transcript that has nothing
  // extractable in it (Whisper completely misheard the recording). Without
  // this, a garbled transcript is a dead end: "احفظ" re-runs the same failed
  // extraction and re-shows the same alert every time, and the
  // start-a-new-recording guard in startRecordingInner requires this pending
  // transcript to be resolved first — so the agent would be stuck unable to
  // record again until they had some way to clear it.
  function discardPendingTranscript() {
    setPendingTranscript("");
    pendingAudioRef.current = null;
    setRecordingError(null);
  }

  // Transcribes a previously-recorded audio file picked from the device —
  // cloud-only (a local file has nothing for the on-device recognizer to
  // listen to live), so this requires a Groq key. A file under the limit
  // uploads directly; an oversized one is compressed (and, if still too
  // long after that, segmented) client-side via ffmpeg.wasm before upload —
  // see compressAndChunkAudioFile.
  // Base64 inflates raw bytes by 4/3, so 3MB raw would already land right at
  // ~4.0MB encoded — too close to Vercel's hard 4.5MB body cap once the JSON
  // wrapper is added. 2.5MB raw (~3.5MB encoded) leaves a real ~1MB margin.
  const MAX_UPLOAD_AUDIO_BYTES = 2.5 * 1024 * 1024;
  async function handleUploadAudioFile(file: File) {
    if (!groqApiKey.trim()) {
      setRecordingError("محتاج تحط مفتاح Groq الأول عشان ترفع مقطع صوتي جاهز.");
      return;
    }

    // Same reasoning as startRecordingInner — don't let an upload silently
    // clobber a still-unsaved earlier session's transcript/audio.
    if (pendingTranscript.trim()) {
      const { ok } = await extractAndSaveTranscript();
      if (!ok) {
        setRecordingError("فيه تسجيل سابق لسه محفوظش — تعامل معاه الأول (الكرت اللي فوق) قبل ما ترفع ملف جديد.");
        return;
      }
    }

    setRecordingError(null);
    setIsTranscribing(true);
    try {
      const uploadAll = (chunks: { base64: string; mimeType: string }[]) => {
        setDebugStatus(`⏳ جارٍ رفع ${chunks.length > 1 ? `${chunks.length} جزء` : "الملف"} لـ Groq…`);
        return Promise.allSettled(
          chunks.map((c) =>
            uploadGroqChunk({ value: { recordDataBase64: c.base64, mimeType: c.mimeType } }, groqApiKey.trim())
          )
        );
      };

      let settled: PromiseSettledResult<GroqChunkResult>[];
      if (file.size > MAX_UPLOAD_AUDIO_BYTES) {
        setDebugStatus(`⚠️ الملف كبير (${(file.size / 1024 / 1024).toFixed(1)} ميجا) — جارٍ ضغطه…`);
        const rawChunks = await compressAndChunkAudioFile(file, MAX_UPLOAD_AUDIO_BYTES, setDebugStatus);
        settled = await uploadAll(rawChunks);
      } else {
        // Try the file exactly as picked first — fast path, no ffmpeg.wasm
        // download, and correct for the common case of an already-compatible
        // recording. Some phones/browsers report a format Groq's API doesn't
        // recognize (a non-standard MIME label, or a codec Groq genuinely
        // doesn't support at all, e.g. AMR voice-memo files) — re-encoding
        // to AAC via ffmpeg.wasm fixes both, so fall back to that ONLY on
        // that specific failure, not on every failure (a bad key or network
        // drop retrying via re-encoding would just waste a 31MB download).
        const buffer = await file.arrayBuffer();
        const directChunk = { base64: uint8ToBase64(new Uint8Array(buffer)), mimeType: file.type || "audio/mp4" };
        settled = await uploadAll([directChunk]);

        const failure = settled[0].status === "rejected" ? (settled[0] as PromiseRejectedResult).reason : null;
        if (failure?.code === "unsupported_format") {
          setDebugStatus("⚠️ صيغة الملف مش مدعومة مباشرة — جارٍ تحويلها لصيغة مدعومة…");
          const rawChunks = await compressAndChunkAudioFile(file, MAX_UPLOAD_AUDIO_BYTES, setDebugStatus);
          settled = await uploadAll(rawChunks);
        }
      }

      const ok = settled.filter((s): s is PromiseFulfilledResult<GroqChunkResult> => s.status === "fulfilled").map((s) => s.value);
      const failedCount = settled.length - ok.length;
      const transcript = ok.map((c) => c.text).join(" ").trim();
      pendingAudioRef.current = assembleSessionAudio(ok);

      if (transcript) {
        setPendingTranscript(transcript);
        setDebugFinal(transcript);
        setDebugRaw(transcript);
        setDebugStatus(failedCount > 0 ? `⚠️ تم التفريغ (${failedCount} جزء فشل)` : "✅ تم تفريغ الملف المرفوع");
        if (failedCount > 0) {
          setRecordingError(`${failedCount} جزء من الملف فشل تفريغه — أي لوحات فيه اتفقدت.`);
        }
      } else {
        const firstFailure = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
        const reason = firstFailure ? String(firstFailure.reason?.message ?? firstFailure.reason) : "سبب غير معروف";
        setRecordingError(`فشل تفريغ الملف بالكامل — ${reason}`);
        setDebugStatus(`❌ ERROR: كل الأجزاء فشلت — ${reason}`);
      }
    } catch (err: any) {
      setRecordingError(`فشل تفريغ الملف: ${err?.message ?? err}`);
      setDebugStatus(`❌ ERROR: ${err?.message ?? err}`);
    } finally {
      setIsTranscribing(false);
    }
  }

  // Editing a plate directly in the table (post-save correction). Teaches
  // whichever learner fits the kind of mistake this was, persists the
  // learned map, updates storage, and re-checks the corrected plate against
  // the check file in case the fix reveals a match.
  async function handlePlateEdit(localId: string, newPlate: string) {
    const entry = recordings.find((r) => r.localId === localId);
    if (!entry) return;
    const trimmed = newPlate.trim();
    if (!trimmed || trimmed === entry.plate) return;

    // Only voice-dictated entries carry a meaningful "heard" value — a manual
    // entry's plate was typed, so editing it later is a typo fix, not a
    // mishearing signal, and must not teach either learner.
    //
    // Branch on rawLetterSource FIRST, not on entry.uncertain: updatePlate()
    // below unconditionally clears uncertain on every edit, but never touches
    // rawLetterSource. Gating on uncertain would mean a SECOND edit of an
    // already-corrected entry falls through to the letter-confusion branch
    // using a now-stale originalPlate — silently dropping the correction (if
    // digits differ) or, worse, diffing a whole wrong 3-letter guess against
    // the new fix position-by-position and fabricating bogus single-letter
    // rules. rawLetterSource reflects which learner model actually fits this
    // entry's mistake shape and doesn't change across edits, so it's checked
    // independent of the entry's current uncertain value.
    if (!entry.isManual && entry.rawLetterSource) {
      // An uncertain extraction (garbled-word salvage or letter-overflow
      // guess): the WHOLE letter group was likely wrong, not one letter
      // drifting — diffing position-by-position would teach individually
      // wrong single-letter rules, so learn the whole raw fragment instead.
      const correctedLetters = trimmed.replace(/\d+$/, "");
      if (correctedLetters) {
        recordWordBlend(wordBlendRef.current, entry.rawLetterSource, correctedLetters);
        try {
          localStorage.setItem(LS_WORD_BLENDS, JSON.stringify(serializeWordBlend(wordBlendRef.current)));
        } catch { /* storage full */ }
      }
    } else if (!entry.isManual && !entry.uncertain) {
      // A confident extraction that still needed a fix: one letter drifted
      // (a heard letter substituted for the actual one) — the per-letter
      // confusion learner fits this.
      recordLetterCorrections(letterConfusionsRef.current, entry.originalPlate ?? entry.plate, trimmed);
      try {
        localStorage.setItem(LS_LETTER_CONFUSIONS, JSON.stringify(serializeLetterConfusions(letterConfusionsRef.current)));
      } catch { /* storage full */ }
    }

    await updatePlate(localId, trimmed);
    if (!agentId) return;
    const updated = await getAllRecordings(agentId);
    setRecordings(updated);
    setDuplicates(findDuplicates(updated.map((r) => r.plate)));
    const updatedEntry = updated.find((r) => r.localId === localId);
    if (updatedEntry) checkPlateMatch(trimmed, updatedEntry);
  }

  async function handleFieldEdit(localId: string, field: "vehicleType" | "notes", value: string) {
    await updateRecordingField(localId, field, value);
    if (!agentId) return;
    const updated = await getAllRecordings(agentId);
    setRecordings(updated);
  }

  // Push the given recordings onto شيت التسجيلات (field_check) — the same sheet
  // the التشييك «السجلات» tab shows and the sort reads from. Scoped to the
  // section's own recordings (manual button → manual, voice button → voice).
  async function exportToTashyeek(recs: RecordingEntry[]) {
    if (recs.length === 0) {
      alert("مفيش تسجيلات للتصدير.");
      return;
    }
    try {
      const stamp = Date.now();
      let n = 0;
      for (const r of recs) {
        const row: Record<string, string> = {};
        if (r.vehicleType) row["النوع"] = r.vehicleType;
        if (r.district) row["الحي"] = r.district;
        if (r.street) row["الشارع"] = r.street;
        if (r.notes) row["ملاحظات"] = r.notes;
        const entry: FieldCheckEntry = {
          id: `reg-${stamp}-${n++}`,
          plate: r.plate,
          row,
          method: r.isManual ? "متشيكة يدوي" : "متشيكة بالصوت",
          lat: r.lat,
          lng: r.lng,
          mapsLink: r.mapsLink ?? (r.lat && r.lng ? toMapsLink(r.lat, r.lng) : undefined),
          checkedAt: r.recordedAt,
        };
        await saveFieldCheckEntry(entry);
      }
      alert(`✅ تم تصدير ${n} لوحة لشيت التسجيلات.\nهتلاقيهم في تبويب «السجلات» بصفحة التشييك، والفرز هيطابقهم تلقائياً.`);
    } catch (err: any) {
      alert(`تعذّر التصدير للتشييك: ${err?.message ?? err}`);
    }
  }

  function dupClass(plate: string): string {
    if (duplicates.has(plate.replace(/\s/g, "").toLowerCase())) {
      return "border-alert bg-alert/10";
    }
    return "border-border bg-surface";
  }

  const pendingCount = recordings.filter((r) => !r.synced).length;
  const exportableCount = recordings.filter((r) => !r.plate.startsWith("📍")).length;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Match modal */}
      {matchedPlates.length > 0 && (
        <MatchModal matches={matchedPlates} onClose={() => setMatchedPlates([])} />
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink">التسجيل</h1>
          <p className="text-xs text-muted">{recordings.length} سجل</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isOnline ? (
            <span className="flex items-center gap-1 text-xs text-primary">
              <Wifi size={13} /> متصل
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-alert">
              <WifiOff size={13} /> غير متصل
            </span>
          )}
          {pendingCount > 0 && (
            <button
              onClick={handleSync}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary"
            >
              <RefreshCw size={11} />
              {pendingCount} معلّق
            </button>
          )}
        </div>
      </div>

      {/* Check file */}
      <div className="flex flex-col gap-2">
        <FileUploadBox
          title="ملف التشييك"
          hint="القائمة المرجعية للمطابقة"
          parsedFile={checkFile}
          parsedRowCount={checkPlates.size || null}
          onParsed={handleCheckFile}
          onClear={handleDeleteCheck}
          showReplaceButtons
        />
        {checkHeaders.length > 0 && (
          <div className="mt-2 rounded-xl border border-border bg-surface">
            <button
              onClick={() => setCheckColsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink"
            >
              <span>الأعمدة ({checkHeaders.length})</span>
              <ChevronDown
                size={14}
                className={`text-muted transition-transform duration-200 ${checkColsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {checkColsOpen && (
              <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted shrink-0">عمود البحث:</span>
                  <span className="rounded-full border border-primary bg-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
                    {checkPlateCol ?? "—"}
                  </span>
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] text-muted">الأعمدة — اضغط لتفعيل/إيقاف:</p>
                  <div className="flex flex-wrap gap-2">
                    {checkHeaders.filter((h) => h !== checkPlateCol).map((h) => (
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

      {/* GPS status */}
      <div className="flex flex-col gap-1.5">
        <button onClick={() => setGpsBoxOpen((v) => !v)} className="flex items-center gap-2 self-start text-xs font-bold text-ink">
          حالة الـ GPS
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${gps ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"}`}>
            {gps ? <><Wifi size={11} /> متصل</> : <><WifiOff size={11} /> غير متصل</>}
          </span>
          <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${gpsBoxOpen ? "rotate-180" : ""}`} />
        </button>
        {gpsBoxOpen && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${gps ? "border-border bg-surface" : "border-danger/50 bg-danger/5"}`}>
            <MapPin size={16} className={gps ? "text-primary" : "text-danger"} />
            <div className="flex-1 min-w-0">
              <p className={`truncate text-sm ${gps ? "text-ink" : "text-danger font-bold"}`}>
                {gps ? gpsAddress : "الموقع مش متقري — دوس تحديث"}
              </p>
              {gps && (
                <p className="text-xs text-muted">
                  {gps.lat.toFixed(5)}°N, {gps.lng.toFixed(5)}°E • ±{Math.round(gps.accuracy)}م
                </p>
              )}
            </div>
            <button onClick={refreshGps} disabled={gpsRefreshing} title="تحديث الموقع"
              className={`shrink-0 rounded-lg border p-1.5 transition disabled:opacity-50 ${gps ? "border-border text-muted hover:text-primary" : "border-danger/50 text-danger hover:bg-danger/10"}`}>
              <RefreshCw size={15} className={gpsRefreshing ? "animate-spin" : ""} />
            </button>
          </div>
        )}
      </div>

      {/* Session fields: recorder name / district / excel export name */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-muted" dir="rtl">اسم المسجّل</label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={recorderName}
              onChange={(e) => handleRecorderNameChange(e.target.value)}
              placeholder="اسمك"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
              dir="rtl"
            />
            <button
              type="button"
              onClick={clearRecorderName}
              aria-label="مسح اسم المسجّل"
              className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-danger hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-muted" dir="rtl">الحي</label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={manualDistrict}
              onChange={(e) => handleDistrictChange(e.target.value)}
              placeholder="اسم الحي (اختياري)"
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
              dir="rtl"
            />
            <button
              type="button"
              onClick={clearDistrict}
              aria-label="مسح الحي"
              className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-danger hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-muted" dir="rtl">اسم ملف الإكسيل</label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={excelName}
              onChange={(e) => handleExcelNameChange(e.target.value)}
              placeholder={defaultExcelName()}
              className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary"
              dir="rtl"
            />
            <button
              type="button"
              onClick={clearExcelName}
              aria-label="مسح اسم ملف الإكسيل"
              className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-danger hover:text-danger"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Main record button */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface py-6">
        {!groqApiKey.trim() ? (
          // إجبار: مايقدرش يسجّل صوت من غير مفتاح Groq الخاص بيه.
          <div className="flex w-full flex-col items-center gap-3 px-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface-2 opacity-60">
              <Mic size={36} className="text-muted" />
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-center text-sm text-danger">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span dir="rtl">لازم تدخل <b>مفتاح Groq الخاص بيك</b> عشان تسجّل بالصوت — منعتمدش كلنا على مفتاح واحد.</span>
            </div>
            <Link href="/groq"
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-night transition active:scale-95">
              <KeyRound size={16} /> أدخل مفتاح Groq
            </Link>
          </div>
        ) : (
          <>
            <button
              onClick={() => isRecording ? stopRecording() : startRecording()}
              disabled={isTranscribing}
              className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-150 select-none
                ${isRecording
                  ? "bg-danger shadow-[0_0_32px_rgba(239,68,68,0.6)] scale-110"
                  : isTranscribing
                  ? "bg-surface-2 cursor-wait"
                  : "bg-brand shadow-brand-glow active:scale-95"
                }`}
            >
              {isRecording ? (
                <MicOff size={36} className="text-white" />
              ) : isTranscribing ? (
                <RefreshCw size={32} className="animate-spin text-muted" />
              ) : (
                <Mic size={36} className="text-night" />
              )}
              {isRecording && (
                <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-danger animate-pulse" />
              )}
            </button>

            {(isRecording || isTranscribing) && liveTranscript && (
              <div className="mx-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2 text-center text-sm text-ink" dir="rtl">
                {liveTranscript}
              </div>
            )}

            <p className="text-sm text-muted">
              {isRecording
                ? "جارٍ التسجيل... اضغط مرة ثانية للإيقاف"
                : isTranscribing
                ? "جارٍ معالجة الصوت..."
                : "اضغط للتسجيل"}
            </p>
          </>
        )}

        {recordingError && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle size={15} />
            {recordingError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={handlePin}
            className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary"
          >
            <MapPin size={16} />
            دبوس يدوي
            {pinCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-night">
                {pinCount}
              </span>
            )}
          </button>

          {groqApiKey.trim() && (
            <>
              <input
                ref={audioFileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // allow re-selecting the same file later
                  if (file) handleUploadAudioFile(file);
                }}
              />
              <button
                onClick={() => audioFileInputRef.current?.click()}
                disabled={isRecording || isTranscribing}
                className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <Upload size={16} />
                رفع مقطع صوتي
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── جاهز للتفريغ: النص الخام + زر يحفظ اللوحات فورًا (بدون مراجعة إجبارية) ── */}
      {pendingTranscript.trim() && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-4">
          <p className="mb-2 text-sm font-bold text-ink" dir="rtl">جاهز للتفريغ</p>
          <p className="mb-3 text-sm text-muted" dir="rtl">{pendingTranscript}</p>
          <div className="flex gap-2">
            <button
              onClick={handleTranscribeAndSave}
              disabled={isTranscribing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-40"
            >
              <Check size={16} /> فرّغ واحفظ اللوحات
            </button>
            <button
              onClick={discardPendingTranscript}
              disabled={isTranscribing}
              title="تجاهل هذا التسجيل — لو مفيش فيه لوحة أصلاً"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-bold text-muted transition hover:border-danger hover:text-danger disabled:opacity-40"
            >
              <X size={16} /> تجاهل
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted" dir="rtl">
            هتتحفظ فورًا بأفضل تخمين — لو حرف غلط، اضغط عليه في الجدول تحت وصحّحه في أي وقت. لو التسجيل مفهوش لوحة أصلاً، دوس "تجاهل".
          </p>
        </div>
      )}

      {/* ── جدول التسجيلات الصوتية ── */}
      {(() => {
        const voiceRecs = recordings.filter((r) => !r.isManual);
        if (voiceRecs.length === 0 && !isTranscribing) return null;
        return (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-ink" dir="rtl">التسجيلات الصوتية ({voiceRecs.length})</p>
            {isTranscribing && (
              <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3" dir="rtl">
                <RefreshCw size={15} className="animate-spin shrink-0 text-brand" />
                <span className="text-sm text-brand">جارٍ معالجة اللوحة...</span>
              </div>
            )}
            {voiceRecs.length > 0 && (
              <RecordingsTable
                recordings={voiceRecs}
                onDelete={handleDelete}
                onDeleteMany={async (ids) => { for (const id of ids) await handleDelete(id); }}
                onUpdatePlate={handlePlateEdit}
              onUpdateField={handleFieldEdit}
                onPlayAudio={togglePlay}
                onShareAudio={shareAudio}
                playingId={playingId}
                checkPlates={checkPlates}
              />
            )}
          </div>
        );
      })()}

      {/* ── أزرار Excel والمشاركة (صوتي فقط) ── */}
      {(() => {
        const voiceOnly = recordings.filter((r) => !r.isManual && !r.plate.startsWith("📍"));
        if (voiceOnly.length === 0) return null;
        return (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => handleShareExcelFor(voiceOnly)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90"
              >
                <Share2 size={16} /> مشاركة Excel
              </button>
              <button
                onClick={() => handleExport(voiceOnly)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary"
              >
                <Download size={16} /> فتح في Excel
              </button>
            </div>
            <button
              onClick={() => exportToTashyeek(voiceOnly)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 py-3 text-sm font-bold text-primary transition hover:bg-primary/20"
            >
              <Download size={16} /> تصدير للتشييك
            </button>
          </div>
        );
      })()}

      {/* Debug Panel */}
      <div className="rounded-xl border border-border bg-surface">
        <button
          onClick={() => setDebugVisible((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-xs font-bold text-muted hover:text-ink transition"
        >
          <span>🛠 Debug Panel (تشخيص التفريغ الصوتي)</span>
          <span>{debugVisible ? "▲ إخفاء" : "▼ إظهار"}</span>
        </button>
        {debugVisible && (
          <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3" dir="rtl">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">0 — SR Status (حالة التعرف الصوتي)</p>
              <pre className={`whitespace-pre-wrap break-all rounded-lg px-3 py-2 text-xs font-mono ${
                debugStatus.startsWith("✅") || debugStatus.startsWith("🔄") ? "bg-primary/10 text-primary" :
                debugStatus.startsWith("❌") ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted"
              }`}>
                {debugStatus || "(لم يبدأ بعد)"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">1 — Raw Transcript (النص الخام)</p>
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink font-mono">
                {debugRaw || "(لم يبدأ التسجيل بعد)"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">2 — Original Transcript (النص الأصلي من SR)</p>
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink font-mono" dir="rtl">
                {debugFinal || "(لم ينته التسجيل بعد)"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">3 — Normalized Transcript (بعد التطبيع)</p>
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-ink font-mono" dir="rtl">
                {debugNormalized || "(لم يُطبَّع بعد)"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">4 — Plate Parsing Result (رقم اللوحة)</p>
              <pre className={`whitespace-pre-wrap break-all rounded-lg px-3 py-2 text-xs font-mono ${
                debugPlate && !debugPlate.startsWith("(") ? "bg-primary/10 text-primary font-bold" : "bg-surface-2 text-alert"
              }`}>
                {debugPlate || "(لم يُنفَّذ بعد)"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">5 — Vehicle Type Result (نوع السيارة)</p>
              <pre className={`whitespace-pre-wrap break-all rounded-lg px-3 py-2 text-xs font-mono ${
                debugVehicle && !debugVehicle.startsWith("(") ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted"
              }`}>
                {debugVehicle || "(لم يُنفَّذ بعد)"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">6 — Notes Result (الملاحظات المتبقية)</p>
              <pre className="whitespace-pre-wrap break-all rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted font-mono">
                {debugNotes || "(لم يُنفَّذ بعد)"}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* ── جدول اللوحات المطلوبة (المطابقة مع ملف التشييك) ── */}
      {(() => {
        const matchedRecs = recordings.filter((r) => matchedIds.has(r.localId));
        return matchedRecs.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-brand">اللوحات المطلوبة ({matchedRecs.length})</p>
            <RecordingsTable
              recordings={matchedRecs}
              onDelete={handleDelete}
              onDeleteMany={async (ids) => { for (const id of ids) await handleDelete(id); }}
              onUpdatePlate={handlePlateEdit}
              onUpdateField={handleFieldEdit}
              onPlayAudio={togglePlay}
              onShareAudio={shareAudio}
              playingId={playingId}
              checkPlates={checkPlates}
            />
            <div className="flex gap-2">
              <button onClick={async () => {
                try {
                  const { blob, ext } = buildSpreadsheetBlob(
                    matchedRecs.map((r) => ({ "رقم اللوحة": r.plate, "الشارع": r.street ?? "", "الحي": r.district ?? "", "GPS": r.mapsLink ?? "" })),
                    "المطلوبة"
                  );
                  await shareBlob(blob, `مطلوبة-${new Date().toISOString().slice(0,10)}.${ext}`, "اللوحات المطلوبة");
                } catch (err: any) {
                  alert(err?.message ?? "تعذّرت المشاركة");
                }
              }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90">
                <Share2 size={16} /> مشاركة المطلوبة
              </button>
            </div>
          </div>
        ) : null;
      })()}

      {/* Manual plate entry */}
      <div className="rounded-2xl border border-border bg-surface px-4 py-4">
        <p className="mb-3 text-sm font-bold text-ink" dir="rtl">إدخال يدوي للوحة</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="text"
            placeholder="مثال: ق ن ص 1 2 3 4"
            value={manualInput}
            onChange={(e) => handleManualChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSave()}
            className={`flex-1 rounded-xl border bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-muted focus:outline-none ${
              manualError ? "border-danger focus:border-danger" : "border-border focus:border-primary"
            }`}
            dir="rtl"
          />
          <button
            onClick={handleManualSave}
            disabled={!manualInput.trim() || !!manualError}
            className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-night transition disabled:opacity-40 active:scale-95"
          >
            حفظ
          </button>
        </div>


        {/* Error with dismiss button */}
        {manualError && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-danger/10 px-3 py-2">
            <p className="text-xs text-danger">{manualError}</p>
            <button onClick={dismissManualError} className="shrink-0 text-danger hover:text-danger/70 transition">
              <X size={14} />
            </button>
          </div>
        )}

        <p className="mt-2 text-xs text-muted" dir="rtl">
          يدعم الحروف العربية والإنجليزية (A→ا، B→ب، G→ق، ...)
        </p>
      </div>

      {/* ── جدول الإدخال اليدوي ── */}
      {(() => {
        const manualRecs = recordings.filter((r) => r.isManual);
        return manualRecs.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-ink">الإدخال اليدوي</p>
            <RecordingsTable
              recordings={manualRecs}
              onDelete={handleDelete}
              onDeleteMany={async (ids) => { for (const id of ids) await handleDelete(id); }}
              onUpdatePlate={handlePlateEdit}
              onUpdateField={handleFieldEdit}
              checkPlates={checkPlates}
            />
            <div className="flex gap-2">
              <button onClick={() => handleShareExcelFor(manualRecs)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90">
                <Share2 size={16} /> مشاركة Excel
              </button>
              <button onClick={() => handleExport(manualRecs)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary">
                <Download size={16} /> فتح في Excel
              </button>
            </div>
            <button
              onClick={() => exportToTashyeek(manualRecs)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary bg-primary/10 py-3 text-sm font-bold text-primary transition hover:bg-primary/20"
            >
              <Download size={16} /> تصدير للتشييك
            </button>
          </div>
        ) : null;
      })()}

      {recordings.filter((r) => !r.isManual && !matchedIds.has(r.localId)).length === 0 &&
       recordings.filter((r) => r.isManual).length === 0 &&
       !isTranscribing && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Mic size={32} className="text-muted/40" />
          <p className="text-sm text-muted">
            لا توجد سجلات بعد.
            <br />
            اضغط على الزر واتكلم لتسجيل لوحة.
          </p>
        </div>
      )}

      {/* PIN gate for the Groq key — reveal/clear both need it; a key saved
          with no PIN yet (mid-setup app close) forces setup again on load. */}
      {pinPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" dir="rtl">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
            {pinPrompt.mode === "setup" && (
              <>
                <p className="mb-1 text-sm font-bold text-ink">
                  {groqPinHash ? "رقم سري جديد لمفتاح Groq" : "أنشئ رقم سري لحماية مفتاح Groq"}
                </p>
                <p className="mb-3 text-xs text-muted">
                  هتحتاج الرقم ده كل مرة تحب تشوف المفتاح أو تمسحه — عشان محدش يقدر يشوفه أو يحذفه غيرك لو حد ثاني ماسك الموبايل.
                </p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input
                    type={showPinInput ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="رقم سري (4-6 أرقام)"
                    autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-widest text-ink focus:outline-none focus:border-primary"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinInput((v) => !v)}
                    aria-label={showPinInput ? "إخفاء الرقم" : "إظهار الرقم"}
                    className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary"
                  >
                    {showPinInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <input
                  type={showPinInput ? "text" : "password"}
                  inputMode="numeric"
                  maxLength={6}
                  value={pinConfirmInput}
                  onChange={(e) => setPinConfirmInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="أعد كتابة الرقم"
                  className="mb-3 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-widest text-ink focus:outline-none focus:border-primary"
                  dir="ltr"
                  onKeyDown={(e) => { if (e.key === "Enter") submitPinSetup(); }}
                />
                {pinFlowError && <p className="mb-2 text-xs text-danger">{pinFlowError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitPinSetup} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition hover:bg-brand/90">
                    حفظ الرقم السري
                  </button>
                  <button onClick={cancelPinPrompt} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-ink">
                    لاحقاً
                  </button>
                </div>
              </>
            )}

            {pinPrompt.mode === "verify" && (
              <>
                <p className="mb-3 text-sm font-bold text-ink">أدخل الرقم السري</p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input
                    type={showPinInput ? "text" : "password"}
                    inputMode="numeric"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="الرقم السري"
                    autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-center text-lg tracking-widest text-ink focus:outline-none focus:border-primary"
                    dir="ltr"
                    onKeyDown={(e) => { if (e.key === "Enter") submitPinVerify(); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinInput((v) => !v)}
                    aria-label={showPinInput ? "إخفاء الرقم" : "إظهار الرقم"}
                    className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary"
                  >
                    {showPinInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {pinFlowError && <p className="mb-2 text-xs text-danger">{pinFlowError}</p>}
                <div className="flex gap-2">
                  <button onClick={submitPinVerify} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition hover:bg-brand/90">
                    تأكيد
                  </button>
                  <button onClick={cancelPinPrompt} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-ink">
                    إلغاء
                  </button>
                </div>
                <button
                  onClick={() => { setPinFlowError(null); setPinInput(""); setShowPinInput(false); setPinPrompt((prev) => prev && { ...prev, mode: "forgot" }); }}
                  className="mt-3 w-full text-center text-xs text-primary underline"
                >
                  نسيت الرقم السري؟
                </button>
              </>
            )}

            {pinPrompt.mode === "forgot" && (
              <>
                <p className="mb-1 text-sm font-bold text-ink">تأكيد الهوية</p>
                <p className="mb-3 text-xs text-muted">
                  أدخل كلمة سر حسابك (نفس اللي بتسجّل بيها دخول) عشان تقدر تعمل رقم سري جديد.
                </p>
                <div className="mb-2 flex items-center gap-1.5">
                  <input
                    type={showPinInput ? "text" : "password"}
                    value={forgotPasswordInput}
                    onChange={(e) => setForgotPasswordInput(e.target.value)}
                    placeholder="كلمة سر الحساب"
                    autoFocus
                    className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:border-primary"
                    dir="ltr"
                    onKeyDown={(e) => { if (e.key === "Enter") submitForgotPassword(); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinInput((v) => !v)}
                    aria-label={showPinInput ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
                    className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition hover:border-primary hover:text-primary"
                  >
                    {showPinInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {pinFlowError && <p className="mb-2 text-xs text-danger">{pinFlowError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={submitForgotPassword}
                    disabled={pinFlowBusy}
                    className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-50"
                  >
                    {pinFlowBusy ? "جارٍ التحقق..." : "تأكيد"}
                  </button>
                  <button onClick={cancelPinPrompt} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted transition hover:text-ink">
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

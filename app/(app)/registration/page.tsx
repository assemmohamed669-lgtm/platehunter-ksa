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
  Play,
  Pause,
} from "lucide-react";
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
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  type RecordingEntry,
} from "@/lib/idb";
import { parsePlateFromTranscript, extractMultiplePlates, findDuplicates, normalizePlate, bankPlateToArabic, detectPlateColumn, EN_TO_AR } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import { syncPending, registerOnlineSync } from "@/lib/sync";
import { supabase } from "@/lib/supabaseClient";
import { exportRecordingsToExcel, parseExcelFile, buildExcelBlob, openExcelBlob, type ExcelTable } from "@/lib/excel";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

const INVALID_AR_LETTERS_SET = new Set(["ت","ث","ج","خ","ذ","ز","ش","ض","ظ","غ","ف"]);

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

function defaultExcelName(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `اكسيل-${dd}-${mm}-${yyyy}`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function audioExtensionFor(mimeType: string): string {
  if (mimeType.includes("aac") || mimeType.includes("m4a") || mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  return "audio";
}

function formatSeconds(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
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
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("جارٍ تحديد الموقع...");
  const [isOnline, setIsOnline] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>("");

  // Last recorded audio clip (review panel under the record button)
  const [lastRecording, setLastRecording] = useState<{ base64: string; mimeType: string } | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string>("");
  const [reviewIsPlaying, setReviewIsPlaying] = useState(false);
  const [reviewSpeed, setReviewSpeed] = useState<number>(1);
  const [reviewCurrentTime, setReviewCurrentTime] = useState(0);
  const [reviewDuration, setReviewDuration] = useState(0);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const gpsAtRecordRef = useRef<GpsCoords | null>(null);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef<string>("");
  const liveTranscriptRef  = useRef<string>("");
  const isRecordingRef     = useRef<boolean>(false); // ref so onend auto-restart sees current state

  // SR status for debug
  const [debugStatus, setDebugStatus] = useState("");
  const [debugVoiceRecorder, setDebugVoiceRecorder] = useState("");

  // ── Bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const uid = data.user.id;
        setAgentId(uid);
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
    setRecordingError(null);
    setLiveTranscript("");
    setDebugStatus("");
    setDebugVoiceRecorder("");
    finalTranscriptRef.current = "";
    liveTranscriptRef.current  = "";

    // ── Native Android: Capacitor Speech Recognition ──────────────────
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { SpeechRecognition } = await import("@capacitor-community/speech-recognition") as any;
        const { VoiceRecorder } = await import("capacitor-voice-recorder");

        setIsRecording(true);
        isRecordingRef.current = true;
        gpsAtRecordRef.current = gpsService.getLastCoords();
        chunksRef.current = [];
        setDebugStatus("✅ STARTED (Native)");

        await SpeechRecognition.requestPermissions();

        // Record the real audio clip in parallel with live speech-to-text,
        // so the user can listen back / share / save it afterwards.
        let voiceRecorderStarted = false;
        try {
          const canRecord = await VoiceRecorder.canDeviceVoiceRecord();
          setDebugVoiceRecorder(`canDeviceVoiceRecord: ${JSON.stringify(canRecord)}`);
          const perm = await VoiceRecorder.requestAudioRecordingPermission();
          setDebugVoiceRecorder((prev) => `${prev} | permission: ${JSON.stringify(perm)}`);
          await VoiceRecorder.startRecording();
          voiceRecorderStarted = true;
          setDebugVoiceRecorder((prev) => `${prev} | ✅ startRecording OK`);
        } catch (err: any) {
          console.warn("Voice recorder unavailable:", err);
          setDebugVoiceRecorder((prev) => `${prev} | ❌ ${err?.message ?? JSON.stringify(err)}`);
        }

        // Auto-restart loop — keeps listening until user taps stop.
        // Native speech recognizers throw on every brief silence/no-match/timeout
        // between utterances — that must NOT end the session, only an explicit stop should.
        while (isRecordingRef.current) {
          try {
            const result = await SpeechRecognition.start({
              language: "ar-SA",
              maxResults: 1,
              partialResults: false,
              popup: false,
            });
            const text: string = result?.matches?.[0] ?? "";
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

        let audioResult: { base64: string; mimeType: string } | undefined;
        if (voiceRecorderStarted) {
          try {
            const rec = await VoiceRecorder.stopRecording();
            if (rec.value?.recordDataBase64) {
              audioResult = {
                base64: rec.value.recordDataBase64,
                mimeType: rec.value.mimeType || "audio/aac",
              };
              setDebugVoiceRecorder((prev) => `${prev} | ✅ stopRecording: ${audioResult!.base64.length} bytes b64, ${audioResult!.mimeType}`);
            } else {
              setDebugVoiceRecorder((prev) => `${prev} | ⚠️ stopRecording returned no recordDataBase64: ${JSON.stringify(rec.value)}`);
            }
          } catch (err: any) {
            console.warn("Voice recorder stop failed:", err);
            setDebugVoiceRecorder((prev) => `${prev} | ❌ stop failed: ${err?.message ?? JSON.stringify(err)}`);
          }
        } else {
          setDebugVoiceRecorder((prev) => `${prev} | (voiceRecorderStarted=false, لم يتم استدعاء stopRecording)`);
        }
        // Show the review panel regardless of whether speech-to-text found a plate —
        // the raw audio is still useful to listen back to. Nothing gets extracted/saved
        // until the user presses "ابدأ التفريغ" themselves.
        if (audioResult) setLastRecording(audioResult);

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
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { setDebugStatus("✅ STARTED"); };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) { final += result[0].transcript + " "; }
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
    chunksRef.current = [];
    isRecordingRef.current = true;

    // Record the real audio clip in parallel (best-effort — mic access may be denied).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setDebugVoiceRecorder("✅ MediaRecorder started");
    } catch (err: any) {
      console.warn("Mic recording unavailable:", err);
      setDebugVoiceRecorder(`❌ getUserMedia failed: ${err?.message ?? JSON.stringify(err)}`);
    }

    recognition.start();
    setIsRecording(true);
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecordingRef.current = false;
    setIsRecording(false);

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

    let audioResult: { base64: string; mimeType: string } | undefined;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.stop();
      await stopped;
      recorder.stream.getTracks().forEach((t) => t.stop());
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size > 100) {
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          audioResult = { base64, mimeType: "audio/webm" };
          setDebugVoiceRecorder((prev) => `${prev} | ✅ captured ${base64.length} bytes b64`);
        } else {
          setDebugVoiceRecorder((prev) => `${prev} | ⚠️ blob too small (${blob.size} bytes)`);
        }
      } else {
        setDebugVoiceRecorder((prev) => `${prev} | ⚠️ no chunks recorded`);
      }
    }
    await new Promise((r) => setTimeout(r, 400));

    // Show the review panel regardless of whether speech-to-text found a plate —
    // the raw audio is still useful to listen back to. Nothing gets extracted/saved
    // until the user presses "ابدأ التفريغ" themselves.
    if (audioResult) setLastRecording(audioResult);

    const transcript = finalTranscriptRef.current.trim();
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    finalTranscriptRef.current = "";
    setPendingTranscript(transcript);
    setDebugFinal(transcript || "(فارغ)");
  }

  async function saveTranscript(
    transcript: string,
    audio?: { base64: string; mimeType: string }
  ): Promise<RecordingEntry[]> {
    if (!agentId) return [];

    if (audio) setLastRecording(audio);

    setDebugFinal(transcript);
    setDebugNormalized("");
    setDebugPlate("جارٍ الاستخراج...");
    setDebugVehicle("");
    setDebugNotes("");

    // استخرج كل اللوحات من التسجيل (مهما كان عددها)
    let plates = extractMultiplePlates(transcript);

    // Fallback: لو ما أنتجت لوحة → جرب parsePlateFromTranscript
    if (plates.length === 0) {
      const parsed = parsePlateFromTranscript(transcript);
      if (parsed.plate) {
        plates = [{ plate: parsed.plate, vehicleType: parsed.vehicleType, notes: parsed.notes, normalized: parsed.normalized }];
      }
    }

    if (plates.length === 0) {
      setDebugPlate("(لم يُستخرج)");
      setDebugNotes("(لا توجد لوحات)");
      return [];
    }

    setDebugPlate(plates.map((p) => p.plate).join(" | "));
    setDebugVehicle(plates.map((p) => p.vehicleType || "—").join(" | "));
    setDebugNotes(plates.map((p) => p.notes || "—").join(" | "));

    const base64 = audio?.base64 ?? "";

    const coords = gpsAtRecordRef.current;
    const savedIds: string[] = [];
    const savedEntries: RecordingEntry[] = [];

    for (const { plate, vehicleType, notes } of plates) {
      const localId = uid();
      savedIds.push(localId);
      const entry: RecordingEntry = {
        localId,
        agentId,
        plate,
        vehicleType,
        notes: notes || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        recordedAt: new Date().toISOString(),
        audioBlobBase64: base64 || undefined,
        mapsLink: coords ? toMapsLink(coords.lat, coords.lng) : undefined,
        recorderName,
        district: manualDistrict.trim() || undefined,
        synced: false,
      };
      await saveRecording(entry);
      savedEntries.push(entry);
      if (!coords) checkPlateMatch(plate, entry);
    }

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
    const blob = new Blob([bytes], { type: "audio/webm" });
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
          "تاريخ التسجيل": r.recordedAt,
          "GPS": r.mapsLink ?? "",
          "ملاحظات": r.notes ?? "",
        };
      });
  }

  async function handleExport(recs = recordings) {
    const filename = `${excelName.trim() || defaultExcelName()}.xlsx`;
    const rows = buildRows(recs);
    if (rows.length === 0) return;
    const blob = buildExcelBlob(rows, "اللوحات");
    await openExcelBlob(blob, filename);
  }

  async function handleShareExcelFor(recs = recordings) {
    const filename = `${excelName.trim() || defaultExcelName()}.xlsx`;
    const rows = buildRows(recs);
    if (rows.length === 0) return;
    const blob = buildExcelBlob(rows, "اللوحات");
    await shareBlob(blob, filename, "سجلات اللوحات");
  }

  async function shareBlob(blob: Blob, filename: string, title: string) {
    // On native Android: write to cache then share via native intent
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
        await Share.share({ title, url: uri, dialogTitle: "مشاركة الملف" });
        return;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
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

  // ── Last recording review panel ──────────────────────────────────────
  function toggleReviewPlay() {
    const audio = reviewAudioRef.current;
    if (!audio) return;
    if (reviewIsPlaying) {
      audio.pause();
      setReviewIsPlaying(false);
    } else {
      audio.playbackRate = reviewSpeed;
      audio.play();
      setReviewIsPlaying(true);
    }
  }

  function setReviewSeek(t: number) {
    if (reviewAudioRef.current) reviewAudioRef.current.currentTime = t;
    setReviewCurrentTime(t);
  }

  function setReviewPlaybackSpeed(speed: number) {
    setReviewSpeed(speed);
    if (reviewAudioRef.current) reviewAudioRef.current.playbackRate = speed;
  }

  async function handleShareLastRecording() {
    if (!lastRecording) return;
    const ext = audioExtensionFor(lastRecording.mimeType);
    const blob = base64ToBlob(lastRecording.base64, lastRecording.mimeType);
    await shareBlob(blob, `تسجيل-${defaultExcelName()}.${ext}`, "مقطع صوتي");
  }

  async function handleSaveLastRecording() {
    if (!lastRecording) return;
    const ext = audioExtensionFor(lastRecording.mimeType);
    const filename = `تسجيل-${defaultExcelName()}-${Date.now()}.${ext}`;

    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        await Filesystem.writeFile({ path: filename, data: lastRecording.base64, directory: Directory.Documents });
        alert(`✅ اتحفظ في مجلد المستندات باسم ${filename}`);
        return;
      }
    } catch (err) {
      console.warn("Native save failed, falling back to browser download:", err);
    }

    // Web fallback: trigger browser download
    const blob = base64ToBlob(lastRecording.base64, lastRecording.mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleStartTranscriptionExcel() {
    const transcript = pendingTranscript.trim();
    if (!transcript) return;
    setIsTranscribing(true);
    const savedEntries = await saveTranscript(transcript, lastRecording ?? undefined);
    setIsTranscribing(false);
    setPendingTranscript(""); // prevent an accidental second press from re-saving the same plates
    if (savedEntries.length === 0) return;

    const rows = buildRows(savedEntries);
    const filename = `${excelName.trim() || defaultExcelName()}.xlsx`;
    const blob = buildExcelBlob(rows, "اللوحات");
    await openExcelBlob(blob, filename);
  }

  async function exportToTashyeek() {
    const manualRecs = recordings.filter((r) => r.isManual);
    if (manualRecs.length === 0) {
      alert("لا توجد إدخالات يدوية للتصدير.");
      return;
    }

    const newRows = manualRecs.map((r) => ({
      "رقم اللوحة": r.plate,
      "نوع المركبة": r.vehicleType ?? "",
      "GPS": r.mapsLink ?? (r.lat && r.lng ? toMapsLink(r.lat, r.lng) : ""),
      "الحي": r.district ?? "",
      "الشارع": r.street ?? "",
      "تاريخ التسجيل": formatDate(r.recordedAt),
      "اسم المسجّل": r.recorderName ?? "",
      "ملاحظات": r.notes ?? "",
    }));

    const existing = await getUploadedFile("local", "tashyeek");
    const existingKeys = new Set(
      (existing?.rows ?? []).map((r) => `${r["رقم اللوحة"]}|${r["تاريخ التسجيل"]}`)
    );
    const freshRows = newRows.filter((r) => !existingKeys.has(`${r["رقم اللوحة"]}|${r["تاريخ التسجيل"]}`));
    const allRows = [...(existing?.rows ?? []), ...freshRows];

    const blob = buildExcelBlob(allRows, "ملف التشييك");
    await saveUploadedFile({
      key: "local:tashyeek",
      agentId: "local",
      slot: "tashyeek",
      fileName: "ملف-التشييك.xlsx",
      headers: ["رقم اللوحة", "نوع المركبة", "GPS", "الحي", "الشارع", "تاريخ التسجيل", "اسم المسجّل", "ملاحظات"],
      rows: allRows,
      uploadedAt: new Date().toISOString(),
      fileBlob: blob,
    });

    alert(`✅ تم التصدير — ${freshRows.length} إدخال جديد، الإجمالي: ${allRows.length}`);
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
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <MapPin size={16} className={gps ? "text-primary" : "text-muted"} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm text-ink">{gpsAddress}</p>
          {gps && (
            <p className="text-xs text-muted">
              {gps.lat.toFixed(5)}°N, {gps.lng.toFixed(5)}°E • ±{Math.round(gps.accuracy)}م
            </p>
          )}
        </div>
        {!gps && <span className="text-xs text-alert">جارٍ الاستقبال...</span>}
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

        {recordingError && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle size={15} />
            {recordingError}
          </div>
        )}

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
      </div>

      {/* ── مراجعة آخر تسجيل صوتي ── */}
      {lastRecording && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-4">
          <p className="mb-3 text-sm font-bold text-ink" dir="rtl">آخر تسجيل</p>

          <audio
            ref={reviewAudioRef}
            src={`data:${lastRecording.mimeType};base64,${lastRecording.base64}`}
            onTimeUpdate={(e) => setReviewCurrentTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => setReviewDuration(e.currentTarget.duration)}
            onEnded={() => setReviewIsPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={toggleReviewPlay}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-night"
            >
              {reviewIsPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={reviewDuration || 0}
              step={0.1}
              value={reviewCurrentTime}
              onChange={(e) => setReviewSeek(Number(e.target.value))}
              className="h-1.5 flex-1 accent-brand"
            />
            <span className="shrink-0 text-xs text-muted" dir="ltr">
              {formatSeconds(reviewCurrentTime)} / {formatSeconds(reviewDuration)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2" dir="rtl">
            <span className="text-xs text-muted">السرعة:</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setReviewPlaybackSpeed(s)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  reviewSpeed === s
                    ? "border-primary bg-primary text-night font-bold"
                    : "border-border text-muted"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              onClick={handleShareLastRecording}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-night transition hover:bg-primary/90"
            >
              <Share2 size={14} /> واتساب
            </button>
            <button
              onClick={handleSaveLastRecording}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-2 py-2.5 text-xs font-bold text-ink transition hover:border-primary hover:text-primary"
            >
              <Download size={14} /> حفظ
            </button>
            <button
              onClick={handleStartTranscriptionExcel}
              disabled={!pendingTranscript.trim() || isTranscribing}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-xs font-bold text-night transition hover:bg-brand/90 disabled:opacity-40"
            >
              <Download size={14} /> ابدأ التفريغ
            </button>
          </div>
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
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">0.5 — Voice Recorder (تسجيل الصوت الحقيقي)</p>
              <pre className={`whitespace-pre-wrap break-all rounded-lg px-3 py-2 text-xs font-mono ${
                debugVoiceRecorder.includes("❌") ? "bg-danger/10 text-danger" :
                debugVoiceRecorder.includes("✅") ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted"
              }`}>
                {debugVoiceRecorder || "(لم يبدأ بعد)"}
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
              checkPlates={checkPlates}
            />
            <div className="flex gap-2">
              <button onClick={async () => {
                const blob = buildExcelBlob(
                  matchedRecs.map((r) => ({ "رقم اللوحة": r.plate, "الشارع": r.street ?? "", "الحي": r.district ?? "", "GPS": r.mapsLink ?? "" })),
                  "المطلوبة"
                );
                await shareBlob(blob, `مطلوبة-${new Date().toISOString().slice(0,10)}.xlsx`, "اللوحات المطلوبة");
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
              onClick={exportToTashyeek}
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
    </div>
  );
}

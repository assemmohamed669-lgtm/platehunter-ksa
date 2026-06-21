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
  Trash2,
  Play,
  Pause,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileUp,
  X,
  AlertTriangle,
} from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { gpsService, toMapsLink, type GpsCoords } from "@/lib/gps";
import { reverseGeocode } from "@/lib/geocoding";
import {
  saveRecording,
  getAllRecordings,
  deleteRecording,
  updateGeodata,
  updateNotes,
  type RecordingEntry,
} from "@/lib/idb";
import { parsePlateFromTranscript, findDuplicates, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { syncPending, registerOnlineSync } from "@/lib/sync";
import { supabase } from "@/lib/supabaseClient";
import { exportRecordingsToExcel, readBankExcel } from "@/lib/excel";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

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

function MatchModal({ match, onClose }: { match: MatchedPlate; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-primary p-6 text-center shadow-2xl">
        <div className="mb-3 flex items-center justify-center gap-2">
          <AlertTriangle size={28} className="text-night animate-bounce" />
          <span className="text-xl font-black text-night">لوحة متطابقة!</span>
        </div>

        <div className="mb-4 flex justify-center">
          <PlateBadge value={match.plate} size="lg" />
        </div>

        {match.vehicleType && (
          <p className="mb-1 text-lg font-bold text-night">{match.vehicleType}</p>
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
            className="mb-4 inline-block text-sm font-bold text-night underline"
          >
            📍 افتح الموقع في الخريطة
          </a>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-night py-3 text-base font-bold text-primary transition hover:bg-night/80"
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
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("جارٍ تحديد الموقع...");
  const [isOnline, setIsOnline] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<string>("");

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

  // Pin counter
  const [pinCount, setPinCount] = useState(0);

  // Check file (bank list for matching)
  const [checkPlates, setCheckPlates] = useState<Set<string>>(new Set());
  const [checkFileName, setCheckFileName] = useState<string>("");
  const checkFileRef = useRef<HTMLInputElement | null>(null);

  // Match modal
  const [matchedPlate, setMatchedPlate] = useState<MatchedPlate | null>(null);

  // MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const gpsAtRecordRef = useRef<GpsCoords | null>(null);

  // Speech recognition
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef<string>("");

  // ── Bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAgentId(data.user.id);
        setRecorderName(emailToName(data.user.email ?? ""));
        loadRecordings(data.user.id);
        registerOnlineSync(data.user.id);
      }
    });

    gpsService.startTracking();
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

  const loadRecordings = useCallback(async (aid: string) => {
    const recs = await getAllRecordings(aid);
    setRecordings(recs);
    setDuplicates(findDuplicates(recs.map((r) => r.plate)));
  }, []);

  // ── Check file upload ────────────────────────────────────────────────
  async function handleCheckFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const plates = await readBankExcel(file);
      const normalized = new Set(
        plates.map((p) => normalizePlate(bankPlateToArabic(p))).filter(Boolean)
      );
      setCheckPlates(normalized);
      setCheckFileName(file.name);
    } catch {
      alert("تعذّر قراءة ملف التشييك.");
    }
    e.target.value = "";
  }

  function checkPlateMatch(plate: string, entry: RecordingEntry) {
    if (checkPlates.size === 0) return;
    const norm = normalizePlate(plate);
    if (checkPlates.has(norm)) {
      playMatchAlert();
      setMatchedPlate({
        plate,
        vehicleType: entry.vehicleType,
        street: entry.street,
        district: entry.district,
        mapsLink: entry.mapsLink,
      });
    }
  }

  // ── Web Speech API recording ─────────────────────────────────────────
  async function startRecording() {
    setRecordingError(null);
    setLiveTranscript("");
    finalTranscriptRef.current = "";

    const recognition = createSpeechRecognition();
    if (!recognition) {
      setRecordingError("المتصفح لا يدعم التعرف الصوتي. استخدم Chrome أو Edge.");
      return;
    }

    recognition.lang = "ar";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      finalTranscriptRef.current = final;
      setLiveTranscript(final + interim);
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error !== "aborted") {
        setRecordingError(`خطأ في التعرف الصوتي: ${event.error}`);
      }
    };

    recognitionRef.current = recognition;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      gpsAtRecordRef.current = gpsService.getLastCoords();
      chunksRef.current = [];

      const mr = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());

      mr.start(100);
      mediaRecorderRef.current = mr;
    } catch {
      // Continue without audio blob if mic access fails
    }

    recognition.start();
    setIsRecording(true);
  }

  async function stopRecording() {
    if (!isRecording) return;
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    setIsTranscribing(true);
    await new Promise((r) => setTimeout(r, 600));
    const transcript = finalTranscriptRef.current.trim() || liveTranscript.trim();
    setLiveTranscript("");
    await saveTranscript(transcript);
    setIsTranscribing(false);
  }

  async function saveTranscript(transcript: string) {
    if (!agentId) return;

    let plate = "";
    let vehicleType: string | undefined;

    if (transcript) {
      const parsed = parsePlateFromTranscript(transcript);
      plate = parsed.plate;
      vehicleType = parsed.vehicleType;
    }

    if (!plate) plate = "لم يُتعرف على اللوحة";

    let base64 = "";
    if (chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      if (blob.size > 100) {
        const arrayBuffer = await blob.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      }
    }

    const coords = gpsAtRecordRef.current;
    const localId = uid();
    const entry: RecordingEntry = {
      localId,
      agentId,
      plate,
      vehicleType,
      lat: coords?.lat,
      lng: coords?.lng,
      recordedAt: new Date().toISOString(),
      audioBlobBase64: base64 || undefined,
      mapsLink: coords ? toMapsLink(coords.lat, coords.lng) : undefined,
      recorderName,
      synced: false,
    };

    await saveRecording(entry);

    if (coords) {
      reverseGeocode(coords.lat, coords.lng).then(async (addr) => {
        await updateGeodata(localId, addr.street, addr.district);
        if (agentId) {
          const updated = await getAllRecordings(agentId);
          const updatedEntry = updated.find((r) => r.localId === localId);
          if (updatedEntry) checkPlateMatch(plate, updatedEntry);
          setRecordings(updated);
          setDuplicates(findDuplicates(updated.map((r) => r.plate)));
        }
      });
    } else {
      checkPlateMatch(plate, entry);
    }

    await loadRecordings(agentId);
    if (isOnline) syncPending(agentId);
  }

  // ── Manual plate entry ──────────────────────────────────────────────
  async function handleManualSave() {
    if (!agentId) return;
    const raw = manualInput.trim();
    if (!raw) return;

    // Parse: digits + Arabic letters only, spaces allowed between
    const { plate, vehicleType } = parsePlateFromTranscript(raw);
    // If parser fails, use raw input stripped of spaces as-is (user typed it explicitly)
    const finalPlate = plate || raw.replace(/\s+/g, "");
    if (!finalPlate) {
      setManualError("أدخل رقم اللوحة");
      return;
    }
    setManualError(null);

    const coords = gpsService.getLastCoords();
    const localId = uid();
    const entry: RecordingEntry = {
      localId,
      agentId,
      plate: finalPlate,
      vehicleType,
      lat: coords?.lat,
      lng: coords?.lng,
      recordedAt: new Date().toISOString(),
      mapsLink: coords ? toMapsLink(coords.lat, coords.lng) : undefined,
      recorderName,
      synced: false,
    };

    await saveRecording(entry);
    setManualInput("");

    if (coords) {
      reverseGeocode(coords.lat, coords.lng).then(async (addr) => {
        await updateGeodata(localId, addr.street, addr.district);
        if (agentId) {
          const updated = await getAllRecordings(agentId);
          const updatedEntry = updated.find((r) => r.localId === localId);
          if (updatedEntry) checkPlateMatch(finalPlate, updatedEntry);
          setRecordings(updated);
          setDuplicates(findDuplicates(updated.map((r) => r.plate)));
        }
      });
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
        district: addr.district,
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

  function handleExport() {
    exportRecordingsToExcel(
      recordings,
      `platehunter-${new Date().toISOString().slice(0, 10)}`
    );
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
      {matchedPlate && (
        <MatchModal match={matchedPlate} onClose={() => setMatchedPlate(null)} />
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
          {exportableCount > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 text-xs text-ink hover:border-primary hover:text-primary transition"
            >
              <Download size={11} />
              Excel
            </button>
          )}
        </div>
      </div>

      {/* Check file upload */}
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileUp size={15} className="shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">ملف التشييك</p>
              {checkFileName ? (
                <p className="truncate text-xs text-primary">{checkFileName} — {checkPlates.size} لوحة</p>
              ) : (
                <p className="text-xs text-muted">ارفع ملف Excel للمطابقة الفورية</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {checkFileName && (
              <button
                onClick={() => { setCheckPlates(new Set()); setCheckFileName(""); }}
                className="text-muted hover:text-danger transition"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={() => checkFileRef.current?.click()}
              className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-ink hover:border-primary hover:text-primary transition"
            >
              {checkFileName ? "تغيير" : "رفع"}
            </button>
          </div>
        </div>
        <input
          ref={checkFileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleCheckFileUpload}
        />
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

      {/* Main record button */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface py-6">
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={isTranscribing}
          className={`relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-150 select-none
            ${isRecording
              ? "bg-danger shadow-[0_0_32px_rgba(239,68,68,0.6)] scale-110"
              : isTranscribing
              ? "bg-surface-2 cursor-wait"
              : "bg-primary shadow-glow active:scale-95"
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
          <div className="mx-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-center text-sm text-ink" dir="rtl">
            {liveTranscript}
          </div>
        )}

        <p className="text-sm text-muted">
          {isRecording
            ? "جارٍ التسجيل... ارفع إصبعك للإيقاف"
            : isTranscribing
            ? "جارٍ معالجة الصوت..."
            : "اضغط واتكلم"}
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

      {/* Manual plate entry */}
      <div className="rounded-2xl border border-border bg-surface px-4 py-4">
        <p className="mb-3 text-sm font-bold text-ink" dir="rtl">إدخال يدوي للوحة</p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="text"
            placeholder="مثال: ق ن ص 1 2 3 4"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSave()}
            className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-base text-ink placeholder:text-muted focus:border-primary focus:outline-none"
            dir="rtl"
          />
          <button
            onClick={handleManualSave}
            disabled={!manualInput.trim()}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-night transition disabled:opacity-40 active:scale-95"
          >
            حفظ
          </button>
        </div>
        {manualError && (
          <p className="mt-1 text-xs text-danger">{manualError}</p>
        )}
        <p className="mt-2 text-xs text-muted" dir="rtl">
          اكتب الحروف والأرقام مع مسافة بينها أو بدون
        </p>
      </div>

      {/* Recordings list */}
      {recordings.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-ink">السجلات</h2>
          {recordings.map((entry) => (
            <div
              key={entry.localId}
              className={`rounded-xl border p-3 transition ${dupClass(entry.plate)}`}
            >
              {/* Top row: plate + sync status */}
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {entry.plate.startsWith("📍") ? (
                    <span className="text-sm font-bold text-primary">{entry.plate}</span>
                  ) : (
                    <PlateBadge value={entry.plate} size="sm" />
                  )}
                  {entry.vehicleType && (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {entry.vehicleType}
                    </span>
                  )}
                  {duplicates.has(entry.plate.replace(/\s/g, "").toLowerCase()) && (
                    <span className="rounded-full bg-alert/20 px-2 py-0.5 text-xs font-bold text-alert">
                      مكرر!
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.synced ? (
                    <CheckCircle2 size={14} className="text-primary" />
                  ) : (
                    <Clock size={14} className="text-muted" />
                  )}
                  <button
                    onClick={() => handleDelete(entry.localId)}
                    className="text-muted hover:text-danger transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Location */}
              {(entry.street || entry.lat) && (
                <div className="mb-1.5 flex items-center gap-1 text-xs text-muted">
                  <MapPin size={11} />
                  {entry.street
                    ? `${entry.street}${entry.district ? " • " + entry.district : ""}`
                    : `${entry.lat?.toFixed(4)}°N, ${entry.lng?.toFixed(4)}°E`}
                  {entry.mapsLink && (
                    <a
                      href={entry.mapsLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-1 text-primary underline"
                    >
                      خريطة
                    </a>
                  )}
                </div>
              )}

              {/* Timestamp */}
              <p className="mb-2 text-xs text-muted">{formatDate(entry.recordedAt)}</p>

              {/* Notes input */}
              {!entry.plate.startsWith("📍") && (
                <input
                  type="text"
                  placeholder="ملاحظات... (اختياري)"
                  value={entry.notes ?? ""}
                  onChange={(e) => handleNotesChange(entry.localId, e.target.value)}
                  className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-primary focus:outline-none"
                  dir="rtl"
                />
              )}

              {/* Audio player */}
              {entry.audioBlobBase64 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePlay(entry)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition"
                  >
                    {playingId === entry.localId ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <div className="flex gap-1">
                    {SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSpeed(entry.localId, s)}
                        className={`rounded-full px-2 py-0.5 text-xs transition ${
                          (playSpeed[entry.localId] ?? 1) === s
                            ? "bg-primary text-night font-bold"
                            : "border border-border text-muted hover:text-ink"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {recordings.length === 0 && !isTranscribing && (
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

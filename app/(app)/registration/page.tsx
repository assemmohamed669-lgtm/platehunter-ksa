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
  FileUp,
  X,
  AlertTriangle,
  Share2,
} from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import RecordingsTable from "@/components/RecordingsTable";
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
import { parsePlateFromTranscript, findDuplicates, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { syncPending, registerOnlineSync } from "@/lib/sync";
import { supabase } from "@/lib/supabaseClient";
import { exportRecordingsToExcel, readBankExcel, buildExcelBlob } from "@/lib/excel";

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

  // ── Bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const uid = data.user.id;
        setAgentId(uid);
        setRecorderName(emailToName(data.user.email ?? ""));
        loadRecordings(uid);
        registerOnlineSync(uid);

        // Restore persisted check file
        const checkRec = await getUploadedFile(uid, "check");
        if (checkRec) {
          const plates = new Set(
            checkRec.rows.map((r) => r.plate).filter(Boolean)
          );
          setCheckPlates(plates);
          setCheckFileName(checkRec.fileName);
        }
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

      // Persist to IndexedDB
      if (agentId) {
        await saveUploadedFile({
          key: `${agentId}:check`,
          agentId,
          slot: "check",
          fileName: file.name,
          headers: ["plate"],
          rows: [...normalized].map((p) => ({ plate: p })),
          uploadedAt: new Date().toISOString(),
        });
      }
    } catch {
      alert("تعذّر قراءة ملف التشييك.");
    }
    e.target.value = "";
  }

  function checkPlateMatch(plate: string, entry: RecordingEntry) {
    if (checkPlates.size === 0) return;
    const norm = normalizePlate(plate);
    if (checkPlates.has(norm)) {
      setMatchedIds((prev) => new Set(prev).add(entry.localId));
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
    setDebugStatus("");
    finalTranscriptRef.current = "";
    liveTranscriptRef.current  = "";

    const recognition = createSpeechRecognition();
    if (!recognition) {
      setRecordingError("المتصفح لا يدعم التعرف الصوتي. استخدم Chrome أو Edge.");
      return;
    }

    recognition.lang = "ar-SA";
    recognition.continuous = false;  // continuous=true silently fails on Android WebView
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setDebugStatus("✅ STARTED");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = finalTranscriptRef.current;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
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

    // With continuous=false, SR stops after each utterance.
    // Auto-restart while user is still holding the button.
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
    recognition.start();
    setIsRecording(true);
  }

  async function stopRecording() {
    if (!isRecording) return;
    isRecordingRef.current = false;   // must clear BEFORE .stop() so onend doesn't restart
    recognitionRef.current?.stop();
    mediaRecorderRef.current?.stop();
    setIsRecording(false);

    // Wait for the last onresult to deliver its final result
    await new Promise((r) => setTimeout(r, 400));

    const transcript = finalTranscriptRef.current.trim();
    setLiveTranscript("");
    liveTranscriptRef.current = "";
    finalTranscriptRef.current = "";

    if (!transcript) {
      setDebugFinal("(فارغ — لم يُحفظ)");
      setDebugPlate("(transcript فارغ — لم يُحفظ)");
      return;
    }

    setIsTranscribing(true);
    await saveTranscript(transcript);
    setIsTranscribing(false);
  }

  async function saveTranscript(transcript: string) {
    if (!agentId) return;

    setDebugFinal(transcript);
    setDebugNormalized("");
    setDebugPlate("");
    setDebugVehicle("");
    setDebugNotes("");

    const parsed = parsePlateFromTranscript(transcript);
    const plate = parsed.plate;           // "" if nothing found — intentional
    const vehicleType = parsed.vehicleType;

    setDebugNormalized(parsed.normalized || "(فارغ)");
    setDebugPlate(plate || "(لم يُستخرج)");
    setDebugVehicle(vehicleType || "(لم يُستخرج)");
    setDebugNotes(parsed.notes || "(لا يوجد)");

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
      }).catch(() => {
        checkPlateMatch(plate, entry);
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
      isManual: true,
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
      }).catch(() => {
        checkPlateMatch(finalPlate, entry);
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

  async function handleShareExcel() {
    const filename = `platehunter-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const rows = recordings
      .filter((r) => !r.plate.startsWith("📍"))
      .map((r) => ({
        "رقم اللوحة": r.plate,
        "GPS": r.mapsLink ?? "",
        "تاريخ التسجيل": r.recordedAt,
        "الحي": r.district ?? "",
        "الشارع": r.street ?? "",
        "نوع السيارة": r.vehicleType ?? "",
      }));
    const blob = buildExcelBlob(rows, "اللوحات");
    const file = new File([blob], filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    try {
      await navigator.share({ files: [file], title: "سجلات اللوحات" });
    } catch {
      handleExport();
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
          {exportableCount > 0 && (
            <button
              onClick={handleShareExcel}
              className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 text-xs text-ink hover:border-primary hover:text-primary transition"
            >
              <Share2 size={11} />
              مشاركة
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
                onClick={async () => { setCheckPlates(new Set()); setCheckFileName(""); if (agentId) await deleteUploadedFile(agentId, "check"); }}
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
          onClick={() => isRecording ? stopRecording() : startRecording()}
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
            <p className="text-sm font-bold text-primary">اللوحات المطلوبة ({matchedRecs.length})</p>
            <RecordingsTable
              recordings={matchedRecs}
              onDelete={handleDelete}
              onDeleteMany={async (ids) => { for (const id of ids) await handleDelete(id); }}
            />
            <div className="flex gap-2">
              <button onClick={async () => {
                const blob = buildExcelBlob(
                  matchedRecs.map((r) => ({ "رقم اللوحة": r.plate, "الشارع": r.street ?? "", "الحي": r.district ?? "", "GPS": r.mapsLink ?? "" })),
                  "المطلوبة"
                );
                const file = new File([blob], `مطلوبة-${new Date().toISOString().slice(0,10)}.xlsx`, { type: blob.type });
                try { await navigator.share({ files: [file], title: "اللوحات المطلوبة" }); } catch { /* user cancelled */ }
              }}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90">
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

      {/* Recordings table */}
      {isTranscribing && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3" dir="rtl">
          <RefreshCw size={15} className="animate-spin shrink-0 text-primary" />
          <span className="text-sm text-primary">جارٍ معالجة اللوحة...</span>
        </div>
      )}
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
            />
            <div className="flex gap-2">
              <button onClick={handleShareExcel}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90">
                <Share2 size={16} /> مشاركة Excel
              </button>
              <button onClick={handleExport}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary">
                <Download size={16} /> فتح في Excel
              </button>
            </div>
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

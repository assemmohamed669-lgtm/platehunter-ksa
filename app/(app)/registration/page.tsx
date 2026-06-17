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
} from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import { gpsService, toMapsLink, type GpsCoords } from "@/lib/gps";
import { reverseGeocode } from "@/lib/geocoding";
import {
  saveRecording,
  getAllRecordings,
  deleteRecording,
  updateGeodata,
  type RecordingEntry,
} from "@/lib/idb";
import { parsePlateFromTranscript, findDuplicates } from "@/lib/plateParser";
import { syncPending, registerOnlineSync } from "@/lib/sync";
import { supabase } from "@/lib/supabaseClient";

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

export default function RegistrationPage() {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsCoords | null>(null);
  const [gpsAddress, setGpsAddress] = useState<string>("جارٍ تحديد الموقع...");
  const [isOnline, setIsOnline] = useState(true);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Recordings list
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());

  // Audio playback
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playSpeed, setPlaySpeed] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Pin counter
  const [pinCount, setPinCount] = useState(0);

  // MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const gpsAtRecordRef = useRef<GpsCoords | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAgentId(data.user.id);
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

  // ── Voice recording ─────────────────────────────────────────────────
  async function startRecording() {
    setRecordingError(null);
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

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        handleRecordingStop();
      };

      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
    } catch (err) {
      setRecordingError("تعذّر الوصول للميكروفون. تحقق من الأذونات.");
      console.error(err);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  async function handleRecordingStop() {
    if (!agentId) return;
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    if (blob.size < 100) return; // too short, ignore

    setIsTranscribing(true);
    try {
      // Convert blob to base64 for IndexedDB storage
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      // Send to Whisper
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      let plate = "";
      let vehicleType: string | undefined;

      if (isOnline) {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.transcript) {
          const parsed = parsePlateFromTranscript(json.transcript);
          plate = parsed.plate;
          vehicleType = parsed.vehicleType;
        } else {
          plate = "خطأ في التفريغ";
        }
      } else {
        plate = "لم يتم التفريغ (بدون إنترنت)";
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
        audioBlobBase64: base64,
        mapsLink: coords ? toMapsLink(coords.lat, coords.lng) : undefined,
        synced: false,
      };

      await saveRecording(entry);

      // Geocode in background
      if (coords) {
        reverseGeocode(coords.lat, coords.lng).then(async (addr) => {
          await updateGeodata(localId, addr.street, addr.district);
          if (agentId) loadRecordings(agentId);
        });
      }

      await loadRecordings(agentId);
      if (isOnline) syncPending(agentId);
    } finally {
      setIsTranscribing(false);
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
        district: addr.district,
        recordedAt: new Date().toISOString(),
        mapsLink: toMapsLink(coords.lat, coords.lng),
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

  // ── Duplicate colour ────────────────────────────────────────────────
  function dupClass(plate: string): string {
    if (duplicates.has(plate.replace(/\s/g, "").toLowerCase())) {
      return "border-alert bg-alert/10";
    }
    return "border-border bg-surface";
  }

  const pendingCount = recordings.filter((r) => !r.synced).length;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-ink">التسجيل</h1>
          <p className="text-xs text-muted">{recordings.length} سجل</p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* GPS status */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <MapPin
          size={16}
          className={gps ? "text-primary" : "text-muted"}
        />
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm text-ink">{gpsAddress}</p>
          {gps && (
            <p className="text-xs text-muted">
              {gps.lat.toFixed(5)}°N, {gps.lng.toFixed(5)}°E • ±{Math.round(gps.accuracy)}م
            </p>
          )}
        </div>
        {!gps && (
          <span className="text-xs text-alert">جارٍ الاستقبال...</span>
        )}
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

        <p className="text-sm text-muted">
          {isRecording
            ? "جارٍ التسجيل... ارفع إصبعك للإيقاف"
            : isTranscribing
            ? "جارٍ التفريغ الذكي..."
            : "اضغط واتكلم"}
        </p>

        {recordingError && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertCircle size={15} />
            {recordingError}
          </div>
        )}

        {/* Manual GPS pin */}
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
                    <span className="text-sm font-bold text-primary">
                      {entry.plate}
                    </span>
                  ) : (
                    <PlateBadge value={entry.plate} size="sm" />
                  )}
                  {entry.vehicleType && (
                    <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {entry.vehicleType}
                    </span>
                  )}
                  {duplicates.has(
                    entry.plate.replace(/\s/g, "").toLowerCase()
                  ) && (
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
                    : entry.lat
                    ? `${entry.lat?.toFixed(4)}°N, ${entry.lng?.toFixed(4)}°E`
                    : ""}
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
              <p className="mb-2 text-xs text-muted">
                {formatDate(entry.recordedAt)}
              </p>

              {/* Audio player */}
              {entry.audioBlobBase64 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePlay(entry)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition"
                  >
                    {playingId === entry.localId ? (
                      <Pause size={14} />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>

                  {/* Speed selector */}
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

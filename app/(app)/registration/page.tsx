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
  updatePlate,
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  type RecordingEntry,
} from "@/lib/idb";
import { parsePlateFromTranscript, extractMultiplePlates, findDuplicates, normalizePlate, bankPlateToArabic, detectPlateColumn, pickBestHypothesis, applyLetterConfusions, recordLetterCorrections, serializeLetterConfusions, deserializeLetterConfusions, type LetterConfusionMap, EN_TO_AR } from "@/lib/plateParser";
import { matchesPreferred } from "@/lib/sortingCols";
import { syncPending, registerOnlineSync } from "@/lib/sync";
import { supabase } from "@/lib/supabaseClient";
import { exportRecordingsToExcel, parseExcelFile, buildExcelBlob, openExcelBlob, type ExcelTable } from "@/lib/excel";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

const INVALID_AR_LETTERS_SET = new Set(["ت","ث","ج","خ","ذ","ز","ش","ض","ظ","غ","ف"]);

const LS_LETTER_CONFUSIONS = "ph:registration:letterConfusions";

// A plate freshly extracted from a transcript, ready to save immediately.
// `originalPlate` is the raw pre-correction value the recognizer/parser produced —
// kept on the saved RecordingEntry so a later edit in the table can be diffed
// against it to learn a letter confusion.
type ExtractedPlate = { plate: string; originalPlate: string; vehicleType: string; notes: string; uncertain: boolean };

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

  // Learned letter-confusion corrections (heard → actual), calibrated per device/mic
  // from the user's own edits in the review step. Loaded once on mount, persisted
  // to localStorage whenever a save teaches it something new.
  const letterConfusionsRef = useRef<LetterConfusionMap>(new Map());

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
    finalTranscriptRef.current = "";
    liveTranscriptRef.current  = "";

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

    let plates = extractMultiplePlates(transcript);
    if (plates.length === 0) {
      const parsed = parsePlateFromTranscript(transcript);
      if (parsed.plate) {
        plates = [{ plate: parsed.plate, vehicleType: parsed.vehicleType, notes: parsed.notes, normalized: parsed.normalized, uncertain: parsed.uncertain }];
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

    return plates.map((p) => {
      const corrected = applyLetterConfusions(p.plate, letterConfusionsRef.current);
      return {
        plate: corrected,
        originalPlate: p.plate,
        vehicleType: p.vehicleType ?? "",
        notes: p.notes ?? "",
        // Flag for a quick glance if the parser itself was unsure, OR if we just
        // auto-corrected it — the confusion learner is a heuristic, not a certainty.
        uncertain: !!p.uncertain || corrected !== p.plate,
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
    const savedIds: string[] = [];
    const savedEntries: RecordingEntry[] = [];

    for (const { plate, originalPlate, vehicleType, notes, uncertain } of plates) {
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
        vehicleType: vehicleType?.trim() || undefined,
        notes: notes?.trim() || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        recordedAt: new Date().toISOString(),
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
          "تاريخ التسجيل": formatDate(r.recordedAt),
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

  // "احفظ وصدّر الإكسيل" → extract + save immediately, no review gate. Mistakes
  // are fixed later by tapping the plate directly in the table below.
  async function handleTranscribeAndSave() {
    const transcript = pendingTranscript.trim();
    if (!transcript) return;

    const extracted = extractPlates(transcript);
    if (extracted.length === 0) {
      alert("لم يتم استخراج أي لوحة من التسجيل. جرّب تسجيل تاني أو أضف يدوياً.");
      return;
    }

    setPendingTranscript("");
    setIsTranscribing(true);
    const savedEntries = await savePlateList(extracted);
    setIsTranscribing(false);
    if (savedEntries.length === 0) return;

    const rows = buildRows(savedEntries);
    const filename = `${excelName.trim() || defaultExcelName()}.xlsx`;
    const blob = buildExcelBlob(rows, "اللوحات");
    await openExcelBlob(blob, filename);
  }

  // Editing a plate directly in the table (post-save correction). Teaches the
  // letter-confusion learner from the (heard → actual) diff, persists the
  // learned map, updates storage, and re-checks the corrected plate against
  // the check file in case the fix reveals a match.
  async function handlePlateEdit(localId: string, newPlate: string) {
    const entry = recordings.find((r) => r.localId === localId);
    if (!entry) return;
    const trimmed = newPlate.trim();
    if (!trimmed || trimmed === entry.plate) return;

    // Only voice-dictated entries carry a meaningful "heard" value — a manual
    // entry's plate was typed, so editing it later is a typo fix, not a
    // mishearing signal, and must not pollute the confusion learner.
    if (!entry.isManual) {
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

      {/* ── جاهز للتفريغ: النص الخام + زر يحفظ اللوحات فورًا (بدون مراجعة إجبارية) ── */}
      {pendingTranscript.trim() && (
        <div className="rounded-2xl border border-border bg-surface px-4 py-4">
          <p className="mb-2 text-sm font-bold text-ink" dir="rtl">جاهز للتفريغ</p>
          <p className="mb-3 text-sm text-muted" dir="rtl">{pendingTranscript}</p>
          <button
            onClick={handleTranscribeAndSave}
            disabled={isTranscribing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-40"
          >
            <Download size={16} /> احفظ وصدّر الإكسيل
          </button>
          <p className="mt-2 text-[11px] text-muted" dir="rtl">
            هتتحفظ فورًا بأفضل تخمين — لو حرف غلط، اضغط عليه في الجدول تحت وصحّحه في أي وقت.
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
              onUpdatePlate={handlePlateEdit}
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

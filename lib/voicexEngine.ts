/**
 * محرك VoiceX المستقل — بلا ديبجرام.
 * =============================================================================
 * منقول من معمل الصوت (LivePage «موديل المقاطع»)، مقيس ومجرّب على المناديب:
 *   • المايك شغّال، وكل ~١.٣ث نبعت **نافذة ٥ث** لـVoiceX — بس **لو فيه كلام**
 *     (بوابة سكوت بالطاقة). ده اللي بيمنع الاختراع على السكوت ويقلّل حمل السيرفر.
 *   • النوافذ **متداخلة** فكل لوحة تتقرا في كذا نافذة → استحضار ٨٩٪→٩٩٪ (مقيس).
 *   • **فكّ الإجماع** (LiveConsensus) بيجمّع القراءات المتداخلة، يصوّت على الإملاء
 *     بأعلى ثقة، والتعدّد (نافذتين+) = مؤكّدة. + **حاجز اختراع** على min_logprob.
 *   • أي فشل نفق متكرر → onFatal (المنادي يرجّع لديبجرام) = «رجوع لو VoiceX فصل».
 *
 * الوحدة مكتفية بذاتها: getUserMedia + MediaRecorder + AudioContext (VAD) +
 * postAudioForPlate (نفس سبّاكة النفق) + LiveConsensus. الصفحة بتناديها وتغذّي
 * `onPlate` لـaddOnePttRow.
 *
 * ⚠️ بادئة webm بتكبر مع الجلسة (الترويسة في أول جزء بس)، فبنبدّل المسجّل كل
 *    فترة **أثناء السكوت** (segment) عشان النافذة تفضل صغيرة والسيرفر مايفكّش
 *    دقايق صوت كل نداء. كل segment له إجماعه (يُصرَّف عند التبديل).
 */
import { postAudioForPlate } from "./plateJudgeClient";
import { LiveConsensus } from "./liveConsensus";

/** لوحة سعودية سليمة الشكل — نفس مجموعة الحروف المغلقة. */
const WELL = /^[ء-ي]{3}\d{4}$/;

/** حاجز الاختراع: أضعف توكن أقل من ده = تلفيق (مقيس LivePage: -0.5). */
export const VOICEX_MIN_TOKEN_LOGPROB = -0.5;

const WINDOW_MS = 5000;        // طول نافذة القصّ (السيرفر بيقصّ ?start&end)
const STEP_MS = 1300;          // كل قد إيه نبعت نافذة
const DRAIN_MS = 500;          // كل قد إيه نصرّف الإجماع
const CHUNK_MS = 250;          // حجم جزء MediaRecorder
const VAD_POLL_MS = 150;       // معدل قياس الطاقة
const VAD_RMS_ON = 0.012;      // عتبة «فيه كلام» (تُعاير على الجهاز)
const SPEECH_TAIL_MS = 1500;   // نكمّل نبعت لحد ١.٥ث بعد آخر كلام
const SEG_SOFT_MS = 20000;     // بدّل المسجّل بعد ٢٠ث **لو ساكت**
const SEG_HARD_MS = 90000;     // بدّل إجبارياً بعد ٩٠ث حتى لو بيتكلم
const RESET_POLL_MS = 3000;
const MAX_INFLIGHT = 2;
const FATAL_FAILS = 6;         // فشل متتالي كده = النفق فصل → ارجع لديبجرام
const REQ_TIMEOUT_MS = 9000;

export interface VoicexPlateMeta {
  tier: "green" | "yellow";
  conf: number;
  mult: number;
}

export interface VoicexEngineOpts {
  transcribeUrl: string;
  token: string;
  /** لوحة مؤكّدة جاهزة (مطبّعة الشكل) — الصفحة بتحطّها في addOnePttRow. */
  onPlate: (plate: string, meta: VoicexPlateMeta) => void;
  /** تغيّر الحالة (اختياري) — للعرض. */
  onStatus?: (s: "listening" | "processing" | "idle") => void;
  /** بوابة الكلام (VAD): true = بيسمع صوت، false = هدوء — لمؤشّر السماع. */
  onSpeech?: (active: boolean) => void;
  /** فشل نفق متكرر أو الميك اترفض — المنادي يرجّع لديبجرام. */
  onFatal?: (reason: string) => void;
  /** حقن (للاختبار). */
  now?: () => number;
}

export interface VoicexEngineController {
  stop: () => void;
  /** حالة حيّة — للتشخيص. */
  readonly stopped: boolean;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ }
  }
  return "";
}

/**
 * يشغّل محرك VoiceX المستقل. بيرجّع مُتحكّم فيه `stop()`، أو `null` لو الميك
 * اترفض (وبينده onFatal). **عمره ما يرمي** — أي فشل بيتبلّغ عبر onFatal.
 */
export async function startVoicexEngine(opts: VoicexEngineOpts): Promise<VoicexEngineController | null> {
  const now = opts.now ?? (() => Date.now());
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    opts.onFatal?.("mic_denied");
    return null;
  }

  const mime = pickMime();
  const mimeType = mime || "audio/webm";
  let chunks: Blob[] = [];
  let segStartMs = now();
  let consensus = new LiveConsensus({ windowMs: 2000, stableMs: 2500, greenMinMult: 2 });
  let rec: MediaRecorder | null = null;
  let inflight = 0;
  let consecutiveFails = 0;
  let lastSpeechRel = -1e9;      // آخر لحظة كلام نسبةً لبداية الـsegment
  let stopped = false;

  const emit = (plate: string, meta: VoicexPlateMeta) => {
    if (WELL.test(plate)) opts.onPlate(plate, meta);
  };
  const drainAll = (nowRel: number) => {
    for (const c of consensus.drain(nowRel)) emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult });
  };

  function startSegment() {
    try { rec?.stop(); } catch { /* ignore */ }
    // صرّف أي عناقيد مفتوحة قبل ما نصفّر ساعة الـsegment (وإلا مايتصرّفوش أبداً).
    for (const c of consensus.flush()) emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult });
    consensus = new LiveConsensus({ windowMs: 2000, stableMs: 2500, greenMinMult: 2 });
    chunks = [];
    segStartMs = now();
    lastSpeechRel = -1e9;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(CHUNK_MS);
    } catch {
      opts.onFatal?.("recorder_failed");
    }
  }

  // ── بوابة السكوت (VAD بالطاقة) ──
  const ac = new AudioContext();
  const srcNode = ac.createMediaStreamSource(stream);
  const analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  srcNode.connect(analyser);
  const vbuf = new Float32Array(analyser.fftSize);
  let speaking = false;
  const vadTimer = setInterval(() => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(vbuf);
    let s = 0;
    for (let i = 0; i < vbuf.length; i++) s += vbuf[i] * vbuf[i];
    const loud = Math.sqrt(s / vbuf.length) > VAD_RMS_ON;
    const rel = now() - segStartMs;
    if (loud) lastSpeechRel = rel;
    // «بيسمع» = صوت دلوقتي أو خلال آخر ٥٠٠ms (يمنع رفرفة المؤشّر بين المقاطع).
    const active = loud || rel - lastSpeechRel < 500;
    if (active !== speaking) { speaking = active; opts.onSpeech?.(active); }
  }, VAD_POLL_MS);

  // ── إرسال النوافذ المتداخلة (بس أثناء/بعد الكلام) ──
  const sendTimer = setInterval(async () => {
    if (stopped) return;
    const elapsed = now() - segStartMs;
    if (elapsed - lastSpeechRel > SPEECH_TAIL_MS) return;   // ساكت — ماتبعتش
    if (inflight >= MAX_INFLIGHT) return;
    const parts = chunks.slice();
    if (!parts.length) return;
    const startMs = Math.max(0, elapsed - WINDOW_MS);
    const endMs = elapsed;
    const blob = new Blob(parts, { type: mimeType });
    inflight += 1;
    opts.onStatus?.("processing");
    try {
      const resp = await postAudioForPlate(blob, {
        transcribeUrl: opts.transcribeUrl, token: opts.token, mimeType,
        startMs, endMs, timeoutMs: REQ_TIMEOUT_MS,
      });
      if (!resp) {
        consecutiveFails += 1;
        if (consecutiveFails >= FATAL_FAILS) { opts.onFatal?.("tunnel_down"); }
        return;
      }
      consecutiveFails = 0;
      // حاجز الاختراع + بوابة الثقة على السيرفر.
      if (typeof resp.minLogprob === "number" && resp.minLogprob < VOICEX_MIN_TOKEN_LOGPROB) return;
      if (!resp.accepted) return;
      const conf = typeof resp.meanLogprob === "number" ? Math.min(1, Math.exp(resp.meanLogprob)) : 0.6;
      const tMs = (startMs + endMs) / 2;
      // السيرفر بيرجّع لوحات نضيفة مفصولة بمسافة.
      for (const p of String(resp.plate || "").trim().split(/\s+/)) {
        if (WELL.test(p)) consensus.add({ plate: p, tMs, conf });
      }
    } finally {
      inflight -= 1;
    }
  }, STEP_MS);

  // ── تصريف الإجماع (يعرض اللوحات المستقرّة) ──
  const drainTimer = setInterval(() => {
    if (stopped) return;
    drainAll(now() - segStartMs);
  }, DRAIN_MS);

  // ── تبديل المسجّل (بادئة صغيرة): بعد ٢٠ث لو ساكت، أو ٩٠ث إجبارياً ──
  const resetTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = now() - segStartMs;
    const quiet = elapsed - lastSpeechRel > 1200;
    if ((elapsed > SEG_SOFT_MS && quiet) || elapsed > SEG_HARD_MS) startSegment();
  }, RESET_POLL_MS);

  startSegment();
  opts.onStatus?.("listening");

  const controller: VoicexEngineController = {
    get stopped() { return stopped; },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(vadTimer);
      clearInterval(sendTimer);
      clearInterval(drainTimer);
      clearInterval(resetTimer);
      for (const c of consensus.flush()) emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult });
      try { rec?.stop(); } catch { /* ignore */ }
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      try { void ac.close(); } catch { /* ignore */ }
      opts.onStatus?.("idle");
    },
  };
  return controller;
}

/**
 * محرك VoiceX المستقل — بلا ديبجرام. **نسخة طبق الأصل من معمل الصوت** (LivePage
 * «موديل المقاطع») اللي المناديب جرّبوه ودقّته كويسة:
 *   • MicEngine: التقاط PCM + سلسلة معالجة + ذاكرة دوّارة ٩٠ث + `sliceWav`
 *     **معلّى** (normalizePeak) — التعلية دي بالذات هي اللي بترفع الدقة.
 *   • Vad: كشف كلام بأرضية ضوضاء متكيّفة → نبعت **بس أثناء/بعد الكلام**.
 *   • كل ~١.٥ث نقصّ نافذة ٥ث (WAV خام معلّى) ونبعتها لـVoiceX عبر postAudioForPlate.
 *   • بوابة جودة (audioPregate على الخام) + حاجز اختراع (min_logprob) + فكّ إجماع
 *     (نافذتين+ = مؤكّدة).
 *   • أي فشل نفق متكرر → onFatal (المنادي يرجّع لديبجرام).
 *
 * ⚠️ مفيش إعادة تشغيل مسجّل (الذاكرة الدوّارة بتكفي) — ده اللي كان بيوقّف الطريقة
 *    القديمة (webm) بعد ~٢٠ث على الجهاز.
 */
import { postAudioForPlate } from "./plateJudgeClient";
import { LiveConsensus } from "./liveConsensus";
import { MicEngine } from "./micEngine";
import { Vad } from "./vad";
import { audioPregate } from "./audioPregate";

const WELL = /^[ء-ي]{3}\d{4}$/;
export const VOICEX_MIN_TOKEN_LOGPROB = -0.5;

const WIN_S = 5;              // طول نافذة القصّ (WAV كامل، بلا قصّ سيرفر)
const STEP_MS = 1500;         // كل قد إيه نبعت نافذة
const DRAIN_MS = 500;         // كل قد إيه نصرّف الإجماع
const SPEECH_TAIL_S = 1.5;    // نكمّل نبعت لحد ١.٥ث بعد آخر كلام
const MAX_INFLIGHT = 2;
const FATAL_FAILS = 6;        // فشل متتالي كده = النفق فصل → ارجع لديبجرام
const REQ_TIMEOUT_MS = 9000;

export interface VoicexPlateMeta { tier: "green" | "yellow"; conf: number; mult: number; }

export interface VoicexEngineOpts {
  transcribeUrl: string;
  token: string;
  onPlate: (plate: string, meta: VoicexPlateMeta) => void;
  onStatus?: (s: "listening" | "processing" | "idle") => void;
  onSpeech?: (active: boolean) => void;
  onFatal?: (reason: string) => void;
}

export interface VoicexEngineController {
  stop: () => void;
  readonly stopped: boolean;
}

export async function startVoicexEngine(opts: VoicexEngineOpts): Promise<VoicexEngineController | null> {
  let stopped = false;
  let inflight = 0;
  let fails = 0;
  let speaking = false;
  let lastSpokeSec = 0;
  let vad: Vad | null = null;

  const consensus = new LiveConsensus({ windowMs: 2000, stableMs: 2500, greenMinMult: 2 });
  const emit = (p: string, meta: VoicexPlateMeta) => { if (WELL.test(p)) opts.onPlate(p, meta); };

  const mic = new MicEngine({
    mode: "live",
    onChunk: (pcm, startSec) => { try { vad?.push(pcm, startSec); } catch { /* ignore */ } },
  });

  try {
    await mic.start();
  } catch {
    opts.onFatal?.("mic_denied");
    return null;
  }

  vad = new Vad({
    sampleRate: mic.sampleRate,
    silenceMs: 700,
    minSpeechMs: 300,
    maxSpeechMs: 60000,
    onSpeechStart: () => { speaking = true; opts.onSpeech?.(true); },
    onUtterance: (u) => { speaking = false; lastSpokeSec = u.endSec; opts.onSpeech?.(false); },
  });

  async function processWindow(fromSec: number, toSec: number) {
    if (stopped || toSec - fromSec < 0.6) return;
    if (inflight >= MAX_INFLIGHT) return;
    // بوابة السكوت على الخام (تحسين حمل — السيرفر أصلاً بيرجّع فاضي على السكوت).
    const q = mic.sliceQuality(fromSec, toSec, 0.2);
    if (q && !audioPregate(q).accept) return;
    // نافذة WAV **خام معلّى** — زي ما الموديل اتدرّب (raw=true + normalizePeak).
    const wav = mic.sliceWav(fromSec, toSec, 0.2, true);
    if (!wav) return;
    inflight += 1;
    opts.onStatus?.("processing");
    try {
      const resp = await postAudioForPlate(wav, {
        transcribeUrl: opts.transcribeUrl, token: opts.token,
        mimeType: "audio/wav", timeoutMs: REQ_TIMEOUT_MS,   // بلا start/end = المقطع كله
      });
      if (!resp) {
        fails += 1;
        if (fails >= FATAL_FAILS) opts.onFatal?.("tunnel_down");
        return;
      }
      fails = 0;
      if (typeof resp.minLogprob === "number" && resp.minLogprob < VOICEX_MIN_TOKEN_LOGPROB) return;
      if (!resp.accepted) return;
      const conf = typeof resp.meanLogprob === "number" ? Math.min(1, Math.exp(resp.meanLogprob)) : 0.6;
      const tMs = toSec * 1000;
      for (const p of String(resp.plate || "").trim().split(/\s+/)) {
        if (WELL.test(p)) consensus.add({ plate: p, tMs, conf });
      }
    } finally {
      inflight -= 1;
    }
  }

  // كل ١.٥ث: نافذة ٥ث — بس أثناء الكلام أو خلال ١.٥ث بعده (بلاش نقرا سكوت).
  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    if (!speaking && elapsed - lastSpokeSec > SPEECH_TAIL_S) return;
    void processWindow(Math.max(0, elapsed - WIN_S), elapsed);
  }, STEP_MS);

  // تصريف الإجماع — بزمن التسجيل (نفس وحدة add) مش Date.now().
  const drainTimer = setInterval(() => {
    if (stopped) return;
    for (const c of consensus.drain(mic.elapsedSec * 1000)) {
      emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult });
    }
  }, DRAIN_MS);

  opts.onStatus?.("listening");

  return {
    get stopped() { return stopped; },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(segTimer);
      clearInterval(drainTimer);
      try { vad?.flush(mic.elapsedSec); } catch { /* ignore */ }
      for (const c of consensus.flush()) emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult });
      try { mic.stop(); } catch { /* ignore */ }
      opts.onSpeech?.(false);
      opts.onStatus?.("idle");
    },
  };
}

/**
 * محرك VoiceX المستقل — بلا ديبجرام.
 * =============================================================================
 * الالتقاط من المعمل (دقّة): MicEngine — PCM + سلسلة معالجة + ذاكرة دوّارة ٩٠ث +
 * `sliceWav` **معلّى** (normalizePeak = دقة أعلى). بلا إعادة تشغيل مسجّل.
 *
 * بوابة الكلام **بسيطة وموثوقة** (RMS على الصوت الخام) — زي النسخة اللي اشتغلت
 * فعلاً على الجهاز. (الـVAD المتكيّف + بوابة الجودة audioPregate كانوا بيرفضوا
 * صوت المندوب على جهازه — ٣ نوافذ بس — فشِلناهم؛ السيرفر أصلاً بيرجّع فاضي على
 * السكوت بإصلاح begin_suppress، فمش محتاجين بوابة سكوت صارمة في العميل.)
 *
 * كل ~١.٣ث نقصّ نافذة ٥ث WAV خام معلّى ونبعتها لـVoiceX. فكّ إجماع (نافذتين+ =
 * مؤكّدة) + حاجز اختراع (min_logprob). أي فشل نفق متكرر → onFatal (ارجع لديبجرام).
 */
import { postAudioForPlate } from "./plateJudgeClient";
import { LiveConsensus } from "./liveConsensus";
import { MicEngine } from "./micEngine";

const WELL = /^[ء-ي]{3}\d{4}$/;
export const VOICEX_MIN_TOKEN_LOGPROB = -0.5;

const WIN_S = 5;
const STEP_MS = 1300;
const DRAIN_MS = 500;
const SPEECH_RMS = 0.01;       // عتبة «فيه كلام» على الصوت الخام (زي النسخة اللي اشتغلت)
const SPEECH_TAIL_S = 1.5;     // نكمّل نبعت لحد ١.٥ث بعد آخر كلام
const MAX_INFLIGHT = 2;
const FATAL_FAILS = 8;
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
  let lastSpeechSec = -1e9;

  const consensus = new LiveConsensus({ windowMs: 2000, stableMs: 2500, greenMinMult: 2 });
  const emit = (p: string, meta: VoicexPlateMeta) => { if (WELL.test(p)) opts.onPlate(p, meta); };

  // بوابة الكلام: RMS على الصوت **الخام** (ديناميكية سليمة — الضاغط بيسطّح الفرق).
  const mic = new MicEngine({
    mode: "live",
    onRawChunk: (pcm) => {
      let s = 0;
      for (let i = 0; i < pcm.length; i++) s += pcm[i] * pcm[i];
      if (Math.sqrt(s / pcm.length) > SPEECH_RMS) lastSpeechSec = mic.elapsedSec;
    },
  });

  try {
    await mic.start();
  } catch {
    opts.onFatal?.("mic_denied");
    return null;
  }

  async function processWindow(fromSec: number, toSec: number) {
    if (stopped || toSec - fromSec < 0.6) return;
    if (inflight >= MAX_INFLIGHT) return;
    const wav = mic.sliceWav(fromSec, toSec, 0.2, true);   // خام معلّى (raw=true)
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

  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    // مؤشّر السماع + بوابة الإرسال: بس لو فيه كلام في آخر ١.٥ث.
    const speaking = elapsed - lastSpeechSec < SPEECH_TAIL_S;
    opts.onSpeech?.(speaking);
    if (!speaking) return;
    void processWindow(Math.max(0, elapsed - WIN_S), elapsed);
  }, STEP_MS);

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
      for (const c of consensus.flush()) emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult });
      try { mic.stop(); } catch { /* ignore */ }
      opts.onSpeech?.(false);
      opts.onStatus?.("idle");
    },
  };
}

/**
 * محرك VoiceX المستقل — **منقول من المعمل بالحرف** (LivePage «موديل المقاطع»).
 * =============================================================================
 * رجعنا لإعدادات المعمل المضبوطة بالظبط بعد ما التعديلات من عندي بعّدتنا عن
 * النتيجة الحلوة اللي كانت على اللينك. السلسلة زي المعمل ١:١:
 *
 *   MicEngine (PCM + تعلية) → Vad (كشف كلام) → كل ١.٥ث نقصّ نافذة ٥ث →
 *   بوابة سكوت audioPregate (قبل التعلية) → VoiceX → حاجز اختراع مسطّح
 *   (min_logprob < -0.5 يرمي النافذة كلها) → LiveConsensus (نافذتين+ = مؤكّدة).
 *
 * أي فرق عن المعمل = باج. أي فشل نفق متكرر → onFatal (رجوع صامت لديبجرام).
 */
import { postAudioForPlate } from "./plateJudgeClient";
import { LiveConsensus } from "./liveConsensus";
import { MicEngine } from "./micEngine";
import { Vad } from "./vad";
import { audioPregate } from "./audioPregate";

const WELL = /^[ء-ي]{3}\d{4}$/;

/**
 * حاجز الأرقام الملفّقة — **مسطّح، زي المعمل بالظبط** (LivePage:1681).
 * قراءة صحيحة: وسيط min_logprob ≈ 0 · أسوأ -0.04. لوحة ملفّقة (سكوت/حروف
 * بس): وسيط -1.48. عتبة -0.50 = هامش ٢.٥× عن أسوأ قراءة صحيحة، بتقتل ٩٤٪ من
 * التلفيق وماتخسّرش قراءة صحيحة. النافذة اللي أوطى توكن فيها < -0.5 تتحجب
 * كلها (مش على المفردة بس — المعمل بيرمي النافذة).
 */
const MIN_TOKEN_LOGPROB = -0.5;

const WIN_S = 5;              // نافذة ٥ث: لازم تحتوي اللوحة كاملة (زي المعمل)
const STEP_MS = 1500;         // نزحلق كل ١.٥ث أثناء الكلام (زي المعمل)
const DRAIN_MS = 500;         // نصرّف العناقيد المستقرّة كل نص ثانية (زي المعمل)
const MAX_INFLIGHT = 2;       // نافذتين متوازيتين بحد أقصى (زي المعمل)
const FATAL_FAILS = 8;        // فشل نفق متتالي كتير → رجوع لديبجرام
const REQ_TIMEOUT_MS = 9000;

export interface VoicexPlateMeta { tier: "green" | "yellow"; conf: number; mult: number; }

export interface VoicexEngineOpts {
  transcribeUrl: string;
  token: string;
  onPlate: (plate: string, meta: VoicexPlateMeta) => void;
  onStatus?: (s: "listening" | "processing" | "idle") => void;
  onSpeech?: (active: boolean) => void;
  /** مستوى الصوت اللحظي ٠..١ — للمؤشّر المتحرك اللي بيتحرك مع كلام المندوب */
  onLevel?: (level: number) => void;
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
  let speaking = false;        // الـVad بيقول دلوقتي فيه كلام؟
  let lastSpokeSec = 0;        // آخر ثانية اتسمع فيها كلام (نهاية آخر نطق)

  // إعدادات الإجماع **زي المعمل بالحرف**: نافذة ٢ث single-linkage (أكبر من خطوة
  // الزحلقة ١.٥ث وأصغر من إيقاع نطق اللوحة ~٣.٤ث فالأسطول يتفصل)، العنقود يفضل
  // مفتوح ٢.٥ث بعد آخر قراءة، نافذتين+ = 🟢 مؤكّدة.
  const consensus = new LiveConsensus({ windowMs: 2000, stableMs: 2500, greenMinMult: 2 });
  const emit = (p: string, meta: VoicexPlateMeta) => { if (WELL.test(p)) opts.onPlate(p, meta); };

  // يتعرّف قبل الميك عشان مرجع onChunk يكون آمن؛ يتبني بعد ما نعرف معدل العيّنات.
  let vad: Vad | null = null;

  // الـVad بيتغذّى من onChunk (الصوت **المعالَج**) — زي المعمل بالظبط.
  const mic = new MicEngine({
    mode: "live",
    onChunk: (pcm, startSec) => { try { vad?.push(pcm, startSec); } catch { /* ignore */ } },
    onLevel: (level) => { opts.onLevel?.(level); },
  });

  try {
    await mic.start();
  } catch {
    opts.onFatal?.("mic_denied");
    return null;
  }

  // الـVad **بعد** الميك عشان يعرف معدل العيّنات الحقيقي — قيم «المقاطع» من المعمل.
  vad = new Vad({
    sampleRate: mic.sampleRate,
    silenceMs: 900,
    minSpeechMs: 250,
    maxSpeechMs: 60000,
    onSpeechStart: () => { speaking = true; opts.onSpeech?.(true); },
    onUtterance: (u) => { speaking = false; lastSpokeSec = u.endSec; opts.onSpeech?.(false); },
  });

  async function processWindow(fromSec: number, toSec: number) {
    const m = mic;
    if (stopped || toSec - fromSec < 0.6) return;
    if (inflight >= MAX_INFLIGHT) return;   // مشغول — النافذة الجاية هتلحق

    // 🔇 بوابة السكوت **على الصوت الخام قبل التعلية** (زي المعمل): sliceWav
    // بيعلّي كل نافذة لأقصى مستوى، فالسكوت بيتحوّل صوت عالي والموديل بيخترع لوحة.
    const q = m.sliceQuality(fromSec, toSec, 0.2);
    if (q && !audioPregate(q).accept) return;

    const wav = m.sliceWav(fromSec, toSec, 0.2, true);   // خام معلّى (raw=true)
    if (!wav) return;

    inflight += 1;
    opts.onStatus?.("processing");
    try {
      const resp = await postAudioForPlate(wav, {
        transcribeUrl: opts.transcribeUrl, token: opts.token,
        mimeType: "audio/wav", timeoutMs: REQ_TIMEOUT_MS,
      });
      if (!resp) {
        fails += 1;
        if (fails >= FATAL_FAILS) opts.onFatal?.("tunnel_down");
        return;
      }
      fails = 0;

      // زي المعمل: المرفوضة (accepted=false) ماتظهرش — بلا إسقاط تخمين.
      if (!resp.accepted) return;

      // ثقة النافذة = exp(mean_logprob) (زي المعمل) — أعلى ثقة تكسب في التصويت.
      const conf = typeof resp.meanLogprob === "number" ? Math.exp(resp.meanLogprob) : 0.6;

      // ⚠️ حاجز الاختراع **مسطّح** (زي المعمل): لو أوطى توكن < -0.5 = النافذة
      // كلها ملفّقة (سكوت/حروف بس) → ترميها، ماتدخلش الإجماع أصلاً.
      const minLp = typeof resp.minLogprob === "number" ? resp.minLogprob : null;
      const fabricated = minLp !== null && minLp < MIN_TOKEN_LOGPROB;
      if (fabricated) return;

      // زمن الإجماع = **مركز النافذة** (زي المعمل) — عرض فوري ~٢.٥ث.
      const tMs = ((fromSec + toSec) / 2) * 1000;
      for (const p of String(resp.plate || "").trim().split(/\s+/)) {
        const norm = p.replace(/\s+/g, "");
        if (WELL.test(norm)) consensus.add({ plate: norm, tMs, conf });
      }
    } finally {
      inflight -= 1;
      if (!stopped) opts.onStatus?.("listening");
    }
  }

  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    // اقرا بس أثناء الكلام أو بعده بلحظة (١.٥ث) — بلاش نقرا سكوت (زي المعمل).
    if (!speaking && elapsed - lastSpokeSec > 1.5) return;
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
      opts.onLevel?.(0);
      opts.onStatus?.("idle");
    },
  };
}

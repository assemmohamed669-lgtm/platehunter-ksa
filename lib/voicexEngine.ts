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
import { planVoicexAdmission } from "./voicexAdmission";

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
/**
 * سقف الطلبات المتوازية — **يساوي سقف السيرفر بالظبط، ولا حرف زيادة.**
 *
 * 🔴 ممنوع نرفعه «عشان نسرّع»: `serving/seg_server.py:891` افتراضيه ٢، و`/health`
 * **مابيعلنش** السقف (متحقَّق على السيرفرين)، وأي ٥٠٣ بيرجّع `null`
 * (`plateJudgeClient.ts:993`) بيتحسب فشل نفق (تحت) وبعد ٨ متتالية بنهرب
 * لديبجرام **في صمت**. يعني رفع الرقم من غير دليل = خسارة الدقة كلها.
 *
 * ضياع اللوحات اتصلّح بـ**الأولوية** مش بالرقم — شوف `voicexAdmission.ts`.
 */
const MAX_INFLIGHT = 2;
/** أقصى قراءات نطق مستنية — فوقها بنعلن التخطّي بدل ما نبلعه. */
const MAX_PENDING_UTTERANCES = 3;
const FATAL_FAILS = 8;        // فشل نفق متتالي كتير → رجوع لديبجرام
const REQ_TIMEOUT_MS = 9000;

/**
 * `tMs` = **زمن النطق** (مركز نافذة الصوت في تسجيل الجلسة) — مش زمن وصول الرد.
 * حارس التوأم في صفحة التشييك بيستخدمه عشان يفرّق بين:
 *   • ترفرف نفس النطق (نوافذ متداخلة، فرقها ~١.٥ث)
 *   • ولوحتين حقيقيتين ورا بعض (إيقاع النطق ~٣.٤ث)
 * زمن الوصول مايصلحش للتفرقة دي لأنه بيتأثر بتذبذب الشبكة/الطابور.
 */
export interface VoicexPlateMeta { tier: "green" | "yellow"; conf: number; mult: number; tMs: number; }

export interface VoicexEngineOpts {
  transcribeUrl: string;
  token: string;
  onPlate: (plate: string, meta: VoicexPlateMeta) => void;
  onStatus?: (s: "listening" | "processing" | "idle") => void;
  onSpeech?: (active: boolean) => void;
  /** مستوى الصوت اللحظي ٠..١ — للمؤشّر المتحرك اللي بيتحرك مع كلام المندوب */
  onLevel?: (level: number) => void;
  onFatal?: (reason: string) => void;
  /** هوية المندوب — تتمرّر لـ postAudioForPlate كترويسة X-Agent-Id (وسم الحصاد). */
  agentId?: string | null;
  /**
   * سقف الطلبات المتوازية. الافتراضي `MAX_INFLIGHT` — **ماترفعوش إلا لو
   * السيرفر أعلن سقفه فعلاً** (اقرا التحذير فوق الثابت).
   */
  maxInflight?: number;
  /**
   * 🔴 نافذة اتخطّت. **الرمي الصامت هو الباج الأصلي** — الشاشة كانت بتقول
   * «بيسمع صوتك» وكل نافذة بتترمى بلا أثر. أي تخطّي من دلوقتي **يتبلّغ**.
   */
  onSkip?: (reason:
    | "busy_window" | "yield_to_utterance" | "utterance_queue_full"
    /** النافذة أقصر من ٠.٦ث */
    | "too_short"
    /** بوابة السكوت رفضت — الصوت واطي أو مافيش كلام فيه */
    | "silence_gate"
    /** القصّ رجع فاضي — الذاكرة الدوّارة مالهاش صوت في المدى ده */
    | "slice_failed"
    /** الطلب اتبعت وفشل (شبكة/مهلة/كود مش ٢٠٠) */
    | "request_failed"
  ) => void;
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

  const maxInflight = Number.isFinite(opts.maxInflight as number) && (opts.maxInflight as number) >= 1
    ? Math.floor(opts.maxInflight as number)
    : MAX_INFLIGHT;

  /**
   * 🔴 طابور **قراءات النطق الكامل** — قلب الإصلاح.
   *
   * كانت بتترمى لما الموديل يبقى مشغول (`inflight < MAX_INFLIGHT` في شرط
   * `onUtterance`)، وهي **أهم قراءة عندنا**: بتدّي اللوحة كلها مرة واحدة مهما
   * كان إيقاع النطق. دلوقتي بتستنى دورها.
   *
   * مداها الزمني بس (`from`/`to`) مش الصوت نفسه — الذاكرة الدوّارة في
   * `micEngine` بتشيل **٩٠ ثانية** (`LIVE_RING_SECONDS`)، والانتظار الواقعي
   * أقل من مهلة الطلب (٩ث)، فالقصّ المتأخّر بيدّي نفس البايتات بالظبط.
   */
  const pending: Array<{ from: number; to: number }> = [];

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
    onUtterance: (u) => {
      speaking = false; lastSpokeSec = u.endSec; opts.onSpeech?.(false);
      // 🎯 قراءة النطق **الكامل**: نبعت المقطع من بدايته لنهايته بالظبط (زي ما اتقال).
      // النوافذ الثابتة (٥ث كل ١.٥ث) بتقطع اللوحة **البطيئة** في أماكن مختلفة فتطلع
      // قراءات جزئية مترفرفة (رعق/حعق). قراءة النطق الكامل بتدّي اللوحة **كلها مرة
      // واحدة** مهما كان الإيقاع، فتأكّد الشكل الصح (قراءة نضيفة) وحارس التوأم يشيل
      // الجزئية. بنحدّه بطول معقول (≤٦ث) عشان مانبعتش مقطع ضخم للموديل.
      const dur = u.endSec - u.startSec;
      if (stopped || dur < 0.6 || dur > 6) return;
      const from = Math.max(0, u.startSec - 0.15);
      const to = u.endSec + 0.15;
      // 🔴 كانت `&& inflight < MAX_INFLIGHT` — يعني **اللوحة تترمى** لو الموديل
      // مشغول. دلوقتي بتستنى دورها: الصوت لسه في الذاكرة الدوّارة (٩٠ث) فالقصّ
      // المتأخّر بيدّي نفس البايتات، و`tMs` مركز النطق مش وقت الوصول فالإجماع
      // مايتلخبطش.
      const plan = planVoicexAdmission({
        source: "utterance", inflight, maxInflight, utteranceQueued: pending.length > 0,
      });
      if (plan === "send") { sliceAndSend(from, to); return; }
      if (pending.length >= MAX_PENDING_UTTERANCES) {
        opts.onSkip?.("utterance_queue_full");   // نادر — بس ماينفعش يتبلع
        return;
      }
      pending.push({ from, to });
    },
  });

  // وعود النوافذ الجارية — عشان الإيقاف يستناها قبل التصريف النهائي (آخر لوحة ماتضيعش).
  const inflightSet = new Set<Promise<void>>();

  // يبعت نافذة WAV واحدة، يطبّق حواجز المعمل، يضيف اللوحات للإجماع. مايلمسش المؤقتات.
  async function sendWav(wav: Blob, tMs: number): Promise<void> {
    try {
      const resp = await postAudioForPlate(wav, {
        transcribeUrl: opts.transcribeUrl, token: opts.token,
        mimeType: "audio/wav", timeoutMs: REQ_TIMEOUT_MS, agentId: opts.agentId,
      });
      if (!resp) {
        fails += 1;
        opts.onSkip?.("request_failed");   // كان بيتبلع لحد الـ٨ متتالية
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
      if (minLp !== null && minLp < MIN_TOKEN_LOGPROB) return;
      // زمن الإجماع = **مركز النافذة** (زي المعمل) — عرض فوري ~٢.٥ث.
      for (const p of String(resp.plate || "").trim().split(/\s+/)) {
        const norm = p.replace(/\s+/g, "");
        if (WELL.test(norm)) consensus.add({ plate: norm, tMs, conf });
      }
    } catch { /* تجاهل — شبكة/تحليل */ }
  }

  // يقصّ نافذة [from,to] معلّاة (بعد بوابة السكوت) ويبعتها، ويتتبّع وعدها للإيقاف.
  function sliceAndSend(fromSec: number, toSec: number): void {
    // 🔴 التلات رجعات دي كانت **صامتة تماماً**: المندوب بيتكلّم، الشاشة بتقول
    // «بيسمع صوتك» (الكاشف محلي)، و**ولا بايت بيخرج من الجهاز** — ومحدش يعرف
    // ليه. دلوقتي كل واحدة بتتبلّغ باسمها.
    if (toSec - fromSec < 0.6) { opts.onSkip?.("too_short"); return; }
    // 🔇 بوابة السكوت على الصوت الخام قبل التعلية (زي المعمل).
    const q = mic.sliceQuality(fromSec, toSec, 0.2);
    if (q && !audioPregate(q).accept) { opts.onSkip?.("silence_gate"); return; }
    const wav = mic.sliceWav(fromSec, toSec, 0.2, true);   // خام معلّى
    if (!wav) { opts.onSkip?.("slice_failed"); return; }
    const tMs = ((fromSec + toSec) / 2) * 1000;
    inflight += 1;
    opts.onStatus?.("processing");
    const pr = sendWav(wav, tMs);
    inflightSet.add(pr);
    void pr.finally(() => {
      inflight -= 1;
      inflightSet.delete(pr);
      drainPending();          // 🔴 سلوت فضي ⇒ أول قراءة نطق مستنية تمشي فوراً
      if (!stopped) opts.onStatus?.("listening");
    });
  }

  /**
   * بتصرّف الطابور أول ما سلوت يفضى. `sliceAndSend` بتزوّد `inflight` فوراً
   * (متزامن) فالحلقة بتقف لوحدها — مافيش دوران لا نهائي.
   */
  function drainPending(): void {
    // ⚠️ **مافيش شرط `!stopped` هنا عن قصد** — `finalize` بينده الدالة دي بعد
    // الإيقاف عشان يبعت اللي في الطابور. القراءات المستنية لوحات حقيقية.
    while (pending.length > 0) {
      const plan = planVoicexAdmission({
        source: "utterance", inflight, maxInflight, utteranceQueued: true,
      });
      if (plan !== "send") break;
      const w = pending.shift();
      if (!w) break;
      sliceAndSend(w.from, w.to);
    }
  }

  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    // اقرا بس أثناء الكلام أو بعده بلحظة (١.٥ث) — بلاش نقرا سكوت (زي المعمل).
    if (!speaking && elapsed - lastSpokeSec > 1.5) return;
    // النافذة الزاحفة **فايضة بالتصميم** (كل ١.٥ث على آخر ٥ث، متداخلة)، فهي
    // اللي تتنازل: للسقف، ولأي قراءة نطق مستنية. والتخطّي **بيتبلّغ** دلوقتي
    // بدل `return` أخرس — ده كان نص الباج.
    const plan = planVoicexAdmission({
      source: "window", inflight, maxInflight, utteranceQueued: pending.length > 0,
    });
    if (plan !== "send") {
      opts.onSkip?.(pending.length > 0 ? "yield_to_utterance" : "busy_window");
      return;
    }
    sliceAndSend(Math.max(0, elapsed - WIN_S), elapsed);
  }, STEP_MS);

  const drainTimer = setInterval(() => {
    if (stopped) return;
    for (const c of consensus.drain(mic.elapsedSec * 1000)) {
      emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult, tMs: c.tMs });
    }
  }, DRAIN_MS);

  opts.onStatus?.("listening");

  // إيقاف نظيف — الإصلاح لباج «آخر لوحة مش بتتكتب»:
  //  (١) نقصّ **نافذة أخيرة** تغطّي آخر ٥ث (لو المندوب وقف قبل ما المؤقّت يبعتها).
  //  (٢) **نستنى كل النوافذ الجارية** (اللي لسه بترجع من السيرفر) — السباق القديم كان
  //      flush بيتنفّذ قبل ما نافذة جارية ترجّع، فلوحتها تتضاف للإجماع بعد الفوات = تضيع.
  //  (٣) بعد ما كله يهدا، نعمل flush **مرة واحدة** ونعرض كل العناقيد المتبقية.
  async function finalize(): Promise<void> {
    // ⚠️ مابنعيدش قراءة آخر نافذة (كانت بتقرا لوحات ظهرت خلاص بشكل مترفرف = صفوف
    // مكررة، خصوصاً مع النفق اللي بيقع ويرجع فبيتكرر الإيقاف). آخر لوحة اتقالت
    // موجودة أصلاً في آخر نافذة دورية (عنقود مفتوح لسه ماستقرّش) والـflush بيطلّعها
    // بلا إعادة قراءة. فبنكتفي بـ: نقفل الميك، نستنى النوافذ الجارية، ثم flush واحد.
    // 🔴 **الطابور الأول، وقبل `mic.stop()`** — `sliceWav` بتقرا من ذاكرة الميك،
    // ولو قفلناه قبلها كل قراءة نطق مستنية تتحوّل لـ`null` = لوحة ضايعة (نفس
    // الباج الأصلي بشكل تاني). بنلف عشان كل ما سلوت يفضى واحدة تمشي.
    for (let guard = 0; guard < 50 && (pending.length > 0 || inflightSet.size > 0); guard++) {
      drainPending();
      if (inflightSet.size === 0) break;
      try { await Promise.race([...inflightSet]); } catch { /* ignore */ }
    }
    try { mic.stop(); } catch { /* ignore */ }
    try { await Promise.allSettled([...inflightSet]); } catch { /* ignore */ }
    for (const c of consensus.flush()) emit(c.plate, { tier: c.tier, conf: c.conf, mult: c.mult, tMs: c.tMs });
    opts.onStatus?.("idle");
  }

  return {
    get stopped() { return stopped; },
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(segTimer);
      clearInterval(drainTimer);
      opts.onSpeech?.(false);
      opts.onLevel?.(0);
      void finalize();   // انتظار النوافذ الجارية + flush (بلا إعادة قراءة = بلا تكرار)
    },
  };
}

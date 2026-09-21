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
import { PendingWindow } from "./pendingWindow";
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
    onUtterance: (u) => {
      speaking = false; lastSpokeSec = u.endSec; opts.onSpeech?.(false);
      // 🎯 قراءة النطق **الكامل**: نبعت المقطع من بدايته لنهايته بالظبط (زي ما اتقال).
      // النوافذ الثابتة (٥ث كل ١.٥ث) بتقطع اللوحة **البطيئة** في أماكن مختلفة فتطلع
      // قراءات جزئية مترفرفة (رعق/حعق). قراءة النطق الكامل بتدّي اللوحة **كلها مرة
      // واحدة** مهما كان الإيقاع، فتأكّد الشكل الصح (قراءة نضيفة) وحارس التوأم يشيل
      // الجزئية. بنحدّه بطول معقول (≤٦ث) عشان مانبعتش مقطع ضخم للموديل.
      const dur = u.endSec - u.startSec;
      if (!stopped && dur >= 0.6 && dur <= 6 && inflight < MAX_INFLIGHT) {
        sliceAndSend(Math.max(0, u.startSec - 0.15), u.endSec + 0.15);
      }
    },
  });

  // وعود النوافذ الجارية — عشان الإيقاف يستناها قبل التصريف النهائي (آخر لوحة ماتضيعش).
  const inflightSet = new Set<Promise<void>>();

  /**
   * النافذة اللي اتأجّلت لأن الخط كان مزنوق. كانت بتترمي وخلاص، فآخر لوحة في
   * السلسلة كانت ممكن ماتدخلش أي نافذة اتبعتت أصلاً. بنمسك **المدى** (مش
   * البايتات) فقصّه بعدين بيجيب نفس الصوت بالظبط — مافيش أي تغيير على اللي
   * بيوصل للموديل.
   */
  const pending = new PendingWindow();

  // يبعت نافذة WAV واحدة، يطبّق حواجز المعمل، يضيف اللوحات للإجماع. مايلمسش المؤقتات.
  async function sendWav(wav: Blob, tMs: number): Promise<void> {
    try {
      const resp = await postAudioForPlate(wav, {
        transcribeUrl: opts.transcribeUrl, token: opts.token,
        mimeType: "audio/wav", timeoutMs: REQ_TIMEOUT_MS, agentId: opts.agentId,
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
    if (toSec - fromSec < 0.6) return;
    // 🔇 بوابة السكوت على الصوت الخام قبل التعلية (زي المعمل).
    const q = mic.sliceQuality(fromSec, toSec, 0.2);
    if (q && !audioPregate(q).accept) return;
    const wav = mic.sliceWav(fromSec, toSec, 0.2, true);   // خام معلّى
    if (!wav) return;
    const tMs = ((fromSec + toSec) / 2) * 1000;
    inflight += 1;
    opts.onStatus?.("processing");
    const pr = sendWav(wav, tMs);
    inflightSet.add(pr);
    void pr.finally(() => {
      inflight -= 1;
      inflightSet.delete(pr);
      if (!stopped) opts.onStatus?.("listening");
      // فضي مكان → ابعت النافذة اللي كانت مستنية (لو لسه فيه).
      if (!stopped && pending.has && inflight < MAX_INFLIGHT) {
        const w = pending.take();
        if (w) sliceAndSend(w.start, w.end);
      }
    });
  }

  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    // اقرا بس أثناء الكلام أو بعده بلحظة (١.٥ث) — بلاش نقرا سكوت (زي المعمل).
    if (!speaking && elapsed - lastSpokeSec > 1.5) return;
    const from = Math.max(0, elapsed - WIN_S);
    // مشغول؟ **نأجّلها مش نرميها.** الرمي كان بيضيّع آخر لوحة في السلسلة لما
    // الرد يبقى أبطأ من ٣ث (= نافذتين × ١.٥ث): كل نبضة تلاقي الاتنين مشغولين
    // وتلغي نفسها، والنوافذ بتقف بعد ١.٥ث من آخر كلام — فمفيش فرصة تانية.
    if (inflight >= MAX_INFLIGHT) { pending.set({ start: from, end: elapsed }); return; }
    sliceAndSend(from, elapsed);
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
    // النافذة اللي كانت مستنية لسه ماتبعتتش — دي غالباً اللي فيها **آخر لوحة**.
    // بنبعتها قبل ما نستنى، فالانتظار تحت بيغطّيها. (mic.stop() بعدها عشان
    // القصّ يلاقي الصوت موجود.)
    const last = pending.take();
    if (last) sliceAndSend(last.start, last.end);
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

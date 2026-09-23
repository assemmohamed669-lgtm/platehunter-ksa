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
import { MissedWindows, canReplay, isStalled } from "./voicexReplay";
import { postAudioForPlate } from "./plateJudgeClient";
import { LiveConsensus, drainClockMs } from "./liveConsensus";
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
/** للتقرير بس — الحجب الفعلي بقى في الإجماع (`soloMinLp`) على المفردة. */
const MIN_TOKEN_LOGPROB = -0.5;

const WIN_S = 5;              // نافذة ٥ث: لازم تحتوي اللوحة كاملة (زي المعمل)
const STEP_MS = 1500;         // نزحلق كل ١.٥ث أثناء الكلام (زي المعمل)
const DRAIN_MS = 500;         // نصرّف العناقيد المستقرّة كل نص ثانية (زي المعمل)
/**
 * سقف الطلبات المتوازية — **يساوي سقف السيرفر بالظبط، ولا حرف زيادة.**
 *
 * 🔴 ممنوع نرفعه «عشان نسرّع» — بس **لسبب مختلف عن اللي كان مكتوب هنا.**
 *
 * ⚠️ التبرير القديم كان **غلط في الحقيقتين** (اتحقّق ٢٣ سبتمبر ٢٠٢٦):
 *   · كان بيستشهد بـ`serving/seg_server.py:891` — **الملف ده مش في الريبو
 *     خالص**، مافيش غير `serving/plate_server.py`.
 *   · وكان بيقول إن `/health` **مابيعلنش** السقف — بيعلنه فعلاً
 *     (`plate_server.py:808` بيرجّع `max_inflight` و`inflight`)، والافتراضي
 *     هناك **٤** مش ٢.
 *
 * السبب الحقيقي اللي لسه قايم: أي ٥٠٣ بيرجّع `null` (`plateJudgeClient.ts`)
 * وبيتحسب فشل نفق، وبعد ٨ متتالية بنهرب لديبجرام **في صمت**. فرفع الرقم بلا
 * دليل بيقايض سرعة بخطر إن الجلسة تقع على المحرّك الاحتياطي من غير ما حد
 * يعرف. الرقم يتغيّر **بقراءة `max_inflight` من `/health`** لما نوصّلها، مش
 * بتخمين — وقبلها لازم عدّاد `busy_window` من الميدان يثبت إن ده هو الخانوق.
 *
 * ضياع اللوحات اتصلّح بـ**الأولوية** مش بالرقم — شوف `voicexAdmission.ts`.
 *
 * ضياع اللوحات اتصلّح بـ**الأولوية** مش بالرقم — شوف `voicexAdmission.ts`.
 */
const MAX_INFLIGHT = 2;

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🎯 ذيل النافذة بعد ما الكلام يقف
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (٢٣ سبتمبر ٢٠٢٦): «المندوب بيقول ٥ أو ١٠ لوحات وآخر واحدة
 * مش بتطلع — وأوقات تطلع عادي».
 *
 * النافذة بتبصّ **لورا** ٥ث وبتتحرك كل ١.٥ث، فأي لوحة بتتغطّى بالنوافذ
 * اللي بتنتهي في [T, T+5] ⇒ **٣-٤ نوافذ**. لكن الحلقة كانت بتقف بعد
 * **١.٥ث** من آخر كلام، فاللوحة الأخيرة كانت بتاخد **نافذة واحدة بس**.
 *
 * ونافذة واحدة = قراءة مفردة، والمفردة بتواجه حاجز الاختراع — فبتعدّي لو
 * ثقتها عالية وتتحجب لو لأ. ده بالظبط «أوقات تطلع وأوقات لأ».
 *
 * ⇒ الذيل = **طول النافذة**. مش رقم مخترع: هو بالظبط اللي بيخلّي آخر
 *   لوحة تاخد نفس عدد النوافذ زي أي لوحة في النص.
 *
 * التكلفة: ٢-٣ نوافذ زيادة بعد كل نطقة — وبوابة السكوت بترفض الفاضي منها
 * رخيص، والطاقة بقت ×٤ بعد التجميع.
 */
export function windowTailSec(winS: number): number {
  return winS;
}

/** تزحف النافذة دلوقتي؟ أثناء الكلام دايماً، وبعده لطول النافذة. */
export function shouldSlideWindow(
  speaking: boolean,
  elapsedSec: number,
  lastSpokeSec: number,
  winS: number,
): boolean {
  if (speaking) return true;
  return elapsedSec - lastSpokeSec <= windowTailSec(winS);
}
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
  /**
   * 🎚️ بيتنده **مرة واحدة** بعد ما الميك يفتح، ومعاه معدّل العيّنات **الحقيقي**.
   *
   * 🔴 ليه ده مهم: `micEngine.ts` بيطلب ١٦kHz وطلبه ممكن **يفشل في صمت**
   * (`try { new Ctor({ sampleRate: 16000 }) } catch { new Ctor() }`) ومافيش
   * إعادة تشكيل في أي مكان. الجهاز اللي بيقع على ٤٨kHz بيرفع **٣ أضعاف
   * البايتات** لنفس الثانية صوت — فبيبقى أبطأ من زميله على نفس الشبكة
   * وبيشتكي «التطبيق تقيل عندي» وإحنا شايفين السيرفر والموديل سليمين.
   * الرقم ده كان معروف على الجهاز وماحدش بيعرضه.
   */
  onReady?: (info: { sampleRate: number }) => void;
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
  /**
   * 🔍 سبب تخطّي نافذة — **نصّ مفتوح بالقصد**. الأسباب الثابتة:
   *   `busy_window` · `yield_to_utterance` · `utterance_queue_full`
   *   `too_short` · `silence_gate` · `slice_failed`
   * وفيه اتنين بيحملوا تفصيلة بعد نقطتين:
   *   `request_failed:<code>` — الكود الحقيقي من طبقة الشبكة
   *     (`http_503` · `timeout` · `network` · `bad_token` …)
   *   `empty_slice:<bytes>`  — المقطع طلع فاضي عملياً
   *
   * 🔴 الرمي الصامت هو الباج الأصلي: المندوب بيتكلّم، الشاشة بتقول «بيسمع
   * صوتك» (الكاشف محلي)، ومافيش أي أثر. أي تخطّي لازم يتبلّغ.
   */
  /**
   * 🔒 **إصلاحات مقيسة لسه ماتجربتش على المناديب — مقفولة افتراضياً.**
   *
   * التلاتة دول اتقاسوا على صفحة التجربة عند المالك بس (٢٢ سبتمبر ٢٠٢٦)
   * و**مااتجربوش على صفحة التشييك ولا على جهاز مندوب**:
   *   ① طابور قراءة النطق بدل الرمي لما الموديل يبقى مشغول
   *   ② شيل حاجز الاختراع المسطّح ومرور `minLp` للإجماع (الحجب على المفردة بس)
   *   ③ ساعة تصريف بتوقيت النطق — الإجماع بيتجمّع فعلاً لأول مرة
   *
   * `false` (الافتراضي) = **سلوك المناديب الحالي بالحرف**. المالك طلب
   * (٢٢ سبتمبر): «خليها في صفحة الموديل الجديد فقط لحد ما أجرّب».
   *
   * ⚠️ أي تغيير هنا بيمسّ ٤٠-٨٠ مندوب بيدفعوا — مايتفتحش إلا بإثبات جهاز حقيقي.
   */
  fixes?: boolean;
  onSkip?: (reason: string) => void;
  /**
   * نافذة فايتة اتبعتت **تاني** بعد ما الشبكة رجعت (`fixes` بس). للعدّ في
   * التقرير — عشان المالك يشوف الاسترجاع بيحصل فعلاً.
   */
  onReplay?: () => void;
  /**
   * 🎙️ نفس النافذة اللي اتبعتت للموديل — عشان العميل يسأل بيها **سيرفر النوع**
   * (كوهير) بالتوازي. ده أسلوب المعمل بالظبط: «الفوري مابينديش كوهير —
   * **العميل** هو اللي بينده سيرفر النوع» (`deploy/نشر-على-كوريا.md`).
   * `tMs` نفس زمن اللوحة فالمطابقة بينهم مضمونة.
   */
  onAudioWindow?: (wav: Blob, tMs: number) => void;
  /**
   * 🔬 **كل قراءة خام من الموديل** — قبل الإجماع وقبل أي فلترة.
   *
   * اللوحة النهائية (`onPlate`) بتخفي اللي بيحصل قبلها: القراءات اللي اتحجبت
   * بحاجز الاختراع، واللي اترفضت (`accepted:false`)، والنص اللي الموديل سمعه
   * فعلاً مقابل اللوحة اللي اتطلعت منه. من غير ده مستحيل نعرف «الغلط جاي
   * منين» ولا «فيه رقم ماتكتبش».
   */
  onRead?: (r: {
    /** نص الموديل الخام (`raw_text`) — مش اللوحة المستخلَصة */
    rawText: string;
    /** اللوحة/اللوحات اللي السيرفر استخلصها */
    plate: string;
    accepted: boolean;
    /** exp(mean_logprob) */
    conf: number;
    /** أوطى توكن — أقل من ‎-0.5 = النافذة اتحجبت كاختراع */
    minLogprob: number | null;
    /** اتحجبت بحاجز الاختراع؟ */
    blocked: boolean;
    tMs: number;
    /** زمن الموديل نفسه (مللي) */
    msModel: number | null;
    /** زمن الرحلة كاملة من الجهاز (مللي) */
    msWall: number;
  }) => void;
}

export interface VoicexEngineController {
  stop: () => void;
  readonly stopped: boolean;
  /**
   * ساعة الصوت دلوقتي (مللي من فتح المايك) — **نفس ساعة `tMs`**.
   * قراءة بس، ومابتغيّرش أي سلوك — بتستعملها صفحة «الجديد» عشان تحسب
   * «ظهرت بعد» صح. شوف `lib/trialLatency.ts`.
   */
  readonly audioNowMs: number;
  /** آخر لحظة الكاشف سمع فيها صوت (مللي، نفس الساعة)، أو `null`. */
  readonly lastVoiceEndMs: number | null;
}

export async function startVoicexEngine(opts: VoicexEngineOpts): Promise<VoicexEngineController | null> {
  let stopped = false;
  let inflight = 0;
  let fails = 0;
  let speaking = false;        // الـVad بيقول دلوقتي فيه كلام؟
  let lastSpokeSec = 0;        // آخر ثانية اتسمع فيها كلام (نهاية آخر نطق)

  /** 🔒 الإصلاحات المعزولة — شوف `VoicexEngineOpts.fixes`. */
  const FIXES = opts.fixes === true;

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
  // 🎚️ معدّل العيّنات الحقيقي — أول رقم بيفرّق بين «جهازه بيرفع ٣ أضعاف»
  // و«الشبكة/السيرفر». بيتنده مرة واحدة، ومحميّ عشان كولباك بيرمي مايوقفش
  // فتح الميك (نفس عقد باقي الكولباكس في الملف ده).
  try { opts.onReady?.({ sampleRate: mic.sampleRate }); } catch { /* ignore */ }

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
      if (stopped) return;
      // 🔴 **دول كانوا `return` أخرس** — وأخطرهم `dur > 6` لأنه **مش نادر**:
      // الكاشف بيقفل النطق بعد ٩٠٠ms سكوت، والسكتة المقيسة بين لوحتين وسيطها
      // **٧٧٠ms** (`plateJudgeClient.ts:57-80`) ⇒ اللوحات المتتالية بتتلزق في
      // نطق واحد، وتلاتة ورا بعض ≈ ٨.٠ث > ٦ ⇒ **قراءة النطق الكامل بتترمى**
      // (واللي `voicexAdmission.ts:19-24` مكتوب فيه بالحرف إن رميها = لوحة
      // ضايعة) و**عدّاد «نوافذ اتخطّت» بيقول صفر** فالمندوب والإدارة مايعرفوش.
      //
      // ⚠️ الحدود نفسها (٠.٦ / ٦) **مالهاش أي تغيير هنا** — تغييرها بيغيّر
      //    اللي الموديل بيسمعه ولازم يتقاس. اللي اتغيّر إنها بقت **بتتكلّم**.
      if (dur < 0.6) { opts.onSkip?.("utterance_too_short"); return; }
      if (dur > 6) { opts.onSkip?.("utterance_too_long"); return; }
      const from = Math.max(0, u.startSec - 0.15);
      const to = u.endSec + 0.15;
      // 🔴 كانت `&& inflight < MAX_INFLIGHT` — يعني **اللوحة تترمى** لو الموديل
      // مشغول. دلوقتي بتستنى دورها: الصوت لسه في الذاكرة الدوّارة (٩٠ث) فالقصّ
      // المتأخّر بيدّي نفس البايتات، و`tMs` مركز النطق مش وقت الوصول فالإجماع
      // مايتلخبطش.
      // 🔒 بلا `fixes`: السلوك القديم بالحرف — الرمي لو مشغول، بلا طابور.
      if (!FIXES) {
        if (inflight < maxInflight) sliceAndSend(from, to);
        else opts.onSkip?.("utterance_dropped_legacy");
        return;
      }
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
  /**
   * 🔴 **النوافذ الفايتة** (`fixes` بس) — اتخطّت «مشغول» أو اتبعتت وفشلت.
   * أول رد ناجح بعد الوقعة بيبدأ يبعتها تاني من ذاكرة الميك (٩٠ث).
   * شوف `lib/voicexReplay.ts` — ٧ لوحات ضاعوا في وقعة ٢٢ث في آخر تجربة.
   */
  const missed = new MissedWindows();
  /** آخر رد: نجح ولا لأ. الإعادة بتستنى رد ناجح (مافيش لازمة تعيد والشبكة واقعة). */
  let networkOk = true;
  /** بدايات الطلبات الجارية — عشان نعرف لو فيه طلب معلّق (`isStalled`). */
  const inflightStarts = new Map<Promise<void>, number>();

  // يبعت نافذة WAV واحدة، يطبّق حواجز المعمل، يضيف اللوحات للإجماع. مايلمسش المؤقتات.
  async function sendWav(
    wav: Blob, tMs: number,
    /** نجح ولا لأ — للإعادة (`fixes`). */
    onOutcome?: (ok: boolean) => void,
    /** نافذة فايتة بتتبعت تاني؟ فشلها **مابيقرّبش** من «النفق واقع». */
    isReplay = false,
  ): Promise<void> {
    try {
      // 🔍 `onError` بيدّي **الكود الحقيقي** (`http_503` · `timeout` ·
      // `network` · `bad_token` …). من غيره كل فشل بيبان «الطلب فشل» وخلاص،
      // وبنفضل نخمّن السبب بدل ما الجهاز يقوله.
      let lastErr: string | null = null;
      const t0 = Date.now();
      const resp = await postAudioForPlate(wav, {
        transcribeUrl: opts.transcribeUrl, token: opts.token,
        mimeType: "audio/wav", timeoutMs: REQ_TIMEOUT_MS, agentId: opts.agentId,
        onError: (code: string) => { lastErr = code; },
      });
      const msWall = Date.now() - t0;
      if (!resp) {
        /**
         * ⚠️ فشل الإعادة **مابيتعدّش** في `fails`: الإعادة بتحصل بس والشبكة
         * بان إنها رجعت، ولو اتعدّت كانت هتقرّب «النفق واقع» ⇒ التسجيل يقف.
         */
        if (!isReplay) {
          fails += 1;
          if (fails >= FATAL_FAILS) opts.onFatal?.("tunnel_down");
        }
        opts.onSkip?.((isReplay ? "replay_failed:" : "request_failed:") + (lastErr ?? "no_response"));
        try { onOutcome?.(false); } catch { /* ignore */ }
        return;
      }
      fails = 0;
      try { onOutcome?.(true); } catch { /* ignore */ }
      const confAll = typeof resp.meanLogprob === "number" ? Math.exp(resp.meanLogprob) : 0.6;
      const minLpAll = typeof resp.minLogprob === "number" ? resp.minLogprob : null;
      try {
        opts.onRead?.({
          rawText: String(resp.rawText ?? resp.plate ?? ""),
          plate: String(resp.plate ?? ""),
          accepted: !!resp.accepted,
          conf: confAll,
          minLogprob: minLpAll,
          blocked: minLpAll !== null && minLpAll < MIN_TOKEN_LOGPROB,
          tMs, msModel: resp.serverMs, msWall,
        });
      } catch { /* ignore */ }
      // زي المعمل: المرفوضة (accepted=false) ماتظهرش — بلا إسقاط تخمين.
      if (!resp.accepted) return;
      // ثقة النافذة = exp(mean_logprob) (زي المعمل) — أعلى ثقة تكسب في التصويت.
      const conf = typeof resp.meanLogprob === "number" ? Math.exp(resp.meanLogprob) : 0.6;
      /**
       * 🔴 **الحاجز المسطّح اتشال — كان بيرمي لوحات صح.**
       *
       * كان: أي نافذة أوطى توكن فيها < -0.5 تترمى **قبل الإجماع**. وده
       * بالظبط اللي `liveConsensus.ts:90-95` محذّر منه بالنص من زمان:
       * «الحاجز على الكل **بيرمي نص اللوحات الحقيقية**؛ عليها مفردة بس آمن».
       *
       * الدليل من تقرير المالك (٢٢ سبتمبر · ٢٩ لوحة · ١٦ قراءة اتحجبت):
       *   63.5  حطو6826          محجوب  91%
       *   65.0  حطو6826 اسط4324  محجوب  93%
       *   66.5  اسط4324          محجوب  88%
       * التلاتة **قراءات صحيحة** (اللوحتين في ورقته)، واتحجبوا، فاللوحتين
       * ماظهروش خالص.
       *
       * الصح: نمرّر `minLp` **للإجماع** — وهو بيطبّق الحاجز على القراءة
       * **المفردة** بس (`soloMinLp`)، واللي اتأكدت في نافذتين+ تعدّي لأن
       * **الاتفاق دليل**. كده حطو6826 (نافذتين) تعدّي، والاختراع المفرد يتحجب.
       */
      const minLp = typeof resp.minLogprob === "number" ? resp.minLogprob : undefined;
      // 🔒 بلا `fixes`: الحاجز المسطّح زي ما كان — النافذة كلها تترمى.
      if (!FIXES && minLp !== undefined && minLp < MIN_TOKEN_LOGPROB) return;
      // زمن الإجماع = **مركز النافذة** (زي المعمل) — عرض فوري ~٢.٥ث.
      for (const p of String(resp.plate || "").trim().split(/\s+/)) {
        const norm = p.replace(/\s+/g, "");
        if (WELL.test(norm)) consensus.add({ plate: norm, tMs, conf, minLp: FIXES ? minLp : undefined });
      }
    } catch { /* تجاهل — شبكة/تحليل */ }
  }

  // يقصّ نافذة [from,to] معلّاة (بعد بوابة السكوت) ويبعتها، ويتتبّع وعدها للإيقاف.
  function sliceAndSend(fromSec: number, toSec: number, isReplay = false): void {
    // 🔴 التلات رجعات دي كانت **صامتة تماماً**: المندوب بيتكلّم، الشاشة بتقول
    // «بيسمع صوتك» (الكاشف محلي)، و**ولا بايت بيخرج من الجهاز** — ومحدش يعرف
    // ليه. دلوقتي كل واحدة بتتبلّغ باسمها.
    if (toSec - fromSec < 0.6) { opts.onSkip?.("too_short"); return; }
    // 🔇 بوابة السكوت على الصوت الخام قبل التعلية (زي المعمل).
    const q = mic.sliceQuality(fromSec, toSec, 0.2);
    if (q && !audioPregate(q).accept) { opts.onSkip?.("silence_gate"); return; }
    const wav = mic.sliceWav(fromSec, toSec, 0.2, true);   // خام معلّى
    if (!wav) { opts.onSkip?.("slice_failed"); return; }
    // مقطع فاضي بيعدّي الحارس فوق (Blob بترويسة بس) وبيترفض بعدين من غير سبب.
    if (wav.size < 2048) { opts.onSkip?.(("empty_slice:" + wav.size)); return; }
    const tMs = ((fromSec + toSec) / 2) * 1000;
    inflight += 1;
    opts.onStatus?.("processing");
    try { opts.onAudioWindow?.(wav, tMs); } catch { /* ignore */ }
    const pr = sendWav(wav, tMs, (ok) => {
      if (!FIXES) return;
      networkOk = ok;
      // 🔴 فشلت ⇒ تتسجّل وتتبعت تاني لما الشبكة ترجع (الصوت لسه في الذاكرة)
      if (!ok) missed.record(fromSec, toSec, mic.elapsedSec);
    }, isReplay);
    inflightSet.add(pr);
    inflightStarts.set(pr, Date.now());
    void pr.finally(() => {
      inflight -= 1;
      inflightSet.delete(pr);
      inflightStarts.delete(pr);
      drainPending();          // 🔴 سلوت فضي ⇒ أول قراءة نطق مستنية تمشي فوراً
      drainReplay();           // وبعدها الفايتة — بس لو الشبكة رجعت
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

  /**
   * 🔴 **يبعت النوافذ الفايتة تاني** — بعد ما الشبكة ترجع (`networkOk`).
   *
   * الأقدم الأول، و**سلوت واحد ساعة الفراغ بس** (`canReplay`): بعد وقعة ٢٢ث
   * فيه ~١٥ نافذة، ولو اتبعتوا مرة واحدة كانوا هيأخّروا اللوحات **الحيّة**.
   * الإجماع شغّال بزمن الصوت، فالقراية المتأخّرة بتدخل عنقودها الصح.
   *
   * ⚠️ **مافيش شرط `!stopped` عن قصد** — زي `drainPending`: `finalize`
   *    بينده الدالة دي بعد الإيقاف وقبل ما الميك يتقفل، فوقعة قبل «إيقاف»
   *    على طول مابتضيّعش آخر اللوحات.
   */
  function drainReplay(): void {
    if (!FIXES || !networkOk) return;
    let guard = 0;
    while (guard++ < 100 && canReplay(inflight, maxInflight, pending.length)) {
      const w = missed.take(mic.elapsedSec);
      if (!w) break;
      const before = inflight;
      sliceAndSend(w.from, w.to, true);
      // اتبعتت فعلاً (مش سكوت/قصّ فاشل) ⇒ نعدّها
      if (inflight > before) { try { opts.onReplay?.(); } catch { /* ignore */ } }
    }
  }

  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    // 🎯 اقرا أثناء الكلام، وبعده **لطول النافذة** — من غير كده آخر لوحة
    //    في النطقة بتاخد نافذة واحدة بس وتتحجب كقراءة مفردة. شوف
    //    `shouldSlideWindow` (بلاغ المالك ٢٣ سبتمبر: «آخر لوحة مش بتطلع»).
    if (!shouldSlideWindow(speaking, elapsed, lastSpokeSec, WIN_S)) return;
    // النافذة الزاحفة **فايضة بالتصميم** (كل ١.٥ث على آخر ٥ث، متداخلة)، فهي
    // اللي تتنازل: للسقف، ولأي قراءة نطق مستنية. والتخطّي **بيتبلّغ** دلوقتي
    // بدل `return` أخرس — ده كان نص الباج.
    const plan = planVoicexAdmission({
      source: "window", inflight, maxInflight, utteranceQueued: pending.length > 0,
    });
    if (plan !== "send") {
      opts.onSkip?.(pending.length > 0 ? "yield_to_utterance" : "busy_window");
      /**
       * 🔴 اتخطّت **وقت وقعة** ⇒ تتسجّل وتتبعت تاني لما الشبكة ترجع.
       * ⚠️ **وقت الوقعة بس** (`isStalled`): «مشغول» بيحصل في التشغيل العادي
       * كمان والنوافذ المتداخلة بتغطّيه — تسجيلهم كلهم كان هيعيد إرسال نوافذ
       * كل جلسة بلا أي مشكلة شبكة.
       */
      if (FIXES && isStalled(networkOk, [...inflightStarts.values()], Date.now())) {
        missed.record(Math.max(0, elapsed - WIN_S), elapsed, elapsed);
      }
      return;
    }
    sliceAndSend(Math.max(0, elapsed - WIN_S), elapsed);
  }, STEP_MS);

  const drainTimer = setInterval(() => {
    if (stopped) return;
    // 🔴 **بتوقيت النطق مش الحائط.** كان `mic.elapsedSec * 1000` خام، والقراءة
    // بتوصل بعد نطقها بـ(نص نافذة + شبكة) فكل عنقود كان بيتصرّف فوراً بـmult=1
    // والإجماع مايتجمّعش أصلاً. شوف `drainClockMs`.
    // 🔒 بلا `fixes`: الساعة الخام زي ما كانت (الإجماع مايتجمّعش).
    const clock = FIXES ? drainClockMs(mic.elapsedSec * 1000, WIN_S) : mic.elapsedSec * 1000;
    for (const c of consensus.drain(clock)) {
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
    for (let guard = 0; guard < 50 && (pending.length > 0 || inflightSet.size > 0 || (FIXES && networkOk && missed.size > 0)); guard++) {
      drainPending();
      drainReplay();   // 🔴 وقعة قبل «إيقاف» على طول مابتضيّعش آخر اللوحات
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
    get audioNowMs() { return mic.elapsedSec * 1000; },
    get lastVoiceEndMs() {
      const v = vad?.lastVoiceEndSec ?? 0;
      return v > 0 ? v * 1000 : null;
    },
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

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
 * (إلا مع `netResilience` — «الجديد» للسوبر أدمن بس: وضع النت الضعيف بدل
 * الوقوع، شوف `VoicexEngineOpts.netResilience`.)
 */
import { MissedWindows, REPLAY_MAX_AGE_SEC, canReplay, isStalled } from "./voicexReplay";
import { postAudioForPlate } from "./plateJudgeClient";
import { LiveConsensus, drainClockMs } from "./liveConsensus";
import { FleetMemory } from "./fleetPairs";
import { MicEngine } from "./micEngine";
import { MicLossDetector, stopsRecording, type MicLossReason } from "./micLoss";
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
 * 🐢 جسّات وضع النت الضعيف (`netResilience` بس): أول جسّة بعد ٣ث، وكل جسّة
 * بتفشل بتضاعف الفترة (٦ · ١٢) لحد سقف ٢٠ث، وأي رد ناجح بيرجّعها من الأول.
 * السقف ٢٠ث عشان الإعادة: الصوت الفايت بيعيش ٧٥ث بس (`REPLAY_MAX_AGE_SEC`)،
 * فجسّة كل ٢٠ث بتلحق تكتشف رجوع الشبكة والفايت لسه في الذاكرة.
 *
 * ⚠️ الفترة بتتحسب من **بداية** الجسّة اللي فاتت مش من نهايتها: على النت
 *    الضعيف بجد الجسّة بتفشل بالمهلة (٩ث)، فالحساب من النهاية كان بيمطّ
 *    الفجوة لـ٢٠ + ٩ + دقّة المؤقّت ≈ ٣٠ث (مراجعة ٣ أكتوبر: الشبكة رجعت ١٧٠ث
 *    واتكشفت ١٩٤ث، ولوحات ١٠٢–١١٨ث عدّى عليها الـ٧٥ث وضاعت).
 */
const WEAK_PROBE_FIRST_MS = 3000;
const WEAK_PROBE_MAX_MS = 20000;

/**
 * ⏱️ **٣ دقايق** وضع ضعيف من غير ولا رد ناجح ⇒ المحرّك بيستسلم (`net_lost`)
 * والصفحة بتقفل التسجيل (`netResilience` بس).
 *
 * ليه نستسلم أصلاً؟ الصوت الفايت بيعيش في ذاكرة الموبايل **٧٥ث بس**
 * (`REPLAY_MAX_AGE_SEC`). بعد ٣ دقايق من غير رد، كل اللي اتقال قبل آخر
 * ٧٥ث **ضاع كده كده** — وكمالة التسجيل والشريط بيقول «اللوحات هتظهر لما النت
 * يرجع» بقت **كدبة** على المندوب: هو بيتكلّم وفاكر إنه بيتسجّل. الأصدق إننا
 * نقف ونقوله إن النت مقطوع بقاله ٣ دقايق، فيعيد اللوحات لما النت يرجع.
 * ومراجعة ٣ أكتوبر: نفق ميت/سيرفر واقع بيوصل للمتصفّح كـ`network` (رد
 * Cloudflare من غير CORS) — من غير الحد ده الجلسة كانت بتجسّ للأبد (١٥ دقيقة
 * في المحاكاة: ٠ لوحات وولا وقوع).
 *
 * ⚠️ **الاستسلام بدليل بس**: بعد الـ٣ دقايق بنبعت جسّة **على طول** (من غير ما
 *    نستنى ميعادها) وفشلها هو اللي بيوقّف. ولو المندوب ساكت ومفيش صوت يتجسّ
 *    بيه، بنستنى لحد ما يتكلّم — مانقولّوش «النت مقطوع» من غير ما نكون جرّبنا.
 * ⚠️ **والدليل = جسّة بدأت بعد الحد** (مراجعة ٣ أكتوبر): جسّة اتبعتت عند
 *    +١٧٨.٥ث وفشلت بالمهلة عند +١٨٧.٥ث كانت بتستسلم — والنت كان رجع عند +١٧٩ث،
 *    فالمندوب شاف «النت مقطوع» بعد ٨ث من رجوعه وآخر ٧٥ث لوحات ماتعادتش. جسّة
 *    قديمة زي دي دلوقتي بتبعت جسّة جديدة على طول بدل الاستسلام (`probeDone`).
 */
export const WEAK_NET_GIVE_UP_MS = 180_000;

/**
 * 🧭 **الأغلبية**: من الـ٨ فشل (`FATAL_FAILS`) لو ≥٥ نت موبايل ⇒ وضع النت الضعيف
 * (`netResilience` بس). مراجعة ٣ أكتوبر: رد سيرفر **واحد** وسط ٧ فشل نت كان
 * بيطلّع «السيرفر مش بيرد — مش مشكلة النت»، ودي حاجة المحرّك مايعرفهاش. أقل من
 * ٥ ⇒ وقوع بأوضح سبب زي الأول. التوكن (401/403) في **أي مكان** في السلسلة ⇒
 * `auth_rejected` على طول (الإعادة عمرها ما هتحلّه).
 */
export const WEAK_NET_MAJORITY = 5;

/**
 * 🚇 كود الوقوع لما النفق هو الواقع (`server_down` + الكود ده): فحص الوصول
 * (`checkReachable`) قال إن نت الموبايل واصل للسيرفر، وجسّة بدأت بعده رجعت
 * `network` برضه ⇒ المتصفّح شاف رد من غير CORS (صفحة Cloudflare ٥٣٠/٥٠٢).
 * `fatalText` في `lib/voiceProSmooth.ts` بيعرف النص ده بالحرف.
 */
export const TUNNEL_ERROR_CODE = "tunnel_error";

/**
 * 🔌 سقف المحرّك نفسه لفحص الوصول — الصفحة بتديله مهلة ٤ث، بس لو حد بعت دالة
 * بتعلّق للأبد ماينفعش الجلسة تعلّق معاها (الجسّات بتستنى الفحص، والاستسلام
 * كمان). أي رد بعده = «مش واصل».
 */
export const REACH_CHECK_MAX_MS = 5000;

/**
 * ⏹️ ميزانية الإيقاف (`netResilience` بس) — **نفس مهلة الصفحة**
 * (`STOP_SETTLE_MAX_MS` في `registration-v2/page.tsx`): الصفحة مابتستناش أكتر
 * من كده أصلاً، فأي شغل بعدها كان **في الخلفية على الفاضي** (مراجعة ٣ أكتوبر:
 * الشبكة رجعت لحظة الإيقاف ⇒ ٤٧ طلب و٥٥ث بعد الإيقاف).
 */
export const NET_STOP_BUDGET_MS = 15_000;
/**
 * ⏹️ سقف النوافذ الفايتة اللي بتتبعت تاني **بعد** الإيقاف (`netResilience` بس)
 * — **الأحدث الأول**: آخر لوحات اتقالت قبل «إيقاف» هي اللي المندوب مستنيها.
 * ١٦ نافذة (كل ١.٥ث، طول ٥ث) ≈ آخر ~٢٧ث صوت.
 */
export const NET_STOP_MAX_REPLAYS = 16;

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🧭 الفشل ده من مين؟ (`netResilience` بس)
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٣ أكتوبر ٢٠٢٦): «مايحصلش غير في حالة النت الضعيف أوي فقط». مراجعتين
 * نفس اليوم:
 *   · الوضع كان بيبدأ مع **أي** ٨ فشل — توكن اتلغى (`http_401`) أو رد مش مفهوم
 *     (`bad_json`) كانوا بيعملوا جلسة بتجسّ للأبد.
 *   · وبعد التصليح لسه `http_429/502/503/504/52x` كانوا «نت ضعيف» — ودول
 *     **ردود** من Cloudflare/السيرفر، يعني نت الموبايل **شغّال** والعطل عند
 *     السيرفر. الشريط كان بيقول «النت ضعيف» وده مش صح.
 *
 * فالتقسيمة:
 *   · `net`       — نت الموبايل: `timeout` · `network` · `no_response` (ولا كود)
 *                   ⇐ **ده بس** اللي بيدخّل وضع النت الضعيف (لو أغلبية الـ٨ —
 *                   `WEAK_NET_MAJORITY`). و`network` بالذات ممكن يبقى نفق ميت
 *                   (رد من غير CORS) ⇒ `checkReachable` هو اللي بيفرّق
 *   · `auth`      — `http_401` · `http_403` · `bad_token`: التوكن/الصلاحية
 *   · `bad_reply` — `bad_json` · `bad_shape`: رد وصل بس مش مفهوم
 *   · `server`    — أي `http_NNN` تاني (429 · 5xx · 52x · 404 · 400 …): السيرفر أو
 *                   النفق **رد** ⇒ نت الموبايل شغّال والعطل هناك
 *   · `unknown`   — أي حاجة تانية (`error` …)
 *
 * ⚠️ رد اتقطع وهو بيتقري (النت وقع في نص الجسم) بيطلع من `plateJudgeClient`
 *    كـ`bad_json` ⇒ بيتحسب «مش نت» ويوقع — الغلط في الاتجاه الآمن (وقوع زي
 *    النهارده، مش جلسة بتجسّ).
 */
export type VoicexFailureClass = "net" | "auth" | "bad_reply" | "server" | "unknown";

export function failureClassOf(code: string | null | undefined): VoicexFailureClass {
  if (code == null || code === "" || code === "no_response") return "net";
  if (code === "timeout" || code === "network") return "net";
  if (code === "http_401" || code === "http_403" || code === "bad_token") return "auth";
  if (code === "bad_json" || code === "bad_shape") return "bad_reply";
  if (/^http_\d{3}$/.test(code)) return "server";
  return "unknown";
}

/** نت الموبايل بس — الوحيد اللي بيدخّل وضع النت الضعيف (`failureClassOf`). */
export function isWeakNetFailure(code: string | null | undefined): boolean {
  return failureClassOf(code) === "net";
}

/**
 * ⛔ سبب الوقوع اللي الصفحة بتشوفه (`netResilience` بس — من غيره `tunnel_down`
 * دايماً زي النهارده). الكود الخام بيتبعت معاه معامل تاني.
 *   · `net_lost`      — نت الموبايل مقطوع ٣ دقايق (`WEAK_NET_GIVE_UP_MS`)
 *   · `auth_rejected` — التوكن/الصلاحية اترفضت (401/403): مش النت
 *   · `bad_reply`     — السيرفر رد بس ردّه مش مفهوم
 *   · `server_down`   — السيرفر/النفق رد بعطل (429 · 5xx · 52x · 4xx تاني):
 *                       النت شغّال والعطل عند السيرفر. ومعاه `tunnel_error`
 *                       (`TUNNEL_ERROR_CODE`) لما فحص الوصول يثبت إن الـ`network`
 *                       ده نفق ميت مش نت الموبايل
 *   · `tunnel_down`   — كود مش معروف بجد (`error` …) — نفس سبب النهارده
 */
export type VoicexFatalReason = "tunnel_down" | "auth_rejected" | "bad_reply" | "server_down" | "net_lost";

const REASON_OF_CLASS: Readonly<Record<VoicexFailureClass, VoicexFatalReason>> = {
  net: "net_lost",
  auth: "auth_rejected",
  bad_reply: "bad_reply",
  server: "server_down",
  unknown: "tunnel_down",
};

export function fatalReasonFor(code: string | null | undefined): VoicexFatalReason {
  return REASON_OF_CLASS[failureClassOf(code)];
}

/**
 * 🧭 سلسلة فيها أكتر من نوع فشل ⇒ أوضح سبب يكسب: التوكن الأول (الإعادة عمرها
 * ما هتحلّه — لازم توكن جديد)، بعده السيرفر (البوابة قالت صراحةً إنه مش واصل)،
 * بعده الرد المش مفهوم (ممكن يكون رد اتقطع)، وفي الآخر المش معروف. ونفس
 * النوع ⇒ آخر كود (زي ما كان). (ده بعد قرار الأغلبية — `WEAK_NET_MAJORITY`.)
 */
const CLASS_RANK: Readonly<Record<VoicexFailureClass, number>> = {
  net: 0, unknown: 1, bad_reply: 2, server: 3, auth: 4,
};

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
  /**
   * ⛔ المحرّك استسلم. من غير `netResilience`: `tunnel_down` / `mic_denied`
   * **بمعامل واحد بس، زي النهارده بالحرف**. بـ`netResilience`: السبب الحقيقي
   * (`fatalReasonFor` — `server_down` · `auth_rejected` · `bad_reply` ·
   * `net_lost` · `tunnel_down` للمش معروف) والكود الخام (`http_503` ·
   * `network` …) معامل تاني — عشان الصفحة تقول للمندوب السبب الصح.
   */
  onFatal?: (reason: string, code?: string) => void;
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
   * و`netResilience` بس: `weak_net` (نافذة اتسجّلت للإعادة بدل ما تتبعت) ·
   *   `utterance_expired` (نطق استنى أكتر من نافذة الإعادة ٧٥ث فاتشال) ·
   *   `net_lost` (نطق جه بعد الاستسلام — الصفحة بتقفل التسجيل قبلها عادةً)
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
   * 🐢 **وضع النت الضعيف** — مقفول افتراضياً. «الجديد» بيبعته **للسوبر أدمن
   * بس** لحد ما المالك يجرّب؛ «صوتي» والمناديب مابيبعتوهوش فسلوكهم بالحرف.
   *
   * المالك (٣ أكتوبر ٢٠٢٦): «خلي ده مايحصلش غير في حالة النت الضعيف أوي فقط
   * لأنه هيأخر ظهور اللوحات وكمان هيتقل الموبايل مع المندوب، فدي تبقى في
   * الضرورة القصوى فقط».
   *
   * ⇒ عشان كده الوضع **مابيبدأش غير في نفس اللحظة** اللي المحرّك كان بيستسلم
   *   فيها (`FATAL_FAILS` = ٨ فشل متتالي) — قبلها ولا حرف اتغيّر — و**بس لو
   *   أغلبية الـ٨ (≥٥) من نت الموبايل** (`timeout`/`network`/`no_response` —
   *   `isWeakNetFailure` · `WEAK_NET_MAJORITY`). توكن اترفض في أي مكان في
   *   السلسلة، أو أقل من ٥ نت (السيرفر/النفق رد بـ429/5xx/52x، رد مش مفهوم…) ⇒
   *   وقوع زي النهارده بالسبب الحقيقي (`fatalReasonFor`). ولو السلسلة فيها
   *   `network` ⇒ فحص الوصول (`checkReachable`) يفرّق النفق الميت عن الموبايل
   *   الأوفلاين. وبدل `onFatal("tunnel_down")` المحرّك **بيهدّي**:
   *   · النوافذ العادية (كل ١.٥ث) بتقف — بتتسجّل بس للإعادة زي ما هي
   *     (`MissedWindows`، محدودة ٦٠ نافذة / ٧٥ث — مافيش ذاكرة جديدة).
   *   · **جسّة واحدة** على فترات بتطول (٣ · ٦ · ١٢ · ٢٠ث سقف، محسوبة من
   *     بداية الجسّة اللي فاتت). جسّة رجعت فشل مش نت ⇒ وقوع برضه.
   *   · قراءات النطق بتستنى في نفس الطابور بنفس السقف (٣) — **الأحدث يكسب**
   *     (الأقدم يترمى)، واللي عدّى عليه ٧٥ث يتشال (صوته طالع برّه الذاكرة).
   *   أول رد ناجح ⇒ `onWeakNet(false)` والإرسال العادي يرجع، والإعادة
   *   الموجودة بتصرّف اللي فات (فاللوحات اللي اتقالت وقت الوقعة بتظهر).
   *   ٣ دقايق من غير ولا رد ناجح ⇒ `onFatal("net_lost")` ومافيش إرسال تاني
   *   (`WEAK_NET_GIVE_UP_MS`). والإيقاف بعده **خفيف**: ١٥ث بالكتير و١٦ نافذة
   *   فايتة بالكتير، الأحدث الأول (`NET_STOP_BUDGET_MS` · `NET_STOP_MAX_REPLAYS`).
   *
   * ومعاه `onFatal` بيتنده **مرة واحدة بالكتير** و**عمره ما يتنده بعد
   * `stop()`** — جلسة قديمة ماتقدرش تقفل جلسة أحدث.
   */
  netResilience?: boolean;
  /**
   * 🐢 `true` مرة لما وضع النت الضعيف يبدأ، و`false` مرة لما الشبكة ترجع
   * (`netResilience` بس). **مابيتندهش بعد `stop()`**.
   */
  onWeakNet?: (weak: boolean) => void;
  /**
   * 🔌 **نفق واقع ولا نت الموبايل؟** (`netResilience` بس — من غيره مابيتندهش
   * خالص). `true` = نت الموبايل واصل لحد السيرفر (الصفحة: `fetch` no-cors
   * لـ`/health` رجع **أي** رد خلال ٤ث)، `false` = مش واصل. رمية/تعليق = `false`
   * (`REACH_CHECK_MAX_MS`).
   *
   * مراجعة ٣ أكتوبر: نفق ميت/سيرفر واقع بيوصل للمتصفّح كـ`network` (رد Cloudflare
   * من غير CORS) — زي موبايل أوفلاين بالظبط، فكان «النت ضعيف» ٣ دقايق وبعدين
   * «النت مقطوع» والنت شغّال. المحرّك بيسأل بيه في لحظتين بس، و**لـ`network`
   * بس** (`timeout`/`no_response` = رفع بطيء، مالوش دعوة بالوصول):
   *   · دخول الوضع والسلسلة فيها `network` ⇒ واصل ⇒ جسّة **فورية**، ولو رجعت
   *     `network` تاني وفحص تاني لسه واصل ⇒ `onFatal("server_down",
   *     "tunnel_error")` مرة واحدة. الجسّة نجحت ⇒ خروج عادي. مش واصل ⇒ ضعيف.
   *   · الاستسلام بعد ٣ دقايق وآخر فشل `network` ⇒ واصل ⇒ `server_down` بالكود،
   *     مش واصل ⇒ `net_lost`.
   */
  checkReachable?: () => Promise<boolean>;
  /**
   * 📞 **الميك اتاخد** — مكالمة (تليفون/واتساب) أو تطبيق تاني (`fixes` بس).
   *
   * ⚠️ بعته = **أولوية المكالمة كلها**: الكاشف + الميك بيتساب فوراً وقت
   * الإيقاف. «صوتي» مابتبعتوش فمافيش أي تغيير عليها.
   *
   * المالك (٢٣ سبتمبر ٢٠٢٦): «المكالمة يبقى ليها الأولوية، وتلقائي المسجّل
   * يفصل لو جه مكالمة». الصفحة بتوقف التسجيل لما ده يتنده. بيتنده مرة واحدة.
   * شوف `lib/micLoss.ts`.
   */
  onMicLost?: (reason: MicLossReason) => void;
  /**
   * 🚚 **أسطول متسلسل** (`حبل1234 حبل1235 حبل1236`) — لوحتين بنفس الحروف
   * وأرقام متسلسلة **اتسمعوا في نافذة واحدة** = عربيتين، فالإجماع مابيلمّهمش
   * في لوحة واحدة. «الجديد» بس اللي بيبعته — «صوتي» زي ما هي بالحرف.
   * شوف `lib/fleetPairs.ts`.
   */
  fleetSplit?: boolean;
  /**
   * 🔒 **التسلسل الفوري** للأسطول (`FleetMemory({ sequence })`) — «الجديد» بيبعته
   * للسوبر أدمن بس لحد ما المالك يجرّب. من غيره `fleetSplit` زي ما كان بالحرف.
   */
  fleetSequence?: boolean;
  /** 🔒 «أول عربية في الأسطول» (`FleetMemory({ firstCar })`) — السوبر أدمن بس لحد ما المالك يجرّب. */
  fleetFirstCar?: boolean;
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
  /**
   * بيرجّع وعد بيخلص لما **آخر اللوحات** توصل (النوافذ الجارية + التصريف
   * الأخير) — عشان الصفحة ماتسمحش بتحديث تلقائي في النص. اللي مش محتاجه
   * يتجاهله عادي.
   */
  stop: () => Promise<void>;
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

  /**
   * 🐢 وضع النت الضعيف — شوف `VoicexEngineOpts.netResilience`. `weak` عمره
   * ما يبقى `true` من غير العلم، فكل فرع `if (weak)` تحت **مابيتنفّذش أصلاً**
   * لـ«صوتي» والمناديب.
   */
  const NET = opts.netResilience === true;
  let weak = false;
  /** فيه جسّة طايرة دلوقتي؟ — جسّة واحدة بس في المرة. */
  let probing = false;
  let probeDelayMs = WEAK_PROBE_FIRST_MS;
  let nextProbeAt = 0;
  /** بداية آخر جسّة — الجسّة الجاية بتتحسب منها (مش من نهايتها). */
  let probeStartedAt = 0;
  /** `onFatal` اتنده خلاص؟ (`netResilience` بس) */
  let fatalFired = false;
  /**
   * 🧭 جوّه سلسلة الفشل الحالية (`fails`): أوضح فشل **مش من نت الموبايل**
   * (بالأولوية — `CLASS_RANK`) وكوده، و`null` = السلسلة كلها نت موبايل.
   * بيتصفّر مع أي رد ناجح زي `fails`، وبيتعدّ بالعلم بس (`netResilience`).
   */
  let streakWorst: { cls: VoicexFailureClass; code: string } | null = null;
  /** آخر كود فشل (بالعلم بس) — بيتبعت مع `net_lost`. */
  let lastFailCode: string | null = null;
  /**
   * 🧭 أكواد آخر `FATAL_FAILS` فشل في السلسلة الحالية (بالعلم بس) — للأغلبية
   * (`WEAK_NET_MAJORITY`) وعشان نعرف لو فيها `network` (فحص الوصول).
   */
  const streakCodes: string[] = [];
  /**
   * 🔌 رقم «الوقعة» الحالية — بيزيد مع كل دخول/خروج من الوضع الضعيف. أي فحص
   * وصول رجع وهو مش نفس الرقم = عن وقعة خلصت ⇒ مالوش أثر.
   */
  let weakGen = 0;
  /** 🔌 فيه فحص وصول طاير؟ — الجسّات بتستناه (عشان ترتيب الدليل يبقى صح). */
  let reachBusy = false;
  let reachSeq = 0;
  /**
   * 🔌 فحص الوصول قال «واصل» في اللحظة دي (و`0` = مافيش شك). أول جسّة **تبدأ**
   * بعدها هي جسّة التأكيد: `network` ⇒ فحص تاني ⇒ نفق واقع؛ أي نتيجة تانية ⇒
   * الشك بيتشال.
   */
  let tunnelSuspectAt = 0;
  /** كود فشل الجسّة الطايرة (جسّة واحدة في المرة) — `null` = لسه/نجحت. */
  let probeFailCode: string | null = null;
  /** ⏱️ لحظة دخول وضع النت الضعيف — الاستسلام بعد `WEAK_NET_GIVE_UP_MS` منها. */
  let weakSince = 0;
  /**
   * ⏱️ استسلمنا (`net_lost`) — **نهائي**: مافيش جسّات ولا إعادة ولا طابور بعده،
   * ولا رجوع للعادي حتى لو جسّة قديمة طايرة نجحت (الصفحة قفلت التسجيل خلاص).
   */
  let gaveUp = false;
  /** ⏹️ (`netResilience` بس) آخر لحظة مسموح فيها نبعت حاجة بعد الإيقاف. */
  let stopDeadline = 0;
  /** ⏹️ كام نافذة فايتة اتبعتت تاني بعد الإيقاف (سقف `NET_STOP_MAX_REPLAYS`). */
  let stopReplays = 0;
  /** ⏹️ الفايت بعد الإيقاف مترتّب بزمن الصوت — بنبعت من **آخره** (الأحدث الأول). */
  const stopTail: Array<{ from: number; to: number }> = [];

  /**
   * ⛔ النداء القاتل. **بلا العلم بالحرف زي ما كان** (بلا قفل، وبيتنده حتى
   * بعد الإيقاف). بالعلم: مرة واحدة بالكتير وعمره ما بعد `stop()` — المالك
   * وافق (٣ أكتوبر ٢٠٢٦) إن جلسة قديمة ماينفعش توقّف جلسة أحدث.
   */
  const fatal = (reason: string, code?: string) => {
    if (!NET) { opts.onFatal?.(reason); return; }
    if (fatalFired || stopped) return;
    fatalFired = true;
    if (code === undefined) opts.onFatal?.(reason);
    else opts.onFatal?.(reason, code);
  };

  /**
   * 🔌 فحص الوصول (`checkReachable`) — `false` لو مش متبعت، أو رمى، أو علّق أكتر
   * من `REACH_CHECK_MAX_MS`. مابيرميش. `reachBusy` بيفضل `true` لحد ما **آخر**
   * فحص يخلص (الجسّات بتستناه — شوف `weakTick`).
   */
  const reach = (): Promise<boolean> => {
    const my = ++reachSeq;
    reachBusy = true;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        if (my === reachSeq) reachBusy = false;
        resolve(v);
      };
      timer = setTimeout(() => done(false), REACH_CHECK_MAX_MS);
      try {
        const fn = opts.checkReachable;
        if (!fn) { done(false); return; }
        Promise.resolve(fn()).then((v) => done(v === true), () => done(false));
      } catch { done(false); }
    });
  };

  /**
   * 🔌 نتيجة فحص رجعت متأخّر — لسه تخصّ **نفس** الوقعة؟ (مش بعد الإيقاف ولا
   * الوقوع ولا الاستسلام، ولا بعد ما الشبكة رجعت أو وقعت تاني.)
   */
  const sameWeak = (gen: number) => !stopped && !fatalFired && !gaveUp && weak && gen === weakGen;

  /**
   * 🐢 الفشل الـ٨ المتتالي وأغلبيته نت موبايل (`WEAK_NET_MAJORITY`) — بالظبط
   * مكان `tunnel_down` القديم.
   */
  const enterWeakNet = () => {
    // بعد الوقوع الجلسة خلصت بالنسبة للصفحة — مافيش «نت ضعيف» بعده
    if (weak || stopped || fatalFired) return;
    weak = true;
    weakGen += 1;
    tunnelSuspectAt = 0;
    weakSince = Date.now();
    probing = false;
    probeDelayMs = WEAK_PROBE_FIRST_MS;
    nextProbeAt = Date.now() + probeDelayMs;
    try { opts.onWeakNet?.(true); } catch { /* ignore */ }
    /**
     * 🔌 السلسلة فيها `network` (فشل سريع من غير رد) ⇒ يا الموبايل أوفلاين يا
     * النفق ميت (رد Cloudflare من غير CORS بيبان كده بالظبط). `/health` وصل ⇒
     * نت الموبايل شغّال ⇒ جسّة **فورية** تأكّد. `timeout`/`no_response` بس = رفع
     * بطيء ⇒ مافيش فحص (الوصول لوحده عمره ما يوقّف سلسلة مهلات).
     */
    if (opts.checkReachable && streakCodes.includes("network")) {
      const gen = weakGen;
      void reach().then((ok) => {
        if (!ok || !sameWeak(gen)) return;
        tunnelSuspectAt = Date.now();
        nextProbeAt = Date.now();
      });
    }
  };

  /** 🐢 أي رد ناجح (جسّة أو طلب قديم كان طاير) ⇒ رجوع للعادي فوراً. */
  const leaveWeakNet = () => {
    // ⏱️ بعد الاستسلام مافيش رجوع: لو رجعنا للعادي المؤقّت كان هيبعت تاني
    // والصفحة قفلت التسجيل خلاص (أو هتقفله).
    if (!weak || gaveUp) return;
    weak = false;
    weakGen += 1;          // 🔌 أي فحص طاير بقى عن وقعة خلصت
    tunnelSuspectAt = 0;
    probeDelayMs = WEAK_PROBE_FIRST_MS;
    // الحالة بتتصفّر برضه بعد الإيقاف (عشان `finalize` يصرّف الفايت)، بس
    // الصفحة **ماتتندهش** — الجلسة دي خلصت بالنسبالها.
    if (!stopped) { try { opts.onWeakNet?.(false); } catch { /* ignore */ } }
  };

  /** ⏱️ عدّى على الوضع الضعيف ٣ دقايق من غير ولا رد ناجح؟ */
  const weakTooLong = () => weak && Date.now() - weakSince >= WEAK_NET_GIVE_UP_MS;

  /**
   * ⏱️ الاستسلام — مرة واحدة، ومش بعد الإيقاف. الطابور بيتفضّى (صوته هيعدّي
   * عليه ٧٥ث قبل ما يتبعت كده كده) ومافيش إرسال بعدها خالص (`gaveUp` من أول
   * لحظة، حتى وهو مستني الفحص).
   * 🔌 آخر فشل `network` ⇒ فحص الوصول بيقول مين: واصل ⇒ `server_down` (النت
   *    شغّال والسيرفر مابيردّش)، مش واصل ⇒ `net_lost`. `timeout`/`no_response`
   *    ⇒ `net_lost` زي ما كان (رفع بطيء). `unreachableKnown` = لسه فاحصين حالاً
   *    وقال «مش واصل» ⇒ مافيش داعي لفحص تاني.
   */
  const giveUp = (unreachableKnown = false) => {
    if (gaveUp || stopped || fatalFired) return;
    gaveUp = true;
    pending.length = 0;
    const code = lastFailCode ?? "no_response";
    if (code !== "network" || !opts.checkReachable || unreachableKnown) { fatal("net_lost", code); return; }
    // `fatal` نفسه بيتجاهل لو الإيقاف حصل وإحنا مستنيين
    void reach().then((ok) => { fatal(ok ? "server_down" : "net_lost", code); });
  };

  /**
   * 🚇 جسّة التأكيد رجعت `network` بعد ما `/health` وصل ⇒ فحص **تاني** (الدليل
   * لازم يبقى «واصل» لحظة الفشل نفسه، مش من ثواني): لسه واصل ⇒ النفق واقع ⇒
   * `server_down`/`tunnel_error` مرة واحدة. مش واصل ⇒ نت الموبايل وقع تاني ⇒
   * فاضل ضعيف (ولو الجسّة دي كانت دليل الاستسلام ⇒ `net_lost` على طول).
   */
  const confirmTunnel = (pastGiveUp: boolean) => {
    const gen = weakGen;
    void reach().then((ok) => {
      if (!sameWeak(gen)) return;
      if (ok) { fatal("server_down", TUNNEL_ERROR_CODE); return; }
      if (pastGiveUp) giveUp(true);
    });
  };

  /**
   * 🐢 الجسّة خلصت: لو لسه ضعيف (فشلت) ⇒ الفترة تتضاعف لحد السقف — ومحسوبة
   * من **بداية** الجسّة (شوف `WEAK_PROBE_FIRST_MS`): جسّة فشلت بالمهلة (٩ث)
   * والفترة ٦ث ⇒ الجاية على أول دقّة مؤقّت، مش بعد ٦ث كمان.
   * ⏱️ الاستسلام (`giveUp`) بفشل جسّة **بدأت** بعد الـ٣ دقايق بس. جسّة بدأت
   *    قبلها وفشلت بعدها ⇒ جسّة جديدة على طول (يمكن النت رجع وهي طايرة).
   * 🔌 أول جسّة بدأت بعد ما `/health` قال «واصل» هي جسّة التأكيد (`confirmTunnel`).
   */
  const probeDone = () => {
    probing = false;
    if (!weak || stopped || fatalFired || gaveUp) return;
    const startedAt = probeStartedAt;
    const pastGiveUp = startedAt - weakSince >= WEAK_NET_GIVE_UP_MS;
    probeDelayMs = Math.min(probeDelayMs * 2, WEAK_PROBE_MAX_MS);
    nextProbeAt = startedAt + probeDelayMs;
    if (tunnelSuspectAt > 0) {
      if (startedAt >= tunnelSuspectAt) {
        // الشك اتستهلك: `network` ⇒ نأكّد؛ غير كده (مهلة …) مش دليل نفق
        tunnelSuspectAt = 0;
        if (probeFailCode === "network") { confirmTunnel(pastGiveUp); return; }
      } else {
        nextProbeAt = Date.now();   // جسّة قديمة (قبل الفحص) — التأكيد يطلع على طول
      }
    }
    if (pastGiveUp) { giveUp(); return; }
    if (weakTooLong()) nextProbeAt = Date.now();   // ⏱️ قديمة فشلت بعد الحد ⇒ جسّة جديدة دلوقتي
  };

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

  /**
   * 🐢 (`netResilience` بس) قراءة نطق استنت أكتر من نافذة الإعادة (٧٥ث،
   * `REPLAY_MAX_AGE_SEC`) بتتشال: وقت ضعف النت الانتظار ممكن يطول دقايق،
   * وصوتها بيقرّب يطلع برّه ذاكرة الميك (٩٠ث) — قصّها كان هيدّي `slice_failed`
   * أو مقطع **ناقص** يتبعت للموديل. نفس قاعدة `MissedWindows` بالظبط.
   * الطابور مترتّب بالزمن (الأقدم الأول) فبنشيل من أوله.
   */
  function pruneStalePending(nowSec: number): void {
    const oldest = nowSec - REPLAY_MAX_AGE_SEC;
    while (pending.length > 0 && pending[0].from < oldest) {
      pending.shift();
      opts.onSkip?.("utterance_expired");
    }
  }

  // إعدادات الإجماع **زي المعمل بالحرف**: نافذة ٢ث single-linkage (أكبر من خطوة
  // الزحلقة ١.٥ث وأصغر من إيقاع نطق اللوحة ~٣.٤ث فالأسطول يتفصل)، العنقود يفضل
  // مفتوح ٢.٥ث بعد آخر قراءة، نافذتين+ = 🟢 مؤكّدة.
  const fleet = opts.fleetSplit ? new FleetMemory({ sequence: opts.fleetSequence === true, firstCar: opts.fleetFirstCar === true }) : null;
  const consensus = new LiveConsensus({
    windowMs: 2000, stableMs: 2500, greenMinMult: 2,
    distinct: fleet ? (a, b) => fleet.distinct(a, b) : undefined,
  });
  const emit = (p: string, meta: VoicexPlateMeta) => { if (WELL.test(p)) opts.onPlate(p, meta); };

  // يتعرّف قبل الميك عشان مرجع onChunk يكون آمن؛ يتبني بعد ما نعرف معدل العيّنات.
  let vad: Vad | null = null;

  /**
   * 📞 كاشف «الميك اتاخد» — `fixes` + الصفحة طلبته بس. «صوتي» مابيطلبوش
   * فالميك بتاعه **مابيتربطلوش أي مستمع زيادة**.
   */
  const lossOn = FIXES && typeof opts.onMicLost === "function";
  let loss: MicLossDetector | null = null;
  const reportLoss = (r: MicLossReason | null) => {
    if (!r || stopped || !stopsRecording(r)) return;
    try { opts.onMicLost?.(r); } catch { /* ignore */ }
  };

  // الـVad بيتغذّى من onChunk (الصوت **المعالَج**) — زي المعمل بالظبط.
  const mic = new MicEngine({
    mode: "live",
    onChunk: (pcm, startSec) => { try { vad?.push(pcm, startSec); } catch { /* ignore */ } },
    onLevel: (level) => { opts.onLevel?.(level); },
    ...(lossOn ? {
      // 🔴 **السكوت الرقمي مش متوصّل عن قصد** (بلاغ ٢٥ سبتمبر): كاتم ضوضاء
      // بعض الموبايلات بيطلّع صفر في كل سكتة، فكان بيقفل التسجيل بين اللوحات.
      // ومش بنغذّي الكاشف بيه كمان — لإن الكاشف بيبلّغ **مرة واحدة**، فلو
      // «سكوت» سبق كان هيقفل الباب قدام سبب حقيقي (الميك اتقفل) بعده.
      onTrackState: (st: "ended" | "muted" | "unmuted") => {
        if (!loss) return;
        if (st === "ended") reportLoss(loss.trackEnded());
        else if (st === "muted") loss.trackMuted(Date.now());
        else loss.trackUnmuted();
      },
      onContextState: (st: string) => { if (loss) reportLoss(loss.contextState(st)); },
    } : {}),
  });

  try {
    await mic.start();
  } catch {
    fatal("mic_denied");
    return null;
  }
  // 🎚️ معدّل العيّنات الحقيقي — أول رقم بيفرّق بين «جهازه بيرفع ٣ أضعاف»
  // و«الشبكة/السيرفر». بيتنده مرة واحدة، ومحميّ عشان كولباك بيرمي مايوقفش
  // فتح الميك (نفس عقد باقي الكولباكس في الملف ده).
  try { opts.onReady?.({ sampleRate: mic.sampleRate }); } catch { /* ignore */ }
  if (lossOn) loss = new MicLossDetector(mic.sampleRate);

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
      // 🐢 وقت ضعف النت (`netResilience` بس): مابنبعتش — القراءة بتستنى في
      // **نفس الطابور بنفس السقف** وبتمشي أول ما الشبكة ترجع (قبل الإعادة).
      // **الأحدث يكسب**: الطابور مليان ⇒ الأقدم هو اللي يترمى (كان العكس —
      // بعد وقعة طويلة الـ٣ القدام صوتهم بيطلع برّه الذاكرة والجديدة تضيع).
      if (weak) {
        // ⏱️ استسلمنا (`net_lost`) — الجلسة خلصت، مافيش حاجة تتبعت تاني
        if (gaveUp) { opts.onSkip?.("net_lost"); return; }
        pruneStalePending(mic.elapsedSec);
        if (pending.length >= MAX_PENDING_UTTERANCES) { pending.shift(); opts.onSkip?.("utterance_queue_full"); }
        pending.push({ from, to });
        return;
      }
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
    /**
     * 🐢 جسّة وضع النت الضعيف؟ (`netResilience` بس) — نتيجتها **بتتعدّ** حتى
     * لو إعادة: جسّة الإعادة في السكوت هي الطلب الوحيد اللي طالع، ولو رجعت
     * 401 ومااتعدّتش كانت الجلسة هتفضل «ضعيفة» للأبد.
     */
    probe = false,
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
        if (!isReplay || probe) {
          fails += 1;
          // 🧭 بالعلم بس: الفشل ده من نت الموبايل ولا من السيرفر/النفق؟
          let cls: VoicexFailureClass = "net";
          if (NET) {
            const code: string = (lastErr as string | null) ?? "no_response";
            lastFailCode = code;
            if (probe) probeFailCode = code;
            streakCodes.push(code);
            if (streakCodes.length > FATAL_FAILS) streakCodes.shift();
            cls = failureClassOf(code);
            if (cls !== "net" && (!streakWorst || CLASS_RANK[cls] >= CLASS_RANK[streakWorst.cls])) {
              streakWorst = { cls, code };
            }
          }
          // بلا العلم: `tunnel_down` زي ما كان (ومع كل فشل بعده).
          // 🐢 بالعلم: نفس اللحظة بالظبط —
          //    · التوكن في أي مكان في السلسلة ⇒ `auth_rejected`
          //    · أغلبية الـ٨ نت موبايل (`WEAK_NET_MAJORITY`) ⇒ وضع النت الضعيف
          //    · غير كده ⇒ وقوع زي النهارده بأوضح سبب فيها (مرة واحدة)
          //    وجوّه الوضع: الجسّة رجعت نت ⇒ فاضل ضعيف؛ رجعت رد سيرفر/توكن/رد
          //    بايظ ⇒ وقوع بأوضح سبب في السلسلة (زي ما كان).
          if (fails >= FATAL_FAILS) {
            if (!NET) fatal("tunnel_down");
            else if (weak) {
              if (cls !== "net" && streakWorst) fatal(REASON_OF_CLASS[streakWorst.cls], streakWorst.code);
            } else if (streakWorst && streakWorst.cls === "auth") {
              fatal(REASON_OF_CLASS.auth, streakWorst.code);
            } else if (streakCodes.filter(isWeakNetFailure).length >= WEAK_NET_MAJORITY || !streakWorst) {
              enterWeakNet();
            } else {
              fatal(REASON_OF_CLASS[streakWorst.cls], streakWorst.code);
            }
          }
        }
        opts.onSkip?.((isReplay ? "replay_failed:" : "request_failed:") + (lastErr ?? "no_response"));
        try { onOutcome?.(false); } catch { /* ignore */ }
        return;
      }
      fails = 0;
      streakWorst = null;   // 🧭 السلسلة خلصت (بيتقري بالعلم بس)
      streakCodes.length = 0;
      if (weak) leaveWeakNet();   // 🐢 أي رد ناجح = الشبكة رجعت
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
      const plates = String(resp.plate || "").trim().split(/\s+/)
        .map((p) => p.replace(/\s+/g, "")).filter((p) => WELL.test(p));
      // 🚚 الدليل **قبل** الإضافة: النافذة دي سمعت عربيات الأسطول دول مع بعض
      fleet?.note(plates, tMs, conf);
      for (const norm of plates) consensus.add({ plate: norm, tMs, conf, minLp: FIXES ? minLp : undefined });
    } catch { /* تجاهل — شبكة/تحليل */ }
  }

  // يقصّ نافذة [from,to] معلّاة (بعد بوابة السكوت) ويبعتها، ويتتبّع وعدها للإيقاف.
  function sliceAndSend(
    fromSec: number, toSec: number, isReplay = false,
    /** 🐢 جسّة وضع النت الضعيف؟ — نتيجتها بتحدّد الجسّة الجاية (`probeDone`). */
    probe = false,
  ): void {
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
    if (probe) { probing = true; probeStartedAt = Date.now(); probeFailCode = null; }
    opts.onStatus?.("processing");
    try { opts.onAudioWindow?.(wav, tMs); } catch { /* ignore */ }
    const pr = sendWav(wav, tMs, (ok) => {
      if (!FIXES) return;
      networkOk = ok;
      // 🔴 فشلت ⇒ تتسجّل وتتبعت تاني لما الشبكة ترجع (الصوت لسه في الذاكرة)
      if (!ok) missed.record(fromSec, toSec, mic.elapsedSec);
    }, isReplay, probe);
    inflightSet.add(pr);
    inflightStarts.set(pr, Date.now());
    void pr.finally(() => {
      inflight -= 1;
      inflightSet.delete(pr);
      inflightStarts.delete(pr);
      // 🐢 هنا مش في `onOutcome`: لو حاجة رمت جوّه `sendWav` النتيجة مابتوصلش،
      // و`probing` كان هيفضل `true` للأبد ⇒ مافيش جسّة تانية خالص.
      if (probe) probeDone();
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
    // 🐢 وقت ضعف النت بتستنى — إلا بعد الإيقاف: `finalize` بيحاول يبعتها زي
    //    النهارده بالظبط (يمكن الشبكة رجعت، وهي ٣ بالكتير).
    if (weak && !stopped) return;
    // ⏹️ (`netResilience` بس) بعد الإيقاف: جوّه الميزانية بس (`NET_STOP_BUDGET_MS`)،
    //    وبعد الاستسلام مافيش إرسال خالص — النداء ده بيتنده من `pr.finally` كمان،
    //    فمن غير الحارس ده كان بيكمّل في الخلفية بعد ما الصفحة خلصت.
    if (NET && stopped && !stopBudgetLeft()) return;
    // 🐢 (`netResilience` بس) اللي عدّى عليه ٧٥ث مايتقصّش — بعد رجوع الشبكة وبعد الإيقاف
    if (NET) pruneStalePending(mic.elapsedSec);
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
    // 🐢 `weak` = آخر رد فشل أصلاً (`networkOk` بـ`false`)؛ مكتوب صريح بس.
    if (!FIXES || !networkOk || weak) return;
    // ⏹️ (`netResilience` بس) بعد الإيقاف: محدود والأحدث الأول — `drainReplayAfterStop`
    if (NET && stopped) { drainReplayAfterStop(); return; }
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

  /** ⏹️ (`netResilience` بس) لسه جوّه ميزانية الإيقاف؟ — وبعد الاستسلام لأ. */
  function stopBudgetLeft(): boolean {
    return !gaveUp && Date.now() < stopDeadline;
  }

  /**
   * ⏹️ **الإعادة بعد الإيقاف** (`netResilience` بس) — بدل `drainReplay` العادية.
   *
   * مراجعة ٣ أكتوبر: وضع ضعيف والشبكة رجعت لحظة «إيقاف» ⇒ الإيقاف كان بيبعت
   * كل الفايت (لحد ٦٠ نافذة) **الأقدم الأول**، ٤٧ طلب و٥٥ث — والصفحة بطّلت
   * تستنى بعد ١٥ث، فالباقي كان شغل في الخلفية على الفاضي والموبايل تقيل.
   * هنا:
   *   · **الأحدث الأول** — آخر لوحات اتقالت قبل «إيقاف» هي اللي المندوب
   *     مستنيها، والأقدم أقرب لإنه يطلع برّه الذاكرة أصلاً.
   *   · بالكتير `NET_STOP_MAX_REPLAYS` نافذة، وجوّه `NET_STOP_BUDGET_MS` بس.
   *   · نفس سلوت الإعادة (`canReplay`) — طلب واحد في المرة.
   * أي نافذة فشلت بعد الإيقاف بتتسجّل في `missed` زي العادي، وبتدخل هنا تاني
   * (بزمن صوتها) — جوّه نفس السقف.
   */
  function drainReplayAfterStop(): void {
    if (!stopBudgetLeft()) return;
    const now = mic.elapsedSec;
    for (let w = missed.take(now); w; w = missed.take(now)) stopTail.push(w);
    stopTail.sort((a, b) => a.from - b.from);
    const oldest = now - REPLAY_MAX_AGE_SEC;
    while (stopTail.length > 0 && stopTail[0].from < oldest) stopTail.shift();
    while (stopReplays < NET_STOP_MAX_REPLAYS && stopTail.length > 0 && canReplay(inflight, maxInflight, pending.length)) {
      const w = stopTail.pop();
      if (!w) break;
      const before = inflight;
      sliceAndSend(w.from, w.to, true);
      if (inflight > before) {
        stopReplays += 1;
        try { opts.onReplay?.(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * 🐢 دقّة المؤقّت وقت ضعف النت (`netResilience` بس) — **شغل أقل مش أكتر**:
   *   · جسّة واحدة لما ميعادها ييجي ومافيش ولا طلب طاير. أثناء الكلام هي
   *     النافذة الحيّة (أول لوحة بعد رجوع الشبكة تطلع على طول)؛ في السكوت
   *     هي أقدم نافذة فايتة — عشان رجوع الشبكة يتكشف والفايت لسه في الذاكرة.
   *   · غير كده النافذة **بتتسجّل بس** للإعادة (بلا قصّ ولا إرسال) — نفس
   *     `MissedWindows` المحدودة، و`onSkip` بيعدّها بدل ما تتبلع في صمت.
   */
  function weakTick(elapsed: number): void {
    // ⏱️ استسلمنا أو وقعنا بسبب تاني (جسّة رجعت 503/401…) ⇒ ولا جسّة ولا تسجيل
    //    للإعادة: الجلسة خلصت (`onFatal` اتنده) والصفحة بتقفلها. من غير ده، بعد
    //    الـ٣ دقايق كانت الجسّة هتطلع مع كل دقّة لو الصفحة ماقفلتش.
    if (gaveUp || fatalFired) return;
    pruneStalePending(elapsed);   // الطابور يفضل فيه صوت لسه في الذاكرة بس
    const live = shouldSlideWindow(speaking, elapsed, lastSpokeSec, WIN_S);
    const from = Math.max(0, elapsed - WIN_S);
    // ⏱️ عدّى ٣ دقايق ⇒ **آخر جسّة على طول** (من غير ما نستنى ميعادها) وفشلها
    //    هو اللي بيوقّف (`probeDone`). لو الشبكة رجعت قبل الـ٣ دقايق بشوية
    //    الجسّة دي بتكشفها بدل ما نستسلم والنت شغّال. ومفيش صوت (ساكت) ⇒
    //    مفيش جسّة ⇒ بنستنى لحد ما يتكلّم (مافيش استسلام من غير دليل).
    // 🔌 فحص وصول طاير ⇒ الجسّة بتستناه (٤ث بالكتير): جسّة التأكيد لازم **تبدأ**
    //    بعد «واصل»، وجسّتين/فحصين مايتسابقوش على نفس الوقوع.
    if (!probing && !reachBusy && inflight === 0 && (Date.now() >= nextProbeAt || weakTooLong())) {
      if (live) { sliceAndSend(from, elapsed, false, true); return; }
      const w = FIXES ? missed.take(elapsed) : null;
      if (w) {
        sliceAndSend(w.from, w.to, true, true);
        if (inflight > 0) { try { opts.onReplay?.(); } catch { /* ignore */ } }
      }
      return;
    }
    if (!live) return;
    opts.onSkip?.("weak_net");
    if (FIXES) missed.record(from, elapsed, elapsed);
  }

  const segTimer = setInterval(() => {
    if (stopped) return;
    const elapsed = mic.elapsedSec;
    // 🐢 وضع النت الضعيف (`netResilience` بس — `weak` مابيبقاش `true` من غيره)
    if (weak) { weakTick(elapsed); return; }
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
    // 📞 الكتم لو طوّل = الميك اتاخد (`fixes` + الصفحة طلبته بس)
    if (loss) reportLoss(loss.tick(Date.now()));
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
  /** وعد الإيقاف — نفس الوعد لو `stop` اتندهت أكتر من مرة. */
  let finalizing: Promise<void> | null = null;
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

  /** وعد بيخلص بعد `ms` **أو** أول ما واحد من الوعود يخلص — والمؤقّت بيتلغي. */
  function raceWithin(ps: Array<Promise<unknown>>, ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const t = new Promise<void>((r) => { timer = setTimeout(r, Math.max(0, ms)); });
    return Promise.race([...ps.map((p) => p.then(() => {}, () => {})), t])
      .finally(() => { if (timer !== undefined) clearTimeout(timer); });
  }

  /**
   * ⏹️ **إيقاف خفيف** (`netResilience` بس — `finalize` فوق هو اللي بيشتغل للكل
   * من غيره، بالحرف زي ما هو). نفس الخطوات بالظبط (الطابور الأول وقبل قفل
   * الميك، بعدين الإعادة، بعدين flush واحد) بس **جوّه ميزانية**:
   *   · ولا طلب بيبدأ بعد `NET_STOP_BUDGET_MS` من «إيقاف» (`stopBudgetLeft` —
   *     حتى من `pr.finally` لطلب كان طاير) ⇒ مافيش شغل في الخلفية بعدها.
   *   · الإعادة محدودة والأحدث الأول (`drainReplayAfterStop`).
   *   · الطلبات اللي لسه طايرة بنستناها لحد الميزانية بس، وبعدين flush.
   *   · بعد الاستسلام (`net_lost`) مافيش ولا طلب ولا انتظار — النت مقطوع ٣
   *     دقايق، فالإيقاف فوري.
   */
  async function finalizeNet(): Promise<void> {
    stopDeadline = Date.now() + NET_STOP_BUDGET_MS;
    if (!gaveUp) {
      for (let guard = 0; guard < 50; guard++) {
        drainPending();
        drainReplay();
        if (inflightSet.size === 0) break;
        const left = stopDeadline - Date.now();
        if (left <= 0) break;
        try { await raceWithin([...inflightSet], left); } catch { /* ignore */ }
      }
    }
    try { mic.stop(); } catch { /* ignore */ }
    const left = stopDeadline - Date.now();
    if (!gaveUp && inflightSet.size > 0 && left > 0) {
      try { await raceWithin([Promise.allSettled([...inflightSet])], left); } catch { /* ignore */ }
    }
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
      if (stopped) return finalizing ?? Promise.resolve();
      stopped = true;
      clearInterval(segTimer);
      clearInterval(drainTimer);
      opts.onSpeech?.(false);
      opts.onLevel?.(0);
      /**
       * 📞 **الميك بيتساب فوراً** — المالك: «المكالمة يبقى ليها
       * الأولوية». كان بيفضل مفتوح لحد ما آخر النوافذ ترجع من السيرفر (ثواني)،
       * والمكالمة مستنية الميك. آخر اللوحات مابتضيعش: القصّ بيقرا من **ذاكرة**
       * الميك (مش من الميك نفسه) وأي نطق جديد بعد الإيقاف بيترمى أصلاً
       * (`if (stopped) return` في `onUtterance`). و`mic.stop()` مرتين آمنة.
       *
       * ⚠️ **مربوط بـ`onMicLost` مش بـ`fixes`** — «صوتي» شغّالة بـ`fixes: true`
       *    برضه ومابتبعتش `onMicLost`، فسلوكها **بالحرف زي ما هو**. «الجديد» بس.
       */
      if (lossOn) { try { mic.stop(); } catch { /* ignore */ } }
      // انتظار النوافذ الجارية + flush (بلا إعادة قراءة = بلا تكرار).
      // ⏹️ بالعلم بس: نفس الخطوات جوّه ميزانية (`finalizeNet`)؛ من غيره بالحرف زي ما كان.
      finalizing = NET ? finalizeNet() : finalize();
      return finalizing;
    },
  };
}

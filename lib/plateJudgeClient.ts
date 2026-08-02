/**
 * طبقة الشبكة للرأي التاني — POST /transcribe على خدمة الموديل المحلية.
 * =============================================================================
 * ⚠️ الملف ده **بيتحمّل كسول** (`await import`) جوّه فرع المالك المسموح بس، عشان
 *    webpack يطلّعه في chunk منفصل مايتحمّلش خالص على أجهزة باقي المناديب
 *    (نفس أسلوب `lib/learningSettings.ts:20`).
 *
 * العقد: **عمرها ما ترمي، وعمرها ما تكدب.**
 *   • أي فشل — شبكة، مهلة، ٤٠١، ٥٠٣، جسم بايظ، شكل غير مطابق — بيرجع `null`،
 *     والمنادي بيكمّل بـDeepgram لوحده = **سلوك النهاردة بالحرف**.
 *   • مافيش ثقة في السيرفر: كل حقل بيتفحص نوعه. الرد اللي شكله مش مطابق =
 *     `null`، مش «نأخد اللي فيه ونكمّل».
 *   • ولا console.log في مسار الإنتاج غير سطر واحد خلف `debug` (اللي المالك بس
 *     بيشغّله) — سجل القياس الحقيقي في `lib/plateJudgeLog.ts`.
 *
 * ─── ليه المهلة ٤ ثواني بالظبط؟ (كل الأرقام مقيسة، مش تقدير) ─────────────────
 *   مرحلة الخدمة نفسها: متوسط ٢٢٥–٤٠٨ms · **p95 ٢٦٤–٤٩٤ms** على RTX 4060
 *   (منها ffmpeg ٤٤–٦٨ms). يعني السقف اللازم للحساب < ٥٠٠ms.
 *   الباقي (٣٫٥ث) للشبكة: نفق Cloudflare (TLS + وثبة إضافية) + **رفع** بادئة
 *   الجلسة على بيانات الجوّال. البادئة محدودة بـ`JUDGE_MAX_PREFIX_BYTES`
 *   (٢ ميجا) وده ~٢٠ ثانية رفع في أسوأ شبكة معقولة، فالمهلة مش سقف الرفع —
 *   هي سقف «استنى للرأي التاني»؛ اللي بيتجاوزها بيتحسب «فايت» وخلاص.
 *   والحدّان التانيان بيأطّرونها: أكبر من p95 × ٨ (فمش بنقطع حساب هو خلص أصلاً)
 *   وأصغر من ميزانية الخدمة (`--timeout 10`) فمابنسيبش طلب معلّق على السيرفر
 *   بعد ما إحنا مشينا.
 *   ⚠️ المهلة دي **مالهاش أي أثر على الواجهة**: الصف بيرسم فوراً وقت النطق،
 *      والرأي التاني بيحدّثه بعدين. أطول مهلة = علامة متأخرة، مش شاشة واقفة.
 */

import {
  lastPlateWordSpan, provePlateSpanAcrossFinals, type DgWord, type DgFinal,
} from "./deepgramWords";

/** سقف انتظار الرأي التاني (ملي ثانية) — المبرّر بالتفصيل في رأس الملف. */
export const JUDGE_TIMEOUT_MS = 4000;

/**
 * أقصى بادئة صوت نبعتها (بايت). ٢ ميجا ≈ **٧ دقايق** من الجلسة: المقيس على
 * webm/opus 24k مونو = ٢٫٩٨ ميجا لـ٦٠٠ث ⇒ ~٥ كيلو/ث (متسق مع
 * `serving/plate_server.py:877`: نبضة ٣ث ≈ ١٠ كيلو). وأقل بكتير من سقف الخدمة
 * (`--max-bytes` ٨ ميجا). فوق كده الرأي التاني **بيسكت** ويتسجّل
 * `prefix_too_large` — أحسن من إننا نزنق نفس الرفع اللي بث Deepgram ماشي عليه.
 */
export const JUDGE_MAX_PREFIX_BYTES = 2 * 1024 * 1024;

/** أقصى نافذة صوت نطلب قصّها — نفس سقف مستخلِص Whisper (٣٠ث). */
export const JUDGE_MAX_WINDOW_S = 30;

/** طلب واحد جوّه — البث الحي ماشي على نفس الرفع (المبرّر في صفحة التشييك:65). */
export const JUDGE_DEFAULT_MAX_INFLIGHT = 1;
/** بلا طابور افتراضياً = السلوك القديم بالحرف (`busy` بيسكت). */
export const JUDGE_DEFAULT_MAX_QUEUE = 0;
/** كل جزء من MediaRecorder = ٢٥٠ms (`rec.start(250)`) — أساس تحويل زمن ↔ فهرس. */
export const JUDGE_DEFAULT_CHUNK_MS = 250;

// ─────────────────────────────────────────────────────────────────────────────
// أرقام النافذة — **كلها مقيسة على صوت المالك نفسه**، مافيش تقدير
// =============================================================================
// القياس: جلسة ٣٠ لوحة بصوتـه، ٢٥ وصلوا للخدمة، النتيجة ٩/٣٠ = ٣٠٪ — بينما نفس
// الموديل على نفس السيرفر بيجيب ١١٥/١٢٠ = ٩٥٫٨٪ على مقاطع مقطوعة صح ⇒ العيب في
// القصّة. باتحاد مناطق الكلام لكل ٢٥ مقطع محفوظ في زمن ميديا واحد (كل مقطع بيعرف
// `cut_start` بتاعه) طلع ٣٢ مقطع كلام ≥ ١ث، وعليهم:
//   • طول نطق اللوحة:      أدنى ١٫٠٠ث · وسيط ٢٫١٦ث · p90 ٢٫٤٠ث · **أقصى ٢٫٨٦ث**
//   • السكتة بين لوحتين:   **أدنى ٠٫٣٦ث** · p10 ٠٫٥٠ث · وسيط ٠٫٧٧ث
//   • دورة لوحة→لوحة:      وسيط ٢٫٩٨ث
//   • تأخّر وصول is_final: أدنى ٠٫٣٠ث · **وسيط ٠٫٩٩٩ث** · p90 ١٫٥٢ث · أقصى ٢٫٢٠ث
// والنافذة اللي كانت بتتبعت فعلاً: وسيط ٥٫٩ث وفيها **كلام لوحتين** في ٢٣ من ٢٥.
//
// ─── قياس تانٍ أدق (نفس الجلسة، طريقة أقوى) ─────────────────────────────────
// القياس الأول فوق جمّع مناطق الكلام بلا ما يعرف كل منطقة **بتقول إيه**، فوقفة
// «حروف … أرقام» جوّه لوحة واحدة كانت بتتحسب لوحتين. الإعادة: نفس خط زمن الميديا،
// بس كل منطقة كلام اتبعتت **للموديل الحي لوحدها** واتقارنت بورقة المفتاح (٣٠
// لوحة بترتيب النطق) ⇒ ٤٠ منطقة، كل واحدة معروف تبع أنهي لوحة وهي حروفها ولا
// أرقامها. والنتيجة بتغيّر التصميم:
//   • ٩ لوحات من ٣٠ اتقالت «حروف … وقفة … أرقام». الوقفة الجوّانية: ١٢٠–**٩٣٠ms**
//   • أضيق سكتة **بين لوحتين**: **٤٦٠ms** (وكذلك ٤٧٠/٤٧٠/٥٤٠ — أربع حالات)
//   ⇒ **التوزيعان متقاطعان** (٤٦٠ بين لوحتين < ٩٣٠ جوّه لوحة): مافيش أي عتبة
//      فجوة — لا ٠٫٦٥ث ولا غيرها — تقدر تفصل «لزق» عن «وقفة جوّانية». عشان كده
//      القاعدة الأساسية بقت على **المحتوى** (`lastPlateWordSpan`): ذرّات اللوحة
//      نفسها بترسم آخر لوحة، والنتيجة تتحقّق ضد لوحة الصف.
//   • النتيجة على الـ٢٥: min/max + سقف ٣٤٠٠ ⇒ ٦ نوافذ فيها كلام الجار
//     (١٠/٢٠٠/٤٥٠/٤٩٠/٥١٠/٥٤٠ms). القاعدة الجديدة ⇒ **٠/٢٥**، وبلا أي ms من صوت
//     الصف مقصوص. وعلى الموديل الحي: ١٧/٢٥ → **٢٠/٢٥** مطابقة تامة.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * حشوة على كل جنب من النطق (ms). **٢٥٠** لسببين مستقلين:
 *   ١. مقاطع التدريب اتقطعت بحشوة ٠٫٢٥ث ⇒ نافذة الاستنتاج بتطابق التوزيع اللي
 *      الموديل واخد عليه ٩٥٪.
 *   ٢. أدنى سكتة **مقيسة** بين لوحتين = ٤٦٠ms (القياس الأدق: ٤٠ منطقة كلام كل
 *      واحدة معروف تبع أنهي لوحة) ⇒ الحشوة **مستحيل** توصل لنطق اللوحة المجاورة
 *      من الاتنين مع بعض (٢٥٠+٢٥٠ = ٥٠٠ > ٤٦٠؟ لأ — كل نافذة بتحشي جنبها هي بس،
 *      فأقصى اقتراب ٢٥٠ من ٤٦٠ = هامش ٢١٠ms).
 *
 * ⚠️ الهامش ده **مش** كافي لوحده: توقيت Deepgram لأول كلمة يقدر يسبق النطق
 *    الفعلي (المقيس على لوحة ٣٠: ٤٢٠ms قبله)، فالحشوة كانت بتوصل ٢٠٠ms جوّه كلام
 *    الجار. الضمان الحقيقي هو حدّ `prevWordEndMs` في `planPlateWindow`: النافذة
 *    عمرها ما تبدأ قبل نهاية كلام النبضة السابقة زي ما Deepgram نفسه قالها.
 */
export const JUDGE_WORD_PAD_MS = 250;

/**
 * أقصى طول نافذة (ms) للمسار **القديم** (min(starts)…max(ends)) — أطول نطق
 * لوحة مقيس وقتها (٢٫٩ث) + الحشوتين.
 *
 * ⚠️ ده سقف **أعمى**: هو مايعرفش يفرّق بين «Deepgram لزق نبضتين» و«لوحة واحدة
 * اتقالت بوقفة جوّانية»، فبيضرّ الاتنين. المقيس على جلسة المالك:
 *   • تسريب: الربط على النهاية بيسيب `3400 − 250 − طول آخر نطق − السكتة` من
 *     اللوحة **السابقة** جوّه النافذة ⇒ ٤ نوافذ من ٢٥ فيها ٤٥٠/٤٩٠/٥١٠/٥٤٠ms
 *     من كلام الجار، وهي بالظبط توقيع «الحروف من دي والأرقام من اللي قبلها».
 *   • قصّ من القدّام: نتيجة واحدة لوحة span ٣٫٢٨ث اتقصّت ٤٦٠ms من قدّامها،
 *     منهم ٢١٠ms كلام اللوحة نفسها.
 * عشان كده المسار الأساسي بقى `plate_words` تحت (على **آخر لوحة** متحقَّق منها)،
 * والسقف ده فضل **بالحرف** للمسار المتوافق للخلف بس (منادي بيبعت
 * `wordStartMs/wordEndMs` بلا `words`).
 */
export const JUDGE_MAX_PLATE_WINDOW_MS = 2900 + 2 * JUDGE_WORD_PAD_MS;

/**
 * أطول نطق **لوحة واحدة** مقيس على صوت المالك (ms) — ٣٫٣٤ث. القياس: خط زمن
 * ميديا واحد لكل الـ٢٥ مقطع (كل واحد بيعرف `cut_start` بتاعه) + VAD طاقة + سؤال
 * الموديل الحي عن كل منطقة كلام لوحدها. أطول نطق لوحة **في الكلمات** طلع ٣٫٢٠ث،
 * وأطول نطق **صوتي** ٢٫٩٣ث؛ بناخد ٣٫٣٤ (رقم التحليل الميداني) عشان الهامش.
 */
export const JUDGE_MAX_PLATE_SPAN_MS = 3340;

/**
 * أقصى طول نافذة للمسار المثبَت (ms) = أطول نطق لوحة + الحشوتين = ٣٨٤٠.
 * أكبر من السقف الأعمى (٣٤٠٠) **عن قصد**: النافذة هنا مضمونة إنها نطق لوحة
 * واحدة (اتحقّقنا إن ذرّاتها = لوحة الصف بالظبط)، فالسقف بقى **شبكة أمان** ضد
 * توقيت شاذ، مش الآلية اللي بتفصل اللوحات. بالسقف القديم كانت أطول لوحة مقيسة
 * تخسر ٤٤٠ms من قدّامها بلا أي سبب.
 */
export const JUDGE_MAX_PROVEN_WINDOW_MS = JUDGE_MAX_PLATE_SPAN_MS + 2 * JUDGE_WORD_PAD_MS;

/**
 * أطول وقفة **جوّه لوحة واحدة** مقيسة على صوت المالك (ms) — ٩٣٠. القياس: ٤٠
 * منطقة كلام كل واحدة معروف تبع أنهي لوحة وهي حروفها ولا أرقامها؛ ٩ لوحات من
 * ٣٠ اتقالت «حروف … وقفة … أرقام» والوقفة ١٢٠–**٩٣٠**ms. (وهو أكبر من أضيق
 * سكتة بين لوحتين — ٤٦٠ms — وعشان كده مافيش عتبة فجوة تنفع.)
 */
export const JUDGE_MAX_INNER_PAUSE_MS = 930;

/**
 * سقف مدة نطق لوحة **مقسومة على نتيجتين** (ms) = أطول نطق لوحة مقيس (٣٣٤٠) +
 * أطول وقفة جوّانية مقيسة (٩٣٠) = **٤٢٧٠**.
 *
 * ⚠️ فوق السقف ده **مافيش قصّ** — سكوت (`split_too_long`). الفرق عن المسار
 * الأحادي مقصود: هناك القصّ بيربط على **النهاية** وده آمن لأن المدى كله نطق
 * لوحة واحدة متحقَّق منه؛ هنا الربط على النهاية معناه إننا نرمي **حروف اللوحة**
 * (أول نص النطق) ونبعت أرقام لوحدها — وده بالظبط المدخل اللي الموديل بيغلط فيه
 * (مدرَّب على لوحة كاملة في المقطع). فالسقف هنا بوابة، مش مقص.
 */
export const JUDGE_MAX_SPLIT_SPAN_MS = JUDGE_MAX_PLATE_SPAN_MS + JUDGE_MAX_INNER_PAUSE_MS;

/** أقصى نافذة للمسار المقسوم (ms) = ٤٢٧٠ + الحشوتين = ٤٧٧٠. */
export const JUDGE_MAX_SPLIT_WINDOW_MS = JUDGE_MAX_SPLIT_SPAN_MS + 2 * JUDGE_WORD_PAD_MS;

/** تأخّر وصول `is_final` بعد آخر كلمة (ms) — **الوسيط المقيس ٩٩٩ms**. */
export const JUDGE_FALLBACK_LAG_MS = 1000;
/** طول النطق المفترض في الاحتياطي (ms) — p90 المقيس ٢٤٠٠ms. */
export const JUDGE_FALLBACK_SPAN_MS = 2400;
/** حدود مدة نطق معقولة (ms) — المقيس ١٠٠٠–٢٨٦٠. */
export const JUDGE_MIN_SPOKEN_MS = 1000;
export const JUDGE_MAX_SPOKEN_MS = 2900;
/**
 * سماحية «ساعة الكلمات مش من التيار ده» (ms). Deepgram **مايقدرش** يوقّت صوت
 * إحنا لسه مابعتناهوش، فتوقيت الكلمات لازم يبقى ≤ الصوت المتجمّع. المقيس: أول
 * لوحة في الجلسة كان عندها ٣٫٩ث صوت مقابل ٤٫١٠٤ث ساعة = فرق **جزء واحد**
 * (٢٥٠ms). ١٠٠٠ms = ٤ أجزاء: سخية ضد الاهتزاز، وبرضه بتكشف ساعة تيار قديم
 * (بتبقى ثواني بحالها فوق زمن تيار لسه بادئ).
 */
export const JUDGE_CLOCK_SLACK_MS = 1000;

/** الرد بعد التحقّق، بأسماء الكود (camelCase). */
export interface JudgePlateResponse {
  /** نص الموديل الخام (ممكن يكون فاضي). */
  plate: string;
  /** نفسه بعد `normalize_plate` على السيرفر. */
  plateNorm: string;
  /** قرار بوابة الثقة (`training/plate_confidence.gate`). */
  accepted: boolean;
  refuseReason: string | null;
  meanLogprob: number | null;
  minLogprob: number | null;
  noSpeechProb: number | null;
  /** زمن الخدمة الكامل بالملي ثانية (للقياس). */
  serverMs: number | null;
  model: string | null;
}

export interface PostAudioOptions {
  /** العنوان الكامل (من `readJudgeEndpoint().transcribeUrl`). */
  transcribeUrl: string;
  token: string;
  mimeType?: string;
  /** نافذة اللوحة في **زمن الميديا** — السيرفر هو اللي يقصّ (شوف buildTranscribeUrl). */
  startMs?: number;
  endMs?: number;
  timeoutMs?: number;
  /** تأجيل إعادة المحاولة الوحيدة (اختبارياً ٠). */
  retryDelayMs?: number;
  /** كود الفشل للقياس — **مش** استثناء. لو رمت هي كمان بنتجاهلها. */
  onError?: (code: string) => void;
  /** سطر ديبج واحد — للمالك بس. */
  debug?: boolean;
  /** حقن fetch (للاختبار). الافتراضي fetch العالمي. */
  fetchImpl?: typeof fetch | null;
}

const MAX_PLATE_CHARS = 64;

/** نتيجة الفحص الرخيص — رمز واحد بيسمّي المشكلة بالظبط. */
export interface JudgeProbeResult {
  ok: boolean;
  /** ok · blocked · bad_token · bad_path · bad_body · timeout · http_NNN · not_configured */
  code: string;
}

/**
 * «جرّب الاتصال» (الفحص الرخيص) — طلب واحد بيقول هل الطيّار **فعلاً** واصل، بلا
 * ما المالك ينطق ولا الموديل يشتغل ولا الكارت يصحى.
 *
 * ⚠️ ليه ده لازم يبقى موجود؟ علامة «متوصّل» في المربّع بتقرا **التخزين** بس
 * (`judgeCfgOk` ← `readJudgeEndpoint`) ومابتلمسش الشبكة. في الحادثة الميدانية
 * الشاشة كانت مطمّنة والطلب **مخرجش من التليفون خالص**، لأن أصل التطبيق (نفق
 * التجربة) مش في `DEFAULT_ORIGINS` (`serving/plate_server.py`) ⇒ الـpreflight
 * مترفوض ⇒ المتصفّح لغى الـPOST من نفسه. مافيش حاجة في الواجهة كانت تكشف ده.
 *
 * ليه `GET /health` بترويسة التوكن؟ لأنه بيختبر **الأربعة** في طلب واحد رخيص:
 *   ١. CORS — `X-Plate-Token` ترويسة مش من القايمة الآمنة ⇒ المتصفّح **مجبور**
 *      يعمل preflight، يعني نفس البوابة اللي وقعت بالظبط.
 *   ٢. وصول النفق.  ٣. التوكن (٤٠١).  ٤. المسار (٤٠٤ — أساس فيه `/ping`).
 * والموديل مايشتغلش (مافيش استنتاج في `/health`).
 *
 * ⚠️ `blocked` بيجمع «CORS رفض» و«النفق واقع» — المتصفّح **بيخفي** الفرق بينهم
 * عن الجافاسكريبت بقصد (الاتنين `TypeError`). الفرق بيتحلّ من ناحية الخدمة:
 * `/health` → `preflight.cors_blocked > 0` ⇒ CORS؛ صفر preflight خالص ⇒ النفق.
 *
 * للرحلة **الكاملة** (استنتاج حقيقي + لوحة + زمن) شوف `probeJudgeTranscribe`.
 */
export async function probeJudgeEndpoint(
  base: string,
  token: string,
  opts: { fetchImpl?: typeof fetch | null; timeoutMs?: number } = {},
): Promise<JudgeProbeResult> {
  try {
    if (!base || !token) return { ok: false, code: "not_configured" };
    const doFetch = opts.fetchImpl === undefined
      ? (typeof fetch === "function" ? fetch : null)
      : opts.fetchImpl;
    if (typeof doFetch !== "function") return { ok: false, code: "no_fetch" };

    const ctrl = new AbortController();
    const timer = setTimeout(() => { try { ctrl.abort(); } catch { /* ignore */ } },
      opts.timeoutMs ?? JUDGE_TIMEOUT_MS);
    try {
      const res = await doFetch(`${base}/health`, {
        method: "GET",
        headers: { "X-Plate-Token": token },
        signal: ctrl.signal,
      });
      if (res.status === 401) return { ok: false, code: "bad_token" };
      if (res.status === 404) return { ok: false, code: "bad_path" };
      if (!res.ok) return { ok: false, code: `http_${res.status}` };
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, code: "bad_body" };
      }
      const o = (typeof body === "object" && body !== null) ? body as Record<string, unknown> : null;
      if (!o || o.ok !== true) return { ok: false, code: "bad_body" };
      return { ok: true, code: "ok" };
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      if (name === "AbortError") return { ok: false, code: "timeout" };
      // المتصفّح بيرمي TypeError على فشل CORS **وكذلك** على «مافيش شبكة» —
      // ومابيقولش أنهي واحدة (منع تسريب معلومات عبر الأصول).
      if (e instanceof TypeError) return { ok: false, code: "blocked" };
      return { ok: false, code: "error" };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false, code: "error" };      // عمرها ما ترمي على المنادي
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// مخطِّط القصّة — **نقطة القرار الوحيدة** للسكوت
// =============================================================================
// الحساب ده كان مكتوب inline جوّه `requestSecondOpinion`، ومعناه إن كل سبب سكوت
// كان **غير قابل للاختبار**: مافيش طريقة تثبت إن السبب اللي بيتسجّل هو الصح، ولا
// إن الأسباب مميّزة، ولا إن النافذة اللي طلعت محدودة. الحادثة الميدانية علّمتنا إن
// السكوت غير المقيس = ميزة ميتة بصمت، فالقرار اتنقل لدالة **نقية** بلا أي تغيير
// في الحساب نفسه (نفس الأرقام بالحرف) عشان يبقى مغطّى باختبار.
//
// الترتيب مقصود ومحفوظ: إعداد ← توقيت ← مزنوق ← صوت ← حجم. الأعمّ الأول، عشان
// السبب اللي بيتسجّل يبقى **أقرب سبب حقيقي** مش أول عرض جانبي له.
// ─────────────────────────────────────────────────────────────────────────────

/** أسباب سكوت الرأي التاني اللي المخطِّط يقدر يقولها — كلها مسمّاة ومميّزة. */
export type JudgeSkipReason =
  | "not_configured" | "no_timing" | "stale_stream" | "window_unproven"
  | "busy" | "queue_full" | "no_audio" | "prefix_too_large"
  | "multi_plate_message" | "carried_over" | "split_too_long";

export interface JudgeSliceInput {
  /** الإعداد على الجهاز سليم؟ (`readJudgeEndpoint() !== null`) */
  hasConfig: boolean;
  /** كلمات النتيجة النهائية بتوقيتها — المسار المثبَت (شوف `JudgeWindowInput`). */
  words?: DgWord[] | null;
  /** تاريخ آخر شوية نتايج نهائية (آخرها = الحالية) — المسار المقسوم. */
  finals?: DgFinal[] | null;
  /** لوحة الصف مطبّعة — النافذة لازم تثبت إنها هي اللي في الصوت. */
  expectPlateNorm?: string | null;
  /** نهاية آخر كلمة في النتيجة النهائية اللي قبل دي على نفس التيار (ms). */
  prevWordEndMs?: number | null;
  /**
   * من أنهي سجل في أنهي رسالة طلع الصف ده. بيمشي على `planJudgeEmitGate`
   * (فشل-مغلق على الدخل البايظ) وعلى `needsProvenWindow` جوّه `planPlateWindow`
   * (منع نوافذ الرسالة عن الصف اللي مش وحيد في رسالته).
   */
  emit?: JudgeEmitInfo | null;
  /**
   * نافذة جاهزة بـ**ساعة الحقيقة** — المسار المتوافق للخلف لأي منادي حاسبها
   * بنفسه. صفحة التشييك مابتبعتهاش: بتبعت المكوّنات الخام تحت والمخطِّط هو اللي
   * يحسب (عشان الحساب يبقى نقي ومغطّى باختبار).
   */
  timing: { startMs: number; endMs: number } | null;
  /** توقيت كلمات Deepgram للنتيجة النهائية — **زمن التيار = زمن الميديا** (ms). */
  wordStartMs?: number | null;
  wordEndMs?: number | null;
  /** لحظة وصول النتيجة النهائية بساعة الحقيقة نسبةً لبداية المسجّل (ms). */
  arrivalMs?: number | null;
  /** زمن الميديا المتجمّع لحد دلوقتي (ms) — لكشف ساعة مش من التيار ده. */
  mediaElapsedMs?: number | null;
  /** الرسالة من نفس تيار المسجّل/السوكيت الحالي؟ (`false` = بعد إعادة اتصال) */
  streamFresh?: boolean;
  /** أجزاء صوت فشل إرسالها للمحرك على التيار ده — أي واحدة تزحّف ساعة Deepgram. */
  audioDrops?: number;
  /** طلبات جوّه دلوقتي. */
  inflight: number;
  /** طلبات مستنية في الطابور دلوقتي. */
  queued?: number;
  /** أحجام أجزاء الجلسة بالبايت بالترتيب (= `pttAudioChunksRef`). */
  chunkSizes: number[];
  /** فهرس أول جزء للتيار الحالي — الجزء اللي فيه ترويسة webm. */
  base: number;
  /** مجموع الإيقاف المؤقت (ms) — زمن الميديا = ساعة الحقيقة − ده. */
  pausedMs: number;
  maxInflight?: number;
  maxQueue?: number;
  chunkMs?: number;
  maxBytes?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// النافذة — **مربوطة على توقيت كلمات Deepgram، مش على لحظة الوصول**
// =============================================================================
// الباج اللي ده بيصلّحه (مقيس على صوت المالك): النافذة كانت مربوطة على
// `performance.now()` وقت **وصول** النتيجة النهائية:
//     startMs = nowMs − durMs − 3000 ;  endMs = nowMs + 500
// والوصول متأخّر عن نهاية النطق بـ٠٫٩٩٩ث وسيط (endpointing ١٠٠ + الشبكة)، فمع
// حشوة ٣ث لورا النافذة بقت ٥٫٩ث وسيط = [ذيل اللوحة السابقة … اللوحة … مقدمة
// اللي بعدها]. الموديل مدرَّب على **لوحة واحدة في المقطع** فبيخلط:
//     ورقة اوب٢٣٩٩ → موديل اوب٨٠٤٤   (الحروف من دي، **الأرقام من اللي قبلها**)
//     ورقة رسك١٧٣٥ → موديل رهه٥٦٧٨   (الأرقام من اللي قبلها)
// حشوة الـ٣ث دي اتكتبت **لجمع داتا التدريب** (والتعليق بيقول كده صريح: التدريب
// مايحتاجش قصّة مضبوطة) — وهي قاتلة للاستنتاج. مسار التدريب سايب زي ما هو
// بالحرف (`curTimingRef` في الصفحة)؛ ده مسار الاستنتاج لوحده.
//
// ─── ليه توقيت الكلمات = زمن الميديا بالظبط؟ (المبرّر، مش افتراض) ─────────────
// في `startDeepgramPtt` السوكيت والـMediaRecorder بيبدأوا مع بعض، وكل جزء جاي من
// `ondataavailable` بيتحط في `pttAudioChunksRef` **و** بيتبعت للسوكيت بنفس
// الترتيب (اللي بيتسجّل قبل الفتح بيتخزّن في `pending` ويتفضّى بالترتيب أول ما
// يفتح)، وبوابة الكلام مابترميش ولا جزء (بتسكّت KeepAlive بس). يعني ساعة
// Deepgram بتعدّ **نفس** العيّنات من **نفس** أول عيّنة = زمن ميديا التيار الحالي
// اللي بيبدأ عند `judgeStreamBaseRef`. ومن هنا نتيجتين:
//   • توقيت الكلمات **مايتخصمش منه** `pausedMs`: `rec.pause()` مابيطلّعش أجزاء،
//     فالتايم لاينين الاتنين بيتخطّوا نفس الفترة. (الخصم صح لساعة الحقيقة بس —
//     وده كان نصّ الباج التاني: كانوا بياخدوا لحظة ساعة حقيقية ويخصموا منها.)
//   • إعادة الاتصال **مابتكسرش** المطابقة: سوكيت جديد ⇒ مسجّل جديد ⇒
//     `dgRecStartRef` و`judgeStreamBaseRef` يتصفّروا مع ساعة Deepgram في نفس
//     اللحظة. اللي بيكسرها هو نتيجة نهائية **متأخّرة من السوكيت القديم**: صوتها
//     قبل البادئة الحالية، فلا الكلمات ولا الوصول بيدلّوا على مكان صح ⇒
//     `stale_stream` (سكوت مسمّى) أحسن من نافذة على صوت غلط.
// ─────────────────────────────────────────────────────────────────────────────

/** مصدر النافذة — بيتسجّل عشان القياس يعرف أي قاعدة اشتغلت. */
export type JudgeWindowSource =
  | "plate_words" | "plate_words_capped"
  // المسارات المثبَتة الجديدة: النطق اتلمّ من كلمات أكتر من نتيجة نهائية
  // (`_split`)، أو من نفس النتيجة بس لوحة الصف مش آخر لوحة فيها (`_earlier`).
  | "plate_words_split" | "plate_words_earlier"
  | "words" | "words_capped" | "wallclock" | "explicit";

export interface JudgeWindowInput {
  /**
   * كلمات النتيجة النهائية بتوقيتها (`readDeepgramWords(msg)`). لما تتبعت،
   * النافذة بتتبنى على نطق **آخر لوحة** متحقَّق منه ضد `expectPlateNorm` —
   * وده المسار الأساسي. بلاها بيرجع المسار المتوافق للخلف (min/max + سقف أعمى).
   */
  words?: DgWord[] | null;
  /**
   * تاريخ آخر شوية نتايج نهائية على **نفس التيار**، وآخر عنصر = النتيجة الحالية
   * (نفس `words`). بيتستخدم **بس** لما المسار الأحادي يفشل: اللوحة اللي المالك
   * قالها «حروف … سكتة … أرقام» بتبقى مقسومة على نتيجتين، والبناء-والتحقّق
   * بيتعاد على الكلمات موصولة. بلاها بيتبنى تاريخ من `words` لوحدها (فالحالة
   * الوحيدة اللي بتتكسب: لوحة الصف مش آخر لوحة في نفس الرسالة).
   */
  finals?: DgFinal[] | null;
  /**
   * من أنهي سجل في أنهي رسالة طلع الصف. لو الصف **مش** السجل الوحيد لرسالته أو
   * نصّه اتلمّ من رسالتين، فنافذة الرسالة (min/max · ساعة الحقيقة · نافذة جاهزة)
   * **ممنوعة** عليه — يمشي بنافذة مثبَتة أو يسكت. ده الحزام الوحيد الباقي من
   * بوابة الإصدار القديمة، ومبرّره إن الاحتياطيات دي نوافذ **رسالة** مش نطق
   * لوحة، فمافيش أي إثبات إنها تبع الصف ده.
   */
  emit?: JudgeEmitInfo | null;
  /** لوحة الصف **مطبّعة** — اللي النافذة لازم تثبت إنها هي اللي في الصوت. */
  expectPlateNorm?: string | null;
  /**
   * نهاية آخر كلمة في النتيجة النهائية **اللي قبل دي** على نفس التيار (ms).
   * النافذة عمرها ما تبدأ قبلها: Deepgram نفسه قال إن كلام النبضة السابقة خلص
   * هناك، فأي صوت قبلها **بالضرورة** تبع نبضة سابقة. المقيس على لوحة ٣٠ في
   * جلسة المالك: توقيت Deepgram لأول كلمة سبق النطق الفعلي بـ٤٢٠ms، والسكتة عن
   * اللوحة اللي قبلها ٤٧٠ms بس ⇒ الحشوة كانت بتدخل ٢٠٠ms جوّه كلام الجار.
   */
  prevWordEndMs?: number | null;
  wordStartMs?: number | null;
  wordEndMs?: number | null;
  arrivalMs?: number | null;
  mediaElapsedMs?: number | null;
  streamFresh?: boolean;
  audioDrops?: number;
  pausedMs?: number;
  timing?: { startMs: number; endMs: number } | null;
}

export type JudgeWindowPlan =
  | { ok: true; startMs: number; endMs: number; source: JudgeWindowSource }
  | {
      ok: false;
      reason: "no_timing" | "stale_stream" | "window_unproven"
      | "split_too_long" | "carried_over" | "multi_plate_message";
    };

/**
 * الصف ده **لازم** نافذة مثبَتة (نطق لوحته هو)، ولا ينفع ياخد نافذة رسالة؟
 * `true` لأي صف مش السجل الوحيد لرسالته، أو نصّه اتلمّ من رسالتين.
 */
function needsProvenWindow(emit: JudgeEmitInfo | null | undefined): boolean {
  if (emit === null || emit === undefined) return false;
  if (emit.fromCarry === true) return true;
  const count = finite(emit.count) ? emit.count : NaN;
  const index = finite(emit.index) ? emit.index : NaN;
  if (!Number.isFinite(count) || !Number.isFinite(index)) return true;
  return count !== 1 || index !== 0;
}

/** السبب المسمّى لما الإثبات يفشل — بيحافظ على أسماء القياس القديمة. */
function unprovenReason(
  emit: JudgeEmitInfo | null | undefined,
): "window_unproven" | "carried_over" | "multi_plate_message" {
  if (emit?.fromCarry === true) return "carried_over";
  if (needsProvenWindow(emit)) return "multi_plate_message";
  return "window_unproven";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * تاريخ النتائج النهائية للمسار الموسّع. بلا تاريخ من المنادي بنبني واحد من
 * النتيجة الحالية لوحدها — فالسلوك الأقصى اللي يقدر يتكسب وقتها هو «لوحة الصف
 * مش آخر لوحة في نفس الرسالة»، ومافيش أي كلام من رسالة تانية بيدخل النافذة.
 */
function finalsOf(i: JudgeWindowInput, words: DgWord[]): DgFinal[] {
  const hist = Array.isArray(i.finals) ? i.finals.filter((f) => Array.isArray(f?.words)) : [];
  if (hist.length > 0) return hist;
  return [{ words, prevWordEndMs: finite(i.prevWordEndMs) ? (i.prevWordEndMs as number) : null }];
}

/**
 * يحسب نافذة اللوحة. **نقية** — كل الحساب هنا عشان يبقى مغطّى باختبار على أرقام
 * القياس الحقيقية.
 *
 * الترتيب مقصود: تيار قديم (سكوت) ← كلمات موثوقة ← احتياطي ساعة الحقيقة ←
 * نافذة جاهزة ← سكوت مسمّى. الأعمّ الأول عشان السبب المسجّل يبقى السبب الحقيقي.
 */
export function planPlateWindow(input: JudgeWindowInput): JudgeWindowPlan {
  const i = input ?? {};
  // (١) رسالة من تيار سابق: مافيش مرساة سليمة خالص — لا ساعة الكلمات (اتصفّرت)
  //     ولا ساعة الحقيقة (`dgRecStartRef` اتصفّر) بيدلّوا على صوت اللوحة، لأن
  //     صوتها **قبل** بادئة التيار الحالي.
  if (i.streamFresh === false) return { ok: false, reason: "stale_stream" };

  const pausedMs = finite(i.pausedMs) ? (i.pausedMs as number) : 0;
  const ws = finite(i.wordStartMs) ? (i.wordStartMs as number) : null;
  const we = finite(i.wordEndMs) ? (i.wordEndMs as number) : null;
  const spanMs = (ws !== null && we !== null && we >= ws) ? we - ws : null;
  // أي جزء صوت فشل إرساله = Deepgram شاف صوت أقصر مننا ⇒ ساعته زحفت لورا بمقدار
  // مش معروف. المدة (فرق كلمتين في نفس الرسالة) بتفضل صح، المرساة بس هي اللي بايظة.
  const drops = finite(i.audioDrops) ? (i.audioDrops as number) : 0;
  const elapsed = finite(i.mediaElapsedMs) ? (i.mediaElapsedMs as number) : null;
  const clockOk = elapsed === null || (we !== null && we <= elapsed + JUDGE_CLOCK_SLACK_MS);

  // (٢) الكلمات موجودة بتوقيتها ⇒ **المسار المثبَت**: نطق آخر لوحة، متحقَّق إن
  //     ذرّاته = لوحة الصف بالظبط. أي فشل تحقّق = سكوت مسمّى، مش نافذة min/max
  //     (اللي بتسرّب اللوحة السابقة — مقيس ٤٥٠–٥٤٠ms في ٤ من ٢٥).
  const words = Array.isArray(i.words) ? i.words : null;
  if (words !== null && words.length > 0 && drops <= 0 && clockOk) {
    const expect = typeof i.expectPlateNorm === "string" ? i.expectPlateNorm : "";
    const span = expect ? lastPlateWordSpan(words, expect) : null;
    if (span) {
      const endMs = span.endMs + JUDGE_WORD_PAD_MS;
      let startMs = span.startMs - JUDGE_WORD_PAD_MS;
      let source: JudgeWindowSource = "plate_words";
      if (endMs - startMs > JUDGE_MAX_PROVEN_WINDOW_MS) {
        // توقيت شاذ (نطق أطول من أي لوحة معقولة) — شبكة الأمان، مش الآلية.
        startMs = endMs - JUDGE_MAX_PROVEN_WINDOW_MS;
        source = "plate_words_capped";
      }
      // حدّ النبضة السابقة — عمره ما يقصّ كلام اللوحة نفسها (نتيجة مكرّرة).
      if (finite(i.prevWordEndMs)) {
        startMs = Math.max(startMs, Math.min(i.prevWordEndMs as number, span.startMs));
      }
      return { ok: true, startMs: Math.max(0, startMs), endMs: Math.max(1, endMs), source };
    }
    // (٢-ب) المسار المثبَت **الموسّع** — بيجرى بس لما اللي فوق يفشل، فكل صف
    //       بيجاوب النهاردة نافذته **بالحرف** زي ما هي.
    //   • لوحة اتقالت «حروف … سكتة … أرقام» ⇒ نصّها في النتيجة السابقة.
    //   • أو لوحة الصف مش **آخر** لوحة في الرسالة (رسالة بلوحتين).
    // نفس البناء ونفس التحقّق بالظبط — الفرق إن الكلمات موصولة، والحدود بقت
    // بكلمات الجار نفسها بدل `prevWordEndMs` (اللي بيلغي نفسه على المسار ده).
    const proof = expect
      ? provePlateSpanAcrossFinals(finalsOf(i, words), expect)
      : null;
    if (!proof) return { ok: false, reason: unprovenReason(i.emit) };
    const { span: sp, neighbourEndMs, nextPlateStartMs } = proof;
    // السقف **بوابة مش مقص**: القصّ من النهاية هنا بيرمي حروف اللوحة.
    if (sp.endMs - sp.startMs > JUDGE_MAX_SPLIT_SPAN_MS) {
      return { ok: false, reason: "split_too_long" };
    }
    let startMs = sp.startMs - JUDGE_WORD_PAD_MS;
    if (neighbourEndMs !== null) {
      // الحدّ السفلي: كلام الجار خلص هناك زي ما Deepgram نفسه قال. ومستحيل
      // يقصّ كلام اللوحة نفسها (`Math.min` على بداية النطق).
      startMs = Math.max(startMs, Math.min(neighbourEndMs, sp.startMs));
    }
    let endMs = sp.endMs + JUDGE_WORD_PAD_MS;
    if (nextPlateStartMs !== null) {
      // الحدّ العلوي: الحشوة عمرها ما تقرّب من نطق الجار اللي بعده (وبنسيب له
      // حشوته هو كمان، فنافذتين لصفّين من نفس الرسالة مايتراكبوش).
      endMs = Math.max(sp.endMs, Math.min(endMs, nextPlateStartMs - JUDGE_WORD_PAD_MS));
    }
    return {
      ok: true,
      startMs: Math.max(0, startMs),
      endMs: Math.max(1, endMs),
      source: proof.crossed ? "plate_words_split" : "plate_words_earlier",
    };
  }

  // الصف اللي محتاج إثبات (رسالة بأكتر من لوحة / نصّ اتلمّ من رسالتين) **ممنوع**
  // ياخد أي نافذة رسالة تحت — نوافذ الرسالة مافيهاش أي إثبات إنها تبع الصف ده،
  // وده كان بالظبط التلف: نافذة واحدة لصفّين، أو نافذة فيها صفر ms من صوت الصف.
  if (needsProvenWindow(i.emit)) return { ok: false, reason: unprovenReason(i.emit) };

  // (٣) المسار المتوافق للخلف: منادي بعت حدود الكلام بلا الكلمات نفسها.
  if (spanMs !== null && drops <= 0 && clockOk) {
    const endMs = (we as number) + JUDGE_WORD_PAD_MS;
    let startMs = (ws as number) - JUDGE_WORD_PAD_MS;
    let source: JudgeWindowSource = "words";
    if (endMs - startMs > JUDGE_MAX_PLATE_WINDOW_MS) {
      // Deepgram لزق نبضتين: نربط على النهاية (الصف طلع من آخر نبضة).
      startMs = endMs - JUDGE_MAX_PLATE_WINDOW_MS;
      source = "words_capped";
    }
    return { ok: true, startMs: Math.max(0, startMs), endMs: Math.max(1, endMs), source };
  }

  // (٤) احتياطي محكم: الوصول ناقص التأخّر المقيس، بمدة النطق الحقيقية لو عرفناها.
  if (finite(i.arrivalMs)) {
    const arrival = (i.arrivalMs as number) - pausedMs;
    const spoken = spanMs !== null
      ? clamp(spanMs, JUDGE_MIN_SPOKEN_MS, JUDGE_MAX_SPOKEN_MS)
      : JUDGE_FALLBACK_SPAN_MS;
    const endMs = arrival - JUDGE_FALLBACK_LAG_MS + JUDGE_WORD_PAD_MS;
    const startMs = endMs - spoken - 2 * JUDGE_WORD_PAD_MS;
    if (endMs > 0) {
      return { ok: true, startMs: Math.max(0, startMs), endMs, source: "wallclock" };
    }
  }

  // (٥) نافذة جاهزة (ساعة حقيقية) — المسار المتوافق للخلف.
  const t = i.timing;
  if (t && finite(t.startMs) && finite(t.endMs)) {
    return {
      ok: true,
      startMs: Math.max(0, t.startMs - pausedMs),
      endMs: Math.max(1, t.endMs - pausedMs),
      source: "explicit",
    };
  }
  return { ok: false, reason: "no_timing" };
}

// ─────────────────────────────────────────────────────────────────────────────
// الدخول: سقف + طابور قصير **بدل الضياع**
// =============================================================================
// المقيس على جلسة المالك: ٥ لوحات من ٣٠ **اتسكتت `busy`** — المالك بيتكلم بدورة
// ٢٫٩٨ث وسيط، وتأخّر الوصول بيتلخبط ٠٫٣–٢٫٢ث فنتيجتين نهائيتين بيوصلوا ورا بعض
// بجزء من الثانية. زمن الخدمة المقيس ٤١٠–١٨٦٥ms (وسيط ١١٣٥ على النوافذ ٦ث
// القديمة؛ نافذة ٣ث بترجّعه لـ٣٠٠–٥٠٠ms المقيسة قبل كده)، والخدمة نفسها بتسمح
// **٤** مع بعض (`--max-inflight`).
// السقف ٢ + طابور ٢: أي لوحة تانية تمشي فوراً، والتالتة/الرابعة **تستنى** بدل ما
// تتضيّع (استناها ≤ زمن خدمة واحد ≈ ١ث، وأصغر بكتير من مهلة الـ٤ث اللي بتبدأ عند
// الإرسال مش عند الحجز). وسبعنا للخدمة سلوتين فاضيين فمابنخلّيهاش ترمي ٥٠٣.
// ليه مش أكتر؟ البادئة المرفوعة بتكبر مع الجلسة (المقيس: ٥١ كيلو أول لوحة →
// **١٫٤٥ ميجا** آخر لوحة، ~١٤٫٣ كيلو/ث) والبث الحي عايش على نفس الرفع.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// بوابة الإصدار — الحزام الزايد **اتشال**، والتحقّق هو اللي فضل
// =============================================================================
// الوقيعة الأصلية (متحقَّق منها بمحلّل المشروع نفسه): رسالة نهائية واحدة تقدر
// تطلّع أكتر من سجل — `parseSessionChunk("حاء باء كاف … دال باء راء …")` بترجّع
// سجلّين — و`addOnePttRow` بيقرا `judgeTimingRef.current` **مرة لكل سجل**، يعني
// نفس الكائن. أول علاج كان: أي سجل مش الوحيد في رسالته **يسكت**
// (`multi_plate_message`)، وأي سجل نصّه اتلمّ من رسالتين يسكت (`carried_over`).
//
// ليه الحزام ده اتشال؟ لأنه **زايد وغالي**. النافذة بقت من `lastPlateWordSpan`
// اللي بيرتكز على لوحة **الصف نفسه** ويتحقّق إن ذرّاتها = لوحة الصف بالظبط، يعني
// سجلّين في رسالة واحدة بياخدوا نافذتين **مختلفتين** كل واحدة مثبَتة لصفّها.
// والمقيس في الميدان: الحزام سكّت كهط٥٢٥١ وبدك١٥٨٨ — الاتنين الموديل جابهم **صح**
// (٩٦٪ دقّة على ٢٥ إجابة، صفر لوحة غلط)، يعني الحزام كان بيدفع تغطية بلا أي
// مقابل في الدقّة. والـ`carried_over` بقى عنده مسار حقيقي: النافذة المقسومة
// (`provePlateSpanAcrossFinals`) بتلمّ حروف اللوحة من النتيجة السابقة — بنفس
// التحقّق بالحرف.
//
// اللي **فضل** من البوابة، وهو الحزام الوحيد المبرّر (`needsProvenWindow`):
//   الصف اللي مش السجل الوحيد لرسالته — أو نصّه اتلمّ من رسالتين — **ممنوع**
//   ياخد نافذة **رسالة** (min/max · ساعة الحقيقة · نافذة جاهزة). دي نوافذ
//   بحدود الرسالة كلها، مافيش فيها أي إثبات إنها نطق لوحة الصف ده — وهي بالظبط
//   اللي كانت بتتشارك بين صفّين، أو بتحتوي **صفر ms** من صوت الصف (المقيس:
//   النتيجة ٢١، لوحة ٢٥ نطقها ٧٩٨٤٠–٨١٩٣٠ والنافذة كانت بتبدأ ٨١٤٢٠). فالصف ده
//   يمشي بنافذة مثبَتة أو يسكت بسبب مسمّى.
// وهنا البوابة بقت **فشل-مغلق على الدخل البايظ بس** (عدّاد غير منتهي، صفر، فهرس
// بره المدى) — الباقي قرار النافذة.
// ─────────────────────────────────────────────────────────────────────────────

/** من أنهي سجل في أنهي رسالة طلع الصف ده. */
export interface JudgeEmitInfo {
  /** فهرس السجل جوّه رسالته (٠-based). */
  index: number;
  /** عدد السجلات اللي الرسالة دي طلّعتها. */
  count: number;
  /** نصّ السجل اتلمّ من رسالتين؟ (`SessionRecord.fromCarry`) */
  fromCarry: boolean;
}

/**
 * `null` = عدّي لحساب النافذة (اللي هو بيتحقّق من لوحة الصف بنفسه).
 * **فشل مغلق**: أي دخل مش منطقي (عدّاد غير منتهي، صفر، فهرس بره المدى) = سكوت —
 * دخل بايظ معناه إن المنادي نفسه مش عارف الصف طلع منين، فمافيش إثبات ممكن.
 * `undefined` = المنادي مش من مسار متعدّد اللوحات (المحرك المحلي: لوحة لكل نتيجة)
 * ⇒ السلوك القديم بالحرف.
 *
 * ⚠️ الحزام على **نوافذ الرسالة** مش هنا — هو في `planPlateWindow`
 *    (`needsProvenWindow`): صف مش وحيد في رسالته أو نصّه من رسالتين ماياخدش أي
 *    نافذة غير مثبَتة. الفصل ده مقصود: البوابة مابتشوفش كلمات ولا توقيت، فمش
 *    من حقّها تقرّر «مافيش إثبات».
 */
export function planJudgeEmitGate(
  emit: JudgeEmitInfo | null | undefined,
): "multi_plate_message" | "carried_over" | null {
  if (emit === null || emit === undefined) return null;
  const count = finite(emit.count) ? emit.count : NaN;
  const index = finite(emit.index) ? emit.index : NaN;
  if (!Number.isFinite(count) || !Number.isFinite(index)) return "multi_plate_message";
  if (count < 1 || index < 0 || index >= count) return "multi_plate_message";
  return null;
}

export type JudgeAdmission = "run" | "queue" | "busy" | "queue_full";

/**
 * يقرّر: يمشي فوراً، يستنى في الطابور، ولا يسكت وليه. **نقية**، ونفسها اللي
 * `planJudgeSlice` بينادّيها — فمستحيل القرارين يختلفوا.
 * بلا `maxQueue` (الافتراضي ٠) بترجّع `busy` بالحرف زي السلوك القديم.
 */
export function planJudgeAdmission(input: {
  inflight?: number; queued?: number; maxInflight?: number; maxQueue?: number;
}): JudgeAdmission {
  const i = input ?? {};
  const inflight = finite(i.inflight) ? (i.inflight as number) : 0;
  const queued = finite(i.queued) ? (i.queued as number) : 0;
  const maxInflight = finite(i.maxInflight) ? (i.maxInflight as number) : JUDGE_DEFAULT_MAX_INFLIGHT;
  const maxQueue = finite(i.maxQueue) ? (i.maxQueue as number) : JUDGE_DEFAULT_MAX_QUEUE;
  if (inflight < maxInflight) return "run";
  if (maxQueue <= 0) return "busy";
  return queued < maxQueue ? "queue" : "queue_full";
}

export type JudgeSlicePlan =
  | { skip: JudgeSkipReason; bytes?: number }
  | {
      skip: null; base: number; endIdx: number; startMs: number; endMs: number; bytes: number;
      /** أي قاعدة نافذة اشتغلت — بيتسجّل في سجل الطيّار. */
      windowSource: JudgeWindowSource;
    };

function finite(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * يقرّر: نبعت نافذة، ولا نسكت وليه. **نقية** — مافيش Blob ولا شبكة ولا refs.
 *
 * ضمانات النافذة (كلها مغطّاة باختبار — نبعت غلط أوحش من إننا نسكت):
 *  • `base` بيتقصّ على `[0, n]` وبيتقرّب لتحت. `slice` بفهرس **سالب** بيرجّع من
 *    آخر المصفوفة، يعني بادئة **بلا ترويسة EBML** = ملف مايتفكّش، وكان هيتحسب
 *    «الموديل ماردّش» بدل «إحنا بعتنا بايظ».
 *  • أي توقيت غير منتهي (NaN/Infinity) = `no_timing`، مش حساب بيطلع NaN بيتحوّل
 *    لـ`slice(base, NaN)` = مصفوفة فاضية = **سبب غلط** (`no_audio`).
 *  • `endMs > startMs` دايماً (فرق جزء واحد كأقل حد) فـ`buildTranscribeUrl`
 *    عمره ما يرمي النافذة ويبعت المقطع كله.
 *  • `endIdx ≤ n` فالقصّة عمرها ما تعدّي المتجمّع، وفوق السقف بترجع
 *    `prefix_too_large` بالحجم — يعني **مستحيل** نبعت أكبر من `maxBytes`.
 */
export function planJudgeSlice(input: JudgeSliceInput): JudgeSlicePlan {
  const chunkMs = finite(input?.chunkMs) ? (input.chunkMs as number) : JUDGE_DEFAULT_CHUNK_MS;
  const maxBytes = finite(input?.maxBytes) ? (input.maxBytes as number) : JUDGE_MAX_PREFIX_BYTES;

  if (!input?.hasConfig) return { skip: "not_configured" };
  // بوابة الإصدار **قبل** أي حساب نافذة — بس بقت على الدخل البايظ وحده: منادي
  // مش عارف الصف طلع من أنهي سجل في أنهي رسالة مش عنده أساس لأي إثبات. باقي
  // القرار للنافذة (اللي بتتحقّق من لوحة الصف بنفسها).
  const emitSkip = planJudgeEmitGate(input.emit);
  if (emitSkip) return { skip: emitSkip };
  // النافذة في دالة نقية واحدة (`planPlateWindow`) — المخطِّط بيمرّر المكوّنات
  // الخام زي ما جت من الصفحة ومابيحسبش حاجة بنفسه.
  const w = planPlateWindow(input);
  if (!w.ok) return { skip: w.reason };
  const adm = planJudgeAdmission(input);
  if (adm === "busy" || adm === "queue_full") return { skip: adm };

  const sizes = Array.isArray(input.chunkSizes) ? input.chunkSizes : [];
  const n = sizes.length;
  const rawBase = finite(input.base) ? Math.floor(input.base as number) : 0;
  const base = Math.min(Math.max(0, rawBase), n);
  const startMs = w.startMs;
  const endMs = Math.max(startMs + chunkMs, w.endMs);
  const endIdx = Math.min(n, base + Math.ceil(endMs / chunkMs) + 2);
  if (endIdx <= base) return { skip: "no_audio" };

  let bytes = 0;
  for (let i = base; i < endIdx; i++) bytes += finite(sizes[i]) ? sizes[i] : 0;
  if (bytes <= 0) return { skip: "no_audio" };
  if (bytes > maxBytes) return { skip: "prefix_too_large", bytes };

  return { skip: null, base, endIdx, startMs, endMs, bytes, windowSource: w.source };
}

// ─────────────────────────────────────────────────────────────────────────────
// «جرّب الاتصال» — رحلة حقيقية كاملة قبل ما المندوب يتكلّم
// =============================================================================
// «متوصّل» في المربّع بتوصف **التخزين على الجهاز** بس (نفق + توكن شكلهم سليم)
// ومابتقولش حرف عن إن الخدمة بتستلم. في الحادثة كل الطلبات كانت بترجع من بوابة
// على السيرفر **قبل** أي تسجيل، فالمربّع فضل مطمّن جلسة كاملة وصفر طلب وصل.
// الفحص ده بيقفل الفرق: مقطع صناعي صغير بيمشي على **نفس** `postAudioForPlate`
// اللي النبضات بتمشي عليه — نفس الترويسة، نفس CORS، نفس النفق، نفس فحص الرد —
// ويرجّع اللوحة والزمن أو كود الخطأ الحقيقي.
// ─────────────────────────────────────────────────────────────────────────────

export const SELF_TEST_SR = 16000;      // الموديل مايعرفش غير ١٦ك مونو
export const SELF_TEST_MS = 400;        // > ٢٥ms اللي الخدمة بترفض تحتها (:294)
export const SELF_TEST_MIME = "audio/wav";

/**
 * مقطع WAV صناعي صغير (١٢٫٨ كيلو) — نغمة ٢٢٠Hz خفيفة، **مش** سكوت رقمي.
 * ليه WAV مش webm؟ عشان يتبنى بلا MediaRecorder وبلا صلاحية مايك، فالفحص
 * يشتغل والمايك مقفول. و`audio/wav` موجود في `MIME_EXT` (plate_server.py:185)
 * فـffmpeg بياخده بامتداده الصح.
 * ليه نغمة مش سكوت؟ البوابة بتقرا `mean_db`/`gate_max_rms`، والسكوت الرقمي
 * بيوقّع مسار «صوت فاضي» — إحنا بنفحص **الطريق** مش دقّة الموديل، فعايزين ٢٠٠
 * برد سليم؛ رفض البوابة للنغمة نتيجة متوقّعة ومقبولة.
 */
export function buildSelfTestClip(): Blob {
  const nSamples = Math.round((SELF_TEST_SR * SELF_TEST_MS) / 1000);
  const dataBytes = nSamples * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const tag = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  dv.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  dv.setUint32(16, 16, true);            // طول كتلة fmt
  dv.setUint16(20, 1, true);             // PCM
  dv.setUint16(22, 1, true);             // مونو
  dv.setUint32(24, SELF_TEST_SR, true);
  dv.setUint32(28, SELF_TEST_SR * 2, true); // بايت/ثانية
  dv.setUint16(32, 2, true);             // بايت/إطار
  dv.setUint16(34, 16, true);            // بِت/عيّنة
  tag(36, "data");
  dv.setUint32(40, dataBytes, true);
  const amp = 0.06 * 32767;              // خفيفة — إشارة موجودة بلا تشبيع
  for (let i = 0; i < nSamples; i++) {
    dv.setInt16(44 + i * 2, Math.round(amp * Math.sin((2 * Math.PI * 220 * i) / SELF_TEST_SR)), true);
  }
  return new Blob([buf], { type: SELF_TEST_MIME });
}

export interface JudgeTranscribeProbeResult {
  /** ٢٠٠ + شكل رد مطابق. `false` = فشل، والسبب في `code`. */
  ok: boolean;
  /** `answered` أو نفس أكواد فشل `postAudioForPlate` (http_401 / network / …). */
  code: string;
  plate: string | null;
  accepted: boolean | null;
  serverMs: number | null;
  clientMs: number;
  model: string | null;
  bytes: number;
}

export interface TranscribeProbeOptions {
  transcribeUrl: string;
  token: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch | null;
}

/**
 * بيبعت المقطع الصناعي على `POST /transcribe` ويرجّع **الواقع**: اللوحة والزمن،
 * أو كود الخطأ بالحرف. زي باقي الملف: **عمرها ما ترمي**.
 *
 * ليه دي جنب `probeJudgeEndpoint` (اللي بتعمل `GET /health`) ومش بدالها؟
 * الاتنين بيقيسوا حاجتين مختلفتين، والاتنين لازمين:
 *   • `probeJudgeEndpoint` = أرخص فحص: هل الطلب **بيخرج من الجهاز** أصلاً
 *     (preflight/CORS/نفق) وهل التوكن والمسار صح. مافيش استنتاج، مافيش GPU.
 *   • دي = الرحلة **الكاملة** اللي النبضة الحقيقية بتمشي عليها: نفس
 *     `postAudioForPlate`، نفس `POST /transcribe`، نفس ffmpeg، نفس الموديل، نفس
 *     `parseJudgeResponse`. يعني بترجّع لوحة وزمن حقيقيين — «الرد وصل وشكله
 *     مطابق» مش «الخدمة بترد على /health».
 * بلا `start/end` عن قصد: المقطع كله ٤٠٠ms، والنافذة بتضيف مسار خطأ ماله لازمة.
 */
export async function probeJudgeTranscribe(
  opts: TranscribeProbeOptions,
): Promise<JudgeTranscribeProbeResult> {
  const t0 = Date.now();
  const fail = (code: string, bytes = 0): JudgeTranscribeProbeResult => ({
    ok: false, code, plate: null, accepted: null, serverMs: null,
    clientMs: Date.now() - t0, model: null, bytes,
  });
  try {
    if (!opts?.transcribeUrl || !opts?.token) return fail("not_configured");
    const blob = buildSelfTestClip();
    let errCode: string | null = null;
    const resp = await postAudioForPlate(blob, {
      transcribeUrl: opts.transcribeUrl,
      token: opts.token,
      mimeType: SELF_TEST_MIME,
      timeoutMs: opts.timeoutMs,
      retryDelayMs: opts.retryDelayMs,
      fetchImpl: opts.fetchImpl,
      onError: (c) => { errCode = c; },
    });
    if (!resp) return fail(errCode ?? "no_answer", blob.size);
    return {
      ok: true, code: "answered",
      plate: resp.plate, accepted: resp.accepted, serverMs: resp.serverMs,
      clientMs: Date.now() - t0, model: resp.model, bytes: blob.size,
    };
  } catch {
    return fail("error");
  }
}

/** رقم منتهي أو null — أي حاجة تانية (سترنج/NaN/Infinity) = رد مرفوض. */
function numOrNull(v: unknown, bad: { hit: boolean }): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) { bad.hit = true; return null; }
  return v;
}

/**
 * يبني العنوان مع نافذة القصّ. **متوافق للخلف**: بلا توقيت سليم بيرجّع نفس
 * العنوان بالحرف، وده بالظبط عقد `/transcribe` القديم (المقطع كله).
 * ليه القصّ على السيرفر أصلاً؟ شوف قرار التقطيع في `lib/plateJudgeLog.ts` وفي
 * تعليق `requestSecondOpinion` في صفحة التشييك.
 */
export function buildTranscribeUrl(base: string, startMs?: number, endMs?: number): string {
  if (typeof startMs !== "number" || typeof endMs !== "number") return base;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return base;
  if (startMs < 0 || endMs <= startMs) return base;
  const start = startMs / 1000;
  const end = Math.min(endMs / 1000, start + JUDGE_MAX_WINDOW_S);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}start=${start.toFixed(3)}&end=${end.toFixed(3)}`;
}

/**
 * يتحقّق من جسم الرد بالكامل ويحوّله. `null` = مانثقش فيه.
 * الحقول الإجبارية: `plate` سترنج، `accepted` بوليان. وجود `error` = شكل فشل.
 */
export function parseJudgeResponse(raw: unknown): JudgePlateResponse | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.error === "string" && o.error) return null;
  if (typeof o.plate !== "string" || o.plate.length > MAX_PLATE_CHARS) return null;
  if (typeof o.accepted !== "boolean") return null;

  const bad = { hit: false };
  let mean: number | null = null, min: number | null = null, nsp: number | null = null;
  const c = o.confidence;
  if (c !== undefined && c !== null) {
    if (typeof c !== "object" || Array.isArray(c)) return null;
    const cc = c as Record<string, unknown>;
    mean = numOrNull(cc.mean_logprob, bad);
    min = numOrNull(cc.min_logprob, bad);
    nsp = numOrNull(cc.no_speech_prob, bad);
  }
  const serverMs = numOrNull(o.ms, bad);
  if (bad.hit) return null;

  return {
    plate: o.plate,
    plateNorm: typeof o.plate_norm === "string" ? o.plate_norm : "",
    accepted: o.accepted,
    refuseReason: typeof o.refuse_reason === "string" ? o.refuse_reason : null,
    meanLogprob: mean,
    minLogprob: min,
    noSpeechProb: nsp,
    serverMs,
    model: typeof o.model === "string" ? o.model : null,
  };
}

function safeCall(fn: ((code: string) => void) | undefined, code: string) {
  try { fn?.(code); } catch { /* المسجّل مايكسرش المسار */ }
}

/**
 * يبعت مقطع صوت ويرجّع رأي موديلنا، أو `null` لو أي حاجة غلطت.
 *
 * إعادة المحاولة: **واحدة كأقصى، ولفشل الشبكة بس** (fetch رمى TypeError = مافيش
 * اتصال). ولا واحدة لأي رد HTTP: ٤٠١ توكن غلط بيفضل غلط والإعادة بتضاعف الضجيج
 * في قياس الطيّار، و٥٠٣ «الطابور ملآن» الإعادة بتزنق الخدمة أكتر (الخدمة نفسها
 * بترجّع `retry_after_ms` وبتفضّل إننا نمشي). والمهلة **مش** فشل شبكة — لو
 * الحساب فات وقته فإعادته تفوته تاني.
 */
export async function postAudioForPlate(
  blob: Blob,
  options: PostAudioOptions,
): Promise<JudgePlateResponse | null> {
  try {
    const { transcribeUrl, token, onError, debug } = options;
    if (!transcribeUrl || !token) return null;
    if (!blob || blob.size <= 0) return null;
    const doFetch = options.fetchImpl === undefined
      ? (typeof fetch === "function" ? fetch : null)
      : options.fetchImpl;
    if (typeof doFetch !== "function") return null;

    const url = buildTranscribeUrl(transcribeUrl, options.startMs, options.endMs);
    const timeoutMs = options.timeoutMs ?? JUDGE_TIMEOUT_MS;
    const headers: Record<string, string> = {
      // ⚠️ التوكن في ترويسة **بس** — الـquery بيتسرّب في سجلات الوسطاء
      // ولوحة Cloudflare وتاريخ المتصفّح (serving/plate_server.py:50-52).
      "X-Plate-Token": token,
      "Content-Type": options.mimeType || blob.type || "application/octet-stream",
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => { try { ctrl.abort(); } catch { /* ignore */ } }, timeoutMs);
      const t0 = Date.now();
      try {
        const res = await doFetch(url, { method: "POST", headers, body: blob, signal: ctrl.signal });
        if (!res.ok) { safeCall(onError, `http_${res.status}`); return null; }
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          safeCall(onError, "bad_json");
          return null;
        }
        const parsed = parseJudgeResponse(body);
        if (!parsed) { safeCall(onError, "bad_shape"); return null; }
        if (debug) {
          // السطر الوحيد المسموح — والمالك بس هو اللي بيوصله.
          console.debug("[plate-judge]", parsed.plate, parsed.accepted, `${parsed.serverMs ?? "?"}ms`,
            `rtt=${Date.now() - t0}ms`);
        }
        return parsed;
      } catch (e) {
        const name = (e as { name?: string } | null)?.name;
        if (name === "AbortError") { safeCall(onError, "timeout"); return null; }
        const isNetwork = e instanceof TypeError;
        if (!isNetwork) { safeCall(onError, "error"); return null; }
        if (attempt === 1) { safeCall(onError, "network"); return null; }
        const delay = options.retryDelayMs ?? 250;
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  } catch {
    return null;                    // حزام أمان أخير — المنادي مايشوف استثناء أبداً
  }
}

import { describe, it, expect } from "vitest";
import {
  canOpenTrialPage, planTrialRun, resolveTrialEndpoint,
  TRIAL_MODEL_BASE, shouldAskType, tokenProbeVerdict,
} from "../lib/trialModelGate";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  صفحة «التسجيل الجديد (تجربة)» — مين يفتحها، وإمتى تشتغل
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٢ سبتمبر ٢٠٢٦): «شيل اللي فيه وحط الجديد بتاعنا مكانه علشان
 *  أجربه، وعايزها تبقى مفتوحة **للأدمنز فقط**».
 *
 *  ── ليه الاتنين في ملف واحد نقي ───────────────────────────────────────
 *  الصفحة مكوّن React ومالهاش اختبار، فالقرارين الحسّاسين اتشالوا برّه:
 *    ① **مين يفتح** — حدّ صلاحية. مافيش عمود `is_admin` في `profiles`؛
 *       الأدمن = `role === "admin"` (٢٠ استخدام في الريبو) والسوبر أدمن
 *       علم منفصل `is_super`.
 *    ② **إمتى تشتغل** — الصفحة بتشتغل على محركين: المحرك العام بيلاقي
 *       **مواقع** اللوحات، وموديلنا **بيقرا كل لوحة**. لو موديلنا مش
 *       متاح، `runBatchTranscription` بيرجّع `usedModel:false` والنتيجة
 *       بتطلع من النص العام **من غير ما حد ياخد باله**.
 *
 *  🔴 وده بالظبط اللي بيبطّل التجربة: المالك بيجرّب «موديلنا الجديد» وهو
 *     شايف نتيجة المحرك العام. التجربة لازم **ترفض تشتغل** بلا موديلنا.
 */

/**
 * ══════════════════════════════════════════════════════════════════════
 *  مين يفتح «الجديد» — **نفس قاعدة «صوتي» بالظبط**
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦):
 *    «الصفحة تتقفل فقط على اللي مش مشترك معانا في خدمة الصوت»
 *    «واربطلي الصفحة دي بزرّ فتح الصوت… لو مقفول عنده الصوت، الصفحة دي
 *     متظهرش معاه ولا صوتي»
 *
 *  🔴 **مصدر واحد للحقيقة**: `voiceTabVisible` — الدالة اللي «صوتي»
 *  ماشية عليها. والزرّين بتوع المالك (عند عمل الإيميل `create-agent`،
 *  وفي صفحة كل مندوب `manage-agent`) بيكتبوا `voicex_enabled` — فالزرّ
 *  الواحد بيقفل ويفتح الاتنين مع بعض **من غير أي كود في صفحات الأدمن**.
 *
 *  ⚠️ **الأدمن مالوش استثناء**: «صوتي» مابتفتحش لأدمن مالوش صوت، و«الجديد»
 *  زيها بالظبط. السوبر أدمن بس هو اللي مالوش حدّ (زي «صوتي»).
 */
describe("canOpenTrialPage — نفس قاعدة «صوتي»", () => {
  // عمود `voicex_until` نوعه `date` في الداتابيز ⇒ صيغة YYYY-MM-DD (زي ما
  // `serviceActive` مستنية). تاريخ بالساعة كان بيطلع Invalid Date.
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const future = ymd(new Date(Date.now() + 30 * 864e5));
  const past = ymd(new Date(Date.now() - 3 * 864e5));

  it("🔴 مشترك الصوت (مفعّل + أيامه سارية) يفتح", () => {
    expect(canOpenTrialPage({ role: "agent", voicex_enabled: true, voicex_until: future })).toBe(true);
  });

  it("مشترك الصوت بلا تاريخ نهاية = سارية (زي صوتي)", () => {
    expect(canOpenTrialPage({ role: "agent", voicex_enabled: true, voicex_until: null })).toBe(true);
  });

  it("🔴 الصوت مقفول ⇒ **مايفتحش**", () => {
    expect(canOpenTrialPage({ role: "agent", voicex_enabled: false })).toBe(false);
  });

  it("🔴 أيام الصوت خلصت ⇒ **مايفتحش**", () => {
    expect(canOpenTrialPage({ role: "agent", voicex_enabled: true, voicex_until: past })).toBe(false);
  });

  it("السوبر أدمن يفتح دايماً (زي صوتي)", () => {
    expect(canOpenTrialPage({ role: "agent", is_super: true })).toBe(true);
  });

  it("⚠️ الأدمن بلا صوت مايفتحش — زي صوتي بالظبط", () => {
    expect(canOpenTrialPage({ role: "admin", voicex_enabled: false })).toBe(false);
  });

  it("الأدمن اللي عنده صوت يفتح", () => {
    expect(canOpenTrialPage({ role: "admin", voicex_enabled: true, voicex_until: future })).toBe(true);
  });

  it("🔴 بروفايل ناقص/بايظ = **مقفول** — الفشل بيقفل مش بيفتح", () => {
    expect(canOpenTrialPage(null)).toBe(false);
    expect(canOpenTrialPage(undefined)).toBe(false);
    expect(canOpenTrialPage({})).toBe(false);
  });
});

describe("planTrialRun — ماتشتغلش بلا موديلنا", () => {
  it("عنوان + توكن = تشتغل", () => {
    expect(planTrialRun({ base: "https://x.example", token: "t" })).toEqual({ ok: true });
  });

  it("🔴 بلا عنوان = **رفض** برسالة تقول السبب", () => {
    const r = planTrialRun({ base: null, token: "t" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("no_base");
    expect(r.ok === false && r.message.length).toBeGreaterThan(10);
  });

  it("🔴 بلا توكن = **رفض**", () => {
    const r = planTrialRun({ base: "https://x.example", token: "" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("no_token");
  });

  it("فراغات لوحدها = مافيش", () => {
    expect(planTrialRun({ base: "   ", token: "t" }).ok).toBe(false);
    expect(planTrialRun({ base: "https://x.example", token: "   " }).ok).toBe(false);
  });

  it("🔴 عنوان مش https = رفض (التطبيق https والمتصفّح هيمنعه)", () => {
    const r = planTrialRun({ base: "http://x.example", token: "t" });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("not_https");
  });
});

describe("resolveTrialEndpoint — سيرفر التجربة مثبّت في البرنامج", () => {
  /**
   * المالك (٢٢ سبتمبر): «ثبّت الجديد اللي على سيرفر ماليزيا في البرنامج في
   * صفحة التسجيل الجديد تجربة». يعني يفتح الصفحة ويلاقيها موصّلة — من غير ما
   * ينسخ عنوان ويلزقه كل مرة.
   *
   * بس **الإعداد اليدوي لازم يفضل يغلب**: النفق السريع بيتغيّر مع كل إعادة
   * تشغيل (توثيق Vast: «ephemeral … lost on restart — don't depend on them»)،
   * فلو العنوان المثبّت بايظ لازم يقدر يحطّ الجديد من غير ما ننشر نسخة.
   */
  /**
   * ══════════════════════════════════════════════════════════════════
   *  🔴 التوكن **مابقاش في الكود** — بيجي من الداتابيز
   * ══════════════════════════════════════════════════════════════════
   *  كان `TRIAL_MODEL_TOKEN = "plate-voice-lab-local-dev"` مكتوب صريح،
   *  والتعليق نفسه كان بيقول «مش سرّ حقيقي — أي تشغيل طويل لازم يتغيّر».
   *  والتوكن ده **بيتشحن جوّه التطبيق لكل موبايل**، فأي حد يفتح ملفات
   *  التطبيق ياخده ويبعت صوت على طول للسيرفر ⇒ ياكل الكارت والمناديب
   *  يبطّوا أو يترفضوا.
   *
   *  وصفحة التشييك بتعمل الصح أصلاً: التوكن في `app_settings` (جدول مالوش
   *  سياسة SELECT) وبيتجاب وقت التشغيل بـ`get_voicex_token`. بنعمل نفس
   *  الشكل بالظبط — `get_trial_token`.
   *
   *  ⚠️ **والفشل بيقفل**: مافيش توكن ⇒ سلسلة فاضية ⇒ `planTrialRun` بيرفض
   *  التشغيل برسالة واضحة. مافيش رجوع لتوكن مكتوب في الكود خالص.
   */
  it("مافيش محفوظ ⇒ العنوان المثبّت + توكن الداتابيز", () => {
    expect(resolveTrialEndpoint(null, "db-secret")).toEqual({ base: TRIAL_MODEL_BASE, token: "db-secret" });
    expect(resolveTrialEndpoint({}, "db-secret")).toEqual({ base: TRIAL_MODEL_BASE, token: "db-secret" });
  });

  it("🔴 مافيش توكن في الداتابيز ولا محفوظ ⇒ فاضي (الفشل بيقفل)", () => {
    expect(resolveTrialEndpoint(null, null)).toEqual({ base: TRIAL_MODEL_BASE, token: "" });
    expect(resolveTrialEndpoint(null)).toEqual({ base: TRIAL_MODEL_BASE, token: "" });
    expect(planTrialRun(resolveTrialEndpoint(null, null)).ok).toBe(false);
  });

  it("🔴 المحفوظ يدوياً **يغلب** الاتنين", () => {
    expect(resolveTrialEndpoint({ base: "https://other.example", token: "tk" }, "db-secret"))
      .toEqual({ base: "https://other.example", token: "tk" });
  });

  it("محفوظ ناقص ⇒ الناقص بس يتاخد من المثبّت/الداتابيز", () => {
    expect(resolveTrialEndpoint({ base: "https://other.example", token: "" }, "db-secret"))
      .toEqual({ base: "https://other.example", token: "db-secret" });
    /**
     * ⚠️ عنوان فاضي ⇒ بنقع على سيرفرنا المثبّت ⇒ **توكن الداتابيز يغلب**
     * المحفوظ. القاعدة دي اتغيّرت بقصد بعد بلاغ «اللوحات مش بتطلع» —
     * التفصيل في وصف `توكن الداتابيز يغلب المحفوظ القديم` تحت.
     */
    expect(resolveTrialEndpoint({ base: "  ", token: "tk" }, "db-secret"))
      .toEqual({ base: TRIAL_MODEL_BASE, token: "db-secret" });
  });

  it("المثبّت + توكن الداتابيز لازم يعدّوا حارس التشغيل (https + توكن)", () => {
    expect(planTrialRun(resolveTrialEndpoint(null, "db-secret"))).toEqual({ ok: true });
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ③ ماننداش سيرفر النوع وهو مقفول — توفير داتا المندوب
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «أوقف كوهير دلوقتي لحد ما نظبطه».
 *
 *  🔴 **المشكلة مش الخطأ — هي الرفع.** `askType` بيرفع **الصوت كامل**
 *  (نافذة ٥ث ≈ ١٦٠ كيلو) لسيرفر النوع مع كل نافذة. لما كوهير يتقفل النفق
 *  بيرجّع 502 **بعد** ما الجسم يترفع — يعني ~٤٠ رفعة في الدقيقة على الفاضي،
 *  **~٦ ميجا/دقيقة من داتا موبايل المندوب** بلا أي مقابل.
 *
 *  والفحص بيتعمل أصلاً عند فتح الصفحة (`typeProbe`)، فالمعلومة موجودة —
 *  كنا بس مش بنستعملها.
 *
 *  ⚠️ **الفشل بيفتح مش بيقفل** هنا، عكس `canOpenTrialPage`: لو الفحص
 *  لسه ماتعملش (`null`) بنسأل عادي. القفل بيتم على **رد صريح بالفشل** بس،
 *  عشان عطل مؤقّت في الفحص مايلغيش النوع لبقية الجلسة.
 */
describe("shouldAskType — ماننداش سيرفر النوع وهو مقفول", () => {
  it("بيسأل لما الفحص يقول واصل", () => {
    expect(shouldAskType({ ok: true, msg: "81 عنصر" })).toBe(true);
  });

  it("ماينداش لما الفحص يقول مش واصل", () => {
    expect(shouldAskType({ ok: false, msg: "مافيش رد" })).toBe(false);
  });

  it("بيسأل لو الفحص لسه ماتعملش — الفشل بيفتح مش بيقفل", () => {
    expect(shouldAskType(null)).toBe(true);
    expect(shouldAskType(undefined)).toBe(true);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 توكن محفوظ **قديم** كان بيكتّم الصفحة
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (٢٣ سبتمبر ٢٠٢٦، بعد تغيير التوكن): «ظهرت تحت تمام بس
 *  المشكلة إني بقول لوحات مش بتطلع معايا».
 *
 *  السبب: الصفحة فيها مربّع إعداد بيحفظ العنوان **والتوكن** في تخزين
 *  الموبايل (`readJudgeEndpoint`). والمالك كان حافظ فيه التوكن القديم
 *  (`plate-voice-lab-local-dev`) من قبل ما نغيّره. وقاعدة «المحفوظ يدوياً
 *  يغلب» خلّت القديم يغلب اللي جاي من الداتابيز ⇒ السيرفر بيرفض **كل
 *  نافذة** بـ401 ⇒ **ولا لوحة تطلع**.
 *
 *  وأسوأ حاجة إن الصفحة كانت بتقول «متصل ✓» — لأن `/health` على السيرفر
 *  **مابيطلبش توكن أصلاً**، ففحص الاتصال كان بيعدّي بأي توكن غلط.
 *
 *  ⇒ التوكن بقى **سرّ مُدار من الداتابيز**، مش إعداد يدوي. فلما العنوان
 *    هو سيرفرنا المثبّت، **توكن الداتابيز يغلب** أي محفوظ قديم.
 *
 *  ⚠️ بس **العنوان المخصّص بيفضل ياخد توكنه المحفوظ**: لو المالك وجّه
 *    الصفحة لسيرفر تاني (تجربة/طوارئ)، توكن سيرفرنا مالوش لازمة هناك.
 */
describe("توكن الداتابيز يغلب المحفوظ القديم", () => {
  it("🔴 عنوان مثبّت + محفوظ قديم ⇒ **توكن الداتابيز**", () => {
    expect(resolveTrialEndpoint({ base: TRIAL_MODEL_BASE, token: "plate-voice-lab-local-dev" }, "db-secret"))
      .toEqual({ base: TRIAL_MODEL_BASE, token: "db-secret" });
  });

  it("مافيش عنوان محفوظ + محفوظ قديم ⇒ توكن الداتابيز", () => {
    expect(resolveTrialEndpoint({ token: "plate-voice-lab-local-dev" }, "db-secret"))
      .toEqual({ base: TRIAL_MODEL_BASE, token: "db-secret" });
  });

  it("⚠️ عنوان **مخصّص** ⇒ التوكن المحفوظ يفضل يغلب", () => {
    expect(resolveTrialEndpoint({ base: "https://other.example", token: "tk" }, "db-secret"))
      .toEqual({ base: "https://other.example", token: "tk" });
  });

  it("عنوان مخصّص بلا توكن محفوظ ⇒ توكن الداتابيز (أحسن من ولا حاجة)", () => {
    expect(resolveTrialEndpoint({ base: "https://other.example" }, "db-secret"))
      .toEqual({ base: "https://other.example", token: "db-secret" });
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 فحص الاتصال لازم يفحص **التوكن** كمان
 * ══════════════════════════════════════════════════════════════════════
 *  `/health` مابيطلبش توكن، فكان بيقول «متصل ✓» وكل نافذة بتترفض بصمت.
 *  ده أخطر من عطل واضح — المالك بيسجّل وهو فاكر إن كل حاجة تمام.
 *
 *  الحل: نبعت `POST /transcribe` **بجسم فاضي**. السيرفر بيتحقق من التوكن
 *  **قبل** ما يبص على الصوت (`_auth()` ثم `if not raw`)، فالرد بيفرّق:
 *      401 ⇒ التوكن غلط          400 ⇒ التوكن تمام (بس مافيش صوت)
 *  وده فحص رخيص — مافيش صوت بيترفع ومافيش شغل على الكارت.
 */
describe("tokenProbeVerdict — الفحص يفرّق بين توكن غلط وسيرفر واقع", () => {
  it("400 (مافيش صوت) ⇒ التوكن سليم", () => {
    expect(tokenProbeVerdict(400)).toBe("ok");
  });

  it("401 ⇒ التوكن مرفوض", () => {
    expect(tokenProbeVerdict(401)).toBe("bad_token");
  });

  it("أي كود تاني ⇒ مش معروف، مانقولش إنه سليم", () => {
    expect(tokenProbeVerdict(500)).toBe("other");
    expect(tokenProbeVerdict(404)).toBe("other");
    expect(tokenProbeVerdict(0)).toBe("other");
  });
});

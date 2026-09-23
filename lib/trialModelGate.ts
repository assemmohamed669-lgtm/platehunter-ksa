/**
 * ══════════════════════════════════════════════════════════════════════
 *  صفحة «التسجيل الجديد (تجربة)» — حدّ الصلاحية وشرط التشغيل
 * ══════════════════════════════════════════════════════════════════════
 *
 * قرارين حسّاسين اتشالوا برّه الصفحة عشان يتغطّوا باختبارات (الصفحة مكوّن
 * React ومالهاش اختبار) — نفس أسلوب `planJudgeAdmission` في المشروع.
 */

/**
 * ══════════════════════════════════════════════════════════════════════
 *  سيرفر التجربة المثبّت — **ماليزيا** (Vast · RTX 5060 Ti)
 * ══════════════════════════════════════════════════════════════════════
 *  عليه `checkpoint-7500` — نفس الموديل اللي في المعمل **بالبايت**
 *  (`md5 6d7edc70c4e26670b16002e659697688`)، ومخرَجه اتقارن على ٣٢ مقطع
 *  مندوبين × تشغيلتين = **٣٢/٣٢ متطابق حرفياً**.
 *
 * ✅ **نفق ثابت باسم دائم** (٢٣ سبتمبر ٢٠٢٦) — بدل النفق السريع.
 *
 * النفق السريع (`trycloudflare`) كان **مؤقّت بالتصميم**: العنوان بيتغيّر مع
 * كل إعادة تشغيل، و**محدود بعدد المرات** — وفعلاً Cloudflare حظرتنا بـ429
 * بعد إعادات متتالية وفضلنا بلا نفق. مايصلحش لمناديب بيعتمدوا عليه.
 *
 * دلوقتي نفق Cloudflare باسم ثابت على دومين المالك:
 *   · اللوحات → `voice.qannas-ksa.com`  → 127.0.0.1:8761
 *   · النوع   → `type.qannas-ksa.com`   → 127.0.0.1:8762
 *
 * العنوان **مايتغيّرش أبداً** مهما اتعمل restart، ومافيش حدّ على المرات،
 * والخدمة بتقوم مع إقلاع الجهاز (`cloudflared service install`).
 */
export const TRIAL_MODEL_BASE = "https://voice.qannas-ksa.com";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 مافيش توكن في الكود — بيجي من الداتابيز
 * ══════════════════════════════════════════════════════════════════════
 *  كان هنا `TRIAL_MODEL_TOKEN = "plate-voice-lab-local-dev"`، وتعليقه نفسه
 *  كان بيقول «مش سرّ حقيقي — أي تشغيل طويل لازم يتغيّر». وده **بيتشحن جوّه
 *  التطبيق لكل موبايل**: أي حد يفتح ملفات التطبيق ياخده، ويبعت صوت على طول
 *  للسيرفر ⇒ ياكل الكارت والمناديب يبطّوا أو يترفضوا (503).
 *
 *  وصفحة التشييك بتعمل الصح أصلاً (`fetchVoicexToken`): التوكن في
 *  `app_settings` — جدول **مالوش سياسة SELECT** — وبيتجاب وقت التشغيل عبر
 *  دالة `SECURITY DEFINER` للمسجّلين بس. نفس الشكل هنا بالظبط.
 *
 *  التشغيل: `docs/sql/trial-model-token.sql` ثم
 *  `select public.set_trial_token('<السرّ>')`، ونفس السرّ في متغيّر
 *  `PLATE_JUDGE_TOKEN` على سيرفر ماليزيا.
 */

/** يقرا توكن الموديل الجديد (سرّ) عبر RPC. `null` على أي خطأ/غير محدّد. */
export async function fetchTrialToken(): Promise<string | null> {
  try {
    const { supabase } = await import("./supabaseClient");
    const { data, error } = await supabase.rpc("get_trial_token");
    if (error) return null;
    const t = String(data ?? "").trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * 🏷️ سيرفر **النوع والملاحظة** (كوهير) — نفق منفصل عن اللوحات.
 * `CohereLabs/cohere-transcribe-arabic-07-2026` بنسخة المعمل بالظبط
 * (md5 `7889a3fd…`) و**٨١ عنصر** في القاموس.
 * ✅ نفق ثابت زي اللي فوق — العنوان مايتغيّرش.
 */
export const TRIAL_TYPE_BASE = "https://type.qannas-ksa.com";

/**
 * العنوان اللي الصفحة هتستعمله: **المحفوظ يدوياً يغلب**، وبعده توكن
 * الداتابيز والعنوان المثبّت بيملوا الناقص. كده المالك يفتح الصفحة يلاقيها
 * موصّلة، ولو حصل أي عطل يقدر يحطّ عنوان/توكن بإيده من غير ما ننشر نسخة.
 *
 * ⚠️ **والفشل بيقفل**: مافيش توكن محفوظ ولا في الداتابيز ⇒ سلسلة فاضية،
 * و`planTrialRun` بيرفض التشغيل برسالة واضحة. **مافيش رجوع لتوكن مكتوب في
 * الكود** — ده كان بالظبط الخطر.
 */
export function resolveTrialEndpoint(
  saved: { base?: string | null; token?: string | null } | null | undefined,
  dbToken?: string | null,
): { base: string; token: string } {
  const base = String(saved?.base ?? "").trim();
  const token = String(saved?.token ?? "").trim();
  return {
    base: base || TRIAL_MODEL_BASE,
    token: token || String(dbToken ?? "").trim(),
  };
}

/** الشكل اللي بيرجع من `profiles` — أي حاجة تانية بتتعامل كـ«مقفول». */
export interface TrialProfile {
  role?: string | null;
  is_super?: boolean | null;
}

/**
 * 🔴 **الفشل بيقفل مش بيفتح.** بروفايل ناقص أو قراءة فاشلة = مايفتحش.
 *
 * مافيش عمود `is_admin` في `profiles` — الأدمن في المشروع ده
 * **`role === "admin"`** (٢٠ موضع في الريبو: `app/(app)/layout.tsx:77`،
 * `app/admin/layout.tsx:25`، …)، والسوبر أدمن علم منفصل `is_super`.
 * والسوبر أدمن بيفتح كمان لأنه صلاحية أعلى — مالوش معنى نقفلها عليه.
 */
export function canOpenTrialPage(profile: TrialProfile | null | undefined): boolean {
  if (!profile || typeof profile !== "object") return false;
  return profile.role === "admin" || profile.is_super === true;
}

export type TrialRunPlan =
  | { ok: true }
  | { ok: false; reason: "no_base" | "no_token" | "not_https"; message: string };

/**
 * 🔴 **التجربة ماتشتغلش بلا موديلنا.**
 *
 * الصفحة بتشتغل على محركين: المحرك العام بيلاقي **مواقع** اللوحات، وموديلنا
 * **بيقرا كل لوحة**. و`runBatchTranscription` لو ملقاش موديلنا بيكمّل
 * ويرجّع `usedModel: false` — يعني النتيجة بتطلع من النص العام **والمالك
 * فاكر إنه بيجرّب موديلنا**. ده بيبطّل التجربة من أصلها.
 *
 * ⇒ بنرفض التشغيل صراحةً وبنقول السبب، بدل نتيجة مضلِّلة.
 */
export function planTrialRun(input: { base: string | null | undefined; token: string | null | undefined }): TrialRunPlan {
  const base = String(input?.base ?? "").trim();
  const token = String(input?.token ?? "").trim();
  if (!base) {
    return {
      ok: false,
      reason: "no_base",
      message: "مافيش عنوان لخدمة الموديل. حطّ عنوان النفق في مربّع الإعداد تحت وجرّب الاتصال الأول.",
    };
  }
  if (!/^https:\/\/[^\s/]+/i.test(base)) {
    return {
      ok: false,
      reason: "not_https",
      message: "عنوان الخدمة لازم يبدأ بـ https — التطبيق نفسه https والمتصفّح بيمنع أي http.",
    };
  }
  if (!token) {
    return {
      ok: false,
      reason: "no_token",
      message: "مافيش توكن لخدمة الموديل. حطّه في مربّع الإعداد تحت.",
    };
  }
  return { ok: true };
}

/** نتيجة فحص سيرفر النوع زي ما الصفحة بتخزّنها. */
export interface TypeProbe {
  ok: boolean;
  msg?: string;
}

/**
 * ننادي سيرفر النوع ولا لأ؟
 *
 * 🔴 **الرفع هو التكلفة مش الخطأ.** `askType` بيرفع **الصوت كامل** (نافذة
 * ٥ث ≈ ١٦٠ كيلو) مع كل نافذة. لما كوهير يتقفل، النفق بيرجّع 502 **بعد** ما
 * الجسم يترفع — فالمندوب بيدفع ~٤٠ رفعة في الدقيقة (**~٦ ميجا/دقيقة من
 * داتا الموبايل**) مقابل لا حاجة. والفحص متعمل أصلاً عند فتح الصفحة.
 *
 * ⚠️ **الفشل بيفتح مش بيقفل** — عكس `canOpenTrialPage`. فحص لسه ماتعملش
 * (`null`) = بنسأل عادي؛ القفل على **رد صريح بالفشل** بس، عشان عطل لحظة
 * في الفحص مايلغيش النوع لبقية الجلسة.
 */
export function shouldAskType(probe: TypeProbe | null | undefined): boolean {
  if (!probe || typeof probe !== "object") return true;
  return probe.ok !== false;
}

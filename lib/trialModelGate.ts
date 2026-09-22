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
 * 🔴 **العنوان ده نفق سريع (quick tunnel) ومش دائم.** توثيق Vast بالحرف:
 *    «ephemeral, rate-limited, and lost on restart — don't depend on them».
 *    فلو السيرفر أو النفق اتعاد تشغيله، العنوان بيتغيّر و**لازم يتحدّث**:
 *      · إمّا من مربّع الإعداد في الصفحة (بيغلب المثبّت — بلا نشر نسخة)
 *      · أو هنا وننشر
 *    العنوان الدائم محتاج نطاق على Cloudflare (`CF_TUNNEL_TOKEN`).
 */
export const TRIAL_MODEL_BASE = "https://email-equity-about-wireless.trycloudflare.com";

/**
 * ⚠️ التوكن الافتراضي للخدمة. النفق عام، فده **مش سرّ حقيقي** — مقبول
 * لتجربة قصيرة، وأي تشغيل طويل لازم يتغيّر (`PLATE_JUDGE_TOKEN` على السيرفر).
 */
export const TRIAL_MODEL_TOKEN = "plate-voice-lab-local-dev";

/**
 * العنوان اللي الصفحة هتستعمله: **المحفوظ يدوياً يغلب**، والمثبّت بيملا
 * الناقص. كده المالك يفتح الصفحة يلاقيها موصّلة، ولو النفق اتغيّر يقدر
 * يحطّ الجديد من غير ما ننشر نسخة.
 */
export function resolveTrialEndpoint(
  saved: { base?: string | null; token?: string | null } | null | undefined,
): { base: string; token: string } {
  const base = String(saved?.base ?? "").trim();
  const token = String(saved?.token ?? "").trim();
  return {
    base: base || TRIAL_MODEL_BASE,
    token: token || TRIAL_MODEL_TOKEN,
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

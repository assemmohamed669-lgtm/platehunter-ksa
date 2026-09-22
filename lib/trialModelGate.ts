/**
 * ══════════════════════════════════════════════════════════════════════
 *  صفحة «التسجيل الجديد (تجربة)» — حدّ الصلاحية وشرط التشغيل
 * ══════════════════════════════════════════════════════════════════════
 *
 * قرارين حسّاسين اتشالوا برّه الصفحة عشان يتغطّوا باختبارات (الصفحة مكوّن
 * React ومالهاش اختبار) — نفس أسلوب `planJudgeAdmission` في المشروع.
 */

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

import { describe, it, expect } from "vitest";
import { isAllowedForVoiceOnly } from "@/lib/voiceOnlyRoutes";

/**
 * المشترك «صوت فقط»: الحارس في `app/(app)/layout.tsx` بيرجّع أي مسار لصفحة
 * التشييك. المشكلة إن القايمة الجانبية كانت لسه بتوريله لينكات الصفحات
 * المقفولة — يدوس فيترمي على طول من غير ما يفهم ليه، فشكله كأن البرنامج باظ.
 *
 * ولأن الحارس كان بيرمي **كل** حاجة، كان بيرمي كمان صفحات مالهاش علاقة
 * بالاشتراك: المظهر والمساعدة والمفاتيح. دي إعدادات مش خدمة مدفوعة ⇒ مسموحة.
 *
 * الدالة دي **مصدر واحد** بيستخدمه الحارس والقايمة مع بعض — عشان اللي بيتخفي
 * يبقى بالظبط اللي بيترمي، من غير ما الاتنين يفرقوا مع الوقت.
 */
describe("isAllowedForVoiceOnly", () => {
  it("التشييك وكل تبويباته مسموحة", () => {
    expect(isAllowedForVoiceOnly("/instant-check")).toBe(true);
    expect(isAllowedForVoiceOnly("/instant-check?tab=sheet")).toBe(true);
  });

  it("الإعدادات والمساعدة مسموحة — مالهاش علاقة بالاشتراك", () => {
    expect(isAllowedForVoiceOnly("/appearance")).toBe(true);
    expect(isAllowedForVoiceOnly("/help")).toBe(true);
    expect(isAllowedForVoiceOnly("/keys")).toBe(true);
  });

  it("صفحات الخدمة المقفولة ممنوعة", () => {
    // ⚠️ `/registration-v2` **اتشالت من هنا بقرار المالك** (٢٣ سبتمبر ٢٠٢٦) —
    // كانت ممنوعة وهي للأدمن بس، ودلوقتي «الجديد» لمشتركين الصوت. التفصيل
    // في «الجديد» لمشترك الصوت فقط تحت. `/registration` القديمة لسه ممنوعة.
    for (const p of ["/sorting", "/maps", "/wanted", "/list", "/backup",
                     "/data-upload", "/group-records", "/group-sort", "/registration"]) {
      expect(isAllowedForVoiceOnly(p)).toBe(false);
    }
  });

  it("المسار بامتداد بيتحسب زي أصله", () => {
    expect(isAllowedForVoiceOnly("/list?type=wanted")).toBe(false);
    expect(isAllowedForVoiceOnly("/appearance/theme")).toBe(true);
  });

  it("مسار شبيه بالاسم مش بيعدّي بالغلط", () => {
    // «/helpdesk» مش «/help» — المطابقة على حدود المسار مش مجرد بداية النص.
    expect(isAllowedForVoiceOnly("/helpdesk")).toBe(false);
    expect(isAllowedForVoiceOnly("/keysafe")).toBe(false);
  });

  it("مسار فاضي أو مش معروف = ممنوع (الافتراضي الآمن)", () => {
    expect(isAllowedForVoiceOnly("")).toBe(false);
    expect(isAllowedForVoiceOnly("/حاجة-جديدة")).toBe(false);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 «الجديد» لمشترك الصوت فقط — كان هيترمي على التشييك
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «لو مشترك الصوت فقط بيظهر عنده صوتي تحت،
 *  يظهر جنبها الصفحة الجديدة وتشتغل تصدير وكل حاجة زيها زي صوتي بالظبط».
 *
 *  التبويب اتضاف في الشريط، بس `app/(app)/layout.tsx` فيه حارس بيرجّع
 *  مشترك الصوت فقط لـ`/instant-check` من **أي** مسار مش في القايمة — فكان
 *  هيدوس «الجديد» **ويترمي على طول**. الصفحة لازم تبقى في القايمة.
 *
 *  ⚠️ والصفحة نفسها لسه بتقفل على اللي مالوش صوت (`canOpenTrialPage`) —
 *     القايمة دي بتقول بس «مسموح يروح هناك»، مش «يدخل».
 */
describe("«الجديد» لمشترك الصوت فقط", () => {
  it("🔴 مسموح — وإلا الحارس بيرجّعه للتشييك", () => {
    expect(isAllowedForVoiceOnly("/registration-v2")).toBe(true);
  });

  it("بالكويري كمان", () => {
    expect(isAllowedForVoiceOnly("/registration-v2?x=1")).toBe(true);
  });

  it("⚠️ **الصفحة القديمة** `/registration` لسه ممنوعة — حدود المسار", () => {
    expect(isAllowedForVoiceOnly("/registration")).toBe(false);
  });
});

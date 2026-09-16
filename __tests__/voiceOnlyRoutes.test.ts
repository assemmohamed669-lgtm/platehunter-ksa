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
    for (const p of ["/sorting", "/maps", "/wanted", "/list", "/backup",
                     "/data-upload", "/group-records", "/group-sort", "/registration-v2"]) {
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

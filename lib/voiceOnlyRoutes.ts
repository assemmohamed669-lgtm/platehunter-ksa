/**
 * المسارات المسموحة للمشترك «صوت فقط» — **مصدر واحد** للحارس وللقايمة.
 *
 * الحارس في `app/(app)/layout.tsx` بيرجّع أي مسار ممنوع لصفحة التشييك،
 * والقايمة الجانبية بتستخدم نفس الدالة عشان تخفي لينكاته. لو كل واحد فيهم
 * قرّر لوحده، هيفرقوا مع الوقت والمندوب يرجع يدوس على لينك بيترميه.
 *
 * الإعدادات والمساعدة والمفاتيح مسموحة: دي مش خدمة مدفوعة، وقفلها كان بيمنع
 * المندوب من تغيير المظهر أو قراءة الشرح من غير سبب.
 */

/** أصول المسارات المسموحة. أي حاجة تانية ممنوعة (الافتراضي الآمن). */
const ALLOWED_ROOTS = ["/instant-check", "/appearance", "/help", "/keys"];

export function isAllowedForVoiceOnly(pathname: string): boolean {
  if (!pathname) return false;
  // نشيل الكويري والهاش — «/list?type=wanted» لازم تتحسب زي «/list».
  const path = pathname.split(/[?#]/)[0];
  // المطابقة على **حدود المسار**: «/helpdesk» مش «/help».
  return ALLOWED_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

/**
 * صلاحيات تبويبات الشريط السفلي.
 *
 * الشريط ده بيشوفه كل المناديب، فمين يشوف إيه لازم يبقى منطق نقي متغطّى
 * باختبارات — مش شرط متكتوب جوّه المكوّن. تبويب ظهر لمندوب غلط معناه إنه
 * هيدوس عليه ويترمي برّه.
 */

export interface TabPerm {
  /** للسوبر أدمن بس (التسجيل). */
  superOnly?: boolean;
  /** للأدمن بس (رفع داتا). */
  adminOnly?: boolean;
  /**
   * للأدمن **أو** السوبر أدمن (تبويب «الجديد»).
   *
   * 🔴 مش زي `adminOnly`: ده بيطابق `canOpenTrialPage` بالظبط
   * (`role === "admin" || is_super === true`). لو استعملنا `adminOnly`
   * كان سوبر أدمن مش رول-أدمن هيبقى عنده صفحة **مفتوحة ومالهاش تبويب**.
   */
  adminOrSuper?: boolean;
  /**
   * لأي حد عنده **خدمة الصوت** (تبويب «الجديد»).
   *
   * المالك (٢٣ سبتمبر ٢٠٢٦): «الصفحة تتقفل فقط على اللي مش مشترك معانا في
   * خدمة الصوت». مالوش علاقة بالرول — بيطابق `canOpenTrialPage`، واللي
   * الاتنين ماشيين على `voiceTabVisible` (نفس دالة «صوتي»).
   */
  needsVoice?: boolean;
}

export interface UserPerms {
  isSuper: boolean;
  isAdmin: boolean;
  /**
   * عنده خدمة الصوت؟ (`voiceTabVisible`). اختياري: لو مش معروفة لسه
   * بتتعامل **مقفولة** — التبويب مايظهرش قبل ما نتأكد.
   */
  hasVoice?: boolean;
}

/**
 * التبويب ده يظهر للمستخدم ده؟ التبويب العادي بيظهر للكل.
 *
 * الوسيط `unknown` بقصد: تعريف التبويب الحقيقي فيه href و label و icon كمان،
 * وTypeScript بيرفض النوع اللي كل خصائصه اختيارية لو مافيش خاصية مشتركة
 * (weak type). فبناخده زي ما هو وبنقرا الصلاحيات منه.
 */
export function canSeeTab(tab: unknown, perms: UserPerms): boolean {
  const t = (tab ?? {}) as TabPerm;
  if (t.superOnly && !perms.isSuper) return false;
  if (t.adminOnly && !perms.isAdmin) return false;
  if (t.adminOrSuper && !perms.isAdmin && !perms.isSuper) return false;
  if (t.needsVoice && perms.hasVoice !== true) return false;
  return true;
}

/** التبويبات اللي المستخدم ده المفروض يشوفها، بترتيبها. */
export function visibleTabs<T>(tabs: readonly T[], perms: UserPerms): T[] {
  return tabs.filter((t) => canSeeTab(t, perms));
}

/**
 * التبويب ده منوّر؟ — العنوان هو **هو** أو صفحة **جوّاه** (`/maps/123`).
 *
 * 🔴 كان `pathname.startsWith(href)`، فـ`/registration-v2` («الجديد») كانت
 * بتنوّر `/registration` («التسجيل») معاها. المالك (٢٣ سبتمبر ٢٠٢٦): «لما
 * بتنقل لصفحة الجديد بتنوّر معاها صفحة التسجيل… هما ليه مرتبطين ببعض؟».
 * فالصفحة الفرعية لازم يبقى بعدها `/` مش أي حرف.
 */
export function isTabActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(href.replace(/\/+$/, "") + "/");
}

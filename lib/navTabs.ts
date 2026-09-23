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
}

export interface UserPerms {
  isSuper: boolean;
  isAdmin: boolean;
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

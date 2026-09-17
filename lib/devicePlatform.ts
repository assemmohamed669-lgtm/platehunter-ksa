/**
 * تحديد نظام جهاز المندوب (آيفون / أندرويد / ويب) عشان يظهر للأدمن.
 * التطبيق بيبعت القيمة دي مع نبضة `touch_last_seen` وتتخزّن في عمود
 * profiles.platform — بنفس أسلوب app_version بالظبط.
 */

/**
 * دالة نقية (للاختبار): بتحدّد النظام من منصّة Capacitor + الـuserAgent.
 * - التطبيق المثبَّت: `ios` / `android` (من Capacitor مباشرةً).
 * - المتصفح: `web-ios` / `web-android` / `web` (من الـuserAgent).
 */
export function resolvePlatform(
  capPlatform: string | null | undefined,
  ua: string
): string {
  if (capPlatform === "ios") return "ios";
  if (capPlatform === "android") return "android";
  const s = (ua || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "web-ios";
  if (/android/.test(s)) return "web-android";
  return "web";
}

/** بيقرا النظام من البيئة الحالية (متصفح/تطبيق). آمن لو اتنادى على السيرفر. */
export function getDevicePlatform(): string {
  if (typeof navigator === "undefined") return "web";
  let cap: string | null = null;
  try {
    const c = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
      .Capacitor;
    if (c?.getPlatform) cap = c.getPlatform();
  } catch {
    /* المكتبة مش موجودة (ويب) — نكمّل بالـuserAgent */
  }
  return resolvePlatform(cap, navigator.userAgent || "");
}

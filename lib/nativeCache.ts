/**
 * جسر لمسح **كاش تطبيق الأندرويد** من زر «تحديث البرنامج».
 *
 * ليه محتاجينه: الجافاسكريبت لوحده مايقدرش يمسح كاش المتصفح — دي حماية في كل
 * المتصفحات. فالمندوب كان لازم يدخل إعدادات التليفون ويمسح الكاش بإيده لما
 * تحصل مشكلة نسخة قديمة عالقة.
 *
 * لكن على الأندرويد القشرة بتاعتنا (Capacitor)، فبنعرّض دالة أصلية واحدة
 * (`MainActivity`) بتمسح كاش الويب-ڤيو **وتعيد التحميل** — الاتنين في الأصلي
 * عشان الترتيب يبقى مضمون (المسح بيتم على خيط الواجهة، ولو سبنا الجافاسكريبت
 * يعيد التحميل ممكن يسبق المسح).
 *
 * الجسر موجود على **الأندرويد بس**: الآيفون والمتصفح العادي مالهمش، فكل
 * الاستدعاءات فاشلة-بأمان وبترجّع false عشان المستدعي يكمّل بطريقته العادية.
 */
export interface NativeCacheBridge {
  /** يمسح كاش التطبيق ويعيد تحميل الرابط ده. */
  clearCacheAndReload(url: string): void;
}

/** اسم الكائن اللي `MainActivity` بيحقنه في الصفحة. */
export const NATIVE_BRIDGE_NAME = "PlateHunterNative";

/**
 * يحاول يمسح الكاش الأصلي. `true` = الأصلي استلم وهيعيد التحميل بنفسه
 * (فالمستدعي **مايعيدش** التحميل)، `false` = مافيش جسر ⇒ كمّل عادي.
 */
export function clearNativeCache(
  bridge: NativeCacheBridge | null | undefined,
  url: string,
): boolean {
  if (!bridge || typeof bridge.clearCacheAndReload !== "function") return false;
  try {
    bridge.clearCacheAndReload(url);
    return true;
  } catch {
    return false;   // نسخة APK قديمة أو الجسر وقع — الطريقة العادية تكفي
  }
}

/** الجسر من الصفحة (لو التطبيق شغّال على الأندرويد). */
export function getNativeCacheBridge(): NativeCacheBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as Record<string, NativeCacheBridge | undefined>)[NATIVE_BRIDGE_NAME];
}

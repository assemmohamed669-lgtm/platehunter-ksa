/**
 * 🔔 إشعار وصل والتطبيق **مفتوح** — المالك (١٣ أكتوبر ٢٠٢٦): «اتبعت على ١ جهاز» بس «مجانيش الاشعار». على أندرويد إشعار
 * FCM والتطبيق قدام المندوب مابيظهرش في شريط الإشعارات لوحده — بيتسلّم للتطبيق (`pushNotificationReceived`)، وماكانش فيه
 * حد بيستقبله. ⇒ شريط فوق الشاشة (`components/ForegroundPushBanner.tsx`) بنفس الكلام والدوسة.
 * «لقى سيارة مطلوبة» مش منها — ليها تنبيه جوّه التطبيق أصلاً (`GroupFindNotifier`)، فمايتكرّرش.
 */
export interface PushBanner { title: string; body: string; url: string }

/** حدث بيتبعت لما إشعار يستاهل شريط يوصل والتطبيق مفتوح. */
export const PUSH_BANNER_EVENT = "ph:push-banner";

export function foregroundBannerOf(n: { title?: string; body?: string; data?: unknown }): PushBanner | null {
  const d = (n?.data ?? {}) as Record<string, unknown>;
  if (!String(d.kind ?? "").startsWith("certs")) return null;
  const title = String(n?.title ?? "").trim();
  if (!title) return null;
  return { title, body: String(n?.body ?? ""), url: String(d.url ?? "/wanted") };
}

/**
 * 🔔 المالك (١٣ أكتوبر ٢٠٢٦): «عايز الأشعار يظهر للمندوب حتي لو فاتح البرنامج علشان ينتبه». من نسخة 1.6
 * (versionCode 7) بلجن الإشعارات متظبّط `presentationOptions: ["alert"]` (`capacitor.config.ts`) ⇒ أندرويد بيعرض
 * الإشعار الحقيقي في شريط الإشعارات والتطبيق مفتوح، فالشريط اللي جوّه التطبيق بيفضل للنسخ القديمة بس (مايتكرّرش).
 */
export const NATIVE_FOREGROUND_BUILD = 7;
/** 🍏 الآيفون: الإشعارات اتضافت في 1.3 (build 9) بنفس الإعداد ⇒ الآيفون بيعرضه فوق بنفسه والتطبيق مفتوح. */
export const NATIVE_FOREGROUND_BUILD_IOS = 9;

/**
 * `build` = رقم النسخة من `App.getInfo()` (versionCode على أندرويد · CFBundleVersion على الآيفون)، و`platform` من
 * `Capacitor.getPlatform()`. مش عارفينه ⇒ لأ (الشريط يفضل).
 */
export function nativeShowsForegroundPush(build: string | undefined, platform: string = "android"): boolean {
  const n = Number.parseInt(String(build ?? ""), 10);
  if (!Number.isFinite(n)) return false;
  if (platform === "ios") return n >= NATIVE_FOREGROUND_BUILD_IOS;
  if (platform === "android") return n >= NATIVE_FOREGROUND_BUILD;
  return false;
}

/**
 * مستمعين الإشعارات بيتسجّلوا **مرة واحدة** في عمر التطبيق — `PushRegistrar` بقى في صفحات التطبيق ولوحة الأدمن، والتنقّل
 * بينهم بيركّبه تاني؛ من غير ده كل دوسة/شريط كان هيتكرّر.
 */
let wired = false;
export function claimPushListeners(): boolean {
  if (wired) return false;
  wired = true;
  return true;
}

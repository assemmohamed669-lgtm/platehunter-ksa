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
 * مستمعين الإشعارات بيتسجّلوا **مرة واحدة** في عمر التطبيق — `PushRegistrar` بقى في صفحات التطبيق ولوحة الأدمن، والتنقّل
 * بينهم بيركّبه تاني؛ من غير ده كل دوسة/شريط كان هيتكرّر.
 */
let wired = false;
export function claimPushListeners(): boolean {
  if (wired) return false;
  wired = true;
  return true;
}

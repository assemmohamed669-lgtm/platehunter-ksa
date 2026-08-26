/**
 * ربط الحساب بجهاز — منطق مشترك بين راوت الأدمن وشاشات العرض.
 *
 * خلفية: الحساب بيترتبط بأول جهاز يدخل منه (device_fingerprint)، ومعاه توكن
 * جلسة واحد (session_token) عشان الحساب مايشتغلش على جهازين في نفس الوقت.
 */

export interface ResetDevicePatch {
  device_fingerprint: null;
  session_token: string;
}

/**
 * التعديل اللي بيتكتب على البروفايل وقت «إعادة ضبط الجهاز».
 *
 * بيفكّ الربط عشان المندوب يقدر يدخل من جهازه الجديد، **وبيدوّر توكن الجلسة**
 * عشان الجلسة المفتوحة على الجهاز القديم تتقفل.
 *
 * ⚠️ التوكن **لازم** يكون قيمة حقيقية مش NULL. SessionGuard بيتجاهل الـNULL
 * صراحةً (`profile.session_token && ...`) — فتصفيره كان بيسيب الجهاز القديم
 * شغّال، وده عكس الغرض من الزر. ولذلك الدالة دي بترمي لو التوكن فاضي.
 */
export function resetDevicePatch(newToken: string): ResetDevicePatch {
  if (!newToken || !newToken.trim()) {
    throw new Error("resetDevicePatch: لازم توكن جلسة جديد (NULL بيسيب الجهاز القديم شغّال)");
  }
  return { device_fingerprint: null, session_token: newToken };
}

/** حالة ربط الحساب بجهاز، للعرض في لوحة الأدمن. */
export type DeviceBindingState = "bound" | "reset" | "never";

/**
 * بيفرّق بين تلات حالات كانت الشاشة بتخلط بينهم:
 *  • `bound` — مرتبط بجهاز.
 *  • `reset` — مافيش ربط **لكنه ظهر قبل كده**، يعني اتعمله إعادة ضبط.
 *  • `never` — مافيش ربط ومافيش ظهور: حساب جديد لسه مادخلش.
 *
 * قبل كده الشاشة كانت بتقرا البصمة بس، فبتقول «لسه مادخلش» عن مندوب شغّال.
 */
export function deviceBindingState(
  fingerprint: string | null | undefined,
  lastSeen: string | null | undefined
): DeviceBindingState {
  if (fingerprint && fingerprint.trim()) return "bound";
  return lastSeen && String(lastSeen).trim() ? "reset" : "never";
}

/**
 * هل زر «إعادة ضبط الجهاز» ينفع يتضغط؟
 *
 * الزر بقى بيعمل حاجتين: يفكّ ربط الجهاز **ويقفل الجلسة الحالية** (بتوكن
 * جديد). فهو مفيد كمان للحساب اللي **مالوش ربط** لكن جلسته شغّالة — وده
 * بالظبط اللي كان الشرط القديم (`!device_fingerprint`) بيقفل الزر فيه، يعني
 * بيمنعه في الحالة اللي محتاجاه.
 *
 * الحالة الوحيدة اللي مافيش فيها حاجة تتعمل: حساب **مادخلش أبداً** — لا بصمة
 * ولا توكن ولا ظهور.
 */
export function canResetDevice(
  fingerprint: string | null | undefined,
  sessionToken: string | null | undefined,
  lastSeen: string | null | undefined
): boolean {
  const has = (v: string | null | undefined) => !!(v && String(v).trim());
  return has(fingerprint) || has(sessionToken) || has(lastSeen);
}

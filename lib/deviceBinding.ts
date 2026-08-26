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

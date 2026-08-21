/**
 * Device binding for PlateHunter KSA.
 *
 * Browsers do not expose a true hardware serial number, so the "device"
 * is identified by a UUID generated on first run and stored in
 * localStorage, combined with a coarse hash of stable device/browser
 * characteristics. Together these behave as a hardware lock in practice:
 *
 *  - The fingerprint survives page reloads and app restarts (PWA).
 *  - It changes if the agent installs the app on a different phone,
 *    or clears site data — both of which require an admin reset via
 *    `device_fingerprint = null` in Supabase (see supabase/schema.sql).
 */

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * توقيع مبني على مواصفات الجهاز/المتصفّح — **مش محفوظ في localStorage**، فبيتحسب
 * من جديد كل مرة وبيفضل ثابت حتى لو اتمسح التخزين (زي سفاري آيفون اللي بيمسح
 * localStorage كل خروج). ده اللي كان يخلّي الآيفون يطلب ربط جهاز كل تسجيل دخول.
 *
 * ملاحظة: نفس خوارزمية التوقيع القديمة بالظبط — عشان الحسابات المربوطة قبل كده
 * (بصمتها القديمة `uuid.<sig>`) تفضل تطابق عبر مقارنة جزء التوقيع في الدالة
 * `handle_device_login` (شوف docs/sql/device-signature-match.sql).
 */
function getCoarseDeviceSignature(): string {
  if (typeof window === "undefined") return "server";

  const nav = window.navigator;
  const parts = [
    nav.userAgent,
    nav.language,
    String(nav.hardwareConcurrency ?? ""),
    String(window.screen.width),
    String(window.screen.height),
    String(window.screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  ];
  return simpleHash(parts.join("|"));
}

/**
 * بصمة الجهاز اللي بتتبعت لـ `handle_device_login` وتتخزّن في
 * `profiles.device_fingerprint` أول دخول. بقت = توقيع الجهاز فقط (بدون UUID
 * محفوظ) عشان تفضل ثابتة على الآيفون بعد مسح التخزين — فمفيش «الحساب مرتبط
 * بجهاز» كل تسجيل دخول، ومع ذلك تفضل مختلفة بين جهاز وجهاز.
 */
export function getDeviceFingerprint(): string {
  return getCoarseDeviceSignature();
}

const SESSION_TOKEN_KEY = "pk_session_token";

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setStoredSessionToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearStoredSessionToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

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

const STORAGE_KEY = "pk_device_id";

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // force 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function getOrCreatePersistentId(): string {
  if (typeof window === "undefined") return "server";

  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

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
 * Returns a stable identifier for this device + browser install.
 * This value is sent to `handle_device_login` and stored in
 * `profiles.device_fingerprint` on first login.
 */
export function getDeviceFingerprint(): string {
  const persistentId = getOrCreatePersistentId();
  const signature = getCoarseDeviceSignature();
  return `${persistentId}.${signature}`;
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

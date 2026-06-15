import { supabase } from "./supabaseClient";
import {
  getDeviceFingerprint,
  setStoredSessionToken,
  clearStoredSessionToken,
} from "./device";

/**
 * Agents log in with a plain username (assigned by the admin), not an
 * email address. Supabase Auth requires an email for password sign-in,
 * so usernames are mapped to a synthetic email under a fixed domain.
 * This mapping is internal — agents never see or type an email.
 */
function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@platehunter.local`;
}

export type LoginErrorCode =
  | "INVALID_CREDENTIALS"
  | "DEVICE_MISMATCH"
  | "ACCOUNT_DISABLED"
  | "PROFILE_NOT_FOUND"
  | "UNKNOWN";

export interface LoginResult {
  ok: boolean;
  errorCode?: LoginErrorCode;
  errorMessage?: string;
}

const ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  INVALID_CREDENTIALS: "اسم المستخدم أو كلمة المرور غير صحيحة.",
  DEVICE_MISMATCH:
    "هذا الحساب مرتبط بجهاز آخر. تواصل مع الإدارة لإعادة ضبط الجهاز.",
  ACCOUNT_DISABLED: "تم تعطيل هذا الحساب. تواصل مع الإدارة.",
  PROFILE_NOT_FOUND: "لم يتم العثور على حساب لهذا المستخدم. تواصل مع الإدارة.",
  UNKNOWN: "حدث خطأ غير متوقع. حاول مرة أخرى.",
};

/**
 * Full login flow:
 *  1. Sign in with Supabase Auth (username -> synthetic email).
 *  2. Call handle_device_login(fingerprint) which binds the device on
 *     first use, rejects a mismatched device, and rotates the
 *     single-session token.
 *  3. Store the new session token locally for SessionGuard to compare
 *     against realtime updates.
 */
export async function loginAgent(
  username: string,
  password: string
): Promise<LoginResult> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (signInError) {
    return {
      ok: false,
      errorCode: "INVALID_CREDENTIALS",
      errorMessage: ERROR_MESSAGES.INVALID_CREDENTIALS,
    };
  }

  const fingerprint = getDeviceFingerprint();

  const { data, error: rpcError } = await supabase.rpc(
    "handle_device_login",
    { p_device_fingerprint: fingerprint }
  );

  if (rpcError) {
    // Any failure past this point must not leave an authenticated
    // session sitting on a device that isn't allowed to use it.
    await supabase.auth.signOut();
    clearStoredSessionToken();

    const code = (rpcError.message?.match(
      /DEVICE_MISMATCH|ACCOUNT_DISABLED|PROFILE_NOT_FOUND/
    )?.[0] ?? "UNKNOWN") as LoginErrorCode;

    return {
      ok: false,
      errorCode: code,
      errorMessage: ERROR_MESSAGES[code],
    };
  }

  if (data) {
    setStoredSessionToken(data as string);
  }

  return { ok: true };
}

export async function logoutAgent() {
  await supabase.auth.signOut();
  clearStoredSessionToken();
}

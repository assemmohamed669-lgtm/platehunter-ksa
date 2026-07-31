import { supabase } from "./supabaseClient";
import {
  getDeviceFingerprint,
  setStoredSessionToken,
  clearStoredSessionToken,
} from "./device";
import { isCutOff, GRACE_DAYS } from "./subscription";

/**
 * Agents log in with a plain username (assigned by the admin), not an
 * email address. Supabase Auth requires an email for password sign-in,
 * so usernames are mapped to a synthetic email under a fixed domain.
 * This mapping is internal — agents never see or type an email.
 */
function usernameToEmail(username: string): string {
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@platehunter.local`;
}

export type LoginErrorCode =
  | "INVALID_CREDENTIALS"
  | "DEVICE_MISMATCH"
  | "ACCOUNT_DISABLED"
  | "PROFILE_NOT_FOUND"
  | "SUBSCRIPTION_EXPIRED"
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
  SUBSCRIPTION_EXPIRED:
    "تم فصل الخدمة عن هذا الحساب لعدم دفع الاشتراك. لإعادة تشغيل الخدمة تواصل مع الإدارة لطلب التمديد.",
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

  // اشتراك مفصول → نمنع الدخول من هنا بدل ما يدخل ويتحجب جوه. بنسجّل خروج
  // فمايفضلش جلسة مفتوحة على الجهاز. متسامح عند الشك: لو تعذّرت قراءة البروفايل
  // (أوفلاين/خطأ) بنسيب الدخول يكمّل — عشان مانقفلش على حد بالغلط.
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, is_active, is_trial, subscription_end")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();
    const p = prof as {
      role?: string; is_active?: boolean; is_trial?: boolean; subscription_end?: string | null;
    } | null;
    if (p && p.role === "agent") {
      const grace = p.is_trial ? 0 : GRACE_DAYS;
      if (isCutOff(p.subscription_end, p.is_active !== false, grace)) {
        await supabase.auth.signOut();
        clearStoredSessionToken();
        return {
          ok: false,
          errorCode: "SUBSCRIPTION_EXPIRED",
          errorMessage: ERROR_MESSAGES.SUBSCRIPTION_EXPIRED,
        };
      }
    }
  } catch { /* مانمنعش الدخول بسبب فشل الفحص */ }

  if (data) {
    setStoredSessionToken(data as string);
  }

  return { ok: true };
}

export async function logoutAgent() {
  await supabase.auth.signOut();
  clearStoredSessionToken();
}

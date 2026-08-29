import { clearNoticeDismissals } from "./appNotice";
import { reportSecurityEvent } from "./reportSecurityEvent";
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
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@platehunter.local`;
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
  ACCOUNT_DISABLED: "اشتراكك خلص، برجاء التواصل مع الأدمن لتمديد الاشتراك.",
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
    const code = (rpcError.message?.match(
      /DEVICE_MISMATCH|ACCOUNT_DISABLED|PROFILE_NOT_FOUND/
    )?.[0] ?? "UNKNOWN") as LoginErrorCode;

    // نبلّغ **قبل** تسجيل الخروج — بعده مافيش توكن نبعت بيه. الجلسة صالحة
    // هنا (كلمة السر صحّت) بس الجهاز أو الحساب مرفوض، وده بالظبط اللي
    // السوبر أدمن عايز يعرفه.
    if (code === "DEVICE_MISMATCH") await reportSecurityEvent("login_device_mismatch");
    else if (code === "ACCOUNT_DISABLED") await reportSecurityEvent("login_account_disabled");

    // Any failure past this point must not leave an authenticated
    // session sitting on a device that isn't allowed to use it.
    await supabase.auth.signOut();
    clearStoredSessionToken();

    return {
      ok: false,
      errorCode: code,
      errorMessage: ERROR_MESSAGES[code],
    };
  }

  // حارس إضافي: لو الحساب متقفل (is_active=false) نمنع الدخول برسالة واضحة —
  // حتى لو الـRPC ماردّش ACCOUNT_DISABLED لأي سبب. مايتخزّنش توكن لحساب مقفول.
  try {
    const { data: udata } = await supabase.auth.getUser();
    if (udata?.user) {
      const { data: prof } = await supabase.from("profiles").select("is_active").eq("id", udata.user.id).single();
      if (prof && prof.is_active === false) {
        await reportSecurityEvent("login_account_disabled");
        await supabase.auth.signOut();
        clearStoredSessionToken();
        return { ok: false, errorCode: "ACCOUNT_DISABLED", errorMessage: ERROR_MESSAGES.ACCOUNT_DISABLED };
      }
    }
  } catch { /* لو تعذّر الفحص، نكمّل — الحارس داخل التطبيق (SessionGuard) بيمسك الباقي */ }

  if (data) {
    setStoredSessionToken(data as string);
  }

  // تسجيل دخول جديد → رسالة الأدمن السارية تظهر من جديد حتى لو المندوب قفلها
  // قبل كده (بطلب المندوب: تظهرله كل مرة يسجّل دخول طول مدة الرسالة).
  clearNoticeDismissals();

  return { ok: true };
}

export async function logoutAgent() {
  await supabase.auth.signOut();
  clearStoredSessionToken();
}

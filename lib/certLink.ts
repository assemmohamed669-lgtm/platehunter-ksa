/**
 * 🔗 لينك الشهادة اللي بيتبعت على واتساب — السيرفر بس (فيه مفتاح).
 *
 * المالك (٦ أكتوبر ٢٠٢٦): «ياخدها نسخ ويلصقهم في واتس اب مكتوبين ويبقي فيهم لينك الشهادة ع الواتس يتبعت
 * معاهم لما يدوس عليها يفتحها». الشهادة على درايف حساب الشهايد (مش متاحة لحد غيره)، فاللينك من البرنامج:
 * `/c/<الملف>.<الانتهاء>.<توقيع>` — أي حرف يتغيّر يبطل، وبينتهي بعد ٣٠ يوم. نفس اللي المندوب أصلاً بيعمله
 * لما يبعت ملف الشهادة نفسه على واتساب، بس رابط بدل ملف.
 * المفتاح: `CERT_LINK_SECRET` لو موجود، وإلا مشتق من مفتاح خدمة سوبابيز (موجود على السيرفر بس).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const CERT_LINK_DAYS = 30;

function secretOf(secret?: string): string {
  return secret ?? process.env.CERT_LINK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

function sigOf(payload: string, secret: string): Buffer {
  return createHmac("sha256", `cert-link-v1:${secret}`).update(payload).digest().subarray(0, 12);
}

/** توكن اللينك (من غير المفتاح ⇒ "" — مفيش لينك). */
export function signCertLink(fileId: string, nowMs: number, secret?: string, days = CERT_LINK_DAYS): string {
  const key = secretOf(secret);
  if (!key || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return "";
  const payload = `${fileId}.${Math.floor(nowMs / 1000 + days * 86_400).toString(36)}`;
  return `${payload}.${sigOf(payload, key).toString("base64url")}`;
}

/** الملف اللي التوكن بيشاور عليه — أو null لو مش صحيح أو انتهى. */
export function verifyCertLink(token: string, nowMs: number, secret?: string): string | null {
  const key = secretOf(secret);
  const m = /^([A-Za-z0-9_-]{10,})\.([0-9a-z]{1,10})\.([A-Za-z0-9_-]{16})$/.exec(String(token ?? ""));
  if (!key || !m) return null;
  const [, fileId, exp36, sig] = m;
  const want = sigOf(`${fileId}.${exp36}`, key);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  if (parseInt(exp36, 36) * 1000 < nowMs) return null;
  return fileId;
}

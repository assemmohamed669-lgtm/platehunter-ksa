/**
 * إرسال إشعارات الهاتف (Firebase Cloud Messaging v1) من السيرفر.
 *
 * الإعداد: متغيّر البيئة FCM_SERVICE_ACCOUNT = محتوى ملف الـservice account
 * JSON بتاع مشروع Firebase (كامل). من غيره `fcmConfigured()` بترجع false
 * والراوتات بترجع ok من غير ما تبعت — عشان الوظيفة الأصلية ماتفشلش.
 *
 * ملف سيرفر فقط (بيستخدم node:crypto) — ماينفعش يتستورد في مكوّن كلاينت.
 */
import { createSign } from "crypto";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** قناة الإشعار على أندرويد — نفس المعرّف اللي PushRegistrar بيعمله. */
export const PUSH_CHANNEL_ID = "wanted_finds";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

// توكن OAuth للسيرفر — صالح ساعة، بنكاشه عشان مانوقّعش JWT كل مرة.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claim = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(claim);
  const jwt = claim + "." + signer.sign(sa.private_key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  cachedToken = { value: j.access_token, expiresAt: now + (j.expires_in ?? 3600) };
  return j.access_token;
}

export interface PushPayload {
  title: string;
  body: string;
  /** بيانات إضافية بتوصل للتطبيق (قيم نصّية بس — ده شرط FCM). */
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  /** توكنات رفضها FCM (الجهاز شال التطبيق) — المفروض تتمسح من الجدول. */
  dead: string[];
  skipped?: "no-credentials" | "auth-failed";
}

/** بيبعت نفس الإشعار لكل التوكنات. FCM v1 بيبعت لتوكن واحد في الطلب. */
export async function sendPush(tokens: string[], p: PushPayload): Promise<PushResult> {
  if (tokens.length === 0) return { sent: 0, dead: [] };
  const sa = serviceAccount();
  if (!sa) return { sent: 0, dead: [], skipped: "no-credentials" };
  const token = await accessToken(sa);
  if (!token) return { sent: 0, dead: [], skipped: "auth-failed" };

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const results = await Promise.all(tokens.map(async (to) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: to,
            notification: { title: p.title, body: p.body },
            data: p.data ?? {},
            android: { priority: "HIGH", notification: { channel_id: PUSH_CHANNEL_ID, sound: "default" } },
            apns: { payload: { aps: { sound: "default" } } },
          },
        }),
      });
      return { to, ok: res.ok, status: res.status };
    } catch {
      // مشكلة شبكة — مش دليل إن التوكن ميّت، فمابنمسحوش.
      return { to, ok: false, status: 0 };
    }
  }));

  return {
    sent: results.filter((r) => r.ok).length,
    dead: results.filter((r) => r.status === 404 || r.status === 400).map((r) => r.to),
  };
}

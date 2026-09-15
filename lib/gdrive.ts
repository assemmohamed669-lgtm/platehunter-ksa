/**
 * Google Drive access للسيرفر — عبر refresh token مخزّن (السيرفر فقط).
 * بيجدّد access token تلقائياً ويتكاش في الذاكرة (~ساعة) عشان مانجدّدش كل نداء.
 *
 * **أكتر من حساب**: الشهادات ممكن تكون متفرّقة على درايفات حسابات مختلفة.
 * env: GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET + GDRIVE_REFRESH_TOKEN
 * (الحساب الأساسي) و GDRIVE_REFRESH_TOKEN_2 … _5 (حسابات إضافية، اختيارية).
 * أي واحد مش متظبّط بيتعدّى بهدوء — فالإضافة مابتكسرش اللي شغّال.
 */

/** أسماء متغيّرات الـrefresh token بالترتيب — الأساسي الأول. */
const REFRESH_ENV_KEYS = [
  "GDRIVE_REFRESH_TOKEN",
  "GDRIVE_REFRESH_TOKEN_2",
  "GDRIVE_REFRESH_TOKEN_3",
  "GDRIVE_REFRESH_TOKEN_4",
  "GDRIVE_REFRESH_TOKEN_5",
];

const cache = new Map<string, { token: string; exp: number }>();

async function tokenFor(refresh_token: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(refresh_token);
  if (hit && hit.exp > now + 60_000) return hit.token;

  const client_id = process.env.GDRIVE_CLIENT_ID;
  const client_secret = process.env.GDRIVE_CLIENT_SECRET;
  if (!client_id || !client_secret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  if (!d?.access_token) return null;
  cache.set(refresh_token, { token: d.access_token, exp: now + (Number(d.expires_in) || 3600) * 1000 });
  return d.access_token;
}

/** توكنات **كل** حسابات الدرايف المتظبّطة (الأساسي + الإضافية). */
export async function getDriveAccessTokens(): Promise<string[]> {
  const refresh = REFRESH_ENV_KEYS
    .map((k) => process.env[k])
    .filter((v): v is string => !!v && v.trim().length > 0);
  const tokens = await Promise.all(refresh.map((r) => tokenFor(r)));
  return tokens.filter((t): t is string => !!t);
}

/** الحساب الأساسي — متسابة للتوافق مع أي نداء قديم. */
export async function getDriveAccessToken(): Promise<string | null> {
  const [first] = await getDriveAccessTokens();
  return first ?? null;
}

export interface DriveFile { id: string; name: string; webViewLink?: string }

/** بحث في درايف (بيشمل الملفات المشاركة من الشركات). */
export async function driveSearch(q: string, token: string): Promise<DriveFile[]> {
  const url = "https://www.googleapis.com/drive/v3/files?" + new URLSearchParams({
    q, fields: "files(id,name,webViewLink)", pageSize: "200",
    includeItemsFromAllDrives: "true", supportsAllDrives: "true",
  });
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const d = await res.json();
  return Array.isArray(d?.files) ? d.files : [];
}

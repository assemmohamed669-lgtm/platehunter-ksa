/**
 * Google Drive access للسيرفر — عبر refresh token مخزّن (السيرفر فقط).
 * بيجدّد access token تلقائياً ويتكاش في الذاكرة (~ساعة) عشان مانجدّدش كل نداء.
 * القيم السرّية في env: GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET / GDRIVE_REFRESH_TOKEN.
 */

let cached: { token: string; exp: number } | null = null;

export async function getDriveAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cached && cached.exp > now + 60_000) return cached.token;

  const client_id = process.env.GDRIVE_CLIENT_ID;
  const client_secret = process.env.GDRIVE_CLIENT_SECRET;
  const refresh_token = process.env.GDRIVE_REFRESH_TOKEN;
  if (!client_id || !client_secret || !refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  if (!d?.access_token) return null;
  cached = { token: d.access_token, exp: now + (Number(d.expires_in) || 3600) * 1000 };
  return d.access_token;
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

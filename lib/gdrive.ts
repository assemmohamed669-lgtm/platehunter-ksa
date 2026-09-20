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

/**
 * أقصى عدد ملفات نلمّها في بحث واحد.
 *
 * كنا بناخد **أول صفحة بس** (٢٠٠ ملف) وبنتجاهل `nextPageToken`. للهيكل ورقم
 * الشهادة مالوش تأثير — النتيجة واحدة. لكن بحث **اللوحة** بيدوّر بـ٤ أرقام
 * جوّه اسم الملف، والأرقام دي بتيجي صدفة جوّه أرقام شهادات وتواريخ في أسماء
 * ملفات تانية؛ فلو طابقت أكتر من ٢٠٠، شهادة المندوب تبقى في الصفحة التانية
 * والبرنامج يقوله «مفيش شهادة» وهي موجودة.
 *
 * الحد موجود عشان أرشيف ضخم مايعلّقش الطلب — ٢٠٠٠ = ٢ نداء لدرايف بالكتير.
 */
export const DRIVE_MAX_FILES = 2000;

/** أقصى حجم صفحة بتقبله Drive v3. */
const DRIVE_PAGE_SIZE = 1000;

/** أعلى عدد نداءات في بحث واحد — حارس ضد سيرفر بيرجّع نفس التوكن. */
const MAX_PAGES = 50;

/**
 * بحث في درايف (بيشمل الملفات المشاركة من الشركات)، **بيكمّل على الصفحات**
 * لحد `maxFiles`. لو صفحة في النص فشلت بنرجّع اللي لمّيناه — أحسن من فاضي.
 */
export async function driveSearch(
  q: string,
  token: string,
  opts: { maxFiles?: number } = {},
): Promise<DriveFile[]> {
  const maxFiles = Math.max(1, opts.maxFiles ?? DRIVE_MAX_FILES);
  const out: DriveFile[] = [];
  let pageToken = "";

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      q, fields: "nextPageToken,files(id,name,webViewLink)",
      pageSize: String(Math.min(DRIVE_PAGE_SIZE, maxFiles - out.length)),
      includeItemsFromAllDrives: "true", supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch("https://www.googleapis.com/drive/v3/files?" + params,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return out;                       // أول صفحة → فاضي، وإلا اللي لمّيناه
    const d = await res.json();
    if (Array.isArray(d?.files)) out.push(...d.files);

    pageToken = typeof d?.nextPageToken === "string" ? d.nextPageToken : "";
    if (!pageToken || out.length >= maxFiles) break;
  }

  return out.length > maxFiles ? out.slice(0, maxFiles) : out;
}

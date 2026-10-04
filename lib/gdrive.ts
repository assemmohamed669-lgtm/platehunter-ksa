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

export interface DriveUser { displayName?: string; emailAddress?: string }

export interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  /** بيرجعوا بس لو اتطلبوا في `fields` (إحصائيات الشهايد: تاريخ الرفع واللي رفع). */
  createdTime?: string;
  owners?: DriveUser[];
  lastModifyingUser?: DriveUser;
}

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
  return (await driveSearchWithStatus(q, token, opts)).files;
}

/**
 * نفس `driveSearch` بالظبط — بس بيقول كمان **حصل إيه**، عشان شهايد عربيات الفرز
 * (`lib/certBatch.ts`) ماتقولش «مفيش شهادة» وهي في الحقيقة «درايف ماردّش»:
 *  · `ok`        — أول صفحة رجعت (لو false: درايف رفض/النت وقع ⇒ النتيجة مش معروفة).
 *  · `truncated` — وقفنا قبل الآخر (وصلنا `maxFiles` أو صفحة في النص فشلت) ⇒ ممكن ناقصة.
 */
export async function driveSearchWithStatus(
  q: string,
  token: string,
  opts: { maxFiles?: number } = {},
): Promise<{ files: DriveFile[]; ok: boolean; truncated: boolean }> {
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

    // رمية النت بتطلع زي الأول (البحث العادي بيقول السبب) — الدفعة بتمسكها لوحدها.
    const res = await fetch("https://www.googleapis.com/drive/v3/files?" + params,
      { headers: { Authorization: `Bearer ${token}` } });
    // أول صفحة → فاضي، وإلا اللي لمّيناه
    if (!res.ok) return { files: out, ok: page > 0, truncated: page > 0 };
    const d = await res.json();
    if (Array.isArray(d?.files)) out.push(...d.files);

    pageToken = typeof d?.nextPageToken === "string" ? d.nextPageToken : "";
    if (!pageToken) return { files: out.length > maxFiles ? out.slice(0, maxFiles) : out, ok: true, truncated: false };
    if (out.length >= maxFiles) break;
  }

  return { files: out.length > maxFiles ? out.slice(0, maxFiles) : out, ok: true, truncated: true };
}

/**
 * **صفحة واحدة** من درايف + علامة الصفحة الجاية — لإحصائيات الشهايد اللي الصفحة بتعدّها
 * فترات مع بعض (المالك ٤ أكتوبر: «مش عايز التأخير دة يحصل» — العدّ كان طلب واحد طويل).
 * `fields` لازم يبقى فيه `nextPageToken`؛ `orderBy` = ترتيب الصفحات. فشل ⇒ `ok=false`.
 */
export async function driveListPage(
  q: string,
  token: string,
  opts: { fields: string; pageToken?: string; pageSize?: number; orderBy?: string; timeoutMs?: number },
): Promise<{ ok: boolean; files: DriveFile[]; next: string | null }> {
  // سؤال معلّق مايوقفش دورة السيرفر كلها
  const ctrl = opts.timeoutMs ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  try {
    const params = new URLSearchParams({
      q, fields: opts.fields, pageSize: String(opts.pageSize ?? DRIVE_PAGE_SIZE),
      includeItemsFromAllDrives: "true", supportsAllDrives: "true",
    });
    if (opts.orderBy) params.set("orderBy", opts.orderBy);
    if (opts.pageToken) params.set("pageToken", opts.pageToken);
    const res = await fetch("https://www.googleapis.com/drive/v3/files?" + params,
      { headers: { Authorization: `Bearer ${token}` }, ...(ctrl ? { signal: ctrl.signal } : {}) });
    if (!res.ok) return { ok: false, files: [], next: null };
    const d = await res.json();
    return {
      ok: true,
      files: Array.isArray(d?.files) ? d.files : [],
      next: typeof d?.nextPageToken === "string" && d.nextPageToken ? d.nextPageToken : null,
    };
  } catch {
    return { ok: false, files: [], next: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * قراية ملف الإكسيل الجاي من واتساب/الملفات — **بايتات على طول**.
 *
 * المالك (٥ أكتوبر ٢٠٢٦): «لما برفع عن طريق الواتس اب … بيأخر وياخد وقت علي مايحمل الملف …
 * ممكن تخليه اسرع بس طبعا ميأثرش علي قرايه البيانات اللي في الملف».
 *
 * أندرويد بيكتب الملف في كاش التطبيق (MainActivity). كنا بنقراه بـ`Filesystem.readFile` =
 * الملف كله **كنص base64 في نداء واحد** عبر جسر Capacitor (ملف ٢٠ ميجا = ٢٧ ميجا نص) وبعدين
 * بنفكّه حرف حرف. دلوقتي: `convertFileSrc` بيدّي رابط للملف على نفس الدومين، والصفحة بتجيبه
 * بـ`fetch` — البايتات بتعدّي من غير نص ولا فكّ. لو الحجم مش مطابق أو أي حاجة فشلت ⇒ الطريقة
 * القديمة بالظبط، فالملف دايماً بيتقرا كامل.
 */

/** القراية السريعة (والداتا الأساسية على دفعات) — السوبر أدمن الأول لحد ما المالك يقول «انشر للكل». */
export const FAST_SHARE_FOR_ALL = false;

/** base64 ⇒ Blob: فكّ المتصفح نفسه (`fetch` لرابط data:)، ولو مش متاح ⇒ الفكّ اليدوي. */
export async function base64ToBlob(b64: string, type: string): Promise<Blob> {
  try {
    const res = await fetch(`data:${type};base64,${b64}`);
    if (res.ok) return await res.blob();
  } catch { /* الفكّ اليدوي تحت */ }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export interface CacheReadDeps {
  /** مسار الملف الكامل (file://…) في كاش التطبيق. */
  getUri(cacheFile: string): Promise<string>;
  /** حجم الملف على الجهاز (بايت). */
  stat(cacheFile: string): Promise<number>;
  convertFileSrc(uri: string): string;
  fetchBlob(url: string): Promise<Blob>;
  /** الطريقة القديمة: الملف كله base64. */
  readBase64(cacheFile: string): Promise<string>;
}

/** ملف الكاش ⇒ Blob — السريع الأول، ولو أي حاجة مش مظبوطة ⇒ القديم. */
export async function readCacheFileBlob(cacheFile: string, d: CacheReadDeps, type = "application/octet-stream"): Promise<Blob> {
  try {
    const uri = await d.getUri(cacheFile);
    const expected = await d.stat(cacheFile).catch(() => -1);
    const blob = await d.fetchBlob(d.convertFileSrc(uri));
    if (blob.size > 0 && (expected < 0 || blob.size === expected)) return blob;
  } catch { /* القديم تحت */ }
  return base64ToBlob(await d.readBase64(cacheFile), type);
}

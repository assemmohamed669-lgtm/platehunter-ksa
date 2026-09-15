/**
 * عميل خدمة شهادة السحب — بيبحث عبر السيرفر (اللي له أكسيز درايف) ويجيب الـPDF.
 * المندوب معندوش حساب جوجل؛ كله بيمر بالسيرفر.
 */
import { authHeader } from "./authHeader";

export interface CertResult { id: string; name: string; link: string | null }

export interface CertSearch {
  results: CertResult[];
  /** كام PDF رجع من درايف قبل الفلترة (تشخيص). */
  scanned: number;
  /** سبب الفشل لو فيه — مش «مفيش نتيجة». */
  error?: string;
}

/**
 * بحث عن شهادة برقم الهيكل أو اللوحة (أي شكل).
 *
 * ⚠️ قبل كده كانت بترجّع `[]` في **كل** حالات الفشل (درايف واقع، جلسة منتهية،
 * خطأ شبكة) — فالمندوب يشوف «مفيش شهادة» والمشكلة تفضل مخفية. دلوقتي بترجّع
 * السبب عشان الشاشة تقوله.
 */
export async function findCertificate(q: string): Promise<CertSearch> {
  const empty = (error?: string): CertSearch => ({ results: [], scanned: 0, error });
  try {
    const res = await fetch(`/api/certificate?q=${encodeURIComponent(q)}`, { headers: await authHeader() });
    if (res.status === 401) return empty("الجلسة انتهت — سجّل خروج ودخول تاني.");
    if (res.status === 429) return empty("بحث كتير في وقت قصير — استنى دقيقة.");
    if (!res.ok) return empty("تعذّر البحث (خطأ في السيرفر).");
    const d = await res.json();
    if (d?.error === "drive_unavailable") {
      return empty("الاتصال بجوجل درايف مش شغّال — الصلاحية محتاجة تجديد.");
    }
    return {
      results: Array.isArray(d?.results) ? d.results : [],
      scanned: Number(d?.scanned ?? 0),
    };
  } catch {
    return empty("مافيش اتصال بالإنترنت.");
  }
}

/** يجيب ملف الشهادة كـBlob (للفتح/المشاركة). */
export async function fetchCertBlob(id: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/certificate/download?fileId=${encodeURIComponent(id)}`, { headers: await authHeader() });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch { return null; }
}

/** يفتح الـPDF (موبايل: FileOpener، ويب: تبويب جديد). بدون معالجة إكسيل. */
export async function openCertBlob(blob: Blob, filename = "certificate.pdf"): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { FileOpener } = await import("@capacitor-community/file-opener");
    const { toSafeCacheFilename, contentTypeForFilename, blobToBase64 } = await import("./excel");
    const base64 = await blobToBase64(blob);
    const safe = toSafeCacheFilename(filename);
    const { uri } = await Filesystem.writeFile({ path: safe, data: base64, directory: Directory.Cache });
    await FileOpener.open({ filePath: uri, contentType: contentTypeForFilename(safe) });
  } else {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** يشارك الـPDF (موبايل: Share sheet → واتساب، ويب: تنزيل). */
export async function shareCertBlob(blob: Blob, filename = "certificate.pdf", title = "شهادة السحب"): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const { toSafeCacheFilename, blobToBase64 } = await import("./excel");
    const base64 = await blobToBase64(blob);
    const safe = toSafeCacheFilename(filename);
    const { uri } = await Filesystem.writeFile({ path: safe, data: base64, directory: Directory.Cache });
    await Share.share({ title, url: uri });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

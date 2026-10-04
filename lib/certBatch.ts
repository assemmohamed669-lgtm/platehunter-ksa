/**
 * 📄 **شهايد عربيات الفرز — دفعة واحدة** (السيرفر).
 *
 * المالك (٤ أكتوبر ٢٠٢٦): «قدام كل السيارات المطلوبه لو السيارة ليها شهاده… يظهر
 * قدامها كلمه شهاده بالازرق ولما المندوب يدوس عليها تفتحلو الشهادة». وسأل عن ٦٠ مندوب
 * بيفرزوا مع بعض وكل واحد ٥٠ لوحة.
 *
 * البحث العادي (`app/api/certificate`) سؤال لدرايف لكل عربية، وعليه حد ٦٠/دقيقة
 * للمندوب ⇒ ٦٠ × ٥٠ = ٣٠٠٠ سؤال، ومندوب عنده ٨٨ عربية مايكمّلش. هنا:
 *  · كل `CERT_DIGITS_PER_QUERY` (٢٥) مجموعة أرقام في سؤال واحد (`or`) ⇒ ٥٠ لوحة = سؤالين.
 *  · نفس قاعدة البحث العادي بالحرف: درايف بالأرقام، وبعدين `matchCertFiles` بالحروف
 *    (عربي/إنجليزي/مسافات) — الشهادة بتطلع للعربية بتاعتها بس.
 *  · النتيجة بتتفتكر على السيرفر `CERT_CACHE_TTL_MS` — المناديب غالباً بيفرزوا نفس
 *    المحفظة، فالمندوب التاني بياخدها من غير درايف. الفشل **مابيتفتكرش**.
 *  · درايف ماردّش ⇒ اللوحات في `failed` (الشاشة بتقول «تعذّر — دوس تاني») — مش
 *    «مفيش شهادة».
 *  · درايف رجّع أقصى عدد (ممكن ناقصة) ⇒ السؤال بيتقسم نصين لحد ما يكمل.
 */
import { plateDigits, matchCertFiles, toLatinDigits } from "./certificateMatch";
import type { DriveFile } from "./gdrive";

/** أقصى عدد لوحات في الطلب الواحد (العميل بيقسّم أكتر من كده). */
export const CERT_BATCH_MAX_PLATES = 300;
/** كام مجموعة أرقام في سؤال درايف الواحد. */
export const CERT_DIGITS_PER_QUERY = 25;
/** مدة ما السيرفر يفتكر نتيجة مجموعة أرقام. */
export const CERT_CACHE_TTL_MS = 10 * 60_000;
/**
 * كام سؤال لدرايف شغّالين **في نفس الوقت** للطلب الواحد. المالك (٤ أكتوبر): «ليه بيأخر
 * كتير؟» — كانوا ورا بعض (كل سؤال ثانية لتلاتة) ⇒ ٨٨ عربية = ٤ أسئلة متتالية. دلوقتي
 * الوقت = أبطأ سؤال. الحد عشان مانضربش درايف بعشرات الأسئلة في لحظة واحدة.
 */
export const CERT_PARALLEL_QUERIES = 6;
/** أقصى عدد مجموعات أرقام في الذاكرة (الأقدم بيتشال). */
const CACHE_MAX = 5000;

export interface CertHit { id: string; name: string }
export interface CertBatchResult {
  /** اللوحة (زي ما اتبعتت) ← شهاداتها (فاضية = مالهاش). */
  results: Record<string, CertHit[]>;
  /** لوحات درايف ماعرفش يرد عليها — مش معروف ليها شهادة ولا لأ. */
  failed: string[];
}
export type DriveSearchFn = (q: string) => Promise<{ files: DriveFile[]; ok: boolean; truncated: boolean }>;

const cache = new Map<string, { files: DriveFile[]; at: number }>();

export function clearCertBatchCache(): void {
  cache.clear();
}

/** سؤال درايف لمجموعة أرقام — `or` بينهم + PDF بس (زي البحث العادي). */
export function digitsQuery(digits: readonly string[]): string {
  return "(" + digits.map((d) => `name contains '${d}'`).join(" or ") + ") and mimeType='application/pdf'";
}

/** يسأل درايف عن مجموعة أرقام ويحفظ كل مجموعة في الذاكرة. بيرجّع المجموعات اللي فشلت. */
async function fetchDigits(digits: string[], search: DriveSearchFn, now: number): Promise<string[]> {
  let r: Awaited<ReturnType<DriveSearchFn>>;
  try {
    r = await search(digitsQuery(digits));
  } catch {
    return digits;
  }
  if (!r.ok) return digits;
  if (r.truncated && digits.length > 1) {
    // ممكن ناقصة — نقسم نصين (كل نص أقل ملفات) لحد ما تكمل
    const mid = Math.ceil(digits.length / 2);
    return [
      ...(await fetchDigits(digits.slice(0, mid), search, now)),
      ...(await fetchDigits(digits.slice(mid), search, now)),
    ];
  }
  for (const d of digits) {
    cache.set(d, { files: r.files.filter((f) => toLatinDigits(f.name).includes(d)), at: now });
  }
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return [];
}

export async function batchFindCertificates(
  plates: readonly string[],
  search: DriveSearchFn,
  now: number = Date.now(),
): Promise<CertBatchResult> {
  const uniq = [...new Set(plates.map((p) => String(p ?? "").trim()).filter(Boolean))].slice(0, CERT_BATCH_MAX_PLATES);
  const byDigits = new Map<string, string[]>();
  const results: Record<string, CertHit[]> = {};
  for (const p of uniq) {
    const d = plateDigits(p);
    if (!d) { results[p] = []; continue; }        // من غير أرقام ⇒ مفيش بحث (زي العادي)
    const list = byDigits.get(d);
    if (list) list.push(p); else byDigits.set(d, [p]);
  }

  const fresh = (d: string) => {
    const c = cache.get(d);
    return !!c && now - c.at >= 0 && now - c.at < CERT_CACHE_TTL_MS;
  };
  const need = [...byDigits.keys()].filter((d) => !fresh(d));
  const chunks: string[][] = [];
  for (let i = 0; i < need.length; i += CERT_DIGITS_PER_QUERY) chunks.push(need.slice(i, i + CERT_DIGITS_PER_QUERY));
  const failedDigits = new Set<string>();
  // ⚡ مع بعض (بحد `CERT_PARALLEL_QUERIES`) — مش واحد ورا التاني
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      for (const d of await fetchDigits(chunk, search, now)) failedDigits.add(d);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CERT_PARALLEL_QUERIES, chunks.length) }, worker));

  const failed: string[] = [];
  for (const [d, list] of byDigits) {
    if (failedDigits.has(d)) { failed.push(...list); continue; }
    const files = cache.get(d)?.files ?? [];
    for (const p of list) results[p] = matchCertFiles(p, files).map((f) => ({ id: f.id, name: f.name }));
  }
  return { results, failed };
}

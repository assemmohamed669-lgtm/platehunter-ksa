/**
 * 📄 «شهايد النهارده» — الجزء المشترك (السيرفر والموبايل).
 *
 * المالك (٥ أكتوبر ٢٠٢٦): «احنا هنخلي الفرز علي الشهايد اللي بتنزل يومي … انهردة يفرز علي ال 690
 * شهادة دول بس ويتحط جمله باللون الاخضر تتغير يوميا». السيرفر بيلقط كل شهادة بتترفع النهارده
 * (بتوقيت السعودية) ويقرا بياناتها مرة واحدة (`lib/certDailyJob.ts`)، والمطلوب بيفرز عليها.
 */
import type { CertFields } from "./certParse";

/** فرز «شهايد النهارده» في صفحة المطلوب — السوبر أدمن الأول لحد ما المالك يقول «انشر للكل». */
export const DAILY_CERTS_FOR_ALL = false;

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** النهارده بتوقيت السعودية + أول لحظة فيه (بالـUTC، بالثانية الكاملة) — اليوم بيبدأ ١٢ بالليل. */
export function riyadhDayStart(now: Date): { day: string; startIso: string } {
  const day = new Date(now.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
  const startIso = new Date(Date.parse(day + "T00:00:00Z") - RIYADH_OFFSET_MS).toISOString();
  return { day, startIso };
}

/** قبل اليوم ده بـ`n` يوم («YYYY-MM-DD»). */
export function dayMinus(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);
}

/** شهادة من شهايد النهارده (اللي الموبايل بياخدها). */
export interface DailyCertEntry extends Omit<CertFields, "issuer"> {
  fileId: string;
  name: string;
  createdAt: string;
}

/** عدد الخانات المليانة — الشهادة الأغنى بتكسب لو نفس اللوحة اترفعت من كذا حساب. */
function richness(e: DailyCertEntry): number {
  return [e.vin, e.bank, e.make, e.model, e.year, e.color, e.status, e.certDate].filter(Boolean).length;
}

/**
 * نفس الشهادة بتترفع من كذا شركة ⇒ لوحة واحدة = شهادة واحدة (الأغنى، ولو زي بعض الأحدث).
 * من غير لوحة ⇒ بالشاص لو موجود.
 */
export function dedupeDailyCerts(entries: readonly DailyCertEntry[]): DailyCertEntry[] {
  const best = new Map<string, DailyCertEntry>();
  for (const e of entries) {
    const key = e.plate ? `p:${e.plate}` : e.vin ? `v:${e.vin}` : "";
    if (!key) continue;
    const cur = best.get(key);
    if (!cur || richness(e) > richness(cur) || (richness(e) === richness(cur) && e.createdAt > cur.createdAt)) best.set(key, e);
  }
  return [...best.values()];
}

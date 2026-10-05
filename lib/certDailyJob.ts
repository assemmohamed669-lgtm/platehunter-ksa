/**
 * 📄 «شهايد النهارده» — دورة السيرفر (كل دقيقة من `/api/cron/cert-daily`).
 *
 *  ١) قايمة شهايد النهارده من درايف (من ١٢ بالليل بتوقيت السعودية) ⇒ اللي جديد بيتضاف للجدول.
 *  ٢) الشهايد اللي لسه ماتقرتش: بنجيب الملف ونقرا الكلام اللي جوّاه (`lib/pdfText.ts`) ونطلّع
 *     بياناته (`lib/certParse.ts`) — مرة واحدة لكل شهادة. فشل ⇒ بيتعاد لحد ٣ مرات، وبعدها
 *     بنكتفي باللي في اسم الملف.
 *  ٣) اللي أقدم من أسبوع بيتمسح (الفرز على النهارده بس).
 * الدورة مابتمسحش ولا بتعدّل أي حاجة على درايف — قراية بس.
 */
import { parseCertText, type CertFields } from "./certParse";
import { riyadhDayStart, dayMinus } from "./certDaily";
import { uploaderOf, type StatFile } from "./certStats";

export interface CertDailyRow {
  file_id: string;
  day: string;
  created_at: string;
  name: string;
  uploader: string;
}

export interface PendingCert { file_id: string; name: string; tries: number }

export interface CertDailyDeps {
  now(): Date;
  /** صفحة من شهايد النهارده (بي دي إف، من غير المحذوف، من `sinceIso`). */
  listSince(sinceIso: string, pageToken?: string): Promise<{ files: StatFile[]; next: string | null }>;
  /** بيضيف الجديد بس (الموجود مابيتلمسش). */
  insertNew(rows: CertDailyRow[]): Promise<void>;
  pending(day: string, limit: number): Promise<PendingCert[]>;
  download(fileId: string): Promise<Uint8Array | null>;
  extractText(bytes: Uint8Array): Promise<string>;
  /** `fields` = null ⇒ فشل (tries بيزيد ومش متقري لسه). */
  saveParsed(fileId: string, fields: CertFields | null, tries: number, done: boolean): Promise<void>;
  cleanup(beforeDay: string): Promise<void>;
  budgetMs: number;
  concurrency: number;
}

/** بعد كده بنكتفي باللي في اسم الملف. */
export const MAX_TRIES = 3;
/** بنحتفظ بأسبوع (عشان لو حاجة حصلت نعرف). */
export const KEEP_DAYS = 7;

export async function certDailyTick(d: CertDailyDeps): Promise<{ day: string; listed: number; parsed: number; failed: number }> {
  const t0 = Date.now();
  const timeLeft = () => d.budgetMs - (Date.now() - t0);
  const { day, startIso } = riyadhDayStart(d.now());

  // ١) قايمة النهارده
  let listed = 0;
  let token: string | undefined;
  do {
    const page = await d.listSince(startIso, token);
    const rows: CertDailyRow[] = [];
    for (const f of page.files) {
      if (!f.id || !f.createdTime) continue;
      rows.push({ file_id: f.id, day, created_at: f.createdTime, name: f.name ?? "", uploader: uploaderOf(f).key });
    }
    if (rows.length) await d.insertNew(rows);
    listed += rows.length;
    token = page.next ?? undefined;
  } while (token && timeLeft() > 5_000);

  // ٢) قراية اللي لسه ماتقراش
  let parsed = 0, failed = 0;
  const queue = timeLeft() > 5_000 ? await d.pending(day, 60) : [];
  const worker = async () => {
    while (queue.length && timeLeft() > 3_000) {
      const p = queue.shift()!;
      const tries = p.tries + 1;
      try {
        const bytes = await d.download(p.file_id);
        if (!bytes) throw new Error("download_failed");
        const text = await d.extractText(bytes);
        const fields = parseCertText(text, p.name);
        if (!fields.plate && !fields.vin && tries < MAX_TRIES) throw new Error("no_plate");
        await d.saveParsed(p.file_id, fields, tries, true);
        parsed++;
      } catch {
        failed++;
        // آخر محاولة ⇒ اللي في اسم الملف (لو اسمه لوحة) أحسن من مفيش
        if (tries >= MAX_TRIES) await d.saveParsed(p.file_id, parseCertText("", p.name), tries, true).catch(() => {});
        else await d.saveParsed(p.file_id, null, tries, false).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, d.concurrency) }, worker));

  // ٣) القديم
  await d.cleanup(dayMinus(day, KEEP_DAYS)).catch(() => {});
  return { day, listed, parsed, failed };
}

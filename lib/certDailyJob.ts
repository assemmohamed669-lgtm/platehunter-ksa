/**
 * 📄 «شهايد النهارده» — دورة السيرفر (كل دقيقة من `/api/cron/cert-daily`).
 *
 *  ١) قايمة شهايد النهارده من درايف (من ١٢ بالليل بتوقيت السعودية) ⇒ اللي جديد بيتضاف للجدول.
 *  ٢) الشهايد اللي لسه ماتقرتش: بنجيب الملف ونقرا الكلام اللي جوّاه (`lib/pdfText.ts`) ونطلّع
 *     بياناته (`lib/certParse.ts`) — مرة واحدة لكل شهادة. فشل ⇒ بيتعاد لحد ٣ مرات، وبعدها
 *     بنكتفي باللي في اسم الملف.
 *  ٣) كل دقيقة بيلمّ كمان يوم من الأسبوع اللي فات بالدور (المندوب بيقدر يفرز على أي يوم فيه —
 *     المالك ٦ أكتوبر ٢٠٢٦)، والقراية بتبدأ بالنهارده دايماً وبعدين الأحدث فالأقدم.
 *  ٤) اللي أقدم من أسبوع بيتمسح.
 * الدورة مابتمسحش ولا بتعدّل أي حاجة على درايف — قراية بس.
 */
import { parseCertText, type CertFields } from "./certParse";
import { riyadhDayStart, riyadhDayStartIso, dayMinus, CERT_DAYS_BACK } from "./certDaily";
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
  /** صفحة من الشهايد (بي دي إف، من غير المحذوف) اللي اترفعت من `fromIso` لحد `toIso` (null = لحد دلوقتي). */
  listRange(fromIso: string, toIso: string | null, pageToken?: string): Promise<{ files: StatFile[]; next: string | null }>;
  /** بيضيف الجديد بس (الموجود مابيتلمسش). */
  insertNew(rows: CertDailyRow[]): Promise<void>;
  /** اللي لسه ماتقراش من `fromDay` لحد النهارده — الأحدث يوم الأول (النهارده قبل أي حاجة). */
  pending(fromDay: string, limit: number): Promise<PendingCert[]>;
  /** اللي اتقرت قبل `beforeIso` ومالقيناش فيها لوحة ⇒ ترجع تتقري (القارئ اتحسّن). */
  requeueNoPlate?(fromDay: string, beforeIso: string): Promise<void>;
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
/** بنحتفظ بالنهارده + أسبوع قبله — اللي المندوب يقدر يفرز عليه. */
export const KEEP_DAYS = CERT_DAYS_BACK;
/** أقصى شهايد بتتقري في الدورة الواحدة (الباقي الدورة الجاية). */
export const PENDING_PER_TICK = 100;
/**
 * آخر مرة القارئ اتحسّن (`lib/certParse.ts`) — اللي اتقرت قبلها ومالقيناش فيها لوحة بتتقري تاني
 * **مرة واحدة** (بعد ما تتقري تاريخها بيبقى بعد كده فمابتتعادش). ٦ أكتوبر ٢٠٢٦: حروف «السجل»
 * الإنجليزي بمسافات. لو القارئ اتحسّن تاني ⇒ حرّك التاريخ ده لوقت النشر.
 */
export const CERT_PARSER_AT = "2026-10-06T11:00:00Z";   // + «8377-JGR» بشَرطة

export async function certDailyTick(d: CertDailyDeps): Promise<{
  day: string; listed: number; older: { day: string; listed: number }; parsed: number; failed: number;
}> {
  const t0 = Date.now();
  const timeLeft = () => d.budgetMs - (Date.now() - t0);
  const now = d.now();
  const { day, startIso } = riyadhDayStart(now);

  /** شهايد يوم كامل (كل الصفحات) ⇒ الجديد بيتضاف بتاريخ اليوم ده. */
  const listDay = async (forDay: string, fromIso: string, toIso: string | null): Promise<number> => {
    let n = 0;
    let token: string | undefined;
    do {
      const page = await d.listRange(fromIso, toIso, token);
      const rows: CertDailyRow[] = [];
      for (const f of page.files) {
        if (!f.id || !f.createdTime) continue;
        rows.push({ file_id: f.id, day: forDay, created_at: f.createdTime, name: f.name ?? "", uploader: uploaderOf(f).key });
      }
      if (rows.length) await d.insertNew(rows);
      n += rows.length;
      token = page.next ?? undefined;
    } while (token && timeLeft() > 5_000);
    return n;
  };

  // ١) النهارده
  const listed = await listDay(day, startIso, null);

  // ٢) يوم من الأسبوع اللي فات بالدور (كل ٧ دقايق الأسبوع كله بيتراجع)
  const back = (Math.floor(now.getTime() / 60_000) % CERT_DAYS_BACK) + 1;
  const olderDay = dayMinus(day, back);
  const older = {
    day: olderDay,
    listed: timeLeft() > 15_000 ? await listDay(olderDay, riyadhDayStartIso(olderDay), riyadhDayStartIso(dayMinus(olderDay, -1))) : 0,
  };

  // ٣) قراية اللي لسه ماتقراش — النهارده الأول (واللي القارئ القديم مالقاش فيها لوحة بترجع تتقري)
  if (d.requeueNoPlate && timeLeft() > 10_000) await d.requeueNoPlate(dayMinus(day, KEEP_DAYS), CERT_PARSER_AT).catch(() => {});
  let parsed = 0, failed = 0;
  const queue = timeLeft() > 5_000 ? await d.pending(dayMinus(day, KEEP_DAYS), PENDING_PER_TICK) : [];
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

  // ٤) القديم
  await d.cleanup(dayMinus(day, KEEP_DAYS)).catch(() => {});
  return { day, listed, older, parsed, failed };
}

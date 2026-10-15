/**
 * 📥 ملف داتا جاي من السيرفر (داتا مخصوصة للعضو من المسئول — `lib/memberData.ts`) ⇒ سلوت على الموبايل.
 *
 * نفس طريقة «داتا المجموعة» في صفحة الفرز بالظبط: الصغير بيتفتح عادي ويتحفظ صفوفه، والكبير (أكبر من عتبة الداتا
 * الكبيرة) بيتقري **دفعات** في قاعدة الداتا الكبيرة (ورقة واحدة أو متعدد الورقات) عشان مايقعش الآيفون. وبيتحفظ تاريخ
 * **النسخة** (مش وقت التنزيل) عشان مانزّلش الملف تاني لو ماتغيّرش.
 */
import type { ExcelTable } from "./excel";
import type { DataMeta } from "./dataStore";

export interface RemoteDataState {
  table: ExcelTable;
  streamed: boolean;
  streamMeta: DataMeta | null;
  fileName: string;
  uploadedAt: string;
}

/** النسخة اللي على الموبايل (لو موجودة). */
export async function loadLocalRemoteData(slot: string): Promise<RemoteDataState | null> {
  const { getUploadedFile } = await import("./idb");
  const { getDataMeta, getSampleRows } = await import("./dataStore");
  const local = await getUploadedFile("local", slot as never).catch(() => null);
  if (!local) return null;
  const bigMeta = await getDataMeta(slot).catch(() => null);
  if (bigMeta) {
    const sample = await getSampleRows(50, slot).catch(() => []);
    return { table: { headers: bigMeta.headers, rows: sample, sheetName: bigMeta.sheetName }, streamed: true, streamMeta: bigMeta, fileName: local.fileName, uploadedAt: local.uploadedAt };
  }
  return { table: { headers: local.headers, rows: local.rows }, streamed: false, streamMeta: null, fileName: local.fileName, uploadedAt: local.uploadedAt };
}

/** يقرا الملف المتنزّل ويحطه في السلوت (بيمسح القديم). `thresholdBytes` = عتبة الداتا الكبيرة. */
export async function ingestRemoteData(slot: string, file: File, uploadedAt: string, thresholdBytes: number): Promise<RemoteDataState> {
  const { saveUploadedFile } = await import("./idb");
  const ds = await import("./dataStore");
  const { parseExcelFile, readSheetNames } = await import("./excel");
  if (file.size > thresholdBytes) {
    const names = await readSheetNames(file).catch(() => [] as string[]);
    const meta = names.length > 1
      ? await ds.importMultiSheetData(file, { slot })
      : await ds.importLargeDataFile(file, { slot });
    const sample = await ds.getSampleRows(50, slot).catch(() => []);
    await saveUploadedFile({ key: `local:${slot}`, agentId: "local", slot: slot as never, fileName: file.name, headers: meta.headers, rows: [], uploadedAt });
    return { table: { headers: meta.headers, rows: sample, sheetName: meta.sheetName }, streamed: true, streamMeta: meta, fileName: file.name, uploadedAt };
  }
  await ds.clearData(slot).catch(() => {});
  const table = await parseExcelFile(file);
  await saveUploadedFile({ key: `local:${slot}`, agentId: "local", slot: slot as never, fileName: file.name, headers: table.headers, rows: table.rows, uploadedAt });
  return { table: { headers: table.headers, rows: table.rows }, streamed: false, streamMeta: null, fileName: file.name, uploadedAt };
}

/** يشيل السلوت من الموبايل (المسئول شال الملف / العضو اتنقل مجموعة). */
export async function clearRemoteData(slot: string): Promise<void> {
  const { deleteUploadedFile } = await import("./idb");
  const { clearData } = await import("./dataStore");
  await deleteUploadedFile("local", slot as never).catch(() => {});
  await clearData(slot).catch(() => {});
}

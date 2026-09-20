/**
 * nativeFile — كتابة ملف كبير على الجهاز **على دفعات**.
 *
 * ليه موجود: `Filesystem.writeFile` بياخد الملف كله كنص base64 في نداء واحد.
 * ملف الداتا بعد الدمج (٤٨١ ألف صف) بيطلع ~٦٠ ميجا، والـbase64 بتاعه ~٨٠ ميجا،
 * فالجافا بترمي:
 *
 *   'writeFile' failed with: Failed to allocate a 82698200 byte allocation
 *   with 43753600 free bytes and 41MB until OOM
 *
 * يعني المشاركة والفتح كانوا بيفشلوا خالص بعد ما المندوب يخلّص شغله. الحل إننا
 * نقص الـBlob نفسه ونكتب كل قطعة بـappendFile — أكبر تخصيص في أي لحظة بقى
 * ٤ ميجا بدل ٨٠، فالملف بينزل مهما كبر.
 *
 * **حجم القطعة لازم يكون مضاعف لـ٣**: كل ٣ بايت بتبقى ٤ حروف base64 بالظبط،
 * فمافيش حشو «=» في نص الملف. لو القطعة مش مضاعف ٣ هيتحط حشو في النص والملف
 * الناتج يطلع بايظ.
 */

/** ٣ ميجا — مضاعف لـ٣، والـbase64 بتاعها ٤ ميجا. */
export const NATIVE_CHUNK_BYTES = 3 * 1024 * 1024;

/** حدود القطع [من، لـ) اللي بتغطي الملف كله بلا فجوة ولا تداخل. */
export function chunkRanges(size: number, chunk: number = NATIVE_CHUNK_BYTES): [number, number][] {
  const out: [number, number][] = [];
  const step = Math.max(3, Math.floor(chunk / 3) * 3);
  for (let start = 0; start < size; start += step) {
    out.push([start, Math.min(start + step, size)]);
  }
  return out;
}

/** الجزء اللي بنحتاجه من @capacitor/filesystem — معرّف هنا عشان يتاخد مزيّف في الاختبار. */
export interface CacheFs {
  writeFile(o: { path: string; data: string; directory: any }): Promise<{ uri: string }>;
  appendFile(o: { path: string; data: string; directory: any }): Promise<void>;
  deleteFile(o: { path: string; directory: any }): Promise<void>;
  getUri(o: { path: string; directory: any }): Promise<{ uri: string }>;
}

/**
 * بيكتب الـBlob في ملف ويرجّع الـuri بتاعه.
 * الملف الصغير بنداء واحد زي الأول بالظبط؛ الكبير على دفعات.
 */
export async function writeBlobInChunks(
  fs: CacheFs,
  directory: any,
  path: string,
  blob: Blob,
  toBase64: (b: Blob) => Promise<string>,
  chunk: number = NATIVE_CHUNK_BYTES,
): Promise<string> {
  const ranges = chunkRanges(blob.size, chunk);

  if (ranges.length <= 1) {
    const { uri } = await fs.writeFile({ path, data: await toBase64(blob), directory });
    return uri || (await fs.getUri({ path, directory })).uri;
  }

  // appendFile بيزوّد على الموجود — لازم نبدأ من ملف نضيف، وإلا بقايا رفعة
  // قديمة بنفس الاسم تفضل في أوله. (الملف مش موجود؟ مايهمش.)
  try { await fs.deleteFile({ path, directory }); } catch { /* مش موجود أصلاً */ }

  let uri = "";
  for (let i = 0; i < ranges.length; i++) {
    const [a, b] = ranges[i];
    const data = await toBase64(blob.slice(a, b));
    if (i === 0) uri = (await fs.writeFile({ path, data, directory })).uri || "";
    else await fs.appendFile({ path, data, directory });
  }
  return uri || (await fs.getUri({ path, directory })).uri;
}

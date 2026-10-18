/**
 * 📗 ملف xlsx «حتة حتة» — المالك (١٨ أكتوبر ٢٠٢٦): «خليها يبقي فيها الاخيارين انه يختار يصدر الملف باي صيغه» + «لو تقدر
 * تخليه يبقي اسرع».
 *
 * الإكسيل العادي (`buildBigExcelBlob`) بيتبني **كله في الذاكرة** — ملف ٤٨٠ ألف صف بيقفل الموبايل، فكان بيطلع CSV بس.
 * هنا الصفوف بتتكتب وتتضغط **دفعة دفعة** (الموبايل عمره ما بيشيل أكتر من دفعة)، والدفعة الجاية بتتقري وإحنا بنضغط اللي
 * قبلها. الضغط بأداة الموبايل نفسه (`CompressionStream`) — لو مش موجودة (موبايل قديم جداً) `xlsxStreamSupported` = false.
 *
 * · كل الخانات **نص** (`inlineStr`) ⇒ «0055» والأرقام الطويلة ماتتلخبطش (عكس الـCSV في الإكسيل).
 * · كل خانة ليها عنوانها (`A1`) — قارئ البرنامج (`streamXlsxToBatches`) بيتجاهل الخانة من غيره.
 * · من اليمين + محاذاة يمين **جوّه الملف** ⇒ المشاركة مش محتاجة تفتحه تاني (`rtlAlignBlob` بيفكّه كله في الذاكرة).
 */

export function xlsxStreamSupported(): boolean {
  try {
    if (typeof CompressionStream === "undefined") return false;
    new CompressionStream("deflate-raw" as CompressionFormat);
    return true;
  } catch {
    return false;
  }
}

// ── CRC32 (لازم للـZIP) ──────────────────────────────────────────────────────
// «slicing-by-8»: ٨ بايت في اللفّة بدل واحد (~٤× أسرع — الورقة مئات الميجات قبل الضغط)
const CRC_T = (() => {
  const t = new Uint32Array(256 * 8);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  for (let n = 0; n < 256; n++) {
    for (let k = 1; k < 8; k++) t[k * 256 + n] = (t[(k - 1) * 256 + n] >>> 8) ^ t[t[(k - 1) * 256 + n] & 0xff];
  }
  return t;
})();
function crcUpdate(crc: number, bytes: Uint8Array): number {
  const t = CRC_T;
  let c = crc >>> 0, i = 0;
  const end8 = bytes.length - (bytes.length % 8);
  for (; i < end8; i += 8) {
    const a = (c ^ (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24))) >>> 0;
    c = t[1792 + (a & 0xff)] ^ t[1536 + ((a >>> 8) & 0xff)] ^ t[1280 + ((a >>> 16) & 0xff)] ^ t[1024 + (a >>> 24)]
      ^ t[768 + bytes[i + 4]] ^ t[512 + bytes[i + 5]] ^ t[256 + bytes[i + 6]] ^ t[bytes[i + 7]];
  }
  for (; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}
const crcOf = (bytes: Uint8Array) => (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0;

// ── XML ──────────────────────────────────────────────────────────────────────
/** أكتر حروف بتتشال من XML 1.0 (حروف تحكم) — من غير lookbehind (الآيفون القديم بيبيّض الشاشة). */
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const SURROGATE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;
/** أقصى طول خانة في الإكسيل. */
const MAX_CELL = 32767;

/** أي حرف محتاج تنضيف — أغلب الخانات (لوحات/عربي/أرقام) مافيهاش، فبتعدّي من غير ولا replace. */
const NEEDS_ESC = /[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/;

function esc(v: string): string {
  if (v.length <= MAX_CELL && !NEEDS_ESC.test(v)) return v;
  let s = v.length > MAX_CELL ? v.slice(0, MAX_CELL) : v;
  s = s.replace(BAD_XML, "");
  if (/[\uD800-\uDFFF]/.test(s)) s = s.replace(SURROGATE, (m) => (m.length === 2 ? m : ""));
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function safeSheetName(name: string): string {
  const s = String(name || "Sheet1").replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return s || "Sheet1";
}

function fixedParts(sheetName: string): { name: string; xml: string }[] {
  return [
    { name: "[Content_Types].xml", xml: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + "</Types>" },
    { name: "_rels/.rels", xml: HEAD + `<Relationships xmlns="${PKG_REL}">`
      + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", xml: HEAD + `<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews>`
      + `<sheets><sheet name="${esc(safeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", xml: HEAD + `<Relationships xmlns="${PKG_REL}">`
      + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    // نمط واحد بس (رقم ٠ = كل الخانات): محاذاة يمين + اتجاه قراءة عربي
    { name: "xl/styles.xml", xml: HEAD + `<styleSheet xmlns="${NS}">`
      + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">'
      + '<alignment horizontal="right" readingOrder="2"/></xf></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
  ];
}

// ── ZIP ──────────────────────────────────────────────────────────────────────
const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true);
const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n >>> 0, true);
const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;   // ثابت — مش مهم للإكسيل
const LIMIT_4GB = 0xffffffff;

interface Entry { name: Uint8Array; method: number; flags: number; crc: number; comp: number; size: number; offset: number }

function localHeader(e: Entry): Uint8Array {
  const b = new Uint8Array(30 + e.name.length), v = new DataView(b.buffer);
  u32(v, 0, 0x04034b50); u16(v, 4, 20); u16(v, 6, e.flags); u16(v, 8, e.method);
  u16(v, 10, DOS_TIME); u16(v, 12, DOS_DATE);
  // بفلاج ٨ (حجم مش معروف لسه) الأرقام دي صفر وبتيجي في الـdata descriptor
  u32(v, 14, e.flags & 8 ? 0 : e.crc); u32(v, 18, e.flags & 8 ? 0 : e.comp); u32(v, 22, e.flags & 8 ? 0 : e.size);
  u16(v, 26, e.name.length); u16(v, 28, 0);
  b.set(e.name, 30);
  return b;
}
function dataDescriptor(e: Entry): Uint8Array {
  const b = new Uint8Array(16), v = new DataView(b.buffer);
  u32(v, 0, 0x08074b50); u32(v, 4, e.crc); u32(v, 8, e.comp); u32(v, 12, e.size);
  return b;
}
function centralHeader(e: Entry): Uint8Array {
  const b = new Uint8Array(46 + e.name.length), v = new DataView(b.buffer);
  u32(v, 0, 0x02014b50); u16(v, 4, 20); u16(v, 6, 20); u16(v, 8, e.flags); u16(v, 10, e.method);
  u16(v, 12, DOS_TIME); u16(v, 14, DOS_DATE); u32(v, 16, e.crc); u32(v, 20, e.comp); u32(v, 24, e.size);
  u16(v, 28, e.name.length); u16(v, 30, 0); u16(v, 32, 0); u16(v, 34, 0); u16(v, 36, 0); u32(v, 38, 0);
  u32(v, 42, e.offset);
  b.set(e.name, 46);
  return b;
}
function endOfCentral(count: number, cdSize: number, cdOffset: number): Uint8Array {
  const b = new Uint8Array(22), v = new DataView(b.buffer);
  u32(v, 0, 0x06054b50); u16(v, 4, 0); u16(v, 6, 0); u16(v, 8, count); u16(v, 10, count);
  u32(v, 12, cdSize); u32(v, 16, cdOffset); u16(v, 20, 0);
  return b;
}

export interface XlsxStreamOptions {
  headers: string[];
  /** الصفوف دفعة دفعة (ككائنات مفاتيحها العناوين). */
  batches: AsyncIterable<Record<string, string>[]> | Iterable<Record<string, string>[]>;
  sheetName?: string;
  /** بعد كل دفعة: إجمالي الصفوف اللي اتكتبت لحد دلوقتي. */
  onRows?: (done: number) => void;
}

/** يبني ملف xlsx دفعة دفعة. بيرمي لو الموبايل مافيهوش أداة الضغط (`xlsxStreamSupported`). */
export async function buildXlsxStream(opts: XlsxStreamOptions): Promise<Blob> {
  if (!xlsxStreamSupported()) throw new Error("xlsx_stream_unsupported");
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const entries: Entry[] = [];
  let offset = 0;
  const push = (b: Uint8Array) => { parts.push(b as unknown as BlobPart); offset += b.length; };

  // ① الملفات الصغيرة الثابتة (من غير ضغط — حجمها كام بايت)
  for (const p of fixedParts(opts.sheetName ?? "داتا")) {
    const data = enc.encode(p.xml);
    const e: Entry = { name: enc.encode(p.name), method: 0, flags: 0, crc: crcOf(data), comp: data.length, size: data.length, offset };
    push(localHeader(e)); push(data);
    entries.push(e);
  }

  // ② الورقة نفسها — بتتكتب وتتضغط دفعة دفعة
  const sheet: Entry = { name: enc.encode("xl/worksheets/sheet1.xml"), method: 8, flags: 8, crc: 0, comp: 0, size: 0, offset };
  push(localHeader(sheet));
  const cs = new CompressionStream("deflate-raw" as CompressionFormat);
  const writer = cs.writable.getWriter();
  const reader = cs.readable.getReader();
  let comp = 0;
  const drain = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      parts.push(value as unknown as BlobPart);
      comp += value.length;
    }
  })();
  let crc = 0xffffffff, size = 0;
  const write = async (s: string) => {
    const bytes = enc.encode(s);
    crc = crcUpdate(crc, bytes);
    size += bytes.length;
    if (size > LIMIT_4GB) throw new Error("xlsx_too_big");
    await writer.write(bytes);
  };

  const headers = opts.headers;
  const cols = headers.map((_, i) => colName(i));
  let rowNo = 1;
  const rowXml = (get: (i: number) => unknown) => {
    let s = `<row r="${rowNo}">`;
    for (let i = 0; i < headers.length; i++) {
      const v = get(i);
      if (v == null || v === "") continue;
      s += `<c r="${cols[i]}${rowNo}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }
    rowNo++;
    return s + "</row>";
  };

  try {
    await write(HEAD + `<worksheet xmlns="${NS}"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetData>`
      + rowXml((i) => headers[i]));
    let done = 0;
    const it = ((opts.batches as AsyncIterable<Record<string, string>[]>)[Symbol.asyncIterator]?.()
      ?? (opts.batches as Iterable<Record<string, string>[]>)[Symbol.iterator]()) as AsyncIterator<Record<string, string>[]> | Iterator<Record<string, string>[]>;
    // ⚡ الدفعة الجاية بتتقري من الموبايل وإحنا بنضغط اللي قبلها
    let next = Promise.resolve(it.next());
    for (;;) {
      const r = await next;
      if (r.done) break;
      next = Promise.resolve(it.next());
      let chunk = "";
      for (const row of r.value) chunk += rowXml((i) => row[headers[i]]);
      await write(chunk);
      done += r.value.length;
      opts.onRows?.(done);
    }
    await write("</sheetData></worksheet>");
    await writer.close();
  } catch (e) {
    try { await writer.abort(e); } catch { /* ignore */ }
    throw e;
  }
  await drain;
  if (comp > LIMIT_4GB || offset + comp > LIMIT_4GB) throw new Error("xlsx_too_big");
  sheet.crc = (crc ^ 0xffffffff) >>> 0; sheet.size = size; sheet.comp = comp;
  offset += comp;
  push(dataDescriptor(sheet));
  entries.push(sheet);

  // ③ الفهرس
  const cdStart = offset;
  for (const e of entries) push(centralHeader(e));
  push(endOfCentral(entries.length, offset - cdStart, cdStart));
  return new Blob(parts, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

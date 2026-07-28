/**
 * xlsxStream — قراءة ملف xlsx **على دفعات (streaming)** بذاكرة قليلة.
 *
 * ليه موجود: الملفات الكبيرة (مئات الآلاف من الصفوف) بتفجّر ذاكرة Safari على
 * iOS لو اتقرت مرة واحدة (XLSX.read بيفكّ الورقة كلها في الذاكرة). هنا بنفكّ
 * الـzip على دفعات (jszip.internalStream) ونحلّل الـXML على دفعات (saxes) —
 * فمابنمسكش الورقة كلها في الذاكرة أبداً. الصفوف بتترمي على دفعات للمُستهلِك
 * (اللي بيكتبها في IndexedDB مثلاً) مع backpressure (وقف/تشغيل التيار) عشان
 * الذاكرة تفضل محدودة بحجم الدفعة.
 *
 * التنسيق مطابق لـ SheetJS (raw:false): بيطبّق تنسيق الخلية (تواريخ/أرقام) عبر
 * XLSX.SSF.format — متأكّدين بالاختبار على ملف حقيقي (٧٤٠ ألف صف) إن الناتج
 * مطابق للوحات ١٠٠٪ (الفروق الوحيدة فراغات تجميلية مالهاش أثر).
 */
import JSZip from "jszip";
import { SaxesParser } from "saxes";
import * as XLSX from "xlsx";

export interface XlsxStreamMeta {
  headers: string[];
  sheetName: string;
  rowCount: number;        // عدد صفوف البيانات (غير الهيدر وغير الفاضية)
  allSheetNames: string[];
}

export interface StreamXlsxOptions {
  /** يفضّل ورقة بهذا الاسم لو موجودة (زي "تشييك")؛ وإلا أول ورقة. */
  preferSheet?: string;
  /** حجم الدفعة (عدد الصفوف) قبل ما نوقف التيار ونسلّمها للمُستهلِك. */
  batchSize?: number;
  /** يتنده كل ما عدد صفوف اتقرا (للتقدّم). */
  onProgress?: (rowsSoFar: number) => void;
}

type ZipLike = Awaited<ReturnType<typeof JSZip.loadAsync>>;

// jszip.internalStream موجود وقت التشغيل لكنه غير مُعرَّف في types الحزمة.
interface JSZipStreamHelper {
  on(event: "data", cb: (chunk: string) => void): JSZipStreamHelper;
  on(event: "end", cb: () => void): JSZipStreamHelper;
  on(event: "error", cb: (e: unknown) => void): JSZipStreamHelper;
  pause(): void;
  resume(): void;
}
function internalStreamOf(zip: ZipLike, path: string): JSZipStreamHelper {
  const f = zip.file(path);
  if (!f) throw new Error("entry not found: " + path);
  return (f as unknown as { internalStream(type: string): JSZipStreamHelper }).internalStream("string");
}

// حرف عمود → رقم (A→0 … AA→26)
function colToIdx(ref: string): number {
  const m = /^([A-Z]+)/.exec(ref);
  if (!m) return -1;
  let n = 0;
  for (let i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
  return n - 1;
}

async function readEntryText(zip: ZipLike, name: string): Promise<string | null> {
  const f = zip.file(name);
  return f ? f.async("string") : null;
}

// يبني مصفوفة sharedStrings من نصّها (يدعم rich text: يجمع كل <t>).
function parseSharedStrings(xml: string | null): string[] {
  const arr: string[] = [];
  if (!xml) return arr;
  const p = new SaxesParser();
  let cur: string | null = null;
  let inT = false;
  p.on("opentag", (t) => { if (t.name === "si") cur = ""; else if (t.name === "t") inT = true; });
  p.on("text", (txt) => { if (inT && cur !== null) cur += txt; });
  p.on("closetag", (t) => { if (t.name === "t") inT = false; else if (t.name === "si") { arr.push(cur ?? ""); cur = null; } });
  p.write(xml).close();
  return arr;
}

// يبني خريطة styleIndex → numFmt (id مدمج أو formatCode مخصّص) من styles.xml.
function parseStyles(xml: string | null): { styleToFmt: number[]; customFmts: Record<number, string> } {
  const styleToFmt: number[] = [];
  const customFmts: Record<number, string> = {};
  if (!xml) return { styleToFmt, customFmts };
  const p = new SaxesParser();
  let inCellXfs = false;
  p.on("opentag", (t) => {
    if (t.name === "numFmt") {
      const id = parseInt(t.attributes.numFmtId as string, 10);
      if (!Number.isNaN(id)) customFmts[id] = (t.attributes.formatCode as string) || "";
    } else if (t.name === "cellXfs") inCellXfs = true;
    else if (t.name === "xf" && inCellXfs) {
      const id = parseInt((t.attributes.numFmtId as string) || "0", 10);
      styleToFmt.push(Number.isNaN(id) ? 0 : id);
    }
  });
  p.on("closetag", (t) => { if (t.name === "cellXfs") inCellXfs = false; });
  p.write(xml).close();
  return { styleToFmt, customFmts };
}

// يحلّ مسار الورقة داخل الـzip: يفضّل الاسم المطلوب، وإلا أول ورقة بالترتيب.
// بيرجّع { path, sheetName, allSheetNames }.
async function resolveSheet(
  zip: ZipLike,
  preferSheet?: string
): Promise<{ path: string; sheetName: string; allSheetNames: string[] }> {
  // اقرأ أسماء الورقات + r:id من workbook.xml، والـrels عشان نحوّل r:id → ملف.
  const wbXml = await readEntryText(zip, "xl/workbook.xml");
  const relsXml = await readEntryText(zip, "xl/_rels/workbook.xml.rels");
  const sheets: { name: string; rid: string }[] = [];
  const rels: Record<string, string> = {};
  if (wbXml) {
    const p = new SaxesParser();
    p.on("opentag", (t) => {
      if (t.name === "sheet") {
        const name = (t.attributes.name as string) ?? "";
        const rid = (t.attributes["r:id"] as string) ?? (t.attributes["id"] as string) ?? "";
        sheets.push({ name, rid });
      }
    });
    p.write(wbXml).close();
  }
  if (relsXml) {
    const p = new SaxesParser();
    p.on("opentag", (t) => {
      if (t.name === "Relationship") {
        const id = (t.attributes.Id as string) ?? "";
        const target = (t.attributes.Target as string) ?? "";
        if (id) rels[id] = target;
      }
    });
    p.write(relsXml).close();
  }
  const allSheetNames = sheets.map((s) => s.name).filter(Boolean);
  const toPath = (target: string): string => {
    let t = target.replace(/^\/xl\//, "").replace(/^\//, "");
    if (!t.startsWith("xl/") && !t.startsWith("worksheets/")) t = t; // نسبي لـ xl/
    if (t.startsWith("worksheets/")) return "xl/" + t;
    if (t.startsWith("xl/")) return t;
    return "xl/" + t;
  };
  // اختَر الورقة
  let chosen = preferSheet ? sheets.find((s) => s.name === preferSheet) : undefined;
  if (!chosen) chosen = sheets[0];
  let path = "";
  if (chosen && chosen.rid && rels[chosen.rid]) path = toPath(rels[chosen.rid]);
  // fallback: أول worksheet بالترتيب لو الحل فشل
  if (!path || !zip.file(path)) {
    const names = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
    names.sort();
    path = names[0] ?? "";
  }
  return { path, sheetName: chosen?.name ?? "", allSheetNames };
}

// يبني مفاتيح العناوين من صف الهيدر (يطابق سلوك SheetJS: خلية فاضية → __EMPTY،
// وتكرار الاسم → لاحقة _N).
function buildHeaderKeys(headerRow: string[]): string[] {
  const keys: string[] = [];
  const seen: Record<string, number> = {};
  let emptyCount = 0;
  for (let c = 0; c < headerRow.length; c++) {
    const raw = headerRow[c];
    let key: string;
    // خلية غائبة تماماً → __EMPTY (زي SheetJS)؛ خلية موجودة بقيمة (حتى لو "")
    // بتتستخدم كما هي — عشان نطابق مفاتيح SheetJS بالظبط.
    if (raw == null) { key = emptyCount === 0 ? "__EMPTY" : `__EMPTY_${emptyCount}`; emptyCount++; }
    else key = String(raw);
    if (seen[key] != null) { seen[key]++; key = `${key}_${seen[key]}`; }
    else seen[key] = 0;
    keys.push(key);
  }
  return keys;
}

/**
 * يقرا ملف xlsx على دفعات ويسلّم كل دفعة صفوف (ككائنات مفاتيحها العناوين) —
 * بنفس شكل ExcelTable.rows — للمُستهلِك، مع backpressure. بيرجّع الميتاداتا.
 */
export async function streamXlsxToBatches(
  input: Blob | ArrayBuffer | Uint8Array,
  onBatch: (rows: Record<string, string>[], firstIndex: number) => void | Promise<void>,
  opts: StreamXlsxOptions = {}
): Promise<XlsxStreamMeta> {
  const batchSize = opts.batchSize ?? 5000;
  const zip = await JSZip.loadAsync(input as ArrayBuffer);
  const sst = parseSharedStrings(await readEntryText(zip, "xl/sharedStrings.xml"));
  const { styleToFmt, customFmts } = parseStyles(await readEntryText(zip, "xl/styles.xml"));
  const { path, sheetName, allSheetNames } = await resolveSheet(zip, opts.preferSheet);
  if (!path || !zip.file(path)) throw new Error("تعذّر إيجاد ورقة بيانات في الملف.");

  const fmtFor = (s: number | null): string | number => {
    if (s == null) return "General";
    const id = styleToFmt[s];
    if (id == null) return "General";
    return customFmts[id] != null ? customFmts[id] : id;
  };

  let headerKeys: string[] | null = null;
  let dataCount = 0;
  let batch: Record<string, string>[] = [];
  // الوصول لـ SSF بشكل آمن ضد تعارف CJS/ESM (أحياناً بيتحط تحت .default).
  type SSFType = { format: (fmt: string | number, v: number) => string };
  const XLSXns = XLSX as unknown as { SSF?: SSFType; default?: { SSF?: SSFType } };
  const SSF = XLSXns.SSF ?? XLSXns.default?.SSF ?? null;

  return new Promise<XlsxStreamMeta>((resolve, reject) => {
    const parser = new SaxesParser();
    let row: string[] | null = null;
    let curCol = -1, curType: string | null = null, curStyle: number | null = null;
    let inV = false, inT = false, valBuf = "";

    const stream = internalStreamOf(zip, path);
    let flushing = false;
    let ended = false;

    const rowToObj = (arr: string[]): Record<string, string> => {
      const obj: Record<string, string> = {};
      const keys = headerKeys!;
      for (let c = 0; c < keys.length; c++) obj[keys[c]] = arr[c] != null ? arr[c] : "";
      return obj;
    };

    const doFlush = async () => {
      if (flushing) return;
      flushing = true;
      try {
        while (batch.length >= batchSize || (ended && batch.length > 0)) {
          const take = batch.splice(0, batchSize);
          await onBatch(take, dataCount - (batch.length + take.length));
        }
      } catch (e) { reject(e as Error); return; }
      flushing = false;
      if (ended) finish();
      else stream.resume();
    };

    let finished = false;
    const finish = () => {
      if (finished) return;
      if (batch.length > 0 || flushing) { void doFlush(); return; }
      finished = true;
      resolve({ headers: headerKeys ?? [], sheetName, rowCount: dataCount, allSheetNames });
    };

    parser.on("opentag", (t) => {
      const n = t.name;
      if (n === "row") row = [];
      else if (n === "c") {
        curCol = colToIdx((t.attributes.r as string) || "");
        curType = (t.attributes.t as string) || null;
        const s = t.attributes.s as string | undefined;
        curStyle = s != null ? parseInt(s, 10) : null;
        valBuf = "";
      } else if (n === "v") { inV = true; valBuf = ""; }
      else if (n === "t") inT = true;
    });
    parser.on("text", (txt) => { if (inV || inT) valBuf += txt; });
    parser.on("closetag", (t) => {
      const n = t.name;
      if (n === "v") inV = false;
      else if (n === "t") inT = false;
      else if (n === "c") {
        let val = "";
        if (curType === "s") { const i = parseInt(valBuf, 10); val = Number.isNaN(i) ? "" : (sst[i] ?? ""); }
        else if (curType === "inlineStr" || curType === "str") val = valBuf;
        else if (curType === "b") val = valBuf === "1" ? "TRUE" : "FALSE";
        else if (valBuf !== "") {
          const num = Number(valBuf);
          if (Number.isNaN(num) || !SSF) val = valBuf;
          else { try { val = String(SSF.format(fmtFor(curStyle), num)); } catch { val = valBuf; } }
        }
        if (row && curCol >= 0) row[curCol] = val;
      } else if (n === "row") {
        const arr = row || [];
        row = null;
        const hasData = arr.some((v) => v != null && String(v).trim() !== "");
        if (!headerKeys) {
          if (hasData) headerKeys = buildHeaderKeys(arr); // أول صف غير فاضي = الهيدر
          return;
        }
        if (!hasData) return; // تخطّى الصفوف الفاضية
        batch.push(rowToObj(arr));
        dataCount++;
        if (opts.onProgress && dataCount % 2000 === 0) opts.onProgress(dataCount);
        if (batch.length >= batchSize) {
          // backpressure: وقف التيار وفرّغ الدفعة قبل ما نكمّل
          stream.pause();
          void doFlush();
        }
      }
    });
    parser.on("error", (e) => reject(e as unknown as Error));

    stream.on("data", (chunk: string) => { try { parser.write(chunk); } catch (e) { reject(e as Error); } });
    stream.on("error", (e: unknown) => reject(e as Error));
    stream.on("end", () => {
      try { parser.close(); } catch (e) { reject(e as Error); return; }
      ended = true;
      if (opts.onProgress) opts.onProgress(dataCount);
      finish();
    });
    stream.resume();
  });
}

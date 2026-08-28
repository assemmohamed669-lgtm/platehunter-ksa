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
import { hyperlinkFormulaUrl, resolveSharedFormulas } from "./hyperlink";

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

/**
 * الملف zip سليم بس **مش xlsx من جوّه** (xlsb / ods / أرشيف فيه ملف تاني...).
 * نوع خطأ منفصل عشان المُستدعي يعرف يرجع للقارئ العادي (SheetJS) اللي بيفهم
 * الصيغ دي، بدل ما يوقف المندوب بخطأ.
 */
export class NotXlsxWorksheetError extends Error {
  readonly entries: string[];
  constructor(message: string, entries: string[]) {
    super(message);
    this.name = "NotXlsxWorksheetError";
    this.entries = entries;
  }
}

// اسم العنصر/الخاصية بدون بادئة namespace ("x:row" → "row", "r:id" → "id").
// بعض المولّدات (WPS، مكتبات جافا، تصدير Google Sheets) بتكتب العناصر ببادئة،
// والقارئ لازم يفهمها زي القياسية بالظبط.
function localName(name: string): string {
  const i = name.indexOf(":");
  return i < 0 ? name : name.slice(i + 1);
}

// قيمة خاصية بغضّ النظر عن بادئتها ("r:id" / "rel:id" / "id" → كلها id).
function attrByLocal(attrs: Record<string, unknown>, wanted: string): string {
  const direct = attrs[wanted];
  if (typeof direct === "string" && direct) return direct;
  for (const k of Object.keys(attrs)) {
    if (localName(k) === wanted) {
      const v = attrs[k];
      if (typeof v === "string" && v) return v;
    }
  }
  return "";
}

// وصف الصيغة الحقيقية للملف من محتويات الـzip — للرسالة اللي المندوب بيشوفها.
function describeNonXlsxZip(zip: ZipLike): { hint: string; entries: string[] } {
  const names = Object.keys(zip.files).filter((n) => !n.endsWith("/"));
  const bin = names.find((n) => /^xl\/worksheets\/.+\.bin$/i.test(n));
  if (bin) return { hint: `صيغة xlsb (إكسيل ثنائي) — لقينا ${bin}`, entries: [bin] };
  if (names.some((n) => n === "content.xml" || n === "mimetype")) {
    return { hint: "صيغة ods (LibreOffice / OpenOffice)", entries: names.slice(0, 5) };
  }
  const inner = names.find((n) => /\.(xlsx|xlsm|xlsb|xls|csv)$/i.test(n));
  if (inner) return { hint: `أرشيف مضغوط جوّه ملف تاني (${inner})`, entries: [inner] };
  const sample = names.slice(0, 3).join("، ");
  return { hint: sample ? `مافيهوش ورقة xlsx — اللي جوّاه: ${sample}` : "الملف فاضي", entries: names.slice(0, 5) };
}

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

/**
 * Excel بيهرب المحارف اللي مش مسموحة في XML بالشكل `_xHHHH_` (مثلاً سطر جديد
 * جوّه خلية بيتكتب `_x000D_`). لازم نفكّها زي القارئ العادي بالظبط — من غير كده
 * المندوب بيشوف «ر ق أ 6720_x000D_» مكتوبة حرفياً في عمود اللوحة.
 */
function unescapeXlsxText(s: string): string {
  if (s.indexOf("_x") < 0) return s;
  return s.replace(/_x([\da-fA-F]{4})_/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

/**
 * مصرف يبني مصفوفة sharedStrings **على دفعات** — النص الكامل عمره ما يتجمّع.
 *
 * ليه: على ملف مندوب حقيقي (٤٦٢ ألف نص مشترك) تحميل النص كامل قبل التحليل
 * كلّف +١٢١ ميجا، والآيفون بيقتل الصفحة **قبل قراءة صف واحد** — ولذلك الكراش
 * كان بيظهر عند صفر بالمية. saxes بيتعامل مع حدود الدفع صح، فالقطع وسط وسم
 * أو وسط كلمة عربية مايفرقش.
 */
export function createSharedStringsSink() {
  const arr: string[] = [];
  const p = new SaxesParser();
  let cur: string | null = null;
  let inT = false;
  p.on("opentag", (t) => { const n = localName(t.name); if (n === "si") cur = ""; else if (n === "t") inT = true; });
  p.on("text", (txt) => { if (inT && cur !== null) cur += txt; });
  p.on("closetag", (t) => {
    const n = localName(t.name);
    if (n === "t") inT = false;
    else if (n === "si") { arr.push(unescapeXlsxText(cur ?? "")); cur = null; }
  });
  // ملف بلا جدول نصوص مشترك حالة صحيحة (كل النصوص مضمّنة في الورقة). قفل
  // المحلّل بلا أي مدخل بيرمي «document must contain a root element»، فبنرجّع
  // فاضي زي القارئ القديم بالظبط.
  let wrote = false;
  return {
    write(chunk: string) { if (chunk) { wrote = true; p.write(chunk); } },
    end(): string[] { if (wrote) p.close(); return arr; },
  };
}

/**
 * يقرا جدول النصوص المشترك **على دفعات** من الأرشيف — من غير ما نحمّل نصّه
 * كامل. ده أكبر توفير في التجهيز: على ملف ٤٦٢ ألف نص، التحميل الكامل كان
 * بياكل +١٢١ ميجا قبل قراءة أول صف.
 */
async function readSharedStringsStreamed(zip: ZipLike): Promise<string[]> {
  const name = "xl/sharedStrings.xml";
  if (!zip.file(name)) return [];
  const sink = createSharedStringsSink();
  await new Promise<void>((resolve, reject) => {
    const st = internalStreamOf(zip, name);
    st.on("data", (chunk) => { try { sink.write(chunk); } catch (e) { reject(e as Error); } });
    st.on("error", (e) => reject(e instanceof Error ? e : new Error(String(e))));
    st.on("end", () => resolve());
    st.resume();
  });
  return sink.end();
}

// يبني خريطة styleIndex → numFmt (id مدمج أو formatCode مخصّص) من styles.xml.
function parseStyles(xml: string | null): { styleToFmt: number[]; customFmts: Record<number, string> } {
  const styleToFmt: number[] = [];
  const customFmts: Record<number, string> = {};
  if (!xml) return { styleToFmt, customFmts };
  const p = new SaxesParser();
  let inCellXfs = false;
  p.on("opentag", (t) => {
    const n = localName(t.name);
    if (n === "numFmt") {
      const id = parseInt(attrByLocal(t.attributes, "numFmtId"), 10);
      if (!Number.isNaN(id)) customFmts[id] = attrByLocal(t.attributes, "formatCode");
    } else if (n === "cellXfs") inCellXfs = true;
    else if (n === "xf" && inCellXfs) {
      const id = parseInt(attrByLocal(t.attributes, "numFmtId") || "0", 10);
      styleToFmt.push(Number.isNaN(id) ? 0 : id);
    }
  });
  p.on("closetag", (t) => { if (localName(t.name) === "cellXfs") inCellXfs = false; });
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
      if (localName(t.name) === "sheet") {
        const name = attrByLocal(t.attributes, "name");
        const rid = attrByLocal(t.attributes, "id");
        sheets.push({ name, rid });
      }
    });
    p.write(wbXml).close();
  }
  if (relsXml) {
    const p = new SaxesParser();
    p.on("opentag", (t) => {
      if (localName(t.name) === "Relationship") {
        const id = attrByLocal(t.attributes, "Id");
        const target = attrByLocal(t.attributes, "Target");
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
  // fallback: أول worksheet بالترتيب لو الحل فشل. متسامح مع الأسماء غير القياسية:
  // "sheet.xml" (بدون رقم)، "Sheet1.xml" (حروف كبيرة)، أي اسم .xml جوّه worksheets.
  // الترتيب رقمي (sheet2 قبل sheet10).
  if (!path || !zip.file(path)) {
    const names = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n));
    names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
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

/** كل ورقات الملف بمسارها جوّه الـzip وحالة إخفائها، بترتيب الـworkbook. */
async function listSheetPaths(zip: ZipLike): Promise<{ name: string; path: string; hidden: boolean }[]> {
  const wbXml = await readEntryText(zip, "xl/workbook.xml");
  const relsXml = await readEntryText(zip, "xl/_rels/workbook.xml.rels");
  const sheets: { name: string; rid: string; hidden: boolean }[] = [];
  const rels: Record<string, string> = {};
  if (wbXml) {
    const p = new SaxesParser();
    p.on("opentag", (t) => {
      if (localName(t.name) === "sheet") {
        // state="hidden" أو "veryHidden" = ورقة مخفية في الإكسيل
        const state = attrByLocal(t.attributes, "state").toLowerCase();
        sheets.push({
          name: attrByLocal(t.attributes, "name"),
          rid: attrByLocal(t.attributes, "id"),
          hidden: state === "hidden" || state === "veryhidden",
        });
      }
    });
    p.write(wbXml).close();
  }
  if (relsXml) {
    const p = new SaxesParser();
    p.on("opentag", (t) => {
      if (localName(t.name) === "Relationship") {
        const id = attrByLocal(t.attributes, "Id");
        if (id) rels[id] = attrByLocal(t.attributes, "Target");
      }
    });
    p.write(relsXml).close();
  }
  const toPath = (target: string): string => {
    const t = target.replace(/^\/xl\//, "").replace(/^\//, "");
    return t.startsWith("xl/") ? t : "xl/" + t;
  };

  const out = sheets
    .filter((s) => s.name)
    .map((s) => ({ name: s.name, hidden: s.hidden, path: s.rid && rels[s.rid] ? toPath(rels[s.rid]) : "" }))
    .filter((s) => s.path && zip.file(s.path));
  if (out.length) return out;

  // احتياطي: أسماء ملفات غير قياسية — رتّب رقمياً (sheet2 قبل sheet10).
  const names = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/[^/]+\.xml$/i.test(n));
  names.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return names.map((path, i) => ({ name: sheets[i]?.name || `Sheet${i + 1}`, path, hidden: sheets[i]?.hidden === true }));
}

/**
 * يقرا **كل** ورقات الملف كصفوف خام (مصفوفات) بمرور SAX واحد لكل ورقة —
 * بديل منخفض الذاكرة لـ `XLSX.read` في مسار ملفات الإحالة.
 *
 * ليه: محافظ البنوك بتيجي بمدى وهمي ضخم (الورقة مسجّلة لغاية صف ٩٩٨ ألف وفيها
 * ١٦٧٤ لوحة بس، والباقي صفوف فاضية متنسّقة) وأحياناً معاها pivot cache بمئات
 * الميجات. SheetJS بيفكّ ويبني ده كله في الذاكرة الأول وبعدين إحنا بنقصّه —
 * فالتليفون بيتجمّد أو التطبيق بيقفل. هنا بنعدّي على الـXML مرة واحدة، بنرمي
 * الصفوف الفاضية وإحنا ماشيين، وماببنقربش من الـpivot cache أصلاً.
 *
 * بيرمي `NotXlsxWorksheetError` لو الملف مش xlsx — فالمستدعي يرجع للقارئ العادي.
 */
export async function readAllSheetsRawStream(
  input: Blob | ArrayBuffer | Uint8Array,
  opts: { raw?: boolean } = {},
): Promise<{ name: string; aoa: unknown[][]; hidden: boolean }[]> {
  const zip = await JSZip.loadAsync(input as ArrayBuffer);
  const sst = await readSharedStringsStreamed(zip);
  const { styleToFmt, customFmts } = parseStyles(await readEntryText(zip, "xl/styles.xml"));
  const decodeCell = opts.raw
    ? makeCellDecoder(sst, styleToFmt, customFmts, true)
    : makeCellDecoder(sst, styleToFmt, customFmts);

  const sheets = await listSheetPaths(zip);
  if (sheets.length === 0) {
    const { hint, entries } = describeNonXlsxZip(zip);
    throw new NotXlsxWorksheetError(
      `تعذّر إيجاد ورقة بيانات — الملف مش xlsx من جوّه: ${hint}. ` +
        "الحل: افتح الملف واعمل «حفظ باسم → Excel Workbook (.xlsx)».",
      entries
    );
  }

  const out: { name: string; aoa: unknown[][]; hidden: boolean }[] = [];
  for (const s of sheets) {
    out.push({ name: s.name, hidden: s.hidden, aoa: await streamSheetAoa(zip, s.path, decodeCell) });
  }
  return out;
}

/**
 * بعد الكمّ ده من الصفوف الفاضية **ورا بعض** بنوقف القراءة ونعتبر الورقة خلصت.
 *
 * ليه: محافظ البنوك بتيجي بمدى وهمي — «البنك العربي» ورقتها ١٠٦ ميجا XML فيها
 * ١٦٧٥ صف داتا في الأول و**٩٩٧ ألف صف فاضي** وراهم. من غير الوقفة دي بنفكّ
 * ونحلّل الـ١٠٦ ميجا كلها عشان نرميها — وده كل التقل اللي المندوب حاسس بيه وهو
 * بيفتح الملف من واتساب.
 *
 * ٢٠ ألف صف فاضي ورا بعض رقم كبير جداً على أي ملف حقيقي (أكبر محفظة شفناها
 * ٣٧٨٢ صف)، فمفيش داتا حقيقية ممكن تتقطع.
 */
const EMPTY_ROW_STOP = 20_000;

/** مرور SAX على ورقة واحدة → صفوف خام، بلا الصفوف الفاضية. */
function streamSheetAoa(
  zip: ZipLike,
  path: string,
  decodeCell: (type: string | null, valBuf: string, style: number | null, formula: string) => unknown,
): Promise<unknown[][]> {
  return new Promise<unknown[][]>((resolve, reject) => {
    const aoa: unknown[][] = [];
    const parser = new SaxesParser();
    let row: unknown[] | null = null;
    let curCol = -1, curType: string | null = null, curStyle: number | null = null;
    let inV = false, inT = false, inF = false, valBuf = "", fBuf = "";
    // المعادلات المشتركة: كل ورقة ليها جدول si خاص بيها.
    let fSi: string | undefined;
    const shared = resolveSharedFormulas();
    let emptyRun = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { stream.pause(); } catch { /* التيار خلص أصلاً */ }
      resolve(aoa);
    };

    parser.on("opentag", (t) => {
      if (done) return;
      const n = localName(t.name);
      if (n === "row") row = [];
      else if (n === "c") {
        curCol = colToIdx((t.attributes.r as string) || "");
        curType = (t.attributes.t as string) || null;
        const s = t.attributes.s as string | undefined;
        curStyle = s != null ? parseInt(s, 10) : null;
        valBuf = ""; fBuf = "";
      } else if (n === "v") { inV = true; valBuf = ""; }
      else if (n === "f") {
        inF = true; fBuf = "";
        // المعادلة المشتركة: الخلية الأولى بس بتكتب النص، والباقي بيشيروا بـsi.
        fSi = (t.attributes.si as string | undefined) ?? undefined;
      }
      else if (n === "t") inT = true;
    });
    parser.on("text", (txt) => {
      if (done) return;
      if (inF) fBuf += txt;
      else if (inV || inT) valBuf += txt;
    });
    parser.on("closetag", (t) => {
      if (done) return;
      const n = localName(t.name);
      if (n === "v") inV = false;
      else if (n === "f") { inF = false; fBuf = shared.resolve(fBuf, fSi); fSi = undefined; }
      else if (n === "t") inT = false;
      else if (n === "c") {
        if (row && curCol >= 0) row[curCol] = decodeCell(curType, valBuf, curStyle, fBuf);
      } else if (n === "row") {
        const arr = row || [];
        row = null;
        // الصف الفاضي بيتشال هنا — ده اللي بيمنع بناء مليون صف فاضي في الذاكرة.
        if (arr.some((v) => v != null && String(v).trim() !== "")) {
          aoa.push(arr);
          emptyRun = 0;
        } else if (++emptyRun >= EMPTY_ROW_STOP) {
          finish();   // ذيل وهمي — الباقي كله فاضي، مفيش داعي نكمّل قراءة
        }
      }
    });
    parser.on("error", (e) => { if (!done) reject(e as unknown as Error); });

    const stream = internalStreamOf(zip, path);
    stream.on("data", (chunk: string) => {
      if (done) return;
      try { parser.write(chunk); } catch (e) { if (!done) reject(e as Error); }
    });
    stream.on("error", (e: unknown) => { if (!done) reject(e as Error); });
    stream.on("end", () => {
      if (done) return;
      try { parser.close(); } catch { /* XML ناقص */ }
      finish();
    });
    stream.resume();
  });
}

/**
 * بيبني دالة بتحوّل خلية خام (نوعها + نصّها + نمطها + صيغتها) لقيمة نصية —
 * نفس المنطق المستخدم في كل قرايات الـ streaming (دفعات أو ورقات خام).
 */
function makeCellDecoder(
  sst: string[],
  styleToFmt: Record<number, number>,
  customFmts: Record<number, string>,
): (type: string | null, valBuf: string, style: number | null, formula: string) => string;
function makeCellDecoder(
  sst: string[],
  styleToFmt: Record<number, number>,
  customFmts: Record<number, string>,
  raw: true,
): (type: string | null, valBuf: string, style: number | null, formula: string) => unknown;
function makeCellDecoder(
  sst: string[],
  styleToFmt: Record<number, number>,
  customFmts: Record<number, string>,
  raw?: boolean,
): (type: string | null, valBuf: string, style: number | null, formula: string) => unknown {
  const fmtFor = (s: number | null): string | number => {
    if (s == null) return "General";
    const id = styleToFmt[s];
    if (id == null) return "General";
    return customFmts[id] != null ? customFmts[id] : id;
  };
  // الوصول لـ SSF بشكل آمن ضد تعارف CJS/ESM (أحياناً بيتحط تحت .default).
  type SSFType = {
    format: (fmt: string | number, v: number) => string;
    is_date?: (fmt: string | number) => boolean;
    parse_date_code?: (v: number) => { y: number; m: number; d: number; H: number; M: number; S: number; u: number } | null;
    _table?: Record<number, string>;
  };
  const XLSXns = XLSX as unknown as { SSF?: SSFType; default?: { SSF?: SSFType } };
  const SSF = XLSXns.SSF ?? XLSXns.default?.SSF ?? null;

  return (type, valBuf, style, formula) => {
    // خلية HYPERLINK → قيمتها = الرابط نفسه (زي resolveHyperlinkCells في القارئ
    // العادي)، عشان عمود الموقع يطلع لينك يفتح الخريطة.
    const linkUrl = hyperlinkFormulaUrl(formula);
    if (linkUrl) return linkUrl;
    if (type === "s") { const i = parseInt(valBuf, 10); return Number.isNaN(i) ? "" : (sst[i] ?? ""); }
    if (type === "inlineStr" || type === "str") return unescapeXlsxText(valBuf);
    if (type === "b") return valBuf === "1" ? "TRUE" : "FALSE";
    // خلية خطأ (#N/A، #REF!، #VALUE!…) → فاضية، زي القارئ العادي. من غير كده
    // المندوب كان هيشوف «#N/A» مكتوبة في عمود العنوان.
    if (type === "e") return "";
    if (valBuf === "") return "";
    const num = Number(valBuf);
    if (Number.isNaN(num) || !SSF) return valBuf;
    // الوضع الخام: رقم زي ما هو، وخلية التاريخ ترجع Date — بالظبط زي
    // `raw: true, cellDates: true` في القارئ العادي، عشان `cellToStr` تنسّقها
    // dd/mm/yyyy وتطلع نفس النتيجة. من غير كده التواريخ بتطلع بتنسيق الملف
    // نفسه (27/Dec/25) والأرقام بفواصل (« 4,301 ») — اختلاف عن القديم.
    if (raw) {
      // is_date بتاخد **نص** التنسيق. التنسيقات المدمجة (١٤ = تاريخ) بتيجي
      // كرقم، فلازم نحلّها من جدول SSF الأول — من غير كده التاريخ بيفضل رقم
      // تسلسلي (42705) قدام المندوب.
      const fmtRaw = fmtFor(style);
      const fmt = typeof fmtRaw === "number" ? (SSF._table?.[fmtRaw] ?? String(fmtRaw)) : fmtRaw;
      if (SSF.is_date?.(fmt)) {
        try {
          const d = SSF.parse_date_code?.(num);
          if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S, d.u);
        } catch { /* تاريخ غير صالح — نرجّع الرقم */ }
      }
      return num;
    }
    try { return String(SSF.format(fmtFor(style), num)); } catch { return valBuf; }
  };
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
  const sst = await readSharedStringsStreamed(zip);
  const { styleToFmt, customFmts } = parseStyles(await readEntryText(zip, "xl/styles.xml"));
  const { path, sheetName, allSheetNames } = await resolveSheet(zip, opts.preferSheet);
  if (!path || !zip.file(path)) {
    const { hint, entries } = describeNonXlsxZip(zip);
    throw new NotXlsxWorksheetError(
      `تعذّر إيجاد ورقة بيانات — الملف مش xlsx من جوّه: ${hint}. ` +
        "الحل: افتح الملف واعمل «حفظ باسم → Excel Workbook (.xlsx)».",
      entries
    );
  }

  const decodeCell = makeCellDecoder(sst, styleToFmt, customFmts);

  let headerKeys: string[] | null = null;
  let dataCount = 0;
  let batch: Record<string, string>[] = [];

  return new Promise<XlsxStreamMeta>((resolve, reject) => {
    const parser = new SaxesParser();
    let row: string[] | null = null;
    let curCol = -1, curType: string | null = null, curStyle: number | null = null;
    let inV = false, inT = false, valBuf = "";
    // خلية الموقع في ملفات الداتا بتتكتب `=HYPERLINK("https://…","خريطة")` —
    // القيمة المخزّنة كلمة «خريطة» والرابط جوّه الصيغة. من غير ما نقرا الصيغة،
    // عمود GPS بيوصل للتطبيق كنص مش لينك (ولا في الجدول ولا في المشاركة).
    let inF = false, fBuf = "";
    let fSi: string | undefined;
    const shared = resolveSharedFormulas();

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
      const n = localName(t.name);
      if (n === "row") row = [];
      else if (n === "c") {
        curCol = colToIdx((t.attributes.r as string) || "");
        curType = (t.attributes.t as string) || null;
        const s = t.attributes.s as string | undefined;
        curStyle = s != null ? parseInt(s, 10) : null;
        valBuf = "";
        fBuf = "";
      } else if (n === "v") { inV = true; valBuf = ""; }
      else if (n === "f") {
        inF = true; fBuf = "";
        // المعادلة المشتركة: الخلية الأولى بس بتكتب النص، والباقي بيشيروا بـsi.
        fSi = (t.attributes.si as string | undefined) ?? undefined;
      }
      else if (n === "t") inT = true;
    });
    parser.on("text", (txt) => {
      if (inF) fBuf += txt;
      else if (inV || inT) valBuf += txt;
    });
    parser.on("closetag", (t) => {
      const n = localName(t.name);
      if (n === "v") inV = false;
      else if (n === "f") { inF = false; fBuf = shared.resolve(fBuf, fSi); fSi = undefined; }
      else if (n === "t") inT = false;
      else if (n === "c") {
        const val = decodeCell(curType, valBuf, curStyle, fBuf);
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
        if (opts.onProgress && dataCount % 10000 === 0) opts.onProgress(dataCount);
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

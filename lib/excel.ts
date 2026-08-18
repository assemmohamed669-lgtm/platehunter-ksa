/**
 * Excel export for PlateHunter KSA.
 * Exports field recordings to .xlsx with the exact 6 columns from the spec.
 * Uses SheetJS (xlsx) — already in package.json.
 */

import * as XLSX from "xlsx";
import type ExcelJS from "exceljs";
import type { RecordingEntry } from "./idb";
import { detectPlateColumnByContent } from "./plateParser";
import { detectHeaderless, buildHeaderlessColumns } from "./headerlessColumns";
import { resolveHyperlinkCells } from "./hyperlink";
import { trimSheetToData } from "./xlsxRange";
import { gpsCellToLink } from "./gps";
import { rtlAlignBlob } from "./rtlExcel";
import { readAllSheetsRawStream } from "./xlsxStream";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

/**
 * الشيت يفتح من اليمين. **مهم:** SheetJS بتقرا الإعداد ده من
 * `wb.Workbook.Views` بس — `ws["!views"] = [{ RTL: true }]` بتتجاهل تماماً في
 * الكتابة، وده اللي كان خلّي كل الشيتات تفتح من الشمال عند المناديب.
 * (محاذاة الخلايا نفسها بتتظبط في `rtlAlignBlob` — النسخة المجانية من SheetJS
 * مابتكتبش أنماط خلايا.)
 */
/**
 * عرض عمود الروابط في الشيتات المشارَكة. خانة الموقع بتتكتب بالرابط كامل عشان
 * المندوب ينسخ الصف ويبعته على واتساب فيوصل رابط شغّال — لكن الرابط طويل
 * (~٥٠ حرف) وكان بياخد أقصى عرض ويطلّع الشيت وحش. القيمة جوّه الخانة مابتتغيّرش،
 * العرض المعروض بس.
 */
export const LINK_COL_WIDTH = 14;

/** عمود قيمه روابط؟ (خانة واحدة على الأقل فيها http) */
function isLinkColumn(header: string, rows: Record<string, unknown>[]): boolean {
  return rows.some((r) => /^https?:\/\//i.test(String(r[header] ?? "").trim()));
}

/** حالة إخفاء كل ورقة من SheetJS (0=ظاهرة، 1=مخفية، 2=مخفية جداً). */
function hiddenFlags(wb: XLSX.WorkBook): boolean[] {
  const meta = wb.Workbook?.Sheets ?? [];
  return wb.SheetNames.map((_, i) => Number(meta[i]?.Hidden ?? 0) > 0);
}

function setWorkbookRtl(wb: XLSX.WorkBook): void {
  wb.Workbook = { ...(wb.Workbook ?? {}), Views: [{ RTL: true }] };
}

export function exportRecordingsToExcel(
  recordings: RecordingEntry[],
  filename = "platehunter-export"
) {
  const rows = recordings
    .filter((r) => !r.plate.startsWith("📍"))
    .map((r) => {
      const gpsLink = r.mapsLink ?? "";
      const coords = r.lat && r.lng ? `${r.lat},${r.lng}` : "";
      return {
        "رقم اللوحة": r.plate,
        "GPS": gpsLink,
        "تاريخ التسجيل": formatDate(r.recordedAt),
        "الحي": r.district ?? "",
        "الشارع": r.street ?? "",
        "ملاحظات": r.notes ?? "",
        "نوع السيارة": r.vehicleType ?? "",
        "اسم المسجّل": r.recorderName ?? "",
        "موقع الشارع": coords,
      };
    });

  if (rows.length === 0) {
    alert("لا توجد بيانات للتصدير.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 14 }, // رقم اللوحة
    { wch: 55 }, // GPS
    { wch: 22 }, // تاريخ التسجيل
    { wch: 18 }, // الحي
    { wch: 26 }, // الشارع
    { wch: 30 }, // ملاحظات
    { wch: 14 }, // نوع السيارة
    { wch: 18 }, // اسم المسجّل
    { wch: 26 }, // موقع الشارع
  ];

  // GPS column as clickable hyperlinks
  rows.forEach((row, i) => {
    const cellRef = `B${i + 2}`;
    if (ws[cellRef] && row["GPS"]) {
      const target = gpsCellToLink(row["GPS"]) || row["GPS"].replace(/&(?:amp;)+/gi, "&");
      ws[cellRef].l = { Target: target, Tooltip: "فتح في الخريطة" };
    }
  });

  const wb = XLSX.utils.book_new();
  setWorkbookRtl(wb);
  XLSX.utils.book_append_sheet(wb, ws, "اللوحات");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Read a bank Excel file and return an array of raw plate strings.
 * Tries to auto-detect the column containing plate numbers.
 */
export function readBankExcel(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames.find((n) => n.trim() === "تشييك") ?? wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        
        // تعديل: استخراج البيانات كمصفوفة من المصفوفات
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
        }) as any[][];

        const plates: string[] = [];
        for (const row of rows) {
          // استخدام Object.values أو التكرار المباشر على المصفوفة لتجنب خطأ الـ Type
          for (const cell of row) {
            const val = String(cell ?? "").trim();
            if (val && val.length >= 4) plates.push(val);
          }
        }
        resolve(plates);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export interface ExcelTable {
  headers: string[];
  rows: Record<string, string>[];
  sheetName?: string;
  allSheetNames?: string[];
}

/**
 * يفكّ تشفير ملف محمي بكلمة مرور على السيرفر (SheetJS المجانية لا تفكّ التشفير).
 * يعيد File بعد فك التشفير — جاهز للقراءة المحلية بدون باسوورد.
 */
/**
 * بيفك تشفير الملف **مرة واحدة** ويرجّع نسخة مفكوكة تتخزّن وتتقرا بعد كده
 * من غير أي رحلة للسيرفر.
 *
 * ليه: فك التشفير بياخد ثواني (١٠٠ ألف دورة SHA-512 — إكسيل بيعملها كده عمداً
 * ضد تخمين كلمة السر)، وكان بيتكرر مع كل تبديل ورقة أو فتح شيت لأن اللي
 * بيتخزّن كان الملف المشفّر. النسخة المفكوكة بتخلّي كل ده فوري.
 *
 * التخزين المحلي مش بيزيد خطر: صفوف الملف بتتحفظ مفكوكة أصلاً في نفس القاعدة.
 */
export async function decryptExcelFile(file: File, password: string): Promise<File> {
  // فكّ التشفير على الجهاز أولاً (فوري) ونرجع للسيرفر لو مش متاح. باسوورد غلط بيترمي.
  const local = await decryptClientSide(file, password);
  return local ?? decryptViaServer(file, password);
}

async function decryptViaServer(file: File, password: string): Promise<File> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("password", password);
  let res: Response;
  try {
    // الراوت مقفول على المناديب المسجّلين — لازم نبعت توكن الجلسة.
    const { authHeader } = await import("./authHeader");
    res = await fetch("/api/excel/decrypt", { method: "POST", body: fd, headers: await authHeader() });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم لفك تشفير الملف — تأكد من الإنترنت.");
  }
  if (res.status === 401) {
    // 401 لها معنيان: جلسة ساقطة (NO_SESSION) أو كلمة مرور الملف غلط.
    const code = await res.clone().json().then((j) => String(j?.error ?? "")).catch(() => "");
    if (code === "NO_SESSION") throw new Error("الجلسة انتهت — سجّل الدخول تاني وجرّب.");
    throw new Error("كلمة مرور الملف غير صحيحة.");
  }
  if (res.status === 429) throw new Error("محاولات كتير — استنى دقيقة وجرّب تاني.");
  if (res.status === 413) throw new Error("الملف كبير جداً لفكّ التشفير على الخادم — افتحه على الكمبيوتر واحفظه بدون كلمة سر.");
  if (!res.ok) throw new Error("تعذّر فك تشفير الملف — قد يكون محمياً بكلمة مرور.");
  const buf = await res.arrayBuffer();
  return new File([buf], file.name, { type: file.type });
}

/**
 * Reads a spreadsheet in whatever format the bank sent it.
 *
 * The streaming reader is far lighter on memory (it is what makes the half-
 * million-row data file usable on a phone), but it only understands the XML
 * inside .xlsx — a .xlsb keeps its sheets as binary parts, and .xls/.ods are
 * different containers entirely. Those fall back to SheetJS, which reads them
 * all. Bank wallets do arrive as .xlsb, so refusing them is not an option.
 */
export async function parseAnySpreadsheet(
  file: File,
  opts: { keepUnnamedColumns?: boolean } = {},
): Promise<ExcelTable> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const sheets = await readAllSheetsRawStream(buf, { raw: true });
    const visible = sheets.filter((s) => !s.hidden && s.aoa.length > 0);
    const pick = (visible.length ? visible : sheets.filter((s) => s.aoa.length > 0))[0];
    if (pick) return buildTableFromAoa(pick.aoa, pick.name, sheets.map((s) => s.name), opts);
  } catch { /* مش xlsx من جوّه — نجرّب القارئ العام */ }
  return parseExcelFile(file);
}

/**
 * يفكّ تشفير الملف **على الجهاز نفسه** بمكتبة officecrypto-tool (نفس مكتبة السيرفر)
 * فيفتح فوري بدون رحلة رفع/تنزيل ولا cold start. المكتبة بتتحمّل بـ dynamic import
 * عشان تتقسّم في chunk منفصل (مش بتكبّر البندل الأساسي).
 *
 * بترجّع:
 *  - File مفكوك عند النجاح
 *  - null لو فكّ التشفير على الجهاز غير متاح (بيئة/بولي‑فيل) → المتصل يرجع للسيرفر
 * وبترمي Error("كلمة مرور الملف غير صحيحة.") لو الباسوورد غلط (مانرجعش للسيرفر ساعتها).
 */
async function decryptClientSide(file: File, password: string): Promise<File | null> {
  try {
    const { Buffer } = await import("buffer");
    const mod = await import("officecrypto-tool");
    const officeCrypto = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const buf = Buffer.from(await file.arrayBuffer());
    if (!officeCrypto.isEncrypted(buf)) return file; // مش مشفّر أصلاً
    let out: Buffer;
    try {
      out = await officeCrypto.decrypt(buf, { password });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/incorrect|password|wrong/i.test(msg)) {
        throw new Error("كلمة مرور الملف غير صحيحة.");
      }
      return null; // فشل تاني (مش باسوورد) → نرجع للسيرفر
    }
    return new File([new Uint8Array(out)], file.name, { type: file.type });
  } catch (e) {
    // باسوورد غلط بيتمرّر لفوق؛ أي فشل تاني (import/بولي‑فيل/بيئة) → fallback للسيرفر
    if (e instanceof Error && e.message === "كلمة مرور الملف غير صحيحة.") throw e;
    return null;
  }
}

export async function parseExcelFile(file: File, password?: string, forcedSheet?: string): Promise<ExcelTable> {
  // ملف محمي: نفكّ تشفيره على الجهاز أولاً (فوري) ونرجع للسيرفر لو مش متاح، ثم نقرأ
  // النسخة المفكوكة محلياً (بدون تمرير الباسوورد للقارئ لأن الملف بقى غير مشفّر).
  let workFile = file;
  if (password) {
    const local = await decryptClientSide(file, password); // بترمي لو الباسوورد غلط
    workFile = local ?? (await decryptViaServer(file, password));
  }
  const buffer = await workFile.arrayBuffer();

  // Try Web Worker first — parsing runs off the main thread so the UI stays responsive
  if (typeof Worker !== "undefined") {
    try {
      const result = await new Promise<ExcelTable>((resolve, reject) => {
        let worker: Worker;
        try {
          worker = new Worker(new URL("./xlsxWorker.ts", import.meta.url));
        } catch {
          reject(new Error("__WORKER_UNAVAILABLE__"));
          return;
        }

        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("__WORKER_UNAVAILABLE__"));
        }, 120_000);

        worker.onmessage = (e: MessageEvent) => {
          clearTimeout(timer);
          worker.terminate();
          const d = e.data as {
            success: boolean;
            headers?: string[];
            rows?: Record<string, string>[];
            aoa?: unknown[][];
            sheetName?: string;
            allSheetNames?: string[];
            error?: string;
          };
          // القارئ المتدفّق بيرجّع صفوف خام — بناء الجدول منها رخيص (آلاف
          // الصفوف) فبيتعمل هنا، والتقيل (فكّ الضغط وتحليل الـXML) اتعمل في
          // الـworker. كده الـworker يفضل مستقل مايستوردش من الملف ده.
          if (d.success && d.aoa) {
            try {
              resolve(buildTableFromAoa(d.aoa, d.sheetName, d.allSheetNames ?? []));
            } catch (err) {
              reject(err instanceof Error && err.message === "empty"
                ? new Error("الملف فارغ أو لا يحتوي على بيانات.")
                : new Error("تعذّرت قراءة الملف."));
            }
            return;
          }
          if (d.success && d.headers && d.rows) {
            if (d.rows.length === 0) {
              reject(new Error("الملف فارغ أو لا يحتوي على بيانات."));
            } else {
              resolve({ headers: d.headers, rows: d.rows, sheetName: d.sheetName, allSheetNames: d.allSheetNames });
            }
          } else {
            reject(new Error(d.error ?? "تعذّرت قراءة الملف."));
          }
        };

        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error("__WORKER_UNAVAILABLE__"));
        };

        // No transfer — keep buffer available for the sync fallback.
        // الباسوورد مش بيتمرّر: الملف اتفك تشفيره بالفعل قبل هنا لو كان محمي.
        worker.postMessage({ buffer, forcedSheet });
      });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Only fall through on worker init/communication failures; re-throw real parse errors
      if (msg !== "__WORKER_UNAVAILABLE__") throw err;
    }
  }

  // الـworker مش متاح: برضه نجرّب المتدفّق قبل القارئ العادي — أخفّ بكتير على
  // الذاكرة مع المحافظ اللي فيها مدى وهمي ضخم.
  if (!password && !forcedSheet) {
    try {
      return await parseExcelStream(new Uint8Array(buffer));
    } catch { /* مش xlsx أو بنية غريبة — نكمل على القارئ العادي */ }
  }

  // Synchronous fallback (main-thread; may briefly freeze UI on very large files)
  return _parseExcelSync(new Uint8Array(buffer));
}

/**
 * قراءة *كل* ورقات ملف إكسل — للبحث عن عمود الشاصي في الورقتين (أو أكتر).
 * بسيطة ومباشرة (الصف الأول = هيدر)؛ كشف عمود الشاصي بالمحتوى بيعوّض أي هيدر
 * مزاح. بترجّع الورقات اللي فيها بيانات فقط.
 */
/**
 * يقرا **كل** ورقات الملف كصفوف خام (مصفوفات) بدون أي افتراض إن أول صف هيدر.
 * ضروري لملفات الإحالة اللي فوق الهيدر فيها صفوف عناوين — التحليل بيتم في
 * lib/referralSheets (كشف صف الهيدر وعمود اللوحة بالمحتوى).
 */
export async function readAllSheetsRaw(
  file: File
): Promise<{ name: string; aoa: unknown[][]; hidden?: boolean }[]> {
  const buf = await file.arrayBuffer();

  // الأول: الـ worker — القراءة تفضل بعيد عن الـ main thread فالشاشة ما تتجمّدش.
  // (جوّه الـ worker بيجرّب القارئ المتدفّق الأول وبعدين القارئ العادي.)
  if (typeof Worker !== "undefined") {
    try {
      return await new Promise<{ name: string; aoa: unknown[][]; hidden?: boolean }[]>((resolve, reject) => {
        let worker: Worker;
        try {
          worker = new Worker(new URL("./xlsxWorker.ts", import.meta.url));
        } catch {
          reject(new Error("__WORKER_UNAVAILABLE__"));
          return;
        }
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("__WORKER_UNAVAILABLE__"));
        }, 120_000);
        worker.onmessage = (ev: MessageEvent) => {
          clearTimeout(timer);
          worker.terminate();
          const d = ev.data as { success: boolean; sheets?: { name: string; aoa: unknown[][]; hidden?: boolean }[] };
          if (d.success && d.sheets) resolve(d.sheets);
          else reject(new Error("__WORKER_UNAVAILABLE__"));
        };
        worker.onerror = () => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error("__WORKER_UNAVAILABLE__"));
        };
        worker.postMessage({ buffer: buf, mode: "rawSheets" });
      });
    } catch {
      /* الـ worker مش متاح — نكمل على الـ main thread زي الأول */
    }
  }

  // الـ worker مش متاح: برضه نجرّب المتدفّق الأول — أخفّ بكتير على الذاكرة من
  // القارئ العادي مع المحافظ اللي فيها مدى وهمي ضخم.
  try {
    const streamed = await readAllSheetsRawStream(new Uint8Array(buf));
    if (streamed.some((s) => s.aoa.length > 0)) return streamed;
  } catch { /* مش xlsx أو بنية غريبة — نكمل على القارئ العادي */ }

  return readAllSheetsRawSync(new Uint8Array(buf));
}

/**
 * نفس المنطق على الـ main thread — احتياطي لو الـ worker مش متاح.
 * dense + قصّ المدى الوهمي: محافظ زي «البنك العربي» بتسجّل !ref لغاية صف
 * ٩٩٨ ألف وفيها ١٥٠٠ صف بس — من غير ده الصفحة بتتجمّد والتطبيق بيقفل.
 */
function readAllSheetsRawSync(data: Uint8Array): { name: string; aoa: unknown[][]; hidden?: boolean }[] {
  const opts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false };
  (opts as Record<string, unknown>).dense = true;
  const wb = XLSX.read(data, opts);
  const hidden = hiddenFlags(wb);
  return wb.SheetNames.map((name, i) => {
    const ws = wb.Sheets[name];
    trimSheetToData(ws);
    return {
      name,
      hidden: hidden[i],
      aoa: XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1, raw: false, defval: "",
      }),
    };
  });
}

export async function readAllSheets(
  file: File
): Promise<{ sheetName: string; headers: string[]; rows: Record<string, string>[] }[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", raw: false, cellStyles: false });
  const out: { sheetName: string; headers: string[]; rows: Record<string, string>[] }[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    trimSheetToData(ws);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false, defval: "" });
    if (!rows.length) continue;
    const headers = Object.keys(rows[0] ?? {});
    out.push({ sheetName: name, headers, rows });
  }
  return out;
}

const PLATE_DETECT_KWS = ["لوحة", "اللوحة", "plate"];

function _cellLooksLikePlate(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-_.ـ/]/g, "");
  if (cleaned.length < 2 || cleaned.length > 10) return false;
  const digitMatch = cleaned.match(/[0-9٠-٩]+/);
  if (!digitMatch || digitMatch[0].length < 3 || digitMatch[0].length > 4) return false;
  const nonDigits = cleaned.replace(/[0-9٠-٩]/g, "");
  return nonDigits.length > 0 && nonDigits.length <= 3 && /^[؀-ۿa-zA-Z]+$/.test(nonDigits);
}

// يعدّ اللوحات الفعلية في أفضل عمود للورقة (عدد مش نسبة) — الورقة صاحبة أكبر
// عدد لوحات تكسب، عشان ملف بورقات كتير يشتغل على أكبر داتا فيها.
function _sheetPlateCount(data: Uint8Array, sheetName: string, password?: string): number {
  try {
    const opts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [sheetName] };
    (opts as Record<string, unknown>).dense = true;
    if (password) (opts as Record<string, unknown>).password = password;
    const wb = XLSX.read(data, opts);
    const ws = wb.Sheets[sheetName];
    if (!ws) return 0;
    trimSheetToData(ws);

    const raw2d = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null });
    return _plateCountInAoa(raw2d);
  } catch { return 0; }
}

/**
 * عدد اللوحات الفعلية في أفضل عمود بالورقة — بيحدد أنهي ورقة نفرز عليها في
 * الملفات متعددة الورقات. مشترك بين القارئ العادي والمتدفّق.
 */
function _plateCountInAoa(raw2d: unknown[][]): number {
  if (raw2d.length < 2) return 0;

  const numCols = Math.max(...(raw2d.slice(0, 5) as unknown[][]).map((r) => (r as unknown[])?.length ?? 0), 0);
  const sampleN = Math.min(raw2d.length, 201);

  let bestCol = -1, bestRatio = 0;
  for (let col = 0; col < numCols; col++) {
    let plateLike = 0, nonEmpty = 0;
    for (let i = 1; i < sampleN; i++) {
      const raw = String((raw2d[i] as unknown[])?.[col] ?? "").trim();
      if (!raw) continue;
      nonEmpty++;
      if (_cellLooksLikePlate(raw)) plateLike++;
    }
    if (nonEmpty === 0) continue;
    const ratio = plateLike / nonEmpty;
    if (ratio > bestRatio) { bestRatio = ratio; bestCol = col; }
  }
  if (bestCol < 0 || bestRatio < 0.3) return 0;

  let count = 0;
  for (let i = 1; i < raw2d.length; i++) {
    const raw = String((raw2d[i] as unknown[])?.[bestCol] ?? "").trim();
    if (raw && _cellLooksLikePlate(raw)) count++;
  }
  return count;
}

/**
 * قراءة الملف بالقارئ المتدفّق وبناء الجدول — نفس منطق اختيار الورقة وبناء
 * الصفوف بتاع القارئ العادي بالظبط (`buildTableFromAoa`)، بس الصفوف بتيجي من
 * مرور SAX واحد بدل ما SheetJS يبني مليون صف فاضي في الذاكرة.
 *
 * محفظة «البنك العربي» مثال حقيقي: ورقتها مسجّلة لغاية صف ٩٩٨,٨٣٦ وفيها ١٦٧٤
 * لوحة بس → القارئ العادي ٧٨٣ ميجا ذاكرة و٧.٧ ثانية، والمتدفّق جزء صغير من ده.
 */
export async function parseExcelStream(data: Uint8Array): Promise<ExcelTable> {
  // raw: القيم زي ما هي + التواريخ ككائن Date — عشان cellToStr تنسّقها
  // dd/mm/yyyy وتطلع نفس ناتج القارئ العادي بالحرف.
  const sheets = await readAllSheetsRawStream(data, { raw: true });
  // الورقات المخفية (state="hidden") مابنختارش منها تلقائياً — المحافظ بتيجي
  // فيها ورقة عمل مخفية جنب ورقة المطلوبين. لو كلها مخفية بناخدها عادي.
  const visible = sheets.filter((s) => !s.hidden && s.aoa.length > 0);
  const withRows = visible.length > 0 ? visible : sheets.filter((s) => s.aoa.length > 0);
  if (withRows.length === 0) throw new Error("empty");
  const allSheetNames = sheets.map((s) => s.name);

  let chosen = withRows[0];
  if (withRows.length > 1) {
    // نفس ترتيب القارئ العادي: أكبر عدد لوحات فعلية، وإلا أول ورقة فيها عمود
    // اسمه لوحة، وإلا الأولى.
    let bestCount = 0, bestSheet: typeof chosen | null = null;
    for (const s of withRows) {
      const count = _plateCountInAoa(s.aoa);
      if (count > bestCount) { bestCount = count; bestSheet = s; }
    }
    if (bestSheet) chosen = bestSheet;
    else {
      const kw = withRows.find((s) =>
        s.aoa.slice(0, 20).some((row) =>
          (row as unknown[]).some((c) => {
            const v = String(c ?? "").trim().toLowerCase();
            return PLATE_DETECT_KWS.some((k) => v.includes(k));
          })
        )
      );
      if (kw) chosen = kw;
    }
  }
  return buildTableFromAoa(chosen.aoa, chosen.name, allSheetNames);
}

// يبقى احتياطي قديم لو فشل اكتشاف المحتوى تماماً (ملفات غريبة الشكل)
function _sheetHasPlateCol(data: Uint8Array, sheetName: string, password?: string): boolean {
  try {
    const opts: XLSX.ParsingOptions = { type: "array", raw: false, cellStyles: false, sheets: [sheetName] };
    (opts as Record<string, unknown>).dense = true;
    if (password) (opts as Record<string, unknown>).password = password;
    const wb = XLSX.read(data, opts);
    const ws = wb.Sheets[sheetName];
    if (!ws) return false;
    trimSheetToData(ws);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false });
    return rows.slice(0, 20).some((row) =>
      (row as unknown[]).some((c) => {
        const v = String(c ?? "").trim().toLowerCase();
        return PLATE_DETECT_KWS.some((k) => v.includes(k));
      })
    );
  } catch { return false; }
}

// خلية → نص. خلايا التاريخ (مع cellDates:true) بتيجي Date → نفرمتها dd/mm/yyyy
// بدل الرقم التسلسلي بتاع Excel (45877). أي قيمة تانية بتفضل زي ما هي.
function cellToStr(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${v.getFullYear()}`;
  }
  return String(v);
}

function _parseExcelSync(data: Uint8Array, password?: string): ExcelTable {
  let sheetName: string | undefined;
  let allSheetNames: string[] = [];
  try {
    const wbMeta = XLSX.read(data, { type: "array", bookSheets: true });
    allSheetNames = wbMeta.SheetNames;
  } catch { /* password-protected */ }

  // Multi-sheet detection: score every sheet by plate-like content and pick
  // the highest. Falls back to keyword header check if no sheet scores >= 0.3.
  if (allSheetNames.length > 1) {
    let bestCount = 0;
    let bestName: string | undefined;
    for (const name of allSheetNames) {
      const count = _sheetPlateCount(data, name, password);
      if (count > bestCount) { bestCount = count; bestName = name; }
    }
    if (bestCount > 0) {
      sheetName = bestName;
    } else {
      for (const name of allSheetNames) {
        if (_sheetHasPlateCol(data, name, password)) { sheetName = name; break; }
      }
      if (!sheetName && bestName) sheetName = bestName;
    }
  }
  sheetName = sheetName ?? allSheetNames[0];

  const opts: XLSX.ParsingOptions = {
    type: "array",
    raw: true,
    cellDates: true, // خلايا التاريخ تيجي Date (مش رقم تسلسلي) — نفرمتها في cellToStr
    cellStyles: false,
    sheetStubs: false,
  };
  // dense mode — faster & far lower memory on huge sheets (see xlsxWorker.ts).
  (opts as Record<string, unknown>).dense = true;
  if (password) (opts as Record<string, unknown>).password = password;
  if (sheetName) (opts as Record<string, unknown>).sheets = [sheetName];

  try {
    const wb = XLSX.read(data, opts);
    const finalSheet = sheetName ?? wb.SheetNames[0];
    const ws = wb.Sheets[finalSheet];

    // قصّ المدى الوهمي قبل أي تحويل لصفوف (شوف lib/xlsxRange.ts)
    trimSheetToData(ws);

    // خلايا =HYPERLINK("url","خريطة") → قيمتها تبقى الرابط عشان يتعرض كـ«خريطة» لينك
    resolveHyperlinkCells(ws);

    const raw2d = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
    });
    return buildTableFromAoa(raw2d, finalSheet, allSheetNames);
  } catch (err) {
    if (err instanceof Error && err.message === "empty") {
      throw new Error("الملف فارغ أو لا يحتوي على بيانات.");
    }
    throw new Error("تعذّرت قراءة الملف — قد يكون محمياً بكلمة مرور.");
  }
}

/**
 * يبني ExcelTable من صفوف خام (AOA) — كشف صف العناوين، والشيتات بلا عناوين،
 * وبناء الصفوف. مشترك بين القارئ العادي (SheetJS) والقارئ المتدفّق، فالاتنين
 * بيدّوا نفس النتيجة بالظبط لنفس الصفوف.
 */
export function buildTableFromAoa(
  raw2d: unknown[][],
  sheetName: string | undefined,
  allSheetNames: string[],
  opts: { keepUnnamedColumns?: boolean } = {},
): ExcelTable {
  {
    if (raw2d.length === 0) throw new Error("empty");

    // Find the actual header row — skip email/instruction rows above the data table.
    // Pass 1 (exact): row with a known plate column name. Pass 2 (keyword): short cells.
    const EXACT_PLATE_COLS = [
      "plate number",
      "the plate number in arabic",
      "رقم اللوحة",
      "رقم اللوحة عربي",
    ];
    const PLATE_KWS = ["لوحة", "اللوحة", "لوحه", "plate"];
    const SCAN = Math.min(raw2d.length, 600);

    let headerRowIdx = -1;

    // Pass 1: exact match — limited to first 50 rows so a late embedded section
    // (e.g. a second table at row 339) doesn't override the real data start.
    const HDR_SCAN = Math.min(raw2d.length, 50);
    for (let ri = 0; ri < HDR_SCAN; ri++) {
      const cells = raw2d[ri] as unknown[];
      const hasExact = cells.some((c) =>
        EXACT_PLATE_COLS.includes(String(c ?? "").trim().toLowerCase())
      );
      if (hasExact) { headerRowIdx = ri; break; }
    }

    // Pass 2: keyword scoring + dense fallback — both limited to first 50 rows.
    // Scanning beyond the first section risks picking a late embedded table's
    // header (e.g. row 339) and discarding all earlier data rows.
    if (headerRowIdx < 0) {
      let bestKwRow = -1, bestKwScore = 0, bestKwNonEmpty = -1;
      let bestDenseRow = 0, bestDenseCount = 0;
      const DENSE_SCAN = Math.min(raw2d.length, 50);
      for (let ri = 0; ri < DENSE_SCAN; ri++) {
        const cells = raw2d[ri] as unknown[];
        const nonEmpty = cells.filter((c) => String(c ?? "").trim()).length;
        if (nonEmpty > bestDenseCount) { bestDenseCount = nonEmpty; bestDenseRow = ri; }
        let kwScore = 0;
        for (const c of cells) {
          const v = String(c ?? "").trim();
          if (v.length > 0 && v.length < 50 && PLATE_KWS.some((k) => v.toLowerCase().includes(k))) {
            kwScore++;
          }
        }
        if (kwScore > bestKwScore || (kwScore > 0 && kwScore === bestKwScore && nonEmpty > bestKwNonEmpty)) {
          bestKwScore = kwScore; bestKwNonEmpty = nonEmpty; bestKwRow = ri;
        }
      }
      headerRowIdx = (bestKwRow >= 0 && bestKwScore > 0) ? bestKwRow : bestDenseRow;
    }

    // Map each non-empty header to its ACTUAL column position so that empty
    // header columns (merged cells, gaps) don't cause value misalignment.
    // cellToStr (مش String) عشان خلايا التاريخ (Date من cellDates) تتنسّق dd/mm/yyyy
    // فالكاشف detectHeaderless يشوفها زي البنّاء بالظبط (اتساق كاشف/بنّاء).
    const rawHeaderCells = (raw2d[headerRowIdx] as unknown[]).map((h) => cellToStr(h).trim());

    // شيت بدون صف عناوين (الصف المرشّح داتا مش عناوين): نسمّي الأعمدة بالمحتوى
    // (لوحة/تاريخ/حي/GPS) ونعتبر الصف ده داتا — عشان أول لوحة ماتضيعش والتاريخ/
    // الحي يظهروا بأسماء واضحة في الفرز. غير كده: منطق العناوين العادي (اسم-based).
    let headerCols: Array<{ name: string; col: number }>;
    let dataStartRow: number;
    if (detectHeaderless(rawHeaderCells)) {
      headerCols = buildHeaderlessColumns(raw2d as unknown[][], headerRowIdx, cellToStr);
      dataStartRow = headerRowIdx; // الصف ده داتا مش عناوين
    } else {
      headerCols = [];
      rawHeaderCells.forEach((name, col) => { if (name) headerCols.push({ name, col }); });
      dataStartRow = headerRowIdx + 1;

      // شيت التفريغ بيحط **رابط الخريطة في عمود بلا عنوان**، والرمي الافتراضي
      // كان بيضيّعه قبل ما يوصل لجدول ربط الأعمدة — فسيارات المندوب الجديدة
      // كانت تطلع في الفرز بلا خريطة. لما الصفحة تطلب، بنحتفظ بالعمود ده باسم
      // واضح («عمود C») عشان الأدمن يربطه بإيده.
      //
      // بس **اللي فيه داتا بس** — العمود الفاضي (من دمج خلايا أو فراغ) بيفضل
      // مرمي زي ما كان، عشان مانزحمش الجدول بأعمدة مالهاش لازمة.
      if (opts.keepUnnamedColumns) {
        const named = new Set(headerCols.map((h) => h.col));
        const width = raw2d.reduce((m, r) => Math.max(m, (r as unknown[]).length), 0);
        for (let col = 0; col < width; col++) {
          if (named.has(col)) continue;
          let hasData = false;
          for (let i = dataStartRow; i < raw2d.length && !hasData; i++) {
            if (cellToStr((raw2d[i] as unknown[])[col]).trim()) hasData = true;
          }
          if (hasData) headerCols.push({ name: `عمود ${XLSX.utils.encode_col(col)}`, col });
        }
        headerCols.sort((a, b) => a.col - b.col);
      }
    }
    const headers = headerCols.map((hc) => hc.name);
    if (headers.length === 0) throw new Error("empty");

    const rows: Record<string, string>[] = [];
    for (let i = dataStartRow; i < raw2d.length; i++) {
      const r = raw2d[i] as unknown[];
      const obj: Record<string, string> = {};
      for (const { name, col } of headerCols) {
        obj[name] = cellToStr(r[col]);
      }
      rows.push(obj);
    }

    if (rows.length === 0) throw new Error("empty");
    // اسم الورقة المختارة + كل الورقات — زي مسار الـWorker بالظبط (عشان اسم
    // الورقة وأزرار تبديل الورقة تشتغل برضه لما الـWorker مش متاح).
    return { headers, rows, sheetName, allSheetNames };
  }
}

export interface WatermarkInfo {
  username: string;
  userId: string;
}

/**
 * Excel blob for VERY large tables (the merged data file — half a million rows).
 *
 * buildExcelBlob walks every cell looking for URLs to turn into hyperlinks;
 * at 1.9M cells that allocation storm runs out of memory (measured: OOM even
 * with a 6GB heap). This writes straight through instead — 6s and ~480MB on
 * the real 481k-row file — and pins the column order so a row missing a key
 * cannot shift the sheet.
 */
export function buildBigExcelBlob(
  rows: Record<string, unknown>[],
  headerOrder: string[],
  sheetName: string,
): Blob {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headerOrder });
  const wb = XLSX.utils.book_new();
  setWorkbookRtl(wb);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function buildExcelBlob(
  rows: Record<string, unknown>[],
  sheetName: string,
  watermark?: WatermarkInfo
): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);

  // Make URL cells proper hyperlinks — روابط الخرائط تظهر ككلمة «خريطة»
  const ref = ws["!ref"];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (cell && typeof cell.v === "string" && /^https?:\/\//i.test(cell.v)) {
          const raw = cell.v;
          // رابط خرائط نظيف (q=lat,lng بدون & — ماينكسرش بترميز HTML)، وإلا نفكّ
          // &amp; المزدوج/الثلاثي على الأقل عشان الرابط يفضل شغّال.
          const clean = gpsCellToLink(raw) || raw.replace(/&(?:amp;)+/gi, "&");
          // نص الخانة = الرابط نفسه (مش كلمة «خريطة»). المندوب بينسخ الصف
          // ويبعته على واتساب — والـhyperlink مابيتنسخش مع النص، فلو الخانة
          // مكتوب فيها «خريطة» بيوصل للمستقبِل كلمة مش رابط. كده النسخ بياخد
          // الرابط، ولسه قابل للدوس جوّه إكسيل عادي.
          cell.l = { Target: clean };
          cell.v = clean; cell.w = clean;
        }
      }
    }
  }

  // عمود الروابط بيتضيّق — الرابط جوّه الخانة كامل (للنسخ) بس معروض صغير.
  const headerNames = rows.length > 0 ? Object.keys(rows[0]) : [];
  const cols: XLSX.ColInfo[] = [];
  let anyLinkCol = false;
  headerNames.forEach((h, i) => {
    if (isLinkColumn(h, rows)) { cols[i] = { wch: LINK_COL_WIDTH }; anyLinkCol = true; }
  });
  if (anyLinkCol) ws["!cols"] = cols;

  const wb = XLSX.utils.book_new();
  // المحتوى عربي واللوحات عربية → افتح الورقة من اليمين لليسار (RTL).
  setWorkbookRtl(wb);

  if (watermark) {
    const stamp = `🔒 صدّر هذا الملف: ${watermark.username} (${watermark.userId}) — ${new Date().toLocaleString("ar-SA")}`;
    wb.Props = {
      ...(wb.Props ?? {}),
      Company: stamp,
      Comments: stamp,
    };
    XLSX.utils.sheet_add_aoa(ws, [[stamp]], { origin: -1 });
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Pure-JS CSV builder — no SheetJS write path at all, so it can't hit the
// "null.indexOf" crash that XLSX.write throws inside some Android WebViews.
// UTF-8 BOM (﻿) makes Excel read the Arabic text correctly, and Excel
// opens .csv natively into columns. Used as a guaranteed fallback when the
// xlsx build fails on-device.
export function buildCsvBlob(
  rows: Record<string, unknown>[],
  // Pin the column order when the caller knows it (a huge merged data file must
  // not shift columns because one row happens to be missing a key).
  headerOrder?: string[],
): Blob {
  const headers = headerOrder ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote if it contains a comma, quote, or newline; double interior quotes.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

// Builds the spreadsheet as a real .xlsx, but if XLSX.write throws (a known
// SheetJS failure inside some Android WebViews — "null.indexOf"), falls back
// to a plain CSV that opens in Excel just the same. Returns the extension so
// the caller can name the file correctly.
export function buildSpreadsheetBlob(
  rows: Record<string, unknown>[],
  sheetName: string,
): { blob: Blob; ext: "xlsx" | "csv" } {
  try {
    return { blob: buildExcelBlob(rows, sheetName), ext: "xlsx" };
  } catch {
    return { blob: buildCsvBlob(rows), ext: "csv" };
  }
}

export function downloadExcelBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// A native call failing for a REAL reason (FileProvider misconfigured, no
// app installed to open .xlsx, plugin not registered in this APK build) must
// never be confused with "this isn't a native platform" — both used to funnel
// into the same catch-and-ignore, silently falling through to a download
// mechanism (<a download>) that doesn't work inside a Capacitor WebView
// either, so the user saw the button do literally nothing with no way for
// anyone to know why. Callers must catch this and show the real message.
export class NativeExportError extends Error {
  constructor(action: string, cause: unknown) {
    super(`${action}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "NativeExportError";
  }
}

// Android's cache dir + FileProvider + FileOpener/Share chain is unreliable
// with non-ASCII filenames (the default export name is Arabic, e.g.
// "اكسيل-05-07-2026.xlsx", and audio shares use the Arabic plate as the
// name) — the content:// URI can come back unusable and the open/share
// silently no-ops or errors. The temp file in Cache is throwaway, so give it
// an ASCII-safe name for the write while callers keep the human-readable
// Arabic name for the web-download path (browsers handle Arabic names fine).
export function toSafeCacheFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const rawExt = dot > 0 ? filename.slice(dot + 1) : "";
  const rawBase = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "") || "dat";
  const base =
    rawBase
      .replace(/[^a-zA-Z0-9._-]+/g, "-") // Arabic / spaces / punctuation → dash
      .replace(/-{2,}/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "file";
  return `${base}.${ext}`;
}

// The MIME type must match the ACTUAL file, not always xlsx — the export now
// falls back to .csv on devices where xlsx-building fails, and telling the
// opener a .csv is an xlsx makes the spreadsheet app report it as corrupt.
export function contentTypeForFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "csv") return "text/csv";
  if (ext === "xls") return "application/vnd.ms-excel";
  // الحالة الرسمية للحروف (macroEnabled بـ E كبيرة) — أندرويد وبعض التطبيقات
  // بيقارنوا النوع حرف بحرف.
  if (ext === "xlsb") return "application/vnd.ms-excel.sheet.binary.macroEnabled.12";
  if (ext === "xlsm") return "application/vnd.ms-excel.sheet.macroEnabled.12";
  if (ext === "ods") return "application/vnd.oasis.opendocument.spreadsheet";
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

// Converting a large Blob to base64 one byte at a time (`binary += String.
// fromCharCode(bytes[i])`) runs millions of individual string-concat ops on
// the main thread for a big export (e.g. a sort result with thousands of
// rows) and freezes the whole app for the duration. Encoding in 32KB chunks
// with String.fromCharCode.apply cuts that to a handful of calls instead —
// same output, no more freeze. (32KB keeps well clear of the engine's
// max-arguments limit for Function.apply.)
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    // نمرّر الـsubarray مباشرة لـapply (array-like) بدل Array.from — دي كانت
    // بتعمل نسخة ٣٢ ألف عنصر لكل دفعة، وشيلها بيخلّي التحويل أسرع ~٧ مرات.
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + CHUNK) as unknown as number[]
    );
  }
  return btoa(binary);
}

/**
 * تحويل ملف لـbase64 **من غير ما يجمّد الشاشة**.
 *
 * ليه: التصدير/المشاركة على الموبايل كانوا بيحوّلوا الملف كله يدوياً على الخيط
 * الرئيسي — بيبني نص أكبر من الملف بـ٣٣٪ حرف حرف، فالواجهة بتتجمّد تماماً
 * (والمندوب يفتكر البرنامج واقف). FileReader بيعمل نفس التحويل في **كود أصلي**
 * خارج الخيط الرئيسي، فالشاشة تفضل تتحرك مهما كبر الملف.
 *
 * لو FileReader مش متاح (بيئة قديمة/اختبارات) بيرجع للطريقة اليدوية — نفس الناتج.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = String(reader.result ?? "");
          const comma = s.indexOf(",");            // "data:<mime>;base64,XXXX"
          resolve(comma >= 0 ? s.slice(comma + 1) : "");
        };
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(blob);
      });
    } catch { /* نكمّل بالطريقة الاحتياطية */ }
  }
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export async function openExcelBlob(blob: Blob, filename: string): Promise<"opened" | "downloaded"> {
  blob = await rtlAlignBlob(blob, filename);   // يفتح من اليمين + كل الخلايا محاذاة يمين
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { FileOpener } = await import("@capacitor-community/file-opener");

      // تحويل غير محجوب — الشاشة مابتتجمّدش مهما كبرت السجلات.
      const base64 = await blobToBase64(blob);

      const safeName = toSafeCacheFilename(filename);
      const { uri } = await Filesystem.writeFile({
        path: safeName,
        data: base64,
        directory: Directory.Cache,
      });

      await FileOpener.open({
        filePath: uri,
        contentType: contentTypeForFilename(safeName),
      });
      return "opened";
    } catch (err) {
      throw new NativeExportError("تعذّر فتح ملف Excel", err);
    }
  }

  // Web fallback: download normally
  downloadExcelBlob(blob, filename);
  return "downloaded";
}

export async function shareExcelBlob(blob: Blob, filename: string, title: string): Promise<void> {
  blob = await rtlAlignBlob(blob, filename);   // يفتح من اليمين + كل الخلايا محاذاة يمين
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      // تحويل غير محجوب — الشاشة مابتتجمّدش مهما كبرت السجلات.
      const base64 = await blobToBase64(blob);

      const { uri } = await Filesystem.writeFile({
        path: toSafeCacheFilename(filename),
        data: base64,
        directory: Directory.Cache,
      });

      await Share.share({ title, url: uri, dialogTitle: title });
      return;
    } catch (err: any) {
      if (err?.name === "AbortError" || /cancel/i.test(err?.message ?? "")) return; // user dismissed the share sheet
      throw new NativeExportError("تعذّرت مشاركة ملف Excel", err);
    }
  }

  // Web fallback: Web Share API with file, then download
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch { /* user cancelled or not supported */ }
  }
  downloadExcelBlob(blob, filename);
}

/**
 * Build a styled, RTL Excel blob for sort results.
 * Requires exceljs (supports cell fill colors + rightToLeft sheet view).
 */
export async function buildColoredSortExcel(
  rows: Record<string, unknown>[],
  sheetName: string,
  rowHexColors: (string | null)[],
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

  if (rows.length === 0) {
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const headers = Object.keys(rows[0]);

  // Header row
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  // Data rows
  rows.forEach((row, i) => {
    const values = headers.map((h) => {
      const v = row[h];
      return v !== null && v !== undefined ? String(v) : "";
    });
    const excelRow = ws.addRow(values);
    const hex = rowHexColors[i];
    if (hex) {
      const argb = "FF" + hex.replace("#", "");
      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
      });
    }
    // Hyperlinks for URL cells — روابط الخرائط تظهر ككلمة «خريطة»
    headers.forEach((h, ci) => {
      const v = row[h];
      if (typeof v === "string" && /^https?:\/\//i.test(v)) {
        const cell = excelRow.getCell(ci + 1);
        // رابط الوجهة لازم يكون نضيف — لو اتكتب بـ&amp;amp; (ترميز HTML مزدوج) Excel
        // بيفتح رابط بلا destination فمايوديش لخرايط جوجل. ننضّفه زي buildExcelBlob.
        const link = gpsCellToLink(v) || v.replace(/&(?:amp;)+/gi, "&");
        // النص = الرابط نفسه مش كلمة «خريطة» — عشان لما المندوب ينسخ الصف
        // ويبعته على واتساب يوصل رابط قابل للدوس (الـhyperlink مابيتنسخش).
        cell.value = { text: link, hyperlink: link } as ExcelJS.CellHyperlinkValue;
        cell.font = { color: { argb: "FF0563C1" }, underline: true };
      }
    });
  });

  // Column widths — عمود الروابط بيتضيّق (القيمة جوّاه الرابط كامل عشان النسخ،
  // بس العرض المعروض صغير عشان الشيت مايطلعش وحش).
  headers.forEach((h, ci) => {
    if (isLinkColumn(h, rows)) { ws.getColumn(ci + 1).width = LINK_COL_WIDTH; return; }
    let maxLen = h.length;
    rows.forEach((row) => { const v = String(row[h] ?? ""); if (v.length > maxLen) maxLen = v.length; });
    ws.getColumn(ci + 1).width = Math.min(Math.max(maxLen + 2, 10), 55);
  });

  // محاذاة كل الخلايا لليمين + ترتيب قراءة عربي (RTL) — المحتوى عربي فالنص لازم
  // يتحاذى يمين والعمود يُقرأ من اليمين. (views: rightToLeft بيقلب ترتيب الأعمدة،
  // وده بيحاذي نص الخلايا نفسها.)
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { ...(cell.alignment ?? {}), horizontal: "right", vertical: "middle", readingOrder: "rtl" };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function buildRowSummaryText(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => {
      let v = String(value);
      // خلايا GPS/الروابط: بعض ملفات الإكسيل بتخزّنها بـ & مشفّرة (&amp;amp;) —
      // ننضّفها لرابط خرائط قابل للفتح (بإحداثيات لو موجودة، وإلا نفكّ الترميز).
      if (/^https?:\/\//i.test(v.trim()) || /&amp;/i.test(v)) {
        const clean = gpsCellToLink(v);
        if (clean) v = clean;
        else while (/&amp;/i.test(v)) v = v.replace(/&amp;/gi, "&");
      }
      return `${label}: ${v}`;
    })
    .join("\n");
}

export async function shareOrCopyText(text: string): Promise<"shared" | "copied"> {
  const nav = navigator as any;
  if (nav.share) {
    try {
      await nav.share({ text });
      return "shared";
    } catch {
    }
  }
  await navigator.clipboard.writeText(text);
  return "copied";
}

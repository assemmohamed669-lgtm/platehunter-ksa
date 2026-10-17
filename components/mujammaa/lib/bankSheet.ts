/**
 * ==========================================================================
 *  شيت البنك — اللوحات المطلوبة
 * ==========================================================================
 *
 *  المندوب بيرفع شيت Excel من البنك فيه اللوحات المطلوبة وتفاصيل كل سيارة.
 *  التطبيق بيبني منه فهرس، وبعدها أي لوحة تتنطق في أي صفحة من الصفحتين
 *  بتتقارن عليه فوراً. لو فيه تطابق:
 *     - يطلع صوت تنبيه واضح
 *     - تظهر السيارة بكل تفاصيلها اللي في الشيت جنب اللوحة
 *
 *  الفهرس Map عشان البحث يكون O(1) — لو الشيت فيه ٥٠ ألف لوحة
 *  المطابقة بتفضل فورية بلا أي تأخير محسوس.
 */

import * as XLSX from "xlsx";
import { anyPlateToNormalized, levenshteinWithin } from "./plateMatch";
import { lookupKey } from "./textNormalize";

export type BankRow = Record<string, string>;

export interface BankSheet {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: BankRow[];
  /** اسم عمود اللوحة اللي اكتشفناه */
  plateColumn: string;
  /** لوحة مطبّعة → الصف */
  index: Map<string, BankRow>;
  /** كل اللوحات المطبّعة — بتستخدم كمفردات مقفولة في المراجعة */
  plates: string[];
  /** صفوف ما عرفناش نقرأ لوحتها */
  skipped: number;
}

/* ================================================ اكتشاف عمود اللوحة */

/** أسماء أعمدة اللوحة المتوقّعة (عربي وإنجليزي) */
const PLATE_HEADER_HINTS = [
  "رقم اللوحة",
  "رقماللوحة",
  "اللوحة",
  "لوحة",
  "رقم اللوحه",
  "اللوحه",
  "لوحه",
  "رقم لوحة",
  "plate",
  "plate number",
  "plateno",
  "plate no",
  "licenseplate",
  "license plate",
];

const NORMALIZED_HINTS = PLATE_HEADER_HINTS.map((h) =>
  lookupKey(h).replace(/\s+/g, "").toLowerCase()
);

/** شكل خلية اللوحة: حروف عربية + أرقام، أو حروف لاتينية + أرقام */
function looksLikePlate(value: string): boolean {
  const v = String(value || "").trim();
  if (!v) return false;
  const normalized = anyPlateToNormalized(v);
  return /^[ء-ي]{2,4}\d{1,4}$/.test(normalized);
}

/**
 * يكتشف عمود اللوحة بطريقتين، والاسم أقوى من المحتوى:
 *   ١. اسم العمود فيه كلمة «لوحة» أو plate
 *   ٢. لو مافيش، نشوف أي عمود أغلب خلاياه شكلها لوحة
 */
export function detectPlateColumn(headers: string[], rows: BankRow[]): string {
  // ١. بالاسم
  for (const h of headers) {
    const key = lookupKey(h).replace(/\s+/g, "").toLowerCase();
    if (NORMALIZED_HINTS.some((hint) => key.includes(hint))) return h;
  }

  // ٢. بالمحتوى — نجرّب أول ٢٠٠ صف بس، كفاية للحكم
  const sample = rows.slice(0, 200);
  let bestHeader = "";
  let bestScore = 0;

  for (const h of headers) {
    let hits = 0;
    let seen = 0;
    for (const row of sample) {
      const v = row[h];
      if (!v) continue;
      seen++;
      if (looksLikePlate(v)) hits++;
    }
    if (seen === 0) continue;
    const score = hits / seen;
    if (score > bestScore) {
      bestScore = score;
      bestHeader = h;
    }
  }

  // نص الخلايا على الأقل لازم تكون لوحات عشان نعتبره عمود لوحة
  return bestScore >= 0.5 ? bestHeader : headers[0] ?? "";
}

/* ================================================== بناء الشيت */

/**
 * يبني كائن الشيت من صفوف جاهزة.
 * منفصلة عن قراءة الملف عشان نقدر نختبرها بلا Excel.
 */
export function buildBankSheet(
  headers: string[],
  rows: BankRow[],
  meta: { fileName: string; sheetName: string }
): BankSheet {
  const plateColumn = detectPlateColumn(headers, rows);
  const index = new Map<string, BankRow>();
  let skipped = 0;

  for (const row of rows) {
    const normalized = anyPlateToNormalized(row[plateColumn] ?? "");
    if (!normalized) {
      skipped++;
      continue;
    }
    // أول ظهور يكسب — زي سلوك ملفات الإحالة الحقيقية
    if (!index.has(normalized)) index.set(normalized, row);
  }

  return {
    fileName: meta.fileName,
    sheetName: meta.sheetName,
    headers,
    rows,
    plateColumn,
    index,
    plates: [...index.keys()],
    skipped,
  };
}

/** أسماء ورقات بنرجّحها **عند التساوي بس** */
const PREFERRED_SHEET_NAMES = ["تشييك", "تشيك", "إحالة", "احالة", "المطلوب"];

/**
 * الورقة اللي فيها لوحات أكتر — والاسم مرجّح عند التساوي بس.
 *
 * 🔴 ليه القاعدة اتغيّرت (باج حقيقي، ٢٠٢٦/٨/١٤، ملف «تشييك العــربـــي»):
 * القاعدة القديمة كانت «فضّل ورقة اسمها تشييك». وفي الملف الحقيقي ورقة
 * «تشييك» هي **ورقة العمل اليومية** — ٣٨٣٢ صف وفيها **٣ لوحات** بس،
 * والداتا الحقيقية (**٥١٤٣١ لوحة**) في ورقة اسمها «العربي».
 *
 * فالبرنامج كان بياخد الفاضية، وتنبيه «مطلوبة» عمره ما يرن — والمندوب
 * يفوّت عربية وهو شايف إن كل حاجة تمام. **الاسم رأي، والعدد حقيقة.**
 */
export function pickPlateSheet(
  sheets: Record<string, Array<Record<string, unknown>>>
): string {
  const names = Object.keys(sheets);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];

  let best = "";
  let bestCount = -1;
  for (const name of names) {
    const rows = sheets[name] ?? [];
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0] ?? {});
    const col = detectPlateColumn(
      headers,
      rows.map((r) => {
        const o: BankRow = {};
        for (const h of headers) o[h] = String(r[h] ?? "").trim();
        return o;
      })
    );
    let count = 0;
    for (const r of rows) if (anyPlateToNormalized(String(r[col] ?? ""))) count++;

    const isPreferred = PREFERRED_SHEET_NAMES.some((p) =>
      lookupKey(name).includes(lookupKey(p))
    );
    // الأكبر يكسب · والاسم المفضّل يكسب عند التساوي
    if (count > bestCount || (count === bestCount && isPreferred)) {
      best = name;
      bestCount = count;
    }
  }
  return best || names[0];
}

/** يقرأ ملف Excel/CSV ويبني الشيت */
export async function parseBankSheetFile(file: File): Promise<BankSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  if (workbook.SheetNames.length === 0) {
    throw new Error("الملف مافيهوش ورقات — تأكد إنه ملف Excel صحيح");
  }

  // كل الورقات، والمختارة هي اللي فيها لوحات أكتر (شوف ‎pickPlateSheet‎)
  const all: Record<string, Array<Record<string, unknown>>> = {};
  for (const n of workbook.SheetNames) {
    all[n] = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[n],
      { defval: "", raw: false }
    );
  }
  const sheetName = pickPlateSheet(all);

  // اتقرأت خلاص فوق — مافيش داعي نقراها تاني
  const json = all[sheetName] ?? [];

  if (json.length === 0) {
    throw new Error(`ورقة «${sheetName}» فاضية`);
  }

  const headers = Object.keys(json[0]);
  const rows: BankRow[] = json.map((r) => {
    const out: BankRow = {};
    for (const h of headers) out[h] = String(r[h] ?? "").trim();
    return out;
  });

  return buildBankSheet(headers, rows, { fileName: file.name, sheetName });
}

/* ================================================== المطابقة */

/**
 * ⛔ **التطابق التقريبي اتشال — «مطلوبة» = تطابق كامل بس** (٢٠٢٦/٨/١٥)
 * ══════════════════════════════════════════════════════════════════
 *
 * كان فيه حد تشابه ٨٥٪ (= فرق خانة واحدة في لوحة ٧ خانات)، ومنطقه كان:
 * «أشهر غلط في التفريغ هو خانة واحدة، فمانرميش اللوحة عشان خانة».
 *
 * وقرار المالك بعد تقارير أربع مناديب: **يتشال**. والسبب من الميدان:
 *
 *  • في جلسة واحدة (مندوب د) ظهرت «قريبة ٨٦٪» **٦ مرات**، وكل اللوحات
 *    كانت **صح ١٠٠٪** ومش في الشيت — والبرنامج بيعرض عليها تفاصيل عربية
 *    تانية (سورينتو · سيلفرادو · أمجراند). تشويش خالص.
 *  • وأخطر: مع الشدّ للشيت، «ا0007» (حرف واحد!) اتحوّلت لـ«لا0007» وظهرت
 *    **«مطلوبة»** — لوحة مخترعة بعلامة يقين.
 *
 * ⚠️ **التمن معروف ومقبول**: لو التفريغ غلط في خانة، اللوحة المطلوبة
 * مابيرنّش عليها تنبيه وتعدّي. بدّلنا **إنذار كاذب** بـ**فرصة ضايعة** —
 * والقاعدة الحاكمة عند المالك: «الأهم إنه ميطلعش غلط».
 *
 * ومحصّن بـ‎wantedExact.test.ts‎.
 */
export interface BankMatch {
  kind: "exact" | "none";
  /** الصف من الشيت لو فيه تطابق */
  row?: BankRow;
  /** اللوحة اللي في الشيت */
  matchedPlate?: string;
  /** نسبة التشابه — ١٠٠ للتطابق و٠ لغيره */
  similarity: number;
}

/**
 * يبحث عن اللوحة في الشيت — **بحث مباشر بس**.
 *
 * بحث في الـ Map: فوري بلا أي لفّة، حتى على شيت ٥١ ألف لوحة. (البحث
 * التقريبي القديم كان بيلف على الشيت كله مع كل نتيجة مؤقتة.)
 */
export function matchInBankSheet(
  sheet: BankSheet | null,
  plate: string
): BankMatch {
  if (!sheet) return { kind: "none", similarity: 0 };

  const target = anyPlateToNormalized(plate);
  if (!target) return { kind: "none", similarity: 0 };

  const exact = sheet.index.get(target);
  if (exact) {
    return { kind: "exact", row: exact, matchedPlate: target, similarity: 100 };
  }
  return { kind: "none", similarity: 0 };
}

/* ============================================ تفاصيل السيارة للعرض */

export interface DetailField {
  label: string;
  value: string;
}

/**
 * يجهّز تفاصيل السيارة للعرض جنب اللوحة.
 * بنشيل عمود اللوحة نفسه (لأنه معروض أصلاً) وأي خانة فاضية.
 */
export function rowDetails(
  row: BankRow | undefined,
  plateColumn: string
): DetailField[] {
  if (!row) return [];
  const out: DetailField[] = [];
  for (const [label, value] of Object.entries(row)) {
    if (label === plateColumn) continue;
    const v = String(value ?? "").trim();
    if (!v) continue;
    out.push({ label, value: v });
  }
  return out;
}

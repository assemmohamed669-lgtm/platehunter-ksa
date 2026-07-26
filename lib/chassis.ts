/**
 * منطق «تشييك بالشاص» (رقم الهيكل) — دوال نقية قابلة للاختبار.
 *
 * الفكرة: نطابق رقم الشاص (مكتوب أو مقروء من صورة) مع **عمود الشاص في ملف
 * التشييك** — مش عمود اللوحات. ملف التشييك ممكن يكون فيه أكتر من ورقة، فبنختار
 * الورقة اللي عمود الشاص فيها قيم أكتر (pickBestChassisSource).
 *
 * المطابقة: تامة (مسافة 0) = مؤكّد، أو تقريبية (خانة–خانتين فرق) = تحذير.
 */
import { levenshtein, similarityPercent, detectPlateColumn } from "./plateParser";

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/**
 * تطبيع رقم الشاص للمطابقة: أرقام عربية→إنجليزية، تكبير الحروف، وإزالة الفواصل
 * (فراغ/شرطة/شرطة سفلية/نقطة/سلاش/تطويل). بيسيب الحروف والأرقام زي ما هي.
 */
export function normalizeChassis(s: string): string {
  if (!s || typeof s !== "string") return "";
  let out = "";
  for (const ch of s) {
    if (AR_DIGITS[ch]) { out += AR_DIGITS[ch]; continue; }
    // فواصل شائعة تُحذف — الشاص بيتكتب بأشكال مختلفة (بشرطة/بمسافة/بدونها)
    if (/[\s\-_.ـ/\\]/.test(ch)) continue;
    out += ch;
  }
  return out.toUpperCase();
}

/** هل اسم العمود ده عمود «رقم شاص»؟ («نوع الهيكل» = نوع بدن، مش شاص — نستبعده.) */
function isChassisHeaderName(h: string): boolean {
  const n = (h || "").toLowerCase().replace(/[\sـ]/g, ""); // إزالة الفراغات + التطويل
  if (!n) return false;
  if (n.includes("نوع")) return false; // «نوع الهيكل» = نوع البدن (ونيت/صالون)
  return /chassis|vin|شاص|شاسي|هيكل/.test(n);
}

/** هل قيمة الخلية شكلها رقم شاص؟ (طويل ≥ 8، فيه أرقام + حروف). */
function chassisLike(v: string): boolean {
  const n = normalizeChassis(v);
  return n.length >= 8 && /[0-9]/.test(n) && /[A-Z؀-ۿ]/.test(n);
}

function countChassisLike(rows: Record<string, string>[], col: string): number {
  let c = 0;
  for (const r of rows) if (chassisLike(String(r[col] ?? ""))) c++;
  return c;
}

/**
 * يكتشف عمود الشاص في ورقة. الأولوية للاسم (رقم الهيكل/Chassis/VIN)، وبعدين
 * المحتوى (عمود قيمه شكلها شاص). بيرجّع null لو مافيش.
 */
export function detectChassisColumn(headers: string[], rows?: Record<string, string>[]): string | null {
  const named = headers.filter(isChassisHeaderName);
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    if (rows && rows.length > 0) {
      let best = named[0], bestC = -1;
      for (const h of named) {
        const c = countChassisLike(rows, h);
        if (c > bestC) { bestC = c; best = h; }
      }
      return best;
    }
    return named[0];
  }
  // بدون اسم واضح — كشف بالمحتوى (لازم إشارة كافية عشان ما نختارش عمود عشوائي)
  if (rows && rows.length > 0) {
    let best: string | null = null, bestC = 0;
    for (const h of headers) {
      const c = countChassisLike(rows, h);
      if (c > bestC) { bestC = c; best = h; }
    }
    if (best && bestC >= Math.min(3, rows.length)) return best;
  }
  return null;
}

export interface SheetTable {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ChassisSource {
  sheetName: string;
  chassisCol: string;
  /** عمود اللوحة في نفس الورقة (لو موجود) — عشان نعرض لوحة السيارة عند التطابق. */
  plateCol: string | null;
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * من بين أوراق ملف التشييك، يختار الورقة اللي عمود الشاص فيها **قيم أكتر**.
 * بيرجّع null لو مافيش أي ورقة فيها عمود شاص.
 */
export function pickBestChassisSource(sheets: SheetTable[]): ChassisSource | null {
  let best: ChassisSource | null = null;
  let bestCount = 0;
  for (const s of sheets) {
    const col = detectChassisColumn(s.headers, s.rows);
    if (!col) continue;
    const count = countNonEmptyChassis(s.rows, col);
    if (count > bestCount) {
      bestCount = count;
      best = {
        sheetName: s.sheetName,
        chassisCol: col,
        plateCol: detectPlateColumn(s.headers, s.rows),
        headers: s.headers,
        rows: s.rows,
      };
    }
  }
  return best;
}

function countNonEmptyChassis(rows: Record<string, string>[], col: string): number {
  let c = 0;
  for (const r of rows) if (normalizeChassis(String(r[col] ?? ""))) c++;
  return c;
}

/** يبني فهرس شاص مطبّع → صف. أول ظهور يكسب (زي فهرس اللوحات). */
export function buildChassisIndex(
  rows: Record<string, string>[],
  chassisCol: string,
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const key = normalizeChassis(String(row[chassisCol] ?? ""));
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

export interface ChassisMatch {
  found: boolean;
  matchType?: "exact" | "fuzzy";
  similarity?: number;
  distance?: number;
  chassis: string; // المدخل بعد التطبيع
  row?: Record<string, string>;
}

/**
 * يطابق رقم شاص مع الفهرس: تامة (مسافة 0) أو تقريبية (خانة–خانتين). أكتر من كده
 * = مش موجود (سيارة تانية).
 */
export function matchChassisInIndex(
  index: Map<string, Record<string, string>>,
  raw: string,
): ChassisMatch {
  const chassis = normalizeChassis(raw);
  if (!chassis) return { found: false, chassis: "" };

  const exact = index.get(chassis);
  if (exact) return { found: true, matchType: "exact", chassis, row: exact };

  // تقريبية: أقرب مفتاح بمسافة تحرير ≤ 2 (والشاص لازم يكون طوله معقول عشان
  // ما نطابقش نصوص قصيرة بالغلط).
  if (chassis.length >= 6) {
    let bestKey = "", bestDist = Infinity;
    let bestRow: Record<string, string> | undefined;
    for (const [key, row] of index) {
      const d = levenshtein(chassis, key);
      if (d < bestDist) { bestDist = d; bestKey = key; bestRow = row; }
      if (bestDist === 1) break; // أقل مسافة ممكنة بعد استبعاد التامة (0)
    }
    if (bestRow && bestDist >= 1 && bestDist <= 2) {
      return {
        found: true,
        matchType: "fuzzy",
        distance: bestDist,
        similarity: similarityPercent(chassis, bestKey),
        chassis,
        row: bestRow,
      };
    }
  }
  return { found: false, chassis };
}

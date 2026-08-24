/**
 * Chassis / VIN matching for the camera "شاصي" mode.
 *
 * The agent photographs the VIN (رقم الهيكل) etched on the windshield; we read
 * it and look it up in the chassis column of the loaded check file — the same
 * مطلوب/غير مطلوب flow the plate camera uses, just against the VIN column.
 *
 * VINs are ASCII (A–Z, 0–9): uppercase, no spaces. المطابقة **تامة فقط**
 * (بعد التطبيع: uppercase + شيل أي حرف غير أبجدي-رقمي). التطبيق كان بيعمل
 * تقريب/مطابقة جزئية بآخر الأرقام، وده كان بيطلّع تطابقات **كاذبة** بين أرقام
 * هيكل مختلفة بتشترك في آخر كام رقم (مثلاً L10DA4299L0103256 مع
 * LFP82APE2N1D03256 لاشتراكهما في «03256») — فاتشالت، والهيكل بيتطابق تام بس.
 */

export function normalizeChassis(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// "شاص" (بدون ي) بيغطّي: رقم الشاص / الشاص / شاص / شاصي (كلها بتحتوي "شاص").
const CHASSIS_NAME_HINTS = ["هيكل", "شاص", "شاسيه", "شاسي", "chassis", "vin", "serial"];

/** True when a value looks like a VIN/chassis: 11–17 chars, letters AND digits. */
function looksLikeVin(v: string): boolean {
  const n = normalizeChassis(v);
  return n.length >= 11 && n.length <= 17 && /[A-Z]/.test(n) && /[0-9]/.test(n);
}

/**
 * Find the chassis column — by header name first (Arabic/English variants),
 * then by content (a column whose values are mostly VIN-shaped) so unnamed or
 * oddly-labelled sheets still work.
 */
export function detectChassisColumn(
  headers: string[],
  rows?: Record<string, string>[]
): string | null {
  for (const h of headers) {
    const low = h.toLowerCase();
    if (CHASSIS_NAME_HINTS.some((hint) => low.includes(hint))) return h;
  }
  if (rows && rows.length) {
    let best: string | null = null;
    let bestScore = 0;
    for (const h of headers) {
      let hits = 0, seen = 0;
      for (const row of rows.slice(0, 40)) {
        const v = String(row[h] ?? "").trim();
        if (!v) continue;
        seen++;
        if (looksLikeVin(v)) hits++;
      }
      const score = seen ? hits / seen : 0;
      if (score > bestScore && score >= 0.6) { bestScore = score; best = h; }
    }
    return best;
  }
  return null;
}

export function buildChassisIndex(
  rows: Record<string, string>[],
  col: string
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const key = normalizeChassis(String(row[col] ?? ""));
    if (key) map.set(key, row);
  }
  return map;
}

export interface ChassisMatch {
  found: boolean;
  matchType?: "exact" | "fuzzy" | "partial";
  similarity?: number;
  normalized: string;
  row?: Record<string, string>;
}

/**
 * مطابقة رقم الهيكل **تامة فقط** — بعد التطبيع (uppercase + شيل غير الأبجدي-رقمي)
 * لازم الرقمين يبقوا متطابقين حرفاً بحرف. مفيش تقريب ولا مطابقة بآخر الأرقام،
 * عشان أرقام هيكل مختلفة متطلعش «مطلوب» غلط لمجرد تشابه آخر كام رقم.
 */
export function matchChassis(
  rawVin: string,
  index: Map<string, Record<string, string>>
): ChassisMatch {
  const normalized = normalizeChassis(rawVin);
  if (!normalized) return { found: false, normalized: "" };

  const exact = index.get(normalized);
  if (exact) return { found: true, matchType: "exact", normalized, row: exact };

  return { found: false, normalized };
}

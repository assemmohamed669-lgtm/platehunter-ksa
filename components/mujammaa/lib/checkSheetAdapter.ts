/**
 * ==========================================================================
 *  🧮 ملف التشييك بتاع قناص ⇐ «شيت البنك» بتاع صفحة المجمّع
 * ==========================================================================
 *
 *  في المعمل الصفحة ليها شيت بنك بترفعه لوحدها. في قناص **ملف التشييك واحد**
 *  للتطبيق كله (`local:check` + `check-2..N`)، وبيترفع ويتمسح من صفحة التشييك بس
 *  — صفحة «التسجيل» بتقراه بس. فالمجمّع بياخده هو، **بقواعد التطبيق**:
 *   · كل ملف بعمود لوحته (`detectPlateColumn` بالاسم وبعدين بالمحتوى)
 *   · الإنجليزي البنكي بيتحوّل (`bankPlateToArabic` — أرقام قبل الحروف = الحروف بتتعكس)
 *   · `normalizePlate` (أ/إ ⇒ ا، الأصفار في الأول بتتكمّل لـ٤)
 *   · الأول بيكسب، والتطابق **تام بس**
 *  والشكل الراجع هو `BankSheet` بتاع المعمل بالظبط ⇒ الجدول والتصدير ماتغيّروش.
 */
import { bankPlateToArabic, detectPlateColumn, normalizePlate } from "@/lib/plateParser";
import type { BankMatch, BankRow, BankSheet } from "./bankSheet";

export interface CheckSourceLike {
  headers: string[];
  rows: Record<string, string>[];
}

function appKey(raw: string): string {
  return normalizePlate(bankPlateToArabic(String(raw ?? "")));
}

export function buildCheckBankSheet(sources: CheckSourceLike[], fileName: string): BankSheet | null {
  const index = new Map<string, BankRow>();
  let first: { headers: string[]; col: string; rows: number } | null = null;
  let skipped = 0;
  for (const src of sources ?? []) {
    if (!src || !src.headers?.length || !src.rows?.length) continue;
    const col = detectPlateColumn(src.headers, src.rows);
    if (!col) continue;
    if (!first) first = { headers: src.headers, col, rows: src.rows.length };
    for (const row of src.rows) {
      const k = appKey(String(row[col] ?? ""));
      if (!k) {
        skipped++;
        continue;
      }
      if (!index.has(k)) index.set(k, row as BankRow);
    }
  }
  if (!first || index.size === 0) return null;
  return {
    fileName,
    sheetName: "ملف التشييك",
    headers: first.headers,
    rows: [...index.values()],
    plateColumn: first.col,
    index,
    plates: [...index.keys()],
    skipped,
  };
}

/** بديل `matchInBankSheet` بتطبيع التطبيق — تام أو لا */
export function matchInCheckSheet(sheet: BankSheet | null, plate: string): BankMatch {
  if (!sheet) return { kind: "none", similarity: 0 };
  const target = appKey(plate);
  if (!target) return { kind: "none", similarity: 0 };
  const row = sheet.index.get(target);
  return row
    ? { kind: "exact", row, matchedPlate: target, similarity: 100 }
    : { kind: "none", similarity: 0 };
}

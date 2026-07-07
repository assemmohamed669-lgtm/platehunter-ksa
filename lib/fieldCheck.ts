/**
 * fieldCheck.ts — pure helpers for the field-check sheet (dedupe + search).
 * Kept separate from idb.ts so the logic is unit-testable without IndexedDB.
 */

import { normalizePlate, bankPlateToArabic } from "./plateParser";
import type { FieldCheckEntry } from "./idb";

/** Normalized comparison key for a plate (spaces stripped, alef unified, EN→AR). */
export function plateKey(raw: string): string {
  return normalizePlate(bankPlateToArabic(String(raw ?? "")));
}

/** The existing sheet entry for this plate, if any (ignores spaces/alef/EN-AR). */
export function findDuplicateEntry(
  entries: FieldCheckEntry[],
  plate: string
): FieldCheckEntry | undefined {
  const key = plateKey(plate);
  if (!key) return undefined;
  return entries.find((e) => plateKey(e.plate) === key);
}

/** True when the entry matches a free-text query (plate / method / any column). */
export function entryMatchesQuery(entry: FieldCheckEntry, query: string): boolean {
  const raw = query.trim();
  if (!raw) return true;
  const q = raw.toLowerCase();

  const qKey = plateKey(raw);
  if (qKey && plateKey(entry.plate).includes(qKey)) return true;
  if (entry.method.toLowerCase().includes(q)) return true;
  for (const v of Object.values(entry.row)) {
    if (String(v ?? "").toLowerCase().includes(q)) return true;
  }
  return false;
}

/** Filter the sheet by a free-text query (returns all when blank). */
export function filterFieldEntries(entries: FieldCheckEntry[], query: string): FieldCheckEntry[] {
  if (!query.trim()) return entries;
  return entries.filter((e) => entryMatchesQuery(e, query));
}

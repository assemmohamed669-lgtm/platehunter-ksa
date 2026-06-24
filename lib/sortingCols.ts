// Preferred columns to auto-select in sort results — matched against actual uploaded file headers
export const PREFERRED_COLS = [
  // Brand / Manufacturer
  "الماركة", "ماركة", "ماركه",
  "طراز", "طراز المركبة",
  "صانع", "صانع المركبة",
  "Vehicle", "Vehicle Name",
  // GPS / Location link
  "GPS", "جي بي اس", "الموقع",
  // Vehicle type
  "النوع", "نوع السيارة", "نوع المركبة",
  // District
  "الحي", "حي",
  // Color
  "لون السيارة", "اللون", "لون",
  // Year
  "سنة الصنع", "السنة", "سنة", "موديل", "Year Model",
];

export function matchesPreferred(header: string): boolean {
  const h = header.trim();
  return PREFERRED_COLS.some((p) => h === p || h.includes(p) || p.includes(h));
}

export function guessDefaultColumns(headers: string[], exclude?: string | null): string[] {
  const filtered = headers.filter((h) => h !== exclude);
  const preferred = filtered.filter(matchesPreferred);
  return preferred.length > 0 ? preferred : filtered;
}

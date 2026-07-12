// Preferred columns to auto-select in sort results — matched against actual
// uploaded file headers. Matching is case-insensitive (see matchesPreferred),
// so English headers like "COLOR"/"Color"/"color" all hit.
export const PREFERRED_COLS = [
  // Brand / Manufacturer / Model
  "الماركة", "ماركة", "ماركه",
  "طراز", "طراز المركبة",
  "صانع", "صانع المركبة",
  "Vehicle", "Vehicle Name", "Make", "Manufacturer", "Model", "Brand",
  // GPS / Location link
  "GPS", "جي بي اس", "الموقع",
  // Vehicle type
  "النوع", "نوع السيارة", "نوع المركبة", "TYPE OF CAR", "Type of Car", "Car Type",
  // District
  "الحي", "حي",
  // Color
  "لون السيارة", "اللون", "لون", "COLOR", "Color", "لون المركبة", "لون المركبة الأساسي",
  // Year
  "سنة الصنع", "السنة", "سنة", "موديل", "Year Model", "Year",
];

// Columns that must always appear in results — user cannot hide them (🔒).
// GPS + الحي + الشارع تظهر تلقائياً مع كل نتيجة فرز ولا يمكن إخفاؤها.
export const MANDATORY_COLS = [
  // Street / Address
  "الشارع", "شارع", "العنوان", "عنوان",
  // GPS / Location link
  "GPS", "جي بي اس", "الموقع",
  // District
  "الحي", "حي",
];

export function isMandatory(header: string): boolean {
  const h = header.trim().toLowerCase();
  return MANDATORY_COLS.some((m) => {
    const mm = m.toLowerCase();
    return h === mm || h.includes(mm) || mm.includes(h);
  });
}

export function matchesPreferred(header: string): boolean {
  const h = header.trim().toLowerCase();
  if (!h) return false;
  return PREFERRED_COLS.some((p) => {
    const pp = p.toLowerCase();
    return h === pp || h.includes(pp) || pp.includes(h);
  });
}

export function guessDefaultColumns(headers: string[], exclude?: string | null): string[] {
  const filtered = headers.filter((h) => h !== exclude);
  const preferred = filtered.filter(matchesPreferred);
  return preferred.length > 0 ? preferred : filtered;
}

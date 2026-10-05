/**
 * 📄 «شهايد النهارده» في صفحة المطلوب — صف النتيجة (منطق نقي).
 *
 * المالك (٥ أكتوبر ٢٠٢٦): كل عربية من شهايد النهارده لقيناها في الداتا أو السجلات بتطلع ببيانات
 * الشهادة (البنك/الشاص/المصنع والطراز/السنة/اللون/حالة العقد/تاريخ الشهادة) + مكانها من الداتا أو
 * السجلات + زرار الشهادة، وفي الآخر «الحالة»: «اللي في شيت التشييك يتكتب قدامها مطلوبه واللي مش
 * في شيت التشييك يتكتب قدامها تثبيت».
 */
import type { WantedRow } from "@/components/WantedResultsTable";
import { dedupeDailyCerts, type DailyCertEntry } from "./certDaily";

/** لوحة (مطبّعة) ⇒ شهادتها — نفس الشهادة من كذا شركة مرة واحدة. */
export function indexDailyCerts(entries: readonly DailyCertEntry[]): Map<string, DailyCertEntry> {
  const m = new Map<string, DailyCertEntry>();
  for (const e of dedupeDailyCerts(entries)) if (e.plate) m.set(e.plate, e);
  return m;
}

/** مكان العربية من الداتا أو السجلات (من غير بيانات الشهادة). */
export type PlaceRow = Pick<WantedRow, "id" | "plate" | "norm" | "address" | "mapsLink" | "date">
  & Partial<Pick<WantedRow, "district" | "lat" | "lng" | "dataIdx" | "type" | "brand" | "color" | "year">>;

/** صف النتيجة: بيانات الشهادة الأول (ولو ناقصة من الداتا)، والحالة من شيت التشييك. */
export function certResultRow(place: PlaceRow, cert: DailyCertEntry, inCheck: boolean): WantedRow {
  return {
    ...place,
    type: place.type ?? "",
    brand: [cert.make, cert.model].filter(Boolean).join(" ") || place.brand || "",
    bank: cert.bank,
    color: cert.color || place.color || "",
    year: cert.year || place.year || "",
    vin: cert.vin,
    contract: cert.status,
    certDate: cert.certDate,
    certFile: { id: cert.fileId, name: cert.name },
    wantedStatus: inCheck ? "مطلوبة" : "تثبيت",
  };
}

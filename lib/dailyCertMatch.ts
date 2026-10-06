/**
 * 📄 «شهايد النهارده» — صف النتيجة (منطق نقي).
 *
 * المالك (٥ أكتوبر ٢٠٢٦): كل عربية من شهايد النهارده لقيناها في الداتا أو السجلات بتطلع ببيانات
 * الشهادة + مكانها من الداتا أو السجلات + زرار الشهادة، و«الحالة»: «اللي في شيت التشييك يتكتب
 * قدامها مطلوبه واللي مش في شيت التشييك يتكتب قدامها تثبيت».
 * الأعمدة وترتيبها في `lib/certColumns.ts`: «النوع» من الداتا/السجلات، و«نوع المركبة» (راف فور/
 * توسان…) و«المؤجر» (البنك/الشركة) من الشهادة.
 */
import type { WantedRow } from "@/components/WantedResultsTable";
import { dedupeDailyCerts, type DailyCertEntry } from "./certDaily";
import { normalizeChassis } from "./chassis";
import { inferVehicleType } from "./wantedColumns";

/** لوحة (مطبّعة) ⇒ شهادتها — نفس الشهادة من كذا شركة مرة واحدة. */
export function indexDailyCerts(entries: readonly DailyCertEntry[]): Map<string, DailyCertEntry> {
  const m = new Map<string, DailyCertEntry>();
  for (const e of dedupeDailyCerts(entries)) if (e.plate) m.set(e.plate, e);
  return m;
}

/** رقم الشاص ⇒ شهادته (لسجلات الشاص — مافيهاش لوحة). */
export function indexDailyCertsByVin(entries: readonly DailyCertEntry[]): Map<string, DailyCertEntry> {
  const m = new Map<string, DailyCertEntry>();
  for (const e of dedupeDailyCerts(entries)) {
    const v = normalizeChassis(e.vin);
    if (v && !m.has(v)) m.set(v, e);
  }
  return m;
}

/** مكان العربية من الداتا أو السجلات (من غير بيانات الشهادة). */
export type PlaceRow = Pick<WantedRow, "id" | "plate" | "norm" | "address" | "mapsLink" | "date">
  & Partial<Pick<WantedRow, "district" | "lat" | "lng" | "dataIdx" | "srcIdx" | "dataRow" | "type" | "brand" | "color" | "year">>;

/** صف النتيجة: بيانات الشهادة الأول (ولو ناقصة من الداتا)، والحالة من شيت التشييك. */
export function certResultRow(place: PlaceRow, cert: DailyCertEntry, inCheck: boolean): WantedRow {
  const vehicleModel = cert.model || place.brand || cert.make || "";
  return {
    ...place,
    type: place.type || inferVehicleType(vehicleModel),
    vehicleModel,
    brand: cert.make || place.brand || "",
    bank: cert.bank,
    color: cert.color || place.color || "",
    year: cert.year || place.year || "",
    vin: cert.vin,
    contract: cert.status,
    certDate: cert.certDate,
    certFile: { id: cert.fileId, name: cert.name },
    certNo: cert.certNo ?? "",
    wantedStatus: inCheck ? "مطلوبة" : "تثبيت",
  };
}

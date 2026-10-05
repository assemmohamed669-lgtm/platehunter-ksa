/**
 * 📄 محرّك فرز «شهايد النهارده» — مشترك بين صفحة المطلوب وتبويب «شهايد» لمشتركين الصوت فقط.
 *
 * بيدوّر على لوحات شهايد النهارده في:
 *  ١) الداتا — كل مصدر بعمود لوحته. الملف اللي على الجهاز (كبير/متعدد الورقات) بيتقري **كله**
 *     دفعة دفعة؛ السجل المحفوظ له فيه عيّنة ٥٠ صف بس، وده اللي كان مخلّي الداتا الإضافية «مش
 *     بتتفرز» (المالك ٥ أكتوبر ٢٠٢٦).
 *  ٢) السجلات اللي اتصدّرت (يدوي/صوتي/صورة) باللوحة — ولو السجل مكتوب فيه رقم شاص بيتطابق بيه.
 *  ٣) سجلات الشاص — برقم الشاص اللي في الشهادة.
 * «الحالة»: مطلوبة لو اللوحة **أو** الشاص في أي ملف تشييك، غير كده تثبيت.
 * كل صف داتا معاه مصدره وموضعه والصف نفسه — «موقعها» بتتحقّق إنها على نفس العربية.
 */
import type { WantedRow } from "@/components/WantedResultsTable";
import type { FieldCheckEntry } from "./idb";
import type { ChassisRecord } from "./chassisRecords";
import type { DailyCertEntry } from "./certDaily";
import { indexDailyCerts, indexDailyCertsByVin, certResultRow, type PlaceRow } from "./dailyCertMatch";
import { normalizePlate, bankPlateToArabic } from "./plateParser";
import { normalizeChassis } from "./chassis";
import { resolveDataPlateCol } from "./dataSources";
import { resolveResultColumns } from "./resultColumns";
import { gpsCellCoords, gpsCellToLink, toMapsLink } from "./gps";

type Row = Record<string, string>;

/** مصدر داتا: في الذاكرة (صفوفه كاملة)، أو على الجهاز (بيتقري دفعات من `slot`). */
export type CertDataSource =
  | { kind: "mem"; headers: string[]; rows: Row[]; /** سلوته على الجهاز (`getUploadedFile("local", ref)`). */ ref?: string }
  | { kind: "stream"; slot: string; headers: string[]; sample: Row[]; plateCol: string | null };

export interface DailyCertSortInput {
  certs: readonly DailyCertEntry[];
  sources: readonly CertDataSource[];
  /** نفس `iterateRows` — `base` = موضع أول صف في الدفعة. */
  iterate(slot: string, onBatch: (rows: Row[], base: number) => void | Promise<void>): Promise<void>;
  fieldEntries: readonly FieldCheckEntry[];
  chassisRecords: readonly ChassisRecord[];
  /** لوحات كل ملفات التشييك (مطبّعة). */
  checkPlates: ReadonlySet<string>;
  /** أرقام الشاص في ملفات التشييك (`normalizeChassis`). */
  checkVins: ReadonlySet<string>;
  fmtDate(iso: string): string;
}

export interface DailyCertSortOutput {
  dataRows: WantedRow[];
  recordRows: WantedRow[];
  /** عمود اللوحة اللي اتفرز عليه كل مصدر (null = اتخطّى) — لـ«موقعها». */
  plateCols: (string | null)[];
}

function findGps(row: Row): { lat: number; lng: number } | null {
  for (const v of Object.values(row)) {
    const g = gpsCellCoords(String(v ?? ""));
    if (g) return g;
  }
  return null;
}

/** لوحة الشهادة بنفس شكل صفوف الداتا والسجلات. */
function certPlate(c: DailyCertEntry): string {
  return bankPlateToArabic(c.plateText || c.plate).trim() || c.plate;
}

/** شكله رقم شاص (١١–١٧ حرف وفيه حروف وأرقام) — اللوحة مابتعدّيش ده. */
function vinLike(v: string): boolean {
  return v.length >= 11 && v.length <= 17 && /[A-Z]/.test(v) && /[0-9]/.test(v);
}

export async function runDailyCertSort(input: DailyCertSortInput): Promise<DailyCertSortOutput> {
  const byPlate = indexDailyCerts(input.certs);
  const byVin = indexDailyCertsByVin(input.certs);
  const inCheck = (c: DailyCertEntry) =>
    (!!c.plate && input.checkPlates.has(c.plate)) || (!!c.vin && input.checkVins.has(normalizeChassis(c.vin)));

  // (١) الداتا
  const dataRows: WantedRow[] = [];
  const plateCols: (string | null)[] = [];
  let di = 0;
  // عمود أول ملف احتياطي للباقي (زي فرز المطلوب) — من غيره الملف اللي مالقيناش فيه دليل كان
  // بيتفرز على أول عمود فمايطلّعش حاجة.
  let baseDataCol: string | null = null;
  for (let si = 0; si < input.sources.length; si++) {
    const src = input.sources[si];
    const sample = src.kind === "mem" ? src.rows : src.sample;
    const dataCol: string | null = resolveDataPlateCol(src.headers, sample, baseDataCol) || (src.kind === "stream" ? src.plateCol : null);
    plateCols.push(dataCol);
    if (!dataCol) continue;
    baseDataCol ??= dataCol;
    const resolved = resolveResultColumns(src.headers, sample, dataCol);
    const col = (key: string) => resolved.find((c) => c.key === key)?.sourceCol ?? null;
    const typeSrc = col("type"), brandSrc = col("brand"), addrSrc = col("address"), distSrc = col("district");
    const gpsSrc = col("gps"), colorSrc = col("color"), yearSrc = col("year"), dateSrc = col("date");

    const fromRow = (row: Row, idx: number) => {
      const raw = String(row[dataCol] ?? "");
      const norm = normalizePlate(bankPlateToArabic(raw));
      const c = norm ? byPlate.get(norm) : undefined;
      if (!c) return;
      const val = (k: string | null) => (k ? String(row[k] ?? "").trim() : "");
      const rawGps = val(gpsSrc);
      let mapsLink = gpsCellToLink(rawGps);
      let coords = gpsCellCoords(rawGps);
      if (!mapsLink) {
        const g = findGps(row);
        if (g) { coords = g; mapsLink = toMapsLink(g.lat, g.lng); }
      }
      const place: PlaceRow = {
        id: `cd${di++}`, plate: bankPlateToArabic(raw).trim() || norm, norm,
        type: val(typeSrc), brand: val(brandSrc), address: val(addrSrc), district: val(distSrc),
        color: val(colorSrc), year: val(yearSrc), date: val(dateSrc), mapsLink, lat: coords?.lat, lng: coords?.lng,
        srcIdx: si, dataIdx: idx, dataRow: row,
      };
      dataRows.push(certResultRow(place, c, inCheck(c)));
    };

    if (src.kind === "mem") {
      src.rows.forEach((row, i) => fromRow(row, i));
    } else {
      await input.iterate(src.slot, async (batch, base) => {
        for (let k = 0; k < batch.length; k++) fromRow(batch[k], base + k);
        await new Promise<void>((r) => setTimeout(r, 0));   // مانجمّدش الشاشة
      });
    }
  }

  // (٢) السجلات اللي اتصدّرت — يدوي/صوتي/صورة
  const recordRows: WantedRow[] = [];
  let j = 0;
  for (const e of input.fieldEntries) {
    const norm = normalizePlate(bankPlateToArabic(e.plate));
    const asVin = normalizeChassis(e.plate);
    const c = (norm ? byPlate.get(norm) : undefined) ?? (vinLike(asVin) ? byVin.get(asVin) : undefined);
    if (!c) continue;
    // مكتوب فيه رقم شاص ⇒ اللوحة من الشهادة (بنفس شكل باقي الصفوف)
    const plate = c.plate && norm === c.plate ? bankPlateToArabic(e.plate).trim() || e.plate : certPlate(c) || e.plate;
    const place: PlaceRow = {
      id: `cr${j++}`, plate, norm: c.plate || asVin,
      type: (e.row?.["النوع"] || e.row?.["نوع السيارة"] || "").trim(),
      address: (e.row?.["الشارع"] || e.row?.["العنوان"] || "").trim(),
      district: (e.row?.["الحي"] || e.row?.["اسم الموقع"] || "").trim(),
      date: e.checkedAt ? input.fmtDate(e.checkedAt) : (e.row?.["التاريخ"] || e.row?.["تاريخ التسجيل"] || "").trim(),
      mapsLink: e.mapsLink || "", lat: e.lat, lng: e.lng,
    };
    recordRows.push(certResultRow(place, c, inCheck(c)));
  }

  // (٣) سجلات الشاص — برقم الشاص
  for (const rec of input.chassisRecords) {
    const vin = normalizeChassis(rec.chassis);
    const c = vin ? byVin.get(vin) : undefined;
    if (!c) continue;
    const mapsLink = rec.mapsLink || (rec.lat != null && rec.lng != null ? toMapsLink(rec.lat, rec.lng) : "");
    const place: PlaceRow = {
      id: `cc${j++}`, plate: certPlate(c) || rec.chassis, norm: c.plate || vin,
      type: (rec.vehicleType ?? "").trim(), address: (rec.region ?? "").trim(),
      date: input.fmtDate(rec.checkedAt), mapsLink, lat: rec.lat, lng: rec.lng,
    };
    recordRows.push(certResultRow(place, c, inCheck(c)));
  }

  return { dataRows, recordRows, plateCols };
}

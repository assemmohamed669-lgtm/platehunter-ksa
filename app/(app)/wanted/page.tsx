"use client";

/**
 * صفحة «المطلوب» — زر «فرز» يطابق شيت التشييك (المطلوبين) على شيت الداتا وشيت
 * السجلات (field_check)، ويطلّع ويندوين. أعمدة النتيجة ثابتة (رقم اللوحة/نوع/ماركة/
 * بنك-شركة/شارع/حي/ملاحظات/GPS) — بتتجمّع من الداتا + شيت التشييك (الماركة والبنك
 * منه). النتيجة بترتيب الداتا (مناطق تحت بعضها)، واللوحات المكررة كل واحدة بلون.
 * النتيجة بتتخزّن في الذاكرة فبتفضل ثابتة لو خرجت من الصفحة ورجعت.
 */
import { useEffect, useState } from "react";
import { Crosshair, Trash2, RefreshCw } from "lucide-react";
import WantedResultsTable, { type WantedRow } from "@/components/WantedResultsTable";
import ShareSortButton from "@/components/ShareSortButton";
import { getUploadedFile, getAllFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { gpsCellCoords, gpsCellToLink, toMapsLink } from "@/lib/gps";
import { buildColoredSortExcel } from "@/lib/excel";
import { resolveCheckColumns, inferVehicleType } from "@/lib/wantedColumns";
import { resolveResultColumns } from "@/lib/resultColumns";
import { detectLocationColumn, neighborsInSameLocation } from "@/lib/locationNeighbors";
import LocationNeighborsModal, { type NeighborsView } from "@/components/LocationNeighborsModal";

// كاش على مستوى الموديول — بيخلّي نتيجة الفرز ثابتة لو المندوب خرج من الصفحة ورجع.
let wantedCache: { dataRows: WantedRow[]; recordRows: WantedRow[]; sorted: boolean } | null = null;
// الداتا المرتّبة الكاملة + عمود الموقع/اللوحة — لميزة «موقعها» (جيران نفس الشارع).
let wantedNeighborData: { orderedData: Record<string, string>[]; locCol: string | null; plateCol: string; detailCols: string[] } | null = null;

function findGps(row: Record<string, string>): { lat: number; lng: number } | null {
  for (const v of Object.values(row)) {
    const g = gpsCellCoords(String(v ?? ""));
    if (g) return g;
  }
  return null;
}

// صفوف تصدير النافذة (نفس أعمدة النتيجة) — يُستخدم للإكسيل والصورة والمشاركة.
function toExportRows(rows: WantedRow[]): Record<string, unknown>[] {
  const hasBank = rows.some((r) => r.bank && r.bank.trim());
  const hasDistrict = rows.some((r) => r.district && r.district.trim());
  return rows.map((r) => ({
    "رقم اللوحة": r.plate, "نوع السيارة": r.type, "الماركة": r.brand,
    ...(hasBank ? { "البنك": r.bank ?? "" } : {}),
    "العنوان": r.address,
    ...(hasDistrict ? { "الحي": r.district ?? "" } : {}),
    "GPS": r.mapsLink, "اللون": r.color,
    "سنة الصنع": r.year, "تاريخ التسجيل": r.date,
  }));
}

// لون هيكس لكل لوحة مكررة (>1) بترتيب أول ظهور — نفس بالِتة الفرز، عشان الإكسيل
// الملوّن يطابق تلوين الجدول والصورة (اللوحات المتشابهة كل واحدة بلون).
const DUPE_HEX = ["#FEF9C3", "#DBEAFE", "#DCFCE7", "#F3E8FF", "#FFEDD5", "#FCE7F3", "#CCFBF1", "#FEE2E2"];
function dupeHexColors(rows: WantedRow[]): (string | null)[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.norm, (counts.get(r.norm) ?? 0) + 1);
  const colorByNorm = new Map<string, string>();
  let ci = 0;
  for (const r of rows) {
    if ((counts.get(r.norm) ?? 0) > 1 && !colorByNorm.has(r.norm)) {
      colorByNorm.set(r.norm, DUPE_HEX[ci % DUPE_HEX.length]); ci++;
    }
  }
  return rows.map((r) => colorByNorm.get(r.norm) ?? null);
}

// صورة جدول ملوّنة للنافذة (زي الفرز) — بدون عمود GPS (الرابط مالوش لازمة في صورة)،
// وكل لوحة مكررة بلون (rowColors = dupeHexColors).
function toImageTable(rows: WantedRow[]): { columns: string[]; rows: string[][]; rowColors?: (string | null)[] } {
  const hasBank = rows.some((r) => r.bank && r.bank.trim());
  const hasDistrict = rows.some((r) => r.district && r.district.trim());
  const columns = ["رقم اللوحة", "نوع السيارة", "الماركة", ...(hasBank ? ["البنك"] : []), "العنوان", ...(hasDistrict ? ["الحي"] : []), "اللون", "سنة الصنع", "تاريخ التسجيل"];
  const tableRows = rows.map((r) => [
    r.plate, r.type, r.brand, ...(hasBank ? [r.bank ?? ""] : []), r.address, ...(hasDistrict ? [r.district ?? ""] : []), r.color, r.year, r.date,
  ]);
  return { columns, rows: tableRows, rowColors: dupeHexColors(rows) };
}

export default function WantedPage() {
  const [sorting, setSorting] = useState(false);
  const [sorted, setSorted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataRows, setDataRows] = useState<WantedRow[]>([]);
  const [recordRows, setRecordRows] = useState<WantedRow[]>([]);
  const [neighborView, setNeighborView] = useState<NeighborsView | null>(null);

  // نافذة «موقعها» — جيران السيارة في نفس الشارع من ملف الداتا المرتّب.
  function showNeighbors(r: WantedRow) {
    const nd = wantedNeighborData;
    if (!nd) { alert("اعمل «فرز» الأول عشان نحدّد موقع السيارة."); return; }
    if (!nd.locCol) { alert("مفيش عمود «اسم الموقع/الشارع/الحي» في ملف الداتا عشان نعرض الجيران."); return; }
    let idx = (r.dataIdx != null && r.dataIdx >= 0 && r.dataIdx < nd.orderedData.length) ? r.dataIdx : -1;
    // احتياطي: نتايج قديمة (مفيش dataIdx) — ندوّر على أول صف داتا بنفس اللوحة.
    if (idx < 0 && r.norm) idx = nd.orderedData.findIndex((row) => normalizePlate(bankPlateToArabic(String(row[nd.plateCol] ?? ""))) === r.norm);
    if (idx < 0) { alert("تعذّر تحديد موقع السيارة في ملف الداتا. جرّب تعمل «فرز» من جديد."); return; }
    const ctx = neighborsInSameLocation(nd.orderedData, idx, nd.locCol);
    setNeighborView({ ...ctx, target: nd.orderedData[idx], plateCol: nd.plateCol, detailCols: nd.detailCols });
  }

  // استرجاع النتيجة المخزّنة عند العودة للصفحة.
  useEffect(() => {
    if (wantedCache) {
      setDataRows(wantedCache.dataRows);
      setRecordRows(wantedCache.recordRows);
      setSorted(wantedCache.sorted);
    }
  }, []);

  function persist(dRows: WantedRow[], rRows: WantedRow[], isSorted: boolean) {
    wantedCache = { dataRows: dRows, recordRows: rRows, sorted: isSorted };
  }

  async function runSort() {
    if (sorting) return;
    setSorting(true); setError(null);
    try {
      const [checkRec, dataRec, fieldEntries] = await Promise.all([
        getUploadedFile("local", "check"),
        getUploadedFile("local", "data"),
        getAllFieldCheckEntries().catch(() => [] as FieldCheckEntry[]),
      ]);
      // ملفات الداتا الإضافية (data-2, data-3...) — بتتدمج مع الأساسي في الفرز.
      const extraDataRecs: NonNullable<typeof dataRec>[] = [];
      for (let n = 2; n < 100; n++) {
        const rec = await getUploadedFile("local", `data-${n}`);
        if (!rec) break;
        extraDataRecs.push(rec);
      }
      const allDataRecs = [dataRec, ...extraDataRecs].filter(Boolean) as NonNullable<typeof dataRec>[];

      if (!checkRec) { setError("مفيش ملف تشييك (المطلوبين). ارفعه من صفحة التشييك الأول."); setSorting(false); return; }
      const checkCol = detectPlateColumn(checkRec.headers, checkRec.rows);
      if (!checkCol) { setError("مش لاقي عمود اللوحة في ملف التشييك."); setSorting(false); return; }

      // أعمدة الماركة / نوع السيارة / البنك من شيت التشييك.
      // ملاحظة: الموديل (النترا/بيكانتو...) بيتحسب «ماركة» حتى لو مكتوب في عمود «النوع»؛
      // و«نوع السيارة» بيتاخد من عمود نوع مستقل بس، وإلا بيتّستنتج من نص الماركة.
      const { brandCol, typeCol: checkTypeCol, bankCol } = resolveCheckColumns(checkRec.headers);
      // اللون/سنة الصنع من شيت التشييك (بالاسم أو بالمحتوى — resolveResultColumns).
      const checkResolved = resolveResultColumns(checkRec.headers, checkRec.rows, checkCol);
      const checkSrc = (key: string) => checkResolved.find((c) => c.key === key)?.sourceCol ?? null;
      const colorCheckCol = checkSrc("color");
      const yearCheckCol = checkSrc("year");

      // قائمة المطلوبين المطبّعة + صف كل لوحة (لجلب الماركة/البنك).
      const wanted = new Set<string>();
      const checkRowByNorm = new Map<string, Record<string, string>>();
      for (const r of checkRec.rows) {
        const norm = normalizePlate(bankPlateToArabic(String(r[checkCol] ?? "")));
        if (!norm) continue;
        wanted.add(norm);
        if (!checkRowByNorm.has(norm)) checkRowByNorm.set(norm, r);
      }
      const brandOf = (norm: string) => (brandCol ? String(checkRowByNorm.get(norm)?.[brandCol] ?? "").trim() : "");
      const bankOf = (norm: string) => (bankCol ? String(checkRowByNorm.get(norm)?.[bankCol] ?? "").trim() : "");
      const typeOfCheck = (norm: string) => (checkTypeCol ? String(checkRowByNorm.get(norm)?.[checkTypeCol] ?? "").trim() : "");
      const colorOf = (norm: string) => (colorCheckCol ? String(checkRowByNorm.get(norm)?.[colorCheckCol] ?? "").trim() : "");
      const yearOf = (norm: string) => (yearCheckCol ? String(checkRowByNorm.get(norm)?.[yearCheckCol] ?? "").trim() : "");

      // (١) مطابقة على كل ملفات الداتا (الأساسي + الإضافية) — بترتيب الملفات ثم
      // الداتا (مناطق تحت بعضها).
      const dRows: WantedRow[] = [];
      let di = 0;
      // قائمة الداتا المرتّبة كاملة (كل الصفوف) — لميزة «موقعها» (جيران نفس الشارع).
      // dataIdx على كل صف مطابق = موضعه هنا. عمود الموقع/اللوحة من أول ملف داتا.
      const orderedData: Record<string, string>[] = [];
      let neighborLocCol: string | null = null;
      let neighborPlateCol = "";
      let neighborDetailCols: string[] = [];
      for (const rec of allDataRecs) {
        const dataCol = detectPlateColumn(rec.headers, rec.rows);
        if (!dataCol) continue;
        if (!neighborPlateCol) {
          neighborPlateCol = dataCol;
          neighborLocCol = detectLocationColumn(rec.headers);
          // العمودان جنب اللوحة في نافذة «موقعها»: نوع السيارة ثم العنوان. لو مفيش
          // عمود عنوان صريح، نستخدم عمود الموقع نفسه (اللي فيه بيانات الموقع فعلاً).
          const t = rec.headers.find((h) => /نوع|طراز/i.test(h)) ?? rec.headers.find((h) => /ماركة|صانع|vehicle|model|make/i.test(h));
          const addr = rec.headers.find((h) => /العنوان|عنوان|الشارع|شارع|address|street/i.test(h)) ?? neighborLocCol ?? undefined;
          neighborDetailCols = [...new Set([t, addr].filter((h): h is string => !!h && h !== dataCol))];
        }
        // أعمدة الداتا بالمحتوى/الاسم (نوع/عنوان/حي/GPS/لون/سنة/تاريخ) — لكل ملف.
        const resolved = resolveResultColumns(rec.headers, rec.rows, dataCol);
        const srcOf = (key: string) => resolved.find((c) => c.key === key)?.sourceCol ?? null;
        const typeSrc = srcOf("type"), brandSrc = srcOf("brand"), addrSrc = srcOf("address"), distSrc = srcOf("district");
        const gpsSrc = srcOf("gps"), colorSrc = srcOf("color"), yearSrc = srcOf("year"), dateSrc = srcOf("date");
        for (const row of rec.rows) {
          const gIdx = orderedData.length;
          orderedData.push(row);
          const norm = normalizePlate(bankPlateToArabic(String(row[dataCol] ?? "")));
          if (!norm || !wanted.has(norm)) continue;
          const val = (s: string | null) => (s ? String(row[s] ?? "").trim() : "");
          // GPS من عمود الداتا زي ما هو (رابط/إحداثيات بأي صيغة)، وإلا نمسح باقي الأعمدة.
          const rawGps = val(gpsSrc);
          let mapsLink = gpsCellToLink(rawGps);
          let coords = gpsCellCoords(rawGps);
          if (!mapsLink) {
            const g = findGps(row);
            if (g) { coords = g; mapsLink = toMapsLink(g.lat, g.lng); }
          }
          const brand = brandOf(norm) || val(brandSrc);
          dRows.push({
            id: `d${di++}`,
            plate: bankPlateToArabic(String(row[dataCol] ?? "")).trim() || norm,
            norm,
            type: val(typeSrc) || typeOfCheck(norm) || inferVehicleType(brand),
            brand,
            bank: bankOf(norm),
            address: val(addrSrc),
            district: val(distSrc),
            color: colorOf(norm) || val(colorSrc),
            year: yearOf(norm) || val(yearSrc),
            date: val(dateSrc),
            mapsLink,
            lat: coords?.lat,
            lng: coords?.lng,
            dataIdx: gIdx,
          });
        }
      }
      wantedNeighborData = { orderedData, locCol: neighborLocCol, plateCol: neighborPlateCol, detailCols: neighborDetailCols };

      // (٢) مطابقة على شيت السجلات (field_check).
      const rRows: WantedRow[] = [];
      let j = 0;
      for (const e of fieldEntries) {
        const norm = normalizePlate(bankPlateToArabic(e.plate));
        if (!norm || !wanted.has(norm)) continue;
        const brand = brandOf(norm);
        const recType = (e.row?.["النوع"] || e.row?.["نوع السيارة"] || "").trim();
        // العنوان (الشارع) والحي عمودين منفصلين — زي نافذة الداتا بالظبط.
        const address = (e.row?.["الشارع"] || e.row?.["العنوان"] || "").trim();
        const district = (e.row?.["الحي"] || e.row?.["اسم الموقع"] || "").trim();
        rRows.push({
          id: `r${j++}`,
          plate: bankPlateToArabic(e.plate).trim() || e.plate,
          norm,
          type: recType || typeOfCheck(norm) || inferVehicleType(brand),
          brand,
          bank: bankOf(norm),
          address,
          district,
          color: colorOf(norm),
          year: yearOf(norm),
          date: (e.row?.["التاريخ"] || e.row?.["تاريخ التسجيل"] || "").trim(),
          mapsLink: e.mapsLink || "",
          lat: e.lat,
          lng: e.lng,
        });
      }

      setDataRows(dRows); setRecordRows(rRows); setSorted(true);
      persist(dRows, rRows, true);
    } catch (err) {
      setError(`تعذّر الفرز: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSorting(false);
    }
  }

  function deleteFromData(ids: string[]) {
    const s = new Set(ids);
    setDataRows((prev) => { const next = prev.filter((r) => !s.has(r.id)); persist(next, recordRows, true); return next; });
  }
  function deleteFromRecords(ids: string[]) {
    const s = new Set(ids);
    setRecordRows((prev) => { const next = prev.filter((r) => !s.has(r.id)); persist(dataRows, next, true); return next; });
  }

  function windowBlock(title: string, rows: WantedRow[], onDelete: (ids: string[]) => void, clearAll: () => void, onLocate?: (r: WantedRow) => void) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" dir="rtl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{title}</span>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">{rows.length} لوحة</span>
        </div>
        <WantedResultsTable rows={rows} onDelete={onDelete} onLocate={onLocate} />
        {rows.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            {/* زرّين تحت بعض: مشاركة النتيجة (قائمة: فتح إكسيل / واتساب / صورة) + مسح.
                الإكسيل ملوّن باللوحات المكررة (dupeHexColors) و RTL بمحاذاة يمين (buildColoredSortExcel). */}
            <ShareSortButton
              title={title}
              label="مشاركة النتيجة"
              rows={() => toExportRows(rows)}
              excelBlob={async () => ({ blob: await buildColoredSortExcel(toExportRows(rows), title, dupeHexColors(rows)), ext: "xlsx" })}
              imageTable={() => toImageTable(rows)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"
            />
            <button onClick={clearAll} className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/10 py-3 text-sm font-bold text-danger transition hover:bg-danger/20"><Trash2 size={15} /> مسح نتايج الفرز</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Crosshair size={20} className="text-danger" />
        <div>
          <h1 className="text-lg font-bold text-ink">المطلوب</h1>
          <p className="text-xs text-muted">فرز المطلوبين على الداتا والسجلات.</p>
        </div>
      </div>

      <button onClick={runSort} disabled={sorting}
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-50 active:scale-[0.99]">
        {sorting ? <RefreshCw size={16} className="animate-spin" /> : <Crosshair size={16} />}
        {sorting ? "جاري الفرز..." : "فرز المطلوبين"}
      </button>

      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger" dir="rtl">{error}</p>}

      {sorted && (
        <>
          {windowBlock("مطلوبين في الداتا", dataRows, deleteFromData, () => {
            if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${dataRows.length} لوحة من النافذة دي؟`)) return;
            setDataRows([]); persist([], recordRows, true);
          }, showNeighbors)}
          {windowBlock("مطلوبين في السجلات", recordRows, deleteFromRecords, () => {
            if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${recordRows.length} لوحة من النافذة دي؟`)) return;
            setRecordRows([]); persist(dataRows, [], true);
          })}
        </>
      )}

      <LocationNeighborsModal view={neighborView} onClose={() => setNeighborView(null)} />
    </div>
  );
}

"use client";

/**
 * صفحة «المطلوب» — زر «فرز» يطابق شيت التشييك (المطلوبين) على شيت الداتا وشيت
 * السجلات (field_check)، ويطلّع ويندوين. أعمدة النتيجة ثابتة (رقم اللوحة/نوع/ماركة/
 * بنك-شركة/شارع/حي/ملاحظات/GPS) — بتتجمّع من الداتا + شيت التشييك (الماركة والبنك
 * منه). النتيجة بترتيب الداتا (مناطق تحت بعضها)، واللوحات المكررة كل واحدة بلون.
 * النتيجة بتتخزّن في الذاكرة فبتفضل ثابتة لو خرجت من الصفحة ورجعت.
 */
import { useEffect, useState } from "react";
import { Crosshair, Share2, FileSpreadsheet, Trash2, RefreshCw } from "lucide-react";
import WantedResultsTable, { type WantedRow } from "@/components/WantedResultsTable";
import { getUploadedFile, getAllFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { parseLatLngCell, toMapsLink } from "@/lib/gps";
import { buildSpreadsheetBlob, shareExcelBlob } from "@/lib/excel";

// كاش على مستوى الموديول — بيخلّي نتيجة الفرز ثابتة لو المندوب خرج من الصفحة ورجع.
let wantedCache: { dataRows: WantedRow[]; recordRows: WantedRow[]; sorted: boolean } | null = null;

function findHeader(headers: string[], keywords: string[]): string | null {
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (keywords.some((k) => h.includes(k) || hl.includes(k.toLowerCase()))) return h;
  }
  return null;
}
function findGps(row: Record<string, string>): { lat: number; lng: number } | null {
  for (const v of Object.values(row)) {
    const g = parseLatLngCell(String(v ?? ""));
    if (g) return g;
  }
  return null;
}

export default function WantedPage() {
  const [sorting, setSorting] = useState(false);
  const [sorted, setSorted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataRows, setDataRows] = useState<WantedRow[]>([]);
  const [recordRows, setRecordRows] = useState<WantedRow[]>([]);

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

      if (!checkRec) { setError("مفيش ملف تشييك (المطلوبين). ارفعه من صفحة التشييك الأول."); setSorting(false); return; }
      const checkCol = detectPlateColumn(checkRec.headers, checkRec.rows);
      if (!checkCol) { setError("مش لاقي عمود اللوحة في ملف التشييك."); setSorting(false); return; }

      // أعمدة الماركة والبنك/الشركة من شيت التشييك.
      const brandCol = findHeader(checkRec.headers, ["ماركة", "الماركه", "صانع", "vehicle name"]);
      const bankCol = findHeader(checkRec.headers, ["بنك", "البنك", "شرك", "جهة", "تمويل", "bank", "agency", "f-account"]);
      // نوع السيارة (النوع/نوع السيارة/الطراز/الموديل...) — بأي اسم عمود قريب.
      const checkTypeCol = findHeader(checkRec.headers, ["نوع", "طراز", "موديل", "model"]);

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
      const typeOf = (norm: string) => (checkTypeCol ? String(checkRowByNorm.get(norm)?.[checkTypeCol] ?? "").trim() : "");

      // (١) مطابقة على شيت الداتا — بترتيب الداتا (مناطق تحت بعضها).
      const dRows: WantedRow[] = [];
      if (dataRec) {
        const dataCol = detectPlateColumn(dataRec.headers, dataRec.rows);
        if (dataCol) {
          const typeCol = findHeader(dataRec.headers, ["نوع"]);
          const brandColD = findHeader(dataRec.headers, ["ماركة", "طراز", "صانع"]);
          const streetCol = findHeader(dataRec.headers, ["شارع"]);
          const districtCol = findHeader(dataRec.headers, ["حي", "الحى", "منطقة"]);
          const notesCol = findHeader(dataRec.headers, ["ملاحظ"]);
          let i = 0;
          for (const row of dataRec.rows) {
            const norm = normalizePlate(bankPlateToArabic(String(row[dataCol] ?? "")));
            if (!norm || !wanted.has(norm)) continue;
            const gps = findGps(row);
            dRows.push({
              id: `d${i++}`,
              plate: bankPlateToArabic(String(row[dataCol] ?? "")).trim() || norm,
              norm,
              type: (typeCol ? String(row[typeCol] ?? "").trim() : "") || typeOf(norm),
              brand: brandOf(norm) || (brandColD ? String(row[brandColD] ?? "").trim() : ""),
              bank: bankOf(norm),
              street: streetCol ? String(row[streetCol] ?? "").trim() : "",
              district: districtCol ? String(row[districtCol] ?? "").trim() : "",
              notes: notesCol ? String(row[notesCol] ?? "").trim() : "",
              mapsLink: gps ? toMapsLink(gps.lat, gps.lng) : "",
              lat: gps?.lat,
              lng: gps?.lng,
            });
          }
        }
      }

      // (٢) مطابقة على شيت السجلات (field_check).
      const rRows: WantedRow[] = [];
      let j = 0;
      for (const e of fieldEntries) {
        const norm = normalizePlate(bankPlateToArabic(e.plate));
        if (!norm || !wanted.has(norm)) continue;
        rRows.push({
          id: `r${j++}`,
          plate: bankPlateToArabic(e.plate).trim() || e.plate,
          norm,
          type: (e.row?.["النوع"] || e.row?.["نوع السيارة"] || "").trim() || typeOf(norm),
          brand: brandOf(norm),
          bank: bankOf(norm),
          street: (e.row?.["الشارع"] || "").trim(),
          district: (e.row?.["الحي"] || e.row?.["اسم الموقع"] || "").trim(),
          notes: (e.method || e.row?.["ملاحظات"] || "").trim(),
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

  function shareAll(rows: WantedRow[], label: string) {
    if (rows.length === 0) return;
    const text = `*${label} (${rows.length})*\n\n` + rows.map((r, i) =>
      `${i + 1}. 🚗 ${r.plate}${r.brand ? ` — ${r.brand}` : ""}${r.district ? ` — ${r.district}` : ""}${r.mapsLink ? `\n📍 ${r.mapsLink}` : ""}`).join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  async function exportExcel(rows: WantedRow[], name: string) {
    if (rows.length === 0) return;
    const out = rows.map((r) => ({
      "رقم اللوحة": r.plate, "نوع السيارة": r.type, "الماركة": r.brand,
      "البنك/الشركة": r.bank, "الشارع": r.street, "الحي": r.district,
      "ملاحظات": r.notes, "GPS": r.mapsLink,
    }));
    const { blob, ext } = buildSpreadsheetBlob(out, name);
    try { await shareExcelBlob(blob, `${name}.${ext}`, name); } catch (e) { alert(e instanceof Error ? e.message : "تعذّر التصدير"); }
  }

  function windowBlock(title: string, rows: WantedRow[], onDelete: (ids: string[]) => void, clearAll: () => void) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" dir="rtl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{title}</span>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">{rows.length} لوحة</span>
        </div>
        <WantedResultsTable rows={rows} onDelete={onDelete} />
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={() => shareAll(rows, title)} className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-night transition hover:bg-primary/90"><Share2 size={14} /> مشاركة الكل (واتساب)</button>
            <button onClick={() => exportExcel(rows, title)} className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-bold text-muted transition hover:border-primary hover:text-primary"><FileSpreadsheet size={14} /> فتح في إكسيل</button>
            <button onClick={clearAll} className="flex items-center gap-1.5 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-xs font-bold text-danger transition hover:bg-danger/20"><Trash2 size={14} /> مسح النافذة</button>
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
          })}
          {windowBlock("مطلوبين في السجلات", recordRows, deleteFromRecords, () => {
            if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${recordRows.length} لوحة من النافذة دي؟`)) return;
            setRecordRows([]); persist(dataRows, [], true);
          })}
        </>
      )}
    </div>
  );
}

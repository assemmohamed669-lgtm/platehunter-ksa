"use client";

/**
 * صفحة «المطلوب» — بتفرز اللوحات المطلوبة (شيت التشييك) على مصدرين وتطلّع النتيجة
 * في ويندوين منفصلين:
 *   (١) المطلوبين اللي اتلاقوا في **شيت الداتا** (ملف الفرز الأساسي، slot "data").
 *   (٢) المطلوبين اللي اتلاقوا في **شيت السجلات** (field_check — كل التسجيلات).
 * مطابقة بالعضوية المطبّعة (اللوحة موجودة في قائمة المطلوبين). كل ويندو بيعيد
 * استخدام RecordingsTable (زوم/أقرب/تحديد الكل/نسخ/مشاركة/حذف لكل لوحة + جماعي)،
 * وتحته أزرار: مشاركة الكل (واتساب/إكسيل) + مسح النافذة (بتأكيد).
 */
import { useState } from "react";
import { Crosshair, Share2, FileSpreadsheet, Trash2, RefreshCw } from "lucide-react";
import RecordingsTable from "@/components/RecordingsTable";
import { getUploadedFile, getAllFieldCheckEntries, type RecordingEntry, type FieldCheckEntry } from "@/lib/idb";
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { parseLatLngCell, toMapsLink } from "@/lib/gps";
import { buildSpreadsheetBlob, shareExcelBlob } from "@/lib/excel";

function findColValue(row: Record<string, string>, keywords: string[]): string {
  for (const [k, v] of Object.entries(row)) {
    if (keywords.some((kw) => k.includes(kw)) && String(v ?? "").trim()) return String(v).trim();
  }
  return "";
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
  const [dataMatches, setDataMatches] = useState<RecordingEntry[]>([]);
  const [recordMatches, setRecordMatches] = useState<RecordingEntry[]>([]);

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

      // قائمة المطلوبين (مطبّعة) — العضوية بتتحسب عليها.
      const wanted = new Set(
        checkRec.rows.map((r) => normalizePlate(bankPlateToArabic(String(r[checkCol] ?? "")))).filter(Boolean),
      );

      // (١) مطابقة على شيت الداتا.
      const dm: RecordingEntry[] = [];
      if (dataRec) {
        const dataCol = detectPlateColumn(dataRec.headers, dataRec.rows);
        if (dataCol) {
          let i = 0;
          for (const row of dataRec.rows) {
            const norm = normalizePlate(bankPlateToArabic(String(row[dataCol] ?? "")));
            if (!norm || !wanted.has(norm)) continue;
            const gps = findGps(row);
            dm.push({
              localId: `d${i++}`,
              agentId: "wanted",
              plate: bankPlateToArabic(String(row[dataCol] ?? "")).trim() || norm,
              vehicleType: findColValue(row, ["نوع", "طراز", "صانع"]) || undefined,
              district: findColValue(row, ["حي", "الحى", "المنطقة"]) || undefined,
              lat: gps?.lat,
              lng: gps?.lng,
              mapsLink: gps ? toMapsLink(gps.lat, gps.lng) : undefined,
              recordedAt: new Date().toISOString(),
              synced: true,
            });
          }
        }
      }

      // (٢) مطابقة على شيت السجلات (field_check).
      const rm: RecordingEntry[] = [];
      let j = 0;
      for (const e of fieldEntries) {
        const norm = normalizePlate(bankPlateToArabic(e.plate));
        if (!norm || !wanted.has(norm)) continue;
        rm.push({
          localId: `r${j++}`,
          agentId: "wanted",
          plate: bankPlateToArabic(e.plate).trim() || e.plate,
          vehicleType: (e.row?.["النوع"] || e.row?.["نوع السيارة"] || "") || undefined,
          district: (e.row?.["الحي"] || e.row?.["اسم الموقع"] || "") || undefined,
          notes: e.method || undefined,
          lat: e.lat,
          lng: e.lng,
          mapsLink: e.mapsLink,
          recordedAt: e.checkedAt || new Date().toISOString(),
          synced: true,
        });
      }

      setDataMatches(dm);
      setRecordMatches(rm);
      setSorted(true);
    } catch (err) {
      setError(`تعذّر الفرز: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSorting(false);
    }
  }

  function shareAllWhatsApp(matches: RecordingEntry[], label: string) {
    if (matches.length === 0) return;
    const text =
      `*${label} (${matches.length})*\n\n` +
      matches
        .map((m, i) => `${i + 1}. 🚗 ${m.plate}${m.district ? ` — ${m.district}` : ""}${m.mapsLink ? `\n📍 ${m.mapsLink}` : ""}`)
        .join("\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function exportExcel(matches: RecordingEntry[], name: string) {
    if (matches.length === 0) return;
    const rows = matches.map((m) => ({
      "رقم اللوحة": m.plate,
      "النوع": m.vehicleType || "",
      "الحي": m.district || "",
      "الموقع": m.mapsLink || "",
      "ملاحظات": m.notes || "",
    }));
    const { blob, ext } = buildSpreadsheetBlob(rows, name);
    try { await shareExcelBlob(blob, `${name}.${ext}`, name); }
    catch (e) { alert(e instanceof Error ? e.message : "تعذّر التصدير"); }
  }

  function window_(
    title: string,
    matches: RecordingEntry[],
    setMatches: React.Dispatch<React.SetStateAction<RecordingEntry[]>>,
    checkPlates: Set<string>,
  ) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" dir="rtl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{title}</span>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">{matches.length} لوحة</span>
        </div>

        {matches.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">مفيش مطلوبين اتلاقوا هنا.</p>
        ) : (
          <>
            <RecordingsTable
              recordings={matches}
              onDelete={(id) => setMatches((prev) => prev.filter((m) => m.localId !== id))}
              onDeleteMany={(ids) => { const s = new Set(ids); setMatches((prev) => prev.filter((m) => !s.has(m.localId))); }}
              checkPlates={checkPlates}
            />

            {/* مشاركة الكل + مسح النافذة */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button onClick={() => shareAllWhatsApp(matches, title)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-night transition hover:bg-primary/90">
                <Share2 size={14} /> مشاركة الكل (واتساب)
              </button>
              <button onClick={() => exportExcel(matches, title)}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs font-bold text-muted transition hover:text-primary hover:border-primary">
                <FileSpreadsheet size={14} /> فتح في إكسيل
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${matches.length} لوحة من النافذة دي؟`)) return;
                  setMatches([]);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-xs font-bold text-danger transition hover:bg-danger/20">
                <Trash2 size={14} /> مسح النافذة
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const wantedForData = new Set(dataMatches.map((m) => normalizePlate(m.plate)));
  const wantedForRec = new Set(recordMatches.map((m) => normalizePlate(m.plate)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Crosshair size={20} className="text-danger" />
        <div>
          <h1 className="text-lg font-bold text-ink">المطلوب</h1>
          <p className="text-xs text-muted">فرز المطلوبين على الداتا والسجلات.</p>
        </div>
      </div>

      <button
        onClick={runSort}
        disabled={sorting}
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-50 active:scale-[0.99]"
      >
        {sorting ? <RefreshCw size={16} className="animate-spin" /> : <Crosshair size={16} />}
        {sorting ? "جاري الفرز..." : "فرز المطلوبين"}
      </button>

      {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-center text-sm text-danger" dir="rtl">{error}</p>}

      {sorted && (
        <>
          {window_("مطلوبين في الداتا", dataMatches, setDataMatches, wantedForData)}
          {window_("مطلوبين في السجلات", recordMatches, setRecordMatches, wantedForRec)}
        </>
      )}
    </div>
  );
}

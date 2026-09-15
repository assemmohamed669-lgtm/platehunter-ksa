"use client";

/**
 * تبويب «فرز» — للمشترك **صوت VoiceX فقط** بس.
 * =============================================================================
 * المشترك ده مالوش صفحة الفرز الأساسية، فبيحتاج نفس الخدمة مصغّرة جوّه صفحة
 * التشييك: يرفع شيت إحالة، ويفرزه على **سجلاته هو** (اللي سجّلها بصوته)، ويطلع
 * السيارات المطلوبة للسحب بكل بياناتها + يشاركها.
 *
 * ⚠️ محرّك المطابقة **هو هو** بتاع صفحة الفرز الأساسية بالحرف
 * (`buildReferralIndex` + `matchChunkAgainstIndex` من `lib/plateParser`) — عشان
 * النتيجة تطلع مطابقة تماماً، ومنعملش محرّك تاني يفترق عنه مع الوقت.
 *
 * وضعان زي صفحة الفرز:
 *  • **جديد** = لوحات الإحالة اللي **مش** في ملف التشييك → تتفرز على السجلات.
 *  • **كلي**  = كل لوحات الإحالة → تتفرز على السجلات.
 * + مربع لصق نصّي: لوحات مكتوبة → تتطابق على السجلات.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListFilter, Loader2, Share2, Trash2, ClipboardPaste, Search, FileSpreadsheet, Image as ImageIcon,
  CheckSquare, Square, Copy, Check, Navigation, ZoomIn, ZoomOut, SlidersHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import {
  buildReferralIndex,
  matchChunkAgainstIndex,
  detectPlateColumn,
  normalizePlate,
  bankPlateToArabic,
  tokenizePastedPlates,
  type MatchResult,
} from "@/lib/plateParser";
import { buildExcelBlob, shareExcelBlob, type ExcelTable } from "@/lib/excel";
import { renderTableImages } from "@/lib/plateImage";
import { shareImageWithText, shareTextViaChooser } from "@/lib/share";
import { gpsService, extractLatLngFromMapsLink, haversineKm, formatDistanceKm, type GpsCoords } from "@/lib/gps";
import {
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  getAllFieldCheckEntries,
  type FieldCheckEntry,
} from "@/lib/idb";
import { collapseSameMinuteDuplicates } from "@/lib/fieldCheck";

/** سلوت الإحالة بتاعة المشترك صوت-فقط — نفس نمط `local:check`. */
const REF_SLOT = "voice-referral";
const AGENT = "local";

/** عمود اللوحة المصطنع في صفوف السجلات (السجل مش جدول إكسيل، فبنلفّه). */
const REC_PLATE_COL = "رقم اللوحة";

type SortMode = "new" | "full";

export interface VoiceOnlySortProps {
  /** ملف التشييك المحمّل في الصفحة — لازم لوضع «جديد» (الإحالة ناقص التشييك). */
  checkTable: ExcelTable | null;
}

/** يحوّل سجلات المندوب لصفوف جدول عشان تعدّي على نفس محرّك المطابقة. */
function recordsToRows(entries: FieldCheckEntry[]): Record<string, string>[] {
  return entries.map((e) => ({
    ...e.row,                                   // الأعمدة المرجعية اللي اتحفظت مع السجل
    [REC_PLATE_COL]: e.plate,
    "الطريقة": e.method ?? "",
    "التاريخ": e.checkedAt ? new Date(e.checkedAt).toLocaleString("ar-EG") : "",
    "الموقع": e.mapsLink ?? "",
  }));
}

export default function VoiceOnlySort({ checkTable }: VoiceOnlySortProps) {
  const [refTable, setRefTable] = useState<ExcelTable | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("new");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [scanned, setScanned] = useState<number | null>(null); // كام لوحة اتفرزت (جديد/كلي)
  const [ran, setRan] = useState(false);                       // اتعمل فرز خلاص؟
  const [pasteText, setPasteText] = useState("");
  const [pasteResults, setPasteResults] = useState<MatchResult[]>([]);
  const [pasteRan, setPasteRan] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  // ── تحميل شيت الإحالة المحفوظ (بيفضل بعد إعادة فتح التطبيق) ────────────────
  useEffect(() => {
    getUploadedFile(AGENT, REF_SLOT)
      .then((rec) => {
        if (!rec) return;
        setRefTable({ headers: rec.headers, rows: rec.rows });
        setRefFile(new File([rec.fileBlob ?? new Blob()], rec.fileName, {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }));
      })
      .catch(() => {});
  }, []);

  const refPlateCol = useMemo(
    () => (refTable ? detectPlateColumn(refTable.headers, refTable.rows) : null),
    [refTable],
  );

  /**
   * عدد اللوحات **الفعلية** في شيت الإحالة (مش عدد الصفوف). بيتعرض في المربع
   * عشان المندوب يكتشف فوراً لو رفع ورقة غلط — نفس الإشارة اللي كشفت مشكلة
   * ملف فيه ورقة «تشييك» فاضية والداتا في ورقة تانية.
   */
  const refPlateCount = useMemo(() => {
    if (!refTable || !refPlateCol) return null;
    let n = 0;
    for (const row of refTable.rows) {
      if (normalizePlate(bankPlateToArabic(String(row[refPlateCol] ?? "")))) n++;
    }
    return n;
  }, [refTable, refPlateCol]);

  /** لوحات ملف التشييك مطبّعة — لطرحها في وضع «جديد». */
  const checkSet = useMemo(() => {
    const s = new Set<string>();
    if (!checkTable) return s;
    const col = detectPlateColumn(checkTable.headers, checkTable.rows);
    if (!col) return s;
    for (const row of checkTable.rows) {
      const n = normalizePlate(bankPlateToArabic(String(row[col] ?? "")));
      if (n) s.add(n);
    }
    return s;
  }, [checkTable]);

  async function handleParsed(table: ExcelTable, file: File) {
    setRefTable(table);
    setRefFile(file);
    setResults([]); setRan(false); setScanned(null);
    try {
      await saveUploadedFile({
        key: `${AGENT}:${REF_SLOT}`, agentId: AGENT, slot: REF_SLOT,
        fileName: file.name, headers: table.headers, rows: table.rows,
        uploadedAt: new Date().toISOString(), fileBlob: file,
      });
    } catch { /* التخزين اتقفل — الفرز لسه شغّال على النسخة اللي في الذاكرة */ }
  }

  async function handleClearFile() {
    setRefTable(null); setRefFile(null);
    setResults([]); setRan(false); setScanned(null);
    try { await deleteUploadedFile(AGENT, REF_SLOT); } catch { /* ignore */ }
  }

  // ── الفرز ─────────────────────────────────────────────────────────────────
  const runSort = useCallback(async () => {
    if (!refTable || !refPlateCol || busy) return;
    setBusy(true);
    try {
      // نفس اللوحة في نفس الدقيقة = تشييك واحد ⇒ نتيجة واحدة مش ٨.
      const entries = collapseSameMinuteDuplicates(await getAllFieldCheckEntries());
      const recRows = recordsToRows(entries);

      // وضع «جديد»: نشيل من الإحالة أي لوحة موجودة أصلاً في ملف التشييك.
      const pool = sortMode === "new"
        ? refTable.rows.filter((row) => {
            const n = normalizePlate(bankPlateToArabic(String(row[refPlateCol] ?? "")));
            return n ? !checkSet.has(n) : false;
          })
        : refTable.rows;

      setScanned(pool.length);
      const index = buildReferralIndex(pool, refPlateCol);
      const matches = matchChunkAgainstIndex(recRows, REC_PLATE_COL, index);
      setResults(matches);
      setRan(true);
    } finally {
      setBusy(false);
    }
  }, [refTable, refPlateCol, sortMode, checkSet, busy]);

  // ── اللصق النصّي: لوحات مكتوبة → تتطابق على السجلات ────────────────────────
  const runPaste = useCallback(async () => {
    const tokens = tokenizePastedPlates(pasteText);
    if (tokens.length === 0) { setPasteResults([]); setPasteRan(true); return; }
    setBusy(true);
    try {
      // نفس اللوحة في نفس الدقيقة = تشييك واحد ⇒ نتيجة واحدة مش ٨.
      const entries = collapseSameMinuteDuplicates(await getAllFieldCheckEntries());
      const recRows = recordsToRows(entries);
      // الفهرس من **السجلات** عشان النتيجة تطلع ببيانات السجل الكاملة.
      const index = buildReferralIndex(recRows, REC_PLATE_COL);
      const pastedRows = tokens.map((t) => ({ [REC_PLATE_COL]: t }));
      setPasteResults(matchChunkAgainstIndex(pastedRows, REC_PLATE_COL, index));
      setPasteRan(true);
    } finally {
      setBusy(false);
    }
  }, [pasteText]);

  // ── المشاركة ──────────────────────────────────────────────────────────────
  /** يدمج صف الإحالة + صف السجل في صف واحد للعرض/التصدير (كل البيانات). */
  // ── أدوات النتيجة: تحديد · الأقرب · أعمدة · تكبير ─────────────────────────
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [nearest, setNearest] = useState(false);
  const [userLoc, setUserLoc] = useState<GpsCoords | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [rowCopied, setRowCopied] = useState<number | null>(null);

  // موقع المندوب — بيتشغّل بس لما يطلب «الأقرب أولاً» (مايستهلكش بطارية بلا داعي).
  useEffect(() => {
    if (!nearest) return;
    const un = gpsService.subscribe((c) => setUserLoc(c));
    return () => { un?.(); };
  }, [nearest]);

  /** إحداثيات الصف من أول خانة فيها رابط خريطة. */
  function coordsOf(m: MatchResult): { lat: number; lng: number } | null {
    for (const v of Object.values(mergedRow(m))) {
      const t = String(v ?? "").trim();
      if (!t) continue;
      const c = extractLatLngFromMapsLink(t);
      if (c) return c;
      const pair = t.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
      if (pair) return { lat: Number(pair[1]), lng: Number(pair[2]) };
    }
    return null;
  }

  /** نص صف واحد — نفس تنسيق مشاركة النص بالظبط. */
  function rowText(m: MatchResult): string {
    const r = mergedRow(m);
    const details = Object.entries(r)
      .filter(([k, v]) => k !== REC_PLATE_COL && String(v ?? "").trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    return `🚗 ${plateOf(m)}\n${details}`;
  }

  function mergedRow(m: MatchResult): Record<string, string> {
    return { ...(m.dataRow ?? {}), ...m.referralRow };
  }

  function plateOf(m: MatchResult): string {
    const fromData = String(m.dataRow?.[REC_PLATE_COL] ?? "").trim();
    if (fromData) return fromData;
    for (const v of Object.values(m.referralRow)) {
      const n = normalizePlate(bankPlateToArabic(String(v ?? "")));
      if (n && n.length >= 5) return String(v);
    }
    return "";
  }

  async function shareExcel(rows: MatchResult[]) {
    if (rows.length === 0 || shareBusy) return;
    setShareBusy(true);
    try {
      const blob = buildExcelBlob(rows.map(mergedRow), "المطلوب للسحب");
      await shareExcelBlob(blob, `المطلوب-للسحب-${Date.now()}.xlsx`, "المطلوب للسحب");
    } catch { /* المستخدم لغى المشاركة */ }
    finally { setShareBusy(false); }
  }

  async function shareImage(rows: MatchResult[]) {
    if (rows.length === 0 || shareBusy) return;
    setShareBusy(true);
    try {
      const merged = rows.map(mergedRow);
      // أول ٨ أعمدة بس — الصورة تفضل مقروءة على الموبايل.
      const columns = Array.from(new Set(merged.flatMap((r) => Object.keys(r)))).slice(0, 8);
      const images = renderTableImages({
        title: "🚗 المطلوب للسحب",
        subtitle: new Date().toLocaleString("ar-EG"),
        columns,
        rows: merged.map((r) => columns.map((h) => String(r[h] ?? ""))),
      });
      // renderTableImages بيرجّع صور متعددة لو الصفوف كتير — نبعتهم واحدة واحدة.
      for (let i = 0; i < images.length; i++) {
        await shareImageWithText(
          images[i],
          images.length > 1 ? `المطلوب للسحب (${i + 1}/${images.length})` : `المطلوب للسحب (${rows.length})`,
          `المطلوب-للسحب-${i + 1}.png`,
          "المطلوب للسحب",
        );
      }
    } catch { /* المستخدم لغى */ }
    finally { setShareBusy(false); }
  }

  async function shareAsText(rows: MatchResult[]) {
    if (rows.length === 0 || shareBusy) return;
    setShareBusy(true);
    try {
      const lines = rows.map((m, i) => {
        const r = mergedRow(m);
        const details = Object.entries(r)
          .filter(([k, v]) => k !== REC_PLATE_COL && String(v ?? "").trim())
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n");
        return `${i + 1}. 🚗 ${plateOf(m)}\n${details}`;
      });
      await shareTextViaChooser(
        `*المطلوب للسحب (${rows.length})*\n\n${lines.join("\n\n──────────\n\n")}`,
        "المطلوب للسحب",
      );
    } catch { /* المستخدم لغى */ }
    finally { setShareBusy(false); }
  }

  // ── العرض ─────────────────────────────────────────────────────────────────
  const canSort = !!refTable && !!refPlateCol && !busy;

  function ResultsBlock({ rows, onClear, emptyHint, onRemoveRow }: {
    rows: MatchResult[]; onClear: () => void; emptyHint: string;
    onRemoveRow: (i: number) => void;
  }) {
    if (rows.length === 0) {
      return <p className="rounded-2xl bg-surface-2 px-3 py-4 text-center text-xs text-muted">{emptyHint}</p>;
    }
    // أعمدة الجدول = اتحاد مفاتيح كل الصفوف (بترتيب ظهورها)، وبعدين ترتيب
    // المندوب وإخفاؤه لو غيّرهم.
    const allCols: string[] = [];
    for (const m of rows) {
      for (const [k, v] of Object.entries(mergedRow(m))) {
        if (k === REC_PLATE_COL) continue;
        if (!String(v ?? "").trim()) continue;
        if (!allCols.includes(k)) allCols.push(k);
      }
    }
    const ordered = colOrder.length
      ? [...colOrder.filter((c) => allCols.includes(c)), ...allCols.filter((c) => !colOrder.includes(c))]
      : allCols;
    const cols = ordered.filter((c) => !hiddenCols.has(c));

    // «الأقرب أولاً» — ترتيب بالمسافة من موقع المندوب. الصفوف اللي مالهاش موقع
    // بتروح آخر القايمة بدل ما تختفي.
    const view = rows.map((m, i) => ({ m, i }));
    if (nearest && userLoc) {
      for (const it of view) {
        const c = coordsOf(it.m);
        (it as { _d?: number })._d = c ? haversineKm(userLoc.lat, userLoc.lng, c.lat, c.lng) : Infinity;
      }
      view.sort((a, b) => ((a as { _d?: number })._d ?? Infinity) - ((b as { _d?: number })._d ?? Infinity));
    }

    const picked = sel.size > 0 ? rows.filter((_, i) => sel.has(i)) : rows;
    const allSelected = sel.size === rows.length && rows.length > 0;

    function moveCol(c: string, dir: -1 | 1) {
      const base = ordered.slice();
      const at = base.indexOf(c);
      const to = at + dir;
      if (at < 0 || to < 0 || to >= base.length) return;
      [base[at], base[to]] = [base[to], base[at]];
      setColOrder(base);
    }

    return (
      <div className="flex flex-col gap-2">
        {/* شريط الأدوات: الأقرب · الأعمدة · التكبير */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setNearest((v) => !v)}
            className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition ${
              nearest ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface-2 text-muted"
            }`}>
            <Navigation size={13} /> {nearest ? (userLoc ? "الأقرب أولاً ✓" : "جارٍ تحديد موقعك…") : "الأقرب أولاً"}
          </button>
          <button onClick={() => setColsOpen((v) => !v)}
            className="flex items-center gap-1 rounded-xl border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-bold text-muted">
            <SlidersHorizontal size={13} /> الأعمدة ({cols.length}/{allCols.length})
          </button>
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-2.5 py-1.5">
            <button onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))} className="text-muted"><ZoomOut size={13} /></button>
            <span className="text-[10px] font-bold text-muted">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} className="text-muted"><ZoomIn size={13} /></button>
          </div>
        </div>

        {colsOpen && (
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-2 p-2">
            {ordered.map((c) => (
              <div key={c} className="flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1">
                <button onClick={() => setHiddenCols((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })}
                  className="shrink-0 text-muted">
                  {hiddenCols.has(c) ? <Square size={13} /> : <CheckSquare size={13} className="text-primary" />}
                </button>
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink">{c}</span>
                <button onClick={() => moveCol(c, -1)} className="shrink-0 text-muted" title="فوق"><ChevronUp size={13} /></button>
                <button onClick={() => moveCol(c, 1)} className="shrink-0 text-muted" title="تحت"><ChevronDown size={13} /></button>
              </div>
            ))}
          </div>
        )}

        {sel.size > 0 && (
          <p className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary">
            محدَّد {sel.size} — المشاركة هتبعت المحدَّد بس
          </p>
        )}

        <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
          <div style={{ fontSize: `${zoom * 12}px`, minWidth: "max-content" }}>
            <table className="w-full border-collapse" style={{ direction: "rtl" }}>
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-2 text-muted">
                  <th className="border-b border-l border-border px-2 py-2 text-center font-bold">
                    <button onClick={() => setSel(allSelected ? new Set() : new Set(rows.map((_, i) => i)))} className="text-muted">
                      {allSelected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                    </button>
                  </th>
                  <th className="whitespace-nowrap border-b border-l border-border px-2 py-2 text-center font-bold">إجراءات</th>
                  <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">رقم اللوحة</th>
                  {nearest && <th className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">المسافة</th>}
                  {cols.map((c) => (
                    <th key={c} className="whitespace-nowrap border-b border-l border-border px-3 py-2 text-right font-bold">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map(({ m, i }, n) => {
                  const r = mergedRow(m);
                  const isSel = sel.has(i);
                  const d = (view[n] as { _d?: number })._d;
                  return (
                    <tr key={i} className={`border-b border-border ${isSel ? "bg-primary/10" : n % 2 === 0 ? "bg-surface" : "bg-surface-2/40"}`}>
                      <td className="border-l border-border px-2 py-2 text-center">
                        <button onClick={() => setSel((sset) => { const x = new Set(sset); if (x.has(i)) x.delete(i); else x.add(i); return x; })}
                          className="text-muted">
                          {isSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                        </button>
                      </td>
                      <td className="border-l border-border px-2 py-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-[0.85em] font-bold text-muted">{n + 1}</span>
                          <button title="نسخ" className="text-muted"
                            onClick={async () => { await navigator.clipboard.writeText(rowText(m)); setRowCopied(i); setTimeout(() => setRowCopied(null), 1200); }}>
                            {rowCopied === i ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                          </button>
                          <button title="واتساب" className="text-muted"
                            onClick={() => void shareTextViaChooser(rowText(m), "مطلوبة للسحب").catch(() => {})}>
                            <Share2 size={13} />
                          </button>
                          <button title="حذف الصف من النتيجة" className="text-muted hover:text-danger"
                            onClick={() => { onRemoveRow(i); setSel(new Set()); }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap border-l border-border px-3 py-2 font-bold text-brand">
                        <span className="inline-flex items-center gap-1.5">
                          {plateOf(m)}
                          {m.status === "fuzzy" && (
                            <span className="rounded-full bg-alert/20 px-1.5 py-0.5 text-[0.75em] font-bold text-alert"
                              title="تطابق تقريبي — راجع اللوحة قبل ما تتحرك">
                              مشتبه {m.similarity != null ? `${Math.round(m.similarity)}%` : ""}
                            </span>
                          )}
                        </span>
                      </td>
                      {nearest && (
                        <td className="whitespace-nowrap border-l border-border px-3 py-2 font-bold text-primary">
                          {d != null && Number.isFinite(d) ? formatDistanceKm(d) : "—"}
                        </td>
                      )}
                      {cols.map((c) => {
                        const v = String(r[c] ?? "").trim();
                        const gps = /^https?:\/\//i.test(v);
                        return (
                          <td key={c} className="whitespace-nowrap border-l border-border px-3 py-2 text-ink">
                            {gps
                              ? <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary underline">خريطة</a>
                              : (v || "—")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* أزرار المشاركة + المسح — نفس خدمات صفحة الفرز */}
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => void shareExcel(picked)} disabled={shareBusy}
            className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600/15 py-2.5 text-[11px] font-bold text-emerald-600 disabled:opacity-50">
            <FileSpreadsheet size={14} /> إكسيل
          </button>
          <button onClick={() => void shareImage(picked)} disabled={shareBusy}
            className="flex items-center justify-center gap-1 rounded-xl bg-primary/15 py-2.5 text-[11px] font-bold text-primary disabled:opacity-50">
            <ImageIcon size={14} /> صورة
          </button>
          <button onClick={() => void shareAsText(picked)} disabled={shareBusy}
            className="flex items-center justify-center gap-1 rounded-xl bg-brand/15 py-2.5 text-[11px] font-bold text-brand disabled:opacity-50">
            <Share2 size={14} /> نص
          </button>
        </div>
        <button onClick={onClear}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-danger/30 py-2.5 text-xs font-bold text-danger">
          <Trash2 size={14} /> مسح النتيجة
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ملف الإحالة */}
      <FileUploadBox
        title="مربع الإحالة"
        hint="ارفع أي إحالة جديدة تنزل"
        parsedFile={refFile}
        parsedRowCount={refTable?.rows.length ?? null}
        plateCount={refPlateCount}
        onParsed={(t, f) => void handleParsed(t, f)}
        onClear={() => void handleClearFile()}
        showReplaceButtons
        loadedAccent="referral"
      />

      {refTable && !refPlateCol && (
        <p className="rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-bold text-danger">
          ⚠️ معرفناش عمود اللوحة في الشيت ده — اتأكد إنك رفعت الورقة الصح.
        </p>
      )}

      {/* وضع الفرز + زر الفرز */}
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-surface-2 p-1.5">
          {([["new", "فرز جديد"], ["full", "فرز كلي"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setSortMode(key); setResults([]); setRan(false); setScanned(null); }}
              className={`rounded-xl py-2.5 text-xs font-bold transition ${
                sortMode === key ? "bg-primary text-night shadow" : "text-muted"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          {sortMode === "new"
            ? "«جديد»: اللوحات اللي في الإحالة ومش في ملف التشييك — تتفرز على سجلاتك."
            : "«كلي»: كل لوحات الإحالة تتفرز على سجلاتك."}
        </p>
        <button onClick={() => void runSort()} disabled={!canSort}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3.5 text-sm font-black text-night transition active:scale-95 disabled:opacity-40">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <ListFilter size={18} />}
          {busy ? "جاري الفرز…" : "ابدأ الفرز"}
        </button>
      </div>

      {/* رسالة النتيجة + النتائج */}
      {ran && (
        <div className="flex flex-col gap-3">
          <div className={`rounded-2xl px-3 py-3 text-center text-sm font-bold ${
            results.length > 0 ? "bg-danger/10 text-danger" : "bg-surface-2 text-muted"
          }`}>
            {results.length > 0
              ? `يوجد ${scanned ?? 0} ${sortMode === "new" ? "سيارة جديدة" : "سيارة في الإحالة"} · تم العثور على ${results.length} مطلوبة`
              : `يوجد ${scanned ?? 0} ${sortMode === "new" ? "سيارة جديدة" : "سيارة في الإحالة"} · لا يوجد تطابق بينها وبين السجلات`}
          </div>
          <ResultsBlock
            rows={results}
            onClear={() => { setResults([]); setRan(false); setScanned(null); }}
            onRemoveRow={(i) => setResults((rs) => rs.filter((_, j) => j !== i))}
            emptyHint="مفيش سيارات مطابقة."
          />
        </div>
      )}

      {/* ── مربع اللصق النصّي ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-2 p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
          <ClipboardPaste size={15} /> لصق لوحات مكتوبة
        </div>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={4}
          dir="rtl"
          placeholder="الصق اللوحات هنا (سطر لكل لوحة أو مفصولة بفاصلة)…"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        <button onClick={() => void runPaste()} disabled={busy || !pasteText.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-night disabled:opacity-40">
          <Search size={15} /> فرز اللصق على السجلات
        </button>
        {pasteRan && (
          <ResultsBlock
            rows={pasteResults}
            onClear={() => { setPasteResults([]); setPasteRan(false); }}
            onRemoveRow={(i) => setPasteResults((rs) => rs.filter((_, j) => j !== i))}
            emptyHint="مفيش لوحة من اللي لصقتها موجودة في سجلاتك."
          />
        )}
      </div>
    </div>
  );
}

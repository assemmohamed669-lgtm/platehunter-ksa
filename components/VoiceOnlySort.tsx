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
import { ListFilter, Loader2, Share2, Trash2, ClipboardPaste, Search, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import PlateBadge from "@/components/PlateBadge";
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
import {
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  getAllFieldCheckEntries,
  type FieldCheckEntry,
} from "@/lib/idb";

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
      const entries = await getAllFieldCheckEntries();
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
      const entries = await getAllFieldCheckEntries();
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

  function ResultsBlock({ rows, onClear, emptyHint }: {
    rows: MatchResult[]; onClear: () => void; emptyHint: string;
  }) {
    if (rows.length === 0) {
      return <p className="rounded-2xl bg-surface-2 px-3 py-4 text-center text-xs text-muted">{emptyHint}</p>;
    }
    return (
      <div className="flex flex-col gap-2">
        {rows.map((m, i) => {
          const r = mergedRow(m);
          const details = Object.entries(r).filter(([k, v]) => k !== REC_PLATE_COL && String(v ?? "").trim());
          return (
            <div key={i} className="rounded-2xl border border-danger/40 bg-danger/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <PlateBadge value={plateOf(m)} size="sm" />
                {m.status === "fuzzy" && (
                  <span className="rounded-full bg-alert/15 px-2 py-0.5 text-[10px] font-bold text-alert">
                    مشتبه {m.similarity != null ? `${Math.round(m.similarity)}%` : ""}
                  </span>
                )}
              </div>
              {details.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  {details.slice(0, 10).map(([k, v], j) => (
                    <div key={j} className="flex gap-1 text-[11px] min-w-0">
                      <span className="shrink-0 text-muted">{k}:</span>
                      <span className="truncate font-bold text-ink">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* أزرار المشاركة + المسح — نفس خدمات صفحة الفرز */}
        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => void shareExcel(rows)} disabled={shareBusy}
            className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600/15 py-2.5 text-[11px] font-bold text-emerald-600 disabled:opacity-50">
            <FileSpreadsheet size={14} /> إكسيل
          </button>
          <button onClick={() => void shareImage(rows)} disabled={shareBusy}
            className="flex items-center justify-center gap-1 rounded-xl bg-primary/15 py-2.5 text-[11px] font-bold text-primary disabled:opacity-50">
            <ImageIcon size={14} /> صورة
          </button>
          <button onClick={() => void shareAsText(rows)} disabled={shareBusy}
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
            emptyHint="مفيش لوحة من اللي لصقتها موجودة في سجلاتك."
          />
        )}
      </div>
    </div>
  );
}

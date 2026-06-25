"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ListFilter,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Share2,
  Navigation,
  ZoomIn,
  ZoomOut,
  ClipboardPaste,
  FileSpreadsheet,
  Download,
  ExternalLink,
  ChevronDown,
  CheckSquare,
  Square,
  Trash2,
} from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import { supabase } from "@/lib/supabaseClient";
import {
  type ExcelTable,
  buildExcelBlob,
  downloadExcelBlob,
  openExcelBlob,
  shareExcelBlob,
  buildRowSummaryText,
  shareOrCopyText,
} from "@/lib/excel";
import {
  detectPlateColumn,
  buildReferralIndex,
  matchChunkAgainstIndex,
  bankPlateToArabic,
  normalizePlate,
  type MatchResult,
} from "@/lib/plateParser";
import {
  matchesPreferred,
  guessDefaultColumns,
  isMandatory,
} from "@/lib/sortingCols";
import { haversineKm, extractLatLngFromMapsLink } from "@/lib/gps";
import {
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  type UploadedFileRecord,
} from "@/lib/idb";

const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];
const PAGE_SIZE = 50;

function findGpsColumn(headers: string[]): string | null {
  return headers.find((h) => /GPS|رابط|موقع|خريطة/i.test(h)) ?? null;
}

interface ResultActionsProps {
  rowObj: Record<string, unknown>;
}

function ResultActions({ rowObj }: ResultActionsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(buildRowSummaryText(rowObj));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  async function handleShare() {
    await shareOrCopyText(buildRowSummaryText(rowObj));
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={handleCopy} title="نسخ" className="text-muted hover:text-primary transition">
        {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
      </button>
      <button onClick={handleShare} title="مشاركة" className="text-muted hover:text-primary transition">
        <Share2 size={14} />
      </button>
    </div>
  );
}

export default function SortingPage() {
  const [tab, setTab] = useState<"files" | "paste">("files");
  const [agentId, setAgentId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  // Uploaded tables (persisted in IndexedDB — see bootstrap effect below)
  const [dataTable, setDataTable] = useState<ExcelTable | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [referralTable, setReferralTable] = useState<ExcelTable | null>(null);
  const [referralFile, setReferralFile] = useState<File | null>(null);
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkFile, setCheckFile] = useState<File | null>(null);
  const [checkColsOpen, setCheckColsOpen] = useState(false);

  // Column selection — built from the *real* headers of each uploaded file
  const [referralExtraCols, setReferralExtraCols] = useState<Set<string>>(new Set());
  const [outputCols, setOutputCols] = useState<Set<string>>(new Set());

  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [zoom, setZoom] = useState(3); // index into ZOOM_LEVELS
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [selectedPaste, setSelectedPaste] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [nearestActive, setNearestActive] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [showExcelMenuFiles, setShowExcelMenuFiles] = useState(false);
  const [showExcelMenuPaste, setShowExcelMenuPaste] = useState(false);
  const [dataColsOpen, setDataColsOpen] = useState(false);
  const [referralColsOpen, setReferralColsOpen] = useState(false);

  // Paste-text path — now filtered to matches only
  const [pasteText, setPasteText] = useState("");
  const [pasteResults, setPasteResults] = useState<
    { converted: string; row: Record<string, string> }[]
  >([]);
  const [pasteRan, setPasteRan] = useState(false);
  const [pasteVisibleCount, setPasteVisibleCount] = useState(PAGE_SIZE);

  // ── Bootstrap: restore persisted files from IndexedDB ────────────────
  // Uses a fixed "local" key (no auth dependency) so files always persist.
  useEffect(() => {
    Promise.all([
      getUploadedFile("local", "data"),
      getUploadedFile("local", "referral"),
      getUploadedFile("local", "check"),
    ])
      .then(([dataRec, refRec, checkRec]) => {
        if (dataRec) {
          setDataTable({ headers: dataRec.headers, rows: dataRec.rows });
          setDataFile(new File([dataRec.fileBlob ?? new Blob()], dataRec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }));
        }
        if (refRec) {
          setReferralTable({ headers: refRec.headers, rows: refRec.rows });
          setReferralFile(new File([refRec.fileBlob ?? new Blob()], refRec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }));
          const refPlate = detectPlateColumn(refRec.headers);
          const defRef = refRec.headers.filter((h) => h !== refPlate && matchesPreferred(h));
          setReferralExtraCols(new Set(defRef));
        }
        if (checkRec) {
          setCheckTable({ headers: checkRec.headers, rows: checkRec.rows });
          setCheckFile(new File([checkRec.fileBlob ?? new Blob()], checkRec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }));
        }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  const dataPlateCol = dataTable ? detectPlateColumn(dataTable.headers) : null;
  const referralPlateCol = referralTable ? detectPlateColumn(referralTable.headers) : null;
  const gpsCol = dataTable ? findGpsColumn(dataTable.headers) : null;

  // Seed default column selection whenever a table loads (data or referral)
  useEffect(() => {
    if (dataTable) {
      setOutputCols(new Set(guessDefaultColumns(dataTable.headers, dataPlateCol)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTable]);

  useEffect(() => {
    if (referralTable) {
      const refPlate = detectPlateColumn(referralTable.headers);
      const defRef = referralTable.headers.filter((h) => h !== refPlate && matchesPreferred(h));
      setReferralExtraCols(new Set(defRef));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralTable]);

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  // ── Persisted upload handlers (data / referral / check slots) ──────
  const persistAndSet = useCallback(
    async (slot: "data" | "referral" | "check", table: ExcelTable, file: File) => {
      const record: UploadedFileRecord = {
        key: `local:${slot}`,
        agentId: "local",
        slot,
        fileName: file.name,
        headers: table.headers,
        rows: table.rows,
        uploadedAt: new Date().toISOString(),
        fileBlob: file,
      };
      await saveUploadedFile(record);
      if (slot === "data") {
        setDataTable(table);
        setDataFile(file);
        setOutputCols(new Set(guessDefaultColumns(table.headers, detectPlateColumn(table.headers))));
        setDataColsOpen(false);
        setResults(null);
        setSorted(false);
      } else if (slot === "referral") {
        setReferralTable(table);
        setReferralFile(file);
        const refPlate = detectPlateColumn(table.headers);
        const defRef = table.headers.filter((h) => h !== refPlate && matchesPreferred(h));
        setReferralExtraCols(new Set(defRef));
        setReferralColsOpen(false);
        setResults(null);
        setSorted(false);
      } else {
        setCheckTable(table);
        setCheckFile(file);
        setCheckColsOpen(false);
      }
    },
    []
  );

  async function clearSlot(slot: "data" | "referral" | "check") {
    await deleteUploadedFile("local", slot);
    if (slot === "data") {
      setDataTable(null);
      setDataFile(null);
      setOutputCols(new Set());
      setResults(null);
      setSorted(false);
    } else if (slot === "referral") {
      setReferralTable(null);
      setReferralFile(null);
      setReferralExtraCols(new Set());
      setResults(null);
      setSorted(false);
    } else {
      setCheckTable(null);
      setCheckFile(null);
    }
  }

  // ── Run matching ──────────────────────────────────────────────────
  async function runSort() {
    if (!dataTable || !referralTable || !dataPlateCol || !referralPlateCol) return;
    setSorting(true);
    await new Promise<void>((r) => setTimeout(r, 10));

    try {
      const allResults: MatchResult[] = [];

      const referralMap = new Map<string, Record<string, string>>();
      for (const refRow of referralTable.rows) {
        const n = normalizePlate(bankPlateToArabic(String(refRow[referralPlateCol] ?? "")));
        if (n) referralMap.set(n, refRow);
      }

      const rows = dataTable.rows;
      const len = rows.length;
      const CHUNK = 8000;

      for (let i = 0; i < len; i += CHUNK) {
        const end = Math.min(i + CHUNK, len);
        for (let j = i; j < end; j++) {
          const dataRow = rows[j];
          const n = normalizePlate(bankPlateToArabic(String(dataRow[dataPlateCol] ?? "")));
          if (!n) continue;
          const refRow = referralMap.get(n);
          if (refRow) allResults.push({ referralRow: refRow, dataRow, status: "exact" });
        }
        if (end < len) await new Promise<void>((r) => setTimeout(r, 0));
      }

      setResults(allResults);
      setSorted(true);
      setNearestActive(false);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      console.error(err);
    } finally {
      setSorting(false);
    }
  }

  async function handleNearest() {
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        })
      );
      setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setNearestActive(true);
    } catch {
      alert("تعذّر الوصول للموقع. تحقق من إذن الـ GPS.");
    } finally {
      setLocating(false);
    }
  }

  const matchedResults = useMemo(
    () => (results ? results.filter((r) => r.status !== "none") : []),
    [results]
  );

  // Always show mandatory cols first, then the rest of the selected cols
  const displayCols = useMemo(() => {
    const mandatoryCols = dataTable?.headers.filter((h) => h !== dataPlateCol && isMandatory(h)) ?? [];
    const rest = [...outputCols].filter((h) => !isMandatory(h));
    return [...new Set([...mandatoryCols, ...rest])];
  }, [dataTable, dataPlateCol, outputCols]);

  const displayResults = useMemo(() => {
    if (!nearestActive || !userLoc || !gpsCol) return matchedResults;
    return [...matchedResults]
      .map((r) => {
        const link = r.dataRow?.[gpsCol] ?? "";
        const coords = link ? extractLatLngFromMapsLink(link) : null;
        const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
        return { ...r, _dist: dist };
      })
      .sort((a, b) => a._dist - b._dist);
  }, [matchedResults, nearestActive, userLoc, gpsCol]);

  function plateForRow(r: MatchResult): string {
    const raw = String(r.dataRow?.[dataPlateCol ?? ""] ?? r.referralRow[referralPlateCol ?? ""] ?? "");
    return bankPlateToArabic(raw);
  }

  function buildRowObject(r: MatchResult): Record<string, unknown> {
    const row: Record<string, unknown> = { "رقم اللوحة": plateForRow(r) };
    // Always include mandatory columns first, then the rest of outputCols
    const allCols = [
      ...(dataTable?.headers.filter((h) => h !== dataPlateCol && isMandatory(h)) ?? []),
      ...[...outputCols].filter((h) => !isMandatory(h)),
    ];
    for (const col of allCols) row[col] = r.dataRow?.[col] ?? "";
    for (const col of referralExtraCols) row[col] = r.referralRow[col] ?? "";
    row["نوع التطابق"] = r.status === "exact" ? "مطابقة كاملة" : `مشتبه به (${r.similarity}%)`;
    return row;
  }

  async function handleDownloadAll() {
    setExportingAll(true);
    const rows = matchedResults.map(buildRowObject);
    const blob = buildExcelBlob(rows, "نتائج الفرز");
    downloadExcelBlob(blob, `فرز-${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.xlsx`);
    setExportingAll(false);
  }

  async function handleOpenAll() {
    setExportingAll(true);
    const rows = matchedResults.map(buildRowObject);
    const blob = buildExcelBlob(rows, "نتائج الفرز");
    const filename = `فرز-${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.xlsx`;
    await openExcelBlob(blob, filename);
    setExportingAll(false);
  }

  // All data columns (except plate col) — shown as mandatory in paste tab
  const pasteAllCols = dataTable
    ? dataTable.headers.filter((h) => h !== dataPlateCol)
    : [];

  // ── Paste-text path: compare against data file, show all data cols ──
  function runPasteSort() {
    if (!dataTable || !dataPlateCol) return;

    const dataMap = new Map<string, Record<string, string>>();
    for (const row of dataTable.rows) {
      const norm = normalizePlate(bankPlateToArabic(String(row[dataPlateCol] ?? "")));
      if (norm) dataMap.set(norm, row);
    }

    const tokens = pasteText
      .split(/[\n,،]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const matches: { converted: string; row: Record<string, string> }[] = [];
    for (const token of tokens) {
      const converted = bankPlateToArabic(token);
      const norm = normalizePlate(converted);
      const row = dataMap.get(norm);
      if (row) matches.push({ converted, row });
    }

    setPasteResults(matches);
    setPasteRan(true);
    setPasteVisibleCount(PAGE_SIZE);
  }

  function buildPasteRowObject(p: { converted: string; row: Record<string, string> }): Record<string, unknown> {
    const obj: Record<string, unknown> = { "رقم اللوحة": p.converted };
    for (const col of pasteAllCols) obj[col] = p.row[col] ?? "";
    return obj;
  }

  async function handleDownloadPaste() {
    const rows = pasteResults.map(buildPasteRowObject);
    const blob = buildExcelBlob(rows, "نتائج اللصق");
    downloadExcelBlob(blob, `لصق-${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.xlsx`);
  }

  async function handleOpenPaste() {
    const rows = pasteResults.map(buildPasteRowObject);
    const blob = buildExcelBlob(rows, "نتائج اللصق");
    const filename = `لصق-${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.xlsx`;
    await openExcelBlob(blob, filename);
  }

  async function handleShareAll() {
    const rows = matchedResults.map(buildRowObject);
    const blob = buildExcelBlob(rows, "نتائج الفرز");
    const filename = `فرز-${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.xlsx`;
    await shareExcelBlob(blob, filename, "نتائج الفرز");
  }

  async function handleSharePaste() {
    const rows = pasteResults.map(buildPasteRowObject);
    const blob = buildExcelBlob(rows, "نتائج اللصق");
    const filename = `لصق-${new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}.xlsx`;
    await shareExcelBlob(blob, filename, "نتائج اللصق");
  }

  // ── Shared per-row action buttons (Copy / Share) — defined at module
  // scope above, so its internal `copied` state survives re-renders.

  const exactCount = results ? results.filter((r) => r.status === "exact").length : 0;
  const fuzzyCount = results ? results.filter((r) => r.status === "fuzzy").length : 0;

  function shareRowToWhatsApp(rowObj: Record<string, unknown>) {
    const text = buildRowSummaryText(rowObj);
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function shareSelectedToWhatsApp(indices: Set<number>, source: "files" | "paste") {
    const rows = source === "files"
      ? displayResults.filter((_, i) => indices.has(i)).map(buildRowObject)
      : pasteResults.filter((_, i) => indices.has(i)).map(buildPasteRowObject);
    const text = `*السيارات المطلوبة للسحب (${rows.length})*\n\n` +
      rows.map((r, i) => `${i + 1}. 🚗 ${r["رقم اللوحة"]}\n` +
        Object.entries(r).filter(([k]) => k !== "رقم اللوحة" && r[k])
          .map(([k, v]) => `${k}: ${v}`).join("\n")
      ).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function toggleResult(i: number) {
    setSelectedResults((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleAllResults() {
    setSelectedResults((prev) =>
      prev.size === displayResults.length ? new Set() : new Set(displayResults.map((_, i) => i))
    );
  }
  function togglePaste(i: number) {
    setSelectedPaste((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleAllPaste() {
    setSelectedPaste((prev) =>
      prev.size === pasteResults.length ? new Set() : new Set(pasteResults.map((_, i) => i))
    );
  }

  function deleteResult(i: number) {
    const toRemove = displayResults[i];
    setResults((prev) => prev ? prev.filter((r) => r !== toRemove) : null);
    setSelectedResults(new Set());
  }

  function deletePasteResult(i: number) {
    setPasteResults((prev) => prev.filter((_, idx) => idx !== i));
    setSelectedPaste(new Set());
  }

  if (!hydrated) {
    return <p className="py-10 text-center text-sm text-muted">جارٍ تحميل الملفات المحفوظة...</p>;
  }

  return (
    <div className="rtl-text flex flex-col gap-4 w-full min-w-0" dir="rtl">
      <div>
        <h1 className="text-lg font-bold text-ink">الفرز</h1>
        <p className="text-xs text-muted">مطابقة الإحالة (البنك) مع بيانات الميدان</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-xl border border-border bg-surface p-1">
        <button
          onClick={() => setTab("files")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${
            tab === "files" ? "bg-primary text-night font-bold" : "text-muted"
          }`}
        >
          <FileSpreadsheet size={15} />
          رفع الملفات
        </button>
        <button
          onClick={() => setTab("paste")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${
            tab === "paste" ? "bg-primary text-night font-bold" : "text-muted"
          }`}
        >
          <ClipboardPaste size={15} />
          لصق نصي
        </button>
      </div>

      {/* Shared: Data file upload (used by both tabs) */}
      <FileUploadBox
        title="ملف الداتا"
        hint="بيانات الميدان — يُستخدم في كلا المسارين"
        parsedFile={dataFile}
        parsedRowCount={dataTable?.rows.length ?? null}
        onParsed={(table, file) => persistAndSet("data", table, file)}
        onClear={() => clearSlot("data")}
      />

      {/* Output columns picker (shared — built from the data file's real headers) */}
      {dataTable && (
        <div className="rounded-xl border border-border bg-surface">
          <button
            onClick={() => setDataColsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink"
          >
            <span>الأعمدة الظاهرة في النتائج</span>
            <ChevronDown
              size={16}
              className={`text-muted transition-transform duration-200 ${dataColsOpen ? "rotate-180" : ""}`}
            />
          </button>
          {dataColsOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2">
              <p className="mb-2 text-xs text-muted">
                اضغط على أي عمود لإخفائه أو إظهاره. عمود اللوحة: <span className="text-primary">{dataPlateCol}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {dataTable.headers
                  .filter((h) => h !== dataPlateCol)
                  .map((h) => {
                    const mandatory = isMandatory(h);
                    const active = mandatory || outputCols.has(h);
                    return (
                      <button
                        key={h}
                        onClick={() => { if (!mandatory) toggleSet(outputCols, h, setOutputCols); }}
                        disabled={mandatory}
                        title={mandatory ? "عمود إجباري — لا يمكن إخفاؤه" : undefined}
                        className={`rounded-full px-3 py-1 text-xs transition ${
                          active
                            ? mandatory
                              ? "bg-primary text-night font-bold opacity-80 cursor-default"
                              : "bg-primary text-night font-bold"
                            : "border border-border text-muted"
                        }`}
                      >
                        {h}{mandatory ? " 🔒" : ""}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ FILES PATH ════════════ */}
      {tab === "files" && (
        <>
          <FileUploadBox
            title="ملف الإحالة"
            hint="قائمة البنك بالسيارات المطلوبة"
            parsedFile={referralFile}
            parsedRowCount={referralTable?.rows.length ?? null}
            onParsed={(table, file) => persistAndSet("referral", table, file)}
            onClear={() => clearSlot("referral")}
          />

          {referralTable && (
            <div className="rounded-xl border border-border bg-surface">
              <button
                onClick={() => setReferralColsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink"
              >
                <span>أعمدة الإحالة الإضافية</span>
                <ChevronDown
                  size={16}
                  className={`text-muted transition-transform duration-200 ${referralColsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {referralColsOpen && (
                <div className="border-t border-border px-3 pb-3 pt-2">
                  <p className="mb-2 text-xs text-muted">
                    عمود اللوحة المكتشف: <span className="text-primary">{referralPlateCol}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {referralTable.headers
                      .filter((h) => h !== referralPlateCol)
                      .map((h) => (
                        <button
                          key={h}
                          onClick={() => toggleSet(referralExtraCols, h, setReferralExtraCols)}
                          className={`rounded-full px-3 py-1 text-xs transition ${
                            referralExtraCols.has(h)
                              ? "bg-primary text-night font-bold"
                              : "border border-border text-muted"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Check file */}
          <FileUploadBox
            title="ملف التشييك"
            hint="ملف مرجعي للتحقق — يبقى محفوظاً بعد الخروج"
            parsedFile={checkFile}
            parsedRowCount={checkTable?.rows.length ?? null}
            onParsed={(table, file) => persistAndSet("check", table, file)}
            onClear={() => clearSlot("check")}
            showReplaceButtons
          />

          {checkTable && (
            <div className="rounded-xl border border-border bg-surface">
              <button
                onClick={() => setCheckColsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink"
              >
                <span>رؤوس أعمدة ملف التشييك ({checkTable.headers.length})</span>
                <ChevronDown
                  size={16}
                  className={`text-muted transition-transform duration-200 ${checkColsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {checkColsOpen && (
                <div className="border-t border-border px-3 pb-3 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {checkTable.headers.map((h) => (
                      <span
                        key={h}
                        className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {dataTable && referralTable && (
            <button
              onClick={runSort}
              disabled={sorting}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-70"
            >
              <ListFilter size={18} />
              {sorting ? "جارٍ الفرز..." : "ابدأ الفرز"}
            </button>
          )}

          {sorted && results && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "عدد السيارات المطلوبة", val: matchedResults.length, color: "text-brand-glow" },
                  { label: "إجمالي الإحالة", val: referralTable?.rows.length ?? 0, color: "text-ink" },
                  { label: "إجمالي الداتا", val: dataTable?.rows.length ?? 0, color: "text-ink" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
                    <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
                    <p className="text-xs text-muted">{s.label}</p>
                  </div>
                ))}
              </div>

              {fuzzyCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-alert/10 px-3 py-2 text-xs text-alert">
                  <AlertTriangle size={14} />
                  {fuzzyCount} لوحة مشتبه بها (تطابق تقريبي من أصل {exactCount + fuzzyCount}) — تحقق منها يدويًا.
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-ink">السيارات المطلوبة للسحب</h2>
                {gpsCol && (
                  <button onClick={handleNearest} disabled={locating}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                      nearestActive ? "bg-primary text-night font-bold" : "border border-border text-muted hover:text-primary"
                    }`}>
                    <Navigation size={13} />
                    {locating ? "جارٍ..." : "الأقرب"}
                  </button>
                )}
              </div>

              {/* Zoom + select all */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 hover:text-ink transition">
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-xs text-muted w-10 text-center">{Math.round(ZOOM_LEVELS[zoom] * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))} disabled={zoom === ZOOM_LEVELS.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 hover:text-ink transition">
                    <ZoomIn size={14} />
                  </button>
                </div>
                <button onClick={toggleAllResults}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                  {selectedResults.size === displayResults.length && displayResults.length > 0
                    ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                  {selectedResults.size === displayResults.length && displayResults.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              </div>

              {/* Table */}
              <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
                <div style={{ fontSize: `${ZOOM_LEVELS[zoom] * 12}px`, minWidth: "max-content" }}>
                  <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-surface-2 text-muted">
                        <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">☐</th>
                        <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                        <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">نوع التطابق</th>
                        {displayCols.map((col) => (
                          <th key={col} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{col}</th>
                        ))}
                        {[...referralExtraCols].map((col) => (
                          <th key={`ref-${col}`} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{col}</th>
                        ))}
                        {nearestActive && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">المسافة</th>}
                        <th className="border-b border-border px-2 py-2 text-right font-bold whitespace-nowrap">⋮</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayResults.slice(0, visibleCount).map((r, i) => {
                        const plate = plateForRow(r);
                        const isExact = r.status === "exact";
                        const isSelected = selectedResults.has(i);
                        return (
                          <tr key={i} className={`border-b border-border transition ${
                            isSelected ? "bg-primary/15" : isExact ? "bg-brand/5 hover:bg-brand/15" : "bg-alert/5 hover:bg-alert/10"
                          }`}>
                            <td className="border-l border-border px-2 py-2 text-center">
                              <button onClick={() => toggleResult(i)} className="text-muted hover:text-primary transition">
                                {isSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                              </button>
                            </td>
                            <td className="border-l border-border px-3 py-2 font-bold text-ink whitespace-nowrap">
                              {plate}
                            </td>
                            <td className="border-l border-border px-3 py-2 whitespace-nowrap">
                              {isExact
                                ? <span className="flex items-center gap-1 font-bold text-brand-glow"><CheckCircle2 size={12} /> مطابقة</span>
                                : <span className="flex items-center gap-1 font-bold text-alert"><AlertTriangle size={12} /> {r.similarity}%</span>
                              }
                            </td>
                            {displayCols.map((col) => {
                              const val = r.dataRow?.[col] ?? "";
                              return (
                                <td key={col} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                                  {/^https?:\/\//i.test(String(val))
                                    ? <a href={String(val)} target="_blank" rel="noopener noreferrer" className="text-primary underline">📍 خريطة</a>
                                    : String(val) || "—"}
                                </td>
                              );
                            })}
                            {[...referralExtraCols].map((col) => (
                              <td key={`ref-${col}`} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                                {r.referralRow[col] || "—"}
                              </td>
                            ))}
                            {nearestActive && "_dist" in r && (
                              <td className="border-l border-border px-3 py-2 font-bold text-primary whitespace-nowrap">
                                {Number.isFinite((r as { _dist: number })._dist)
                                  ? `${(r as { _dist: number })._dist.toFixed(1)} كم` : "—"}
                              </td>
                            )}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2">
                                <button onClick={async () => {
                                  await navigator.clipboard.writeText(buildRowSummaryText(buildRowObject(r)));
                                  setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1200);
                                }} className="text-muted hover:text-primary transition">
                                  {copiedIdx === i ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                                </button>
                                <button onClick={() => shareRowToWhatsApp(buildRowObject(r))} className="text-muted hover:text-primary transition">
                                  <Share2 size={13} />
                                </button>
                                <button onClick={() => deleteResult(i)} className="text-muted hover:text-danger transition">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {displayResults.length === 0 && <p className="py-8 text-center text-sm text-muted">لا توجد تطابقات.</p>}
                </div>
              </div>

              {displayResults.length > visibleCount && (
                <button onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-ink transition">
                  <ChevronDown size={15} />
                  تحميل المزيد ({displayResults.length - visibleCount} متبقي)
                </button>
              )}

              {/* Bulk action bar */}
              {selectedResults.size > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
                  <span className="text-xs font-bold text-ink">{selectedResults.size} محددة</span>
                  <button onClick={() => shareSelectedToWhatsApp(selectedResults, "files")}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90">
                    <Share2 size={13} /> واتساب
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                {/* Excel button with فتح / تنزيل dropdown */}
                <div className="relative flex-1">
                  <button
                    onClick={() => setShowExcelMenuFiles((v) => !v)}
                    disabled={exportingAll}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60"
                  >
                    <ExternalLink size={16} />
                    فتح في Excel
                  </button>
                  {showExcelMenuFiles && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowExcelMenuFiles(false)} />
                      <div className="absolute bottom-full mb-1 right-0 z-20 w-full rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                        <button onClick={() => { handleOpenAll(); setShowExcelMenuFiles(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2 transition">
                          <ExternalLink size={14} /> فتح
                        </button>
                        <button onClick={() => { handleDownloadAll(); setShowExcelMenuFiles(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2 transition">
                          <Download size={14} /> تنزيل
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* Share file button */}
                <button
                  onClick={handleShareAll}
                  disabled={exportingAll}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"
                >
                  <Share2 size={16} />
                  مشاركة
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════ PASTE PATH ════════════ */}
      {tab === "paste" && (
        <div className="flex flex-col gap-3">
          {/* Paste input */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-bold text-ink">اللوحات الملصوقة</label>
              {pasteText && (
                <button
                  onClick={() => setPasteText("")}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-error"
                >
                  <Trash2 size={13} />
                  مسح
                </button>
              )}
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"الصق اللوحات هنا، كل لوحة في سطر أو مفصولة بفاصلة...\nمثال:\nأبح1234\nABJ5678"}
              rows={6}
              dir="rtl"
              className="rtl-text w-full rounded-xl border border-border bg-surface-2 p-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={runPasteSort}
            disabled={!dataTable || !pasteText.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night disabled:opacity-50"
          >
            <ListFilter size={16} />
            فرز
          </button>

          {pasteRan && (
            <p className="text-xs text-muted">
              {pasteResults.length} لوحة وُجدت في ملف الداتا (يُعرض المتطابق فقط)
            </p>
          )}

          {pasteRan && pasteResults.length > 0 && (
            <div className="flex flex-col gap-3">
              {/* Zoom + select all */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => setZoom((z) => Math.max(0, z - 1))} disabled={zoom === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 hover:text-ink transition">
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-xs text-muted w-10 text-center">{Math.round(ZOOM_LEVELS[zoom] * 100)}%</span>
                  <button onClick={() => setZoom((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))} disabled={zoom === ZOOM_LEVELS.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 hover:text-ink transition">
                    <ZoomIn size={14} />
                  </button>
                </div>
                <button onClick={toggleAllPaste}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                  {selectedPaste.size === pasteResults.length && pasteResults.length > 0
                    ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                  {selectedPaste.size === pasteResults.length && pasteResults.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              </div>

              {/* Table */}
              <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
                <div style={{ fontSize: `${ZOOM_LEVELS[zoom] * 12}px`, minWidth: "max-content" }}>
                  <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-surface-2 text-muted">
                        <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">☐</th>
                        <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                        {pasteAllCols.map((col) => (
                          <th key={col} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{col}</th>
                        ))}
                        <th className="border-b border-border px-2 py-2 text-right font-bold whitespace-nowrap">⋮</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pasteResults.slice(0, pasteVisibleCount).map((p, i) => {
                        const isSelected = selectedPaste.has(i);
                        return (
                          <tr key={i} className={`border-b border-border transition ${
                            isSelected ? "bg-primary/15" : "bg-brand/5 hover:bg-brand/15"
                          }`}>
                            <td className="border-l border-border px-2 py-2 text-center">
                              <button onClick={() => togglePaste(i)} className="text-muted hover:text-primary transition">
                                {isSelected ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                              </button>
                            </td>
                            <td className="border-l border-border px-3 py-2 font-bold text-ink whitespace-nowrap">
                              {p.converted}
                            </td>
                            {pasteAllCols.map((col) => {
                              const val = p.row[col] ?? "";
                              return (
                                <td key={col} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                                  {/^https?:\/\//i.test(val)
                                    ? <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary underline">📍 خريطة</a>
                                    : val || "—"}
                                </td>
                              );
                            })}
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-2">
                                <button onClick={async () => {
                                  await navigator.clipboard.writeText(buildRowSummaryText(buildPasteRowObject(p)));
                                  setCopiedIdx(i + 10000); setTimeout(() => setCopiedIdx(null), 1200);
                                }} className="text-muted hover:text-primary transition">
                                  {copiedIdx === i + 10000 ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                                </button>
                                <button onClick={() => shareRowToWhatsApp(buildPasteRowObject(p))} className="text-muted hover:text-primary transition">
                                  <Share2 size={13} />
                                </button>
                                <button onClick={() => deletePasteResult(i)} className="text-muted hover:text-danger transition">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {pasteResults.length > pasteVisibleCount && (
                <button onClick={() => setPasteVisibleCount((v) => v + PAGE_SIZE)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-ink transition">
                  <ChevronDown size={15} />
                  تحميل المزيد ({pasteResults.length - pasteVisibleCount} متبقي)
                </button>
              )}

              {/* Bulk action bar */}
              {selectedPaste.size > 0 && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                  <span className="text-xs font-bold text-ink">{selectedPaste.size} محددة</span>
                  <button onClick={() => shareSelectedToWhatsApp(selectedPaste, "paste")}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night">
                    <Share2 size={13} /> واتساب
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                {/* Excel button with فتح / تنزيل dropdown */}
                <div className="relative flex-1">
                  <button
                    onClick={() => setShowExcelMenuPaste((v) => !v)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary"
                  >
                    <ExternalLink size={16} />
                    فتح في Excel
                  </button>
                  {showExcelMenuPaste && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowExcelMenuPaste(false)} />
                      <div className="absolute bottom-full mb-1 right-0 z-20 w-full rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                        <button onClick={() => { handleOpenPaste(); setShowExcelMenuPaste(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2 transition">
                          <ExternalLink size={14} /> فتح
                        </button>
                        <button onClick={() => { handleDownloadPaste(); setShowExcelMenuPaste(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2 transition">
                          <Download size={14} /> تنزيل
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* Share file button */}
                <button
                  onClick={handleSharePaste}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90"
                >
                  <Share2 size={16} />
                  مشاركة
                </button>
              </div>
            </div>
          )}

          {pasteRan && pasteResults.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">لا توجد تطابقات في ملف الداتا.</p>
          )}

          {!dataTable && <p className="text-xs text-alert">رفع «ملف الداتا» بالأعلى مطلوب أولاً قبل الفرز.</p>}
        </div>
      )}
    </div>
  );
}

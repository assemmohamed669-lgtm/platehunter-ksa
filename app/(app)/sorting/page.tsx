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
} from "lucide-react";
import PlateBadge from "@/components/PlateBadge";
import FileUploadBox from "@/components/FileUploadBox";
import { supabase } from "@/lib/supabaseClient";
import {
  type ExcelTable,
  buildExcelBlob,
  downloadExcelBlob,
  openExcelBlob,
  buildRowSummaryText,
  shareOrCopyText,
} from "@/lib/excel";
import {
  detectPlateColumn,
  matchReferralAgainstData,
  bankPlateToArabic,
  normalizePlate,
  type MatchResult,
} from "@/lib/plateParser";
import { haversineKm, extractLatLngFromMapsLink } from "@/lib/gps";
import {
  saveUploadedFile,
  getUploadedFile,
  deleteUploadedFile,
  type UploadedFileRecord,
} from "@/lib/idb";

const ZOOM_CLASSES = ["text-xs", "text-sm", "text-base", "text-lg"];
const PAGE_SIZE = 50;

// Pre-select exactly the columns the spec calls out as defaults: Vehicle
// Type, Manufacturer, Vehicle Color, and GPS Link (Plate Number is always
// shown separately, not part of this toggle list). Every other detected
// column starts unchecked — the user opts into them deliberately.
function guessDefaultColumns(headers: string[], exclude?: string | null): string[] {
  const keywords = ["نوع", "ماركة", "الشركة", "الصانع", "manufacturer", "اللون", "color", "gps", "رابط", "موقع"];
  return headers.filter(
    (h) => h !== exclude && keywords.some((k) => h.toLowerCase().includes(k.toLowerCase()))
  );
}

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

  // Column selection — built from the *real* headers of each uploaded file
  const [referralExtraCols, setReferralExtraCols] = useState<Set<string>>(new Set());
  const [outputCols, setOutputCols] = useState<Set<string>>(new Set());

  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [nearestActive, setNearestActive] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  // Paste-text path — now filtered to matches only
  const [pasteText, setPasteText] = useState("");
  const [pasteResults, setPasteResults] = useState<
    { converted: string; row: Record<string, string> }[]
  >([]);
  const [pasteRan, setPasteRan] = useState(false);
  const [pasteVisibleCount, setPasteVisibleCount] = useState(PAGE_SIZE);

  // ── Bootstrap: identity + restore persisted files from IndexedDB ────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setHydrated(true);
        return;
      }
      const uid = data.user.id;
      setAgentId(uid);

      const [dataRec, refRec] = await Promise.all([
        getUploadedFile(uid, "data"),
        getUploadedFile(uid, "referral"),
      ]);

      if (dataRec) {
        setDataTable({ headers: dataRec.headers, rows: dataRec.rows });
        setDataFile(
          new File([dataRec.fileBlob ?? new Blob()], dataRec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          })
        );
      }
      if (refRec) {
        setReferralTable({ headers: refRec.headers, rows: refRec.rows });
        setReferralFile(
          new File([refRec.fileBlob ?? new Blob()], refRec.fileName, {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          })
        );
      }
      setHydrated(true);
    });
  }, []);

  const dataPlateCol = dataTable ? detectPlateColumn(dataTable.headers) : null;
  const referralPlateCol = referralTable ? detectPlateColumn(referralTable.headers) : null;
  const gpsCol = dataTable ? findGpsColumn(dataTable.headers) : null;

  // Seed a sensible default column selection the first time each table loads
  useEffect(() => {
    if (dataTable && outputCols.size === 0) {
      setOutputCols(new Set(guessDefaultColumns(dataTable.headers, dataPlateCol)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTable]);

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  }

  // ── Persisted upload handlers (data / referral slots) ───────────────
  const persistAndSet = useCallback(
    async (slot: "data" | "referral", table: ExcelTable, file: File) => {
      const record: UploadedFileRecord = {
        key: `${agentId}:${slot}`,
        agentId,
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
      } else {
        setReferralTable(table);
        setReferralFile(file);
        setReferralExtraCols(new Set());
      }
      setResults(null);
      setSorted(false);
    },
    [agentId]
  );

  async function clearSlot(slot: "data" | "referral") {
    if (agentId) await deleteUploadedFile(agentId, slot);
    if (slot === "data") {
      setDataTable(null);
      setDataFile(null);
      setOutputCols(new Set());
    } else {
      setReferralTable(null);
      setReferralFile(null);
      setReferralExtraCols(new Set());
    }
    setResults(null);
    setSorted(false);
  }

  // ── Run matching ──────────────────────────────────────────────────
  function runSort() {
    if (!dataTable || !referralTable || !dataPlateCol || !referralPlateCol) return;
    const matched = matchReferralAgainstData(
      referralTable.rows,
      referralPlateCol,
      dataTable.rows,
      dataPlateCol
    );
    setResults(matched);
    setSorted(true);
    setNearestActive(false);
    setVisibleCount(PAGE_SIZE);
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
    const raw = String(r.referralRow[referralPlateCol ?? ""] ?? "");
    return bankPlateToArabic(raw);
  }

  function buildRowObject(r: MatchResult): Record<string, unknown> {
    const row: Record<string, unknown> = { "رقم اللوحة": plateForRow(r) };
    for (const col of outputCols) row[col] = r.dataRow?.[col] ?? "";
    for (const col of referralExtraCols) row[col] = r.referralRow[col] ?? "";
    row["نوع التطابق"] = r.status === "exact" ? "مطابقة كاملة" : `مشتبه به (${r.similarity}%)`;
    return row;
  }

  async function handleDownloadAll() {
    setExportingAll(true);
    const rows = matchedResults.map(buildRowObject);
    const blob = buildExcelBlob(rows, "نتائج الفرز");
    downloadExcelBlob(blob, `فرز-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExportingAll(false);
  }

  async function handleOpenAll() {
    setExportingAll(true);
    const rows = matchedResults.map(buildRowObject);
    const blob = buildExcelBlob(rows, "نتائج الفرز");
    const filename = `فرز-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const result = await openExcelBlob(blob, filename);
    setExportingAll(false);
    if (result === "downloaded") {
      alert("✅ تم حفظ الملف — افتح مجلد التنزيلات واضغط عليه لفتحه في Excel");
    }
  }

  // ── Paste-text path: only matches are kept ──────────────────────────
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
    const row: Record<string, unknown> = { "رقم اللوحة": p.converted };
    for (const col of outputCols) row[col] = p.row[col] ?? "";
    return row;
  }

  async function handleDownloadPaste() {
    const rows = pasteResults.map(buildPasteRowObject);
    const blob = buildExcelBlob(rows, "نتائج اللصق");
    downloadExcelBlob(blob, `لصق-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleOpenPaste() {
    const rows = pasteResults.map(buildPasteRowObject);
    const blob = buildExcelBlob(rows, "نتائج اللصق");
    const filename = `لصق-${new Date().toISOString().slice(0, 10)}.xlsx`;
    const result = await openExcelBlob(blob, filename);
    if (result === "downloaded") {
      alert("✅ تم حفظ الملف — افتح مجلد التنزيلات واضغط عليه لفتحه في Excel");
    }
  }

  // ── Shared per-row action buttons (Copy / Share) — defined at module
  // scope above, so its internal `copied` state survives re-renders.

  const exactCount = results ? results.filter((r) => r.status === "exact").length : 0;
  const fuzzyCount = results ? results.filter((r) => r.status === "fuzzy").length : 0;

  if (!hydrated) {
    return <p className="py-10 text-center text-sm text-muted">جارٍ تحميل الملفات المحفوظة...</p>;
  }

  return (
    <div className="rtl-text flex flex-col gap-4" dir="rtl">
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
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="mb-2 text-sm font-bold text-ink">أعمدة النتيجة النهائية</p>
          <p className="mb-2 text-xs text-muted">
            عمود اللوحة المكتشف: <span className="text-primary">{dataPlateCol}</span> (يظهر دائمًا كـ «رقم اللوحة»)
          </p>
          <div className="flex flex-wrap gap-2">
            {dataTable.headers
              .filter((h) => h !== dataPlateCol)
              .map((h) => (
                <button
                  key={h}
                  onClick={() => toggleSet(outputCols, h, setOutputCols)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    outputCols.has(h) ? "bg-primary text-night font-bold" : "border border-border text-muted"
                  }`}
                >
                  {h}
                </button>
              ))}
          </div>
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
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="mb-2 text-sm font-bold text-ink">أعمدة الإحالة الإضافية</p>
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

          {dataTable && referralTable && (
            <button
              onClick={runSort}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90"
            >
              <ListFilter size={18} />
              ابدأ الفرز
            </button>
          )}

          {sorted && results && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "عدد السيارات المطلوبة", val: matchedResults.length, color: "text-glow" },
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

              <h2 className="text-base font-bold text-ink">السيارات المطلوبة للسحب</h2>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZoom((z) => Math.max(0, z - 1))}
                    className="rounded-full border border-border p-1.5 text-muted hover:text-ink"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(3, z + 1))}
                    className="rounded-full border border-border p-1.5 text-muted hover:text-ink"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
                {gpsCol && (
                  <button
                    onClick={handleNearest}
                    disabled={locating}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                      nearestActive ? "bg-primary text-night font-bold" : "border border-border text-muted hover:text-primary"
                    }`}
                  >
                    <Navigation size={13} />
                    {locating ? "جارٍ تحديد الموقع..." : "الأقرب لموقعي"}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {displayResults.slice(0, visibleCount).map((r, i) => {
                  const plate = plateForRow(r);
                  const gpsLink = gpsCol ? r.dataRow?.[gpsCol] ?? "" : "";
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 ${ZOOM_CLASSES[zoom]} ${
                        r.status === "exact" ? "border-glow/60 bg-glow/10 shadow-glow" : "border-alert/50 bg-alert/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PlateBadge value={plate} size="sm" />
                        </div>
                        <div className="flex items-center gap-2">
                          {r.status === "exact" ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-glow">
                              <CheckCircle2 size={13} /> مطابقة كاملة
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs font-bold text-alert">
                              <AlertTriangle size={13} /> {r.similarity}%
                            </span>
                          )}
                          <ResultActions rowObj={buildRowObject(r)} />
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                        {[...outputCols].map(
                          (col) =>
                            r.dataRow?.[col] && (
                              <span key={col}>
                                {col}: {r.dataRow[col]}
                              </span>
                            )
                        )}
                        {nearestActive && "_dist" in r && Number.isFinite((r as { _dist: number })._dist) && (
                          <span className="font-bold text-primary">
                            📍 {(r as { _dist: number })._dist.toFixed(1)} كم
                          </span>
                        )}
                      </div>

                      {gpsLink && (
                        <a href={gpsLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">
                          فتح في الخريطة
                        </a>
                      )}
                    </div>
                  );
                })}

                {displayResults.length === 0 && <p className="py-8 text-center text-sm text-muted">لا توجد تطابقات.</p>}

                {displayResults.length > visibleCount && (
                  <button
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-ink transition"
                  >
                    <ChevronDown size={15} />
                    تحميل المزيد ({displayResults.length - visibleCount} متبقي)
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDownloadAll}
                  disabled={exportingAll}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60"
                >
                  <Download size={16} />
                  حفظ الملف
                </button>
                <button
                  onClick={handleOpenAll}
                  disabled={exportingAll}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"
                >
                  <ExternalLink size={16} />
                  فتح في Excel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════ PASTE PATH ════════════ */}
      {tab === "paste" && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-ink">اللوحات الملصوقة</label>
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
              {pasteResults.length} تطابق وُجد داخل ملف الداتا (يُعرض المتطابق فقط)
            </p>
          )}

          {pasteRan && pasteResults.length > 0 && (
            <div className="flex flex-col gap-2">
              {pasteResults.slice(0, pasteVisibleCount).map((p, i) => (
                <div key={i} className="rounded-xl border border-glow/60 bg-glow/10 p-3 shadow-glow">
                  <div className="flex items-center justify-between">
                    <PlateBadge value={p.converted} size="sm" />
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-glow" />
                      <ResultActions rowObj={buildPasteRowObject(p)} />
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {[...outputCols].map(
                      (col) =>
                        p.row[col] && (
                          <span key={col}>
                            {col}: {p.row[col]}
                          </span>
                        )
                    )}
                  </div>
                </div>
              ))}

              {pasteResults.length > pasteVisibleCount && (
                <button
                  onClick={() => setPasteVisibleCount((v) => v + PAGE_SIZE)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-ink transition"
                >
                  <ChevronDown size={15} />
                  تحميل المزيد ({pasteResults.length - pasteVisibleCount} متبقي)
                </button>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleDownloadPaste}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary"
                >
                  <Download size={16} />
                  حفظ الملف
                </button>
                <button
                  onClick={handleOpenPaste}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90"
                >
                  <ExternalLink size={16} />
                  فتح في Excel
                </button>
              </div>
            </div>
          )}

          {pasteRan && pasteResults.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">لا توجد تطابقات داخل ملف الداتا.</p>
          )}

          {!dataTable && <p className="text-xs text-alert">رفع «ملف الداتا» بالأعلى مطلوب أولًا قبل الفرز.</p>}
        </div>
      )}
    </div>
  );
}

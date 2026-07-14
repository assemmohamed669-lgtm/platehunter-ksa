"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ListFilter, CheckCircle2, AlertTriangle, Copy, Check, Share2,
  Navigation, ZoomIn, ZoomOut, FileSpreadsheet, Download,
  ExternalLink, ChevronDown, CheckSquare, Square, Trash2, ScanLine, X,
} from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import PlateBadge from "@/components/PlateBadge";
import {
  type ExcelTable, buildSpreadsheetBlob, buildCsvBlob, downloadExcelBlob,
  openExcelBlob, shareExcelBlob, buildRowSummaryText, buildColoredSortExcel,
} from "@/lib/excel";
import {
  detectPlateColumn, detectArabicPlateColumn, bankPlateToArabic, normalizePlate, reversePlateLetters, matchTokensAgainstRows, tokenizePastedPlates, type MatchResult, type TokenMatch,
} from "@/lib/plateParser";
import { matchesPreferred, guessDefaultColumns, isMandatory } from "@/lib/sortingCols";
import { haversineKm, extractLatLngFromMapsLink, toMapsLink, parseLatLngCell, estimateDriveMinutes, formatDistanceKm, formatDurationMin } from "@/lib/gps";
import {
  saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord,
  getAllFieldCheckEntries, type FieldCheckEntry,
} from "@/lib/idb";
import OpenDownloadButton from "@/components/OpenDownloadButton";

const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];
const PAGE_SIZE = 50;
const SORT_RESULTS_KEY = "platehunter:sort-results";
const PASTE_RESULTS_KEY = "platehunter:paste-results";

const DUPE_COLORS = [
  { tw: "bg-yellow-100",  hex: "#FEF9C3" },
  { tw: "bg-blue-100",    hex: "#DBEAFE" },
  { tw: "bg-green-100",   hex: "#DCFCE7" },
  { tw: "bg-purple-100",  hex: "#F3E8FF" },
  { tw: "bg-orange-100",  hex: "#FFEDD5" },
  { tw: "bg-pink-100",    hex: "#FCE7F3" },
  { tw: "bg-teal-100",    hex: "#CCFBF1" },
  { tw: "bg-red-100",     hex: "#FEE2E2" },
] as const;

type TashyeekResultRow = { tashyeekRow: Record<string, string>; referralRow: Record<string, string> };

function persistSortResults(
  results: MatchResult[],
  tashyeekResults: TashyeekResultRow[] | null,
  sortMode: "new" | "full",
  newPlatesCount: number,
) {
  try {
    localStorage.setItem(SORT_RESULTS_KEY, JSON.stringify({ results, tashyeekResults, sortMode, newPlatesCount }));
  } catch { /* storage full */ }
}

function wipeSortResults() {
  try { localStorage.removeItem(SORT_RESULTS_KEY); } catch { /* ignore */ }
}

function persistPasteResults(
  results: TokenMatch[],
  recordResults: TokenMatch[],
  text: string,
) {
  try {
    localStorage.setItem(PASTE_RESULTS_KEY, JSON.stringify({ results, recordResults, text }));
  } catch { /* storage full */ }
}

function wipePasteResults() {
  try { localStorage.removeItem(PASTE_RESULTS_KEY); } catch { /* ignore */ }
}

function findGpsColumn(headers: string[]): string | null {
  return headers.find((h) => /GPS|رابط|موقع|خريطة/i.test(h)) ?? null;
}

export default function SortingPage() {
  const [sortMode, setSortMode] = useState<"new" | "full">("new");
  const [hydrated, setHydrated] = useState(false);

  // ── Data file ──
  const [dataTable, setDataTable] = useState<ExcelTable | null>(null);
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [dataColsOpen, setDataColsOpen] = useState(false);
  const [dataBoxOpen, setDataBoxOpen] = useState(true); // collapse/expand the whole "مربع الداتا"
  const [outputCols, setOutputCols] = useState<Set<string>>(new Set());
  const [dataPlateColOverride, setDataPlateColOverride] = useState<string | null>(null);

  // ── Referral file (single, shared between new/full sort) ──
  const [referralTable, setReferralTable] = useState<ExcelTable | null>(null);
  const [referralFile, setReferralFile] = useState<File | null>(null);
  const [referralColsOpen, setReferralColsOpen] = useState(false);
  const [referralBoxOpen, setReferralBoxOpen] = useState(true); // collapse/expand the whole "مربع الإحالة"
  const [referralExtraCols, setReferralExtraCols] = useState<Set<string>>(new Set());
  const [referralPlateColOverride, setReferralPlateColOverride] = useState<string | null>(null);

  // ── Check file (read from IDB, uploaded in صفحة التشييك) ──
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkPlateColOverride, setCheckPlateColOverride] = useState<string | null>(null);

  // ── Tashyeek file (manual entries from registration page) ──
  const [tashyeekTable, setTashyeekTable] = useState<ExcelTable | null>(null);
  const [tashyeekFile, setTashyeekFile] = useState<File | null>(null);
  const [tashyeekResults, setTashyeekResults] = useState<TashyeekResultRow[] | null>(null);
  const [tashyeekSelected, setTashyeekSelected] = useState<Set<number>>(new Set());
  const [tashyeekCopiedIdx, setTashyeekCopiedIdx] = useState<number | null>(null);
  const [pasteSelected, setPasteSelected] = useState<Set<number>>(new Set());
  const [pasteCopiedIdx, setPasteCopiedIdx] = useState<number | null>(null);
  const [pasteRecordCopiedIdx, setPasteRecordCopiedIdx] = useState<number | null>(null);
  const [tashyeekColsOpen, setTashyeekColsOpen] = useState(false);

  // ── Sort results ──
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [zoom, setZoom] = useState(3);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [nearestActive, setNearestActive] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [showExcelMenuSort, setShowExcelMenuSort] = useState(false);
  const [newPlatesCount, setNewPlatesCount] = useState(0);

  // ── Paste ──
  const [pasteText, setPasteText] = useState("");
  const [pasteResults, setPasteResults] = useState<TokenMatch[]>([]);
  // تطابق نفس اللوحات الملصوقة مع شيت السجلات (tashyeekTable) — لوحات سبق
  // تشييكها صوت/يدوي قبل كدة، منفصلة عن تطابق ملف الداتا لأن أعمدتها مختلفة.
  const [pasteRecordResults, setPasteRecordResults] = useState<TokenMatch[]>([]);
  const [pasteRan, setPasteRan] = useState(false);
  const [pasteZoom, setPasteZoom] = useState(1);
  const [showExcelMenuPaste, setShowExcelMenuPaste] = useState(false);

  // ── Bootstrap ──
  useEffect(() => {
    Promise.all([
      getUploadedFile("local", "data"),
      getUploadedFile("local", "referral"),
      getUploadedFile("local", "check"),
    ])
      .then(async ([dataRec, refRec, checkRec]) => {
        if (dataRec) {
          setDataTable({ headers: dataRec.headers, rows: dataRec.rows });
          setDataFile(new File([dataRec.fileBlob ?? new Blob()], dataRec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        }
        if (refRec) {
          setReferralTable({ headers: refRec.headers, rows: refRec.rows });
          setReferralFile(new File([refRec.fileBlob ?? new Blob()], refRec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          const p = detectPlateColumn(refRec.headers, refRec.rows);
          setReferralExtraCols(new Set(refRec.headers.filter((h) => h !== p && matchesPreferred(h))));
        }
        if (checkRec) {
          setCheckTable({ headers: checkRec.headers, rows: checkRec.rows });
        }
        // شيت التسجيلات (الميداني) يغذّي الفرز تلقائياً — يُبنى من السجلات المحفوظة
        // في التطبيق، ويحل محل رفع ملف تشييك يدوي.
        try {
          const fieldEntries = await getAllFieldCheckEntries();
          if (fieldEntries.length > 0) {
            const keys = new Set<string>(["رقم اللوحة"]);
            for (const e of fieldEntries) for (const k of Object.keys(e.row)) keys.add(k);
            keys.add("GPS");
            const headers = [...keys];
            const rows = fieldEntries.map((e) => ({ "رقم اللوحة": e.plate, ...e.row, "GPS": e.mapsLink ?? "" } as Record<string, string>));
            setTashyeekTable({ headers, rows });
            setTashyeekFile(null);
          }
        } catch { /* no field sheet yet */ }
        try {
          const raw = localStorage.getItem(SORT_RESULTS_KEY);
          if (raw) {
            const s = JSON.parse(raw);
            if (Array.isArray(s.results) && s.results.length > 0) {
              setSortMode(s.sortMode ?? "full");
              setNewPlatesCount(s.newPlatesCount ?? 0);
              setResults(s.results);
              setSorted(true);
              if (Array.isArray(s.tashyeekResults)) setTashyeekResults(s.tashyeekResults);
            }
          }
        } catch { /* corrupt storage */ }
        try {
          const rawPaste = localStorage.getItem(PASTE_RESULTS_KEY);
          if (rawPaste) {
            const s = JSON.parse(rawPaste);
            if (Array.isArray(s.results) && s.results.length > 0) {
              setPasteResults(s.results);
              if (Array.isArray(s.recordResults)) setPasteRecordResults(s.recordResults);
              setPasteText(s.text ?? "");
              setPasteRan(true);
            }
          }
        } catch { /* corrupt paste storage */ }
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const { slot } = (e as CustomEvent<{ slot: string }>).detail;
      if (slot === "referral") {
        getUploadedFile("local", "referral").then((rec) => {
          if (!rec) return;
          setReferralTable({ headers: rec.headers, rows: rec.rows });
          setReferralFile(new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          setReferralPlateColOverride(null);
          setResults(null); setSorted(false);
          const p = detectPlateColumn(rec.headers, rec.rows);
          setReferralExtraCols(new Set(rec.headers.filter((h) => h !== p && matchesPreferred(h))));
        });
      } else if (slot === "data") {
        getUploadedFile("local", "data").then((rec) => {
          if (!rec) return;
          setDataTable({ headers: rec.headers, rows: rec.rows });
          setDataFile(new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          setDataPlateColOverride(null);
          setResults(null); setSorted(false);
          setOutputCols(new Set(guessDefaultColumns(rec.headers, detectPlateColumn(rec.headers, rec.rows))));
        });
      }
    };
    window.addEventListener("idbFileUpdated", handler);
    return () => window.removeEventListener("idbFileUpdated", handler);
  }, []);

  useEffect(() => {
    if (dataTable) {
      const p = detectPlateColumn(dataTable.headers, dataTable.rows);
      setOutputCols(new Set(guessDefaultColumns(dataTable.headers, p)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTable]);

  useEffect(() => {
    if (referralTable) {
      const p = detectPlateColumn(referralTable.headers, referralTable.rows);
      setReferralExtraCols(new Set(referralTable.headers.filter((h) => h !== p && matchesPreferred(h))));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralTable]);

  // ── Derived ──
  const dataPlateCol = dataTable ? detectPlateColumn(dataTable.headers, dataTable.rows) : null;
  const referralArabicPlateCol = referralTable ? detectArabicPlateColumn(referralTable.headers) : null;
  const referralPlateCol = referralArabicPlateCol ?? (referralTable ? detectPlateColumn(referralTable.headers, referralTable.rows) : null);
  const referralPlateIsArabic = referralArabicPlateCol !== null;
  const checkPlateCol = checkTable ? detectPlateColumn(checkTable.headers, checkTable.rows) : null;
  const gpsCol = dataTable ? findGpsColumn(dataTable.headers) : null;

  const effectiveDataPlateCol = dataPlateColOverride ?? dataPlateCol;
  const effectiveReferralPlateCol = referralPlateColOverride ?? referralPlateCol;
  const effectiveCheckPlateCol = checkPlateColOverride ?? checkPlateCol;
  const tashyeekPlateCol = tashyeekTable ? detectPlateColumn(tashyeekTable.headers, tashyeekTable.rows) : null;

  const displayCols = useMemo(() => {
    const mandatory = dataTable?.headers.filter((h) => h !== effectiveDataPlateCol && isMandatory(h)) ?? [];
    const rest = [...outputCols].filter((h) => !isMandatory(h));
    return [...new Set([...mandatory, ...rest])];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTable, effectiveDataPlateCol, outputCols]);

  const matchedResults = useMemo(() => (results ? results.filter((r) => r.status !== "none") : []), [results]);

  const plateColorMap = useMemo(() => {
    if (!results || !effectiveReferralPlateCol) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const r of results) {
      const k = normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol] ?? "")));
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const map = new Map<string, number>();
    let ci = 0;
    for (const [plate, count] of counts) {
      if (count > 1) { map.set(plate, ci % DUPE_COLORS.length); ci++; }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, effectiveReferralPlateCol]);

  const displayResults = useMemo(() => {
    if (!nearestActive || !userLoc || !gpsCol) return matchedResults;
    return [...matchedResults]
      .map((r) => {
        const coords = parseLatLngCell(r.dataRow?.[gpsCol] ?? "");
        const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
        return { ...r, _dist: dist, _min: estimateDriveMinutes(dist) };
      })
      .sort((a, b) => a._dist - b._dist);
  }, [matchedResults, nearestActive, userLoc, gpsCol]);

  // عمود GPS في شيت التسجيلات — لترتيب «الأقرب» + حساب الوقت.
  const tashyeekGpsCol = useMemo(() => (tashyeekTable ? findGpsColumn(tashyeekTable.headers) : null), [tashyeekTable]);

  // نافذة التسجيلات مرتّبة بالأقرب (لو مفعّل) مع الاحتفاظ بالفهرس الأصلي للتحديد.
  const displayTashyeek = useMemo(() => {
    const base = (tashyeekResults ?? []).map((r, idx) => ({ r, idx, _dist: Infinity, _min: Infinity }));
    if (!nearestActive || !userLoc || !tashyeekGpsCol) return base;
    return base
      .map((x) => {
        const coords = parseLatLngCell(x.r.tashyeekRow?.[tashyeekGpsCol] ?? x.r.referralRow?.[tashyeekGpsCol] ?? "");
        const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
        return { ...x, _dist: dist, _min: estimateDriveMinutes(dist) };
      })
      .sort((a, b) => a._dist - b._dist);
  }, [tashyeekResults, nearestActive, userLoc, tashyeekGpsCol]);

  // نتائج اللصق مرتّبة بالأقرب (لو مفعّل) — لوحات اللصق بتطابق ملف الداتا،
  // فبنقرأ نفس عمود GPS بتاع الداتا (gpsCol). لو مش مفعّل → نفس الترتيب الأصلي.
  const displayPaste = useMemo(() => {
    if (!nearestActive || !userLoc || !gpsCol) return pasteResults;
    return [...pasteResults]
      .map((p) => {
        const coords = parseLatLngCell(String(p.row?.[gpsCol] ?? ""));
        const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
        return { ...p, _dist: dist, _min: estimateDriveMinutes(dist) };
      })
      .sort((a, b) => a._dist - b._dist);
  }, [pasteResults, nearestActive, userLoc, gpsCol]);

  const pasteColorMap = useMemo(() => {
    if (!pasteResults.length) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const p of pasteResults) {
      const k = normalizePlate(bankPlateToArabic(p.converted));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const map = new Map<string, number>();
    let ci = 0;
    for (const [plate, count] of counts) {
      if (count > 1) { map.set(plate, ci % DUPE_COLORS.length); ci++; }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteResults]);

  const pasteAllCols = dataTable ? dataTable.headers.filter((h) => h !== effectiveDataPlateCol) : [];
  const pasteRecordCols = tashyeekTable ? tashyeekTable.headers.filter((h) => h !== tashyeekPlateCol) : [];

  const canSort = sortMode === "new"
    ? !!dataTable && !!referralTable && !!checkTable && !!effectiveDataPlateCol && !!effectiveReferralPlateCol && !!effectiveCheckPlateCol
    : !!dataTable && !!referralTable && !!effectiveDataPlateCol && !!effectiveReferralPlateCol;

  // ── Persist ──
  const persistAndSet = useCallback(async (slot: "data" | "referral", table: ExcelTable, file: File) => {
    const record: UploadedFileRecord = {
      key: `local:${slot}`, agentId: "local", slot,
      fileName: file.name, headers: table.headers, rows: table.rows,
      uploadedAt: new Date().toISOString(), fileBlob: file,
    };
    await saveUploadedFile(record);
    if (slot === "data") {
      setDataTable(table); setDataFile(file); setDataPlateColOverride(null);
      setOutputCols(new Set(guessDefaultColumns(table.headers, detectPlateColumn(table.headers, table.rows))));
      setDataColsOpen(false); setResults(null); setSorted(false); wipeSortResults();
    } else {
      setReferralTable(table); setReferralFile(file); setReferralPlateColOverride(null);
      const p = detectPlateColumn(table.headers, table.rows);
      setReferralExtraCols(new Set(table.headers.filter((h) => h !== p && matchesPreferred(h))));
      setReferralColsOpen(false); setResults(null); setSorted(false); wipeSortResults();
    }
  }, []);

  async function clearSlot(slot: "data" | "referral") {
    await deleteUploadedFile("local", slot);
    if (slot === "data") {
      setDataTable(null); setDataFile(null); setDataPlateColOverride(null); setOutputCols(new Set());
    } else {
      setReferralTable(null); setReferralFile(null); setReferralPlateColOverride(null); setReferralExtraCols(new Set());
    }
    setResults(null); setSorted(false); wipeSortResults();
  }

  const persistAndSetTashyeek = useCallback(async (table: ExcelTable, file: File) => {
    // crash-safe (xlsx → CSV fallback); the stored blob is only for re-download
    const { blob } = buildSpreadsheetBlob(table.rows, "ملف التشييك");
    await saveUploadedFile({
      key: "local:tashyeek", agentId: "local", slot: "tashyeek",
      fileName: file.name, headers: table.headers, rows: table.rows,
      uploadedAt: new Date().toISOString(), fileBlob: blob,
    });
    setTashyeekTable(table); setTashyeekFile(file); setTashyeekResults(null);
  }, []);

  async function clearTashyeekSlot() {
    await deleteUploadedFile("local", "tashyeek");
    setTashyeekTable(null); setTashyeekFile(null); setTashyeekResults(null);
  }

  async function shareTashyeekFile() {
    if (!tashyeekTable) return;
    try {
      // buildSpreadsheetBlob (xlsx → CSV fallback) so the build can't crash
      // on the device WebView — that crash, when buildExcelBlob was outside
      // the try, was why these buttons did nothing.
      const { blob, ext } = buildSpreadsheetBlob(tashyeekTable.rows, "ملف التشييك");
      await shareExcelBlob(blob, `ملف-التشييك.${ext}`, "ملف التشييك");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت مشاركة الملف");
    }
  }

  async function downloadTashyeekFile() {
    if (!tashyeekTable) return;
    try {
      const { blob, ext } = buildSpreadsheetBlob(tashyeekTable.rows, "ملف التشييك");
      await openExcelBlob(blob, `ملف-التشييك.${ext}`);
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    }
  }

  function toggleSet(set: Set<string>, key: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  }

  // ── Full sort ──
  async function runFullSort() {
    if (!dataTable || !referralTable || !effectiveDataPlateCol || !effectiveReferralPlateCol) return;
    setSorting(true);
    await new Promise<void>((r) => setTimeout(r, 10));
    try {
      const refIndex = new Map<string, Record<string, string>>();
      for (const row of referralTable.rows) {
        const raw = String(row[effectiveReferralPlateCol] ?? "");
        const n = referralPlateIsArabic
          ? normalizePlate(raw)
          : normalizePlate(bankPlateToArabic(raw));
        if (!n || refIndex.has(n)) continue;
        refIndex.set(n, row);
        if (!referralPlateIsArabic && /[A-Za-z]/.test(raw)) {
          const rev = reversePlateLetters(n);
          if (rev !== n) refIndex.set(rev, row);
        }
      }
      const matches: MatchResult[] = [];
      const rows = dataTable.rows;
      const CHUNK = 16000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, rows.length);
        for (let j = i; j < end; j++) {
          const dataRow = rows[j];
          const n = normalizePlate(bankPlateToArabic(String(dataRow[effectiveDataPlateCol] ?? "")));
          if (!n) continue;
          const refRow = refIndex.get(n);
          if (refRow) matches.push({ referralRow: refRow, dataRow, status: "exact" });
        }
        if (end < rows.length) await new Promise<void>((r) => setTimeout(r, 0));
      }
      let finalTashyeek: TashyeekResultRow[] | null = null;
      if (tashyeekTable && tashyeekPlateCol) {
        const tashyeekMatches: TashyeekResultRow[] = [];
        for (const row of tashyeekTable.rows) {
          const n = normalizePlate(bankPlateToArabic(String(row[tashyeekPlateCol] ?? "")));
          if (!n) continue;
          const refRow = refIndex.get(n);
          if (refRow) tashyeekMatches.push({ tashyeekRow: row, referralRow: refRow });
        }
        finalTashyeek = tashyeekMatches;
      }
      setTashyeekResults(finalTashyeek);
      setResults(matches); setSorted(true); setNearestActive(false); setVisibleCount(PAGE_SIZE);
      persistSortResults(matches, finalTashyeek, "full", 0);
    } catch (err) { console.error(err); }
    finally { setSorting(false); }
  }

  // ── New sort ──
  async function runNewSort() {
    if (!dataTable || !referralTable || !checkTable || !effectiveDataPlateCol || !effectiveReferralPlateCol || !effectiveCheckPlateCol) return;
    setSorting(true);
    await new Promise<void>((r) => setTimeout(r, 10));
    try {
      const checkSet = new Set<string>();
      for (const row of checkTable.rows) {
        const n = normalizePlate(bankPlateToArabic(String(row[effectiveCheckPlateCol] ?? "")));
        if (!n) continue;
        checkSet.add(n);
      }
      const seenNew = new Set<string>();
      const newRefRows = referralTable.rows.filter((row) => {
        const raw = String(row[effectiveReferralPlateCol] ?? "");
        const n = referralPlateIsArabic
          ? normalizePlate(raw)
          : normalizePlate(bankPlateToArabic(raw));
        if (!n || checkSet.has(n) || seenNew.has(n)) return false;
        seenNew.add(n);
        return true;
      });
      setNewPlatesCount(newRefRows.length);
      // Track each data row's original position so results can be ordered the
      // same way as the data file (not the referral file) — cars at the same
      // location sit adjacent in the data file, so this keeps them grouped.
      const dataIndex = new Map<string, Array<{ row: Record<string, string>; dataIdx: number }>>();
      for (let i = 0; i < dataTable.rows.length; i++) {
        const row = dataTable.rows[i];
        const n = normalizePlate(bankPlateToArabic(String(row[effectiveDataPlateCol] ?? "")));
        if (!n) continue;
        const arr = dataIndex.get(n);
        if (arr) arr.push({ row, dataIdx: i }); else dataIndex.set(n, [{ row, dataIdx: i }]);
      }
      const matches: (MatchResult & { dataIdx: number })[] = [];
      for (const refRow of newRefRows) {
        const raw = String(refRow[effectiveReferralPlateCol] ?? "");
        const n = referralPlateIsArabic
          ? normalizePlate(raw)
          : normalizePlate(bankPlateToArabic(raw));
        if (!n) continue;
        const dataRows = dataIndex.get(n) ?? (
          !referralPlateIsArabic && /[A-Za-z]/.test(raw)
            ? dataIndex.get(reversePlateLetters(n))
            : undefined
        );
        if (dataRows) {
          for (const { row: dataRow, dataIdx } of dataRows) {
            matches.push({ referralRow: refRow, dataRow, status: "exact", dataIdx });
          }
        }
      }
      matches.sort((a, b) => a.dataIdx - b.dataIdx);
      let finalTashyeek: TashyeekResultRow[] | null = null;
      if (tashyeekTable && tashyeekPlateCol) {
        const tashyeekRefIndex = new Map<string, Record<string, string>>();
        for (const row of referralTable.rows) {
          const raw = String(row[effectiveReferralPlateCol] ?? "");
          const n = normalizePlate(bankPlateToArabic(raw));
          if (!n || tashyeekRefIndex.has(n)) continue;
          tashyeekRefIndex.set(n, row);
          if (/[A-Za-z]/.test(raw)) {
            const rev = reversePlateLetters(n);
            if (rev !== n) tashyeekRefIndex.set(rev, row);
          }
        }
        const tashyeekMatches: TashyeekResultRow[] = [];
        for (const row of tashyeekTable.rows) {
          const n = normalizePlate(bankPlateToArabic(String(row[tashyeekPlateCol] ?? "")));
          if (!n) continue;
          const refRow = tashyeekRefIndex.get(n);
          if (refRow) tashyeekMatches.push({ tashyeekRow: row, referralRow: refRow });
        }
        finalTashyeek = tashyeekMatches;
      }
      setTashyeekResults(finalTashyeek);
      setResults(matches); setSorted(true); setNearestActive(false); setVisibleCount(PAGE_SIZE);
      persistSortResults(matches, finalTashyeek, "new", newRefRows.length);
    } catch (err) { console.error(err); }
    finally { setSorting(false); }
  }

  function handleSort() {
    setResults(null); setSorted(false); setTashyeekResults(null);
    wipeSortResults();
    if (sortMode === "new") runNewSort(); else runFullSort();
  }

  // ── GPS ──
  async function handleNearest() {
    setLocating(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
      );
      setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setNearestActive(true);
    } catch { alert("تعذّر الوصول للموقع. تحقق من إذن الـ GPS."); }
    finally { setLocating(false); }
  }

  // ── Row helpers ──
  function plateForRow(r: MatchResult): string {
    const ref = bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? ""));
    const data = bankPlateToArabic(String(r.dataRow?.[effectiveDataPlateCol ?? ""] ?? ""));
    return ref || data;
  }

  function buildRowObject(r: MatchResult): Record<string, unknown> {
    const row: Record<string, unknown> = { "رقم اللوحة": plateForRow(r) };
    const cols = [
      ...(dataTable?.headers.filter((h) => h !== dataPlateCol && isMandatory(h)) ?? []),
      ...[...outputCols].filter((h) => !isMandatory(h)),
    ];
    for (const col of cols) row[col] = r.dataRow?.[col] ?? "";
    for (const col of referralExtraCols) row[col] = r.referralRow[col] ?? "";
    row["الحالة"] = "مطلوبة";
    return row;
  }

  function buildPasteRowObject(p: { converted: string; row: Record<string, string> }): Record<string, unknown> {
    const obj: Record<string, unknown> = { "رقم اللوحة": p.converted };
    for (const col of pasteAllCols) obj[col] = p.row[col] ?? "";
    return obj;
  }

  function buildPasteRecordRowObject(p: { converted: string; row: Record<string, string> }): Record<string, unknown> {
    const obj: Record<string, unknown> = { "رقم اللوحة": p.converted };
    for (const col of pasteRecordCols) obj[col] = p.row[col] ?? "";
    return obj;
  }

  // ── نافذة المطلوبين (شيت التشييك) — helpers ──
  function buildTashyeekRowObj(r: TashyeekResultRow): Record<string, unknown> {
    const plate = r.tashyeekRow[tashyeekPlateCol ?? "رقم اللوحة"] ?? "";
    const obj: Record<string, unknown> = { "رقم اللوحة": plate };
    for (const h of tashyeekTable?.headers.filter((h) => h !== tashyeekPlateCol) ?? []) {
      obj[h] = r.tashyeekRow[h] || r.referralRow[h] || "";
    }
    return obj;
  }
  function removeTashyeekRow(i: number) {
    setTashyeekResults((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
    setTashyeekSelected(new Set());
  }
  function shareTashyeekRow(r: TashyeekResultRow) {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildRowSummaryText(buildTashyeekRowObj(r)))}`, "_blank");
  }
  async function copyTashyeekRow(r: TashyeekResultRow, i: number) {
    await navigator.clipboard.writeText(buildRowSummaryText(buildTashyeekRowObj(r)));
    setTashyeekCopiedIdx(i);
    setTimeout(() => setTashyeekCopiedIdx(null), 1200);
  }
  function toggleTashyeekSel(i: number) {
    setTashyeekSelected((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  function toggleTashyeekAll() {
    setTashyeekSelected((prev) => prev.size === (tashyeekResults?.length ?? 0) ? new Set() : new Set((tashyeekResults ?? []).map((_, i) => i)));
  }
  function deleteTashyeekSelected() {
    setTashyeekResults((prev) => (prev ? prev.filter((_, idx) => !tashyeekSelected.has(idx)) : prev));
    setTashyeekSelected(new Set());
  }
  function shareTashyeekSelected() {
    const rows = (tashyeekResults ?? []).filter((_, idx) => tashyeekSelected.has(idx));
    if (!rows.length) return;
    const text = `*سيارات مطلوبة (${rows.length})*\n\n` +
      rows.map((r, i) => `${i + 1}. ${buildRowSummaryText(buildTashyeekRowObj(r))}`).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  async function shareTashyeekAll() {
    const rows = (tashyeekResults ?? []).map(buildTashyeekRowObj);
    if (!rows.length) return;
    const { blob, ext } = buildSpreadsheetBlob(rows, "سيارات مطلوبة");
    try { await shareExcelBlob(blob, `مطلوبين-${ts()}.${ext}`, "سيارات مطلوبة"); }
    catch (e: any) { alert(e?.message ?? "تعذّرت المشاركة"); }
  }
  async function openTashyeekExcel() {
    const rows = (tashyeekResults ?? []).map(buildTashyeekRowObj);
    if (!rows.length) return;
    const { blob, ext } = buildSpreadsheetBlob(rows, "سيارات مطلوبة");
    try { await openExcelBlob(blob, `مطلوبين-${ts()}.${ext}`); }
    catch (e: any) { alert(e?.message ?? "تعذّر الفتح"); }
  }

  // ── Export ──
  const ts = () => new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

  // Colored xlsx, but falls back to a plain CSV if the xlsx build crashes on
  // the device WebView (loses the row colors, but the data always comes out).
  async function buildSortExcelBlob(): Promise<{ blob: Blob; ext: "xlsx" | "csv" }> {
    const rowObjects = matchedResults.map(buildRowObject);
    try {
      const rowColors = matchedResults.map((r) => {
        const k = normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
        const idx = plateColorMap.get(k);
        return idx !== undefined ? DUPE_COLORS[idx].hex : null;
      });
      return { blob: await buildColoredSortExcel(rowObjects, "نتائج الفرز", rowColors), ext: "xlsx" };
    } catch {
      return { blob: buildCsvBlob(rowObjects), ext: "csv" };
    }
  }

  async function handleOpenSort() {
    setExportingAll(true);
    try {
      const { blob, ext } = await buildSortExcelBlob();
      const result = await openExcelBlob(blob, `فرز-${ts()}.${ext}`);
      alert(result === "opened" ? "تم تصدير الملف وفتحه." : "تم تصدير الملف وتنزيله.");
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    } finally {
      setExportingAll(false);
    }
  }
  async function handleDownloadSort() {
    setExportingAll(true);
    const { blob, ext } = await buildSortExcelBlob();
    downloadExcelBlob(blob, `فرز-${ts()}.${ext}`);
    alert("تم تصدير الملف وتنزيله.");
    setExportingAll(false);
  }
  async function handleShareSort() {
    try {
      const { blob, ext } = await buildSortExcelBlob();
      await shareExcelBlob(blob, `فرز-${ts()}.${ext}`, "نتائج الفرز");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت المشاركة");
    }
  }

  async function handleOpenPaste() {
    try {
      const { blob, ext } = buildSpreadsheetBlob(pasteResults.map(buildPasteRowObject), "نتائج اللصق");
      const result = await openExcelBlob(blob, `لصق-${ts()}.${ext}`);
      alert(result === "opened" ? "تم تصدير الملف وفتحه." : "تم تصدير الملف وتنزيله.");
    } catch (err: any) {
      alert(err?.message ?? "تعذّر فتح الملف");
    }
  }
  async function handleDownloadPaste() {
    const { blob, ext } = buildSpreadsheetBlob(pasteResults.map(buildPasteRowObject), "نتائج اللصق");
    downloadExcelBlob(blob, `لصق-${ts()}.${ext}`);
    alert("تم تصدير الملف وتنزيله.");
  }
  async function handleSharePaste() {
    try {
      const { blob, ext } = buildSpreadsheetBlob(pasteResults.map(buildPasteRowObject), "نتائج اللصق");
      await shareExcelBlob(blob, `لصق-${ts()}.${ext}`, "نتائج اللصق");
    } catch (err: any) {
      alert(err?.message ?? "تعذّرت المشاركة");
    }
  }

  // ── Paste sort ──
  function runPasteSort() {
    if (!dataTable || !effectiveDataPlateCol || !pasteText.trim()) return;
    const tokens = tokenizePastedPlates(pasteText);
    const matches = matchTokensAgainstRows(tokens, dataTable.rows, effectiveDataPlateCol);
    matches.sort((a, b) => a.dataIdx - b.dataIdx);

    // نفس اللوحات الملصوقة، بس ضد شيت السجلات (تشييك سابق صوت/يدوي) — لو موجود.
    const recordMatches = tashyeekTable && tashyeekPlateCol
      ? matchTokensAgainstRows(tokens, tashyeekTable.rows, tashyeekPlateCol)
      : [];
    recordMatches.sort((a, b) => a.dataIdx - b.dataIdx);

    setPasteResults(matches);
    setPasteRecordResults(recordMatches);
    setPasteRan(true);
    persistPasteResults(matches, recordMatches, pasteText);
  }

  // ── WhatsApp ──
  function shareRowToWhatsApp(rowObj: Record<string, unknown>) {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildRowSummaryText(rowObj))}`, "_blank");
  }
  function shareSelectedToWhatsApp(indices: Set<number>) {
    const rows = displayResults.filter((_, i) => indices.has(i)).map(buildRowObject);
    const text = `*السيارات المطلوبة للسحب (${rows.length})*\n\n` +
      rows.map((r, i) =>
        `${i + 1}. 🚗 ${r["رقم اللوحة"]}\n` +
        Object.entries(r).filter(([k]) => k !== "رقم اللوحة" && r[k]).map(([k, v]) => `${k}: ${v}`).join("\n")
      ).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function sharePasteToWhatsApp() {
    const text = `*اللوحات المطلوبة (${pasteResults.length})*\n\n` +
      pasteResults.map((p, i) =>
        `${i + 1}. 🚗 ${p.converted}\n` +
        Object.entries(p.row).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")
      ).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  // ── Selection ──
  function toggleResult(i: number) { setSelectedResults((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; }); }
  function toggleAllResults() { setSelectedResults((p) => p.size === displayResults.length ? new Set() : new Set(displayResults.map((_, i) => i))); }
  function deleteResult(i: number) { const r = displayResults[i]; setResults((p) => p ? p.filter((x) => x !== r) : null); setSelectedResults(new Set()); }
  // الحذف/التحديد بيشتغلوا على القائمة المعروضة (displayPaste) — اللي ممكن تكون
  // مرتّبة بالأقرب — بالهوية (اللوحة نفسها) مش بالرقم، عشان الترتيب مايخربطش.
  function deletePasteResult(i: number) {
    const target = displayPaste[i];
    const next = pasteResults.filter((x) => x !== target);
    setPasteResults(next);
    setPasteSelected(new Set());
    if (next.length === 0) wipePasteResults(); else persistPasteResults(next, pasteRecordResults, pasteText);
  }
  function togglePasteSel(i: number) { setPasteSelected((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }
  function togglePasteAll() { setPasteSelected((p) => p.size === displayPaste.length ? new Set() : new Set(displayPaste.map((_, i) => i))); }
  function deletePasteSelected() {
    const toDelete = new Set(Array.from(pasteSelected).map((idx) => displayPaste[idx]));
    const next = pasteResults.filter((x) => !toDelete.has(x));
    setPasteResults(next);
    setPasteSelected(new Set());
    if (next.length === 0) wipePasteResults(); else persistPasteResults(next, pasteRecordResults, pasteText);
  }
  function sharePasteSelected() {
    const rows = displayPaste.filter((_, idx) => pasteSelected.has(idx));
    if (!rows.length) return;
    const text = `*اللوحات المطلوبة (${rows.length})*\n\n` +
      rows.map((p, i) => `${i + 1}. 🚗 ${p.converted}\n` +
        Object.entries(p.row).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")
      ).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  async function copyPasteRow(p: { converted: string; row: Record<string, string> }, i: number) {
    await navigator.clipboard.writeText(buildRowSummaryText(buildPasteRowObject(p)));
    setPasteCopiedIdx(i);
    setTimeout(() => setPasteCopiedIdx(null), 1200);
  }

  async function copyPasteRecordRow(p: { converted: string; row: Record<string, string> }, i: number) {
    await navigator.clipboard.writeText(buildRowSummaryText(buildPasteRecordRowObject(p)));
    setPasteRecordCopiedIdx(i);
    setTimeout(() => setPasteRecordCopiedIdx(null), 1200);
  }

  if (!hydrated) return <p className="py-10 text-center text-sm text-muted">جارٍ تحميل الملفات المحفوظة...</p>;

  return (
    <div className="rtl-text flex flex-col gap-4 w-full min-w-0" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-ink">الفرز</h1>
        <p className="text-xs text-muted">مركز مطابقة اللوحات</p>
      </div>

      {/* ① DATA FILE */}
      <button onClick={() => setDataBoxOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-bold text-ink">
        <span>مربع الداتا</span>
        <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${dataBoxOpen ? "rotate-180" : ""}`} />
      </button>
      {dataBoxOpen && (<>
      <FileUploadBox
        title="ملف الداتا"
        hint="بيانات التفريغ الميداني"
        parsedFile={dataFile}
        parsedRowCount={dataTable?.rows.length ?? null}
        onParsed={(table, file) => persistAndSet("data", table, file)}
        onClear={() => clearSlot("data")}
        showReplaceButtons
      />
      {dataTable && (
        <div className="rounded-xl border border-border bg-surface">
          <button onClick={() => setDataColsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink">
            <span>الأعمدة ({dataTable.headers.length - 1}) — محدد: {outputCols.size}</span>
            <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${dataColsOpen ? "rotate-180" : ""}`} />
          </button>
          {dataColsOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
              <div>
                <p className="text-[11px] text-muted">
                  عمود اللوحة (اكتشاف تلقائي): <span className="font-bold text-primary">{effectiveDataPlateCol ?? "—"}</span>
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-muted">أعمدة النتائج:</p>
                <div className="flex flex-wrap gap-2">
                  {dataTable.headers.filter((h) => h !== effectiveDataPlateCol).map((h) => {
                    const mandatory = isMandatory(h);
                    const active = mandatory || outputCols.has(h);
                    return (
                      <button key={h} onClick={() => { if (!mandatory) toggleSet(outputCols, h, setOutputCols); }} disabled={mandatory}
                        className={`rounded-full px-3 py-1 text-xs transition ${active ? mandatory ? "bg-primary text-night font-bold opacity-80 cursor-default" : "bg-primary text-night font-bold" : "border border-border text-muted"}`}>
                        {h}{mandatory ? " 🔒" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ③ SORT MODE TABS */}
      <div className="flex gap-2 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => { setSortMode("new"); setSorted(false); setResults(null); setTashyeekResults(null); wipeSortResults(); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${sortMode === "new" ? "bg-primary text-night font-bold" : "text-muted"}`}>
          <ScanLine size={15} /> فرز جديد
        </button>
        <button onClick={() => { setSortMode("full"); setSorted(false); setResults(null); setTashyeekResults(null); wipeSortResults(); }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${sortMode === "full" ? "bg-primary text-night font-bold" : "text-muted"}`}>
          <FileSpreadsheet size={15} /> فرز كلي
        </button>
      </div>

      {sortMode === "new" && !checkTable && (
        <div className="flex items-center gap-2 rounded-xl border border-alert/40 bg-alert/5 px-3 py-2.5">
          <AlertTriangle size={15} className="shrink-0 text-alert" />
          <p className="text-xs text-alert">لم يتم رفع ملف التشييك — يرجى رفعه من صفحة التشييك أولاً</p>
        </div>
      )}

      {/* ③ REFERRAL FILE */}
      <button onClick={() => setReferralBoxOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-bold text-ink">
        <span>مربع الإحالة</span>
        <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${referralBoxOpen ? "rotate-180" : ""}`} />
      </button>
      {referralBoxOpen && (<>
      <FileUploadBox
        title="ملف الإحالة"
        hint={sortMode === "new" ? "إحالة اليوم الجديدة" : "قائمة البنك بالسيارات المطلوبة"}
        parsedFile={referralFile}
        parsedRowCount={referralTable?.rows.length ?? null}
        onParsed={(table, file) => persistAndSet("referral", table, file)}
        onClear={() => clearSlot("referral")}
        showReplaceButtons
      />
      {referralTable && (
        <div className="rounded-xl border border-border bg-surface">
          <button onClick={() => setReferralColsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink">
            <span>أعمدة الإحالة ({referralTable.headers.length - 1}) — محدد: {referralExtraCols.size}</span>
            <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${referralColsOpen ? "rotate-180" : ""}`} />
          </button>
          {referralColsOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
              <div>
                <p className="text-[11px] text-muted">
                  عمود اللوحة (اكتشاف تلقائي): <span className="font-bold text-primary">{effectiveReferralPlateCol ?? "—"}</span>
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-muted">أعمدة إضافية في النتائج:</p>
                <div className="flex flex-wrap gap-2">
                  {referralTable.headers.filter((h) => h !== effectiveReferralPlateCol).map((h) => (
                    <button key={h} onClick={() => toggleSet(referralExtraCols, h, setReferralExtraCols)}
                      className={`rounded-full px-3 py-1 text-xs transition ${referralExtraCols.has(h) ? "bg-primary text-night font-bold" : "border border-border text-muted"}`}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ⑤ SORT BUTTON */}
      <button onClick={handleSort} disabled={sorting || !canSort}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-50">
        <ListFilter size={18} />
        {sorting ? "جارٍ الفرز..." : "فرز"}
      </button>

      {/* ⑤ SORT RESULTS — مسح */}
      {sorted && results && (
        <button
          onClick={() => { setResults(null); setSorted(false); setTashyeekResults(null); wipeSortResults(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/40 bg-danger/5 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10"
        >
          <Trash2 size={15} /> مسح نتايج الفرز
        </button>
      )}

      {/* ⑤ SORT RESULTS — مع تطابقات */}
      {sorted && results && matchedResults.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-brand bg-brand/5 p-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="text-xl font-black text-brand-glow">{matchedResults.length}</p>
              <p className="text-xs text-muted">سيارات مطلوبة</p>
            </div>
            {/* ── عداد اللوحات الجديدة — أوضح في الفرز الجديد ── */}
            {sortMode === "new" ? (
              <div className="rounded-xl border-2 border-primary/40 bg-primary/10 p-3">
                <p className="text-xl font-black text-primary">{newPlatesCount}</p>
                <p className="text-xs font-bold text-primary/80">لوحة جديدة في الإحالة</p>
                <p className="text-[10px] text-muted mt-0.5">غير موجودة في التشييك</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-xl font-black text-ink">{referralTable?.rows.length ?? 0}</p>
                <p className="text-xs text-muted">إجمالي الإحالة</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-brand">السيارات المطلوبة للسحب</h2>
            {gpsCol && (
              <button onClick={handleNearest} disabled={locating}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${nearestActive ? "bg-primary text-night font-bold" : "border border-border text-muted hover:text-primary"}`}>
                <Navigation size={13} />
                {locating ? "جارٍ..." : "الأقرب"}
              </button>
            )}
          </div>

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
              {selectedResults.size === displayResults.length && displayResults.length > 0 ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
              {selectedResults.size === displayResults.length && displayResults.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
            </button>
          </div>

          <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
            <div style={{ fontSize: `${ZOOM_LEVELS[zoom] * 12}px`, minWidth: "max-content" }}>
              <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-2 text-muted">
                    <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">☐</th>
                    <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                    {displayCols.map((col) => (
                      <th key={col} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{col}</th>
                    ))}
                    {[...referralExtraCols].map((col) => (
                      <th key={`ref-${col}`} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{col}</th>
                    ))}
                    {nearestActive && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">المسافة</th>}
                    {nearestActive && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الوقت</th>}
                    <th className="border-b border-border px-2 py-2 text-right font-bold whitespace-nowrap">⋮</th>
                  </tr>
                </thead>
                <tbody>
                  {displayResults.slice(0, visibleCount).map((r, i) => {
                    const plate = plateForRow(r);
                    const isSel = selectedResults.has(i);
                    const plateKey = normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
                    const colorIdx = plateColorMap.get(plateKey);
                    const rowBg = isSel ? "bg-primary/15" : colorIdx !== undefined ? DUPE_COLORS[colorIdx].tw : "bg-brand/5 hover:bg-brand/15";
                    return (
                      <tr key={i} className={`border-b border-border transition ${rowBg}`}>
                        <td className="border-l border-border px-2 py-2 text-center">
                          <button onClick={() => toggleResult(i)} className="text-muted hover:text-primary transition">
                            {isSel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                          </button>
                        </td>
                        <td className="border-l border-border px-3 py-2 font-bold text-ink whitespace-nowrap">{plate}</td>
                        {displayCols.map((col) => {
                          const val = r.dataRow?.[col] ?? "";
                          return (
                            <td key={col} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                              {(() => {
                                const v = String(val).trim();
                                if (/^https?:\/\//i.test(v)) return <a href={v} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary">📍 خريطة</a>;
                                const m = v.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
                                if (m) return <a href={toMapsLink(parseFloat(m[1]), parseFloat(m[2]))} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary">📍 خريطة</a>;
                                return <>{v || "—"}</>;
                              })()}
                            </td>
                          );
                        })}
                        {[...referralExtraCols].map((col) => (
                          <td key={`ref-${col}`} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">{r.referralRow[col] || "—"}</td>
                        ))}
                        {nearestActive && "_dist" in r && (
                          <td className="border-l border-border px-3 py-2 font-bold text-primary whitespace-nowrap">
                            {formatDistanceKm((r as { _dist: number })._dist)}
                          </td>
                        )}
                        {nearestActive && "_min" in r && (
                          <td className="border-l border-border px-3 py-2 font-bold text-brand whitespace-nowrap">
                            {formatDurationMin((r as { _min: number })._min)}
                          </td>
                        )}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <button onClick={async () => { await navigator.clipboard.writeText(buildRowSummaryText(buildRowObject(r))); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1200); }} className="text-muted hover:text-primary transition">
                              {copiedIdx === i ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                            </button>
                            <button onClick={() => shareRowToWhatsApp(buildRowObject(r))} className="text-muted hover:text-primary transition"><Share2 size={13} /></button>
                            <button onClick={() => deleteResult(i)} className="text-muted hover:text-danger transition"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {displayResults.length > visibleCount && (
            <button onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-ink transition">
              <ChevronDown size={15} /> تحميل المزيد ({displayResults.length - visibleCount} متبقي)
            </button>
          )}

          {selectedResults.size > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="text-xs font-bold text-ink">{selectedResults.size} محددة</span>
              <button onClick={() => shareSelectedToWhatsApp(selectedResults)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night">
                <Share2 size={13} /> واتساب
              </button>
            </div>
          )}

          {/* ⑥ SORT EXPORT */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button onClick={() => setShowExcelMenuSort((v) => !v)} disabled={exportingAll}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60">
                <ExternalLink size={16} /> فتح في Excel
              </button>
              {showExcelMenuSort && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowExcelMenuSort(false)} />
                  <div className="absolute bottom-full mb-1 right-0 z-20 w-full rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                    <button onClick={() => { handleOpenSort(); setShowExcelMenuSort(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2"><ExternalLink size={14} /> فتح</button>
                    <button onClick={() => { handleDownloadSort(); setShowExcelMenuSort(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2"><Download size={14} /> تنزيل</button>
                  </div>
                </>
              )}
            </div>
            <button onClick={handleShareSort} disabled={exportingAll}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90 disabled:opacity-60">
              <Share2 size={16} /> مشاركة لواتساب
            </button>
          </div>
        </div>
      )}

      {/* ⑤ SORT RESULTS — بدون تطابقات */}
      {sorted && results && matchedResults.length === 0 && (
        <div className="rounded-2xl border border-danger/40 bg-surface p-4 space-y-3">

          {/* ── عداد اللوحات الجديدة + رسالة الخطأ الواضحة ── */}
          {sortMode === "new" && (
            <div className="rounded-xl border-2 border-danger/50 bg-danger/10 p-4 text-center space-y-2">
              <p className="text-2xl font-black text-danger">{newPlatesCount}</p>
              <p className="text-sm font-bold text-danger">
                {newPlatesCount > 0
                  ? `لوحة جديدة في الإحالة — ولا يوجد تطابق مع الداتا`
                  : `جميع لوحات الإحالة موجودة في التشييك — ولا يوجد تطابق مع الداتا`}
              </p>
              {newPlatesCount > 0 && (
                <p className="text-xs text-muted">
                  {newPlatesCount} لوحة غير موجودة في التشييك، لكن لا توجد أي منها في ملف الداتا
                </p>
              )}
            </div>
          )}

          {/* تشخيص الأعمدة */}
          <div className="text-xs text-muted space-y-1.5 font-mono bg-surface-2 rounded-lg p-3">
            <p className="text-ink font-sans font-semibold text-[11px] mb-2">تشخيص — ما الذي تم اكتشافه؟</p>
            <p>📂 عمود لوحة الداتا: <span className="text-ink">{effectiveDataPlateCol ?? "—"}</span></p>
            <p>📋 عمود لوحة الإحالة: <span className="text-ink">{effectiveReferralPlateCol ?? "—"}</span></p>
            <p>📊 عينة داتا (أول 3):&nbsp;
              <span className="text-ink">{
                dataTable?.rows.slice(0, 8)
                  .map((r) => normalizePlate(bankPlateToArabic(String(r[effectiveDataPlateCol ?? ""] ?? ""))))
                  .filter(Boolean).slice(0, 3).join(" | ") || "لا توجد"
              }</span>
            </p>
            <p>📊 عينة إحالة (أول 3):&nbsp;
              <span className="text-ink">{
                referralTable?.rows.slice(0, 8)
                  .map((r) => normalizePlate(bankPlateToArabic(String(r[effectiveReferralPlateCol ?? ""] ?? ""))))
                  .filter(Boolean).slice(0, 3).join(" | ") || "لا توجد"
              }</span>
            </p>
          </div>
          <p className="text-[11px] text-muted text-center">صوّر هذه المعلومات وأرسلها لتشخيص المشكلة</p>
        </div>
      )}

      {/* ⑥ TASHYEEK RESULTS */}
      {sorted && tashyeekResults !== null && (
        tashyeekResults.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-primary/60 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-primary">سيارات مطلوبة من التشييك الميداني</h2>
                <p className="text-xs text-muted mt-0.5">{tashyeekResults.length} سيارة من شيت التسجيلات موجودة في قائمة الإحالة</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {tashyeekGpsCol && (
                  <button onClick={handleNearest} disabled={locating}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition ${nearestActive ? "bg-primary text-night font-bold" : "border border-border text-muted hover:text-primary"}`}>
                    <Navigation size={12} /> {locating ? "..." : "الأقرب"}
                  </button>
                )}
                <button onClick={toggleTashyeekAll}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                  {tashyeekSelected.size === tashyeekResults.length && tashyeekResults.length > 0
                    ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                  {tashyeekSelected.size === tashyeekResults.length && tashyeekResults.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
                </button>
              </div>
            </div>
            <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "40vh" }}>
              <table className="border-collapse w-full text-xs" style={{ direction: "rtl" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-2 text-muted">
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">☐</th>
                    <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                    {tashyeekTable?.headers.filter((h) => h !== tashyeekPlateCol).map((h) => (
                      <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                    ))}
                    {nearestActive && tashyeekGpsCol && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">المسافة</th>}
                    {nearestActive && tashyeekGpsCol && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الوقت</th>}
                    <th className="border-b border-border px-2 py-2 text-center font-bold whitespace-nowrap">⋮</th>
                  </tr>
                </thead>
                <tbody>
                  {displayTashyeek.map(({ r, idx: i, _dist, _min }) => {
                    const plate = r.tashyeekRow[tashyeekPlateCol ?? "رقم اللوحة"] ?? "";
                    const sel = tashyeekSelected.has(i);
                    return (
                      <tr key={i} className={`border-b border-border transition ${sel ? "bg-primary/15" : "bg-primary/5 hover:bg-primary/10"}`}>
                        <td className="border-l border-border px-2 py-2 text-center">
                          <button onClick={() => toggleTashyeekSel(i)} className="text-muted hover:text-primary transition">
                            {sel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                          </button>
                        </td>
                        <td className="border-l border-border px-3 py-2 font-bold text-ink whitespace-nowrap">{plate}</td>
                        {tashyeekTable?.headers.filter((h) => h !== tashyeekPlateCol).map((h) => {
                          const val = r.tashyeekRow[h] || r.referralRow[h] || "";
                          return (
                            <td key={h} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                              {/^https?:\/\//i.test(val) ? (
                                <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary">📍 خريطة</a>
                              ) : (() => {
                                const m = val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
                                return m
                                  ? <a href={toMapsLink(parseFloat(m[1]), parseFloat(m[2]))} target="_blank" rel="noopener noreferrer" className="text-primary">📍 خريطة</a>
                                  : <>{val || "—"}</>;
                              })()}
                            </td>
                          );
                        })}
                        {nearestActive && tashyeekGpsCol && (
                          <td className="border-l border-border px-3 py-2 font-bold text-primary whitespace-nowrap">{formatDistanceKm(_dist)}</td>
                        )}
                        {nearestActive && tashyeekGpsCol && (
                          <td className="border-l border-border px-3 py-2 font-bold text-brand whitespace-nowrap">{formatDurationMin(_min)}</td>
                        )}
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => copyTashyeekRow(r, i)} title="نسخ" className="text-muted hover:text-primary transition">
                              {tashyeekCopiedIdx === i ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                            </button>
                            <button onClick={() => shareTashyeekRow(r)} title="واتساب" className="text-muted hover:text-primary transition"><Share2 size={13} /></button>
                            <button onClick={() => removeTashyeekRow(i)} title="حذف" className="text-muted hover:text-danger transition"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* شريط جماعي — يظهر لما يبقى فيه محدّد */}
            {tashyeekSelected.size > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                <span className="text-xs font-bold text-ink">{tashyeekSelected.size} محددة</span>
                <div className="flex gap-2">
                  <button onClick={shareTashyeekSelected}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90">
                    <Share2 size={13} /> واتساب
                  </button>
                  <button onClick={deleteTashyeekSelected}
                    className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20">
                    <Trash2 size={13} /> مسح الكل
                  </button>
                </div>
              </div>
            )}

            {/* أزرار تحت النافذة */}
            <div className="flex gap-3">
              <button onClick={shareTashyeekAll}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-night transition hover:bg-brand/90">
                <Share2 size={16} /> مشاركة
              </button>
              <OpenDownloadButton
                build={() => {
                  const { blob, ext } = buildSpreadsheetBlob((tashyeekResults ?? []).map(buildTashyeekRowObj), "سيارات مطلوبة");
                  return { blob, name: `مطلوبين-${ts()}.${ext}` };
                }}
                label="فتح في Excel"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-bold text-ink transition hover:border-primary hover:text-primary disabled:opacity-60"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-primary/30 bg-surface p-3 text-center">
            <p className="text-xs text-muted">لا يوجد تطابق بين ملف التشييك وقائمة الإحالة</p>
          </div>
        )
      )}

      {/* ══════════════════════════════════════════════ */}
      {/* ⑦ PASTE SECTION — always at bottom */}
      {/* ══════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-border bg-surface p-3 flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">لصق نصي</h2>
          <p className="text-xs text-muted">فرز لوحات على ملف الداتا</p>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-muted">الصق اللوحات هنا</label>
            {pasteText && (
              <button onClick={() => setPasteText("")}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:text-danger">
                <Trash2 size={13} /> مسح الكل
              </button>
            )}
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runPasteSort();
              }
            }}
            placeholder={"كل لوحة في سطر أو مفصولة بفاصلة...\nمثال: أبح1234 أو GUR4560"}
            rows={5}
            dir="rtl"
            className="rtl-text w-full rounded-xl border border-border bg-surface-2 p-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button onClick={runPasteSort} disabled={!pasteText.trim() || !dataTable}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night disabled:opacity-50">
          <ListFilter size={16} /> فرز
        </button>

        {!dataTable && <p className="text-xs text-alert">رفع «ملف الداتا» بالأعلى مطلوب أولاً.</p>}

        {pasteRan && pasteResults.length === 0 && (
          <p className="py-2 text-center text-sm text-muted">لا توجد تطابقات في ملف الداتا.</p>
        )}

        {pasteRan && pasteResults.length > 0 && (
          <>
            <div className="rounded-xl border border-brand/40 bg-brand/5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-brand/20 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-brand" />
                <span className="text-xs font-bold text-brand">{pasteResults.length} لوحة مطلوبة</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={handleNearest} disabled={locating} title="ترتيب حسب الأقرب لموقعك"
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition ${nearestActive ? "bg-primary text-night font-bold" : "border border-border bg-surface text-muted hover:text-primary"}`}>
                  <Navigation size={11} /> {locating ? "..." : "الأقرب"}
                </button>
                <button onClick={togglePasteAll}
                  className="flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-[10px] text-muted hover:text-ink transition">
                  {pasteSelected.size === displayPaste.length && displayPaste.length > 0
                    ? <CheckSquare size={11} className="text-primary" /> : <Square size={11} />}
                  تحديد الكل
                </button>
                <button
                  onClick={() => setPasteZoom((z) => Math.max(z - 1, 0))}
                  disabled={pasteZoom === 0}
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface text-muted disabled:opacity-30 hover:text-ink transition"
                >
                  <ZoomOut size={11} />
                </button>
                <span className="w-7 text-center text-[10px] text-muted">
                  {Math.round(ZOOM_LEVELS[pasteZoom] * 100)}%
                </span>
                <button
                  onClick={() => setPasteZoom((z) => Math.min(z + 1, ZOOM_LEVELS.length - 1))}
                  disabled={pasteZoom === ZOOM_LEVELS.length - 1}
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface text-muted disabled:opacity-30 hover:text-ink transition"
                >
                  <ZoomIn size={11} />
                </button>
                <button
                  onClick={handleSharePaste}
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface text-muted hover:text-ink transition"
                >
                  <Share2 size={11} />
                </button>
                <button
                  onClick={handleOpenPaste}
                  className="flex h-6 w-6 items-center justify-center rounded border border-border bg-surface text-muted hover:text-ink transition"
                >
                  <Download size={11} />
                </button>
              </div>
            </div>

            <div className="overflow-auto" style={{ maxHeight: "60vh", direction: "rtl" }}>
              <div style={{ fontSize: `${ZOOM_LEVELS[pasteZoom] * 12}px`, minWidth: "max-content", width: "100%" }}>
                <table className="border-collapse w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface-2 text-muted">
                      <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">☐</th>
                      <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">#</th>
                      <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                      {nearestActive && <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">المسافة</th>}
                      {pasteAllCols.map((col) => (
                        <th key={col} className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="border-b border-border px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayPaste.map((p, i) => {
                      const pasteKey = normalizePlate(bankPlateToArabic(p.converted));
                      const pasteColorIdx = pasteColorMap.get(pasteKey);
                      const pasteBg = pasteColorIdx !== undefined
                        ? DUPE_COLORS[pasteColorIdx].tw
                        : i % 2 === 0 ? "bg-surface" : "bg-surface-2/40";
                      const pasteDist = (p as { _dist?: number })._dist;
                      return (
                      <tr
                        key={i}
                        className={`border-b border-border ${pasteSelected.has(i) ? "bg-primary/15" : pasteBg}`}
                      >
                        <td className="border-l border-border px-2 py-1.5 text-center">
                          <button onClick={() => togglePasteSel(i)} className="text-muted hover:text-primary transition">
                            {pasteSelected.has(i) ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                          </button>
                        </td>
                        <td className="border-l border-border px-2 py-1.5 text-center text-muted whitespace-nowrap">{i + 1}</td>
                        <td className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-ink">{p.converted}</span>
                            <span className="rounded-full bg-brand/20 px-1 py-0.5 font-bold text-brand leading-none" style={{ fontSize: "0.75em" }}>
                              مطلوبة
                            </span>
                            {p.status === "fuzzy" && (
                              <span className="rounded-full bg-alert/20 px-1 py-0.5 font-bold text-alert leading-none" style={{ fontSize: "0.75em" }} title="تطابق تقريبي — راجع اللوحة">
                                تقريبية {p.similarity}%
                              </span>
                            )}
                          </div>
                        </td>
                        {nearestActive && (
                          <td className="border-l border-border px-3 py-1.5 font-bold text-primary whitespace-nowrap">
                            {pasteDist != null && pasteDist !== Infinity ? formatDistanceKm(pasteDist) : "—"}
                          </td>
                        )}
                        {pasteAllCols.map((col) => {
                          const v = String(p.row[col] ?? "");
                          const isUrl = !!v && /^https?:\/\//i.test(v);
                          const isCoords = !!v && /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(v.trim());
                          return (
                            <td key={col} className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                              {isUrl ? (
                                <a href={v} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">📍 خريطة</a>
                              ) : isCoords ? (() => {
                                const [lat, lng] = v.split(",").map(Number);
                                return <a href={toMapsLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">📍 خريطة</a>;
                              })() : v ? (
                                <span className="text-ink">{v}</span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => copyPasteRow(p, i)} title="نسخ" className="text-muted hover:text-primary transition">
                              {pasteCopiedIdx === i ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                            </button>
                            <button onClick={() => shareRowToWhatsApp(buildPasteRowObject(p))} title="واتساب" className="text-muted hover:text-primary transition">
                              <Share2 size={12} />
                            </button>
                            <button onClick={() => deletePasteResult(i)} title="حذف" className="text-muted hover:text-danger transition">
                              <Trash2 size={12} />
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
            </div>

            {/* شريط جماعي — يظهر لما يبقى فيه محدّد */}
            {pasteSelected.size > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
                <span className="text-xs font-bold text-ink">{pasteSelected.size} محددة</span>
                <div className="flex gap-2">
                  <button onClick={sharePasteSelected}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90">
                    <Share2 size={13} /> واتساب
                  </button>
                  <button onClick={deletePasteSelected}
                    className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20">
                    <Trash2 size={13} /> مسح الكل
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* لوحات ملصوقة سبق تشييكها — تطابق ضد شيت السجلات (صوت/يدوي)، منفصلة
            عن جدول ملف الداتا (أعمدة مختلفة) وعن شرط pasteResults.length > 0
            عشان تظهر حتى لو اللوحة مش موجودة في ملف الداتا أصلاً. */}
        {pasteRan && pasteRecordResults.length > 0 && (
              <div className="rounded-xl border border-brand/40 bg-brand/5 overflow-hidden">
                <div className="flex items-center justify-between border-b border-brand/20 bg-brand/10 px-3 py-2">
                  <span className="text-xs font-bold text-brand">
                    {pasteRecordResults.length} لوحة سبق تشييكها (شيت السجلات)
                  </span>
                </div>
                <div className="overflow-auto" style={{ maxHeight: "50vh", direction: "rtl" }}>
                  <table className="border-collapse w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-surface-2 text-muted">
                        <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">#</th>
                        <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                        {pasteRecordCols.map((col) => (
                          <th key={col} className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                        <th className="border-b border-border px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {pasteRecordResults.map((p, i) => (
                        <tr key={i} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-surface-2/40"}`}>
                          <td className="border-l border-border px-2 py-1.5 text-center text-muted whitespace-nowrap">{i + 1}</td>
                          <td className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-ink">{p.converted}</span>
                              {p.status === "fuzzy" && (
                                <span className="rounded-full bg-alert/20 px-1 py-0.5 font-bold text-alert leading-none" style={{ fontSize: "0.75em" }} title="تطابق تقريبي — راجع اللوحة">
                                  تقريبية {p.similarity}%
                                </span>
                              )}
                            </div>
                          </td>
                          {pasteRecordCols.map((col) => {
                            const v = String(p.row[col] ?? "");
                            const isUrl = !!v && /^https?:\/\//i.test(v);
                            return (
                              <td key={col} className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                                {isUrl ? (
                                  <a href={v} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">📍 خريطة</a>
                                ) : v ? (
                                  <span className="text-ink">{v}</span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => copyPasteRecordRow(p, i)} title="نسخ" className="text-muted hover:text-primary transition">
                                {pasteRecordCopiedIdx === i ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                              </button>
                              <button onClick={() => shareRowToWhatsApp(buildPasteRecordRowObject(p))} title="واتساب" className="text-muted hover:text-primary transition">
                                <Share2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

        {pasteRan && pasteResults.length > 0 && (
          <>
            {/* أزرار تصدير كبيرة — خارج الكارت */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <button
                  onClick={() => setShowExcelMenuPaste((v) => !v)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white shadow hover:bg-brand/90 transition"
                >
                  <ExternalLink size={16} /> فتح في Excel
                </button>
                {showExcelMenuPaste && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowExcelMenuPaste(false)} />
                    <div className="absolute bottom-full mb-1 left-0 z-20 w-36 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                      <button onClick={() => { handleOpenPaste(); setShowExcelMenuPaste(false); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink hover:bg-surface-2">
                        <ExternalLink size={13} /> فتح
                      </button>
                      <button onClick={() => { handleDownloadPaste(); setShowExcelMenuPaste(false); }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink hover:bg-surface-2">
                        <Download size={13} /> تنزيل
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={handleSharePaste}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white shadow hover:bg-green-700 transition"
              >
                <Share2 size={16} /> مشاركة واتساب
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

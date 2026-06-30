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
  type ExcelTable, buildExcelBlob, downloadExcelBlob,
  openExcelBlob, shareExcelBlob, buildRowSummaryText, buildColoredSortExcel,
} from "@/lib/excel";
import {
  detectPlateColumn, detectArabicPlateColumn, bankPlateToArabic, normalizePlate, reversePlateLetters, type MatchResult,
} from "@/lib/plateParser";
import { matchesPreferred, guessDefaultColumns, isMandatory } from "@/lib/sortingCols";
import { haversineKm, extractLatLngFromMapsLink, toMapsLink } from "@/lib/gps";
import {
  saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord,
} from "@/lib/idb";

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
  results: { converted: string; row: Record<string, string>; dataIdx: number }[],
  text: string,
) {
  try {
    localStorage.setItem(PASTE_RESULTS_KEY, JSON.stringify({ results, text }));
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
  const [outputCols, setOutputCols] = useState<Set<string>>(new Set());
  const [dataPlateColOverride, setDataPlateColOverride] = useState<string | null>(null);

  // ── Referral file (single, shared between new/full sort) ──
  const [referralTable, setReferralTable] = useState<ExcelTable | null>(null);
  const [referralFile, setReferralFile] = useState<File | null>(null);
  const [referralColsOpen, setReferralColsOpen] = useState(false);
  const [referralExtraCols, setReferralExtraCols] = useState<Set<string>>(new Set());
  const [referralPlateColOverride, setReferralPlateColOverride] = useState<string | null>(null);

  // ── Check file (read from IDB, uploaded in صفحة التشييك) ──
  const [checkTable, setCheckTable] = useState<ExcelTable | null>(null);
  const [checkPlateColOverride, setCheckPlateColOverride] = useState<string | null>(null);

  // ── Tashyeek file (manual entries from registration page) ──
  const [tashyeekTable, setTashyeekTable] = useState<ExcelTable | null>(null);
  const [tashyeekFile, setTashyeekFile] = useState<File | null>(null);
  const [tashyeekResults, setTashyeekResults] = useState<TashyeekResultRow[] | null>(null);
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
  const [pasteResults, setPasteResults] = useState<{ converted: string; row: Record<string, string>; dataIdx: number }[]>([]);
  const [pasteRan, setPasteRan] = useState(false);
  const [pasteZoom, setPasteZoom] = useState(1);
  const [showExcelMenuPaste, setShowExcelMenuPaste] = useState(false);

  // ── Bootstrap ──
  useEffect(() => {
    Promise.all([
      getUploadedFile("local", "data"),
      getUploadedFile("local", "referral"),
      getUploadedFile("local", "check"),
      getUploadedFile("local", "tashyeek"),
    ])
      .then(([dataRec, refRec, checkRec, tashyeekRec]) => {
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
        if (tashyeekRec) {
          setTashyeekTable({ headers: tashyeekRec.headers, rows: tashyeekRec.rows });
          setTashyeekFile(new File([tashyeekRec.fileBlob ?? new Blob()], tashyeekRec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        }
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
        const link = r.dataRow?.[gpsCol] ?? "";
        const coords = link ? extractLatLngFromMapsLink(link) : null;
        const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
        return { ...r, _dist: dist };
      })
      .sort((a, b) => a._dist - b._dist);
  }, [matchedResults, nearestActive, userLoc, gpsCol]);

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
    const blob = buildExcelBlob(table.rows, "ملف التشييك");
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
    const blob = buildExcelBlob(tashyeekTable.rows, "ملف التشييك");
    await shareExcelBlob(blob, "ملف-التشييك.xlsx", "ملف التشييك");
  }

  async function downloadTashyeekFile() {
    if (!tashyeekTable) return;
    const blob = buildExcelBlob(tashyeekTable.rows, "ملف التشييك");
    await openExcelBlob(blob, "ملف-التشييك.xlsx");
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
      const dataIndex = new Map<string, Record<string, string>[]>();
      for (const row of dataTable.rows) {
        const n = normalizePlate(bankPlateToArabic(String(row[effectiveDataPlateCol] ?? "")));
        if (!n) continue;
        const arr = dataIndex.get(n);
        if (arr) arr.push(row); else dataIndex.set(n, [row]);
      }
      const matches: MatchResult[] = [];
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
          for (const dataRow of dataRows) {
            matches.push({ referralRow: refRow, dataRow, status: "exact" });
          }
        }
      }
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

  // ── Export ──
  const ts = () => new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

  async function buildSortExcelBlob(): Promise<Blob> {
    const rowObjects = matchedResults.map(buildRowObject);
    const rowColors = matchedResults.map((r) => {
      const k = normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
      const idx = plateColorMap.get(k);
      return idx !== undefined ? DUPE_COLORS[idx].hex : null;
    });
    return buildColoredSortExcel(rowObjects, "نتائج الفرز", rowColors);
  }

  async function handleOpenSort() { setExportingAll(true); await openExcelBlob(await buildSortExcelBlob(), `فرز-${ts()}.xlsx`); setExportingAll(false); }
  async function handleDownloadSort() { setExportingAll(true); downloadExcelBlob(await buildSortExcelBlob(), `فرز-${ts()}.xlsx`); setExportingAll(false); }
  async function handleShareSort() { await shareExcelBlob(await buildSortExcelBlob(), `فرز-${ts()}.xlsx`, "نتائج الفرز"); }

  async function handleOpenPaste() { await openExcelBlob(buildExcelBlob(pasteResults.map(buildPasteRowObject), "نتائج اللصق"), `لصق-${ts()}.xlsx`); }
  async function handleDownloadPaste() { downloadExcelBlob(buildExcelBlob(pasteResults.map(buildPasteRowObject), "نتائج اللصق"), `لصق-${ts()}.xlsx`); }
  async function handleSharePaste() { await shareExcelBlob(buildExcelBlob(pasteResults.map(buildPasteRowObject), "نتائج اللصق"), `لصق-${ts()}.xlsx`, "نتائج اللصق"); }

  // ── Paste sort ──
  function runPasteSort() {
    if (!dataTable || !effectiveDataPlateCol || !pasteText.trim()) return;
    const sourceMap = new Map<string, { row: Record<string, string>; dataIdx: number }[]>();
    for (let i = 0; i < dataTable.rows.length; i++) {
      const row = dataTable.rows[i];
      const n = normalizePlate(bankPlateToArabic(String(row[effectiveDataPlateCol] ?? "")));
      if (!n) continue;
      const arr = sourceMap.get(n);
      if (arr) arr.push({ row, dataIdx: i });
      else sourceMap.set(n, [{ row, dataIdx: i }]);
    }
    const tokens = pasteText.split(/[\n,،]+/).map((t) => t.trim()).filter(Boolean);
    const matches: { converted: string; row: Record<string, string>; dataIdx: number }[] = [];
    for (const token of tokens) {
      const converted = bankPlateToArabic(token);
      const entries = sourceMap.get(normalizePlate(converted));
      if (entries) {
        for (const { row, dataIdx } of entries) {
          matches.push({ converted, row, dataIdx });
        }
      }
    }
    matches.sort((a, b) => a.dataIdx - b.dataIdx);
    setPasteResults(matches);
    setPasteRan(true);
    persistPasteResults(matches, pasteText);
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
  function deletePasteResult(i: number) {
    const next = pasteResults.filter((_, idx) => idx !== i);
    setPasteResults(next);
    if (next.length === 0) wipePasteResults(); else persistPasteResults(next, pasteText);
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
      <p className="text-sm font-bold text-ink">مربع الداتا</p>
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
                <p className="mb-1.5 text-[11px] text-muted">عمود اللوحة — اضغط للتغيير:</p>
                <div className="flex flex-wrap gap-1.5">
                  {dataTable.headers.map((h) => (
                    <button key={h}
                      onClick={() => setDataPlateColOverride(h === effectiveDataPlateCol && dataPlateColOverride ? null : h)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${h === effectiveDataPlateCol ? "border-primary bg-primary/20 text-primary font-bold" : "border-border text-muted hover:border-primary/50 hover:text-ink"}`}>
                      {h}
                    </button>
                  ))}
                </div>
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

      {/* ② TASHYEEK FILE */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-ink">شيت التسجيل</p>
        <FileUploadBox
          title="ملف التشييك"
          hint="يُصدَّر من صفحة التسجيل (الإدخال اليدوي)"
          parsedFile={tashyeekFile}
          parsedRowCount={tashyeekTable?.rows.length ?? null}
          onParsed={(table, file) => persistAndSetTashyeek(table, file)}
          onClear={clearTashyeekSlot}
          showReplaceButtons
        />
        {tashyeekTable && (
          <>
            <button onClick={() => setTashyeekColsOpen((v) => !v)}
              className="flex items-center justify-between px-1 text-xs text-muted hover:text-ink transition">
              <span>الأعمدة ({tashyeekTable.headers.length})</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${tashyeekColsOpen ? "rotate-180" : ""}`} />
            </button>
            {tashyeekColsOpen && (
              <div className="flex flex-wrap gap-1.5 px-1">
                {tashyeekTable.headers.map((h) => (
                  <span key={h} className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-[11px] text-muted">{h}</span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={shareTashyeekFile}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 text-sm font-bold text-white transition hover:opacity-90">
                <Share2 size={15} /> واتساب
              </button>
              <button onClick={downloadTashyeekFile}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2.5 text-sm font-bold text-ink transition hover:border-primary hover:text-primary">
                <Download size={15} /> تحميل
              </button>
            </div>
          </>
        )}
      </div>

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
      <p className="text-sm font-bold text-ink">ملف الإحالة</p>
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
                <p className="mb-1.5 text-[11px] text-muted">عمود اللوحة — اضغط للتغيير:</p>
                <div className="flex flex-wrap gap-1.5">
                  {referralTable.headers.map((h) => (
                    <button key={h}
                      onClick={() => setReferralPlateColOverride(h === effectiveReferralPlateCol && referralPlateColOverride ? null : h)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition ${h === effectiveReferralPlateCol ? "border-primary bg-primary/20 text-primary font-bold" : "border-border text-muted hover:border-primary/50 hover:text-ink"}`}>
                      {h}
                    </button>
                  ))}
                </div>
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
                    <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحالة</th>
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
                        <td className="border-l border-border px-3 py-2 whitespace-nowrap">
                          <span className="flex items-center gap-1 font-bold text-brand-glow text-xs"><CheckCircle2 size={12} /> مطلوبة</span>
                        </td>
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
                            {Number.isFinite((r as { _dist: number })._dist) ? `${(r as { _dist: number })._dist.toFixed(1)} كم` : "—"}
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
            <div>
              <h2 className="text-sm font-bold text-primary">سيارات مطلوبة من ملف التشييك</h2>
              <p className="text-xs text-muted mt-0.5">{tashyeekResults.length} سيارة من ملف التشييك موجودة في قائمة الإحالة</p>
            </div>
            <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "40vh" }}>
              <table className="border-collapse w-full text-xs" style={{ direction: "rtl" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-2 text-muted">
                    <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                    {tashyeekTable?.headers.filter((h) => h !== tashyeekPlateCol).map((h) => (
                      <th key={h} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tashyeekResults.map((r, i) => {
                    const plate = r.tashyeekRow[tashyeekPlateCol ?? "رقم اللوحة"] ?? "";
                    return (
                      <tr key={i} className="border-b border-border bg-primary/5 hover:bg-primary/10 transition">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
              <button onClick={() => { setPasteText(""); setPasteResults([]); setPasteRan(false); wipePasteResults(); }}
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
                      <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">#</th>
                      <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                      {pasteAllCols.map((col) => (
                        <th key={col} className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="border-b border-border px-2 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {pasteResults.map((p, i) => {
                      const pasteKey = normalizePlate(bankPlateToArabic(p.converted));
                      const pasteColorIdx = pasteColorMap.get(pasteKey);
                      const pasteBg = pasteColorIdx !== undefined
                        ? DUPE_COLORS[pasteColorIdx].tw
                        : i % 2 === 0 ? "bg-surface" : "bg-surface-2/40";
                      return (
                      <tr
                        key={i}
                        className={`border-b border-border ${pasteBg}`}
                      >
                        <td className="border-l border-border px-2 py-1.5 text-center text-muted whitespace-nowrap">{i + 1}</td>
                        <td className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-ink">{p.converted}</span>
                            <span className="rounded-full bg-brand/20 px-1 py-0.5 font-bold text-brand leading-none" style={{ fontSize: "0.75em" }}>
                              مطلوبة
                            </span>
                          </div>
                        </td>
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
                          <button onClick={() => shareRowToWhatsApp(buildPasteRowObject(p))} className="text-muted hover:text-primary transition">
                            <Share2 size={12} />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
            </div>

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

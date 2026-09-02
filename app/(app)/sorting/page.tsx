"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ListFilter, CheckCircle2, AlertTriangle, Copy, Check, Share2,
  Navigation, ZoomIn, ZoomOut, FileSpreadsheet,
  ChevronDown, CheckSquare, Square, Trash2, ScanLine, X, Plus, MapPin, History,
} from "lucide-react";
import FileUploadBox from "@/components/FileUploadBox";
import PlateBadge from "@/components/PlateBadge";
import {
  type ExcelTable, buildSpreadsheetBlob, buildCsvBlob,
  openExcelBlob, shareExcelBlob, buildRowSummaryText, buildColoredSortExcel, readAllSheetsRaw, readSheetNames,
} from "@/lib/excel";
import {
  detectPlateColumn, detectArabicPlateColumn, bankPlateToArabic, normalizePlate, reversePlateLetters, matchTokensAgainstRows, tokenizePastedPlates, collectReferralEntries, type ReferralSource, type MatchResult, type TokenMatch,
} from "@/lib/plateParser";
import { groupResultsBySource } from "@/lib/resultWindows";
import { combinedDupColorMap } from "@/lib/dupColors";
import { playSortBeep } from "@/lib/sortBeep";
import { withLocationLink, buildSelectedShareText, pickMapsLink } from "@/lib/shareLocation";
import { matchesPreferred, guessDefaultColumns, isMandatory } from "@/lib/sortingCols";
import { resolveMergedResultColumns, joinDupValues, isHiddenTashyeekCol, defaultDataCols, type ResultColumnSource, type MergedResultColumn } from "@/lib/resultColumns";
import { loadColumnOrder, saveColumnOrder, orderedLabels, toggleColumn, loadOrderMode, saveOrderMode, FIXED_LEADING_LABELS, type OrderMode } from "@/lib/columnOrder";
import { getChassisRecords, matchChassisRecordsAgainstReferrals, type ChassisSortMatch } from "@/lib/chassisRecords";
import { haversineKm, gpsCellCoords, gpsCellToLink, toMapsLink, extractLatLngFromMapsLink, estimateDriveMinutes, formatDistanceKm, formatDurationMin } from "@/lib/gps";
import { shareTextViaChooser, copyShareText } from "@/lib/share";
import { detectLocationColumn, neighborsInSameLocation, neighborsFromStream, findIndexByPlate } from "@/lib/locationNeighbors";
import { analyzeWorkbook, totalPlates, defaultSelection, type SheetInfo } from "@/lib/referralSheets";
import ReferralSheetPicker from "@/components/ReferralSheetPicker";
import { importLargeDataFile, importMultiSheetData, getDataMeta, getSampleRows, clearData as clearBigData, iterateRows, type DataMeta } from "@/lib/dataStore";
import {
  recordAppearances, setPlateStatus, sheetFingerprint, describeHistory, isClosedStatus,
  newHistoryMap, pruneDetail, type HistoryMap, type PlateStatus,
} from "@/lib/plateHistory";
import { loadHistory, saveHistoryEntries, saveHistoryMap } from "@/lib/plateHistoryStore";
import { backupHistory, restoreHistory, pruneRemoteMonths } from "@/lib/plateHistoryBackup";
import PlateHistoryModal from "@/components/PlateHistoryModal";
import LocationNeighborsModal, { type NeighborsView } from "@/components/LocationNeighborsModal";
import { usePinchZoom, usePinchZoomMulti } from "@/components/usePinchZoom";
import {
  saveUploadedFile, getUploadedFile, deleteUploadedFile, type UploadedFileRecord,
  getAllFieldCheckEntries, type FieldCheckEntry,
} from "@/lib/idb";
import ShareSortButton from "@/components/ShareSortButton";
import { supabase } from "@/lib/supabaseClient";
import { isRecordsLinked, recordsTarget, unlinkRecords, RECORDS_LINK_EVENT, type RecordsTarget } from "@/lib/recordsAsData";

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

// كاش على مستوى الموديول — بيعيش طول ما التطبيق مفتوح (عبر التنقّل بين الصفحات)
// حتى لو localStorage فشل (نتايج كبيرة تتعدّى حد المساحة). الاسترجاع بيفضّله على
// localStorage عشان الفرز مايضيعش لمجرد إنك رحت صفحة تانية ورجعت.
// فوق الحجم ده: ملف الداتا يتقرا على دفعات ويتخزّن على الجهاز (بدل الذاكرة) عشان
// مايعملش crash على iOS. تحته: نفس المسار القديم بالظبط (الملفات الصغيرة مش متأثرة).
//
// ⚠️ الحد كان ١٢ ميجا وده كان عالي جداً على الآيفون: ملف xlsx أقل من ١٢ ميجا ممكن
// يفك لمئات الآلاف من الصفوف، وSheetJS بيحمّلهم كلهم في الذاكرة مرة واحدة → الآيفون
// بيقتل الصفحة (رسالة «حدثت مشكلة بشكل متكرر»). نزّلناه لـ٣ ميجا فأي ملف داتا حقيقي
// بيتقرا على دفعات (ذاكرة قليلة) والملفات الصغيرة الحقيقية بس هي اللي تفضل بالمسار
// العادي. مسار الدفعات كامل الوظائف للفرز (بحث/لصق/تام) فمفيش خسارة مميّزات.
const LARGE_DATA_THRESHOLD_BYTES = 3 * 1024 * 1024; // ~3MB (كان 12MB — عالي جداً على iOS)

type SortCache = { results: MatchResult[]; tashyeekResults: TashyeekResultRow[] | null; sortMode: "new" | "full"; newPlatesCount: number };
type PasteCache = { results: TokenMatch[]; recordResults: TokenMatch[]; text: string };
// نتايج الفرز محفوظة لكل وضع لوحده (جديد/كلي) — عشان التبديل بين الوضعين
// مايمسحش نتايج الوضع التاني؛ كل وضع بيفضّل نتايجه لحد ما تعمل فرز جديد فيه
// أو تمسحه. sortActiveMode = آخر وضع اشتغلت عليه (للاسترجاع بعد التنقّل/الفتح).
const sortCacheByMode: { new: SortCache | null; full: SortCache | null } = { new: null, full: null };
let sortActiveMode: "new" | "full" = "new";
let pasteResultsCache: PasteCache | null = null;
// نتيجة فرز أرقام الشاص على الإحالة — كاش يعيش عبر التنقّل (زي باقي نتايج الفرز).
let chassisSortCache: ChassisSortMatch[] | null = null;

// يجيب قيمة عمود من صف الإحالة بالكلمات المفتاحية (لوحة/نوع سيارة...).
function pickReferralCol(row: Record<string, string>, keywords: string[]): string {
  for (const k of Object.keys(row)) {
    const low = k.toLowerCase();
    if (keywords.some((kw) => low.includes(kw)) && String(row[k] ?? "").trim()) return String(row[k]).trim();
  }
  return "";
}

function fmtChassisDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** تاريخ تشييك المندوب بنفس شكل صفحة التشييك (يوم-شهر-سنة ساعة:دقيقة). */
function fmtCheckDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function persistSortCache() {
  try {
    localStorage.setItem(SORT_RESULTS_KEY, JSON.stringify({ byMode: sortCacheByMode, activeMode: sortActiveMode }));
  } catch { /* storage full — الكاش في الذاكرة بيغطّي */ }
}

function persistSortResults(
  results: MatchResult[],
  tashyeekResults: TashyeekResultRow[] | null,
  sortMode: "new" | "full",
  newPlatesCount: number,
) {
  sortCacheByMode[sortMode] = { results, tashyeekResults, sortMode, newPlatesCount };
  sortActiveMode = sortMode;
  persistSortCache();
}

// يمسح نتايج وضع واحد (أو الاتنين لو مفيش وضع محدد — زي مسح الملفات).
function wipeSortResults(mode?: "new" | "full") {
  if (mode) sortCacheByMode[mode] = null;
  else { sortCacheByMode.new = null; sortCacheByMode.full = null; }
  persistSortCache();
}

function persistPasteResults(
  results: TokenMatch[],
  recordResults: TokenMatch[],
  text: string,
) {
  pasteResultsCache = { results, recordResults, text };
  try {
    localStorage.setItem(PASTE_RESULTS_KEY, JSON.stringify({ results, recordResults, text }));
  } catch { /* storage full — الكاش في الذاكرة بيغطّي */ }
}

function wipePasteResults() {
  pasteResultsCache = null;
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
  // ربط سجلات المندوب كخانة داتا (من صفحة السجلات) — ربط حي بيتحدّث لوحده.
  const [recordsLinked, setRecordsLinked] = useState(false);
  const [recordsTgt, setRecordsTgt] = useState<RecordsTarget>("extra");
  const [outputCols, setOutputCols] = useState<Set<string>>(new Set());
  const [dataPlateColOverride, setDataPlateColOverride] = useState<string | null>(null);
  // ملف الداتا الكبير: بيتخزّن على دفعات في IndexedDB على الجهاز (بدل الذاكرة) عشان
  // مايقعش على iOS. dataTable في الوضع ده = عيّنة صغيرة للعرض/كشف الأعمدة بس؛
  // المطابقة الفعلية بتقرا الداتا الكاملة من القاعدة. الملفات الصغيرة زي ماهي.
  const [dataStreamed, setDataStreamed] = useState(false);
  const [dataStreamMeta, setDataStreamMeta] = useState<DataMeta | null>(null);
  // ── ملف داتا متعدد الورقات ("داتا" + "داتا قديمه"...) ──
  // كل ورقة فيها لوحات بتتخزّن على الجهاز موسومة باسمها، والمندوب يعلّم على اللي
  // عايز يفرز عليه (ورقة/أكتر). الاختيار بيتحفظ مربوط باسم الملف.
  const [dataSheetSel, setDataSheetSel] = useState<Set<string>>(new Set());
  const DATA_SHEETS_KEY = "ph:sorting:dataSheetSel";

  // ── Referral file (single, shared between new/full sort) ──
  const [referralTable, setReferralTable] = useState<ExcelTable | null>(null);
  const [referralFile, setReferralFile] = useState<File | null>(null);
  const [referralColsOpen, setReferralColsOpen] = useState(false);
  const [resultColsPickerOpen, setResultColsPickerOpen] = useState(false);
  const [referralBoxOpen, setReferralBoxOpen] = useState(true); // collapse/expand the whole "مربع الإحالة"
  const [referralExtraCols, setReferralExtraCols] = useState<Set<string>>(new Set());
  const [referralPlateColOverride, setReferralPlateColOverride] = useState<string | null>(null);

  // ── ملف إحالة متعدد الورقات ────────────────────────────────────────────────
  // ملفات الشركات بتيجي فيها ورقة بكل الأسطول + ورقات بالمطلوبين فعلاً، وكل ورقة
  // بشكل مختلف (اسم عمود اللوحة مختلف، والهيدر مش في أول صف، وفيه ورقات بلا
  // هيدر). بنحلّلها كلها ونخلّي المندوب يعلّم على اللي عايز يفرز عليه.
  const [refSheets, setRefSheets] = useState<SheetInfo[]>([]);
  const [refSheetSel, setRefSheetSel] = useState<Set<string>>(new Set());

  // ── شيتات إحالة إضافية (زر "+" — إحالة ٢، ٣، ٤...) ──
  // كل شيت إضافي بيتخزّن في slot خاص (referral-2, referral-3, ...) وبيتدمج مع
  // الإحالة الأساسية وقت الفرز. صندوق فاضي (بدون ملف) عادي — بيتخطّى في الفرز.
  type ExtraReferral = { id: string; table: ExcelTable | null; file: File | null };
  const [extraReferrals, setExtraReferrals] = useState<ExtraReferral[]>([]);
  const extraIdRef = useRef(1);                 // عدّاد لمفاتيح React ثابتة
  const extraHighWaterRef = useRef(1);          // أعلى رقم slot اتكتب (للتنظيف)

  // ── ملفات داتا إضافية (زر "+ إضافة ملف داتا") — كل ملف بيشتغل زي الأول، وكل
  // الفرز (جديد/كلي/مطلوب/لصق) بيتم على كل ملفات الداتا مدموجة. تتخزّن في slots
  // data-2, data-3... فتفضل بعد إعادة فتح التطبيق. صندوق فاضي عادي — بيتخطّى.
  // table = عيّنة معاينة (نفس مسار الأساسي streamed). لو streamed: الصفوف الكاملة
  // على الجهاز في dataStore بالـstreamSlot (مايتحملوش في الذاكرة → مفيش crash iOS).
  type ExtraDataFile = {
    id: string; table: ExcelTable | null; file: File | null;
    streamed?: boolean; streamSlot?: string; streamMeta?: DataMeta | null;
  };
  const [extraData, setExtraData] = useState<ExtraDataFile[]>([]);
  const extraDataIdRef = useRef(1);
  const extraDataHighWaterRef = useRef(1);

  // slot فريد وثابت لكل ملف داتا إضافي كبير (streamed). عدّاد دائم في localStorage
  // عشان مايتكررش عبر إعادة فتح التطبيق (لو استخدمنا معرّف المربع كان يتصادم لأن
  // عدّاد المعرّفات بيتصفّر عند كل فتح) — فمافيش ملف بيمسح ملف تاني بالغلط.
  function nextStreamSlot(): string {
    let seq = 1;
    try {
      seq = (parseInt(localStorage.getItem("ph:sorting:xdataSeq") || "0", 10) || 0) + 1;
      localStorage.setItem("ph:sorting:xdataSeq", String(seq));
    } catch { seq = Math.floor(Math.random() * 1e9); }
    return `xdata-${seq}`;
  }

  // اختيار أعمدة النتائج لكل مربع إضافي (داتا أو إحالة) — مفهرس بمعرّف المربع.
  // كل مربع إضافي بقى ليه قسم «الأعمدة» بتاعه زي المربعات الأساسية.
  const [extraColsSel, setExtraColsSel] = useState<Record<string, Set<string>>>({});
  const [extraColsOpen, setExtraColsOpen] = useState<Set<string>>(new Set());

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
  // نتيجة فرز أرقام الشاص على الإحالة (نافذة «مطلوب من أرقام الشاص»).
  const [chassisResults, setChassisResults] = useState<ChassisSortMatch[] | null>(null);
  const [sorted, setSorted] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [zoom, setZoom] = useState(3);
  // زوم بإصبعين لنوافذ نتائج الفرز (كلها بتشارك نفس مؤشّر الزوم).
  const resPinchFor = usePinchZoomMulti(zoom, setZoom);   // نافذة لكل ملف داتا
  const tashPinch = usePinchZoom(zoom, setZoom);
  const pastePinch = usePinchZoom(zoom, setZoom);
  const pastePinch2 = usePinchZoom(zoom, setZoom);
  /**
   * لما يتحطّ أكتر من ملف داتا، نتيجة كل ملف بتطلع في **نافذة لوحدها**. الحالات
   * دي بقت لكل نافذة (المفتاح = رقم ملف الداتا): الترقيم، والتحديد.
   * الأرقام اللي جوه الـ Set هي فهارس **عامّة** في `displayResults` — عشان
   * دوال الحذف/المشاركة القديمة تفضل شغالة زي ما هي بالظبط.
   */
  const [visibleByWin, setVisibleByWin] = useState<Record<number, number>>({});
  const [selectedByWin, setSelectedByWin] = useState<Record<number, Set<number>>>({});
  const EMPTY_SEL: Set<number> = useMemo(() => new Set(), []);
  const visibleOf = (k: number) => visibleByWin[k] ?? PAGE_SIZE;
  const selOf = (k: number) => selectedByWin[k] ?? EMPTY_SEL;
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // تأكيد «تم النسخ» للشريط الجماعي — النسخ هو الطريق الوحيد اللي بيوصّل
  // قائمة كبيرة كاملة (زرار المشاركة بيتقص عند ١٦ كيلوبايت على الآيفون).
  const [bulkCopied, setBulkCopied] = useState<"" | "results" | "tashyeek">("");
  async function copyBulk(text: string, which: "results" | "tashyeek") {
    if (await copyShareText(text)) {
      setBulkCopied(which);
      setTimeout(() => setBulkCopied(""), 1500);
    }
  }
  const [nearestActive, setNearestActive] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [newPlatesCount, setNewPlatesCount] = useState(0);
  // التشخيص التقني يظهر للأدمن فقط، ومطوي افتراضياً (سهم لفتحه). المندوب
  // مايشوفهوش خالص.
  const [isAdmin, setIsAdmin] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);

  // ── Paste ──
  const [pasteText, setPasteText] = useState("");
  const [pasteResults, setPasteResults] = useState<TokenMatch[]>([]);
  // تطابق نفس اللوحات الملصوقة مع شيت السجلات (tashyeekTable) — لوحات سبق
  // تشييكها صوت/يدوي قبل كدة، منفصلة عن تطابق ملف الداتا لأن أعمدتها مختلفة.
  const [pasteRecordResults, setPasteRecordResults] = useState<TokenMatch[]>([]);
  const [pasteRan, setPasteRan] = useState(false);
  const [pasteBusy, setPasteBusy] = useState(false); // بحث اللصق شغّال (الملف الكبير بياخد ثواني)

  // معاينة تحويل اللوحات الملصوقة للعربي — كل لوحة إنجليزي بتتحوّل زي ما الفرز
  // بيعمل بالظبط (bankPlateToArabic)، فالمندوب يتأكد إن التحويل صح قبل ما يفرز.
  const pastePreview = useMemo(() => {
    if (!pasteText.trim()) return [];
    return tokenizePastedPlates(pasteText).map((raw) => {
      const hasLatin = /[A-Za-z]/.test(raw);
      const ar = bankPlateToArabic(raw);
      // مسافة بين الحروف والأرقام للقراءة (عرض فقط — الفرز بيستخدم الملتصق).
      const arDisplay = ar.replace(/^([^\d]+)(\d.*)$/, "$1 $2");
      return { raw, ar: arDisplay, hasLatin };
    });
  }, [pasteText]);
  const pasteLatinCount = pastePreview.filter((p) => p.hasLatin).length;
  // نص اللوحات المتعرَّبة فقط (بدون الإنجليزي) — لأزرار النسخ/المشاركة تحت المعاينة.
  const pasteArabicText = useMemo(() => pastePreview.map((p) => p.ar).join("\n"), [pastePreview]);
  const [pasteArCopied, setPasteArCopied] = useState(false);
  async function copyPasteArabic() {
    try {
      await navigator.clipboard.writeText(pasteArabicText);
      setPasteArCopied(true);
      setTimeout(() => setPasteArCopied(false), 1500);
    } catch { alert("تعذّر النسخ."); }
  }

  // ── سجل السيارات (هيستوري) — خاص بكل مندوب على جهازه ──────────────────────
  // بيتحمّل مرة عند فتح الصفحة، وبيتحدّث بعد كل فرز (ظهور جديد) وبعد كل إجراء
  // (سحبها / ملقيتهاش). مايأثرش على منطق الفرز — عمود عرض + تسجيل إجراء فقط.
  const [history, setHistory] = useState<HistoryMap>(() => newHistoryMap());
  const [historyAgentId, setHistoryAgentId] = useState<string | null>(null);
  const [historyPlate, setHistoryPlate] = useState<string | null>(null); // اللوحة المفتوحة في النافذة
  const [hideClosed, setHideClosed] = useState(false);                   // إخفاء المقفولة (اختياري)
  const [pasteZoom, setPasteZoom] = useState(1);

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
        } else {
          // مفيش ملف صغير → شوف لو فيه ملف داتا كبير مخزّن على الجهاز (streamed).
          const bigMeta = await getDataMeta("data");
          if (bigMeta) {
            const sample = await getSampleRows(50);
            setDataStreamed(true);
            setDataStreamMeta(bigMeta);
            setDataTable({ headers: bigMeta.headers, rows: sample, sheetName: bigMeta.sheetName });
            setDataFile(new File([new Blob()], bigMeta.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            setOutputCols(new Set(guessDefaultColumns(bigMeta.headers, bigMeta.plateCol)));
            // ملف متعدد الورقات؟ استرجع اختيار الورقات المحفوظ (أو الافتراضي).
            if (bigMeta.sheets && bigMeta.sheets.length > 1) applyDataSheetSelection(bigMeta, bigMeta.fileName);
          }
        }
        if (refRec) {
          setReferralTable({ headers: refRec.headers, rows: refRec.rows });
          const refFile = new File([refRec.fileBlob ?? new Blob()], refRec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          setReferralFile(refFile);
          // أعد تحليل الورقات (لو الملف متعدد) واسترجع اختيار المندوب المحفوظ.
          if (refRec.fileBlob) void analyzeReferralFile(refFile);
          const p = detectPlateColumn(refRec.headers, refRec.rows);
          setReferralExtraCols(new Set(refRec.headers.filter((h) => h !== p && matchesPreferred(h))));
        }
        if (checkRec) {
          setCheckTable({ headers: checkRec.headers, rows: checkRec.rows });
        }
        // شيتات الإحالة الإضافية: نبحث في slots متتابعة (referral-2, referral-3, ...)
        // لحد أول slot فاضي — كده تفضل بعد إعادة فتح التطبيق.
        try {
          const extras: ExtraReferral[] = [];
          for (let n = 2; n < 100; n++) {
            const rec = await getUploadedFile("local", `referral-${n}`);
            if (!rec) break;
            extras.push({
              id: `ref-b${n}`,
              table: { headers: rec.headers, rows: rec.rows },
              file: new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
            });
            extraHighWaterRef.current = n;
          }
          if (extras.length > 0) {
            setExtraReferrals(extras);
            const sel: Record<string, Set<string>> = {};
            for (const e of extras) if (e.table) sel[e.id] = defaultExtraCols("referral", e.table);
            setExtraColsSel((cs) => ({ ...cs, ...sel }));
          }
        } catch { /* no extra referrals */ }
        // ملفات الداتا الإضافية: slots متتابعة (data-2, data-3, ...).
        try {
          const extras: ExtraDataFile[] = [];
          for (let n = 2; n < 100; n++) {
            const rec = await getUploadedFile("local", `data-${n}`);
            if (!rec) break;
            if (rec.streamed && rec.streamSlot) {
              // ملف إضافي كبير: الصفوف على الجهاز في dataStore — نسترجع الميتا +
              // عيّنة معاينة بس (مايتحملش في الذاكرة). لو قاعدته اختفت نتخطّاه.
              const meta = await getDataMeta(rec.streamSlot);
              if (!meta) continue;
              const sample = await getSampleRows(50, rec.streamSlot);
              extras.push({
                id: `data-b${n}`,
                table: { headers: meta.headers, rows: sample, sheetName: meta.sheetName },
                file: new File([new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                streamed: true, streamSlot: rec.streamSlot, streamMeta: meta,
              });
            } else {
              extras.push({
                id: `data-b${n}`,
                table: { headers: rec.headers, rows: rec.rows },
                file: new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
              });
            }
            extraDataHighWaterRef.current = n;
          }
          if (extras.length > 0) {
            setExtraData(extras);
            const sel: Record<string, Set<string>> = {};
            for (const e of extras) if (e.table) sel[e.id] = defaultExtraCols("data", e.table);
            setExtraColsSel((cs) => ({ ...cs, ...sel }));
          }
        } catch { /* no extra data files */ }
        // شيت التسجيلات (الميداني) يغذّي الفرز تلقائياً — يُبنى من السجلات المحفوظة
        // في التطبيق، ويحل محل رفع ملف تشييك يدوي.
        try {
          const fieldEntries = await getAllFieldCheckEntries();
          if (fieldEntries.length > 0) {
            const keys = new Set<string>(["رقم اللوحة"]);
            for (const e of fieldEntries) for (const k of Object.keys(e.row)) keys.add(k);
            keys.add("GPS");
            keys.add("التاريخ");   // تاريخ تشييك المندوب — لازم يبان في نتيجة السجلات ومشاركتها
            keys.add("الحالة");    // طريقة التشييك (كاميرا/صوت/يدوي) — زي تصدير السجلات
            const headers = [...keys];
            const rows = fieldEntries.map((e) => ({
              "رقم اللوحة": e.plate,
              ...e.row,
              // طريقة التشييك — متخزّنة في e.method مش جوه e.row، فلازم تتضاف
              // هنا وإلا عمود «الحالة» يفضل فاضي في نتيجة فرز السجلات.
              "الحالة": e.method || "",
              // موقع وقت التشييك: نفضّل الرابط المحفوظ، وإلا نبنيه من الإحداثيات
              // (بعض السجلات عندها lat/lng بدون mapsLink) — عشان «خريطة» تفتح صح.
              "GPS": e.mapsLink || (typeof e.lat === "number" && typeof e.lng === "number" ? toMapsLink(e.lat, e.lng) : ""),
              // وقت التشييك الفعلي (مش عمود من الشيت) — بيغلب أي «تاريخ» جوه e.row.
              "التاريخ": e.checkedAt ? fmtCheckDate(e.checkedAt) : (e.row?.["التاريخ"] ?? ""),
            } as Record<string, string>));
            setTashyeekTable({ headers, rows });
            setTashyeekFile(null);
          }
        } catch { /* no field sheet yet */ }
        try {
          // الكاش في الذاكرة أولاً (بيعيش عبر التنقّل)، وإلا localStorage.
          if (!sortCacheByMode.new && !sortCacheByMode.full) {
            const raw = localStorage.getItem(SORT_RESULTS_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as { byMode?: typeof sortCacheByMode; activeMode?: "new" | "full" };
              if (parsed.byMode) {
                sortCacheByMode.new = parsed.byMode.new ?? null;
                sortCacheByMode.full = parsed.byMode.full ?? null;
                sortActiveMode = parsed.activeMode ?? "new";
              }
            }
          }
          const active = sortActiveMode;
          const s = sortCacheByMode[active];
          setSortMode(active);
          if (s && Array.isArray(s.results) && s.results.length > 0) {
            setNewPlatesCount(s.newPlatesCount ?? 0);
            setResults(s.results);
            setSorted(true);
            if (Array.isArray(s.tashyeekResults)) setTashyeekResults(s.tashyeekResults);
          }
          if (chassisSortCache && chassisSortCache.length > 0) setChassisResults(chassisSortCache);
        } catch { /* corrupt storage */ }
        try {
          let s: PasteCache | null = pasteResultsCache;
          if (!s) {
            const rawPaste = localStorage.getItem(PASTE_RESULTS_KEY);
            if (rawPaste) s = JSON.parse(rawPaste) as PasteCache;
          }
          if (s && Array.isArray(s.results) && s.results.length > 0) {
            setPasteResults(s.results);
            if (Array.isArray(s.recordResults)) setPasteRecordResults(s.recordResults);
            setPasteText(s.text ?? "");
            setPasteRan(true);
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
          const rf = new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
          setReferralFile(rf);
          setReferralPlateColOverride(null);
          setResults(null); setSorted(false);
          const p = detectPlateColumn(rec.headers, rec.rows);
          setReferralExtraCols(new Set(rec.headers.filter((h) => h !== p && matchesPreferred(h))));
          // الملف اتغيّر من مكان تاني → أعد تحليل الورقات، وإلا الاختيار يفضل
          // على ورقات الملف القديم أو يختفي.
          if (rec.fileBlob) void analyzeReferralFile(rf);
        });
      } else if (slot === "data") {
        (async () => {
          const rec = await getUploadedFile("local", "data");
          if (rec) {
            // ملف صغير عادي
            setDataStreamed(false); setDataStreamMeta(null); setDataSheetSel(new Set());
            setDataTable({ headers: rec.headers, rows: rec.rows });
            setDataFile(new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
            setDataPlateColOverride(null);
            setResults(null); setSorted(false);
            setOutputCols(new Set(defaultDataCols(rec.headers, rec.rows, detectPlateColumn(rec.headers, rec.rows))));
            return;
          }
          // مفيش ملف صغير → داتا متدفّقة (كبيرة/متعددة الورقات) اتخزّنت من «الملف الوارد».
          const bigMeta = await getDataMeta("data");
          if (!bigMeta) return;
          const sample = await getSampleRows(50);
          setDataStreamed(true); setDataStreamMeta(bigMeta);
          setDataTable({ headers: bigMeta.headers, rows: sample, sheetName: bigMeta.sheetName });
          setDataFile(new File([new Blob()], bigMeta.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
          setDataPlateColOverride(null);
          setOutputCols(new Set(guessDefaultColumns(bigMeta.headers, bigMeta.plateCol)));
          setResults(null); setSorted(false);
          if (bigMeta.sheets && bigMeta.sheets.length > 1) applyDataSheetSelection(bigMeta, bigMeta.fileName);
          else setDataSheetSel(new Set());
        })();
      } else if (slot.startsWith("referral-")) {
        // إحالة إضافية اتضافت من مربع «فتح الإكسيل» — أعد قراءة كل الإحالات الإضافية
        // (لو الصفحة مفتوحة أصلاً؛ فتح جديد بيقراهم في الـ bootstrap).
        (async () => {
          const extras: ExtraReferral[] = [];
          for (let n = 2; n < 100; n++) {
            const rec = await getUploadedFile("local", `referral-${n}`);
            if (!rec) break;
            extras.push({
              id: `ref-b${n}`,
              table: { headers: rec.headers, rows: rec.rows },
              file: new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
            });
            extraHighWaterRef.current = n;
          }
          setExtraReferrals(extras);
          const sel: Record<string, Set<string>> = {};
          for (const e of extras) if (e.table) sel[e.id] = defaultExtraCols("referral", e.table);
          setExtraColsSel((cs) => ({ ...cs, ...sel }));
          setResults(null); setSorted(false);
        })();
      } else if (slot.startsWith("data-")) {
        // ملف داتا إضافي اتضاف — أعد قراءة كل ملفات الداتا الإضافية.
        (async () => {
          const extras: ExtraDataFile[] = [];
          for (let n = 2; n < 100; n++) {
            const rec = await getUploadedFile("local", `data-${n}`);
            if (!rec) break;
            if (rec.streamed && rec.streamSlot) {
              // ملف إضافي كبير: الصفوف على الجهاز في dataStore — نسترجع الميتا +
              // عيّنة معاينة بس (مايتحملش في الذاكرة). لو قاعدته اختفت نتخطّاه.
              const meta = await getDataMeta(rec.streamSlot);
              if (!meta) continue;
              const sample = await getSampleRows(50, rec.streamSlot);
              extras.push({
                id: `data-b${n}`,
                table: { headers: meta.headers, rows: sample, sheetName: meta.sheetName },
                file: new File([new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                streamed: true, streamSlot: rec.streamSlot, streamMeta: meta,
              });
            } else {
              extras.push({
                id: `data-b${n}`,
                table: { headers: rec.headers, rows: rec.rows },
                file: new File([rec.fileBlob ?? new Blob()], rec.fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
              });
            }
            extraDataHighWaterRef.current = n;
          }
          setExtraData(extras);
          const sel: Record<string, Set<string>> = {};
          for (const e of extras) if (e.table) sel[e.id] = defaultExtraCols("data", e.table);
          setExtraColsSel((cs) => ({ ...cs, ...sel }));
          setResults(null); setSorted(false);
        })();
      }
    };
    window.addEventListener("idbFileUpdated", handler);
    return () => window.removeEventListener("idbFileUpdated", handler);
  }, []);

  // هل المستخدم الحالي أدمن؟ (التشخيص التقني يظهر للأدمن فقط).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).single();
        setIsAdmin(prof?.role === "admin");
      } catch { /* غير متاح — يفضل مخفي */ }
    })();
  }, []);

  useEffect(() => {
    if (dataTable) {
      const p = detectPlateColumn(dataTable.headers, dataTable.rows);
      setOutputCols(new Set(defaultDataCols(dataTable.headers, dataTable.rows, p)));
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

  // أعمدة نتيجة الفرز — **٨ أعمدة ثابتة بترتيب محدد**: رقم اللوحة (أول عمود لوحده)
  // ثم نوع السيارة › الماركة › العنوان › GPS › اللون › سنة الصنع › تاريخ التسجيل.
  // كل عمود بيتكتشف بالاسم أو بالمحتوى (resolveResultColumns) — فيشتغل مهما كان
  // اسم العمود، وحتى لو الشيت بدون أسماء أعمدة. بندمج مصدرين: الداتا (نوع/عنوان/
  // GPS/تاريخ غالباً) + الإحالة (ماركة/لون/سنة غالباً)، والداتا لها الأولوية.
  // ── ورقات الإحالة المختارة (ملف متعدد الورقات) ─────────────────────────────
  // لازم تتعرّف **قبل** resultCols لأنها بتدخل في مصادر الأعمدة.
  const selectedRefSheets = useMemo(
    () => refSheets.filter((s) => s.plateCount > 0 && refSheetSel.has(s.name)),
    [refSheets, refSheetSel]
  );
  const isMultiSheetRef = refSheets.filter((s) => s.plateCount > 0).length > 1;

  // ── ورقات ملف الداتا (متعدد الورقات) ───────────────────────────────────────
  // الميتا بتيجي من dataStreamMeta.sheets (استيراد importMultiSheetData). بنبنيها
  // كـ SheetInfo خفيفة (بلا صفوف — الصفوف على القرص) عشان نعيد استخدام نفس
  // مكوّن الاختيار بتاع الإحالة.
  const dataSheetMetas = useMemo(() => dataStreamMeta?.sheets ?? [], [dataStreamMeta]);
  const isMultiSheetData = dataSheetMetas.length > 1;
  // ملحوظة: للداتا بنعرض **عدد الصفوف** (كل اللي بيتقري ويتفرز فعلاً) بدل اللوحات
  // الفريدة — عشان ملف التفريغ فيه نفس اللوحة متكررة كتير، فاللوحات الفريدة أقل من
  // الصفوف وكانت بتلخبط («مش قاري الكل»). الرقم هنا بيطابق «عدد الصفوف» فوق المربع.
  const dataSheetInfos = useMemo<SheetInfo[]>(
    () => dataSheetMetas.map((s) => ({
      name: s.name, headerRow: 0, plateCol: 0, plateColName: s.plateColName,
      plateCount: s.rowCount, headers: s.headers, rows: [], hidden: false,
    })),
    [dataSheetMetas]
  );
  // الورقات المختارة اللي الفرز يقرا منها (null = مش متعدد → اقرا الكل).
  const selectedDataSheetFilter = useMemo(
    () => (isMultiSheetData ? new Set([...dataSheetSel].filter((n) => dataSheetMetas.some((s) => s.name === n))) : null),
    [isMultiSheetData, dataSheetSel, dataSheetMetas]
  );
  // إجمالي الصفوف اللي هيتفرز عليها (كل صفوف الورقات المختارة) — بيطابق أعلى المربع.
  const selectedDataRowTotal = useMemo(
    () => dataSheetMetas.filter((s) => dataSheetSel.has(s.name)).reduce((a, s) => a + s.rowCount, 0),
    [dataSheetMetas, dataSheetSel]
  );
  // اسم الورقة → مفتاح عمود لوحتها (لأن الورقات ممكن يكون فيها أعمدة لوحة مختلفة).
  const sheetPlateColMap = useMemo(
    () => new Map(dataSheetMetas.map((s) => [s.name, s.plateCol])),
    [dataSheetMetas]
  );
  // كل ورقات الداتا فيها لوحات؟ (جاهزية الفرز في وضع متعدد الورقات = ورقة مختارة).
  const dataSheetsReady = !isMultiSheetData || (selectedDataSheetFilter?.size ?? 0) > 0;

  // يطبّق الاختيار الافتراضي/المحفوظ لورقات الداتا (الافتراضي = أكبر ورقة لوحات،
  // زي سلوك اليوم اللي بيختار ورقة واحدة). مربوط باسم الملف زي الإحالة بالظبط.
  const applyDataSheetSelection = useCallback((meta: DataMeta, fileName: string) => {
    const metas = meta.sheets ?? [];
    if (metas.length <= 1) { setDataSheetSel(new Set(metas.map((s) => s.name))); return; }
    let saved: string[] | null = null;
    try {
      const j = JSON.parse(localStorage.getItem(DATA_SHEETS_KEY) ?? "null");
      if (j && j.file === fileName && Array.isArray(j.sheets)) saved = j.sheets;
    } catch { /* تخزين معطّل */ }
    const valid = new Set(metas.map((s) => s.name));
    const biggest = metas.reduce((a, b) => (b.plateCount > a.plateCount ? b : a), metas[0]);
    const picked = saved ? saved.filter((n) => valid.has(n)) : [biggest.name];
    setDataSheetSel(new Set(picked.length ? picked : metas.map((s) => s.name)));
  }, []);

  // يحفظ اختيار ورقات الداتا (مربوط باسم الملف) + يصفّر النتيجة القديمة.
  const setDataSheetSelection = useCallback((next: Set<string>) => {
    setDataSheetSel(next);
    try {
      localStorage.setItem(DATA_SHEETS_KEY, JSON.stringify({ file: dataFile?.name ?? "", sheets: [...next] }));
    } catch { /* تخزين معطّل */ }
    setResults(null); setSorted(false); wipeSortResults();
  }, [dataFile]);

  // أعمدة قايمة الاختيار تحت مربع الإحالة — من الورقات المختارة (مش من الورقة
  // اللي parseExcelFile اختارها)، وإلا المندوب يشوف أعمدة ورقة مش بيفرز عليها.
  const refPickerPlateCol = useMemo(
    () => (isMultiSheetRef ? (selectedRefSheets[0]?.plateColName || null) : effectiveReferralPlateCol),
    [isMultiSheetRef, selectedRefSheets, effectiveReferralPlateCol]
  );
  const refPickerCols = useMemo(() => {
    const plate = refPickerPlateCol;
    const src = isMultiSheetRef
      ? selectedRefSheets.flatMap((s) => s.headers)
      : (referralTable?.headers ?? []);
    return [...new Set(src)].filter((h) => h && h !== plate);
  }, [isMultiSheetRef, selectedRefSheets, referralTable, refPickerPlateCol]);

  // لما الورقات المختارة تتغيّر في ملف متعدد الورقات، الأعمدة الافتراضية لازم
  // تتحسب من الورقات دي — مش من الورقة اللي parseExcelFile اختارها وقت الرفع.
  const lastRefSelSig = useRef<string>("");
  useEffect(() => {
    if (!isMultiSheetRef) return;
    const sig = selectedRefSheets.map((s) => s.name).join("");
    if (sig === lastRefSelSig.current) return;
    lastRefSelSig.current = sig;
    const plate = selectedRefSheets[0]?.plateColName ?? "";
    const cols = [...new Set(selectedRefSheets.flatMap((s) => s.headers))]
      .filter((h) => h && h !== plate && matchesPreferred(h));
    setReferralExtraCols(new Set(cols));
  }, [isMultiSheetRef, selectedRefSheets]);

  const resultCols = useMemo(() => {
    const sources: ResultColumnSource[] = [];
    if (dataTable) {
      sources.push({ kind: "data", headers: dataTable.headers, rows: dataTable.rows, plateCol: effectiveDataPlateCol });
    }
    // سجلات المندوب كخانة داتا (ربط حي) — أعمدتها لازم تظهر في نتيجة الفرز زي أي داتا.
    if (recordsLinked && tashyeekTable && tashyeekPlateCol) {
      sources.push({ kind: "data", headers: tashyeekTable.headers, rows: tashyeekTable.rows, plateCol: tashyeekPlateCol });
    }
    // **مهم:** لو الملف متعدد الورقات، الأعمدة لازم تتقري من **الورقات المختارة**
    // (نفس اللي المطابقة بتتم عليها في collectRefSources) — مش من الورقة اللي
    // parseExcelFile اختارها لوحدها. من غير كده البرنامج بيطابق على ورقة ويجيب
    // الأعمدة من ورقة تانية (حصل فعلاً: محفظة فيها Sheet1 مخفية بأعمدة إنجليزي،
    // فعمود «نوع المركبة» العربي ماكانش بيظهر في النتيجة خالص).
    if (isMultiSheetRef) {
      for (const s of selectedRefSheets) {
        sources.push({ kind: "referral", headers: s.headers, rows: s.rows, plateCol: s.headers[s.plateCol] ?? null });
      }
    } else if (referralTable) {
      sources.push({ kind: "referral", headers: referralTable.headers, rows: referralTable.rows, plateCol: effectiveReferralPlateCol });
    }
    // شيتات الإحالة الإضافية (زر +) — أعمدتها (لون/سنة/ماركة) لازم تظهر في النتيجة
    // زي الأساسية بالظبط، وإلا المحفظة المرفوعة كإحالة إضافية تطلع بلا أعمدة.
    for (const er of extraReferrals) {
      if (!er.table) continue;
      const erPlate = detectArabicPlateColumn(er.table.headers) ?? detectPlateColumn(er.table.headers, er.table.rows);
      sources.push({ kind: "referral", headers: er.table.headers, rows: er.table.rows, plateCol: erPlate });
    }
    return resolveMergedResultColumns(sources);
  }, [dataTable, referralTable, effectiveDataPlateCol, effectiveReferralPlateCol, extraReferrals,
      isMultiSheetRef, selectedRefSheets, recordsLinked, tashyeekTable, tashyeekPlateCol]);

  // أعمدة الإحالة الإضافية المختارة — من المربع الأساسي (referralExtraCols) +
  // كل مربع إحالة إضافي (extraColsSel[er.id]). بتتقري من صف الإحالة وبتتلحق
  // بأعمدة النتيجة. بنستبعد اللي ظاهر أصلاً في الأعمدة الثابتة (نفس المصدر).
  const extraReferralResultCols = useMemo<MergedResultColumn[]>(() => {
    const usedRef = new Set(resultCols.filter((c) => c.source === "referral").flatMap((c) => c.sourceCols));
    const picked = new Set<string>();
    for (const h of referralExtraCols) picked.add(h);
    for (const er of extraReferrals) {
      if (!er.table) continue;
      for (const h of extraColsSel[er.id] ?? []) picked.add(h);
    }
    return [...picked].filter((h) => !usedRef.has(h))
      .map((col, i) => ({ id: `xref-${i}`, key: `xref-${col}`, label: col, source: "referral" as const, sourceCol: col, sourceCols: [col] }));
  }, [referralExtraCols, extraReferrals, extraColsSel, resultCols]);

  // أعمدة الداتا الإضافية المختارة — من المربع الأساسي (outputCols/الإجبارية) +
  // كل مربع داتا إضافي (extraColsSel[ed.id]). بنستبعد اللي ظاهر أصلاً في الأعمدة
  // الثابتة (نفس المصدر). كده أي عمود المندوب يعلّم عليه بيظهر في النتيجة.
  const extraDataResultCols = useMemo<MergedResultColumn[]>(() => {
    const usedData = new Set(resultCols.filter((c) => c.source === "data").flatMap((c) => c.sourceCols));
    const picked = new Set<string>();
    if (dataTable) {
      for (const h of dataTable.headers) {
        if (h && h !== effectiveDataPlateCol && (isMandatory(h) || outputCols.has(h))) picked.add(h);
      }
    }
    for (const ed of extraData) {
      if (!ed.table) continue;
      for (const h of ed.table.headers) if (isMandatory(h)) picked.add(h); // إجبارية من الملف الإضافي
      for (const h of extraColsSel[ed.id] ?? []) picked.add(h);
    }
    // سجلات المندوب المربوطة كداتا — كل أعمدة الشيت تظهر في النتيجة (الشيت بالكامل).
    if (recordsLinked && tashyeekTable && tashyeekPlateCol) {
      for (const h of tashyeekTable.headers) if (h && h !== tashyeekPlateCol) picked.add(h);
    }
    return [...picked].filter((h) => !usedData.has(h))
      .map((col, i) => ({ id: `xdata-${i}`, key: `xdata-${col}`, label: col, source: "data" as const, sourceCol: col, sourceCols: [col] }));
  }, [dataTable, resultCols, effectiveDataPlateCol, outputCols, extraData, extraColsSel, recordsLinked, tashyeekTable, tashyeekPlateCol]);

  // أعمدة نتيجة **السجلات** — نفس نظام أعمدة نتيجة الداتا بالظبط: الأعمدة
  // الثابتة بالترتيب (نوع السيارة › العنوان › الحي › الماركة › GPS › اللون ›
  // سنة الصنع › تاريخ التسجيل) مدموجة من مصدرين: شيت السجلات + شيتات الإحالة.
  // قبل كده الأعمدة كانت بتتاخد من شيت السجلات **بس**، فبيانات السيارة اللي
  // في المحفظة (النوع/الماركة/اللون/السنة) ماكانش ليها عمود يعرضها أصلاً حتى
  // لو الصف موجود — فكانت النتيجة بتطلع لوحة وتاريخ وموقع وخلاص.
  const tashyeekResultCols = useMemo<MergedResultColumn[]>(() => {
    if (!tashyeekTable) return [];
    const sources: ResultColumnSource[] = [
      { kind: "data", headers: tashyeekTable.headers, rows: tashyeekTable.rows, plateCol: tashyeekPlateCol },
    ];
    if (referralTable) {
      sources.push({ kind: "referral", headers: referralTable.headers, rows: referralTable.rows, plateCol: effectiveReferralPlateCol });
    }
    for (const er of extraReferrals) {
      if (!er.table) continue;
      const erPlate = detectArabicPlateColumn(er.table.headers) ?? detectPlateColumn(er.table.headers, er.table.rows);
      sources.push({ kind: "referral", headers: er.table.headers, rows: er.table.rows, plateCol: erPlate });
    }
    const fixed = resolveMergedResultColumns(sources);
    // أي عمود في شيت السجلات ما اتستخدمش في الأعمدة الثابتة (زي «الحالة») بيتلحق
    // بعدها — عشان ما نفقدش أي بيانات كانت بتظهر قبل كده.
    const used = new Set(fixed.filter((c) => c.source === "data").flatMap((c) => c.sourceCols));
    const leftovers: MergedResultColumn[] = tashyeekTable.headers
      .filter((h) => h && h !== tashyeekPlateCol && !used.has(h))
      .map((col, i) => ({
        id: `xtash-${i}`, key: `xtash-${col}`, label: col,
        source: "data" as const, sourceCol: col, sourceCols: [col],
      }));
    // أعمدة مالهاش لازمة في نتيجة السجلات (بطلب المندوب): الملاحظات/البنك/
    // الشاص/الهيكل، وأعمدة اللوحة المكررة اللي بتتلحق آخر النافذة. «رقم اللوحة»
    // الأساسي مش منها — بيتحط لوحده في أول الصف قبل الأعمدة دي.
    return [...fixed, ...leftovers].filter((c) => !isHiddenTashyeekCol(c.label));
  }, [tashyeekTable, tashyeekPlateCol, referralTable, effectiveReferralPlateCol, extraReferrals]);

  // كل أعمدة النتيجة = الثابتة + داتا إضافية مختارة + إحالة إضافية مختارة
  // (عرض + تصدير + واتساب).
  // ترتيب أعمدة النتيجة اللي المندوب يختاره — يتحفظ على الجهاز ويطبّق على العرض
  // والإكسيل والصورة وكل أنواع الفرز وصفحة المطلوب. رقم اللوحة دايماً أول عمود،
  // بعده الثابت (نوع السيارة › الماركة)، بعدهم اللي المندوب اختاره بترتيبه. مفيش
  // اختيار = الثابت بس.
  const [colOrder, setColOrder] = useState<string[]>([]);
  // الوضع: «أساسي» (ترتيب البرنامج الافتراضي — الافتراضي لأي مندوب) أو «مخصّص».
  const [orderMode, setOrderModeState] = useState<OrderMode>("basic");
  useEffect(() => { setColOrder(loadColumnOrder()); setOrderModeState(loadOrderMode()); }, []);

  // حالة ربط السجلات كخانة داتا — تُقرأ عند الفتح، وتتحدّث لو المندوب غيّرها من
  // صفحة السجلات (حدث مخصّص) أو رجع للتاب (visibilitychange).
  useEffect(() => {
    const read = () => { setRecordsLinked(isRecordsLinked()); setRecordsTgt(recordsTarget()); };
    read();
    const onVis = () => { if (document.visibilityState === "visible") read(); };
    window.addEventListener(RECORDS_LINK_EVENT, read);
    window.addEventListener("storage", read);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(RECORDS_LINK_EVENT, read);
      window.removeEventListener("storage", read);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  function setOrderMode(m: OrderMode) { setOrderModeState(m); saveOrderMode(m); }
  function toggleOrderCol(label: string) {
    setColOrder((prev) => { const next = toggleColumn(prev, label); saveColumnOrder(next); return next; });
  }

  // كل الأعمدة اللي البرنامج قدر يطلّعها (قبل اختيار/ترتيب المندوب).
  const allResultColsRaw = useMemo(
    () => [...resultCols, ...extraDataResultCols, ...extraReferralResultCols],
    [resultCols, extraDataResultCols, extraReferralResultCols]
  );
  // **كل** أعمدة شيت الداتا/الإحالة الخام اللي مش ضمن الأعمدة المفيدة فوق — عشان
  // المندوب يقدر يختار **أي عمود في ملفه** من قائمة الترتيب (مش المفيدة بس).
  const rawExtraCols = useMemo<MergedResultColumn[]>(() => {
    const have = new Set(allResultColsRaw.map((c) => c.label));
    const out: MergedResultColumn[] = [];
    const addFrom = (headers: string[] | undefined, plateCol: string | null | undefined, source: "data" | "referral") => {
      if (!headers) return;
      for (const h of headers) {
        if (!h || h === plateCol || have.has(h)) continue;
        have.add(h);
        out.push({ id: `raw-${source}-${h}`, key: `raw-${h}`, label: h, source, sourceCol: h, sourceCols: [h] });
      }
    };
    addFrom(dataTable?.headers, effectiveDataPlateCol, "data");
    addFrom(referralTable?.headers, effectiveReferralPlateCol, "referral");
    return out;
  }, [allResultColsRaw, dataTable, effectiveDataPlateCol, referralTable, effectiveReferralPlateCol]);
  // كل الأعمدة القابلة للاختيار = المفيدة + كل الخام. (للاختيار والعرض عند الاختيار.)
  const pickableColsRaw = useMemo(() => [...allResultColsRaw, ...rawExtraCols], [allResultColsRaw, rawExtraCols]);

  // الأعمدة المعروضة فعلاً: مفيش اختيار → الافتراضي (المفيدة زي الأول)؛ فيه اختيار →
  // الثابت + اللي المندوب اختاره (من أي عمود في ملفه).
  const allResultCols = useMemo(() => {
    const byLabel = new Map(pickableColsRaw.map((c) => [c.label, c] as const));
    // أساسي = ترتيب البرنامج الافتراضي (المفيدة)؛ مخصّص = الثابت + اختيار المندوب.
    const labels = orderMode === "custom"
      ? orderedLabels(pickableColsRaw.map((c) => c.label), colOrder)
      : allResultColsRaw.map((c) => c.label);
    return labels.map((l) => byLabel.get(l)).filter((c): c is MergedResultColumn => !!c);
  }, [allResultColsRaw, pickableColsRaw, colOrder, orderMode]);
  // نفس الوضع على أعمدة نتيجة السجلات كمان (اتساق عبر كل أنواع الفرز).
  const orderedTashyeekCols = useMemo(() => {
    const labels = orderMode === "custom"
      ? orderedLabels(tashyeekResultCols.map((c) => c.label), colOrder)
      : tashyeekResultCols.map((c) => c.label);
    const byLabel = new Map(tashyeekResultCols.map((c) => [c.label, c] as const));
    return labels.map((l) => byLabel.get(l)).filter((c): c is MergedResultColumn => !!c);
  }, [tashyeekResultCols, colOrder, orderMode]);
  // الأعمدة المتاحة للاختيار مقسّمة: أعمدة الداتا/السجلات ثم أعمدة الإحالة (فاصل
  // بينهم في القائمة)، بلا تكرار وناقص الثابت ورقم اللوحة. لو عمود في الاتنين
  // يتحسب داتا (الأولوية للداتا الميدانية).
  const orderableGroups = useMemo(() => {
    const fixed = new Set([...FIXED_LEADING_LABELS, "رقم اللوحة"]);
    const all = [...pickableColsRaw, ...tashyeekResultCols];
    const seen = new Set<string>(fixed);
    const data: string[] = [];
    for (const c of all) if (c.source !== "referral" && !seen.has(c.label)) { seen.add(c.label); data.push(c.label); }
    const ref: string[] = [];
    for (const c of all) if (c.source === "referral" && !seen.has(c.label)) { seen.add(c.label); ref.push(c.label); }
    return { data, ref };
  }, [pickableColsRaw, tashyeekResultCols]);

  const matchedResults = useMemo(() => (results ? results.filter((r) => r.status !== "none") : []), [results]);

  // ── ورقات ملف الإحالة ─────────────────────────────────────────────────────
  const REF_SHEETS_KEY = "ph:sorting:refSheetSel";

  /** يحلّل ورقات ملف الإحالة ويحدّد المختار (يستعيد اختيار سابق لو موجود). */
  const analyzeReferralFile = useCallback(async (file: File) => {
    try {
      const raw = await readAllSheetsRaw(file);
      const infos = analyzeWorkbook(raw);
      const withPlates = infos.filter((s) => s.plateCount > 0);
      setRefSheets(infos);
      // اختيار محفوظ لنفس الملف؟ وإلا علّم كل الورقات اللي فيها لوحات.
      let saved: string[] | null = null;
      try {
        const j = JSON.parse(localStorage.getItem(REF_SHEETS_KEY) ?? "null");
        if (j && j.file === file.name && Array.isArray(j.sheets)) saved = j.sheets;
      } catch { /* ignore */ }
      const valid = new Set(withPlates.map((s) => s.name));
      // مفيش اختيار محفوظ → الاختيار الذكي (المطلوبين بس، من غير أسطول الشركة
      // والورقات الخام). المندوب يقدر يغيّره وقتها بيتحفظ.
      setRefSheetSel(
        saved ? new Set(saved.filter((n) => valid.has(n))) : defaultSelection(infos)
      );
    } catch (err) {
      // فشل مؤقت (ملف مقفول/ذاكرة) — نسيب الاختيار القديم زي ما هو بدل ما
      // يختفي قدام المندوب فجأة. المسح الحقيقي بيتم في clearSlot بس.
      console.error("referral sheets analyze failed", err);
    }
  }, []);

  /** يحفظ اختيار الورقات (مربوط باسم الملف). */
  const setRefSheetSelection = useCallback((next: Set<string>) => {
    setRefSheetSel(next);
    try {
      localStorage.setItem(REF_SHEETS_KEY, JSON.stringify({
        file: referralFile?.name ?? "", sheets: [...next],
      }));
    } catch { /* ignore */ }
    setResults(null); setSorted(false); wipeSortResults();
  }, [referralFile]);

  // ── سجل السيارات: تحميل + مساعدات ─────────────────────────────────────────
  const todayStr = () => new Date().toISOString().slice(0, 10);

  // تحميل سجل المندوب الحالي (بحسابه) مرة عند فتح الصفحة.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid || !alive) return;
        setHistoryAgentId(uid);
        const loaded = await loadHistory(uid);
        if (!alive) return;
        if (loaded.size > 0) { setHistory(loaded); return; }
        // مفيش سجل على الجهاز (تليفون جديد / إعادة تثبيت) → جرّب النسخة الاحتياطية.
        try {
          const restored = await restoreHistory(uid, new Date().toISOString().slice(0, 10));
          if (alive && restored.size > 0) {
            setHistory(restored);
            await saveHistoryMap(uid, restored); // خزّنها محلياً عشان تشتغل أوفلاين
          }
        } catch { /* مفيش نسخة أو مفيش نت — سجل جديد */ }
      } catch { /* أوفلاين أو مش مسجّل — السجل يفضل فاضي، الفرز مايتأثرش */ }
    })();
    return () => { alive = false; };
  }, []);

  // اللوحة المطبّعة لصف نتيجة (نفس مفتاح التلوين/التصدير).
  const rowPlateNorm = useCallback((r: MatchResult): string => (
    r.refPlateNorm ?? normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")))
  ), [effectiveReferralPlateCol]);

  // بعد كل فرز: نسجّل ظهور اللوحات اللي طلعت (بقاعدة بصمة الشيت + فترة السماح)
  // ونحفظ. أي فشل هنا مايأثرش على النتيجة المعروضة.
  const recordSortHistory = useCallback(async (matches: MatchResult[]) => {
    if (!historyAgentId || matches.length === 0) return;
    try {
      const plates = matches.map(rowPlateNorm).filter(Boolean);
      // البصمة من **كل** لوحات الإحالة (الدفعة) — مش نتايج الفرز — عشان تتغيّر
      // لما الدفعة تتغيّر بس، مهما اتكرر الفرز على نفس الشيت.
      const refNorms = collectReferralEntries(collectRefSources()).map((e) => e.norm);
      const fp = sheetFingerprint(refNorms);
      const today = todayStr();
      const { map } = recordAppearances(history, plates, { today, fingerprint: fp });
      const pruned = pruneDetail(map, today);
      setHistory(pruned);
      const touched = new Set(plates);
      await saveHistoryEntries(historyAgentId, [...pruned.values()].filter((e) => touched.has(e.plate)));
      // نسخة احتياطية على Storage (خاصة بالمندوب) — بتفشل بصمت لو مفيش نت.
      try {
        await backupHistory(historyAgentId, pruned, today);
        await pruneRemoteMonths(historyAgentId, today);
      } catch { /* مفيش نت أو الـbucket لسه ماتعملش — السجل المحلي شغّال عادي */ }
    } catch (err) { console.error("history record failed", err); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyAgentId, history, rowPlateNorm]);

  // تسجيل إجراء المندوب على لوحة (بيتحفظ فوراً محلياً — مايستناش نت).
  const applyPlateStatus = useCallback(async (plateNorm: string, status: PlateStatus) => {
    if (!plateNorm) return;
    const today = todayStr();
    const next = setPlateStatus(history, plateNorm, status, today);
    setHistory(next);
    const entry = next.get(plateNorm);
    if (historyAgentId && entry) {
      try { await saveHistoryEntries(historyAgentId, [entry]); }
      catch (err) { console.error("history status save failed", err); }
    }
  }, [history, historyAgentId]);

  const plateColorMap = useMemo(() => {
    if (!results) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const r of results) {
      // refPlateNorm محسوبة وقت الفرز (تشتغل عبر شيتات إحالة متعددة)؛ fallback
      // للحساب من عمود الإحالة الأساسي لنتايج قديمة محفوظة قبل الميزة.
      const k = r.refPlateNorm ?? normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
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

  // إخفاء المقفولة (سحبتها / حد تاني / سدّد / مستبعدة) — **مطفي افتراضياً**، فلو
  // المندوب ماشغّلهوش تبقى النتيجة زي ما هي بالظبط.
  const openResults = useMemo(() => {
    if (!hideClosed || history.size === 0) return matchedResults;
    return matchedResults.filter((r) => {
      const st = history.get(rowPlateNorm(r))?.status;
      return !st || !isClosedStatus(st);
    });
  }, [matchedResults, hideClosed, history, rowPlateNorm]);

  const closedCount = matchedResults.length - openResults.length;

  const displayResults = useMemo(() => {
    if (!nearestActive || !userLoc || !gpsCol) return openResults;
    return [...openResults]
      .map((r) => {
        const coords = gpsCellCoords(r.dataRow?.[gpsCol] ?? "");
        const dist = coords ? haversineKm(userLoc.lat, userLoc.lng, coords.lat, coords.lng) : Infinity;
        return { ...r, _dist: dist, _min: estimateDriveMinutes(dist) };
      })
      .sort((a, b) => a._dist - b._dist);
  }, [openResults, nearestActive, userLoc, gpsCol]);

  /**
   * نتيجة كل ملف داتا في نافذة لوحدها (بطلب المندوب). المجموعة بتتحدد بـ
   * srcIdx اللي اتخزّن وقت الفرز. لو ملف واحد (أو نتايج قديمة محفوظة قبل
   * الميزة دي وبالتالي بلا srcIdx) بترجع مجموعة واحدة بلا عنوان — يعني نفس
   * شكل النافذة القديمة بالظبط.
   */
  const resultGroups = useMemo(() => groupResultsBySource(displayResults), [displayResults]);

  // عمود GPS في شيت التسجيلات — لترتيب «الأقرب» + حساب الوقت.
  const tashyeekGpsCol = useMemo(() => (tashyeekTable ? findGpsColumn(tashyeekTable.headers) : null), [tashyeekTable]);

  // نافذة التسجيلات مرتّبة بالأقرب (لو مفعّل) مع الاحتفاظ بالفهرس الأصلي للتحديد.
  const displayTashyeek = useMemo(() => {
    const base = (tashyeekResults ?? []).map((r, idx) => ({ r, idx, _dist: Infinity, _min: Infinity }));
    if (!nearestActive || !userLoc || !tashyeekGpsCol) return base;
    return base
      .map((x) => {
        const coords = gpsCellCoords(x.r.tashyeekRow?.[tashyeekGpsCol] ?? x.r.referralRow?.[tashyeekGpsCol] ?? "");
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
        const coords = gpsCellCoords(String(p.row?.[gpsCol] ?? ""));
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

  const selectedRefPlateCount = useMemo(() => totalPlates(selectedRefSheets), [selectedRefSheets]);

  // في الوضع المتعدد الجاهزية = فيه ورقة مختارة فيها لوحات (مش عمود الورقة الأولى،
  // لأن الورقة الأولى ممكن تكون بشكل غريب أو غير مختارة أصلاً).
  const referralReady = isMultiSheetRef
    ? selectedRefPlateCount > 0
    : !!referralTable && !!effectiveReferralPlateCol;

  // سجلات المندوب مربوطة كداتا وفيها صفوف = مصدر داتا صالح للفرز الكلي حتى من
  // غير ما يرفع ملف داتا (ده الهدف: يفرز على سجلاته من غير تنزيل/رفع).
  const recordsAsDataReady = recordsLinked && !!tashyeekTable && !!tashyeekPlateCol;
  const canSort = sortMode === "new"
    ? !!dataTable && referralReady && !!checkTable && !!effectiveDataPlateCol && !!effectiveCheckPlateCol && dataSheetsReady
    : referralReady && dataSheetsReady && ((!!dataTable && !!effectiveDataPlateCol) || recordsAsDataReady);

  // ── Persist ──
  const persistAndSet = useCallback(async (slot: "data" | "referral", table: ExcelTable, file: File) => {
    const record: UploadedFileRecord = {
      key: `local:${slot}`, agentId: "local", slot,
      fileName: file.name, headers: table.headers, rows: table.rows,
      uploadedAt: new Date().toISOString(), fileBlob: file,
    };
    await saveUploadedFile(record);
    if (slot === "data") {
      // ملف صغير عادي → نلغي أي وضع «داتا كبيرة» سابق (ونمسح قاعدتها على الجهاز).
      setDataStreamed(false); setDataStreamMeta(null); void clearBigData("data");
      setDataTable(table); setDataFile(file); setDataPlateColOverride(null);
      setOutputCols(new Set(defaultDataCols(table.headers, table.rows, detectPlateColumn(table.headers, table.rows))));
      setDataColsOpen(false); setResults(null); setSorted(false); wipeSortResults();
    } else {
      setReferralTable(table); setReferralFile(file); setReferralPlateColOverride(null);
      const p = detectPlateColumn(table.headers, table.rows);
      setReferralExtraCols(new Set(table.headers.filter((h) => h !== p && matchesPreferred(h))));
      setReferralColsOpen(false); setResults(null); setSorted(false); wipeSortResults();
      void analyzeReferralFile(file);   // ملف متعدد الورقات؟ حلّله واعرض الاختيار
    }
  }, [analyzeReferralFile]);

  // ملف داتا **متعدد الورقات**: كل ورقة بتتخزّن على الجهاز موسومة باسمها، والمندوب
  // يعلّم على اللي عايز يفرز عليه. بنخزّن عيّنة كـ dataTable للأعمدة/المعاينة زي
  // مسار الداتا الكبيرة بالظبط (dataStreamed).
  const handleMultiSheetData = useCallback(async (file: File, onProgress?: (rows: number) => void) => {
    const meta = await importMultiSheetData(file, { slot: "data", onProgress });
    const sample = await getSampleRows(50);
    await deleteUploadedFile("local", "data"); // شيل أي ملف صغير قديم في نفس الـslot
    setDataStreamed(true);
    setDataStreamMeta(meta);
    setDataTable({ headers: meta.headers, rows: sample, sheetName: meta.sheetName });
    setDataFile(file);
    setDataPlateColOverride(null);
    setOutputCols(new Set(guessDefaultColumns(meta.headers, meta.plateCol)));
    setDataColsOpen(false); setResults(null); setSorted(false); wipeSortResults();
    applyDataSheetSelection(meta, file.name);
  }, [applyDataSheetSelection]);

  // استيراد ملف داتا كبير: يقراه على دفعات ويخزّنه على الجهاز، ويحط عيّنة صغيرة
  // كـ dataTable عشان كشف الأعمدة/المعاينة/الجاهزية يشتغلوا زي ما هم. لو الملف
  // فيه أكتر من ورقة → مسار الورقات المتعددة (المندوب يختار الورقات).
  const handleLargeData = useCallback(async (file: File, onProgress: (rows: number) => void) => {
    const names = await readSheetNames(file);
    if (names.length > 1) { await handleMultiSheetData(file, onProgress); return; }
    const meta = await importLargeDataFile(file, { slot: "data", onProgress });
    const sample = await getSampleRows(50);
    await deleteUploadedFile("local", "data"); // شيل أي ملف صغير قديم في نفس الـslot
    setDataStreamed(true);
    setDataStreamMeta(meta);
    setDataTable({ headers: meta.headers, rows: sample, sheetName: meta.sheetName });
    setDataFile(file);
    setDataPlateColOverride(null);
    setOutputCols(new Set(guessDefaultColumns(meta.headers, meta.plateCol)));
    setDataColsOpen(false); setResults(null); setSorted(false); wipeSortResults();
    setDataSheetSel(new Set()); // ملف بورقة واحدة → مفيش اختيار ورقات
  }, [handleMultiSheetData]);

  async function clearSlot(slot: "data" | "referral") {
    await deleteUploadedFile("local", slot);
    if (slot === "data") {
      setDataStreamed(false); setDataStreamMeta(null); await clearBigData("data");
      setDataTable(null); setDataFile(null); setDataPlateColOverride(null); setOutputCols(new Set());
      setDataSheetSel(new Set());
      try { localStorage.removeItem(DATA_SHEETS_KEY); } catch { /* ignore */ }
    } else {
      setReferralTable(null); setReferralFile(null); setReferralPlateColOverride(null); setReferralExtraCols(new Set());
      setRefSheets([]); setRefSheetSel(new Set());
      try { localStorage.removeItem(REF_SHEETS_KEY); } catch { /* ignore */ }
    }
    setResults(null); setSorted(false); wipeSortResults();
  }

  // ── شيتات الإحالة الإضافية ──
  // يكتب الشيتات المرفوعة في slots متتابعة (referral-2, referral-3, ...) وبيمسح
  // أي slots زايدة من مصفوفة أكبر قديمة. الصناديق الفاضية (بدون ملف) بتتخطى.
  async function persistExtraSlots(arr: ExtraReferral[]) {
    const filled = arr.filter((e) => e.table && e.file);
    for (let i = 0; i < filled.length; i++) {
      const slot = `referral-${i + 2}`;
      const e = filled[i];
      await saveUploadedFile({
        key: `local:${slot}`, agentId: "local", slot,
        fileName: e.file!.name, headers: e.table!.headers, rows: e.table!.rows,
        uploadedAt: new Date().toISOString(), fileBlob: e.file!,
      });
    }
    const lastWritten = filled.length + 1; // آخر رقم slot اتكتب (٢ = أول إضافي)
    for (let n = lastWritten + 1; n <= extraHighWaterRef.current; n++) {
      await deleteUploadedFile("local", `referral-${n}`);
    }
    extraHighWaterRef.current = Math.max(lastWritten, 1);
  }

  function onExtraReferralParsed(i: number, table: ExcelTable, file: File) {
    const id = extraReferrals[i]?.id;
    setExtraReferrals((prev) => {
      const next = prev.map((e, idx) => (idx === i ? { ...e, table, file } : e));
      void persistExtraSlots(next);
      return next;
    });
    if (id) setExtraColsSel((cs) => ({ ...cs, [id]: defaultExtraCols("referral", table) }));
    setResults(null); setSorted(false); wipeSortResults();
  }

  // مسح الملف بس — المربع يفضل فاضي جاهز لرفع ملف تاني (زر «مسح» جوه الصندوق).
  function clearExtraReferralFile(i: number) {
    setExtraReferrals((prev) => {
      const next = prev.map((e, idx) => (idx === i ? { ...e, table: null, file: null } : e));
      void persistExtraSlots(next);
      return next;
    });
    setResults(null); setSorted(false); wipeSortResults();
  }

  // إلغاء المربع بالكامل — يختفي مكانه (زر «مسح المربع» فوق الصندوق).
  function clearExtraReferral(i: number) {
    setExtraReferrals((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      void persistExtraSlots(next);
      return next;
    });
    setResults(null); setSorted(false); wipeSortResults();
  }

  function addReferralBox() {
    setExtraReferrals((prev) => [...prev, { id: `ref-a${extraIdRef.current++}`, table: null, file: null }]);
    setReferralBoxOpen(true);
  }

  // ── ملفات الداتا الإضافية (نفس منطق الإحالات الإضافية، بس slots data-2, ...) ──
  async function persistExtraDataSlots(arr: ExtraDataFile[]) {
    const filled = arr.filter((e) => e.table && e.file);
    // slots الداتا الكبيرة اللي لسه حيّة (مؤشّر ليها موجود) — عشان ما نمسحش قاعدتها
    // بالغلط وقت إعادة الترقيم (مؤشّر اتنقل من data-3 لـdata-2 وقاعدته نفسها).
    const liveStreamSlots = new Set(filled.filter((e) => e.streamed && e.streamSlot).map((e) => e.streamSlot!));
    for (let i = 0; i < filled.length; i++) {
      const slot = `data-${i + 2}`;
      const e = filled[i];
      if (e.streamed && e.streamSlot) {
        // ملف كبير: مؤشّر خفيف بس (عيّنة معاينة + streamSlot) — الصفوف الكاملة على
        // الجهاز في dataStore. مافيش fileBlob (الملف كبير، مش هنخزّن بايتاته في الذاكرة).
        await saveUploadedFile({
          key: `local:${slot}`, agentId: "local", slot,
          fileName: e.file!.name, headers: e.table!.headers, rows: e.table!.rows,
          uploadedAt: new Date().toISOString(), streamed: true, streamSlot: e.streamSlot,
        });
      } else {
        await saveUploadedFile({
          key: `local:${slot}`, agentId: "local", slot,
          fileName: e.file!.name, headers: e.table!.headers, rows: e.table!.rows,
          uploadedAt: new Date().toISOString(), fileBlob: e.file!,
        });
      }
    }
    const lastWritten = filled.length + 1;
    for (let n = lastWritten + 1; n <= extraDataHighWaterRef.current; n++) {
      // المؤشّر المحذوف كان بيشاور على داتا كبيرة مش مستخدمة تاني؟ امسح قاعدتها كمان.
      try {
        const rec = await getUploadedFile("local", `data-${n}`);
        if (rec?.streamed && rec.streamSlot && !liveStreamSlots.has(rec.streamSlot)) await clearBigData(rec.streamSlot);
      } catch { /* ignore */ }
      await deleteUploadedFile("local", `data-${n}`);
    }
    extraDataHighWaterRef.current = Math.max(lastWritten, 1);
  }

  function onExtraDataParsed(i: number, table: ExcelTable, file: File) {
    const id = extraData[i]?.id;
    setExtraData((prev) => {
      const old = prev[i];
      // كان فيه ملف كبير قبل كده؟ حرّر قاعدته (بقى ملف صغير في الذاكرة).
      if (old?.streamed && old.streamSlot) void clearBigData(old.streamSlot);
      const next = prev.map((e, idx) => (idx === i ? { ...e, table, file, streamed: false, streamSlot: undefined, streamMeta: null } : e));
      void persistExtraDataSlots(next);
      return next;
    });
    if (id) setExtraColsSel((cs) => ({ ...cs, [id]: defaultExtraCols("data", table) }));
    setResults(null); setSorted(false); wipeSortResults();
  }

  // ملف داتا **إضافي كبير** (> الحد): يتقرا على دفعات ويتخزّن على الجهاز في slot
  // خاص بيه (مايتحملش في الذاكرة → مفيش crash iOS)، ونحط عيّنة صغيرة للمعاينة/
  // الأعمدة. لو متعدد الورقات نمرّ عليه زي الأساسي. نفس أمان مربع الداتا الأساسي.
  async function handleExtraLargeData(i: number, file: File, onProgress: (rows: number) => void) {
    const old = extraData[i];
    if (old?.streamed && old.streamSlot) void clearBigData(old.streamSlot); // حرّر أي قديم
    const streamSlot = nextStreamSlot();
    const id = extraData[i]?.id;
    const names = await readSheetNames(file);
    const meta = names.length > 1
      ? await importMultiSheetData(file, { slot: streamSlot, onProgress })
      : await importLargeDataFile(file, { slot: streamSlot, onProgress });
    const sample = await getSampleRows(50, streamSlot);
    const sampleTable: ExcelTable = { headers: meta.headers, rows: sample, sheetName: meta.sheetName };
    setExtraData((prev) => {
      const next = prev.map((e, idx) => (idx === i ? { ...e, file, table: sampleTable, streamed: true, streamSlot, streamMeta: meta } : e));
      void persistExtraDataSlots(next);
      return next;
    });
    if (id) setExtraColsSel((cs) => ({ ...cs, [id]: defaultExtraCols("data", sampleTable) }));
    setResults(null); setSorted(false); wipeSortResults();
  }

  function clearExtraDataFile(i: number) {
    setExtraData((prev) => {
      const old = prev[i];
      if (old?.streamed && old.streamSlot) void clearBigData(old.streamSlot); // حرّر قاعدة الداتا الكبيرة
      const next = prev.map((e, idx) => (idx === i ? { ...e, table: null, file: null, streamed: false, streamSlot: undefined, streamMeta: null } : e));
      void persistExtraDataSlots(next);
      return next;
    });
    setResults(null); setSorted(false); wipeSortResults();
  }

  function clearExtraDataBox(i: number) {
    setExtraData((prev) => {
      const old = prev[i];
      if (old?.streamed && old.streamSlot) void clearBigData(old.streamSlot);
      const next = prev.filter((_, idx) => idx !== i);
      void persistExtraDataSlots(next);
      return next;
    });
    setResults(null); setSorted(false); wipeSortResults();
  }

  function addDataBox() {
    setExtraData((prev) => [...prev, { id: `data-a${extraDataIdRef.current++}`, table: null, file: null }]);
    setDataBoxOpen(true);
  }

  const [neighborView, setNeighborView] = useState<NeighborsView | null>(null);
  // ملف الداتا الكبير بيتقرا من الجهاز — مرور كامل بياخد لحظات، فبنوضّح إننا بندوّر
  // بدل ما الزرار يبان ميت.
  const [neighborsLoading, setNeighborsLoading] = useState(false);

  // كل مصادر الداتا (الأساسية + الإضافية) — كل مصدر بعمود لوحته. تُستخدم في كل
  // مسارات الفرز عشان الفرز يتم على كل ملفات الداتا مدموجة.
  // مصدر داتا: إمّا صفوف في الذاكرة (rows) أو ملف كبير على الجهاز (slot + rowCount)
  // بيتقري على دفعات وقت الفرز بدل ما يتحمّل في الذاكرة.
  type DataSource = { rows: Record<string, string>[]; plateCol: string; slot?: string; rowCount?: number };
  function collectDataSources(): DataSource[] {
    const srcs: DataSource[] = [];
    if (dataTable && effectiveDataPlateCol) {
      srcs.push({ rows: dataTable.rows, plateCol: effectiveDataPlateCol });
    }
    for (const ed of extraData) {
      if (!ed.table) continue;
      // ملف إضافي كبير (streamed): صفوفه على الجهاز — نحط علامة slot بدل الصفوف،
      // والفرز بيقرا من الجهاز على دفعات (بذاكرة دفعة واحدة).
      if (ed.streamed && ed.streamSlot && ed.streamMeta) {
        const pc = ed.streamMeta.plateCol
          || detectArabicPlateColumn(ed.table.headers)
          || detectPlateColumn(ed.table.headers, ed.table.rows);
        if (!pc) continue;
        srcs.push({ rows: [], plateCol: pc, slot: ed.streamSlot, rowCount: ed.streamMeta.rowCount });
        continue;
      }
      const arabicCol = detectArabicPlateColumn(ed.table.headers);
      const plateCol = arabicCol ?? detectPlateColumn(ed.table.headers, ed.table.rows);
      if (!plateCol) continue;
      srcs.push({ rows: ed.table.rows, plateCol });
    }
    // سجلات المندوب كخانة داتا (ربط حي من صفحة السجلات) — تتطابق زي أي ملف داتا.
    if (recordsLinked && tashyeekTable && tashyeekPlateCol) {
      srcs.push({ rows: tashyeekTable.rows, plateCol: tashyeekPlateCol });
    }
    return srcs;
  }

  // ── نافذة «موقعها» — جيران السيارة في نفس الموقع من ملف الداتا المرتّب ──────
  function pickNeighborDetailCols(headers: string[], plateCol: string, locCol: string | null): string[] {
    // العمودان جنب اللوحة في نافذة «موقعها»: نوع السيارة ثم العنوان (عنوان كل
    // لوحة زي ما هو في الداتا). لو مفيش عمود عنوان صريح، نستخدم عمود الموقع
    // نفسه (اللي بنجمّع بيه) لأنه اللي فيه بيانات الموقع فعلاً.
    const type = headers.find((h) => /نوع|طراز/i.test(h)) ?? headers.find((h) => /ماركة|صانع|vehicle|model|make/i.test(h));
    const address = headers.find((h) => /العنوان|عنوان|الشارع|شارع|address|street/i.test(h)) ?? locCol ?? undefined;
    return [...new Set([type, address].filter((h): h is string => !!h && h !== plateCol))];
  }

  /**
   * مصدر الصف لو كان **على الجهاز** (ملف كبير) بدل الذاكرة — أو null لو في الذاكرة.
   * صفوف الملف الكبير مش محمّلة (الذاكرة فيها عيّنة ٥٠ صف بس)، فلازم نقراها
   * من الجهاز زي ما الفرز بيعمل.
   */
  function streamedNeighborSource(r: MatchResult, sources: DataSource[]):
    { slot: string; plateCol: string; headers: string[]; sheets: Set<string> | null; primary: boolean } | null {
    // الملف الأساسي الكبير: دايماً أول مصدر، فالفهرس العام = الفهرس المحلّي.
    if (dataStreamed && dataStreamMeta && (r.srcIdx == null || r.srcIdx === 0)) {
      return { slot: "data", plateCol: dataStreamMeta.plateCol, headers: dataStreamMeta.headers,
               sheets: selectedDataSheetFilter, primary: true };
    }
    const src = r.srcIdx != null ? sources[r.srcIdx] : undefined;
    if (!src?.slot) return null;
    const ed = extraData.find((e) => e.streamSlot === src.slot);
    return { slot: src.slot, plateCol: src.plateCol,
             headers: ed?.table?.headers ?? Object.keys(r.dataRow ?? {}), sheets: null, primary: false };
  }

  /** «موقعها» لصف جاي من ملف على الجهاز — مرور على الدفعات بذاكرة دفعة واحدة. */
  async function showNeighborsStreamed(
    r: MatchResult,
    src: { slot: string; plateCol: string; headers: string[]; sheets: Set<string> | null; primary: boolean },
  ) {
    const locCol = detectLocationColumn(src.headers);
    if (!locCol) { alert("مفيش عمود «اسم الموقع/الشارع/الحي» في ملف الداتا عشان نعرض الجيران."); return; }
    const iterate = (onBatch: (rows: Record<string, string>[], base: number) => void | Promise<void>) =>
      iterateRows((rows, base) => onBatch(rows, base), { slot: src.slot, sheets: src.sheets });
    const plateOf = (row: Record<string, string> | null) =>
      row ? normalizePlate(bankPlateToArabic(String(row[src.plateCol] ?? ""))) : "";

    setNeighborsLoading(true);
    try {
      // (١) الفهرس المخزّن وقت الفرز — بيشتغل للملف الأساسي (أول مصدر فالفهرس محلّي).
      let res: Awaited<ReturnType<typeof neighborsFromStream>> | null = null;
      if (src.primary && r.dataIdx != null && r.dataIdx >= 0) {
        const byIdx = await neighborsFromStream(iterate, r.dataIdx, locCol);
        if (byIdx.target) res = byIdx;
      }
      // (٢) لو الفهرس مالقاش الصف الصح (نتيجة قديمة، أو مربع إضافي فهرسه عام) —
      //     ندوّر باللوحة نفسها: أدق من أي حسابات إزاحة.
      const want = r.refPlateNorm ?? plateOf(r.dataRow ?? null);
      if ((!res || (want && plateOf(res.target) !== want)) && want) {
        const idx = await findIndexByPlate(iterate, src.plateCol, want);
        // مانرجعش لنتيجة أسوأ: لو البحث باللوحة فشل نسيب اللي لقيناه بالفهرس.
        if (idx >= 0) {
          const byPlate = await neighborsFromStream(iterate, idx, locCol);
          if (byPlate.target) res = byPlate;
        }
      }
      if (!res?.target) { alert("مالقيناش السيارة دي في ملف الداتا. يمكن الملف اتغيّر بعد الفرز — ارفعه تاني واعمل «فرز»."); return; }
      setNeighborView({ ...res.ctx, target: res.target, plateCol: src.plateCol,
                        detailCols: pickNeighborDetailCols(src.headers, src.plateCol, locCol) });
    } finally {
      setNeighborsLoading(false);
    }
  }

  async function showNeighbors(r: MatchResult) {
    if (r.dataIdx == null && !r.dataRow) { alert("مفيش بيانات موقع لهذه السيارة في ملف الداتا (اتطابقت من السجلات مش الداتا)."); return; }
    const sources = collectDataSources();
    // ملف كبير: صفوفه على الجهاز — مسار مختلف تماماً عن الذاكرة.
    const streamed = streamedNeighborSource(r, sources);
    if (streamed) { await showNeighborsStreamed(r, streamed); return; }
    // نبني قائمة مرتّبة واحدة من كل ملفات الداتا (نفس ترتيب التفريغ).
    const orderedRows: Record<string, string>[] = [];
    const bounds: { start: number; plateCol: string }[] = [];
    for (const s of sources) {
      bounds.push({ start: orderedRows.length, plateCol: s.plateCol });
      for (const row of s.rows) orderedRows.push(row);
    }
    // الموضع: dataIdx المخزّن وقت الفرز (بيصمد بعد إعادة الفتح لأن نفس ملف
    // الداتا وترتيبه)، وإلا الـidentity (نفس مرجع الصف في نفس الجلسة).
    let idx = (r.dataIdx != null && r.dataIdx >= 0 && r.dataIdx < orderedRows.length) ? r.dataIdx : -1;
    if (idx < 0 && r.dataRow) idx = orderedRows.indexOf(r.dataRow);
    // احتياطي: نتايج قديمة اتفرزت قبل ميزة «موقعها» (مفيش dataIdx ولا نفس المرجع)
    // — ندوّر على أول صف داتا بنفس اللوحة المطبّعة.
    if (idx < 0) {
      const want = r.refPlateNorm ?? normalizePlate(bankPlateToArabic(String(r.dataRow?.[bounds[0]?.plateCol ?? ""] ?? "")));
      if (want) {
        let gi = 0;
        outer:
        for (const s of sources) {
          for (const row of s.rows) {
            if (normalizePlate(bankPlateToArabic(String(row[s.plateCol] ?? ""))) === want) { idx = gi; break outer; }
            gi++;
          }
        }
      }
    }
    if (idx < 0) { alert("تعذّر تحديد موقع السيارة في ملف الداتا. جرّب تعمل «فرز» من جديد."); return; }
    const headers = dataTable?.headers ?? (r.dataRow ? Object.keys(r.dataRow) : Object.keys(orderedRows[idx] ?? {}));
    const locCol = detectLocationColumn(headers);
    if (!locCol) { alert("مفيش عمود «اسم الموقع/الشارع/الحي» في ملف الداتا عشان نعرض الجيران."); return; }
    let plateCol = sources[0]?.plateCol ?? "";
    for (const b of bounds) if (b.start <= idx) plateCol = b.plateCol;
    const ctx = neighborsInSameLocation(orderedRows, idx, locCol);
    setNeighborView({ ...ctx, target: orderedRows[idx], plateCol, detailCols: pickNeighborDetailCols(headers, plateCol, locCol) });
  }

  // الأعمدة المختارة افتراضياً لمربع إضافي (نفس منطق المربع الأساسي): للداتا =
  // guessDefaultColumns، وللإحالة = الأعمدة المفضّلة (matchesPreferred).
  function defaultExtraCols(kind: "data" | "referral", table: ExcelTable): Set<string> {
    const arabicCol = detectArabicPlateColumn(table.headers);
    const plateCol = arabicCol ?? detectPlateColumn(table.headers, table.rows);
    if (kind === "data") return new Set(guessDefaultColumns(table.headers, plateCol));
    return new Set(table.headers.filter((h) => h !== plateCol && matchesPreferred(h)));
  }
  // تعليم/إلغاء عمود في مربع إضافي — بيحدّث العرض فوراً (النتيجة زي ما هي، بس
  // الأعمدة المعروضة بتتغير) زي المربع الأساسي بالظبط.
  function toggleExtraCol(id: string, h: string) {
    setExtraColsSel((prev) => {
      const cur = new Set(prev[id] ?? []);
      if (cur.has(h)) cur.delete(h); else cur.add(h);
      return { ...prev, [id]: cur };
    });
  }
  function toggleExtraColsOpen(id: string) {
    setExtraColsOpen((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // كل مصادر الإحالة (الأساسية + الإضافية) كـ ReferralSource للفرز الموحّد.
  function collectRefSources(): ReferralSource[] {
    const srcs: ReferralSource[] = [];
    // ملف متعدد الورقات: كل ورقة مختارة بتبقى مصدر إحالة، والدمج وإزالة التكرار
    // بيتمّوا في collectReferralEntries زي الشيتات الإضافية بالظبط.
    if (isMultiSheetRef) {
      for (const s of selectedRefSheets) {
        srcs.push({
          rows: s.rows,
          plateCol: s.headers[s.plateCol],
          isArabic: detectArabicPlateColumn(s.headers) !== null,
        });
      }
    } else if (referralTable && effectiveReferralPlateCol) {
      srcs.push({ rows: referralTable.rows, plateCol: effectiveReferralPlateCol, isArabic: referralPlateIsArabic });
    }
    for (const er of extraReferrals) {
      if (!er.table) continue;
      const arabicCol = detectArabicPlateColumn(er.table.headers);
      const plateCol = arabicCol ?? detectPlateColumn(er.table.headers, er.table.rows);
      if (!plateCol) continue;
      srcs.push({ rows: er.table.rows, plateCol, isArabic: arabicCol !== null });
    }
    return srcs;
  }

  // إجمالي صفوف الإحالة عبر كل الشيتات (للعداد في نتيجة الفرز الكلي).
  const totalReferralRows =
    // في وضع الورقات المتعددة العدد بيتحسب من الورقات المختارة بس.
    (isMultiSheetRef
      ? selectedRefSheets.reduce((s, x) => s + x.rows.length, 0)
      : (referralTable?.rows.length ?? 0)) +
    extraReferrals.reduce((s, e) => s + (e.table?.rows.length ?? 0), 0);

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
  // كل شيتات الإحالة (الأساسية + الإضافية) بتتدمج في فهرس واحد ويتطابقوا على
  // ملف الداتا → نتيجة واحدة مجمّعة.
  async function runFullSort() {
    const hasUploadedData = !!dataTable && !!effectiveDataPlateCol;
    const hasRecordsData = recordsLinked && !!tashyeekTable && !!tashyeekPlateCol;
    if (!(hasUploadedData || hasRecordsData) || !referralTable || !effectiveReferralPlateCol) return;
    setSorting(true);
    await new Promise<void>((r) => setTimeout(r, 10));
    try {
      const refIndex = new Map<string, { row: Record<string, string>; norm: string }>();
      for (const e of collectReferralEntries(collectRefSources())) {
        if (!refIndex.has(e.norm)) refIndex.set(e.norm, { row: e.row, norm: e.norm });
        if (!e.isArabic && /[A-Za-z]/.test(e.raw)) {
          const rev = reversePlateLetters(e.norm);
          if (rev !== e.norm && !refIndex.has(rev)) refIndex.set(rev, { row: e.row, norm: e.norm });
        }
      }
      const matches: MatchResult[] = [];
      const CHUNK = 16000;
      // نلف على كل ملفات الداتا (الأساسي + الإضافية) — كل واحد بعمود لوحته.
      // dataBase = بداية الفهرس العام للملف الحالي (نفس ترتيب collectDataSources)
      // عشان dataIdx يطابق الترتيب المستخدم في نافذة «موقعها».
      let dataBase = 0;
      // الداتا الكبيرة (streamed): نلفّ عليها من القاعدة على الجهاز على دفعات
      // بدل الذاكرة — نفس منطق المطابقة بالظبط، بس مصدر الصفوف مختلف.
      if (dataStreamed && dataStreamMeta) {
        let gj = 0;
        await iterateRows(async (batch, _base, sheet) => {
          const pc = (sheet && sheetPlateColMap.get(sheet)) || dataStreamMeta.plateCol;
          for (const dataRow of batch) {
            const idx = gj++;
            const n = normalizePlate(bankPlateToArabic(String(dataRow[pc] ?? "")));
            if (!n) continue;
            const hit = refIndex.get(n);
            if (hit) matches.push({ referralRow: hit.row, dataRow, status: "exact", refPlateNorm: hit.norm, dataIdx: idx, srcIdx: 0 });
          }
          await new Promise<void>((r) => setTimeout(r, 0));
        }, { slot: "data", sheets: selectedDataSheetFilter });
        dataBase = gj;
      }
      // ملفات الداتا في الذاكرة: الأساسي (لو مش streamed) + الإضافية. في وضع streamed
      // نتخطّى الأساسي (لأنه عيّنة فقط) ونطابق الإضافية بس.
      // srcBase: في وضع streamed الملف الأول اتطابق فوق (srcIdx=0) فالباقي يبدأ من ١.
      const srcBase = dataStreamed ? 1 : 0;
      const memSources = dataStreamed ? collectDataSources().slice(1) : collectDataSources();
      for (let si = 0; si < memSources.length; si++) {
        const src = memSources[si];
        const pc = src.plateCol;
        // ملف داتا إضافي كبير (streamed): اقرا من الجهاز على دفعات — نفس المطابقة.
        if (src.slot) {
          let gj = 0;
          await iterateRows(async (batch) => {
            for (const dataRow of batch) {
              const idx = dataBase + gj; gj++;
              const n = normalizePlate(bankPlateToArabic(String(dataRow[pc] ?? "")));
              if (!n) continue;
              const hit = refIndex.get(n);
              if (hit) matches.push({ referralRow: hit.row, dataRow, status: "exact", refPlateNorm: hit.norm, dataIdx: idx, srcIdx: srcBase + si });
            }
            await new Promise<void>((r) => setTimeout(r, 0));
          }, { slot: src.slot });
          dataBase += gj;
          continue;
        }
        const rows = src.rows;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const end = Math.min(i + CHUNK, rows.length);
          for (let j = i; j < end; j++) {
            const dataRow = rows[j];
            const n = normalizePlate(bankPlateToArabic(String(dataRow[pc] ?? "")));
            if (!n) continue;
            const hit = refIndex.get(n);
            if (hit) matches.push({ referralRow: hit.row, dataRow, status: "exact", refPlateNorm: hit.norm, dataIdx: dataBase + j, srcIdx: srcBase + si });
          }
          if (end < rows.length) await new Promise<void>((r) => setTimeout(r, 0));
        }
        dataBase += rows.length;
      }
      let finalTashyeek: TashyeekResultRow[] | null = null;
      // لو السجلات مربوطة كخانة داتا، بتظهر في نتيجة الداتا فوق — فمانعملش قسم
      // «فرز السجلات» المنفصل عشان ماتتكررش نفس السيارات مرتين.
      if (!recordsLinked && tashyeekTable && tashyeekPlateCol) {
        const tashyeekMatches: TashyeekResultRow[] = [];
        for (const row of tashyeekTable.rows) {
          const n = normalizePlate(bankPlateToArabic(String(row[tashyeekPlateCol] ?? "")));
          if (!n) continue;
          const hit = refIndex.get(n);
          if (hit) tashyeekMatches.push({ tashyeekRow: row, referralRow: hit.row });
        }
        finalTashyeek = tashyeekMatches;
      }
      setTashyeekResults(finalTashyeek);
      setResults(matches); setSorted(true); setNearestActive(false); setVisibleByWin({}); setSelectedByWin({});
      persistSortResults(matches, finalTashyeek, "full", 0);
      void recordSortHistory(matches); // سجل السيارات (مايعوّقش عرض النتيجة)
    } catch (err) { console.error(err); }
    finally { setSorting(false); }
  }

  // ── New sort ──
  // اللوحات الجديدة = لوحات الإحالة (كل الشيتات) غير الموجودة في ملف التشييك،
  // وبعدين بتتطابق على ملف الداتا وعلى شيت السجلات → الجديد بس في النتيجة.
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
      // كل شيتات الإحالة مدموجة، ناقص اللي موجود في التشييك = الجديد.
      const newEntries = collectReferralEntries(collectRefSources()).filter((e) => !checkSet.has(e.norm));
      setNewPlatesCount(newEntries.length);
      // Track each data row's original position so results can be ordered the
      // same way as the data file (not the referral file) — cars at the same
      // location sit adjacent in the data file, so this keeps them grouped.
      const matches: (MatchResult & { dataIdx: number })[] = [];
      // (أ) الداتا الكبيرة (streamed): مرور واحد على الدفعات من القرص، وكل صف
      // بنطابقه على خريطة اللوحات الجديدة (في الذاكرة، صغيرة) — بدل ما نبني فهرس
      // ٧٤٠ ألف صف في الذاكرة، وبدل بحث لكل لوحة (بطيء).
      // عدد صفوف الداتا الكبيرة اللي **فعلاً** اتلفّ عليها (الورقات المختارة بس في
      // ملف متعدد الورقات) — يبقى أساس dataIdx لملفات الذاكرة اللي بعدها.
      const srcBase = dataStreamed ? 1 : 0;
      const memSources = dataStreamed ? collectDataSources().slice(1) : collectDataSources();
      // فهرس اللوحات الجديدة (صغير) — نبنيه لو فيه أي مصدر داتا كبير (streamed،
      // أساسي أو إضافي) عشان نطابق كل صف من القرص عليه بدل بناء فهرس ملايين الصفوف.
      const anyStreamed = (dataStreamed && dataStreamMeta) || memSources.some((s) => s.slot);
      const newIndex = new Map<string, { row: Record<string, string>; norm: string }>();
      if (anyStreamed) {
        for (const e of newEntries) {
          if (!newIndex.has(e.norm)) newIndex.set(e.norm, { row: e.row, norm: e.norm });
          if (!e.isArabic && /[A-Za-z]/.test(e.raw)) {
            const rev = reversePlateLetters(e.norm);
            if (rev !== e.norm && !newIndex.has(rev)) newIndex.set(rev, { row: e.row, norm: e.norm });
          }
        }
      }
      // gIdx = فهرس عام متتابع عبر كل مصادر الداتا (أساسي + إضافي) بالترتيب — عشان
      // dataIdx يفضل مطابق لترتيب الملفات بعد الفرز النهائي.
      let gIdx = 0;
      // (أ) الداتا الأساسية الكبيرة (streamed): مرور واحد على الدفعات من القرص.
      if (dataStreamed && dataStreamMeta) {
        await iterateRows(async (batch, _base, sheet) => {
          const pc = (sheet && sheetPlateColMap.get(sheet)) || dataStreamMeta.plateCol;
          for (const dataRow of batch) {
            const idx = gIdx++;
            const n = normalizePlate(bankPlateToArabic(String(dataRow[pc] ?? "")));
            if (!n) continue;
            const hit = newIndex.get(n);
            if (hit) matches.push({ referralRow: hit.row, dataRow, status: "exact", dataIdx: idx, refPlateNorm: hit.norm, srcIdx: 0 });
          }
          await new Promise<void>((r) => setTimeout(r, 0));
        }, { slot: "data", sheets: selectedDataSheetFilter });
      }
      // (ب) ملفات الداتا الإضافية بالترتيب: الكبيرة تُقرا من الجهاز على دفعات
      // (وتطابق على فهرس الجديد مباشرة)، والصغيرة عبر فهرس صغير في الذاكرة.
      if (memSources.length) {
        const dataIndex = new Map<string, Array<{ row: Record<string, string>; dataIdx: number; srcIdx: number }>>();
        for (let si = 0; si < memSources.length; si++) {
          const src = memSources[si];
          const pc = src.plateCol;
          if (src.slot) {
            await iterateRows(async (batch) => {
              for (const dataRow of batch) {
                const idx = gIdx++;
                const n = normalizePlate(bankPlateToArabic(String(dataRow[pc] ?? "")));
                if (!n) continue;
                const hit = newIndex.get(n);
                if (hit) matches.push({ referralRow: hit.row, dataRow, status: "exact", dataIdx: idx, refPlateNorm: hit.norm, srcIdx: srcBase + si });
              }
              await new Promise<void>((r) => setTimeout(r, 0));
            }, { slot: src.slot });
            continue;
          }
          for (const row of src.rows) {
            const idx = gIdx++;
            const n = normalizePlate(bankPlateToArabic(String(row[pc] ?? "")));
            if (!n) continue;
            const entry = { row, dataIdx: idx, srcIdx: srcBase + si };
            const arr = dataIndex.get(n);
            if (arr) arr.push(entry); else dataIndex.set(n, [entry]);
          }
        }
        for (const e of newEntries) {
          const dataRows = dataIndex.get(e.norm) ?? (
            !e.isArabic && /[A-Za-z]/.test(e.raw) ? dataIndex.get(reversePlateLetters(e.norm)) : undefined
          );
          if (dataRows) {
            for (const { row: dataRow, dataIdx, srcIdx } of dataRows) {
              matches.push({ referralRow: e.row, dataRow, status: "exact", dataIdx, refPlateNorm: e.norm, srcIdx });
            }
          }
        }
      }
      matches.sort((a, b) => a.dataIdx - b.dataIdx);
      // شيت السجلات (الميداني): طابق اللوحات الجديدة عليه كمان.
      let finalTashyeek: TashyeekResultRow[] | null = null;
      // مربوطة كداتا → بتظهر فوق في نتيجة الداتا، فمافيش قسم سجلات منفصل (منع التكرار).
      if (!recordsLinked && tashyeekTable && tashyeekPlateCol) {
        const tashyeekRefIndex = new Map<string, Record<string, string>>();
        for (const e of newEntries) {
          if (!tashyeekRefIndex.has(e.norm)) tashyeekRefIndex.set(e.norm, e.row);
          if (!e.isArabic && /[A-Za-z]/.test(e.raw)) {
            const rev = reversePlateLetters(e.norm);
            if (rev !== e.norm && !tashyeekRefIndex.has(rev)) tashyeekRefIndex.set(rev, e.row);
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
      setResults(matches); setSorted(true); setNearestActive(false); setVisibleByWin({}); setSelectedByWin({});
      persistSortResults(matches, finalTashyeek, "new", newEntries.length);
      void recordSortHistory(matches); // سجل السيارات (مايعوّقش عرض النتيجة)
    } catch (err) { console.error(err); }
    finally { setSorting(false); }
  }

  function handleSort() {
    playSortBeep();   // تأكيد صوتي إن الفرز بدأ (الفرز الكبير بياخد ثواني)
    setResults(null); setSorted(false); setTashyeekResults(null);
    wipeSortResults(sortMode); // امسح كاش الوضع الحالي بس — الوضع التاني يفضل بنتايجه
    // فرز أرقام الشاص المسجّلة (شيت الشاص) على عمود الشاص في الإحالة — نفس الزر
    // (جديد/كلي). النتيجة تظهر في نافذة «مطلوب من أرقام الشاص».
    const refSheets: { headers: string[]; rows: Record<string, string>[] }[] = [];
    if (referralTable) refSheets.push({ headers: referralTable.headers, rows: referralTable.rows });
    for (const er of extraReferrals) if (er.table) refSheets.push({ headers: er.table.headers, rows: er.table.rows });
    const chMatches = matchChassisRecordsAgainstReferrals(getChassisRecords(), refSheets);
    chassisSortCache = chMatches;
    setChassisResults(chMatches);
    if (sortMode === "new") runNewSort(); else runFullSort();
  }

  // التبديل بين «فرز جديد» و«فرز كلي» — بيحفظ نتايج كل وضع لوحده ويسترجع
  // نتايج الوضع اللي رحتله (لو عملت فيه فرز قبل كده)، بدل ما يمسح.
  function switchMode(target: "new" | "full") {
    if (target === sortMode) return;
    setSortMode(target);
    sortActiveMode = target;
    persistSortCache();
    const c = sortCacheByMode[target];
    setSelectedByWin({});
    setVisibleByWin({});
    if (c && c.results.length > 0) {
      setResults(c.results);
      setTashyeekResults(c.tashyeekResults);
      setNewPlatesCount(c.newPlatesCount);
      setSorted(true);
    } else {
      setResults(null); setTashyeekResults(null); setSorted(false);
    }
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
  // يقرا قيمة عمود نتيجة من الصف — بيجرّب كل الأعمدة المرشّحة (sourceCols عبر كل
  // المحافظ) بالتتابع ويرجّع أول قيمة موجودة. كده اللوحة الجاية من أي محفظة
  // بتطلّع نوعها/ماركتها حتى لو المحافظ بأسماء أعمدة مختلفة.
  function cellValue(
    row: Record<string, string> | undefined,
    col: { sourceCol: string; sourceCols?: string[]; dupCols?: string[] },
  ): string {
    const cols = col.sourceCols && col.sourceCols.length ? col.sourceCols : [col.sourceCol];
    for (const c of cols) {
      const v = String(row?.[c] ?? "").trim();
      // أعمدة مكررة الاسم في نفس المحفظة («نوع المركبة» و«نوع المركبة_1» =
      // الماركة والطراز) بتتدمج في خانة واحدة: «تويوتا لاندكروزر».
      if (v) return col.dupCols?.length ? joinDupValues(row, { sourceCol: c, dupCols: col.dupCols }) : v;
    }
    // القيمة الأساسية فاضية بس التوأم فيه قيمة
    return col.dupCols?.length ? joinDupValues(row, { sourceCol: col.sourceCol, dupCols: col.dupCols }) : "";
  }

  function plateForRow(r: MatchResult): string {
    const ref = bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? ""));
    const data = bankPlateToArabic(String(r.dataRow?.[effectiveDataPlateCol ?? ""] ?? ""));
    return ref || data;
  }

  /** مفتاح اللوحة لصف نتيجة الداتا (زي اللي التلوين بيستخدمه). */
  function dataRowKey(r: MatchResult): string {
    return r.refPlateNorm ?? normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
  }

  /** مفتاح اللوحة لصف نتيجة السجلات — من صف الإحالة اللي طابقه، فيتقارن بنفس المقياس. */
  function tashRowKey(r: TashyeekResultRow): string {
    return normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
  }

  /**
   * ألوان صفوف المشاركة — **محسوبة على النافذتين مع بعض**.
   *
   * المشاركة بتحط نتيجة الداتا ونتيجة السجلات في نفس الإكسيل، فاللوحة اللي
   * ظهرت في الاتنين لازم تتلوّن — دي أهم حالة للمندوب وكانت بتفوت بلا لون
   * لأن صفوف السجلات كانت بتاخد null.
   */
  function shareRowColors(src: MatchResult[], tash: TashyeekResultRow[]): (string | null)[] {
    const dataKeys = src.map(dataRowKey);
    const tashKeys = tash.map(tashRowKey);
    const map = combinedDupColorMap([dataKeys, tashKeys], DUPE_COLORS.length);
    const hex = (k: string) => {
      const i = map.get(k);
      return i !== undefined ? DUPE_COLORS[i].hex : null;
    };
    return [...dataKeys.map(hex), ...tashKeys.map(hex)];
  }

  function shareSubtitle(): string {
    const now = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    let hh = now.getHours();
    const ampm = hh < 12 ? "ص" : "م";
    hh = hh % 12 || 12;
    return `تاريخ ووقت الإرسال: ${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} - ${p2(hh)}:${p2(now.getMinutes())} ${ampm}`;
  }

  // ── مصدر واحد لكل المشاركة (صورة + إكسيل) = **نفس أعمدة العرض بالظبط** ─────────
  // buildRowObject/buildTashyeekRowObj بيستخدموا allResultCols/tashyeekResultCols
  // (نفس اللي المندوب شايفه)، فأي عمود قدامه — سنة الصنع، عمود إضافي اختاره — بيطلع
  // في المشاركة. buildColoredSortExcel بياخد أعمدة أول صف بس، فبنبني اتحاد الأعمدة
  // («الحالة» آخراً) ونوحّد كل صف عليه عشان مفيش عمود بيضيع لما نخلط نافذتين.
  function buildDisplayShareObjects(src: MatchResult[], tash: TashyeekResultRow[]): { columns: string[]; rowObjects: Record<string, unknown>[] } {
    const dataObjs = src.map((r) => {
      const o = buildRowObject(r);
      const g = rawGpsOf(r);                 // GPS كرابط خريطة شغّال (مش إحداثيات خام)
      if ("GPS" in o && g) o["GPS"] = g;
      return o;
    });
    const tashObjs = tash.map((r) => {
      const o = buildTashyeekRowObj(r);
      const g = rawGpsOfTashyeek(r);
      if ("GPS" in o && g) o["GPS"] = g;
      return o;
    });
    const allObjs = [...dataObjs, ...tashObjs];
    const keys: string[] = [];
    for (const o of allObjs) for (const k of Object.keys(o)) if (!keys.includes(k)) keys.push(k);
    const columns = [...keys.filter((k) => k !== "الحالة"), ...(keys.includes("الحالة") ? ["الحالة"] : [])];
    const rowObjects = allObjs.map((o) => {
      const row: Record<string, unknown> = {};
      for (const k of columns) row[k] = o[k] ?? "";
      return row;
    });
    return { columns, rowObjects };
  }

  // صورة الفرز كجدول = نفس أعمدة العرض، **بدون عمود GPS** (الصورة مش بتحمل رابط
  // قابل للنقر — بيبقى URL طويل يبوّظ الجدول). اللوحات المكررة كل مجموعة بلون واحد.
  function buildSortImageTable(src: MatchResult[] = displayResults, tash: TashyeekResultRow[] = []): { columns: string[]; rows: string[][]; subtitle?: string; rowColors?: (string | null)[] } {
    const { columns, rowObjects } = buildDisplayShareObjects(src, tash);
    const imgCols = columns.filter((c) => c !== "GPS");
    const rows = rowObjects.map((o) => imgCols.map((c) => String(o[c] ?? "")));
    const rowColors = shareRowColors(src, tash);
    return { columns: imgCols, rows, subtitle: shareSubtitle(), rowColors };
  }

  function buildRowObject(r: MatchResult): Record<string, unknown> {
    // نفس الـ٨ أعمدة الثابتة اللي في العرض (resultCols) — عشان الإكسيل/واتساب
    // يطلّعوا بنفس الترتيب والمحتوى بالظبط.
    const row: Record<string, unknown> = { "رقم اللوحة": plateForRow(r) };
    for (const rc of allResultCols) {
      row[rc.label] = cellValue(rc.source === "data" ? r.dataRow : r.referralRow, rc);
    }
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
    // نفس أعمدة العرض وبنفس الترتيب — عشان الواتساب والإكسيل والصورة يطلعوا
    // زي اللي المندوب شايفه في النافذة بالظبط.
    for (const c of orderedTashyeekCols) {
      obj[c.label] = c.source === "referral"
        ? (cellValue(r.referralRow, c) || cellValue(r.tashyeekRow, c))
        : (cellValue(r.tashyeekRow, c) || cellValue(r.referralRow, c));
    }
    return obj;
  }
  function removeTashyeekRow(i: number) {
    setTashyeekResults((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
    setTashyeekSelected(new Set());
  }
  /** خلية GPS الخام لصف السجلات — عمود الموقع في شيت التشييك. */
  function rawGpsOfTashyeek(r: TashyeekResultRow): string {
    if (tashyeekGpsCol) {
      const direct = gpsCellToLink(String(r.tashyeekRow?.[tashyeekGpsCol] ?? ""));
      if (direct) return direct;
    }
    return pickMapsLink(r.tashyeekRow, tashyeekTable?.headers ?? null)
      || pickMapsLink(r.referralRow, null);
  }
  /** ملخّص صف السجلات + سطر «📍 لينك الموقع». */
  function tashyeekShareText(r: TashyeekResultRow): string {
    return withLocationLink(buildRowSummaryText(buildTashyeekRowObj(r)), rawGpsOfTashyeek(r));
  }
  function shareTashyeekRow(r: TashyeekResultRow) {
    void shareTextViaChooser(tashyeekShareText(r));
  }
  async function copyTashyeekRow(r: TashyeekResultRow, i: number) {
    await navigator.clipboard.writeText(tashyeekShareText(r));
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
  /** نص المشاركة لصفوف التشييك المحددة — نفس النص للمشاركة وللنسخ. */
  function tashyeekSelectedShareText(): string {
    const rows = (tashyeekResults ?? []).filter((_, idx) => tashyeekSelected.has(idx));
    if (!rows.length) return "";
    return `*سيارات مطلوبة (${rows.length})*\n\n` +
      rows.map((r, i) => `${i + 1}. ${tashyeekShareText(r)}`).join("\n\n──────────\n\n");
  }
  function shareTashyeekSelected() {
    const text = tashyeekSelectedShareText();
    if (text) void shareTextViaChooser(text);
  }

  // ── Export ──
  const ts = () => new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");

  // Colored xlsx, but falls back to a plain CSV if the xlsx build crashes on
  // the device WebView (loses the row colors, but the data always comes out).
  async function buildSortExcelBlob(src: MatchResult[] = displayResults, tash: TashyeekResultRow[] = []): Promise<{ blob: Blob; ext: "xlsx" | "csv" }> {
    // **المشاركة = العرض بالظبط** — نفس مصدر الصورة (buildDisplayShareObjects) عشان
    // كل عمود قدام المندوب يطلع في الإكسيل بنفس الترتيب.
    const { rowObjects } = buildDisplayShareObjects(src, tash);
    try {
      const rowColors = shareRowColors(src, tash);
      return { blob: await buildColoredSortExcel(rowObjects, "نتائج الفرز", rowColors), ext: "xlsx" };
    } catch {
      return { blob: buildCsvBlob(rowObjects), ext: "csv" };
    }
  }

  // ── مسح نتايج نافذة واحدة (بتأكيد) — كل زر يمسح نتايج نافذته فقط ──
  function clearMainResults() {
    if (!confirm("متأكد تمسح نتايج الفرز؟")) return;
    setResults(null); setSorted(false); setSelectedByWin({}); setVisibleByWin({});
    persistSortResults([], tashyeekResults, sortMode, 0);
  }
  function clearTashyeekResults() {
    if (!confirm("متأكد تمسح نتايج فرز السجلات؟")) return;
    setTashyeekResults(null); setTashyeekSelected(new Set());
    persistSortResults(results ?? [], null, sortMode, newPlatesCount);
  }
  function clearPasteResults() {
    if (!confirm("متأكد تمسح نتايج اللصق النصي؟")) return;
    setPasteResults([]); setPasteSelected(new Set());
    persistPasteResults([], pasteRecordResults, pasteText);
  }
  function clearPasteRecordResults() {
    if (!confirm("متأكد تمسح لوحات سبق تشييكها؟")) return;
    setPasteRecordResults([]);
    persistPasteResults(pasteResults, [], pasteText);
  }

  // ── Paste sort ──
  async function runPasteSort() {
    if (!dataTable || !effectiveDataPlateCol || !pasteText.trim()) return;
    playSortBeep();   // تأكيد صوتي إن الفرز بدأ
    const tokens = tokenizePastedPlates(pasteText);
    // نطابق على كل ملفات الداتا (الأساسي + الإضافية) — كل واحد بعمود لوحته، مع
    // إزاحة dataIdx عشان الترتيب يفضل ملف ورا ملف.
    const matches: TokenMatch[] = [];
    let base = 0;
    setPasteBusy(true);
    try {
      // الداتا الكبيرة (streamed): لفّ على الدفعات من القرص وطابق كل دفعة — بدل
      // ما نطابق على عيّنة العرض بس (كانت بتخلّي اللصق مايطلّعش نتايج).
      if (dataStreamed && dataStreamMeta) {
        // بنسيب الشاشة تتنفّس **بالوقت** مش بعد كل دفعة. الدفعة ٥٠٠٠ صف بتخلص
        // في أجزاء من الملّي، وكل setTimeout(0) بيكلّف ٤ ملّي على الأقل في
        // متصفّح الموبايل — يعني ٩٧ دفعة كانت بتضيّع وقت من غير أي فايدة.
        let lastYield = Date.now();
        await iterateRows(async (batch, _b, sheet) => {
          const pc = (sheet && sheetPlateColMap.get(sheet)) || dataStreamMeta.plateCol;
          // تام فقط (enableFuzzy=false): الداتا الكبيرة بتتطابق دفعة-بدفعة، والمرور
          // التقريبي كان بيتكرر على كل دفعة عبر الملايين فيبطّئ الفرز جداً.
          for (const m of matchTokensAgainstRows(tokens, batch, pc, 88, false)) {
            matches.push({ ...m, dataIdx: m.dataIdx + base });
          }
          base += batch.length;
          if (Date.now() - lastYield >= 50) {
            await new Promise<void>((r) => setTimeout(r, 0));
            lastYield = Date.now();
          }
        }, { slot: "data", sheets: selectedDataSheetFilter });
      }
      // ملفات الداتا في الذاكرة: الأساسي (لو مش streamed) + الإضافية.
      const memSources = dataStreamed ? collectDataSources().slice(1) : collectDataSources();
      for (const src of memSources) {
        // ملف إضافي كبير (streamed): لفّ على دفعاته من القرص وطابق كل دفعة (تام
        // فقط زي الأساسي — التقريبي على الملايين بطيء)، مع إزاحة dataIdx.
        if (src.slot) {
          let lastYield = Date.now();
          await iterateRows(async (batch) => {
            for (const m of matchTokensAgainstRows(tokens, batch, src.plateCol, 88, false)) {
              matches.push({ ...m, dataIdx: m.dataIdx + base });
            }
            base += batch.length;
            if (Date.now() - lastYield >= 50) { await new Promise<void>((r) => setTimeout(r, 0)); lastYield = Date.now(); }
          }, { slot: src.slot });
          continue;
        }
        for (const m of matchTokensAgainstRows(tokens, src.rows, src.plateCol)) {
          matches.push({ ...m, dataIdx: m.dataIdx + base });
        }
        base += src.rows.length;
      }
    } finally {
      setPasteBusy(false);
    }
    matches.sort((a, b) => a.dataIdx - b.dataIdx);

    // نفس اللوحات الملصوقة، بس ضد شيت السجلات (تشييك سابق صوت/يدوي) — لو موجود.
    // لو السجلات مربوطة كداتا، بتتطابق فوق مع الداتا فمانعملش قسم منفصل (منع التكرار).
    const recordMatches = !recordsLinked && tashyeekTable && tashyeekPlateCol
      ? matchTokensAgainstRows(tokens, tashyeekTable.rows, tashyeekPlateCol)
      : [];
    recordMatches.sort((a, b) => a.dataIdx - b.dataIdx);

    setPasteResults(matches);
    setPasteRecordResults(recordMatches);
    setPasteRan(true);
    persistPasteResults(matches, recordMatches, pasteText);
  }

  // ── WhatsApp ──
  /**
   * خلية الـ GPS الخام لصف نتيجة — من الداتا الأول (هي اللي فيها الموقع
   * الميداني)، وإلا من الإحالة. بنقراها **مستقلة عن الأعمدة الظاهرة** عشان
   * لينك الموقع يوصل للمندوب حتى لو مخفي عمود GPS من «أعمدة النتيجة».
   */
  // رابط خرائط جوجل لموقع السيارة **باسم السيارة على الدبوس**: اللوحة · الماركة ·
  // اللون. كده لما المندوب يفتح الموقع في خرائط جوجل يلاقي الدبوس مسمّى ببيانات
  // السيارة بدل إحداثيات مجرّدة. لو مش قادرين نطلّع إحداثيات نسيب اللينك زي ما هو.
  function labeledGpsLink(link: string, rows: Array<Record<string, string> | null | undefined>, plate: string): string {
    const c = extractLatLngFromMapsLink(link) ?? gpsCellCoords(link);
    if (!c) return link;
    const pick = (re: RegExp): string => {
      for (const row of rows) {
        if (!row) continue;
        const k = Object.keys(row).find((h) => re.test(h) && String(row[h] ?? "").trim());
        if (k) return String(row[k]).trim();
      }
      return "";
    };
    const make = pick(/ماركة|صانع|طراز|make|model|vehicle/i);
    // اسم الدبوس في خرائط جوجل = رقم اللوحة + الماركة (اسم قصير ونضيف عشان جوجل
    // يعرضه على الموبايل — الأسماء الطويلة/الرموز أحياناً بيتجاهلها).
    const label = [plate, make].filter(Boolean).join(" ").trim();
    return `https://www.google.com/maps?q=${c.lat},${c.lng}${label ? `(${encodeURIComponent(label)})` : ""}`;
  }

  function rawGpsOf(r: MatchResult): string {
    if (gpsCol) {
      const direct = gpsCellToLink(String(r.dataRow?.[gpsCol] ?? ""));
      if (direct) return direct;
    }
    return pickMapsLink(r.dataRow, dataTable?.headers ?? null)
      || pickMapsLink(r.referralRow, referralTable?.headers ?? null)
      || pickMapsLink(r.referralRow, null);
  }

  /** ملخّص لوحة واحدة + سطر «📍 لينك الموقع» في الآخر. */
  function rowShareText(r: MatchResult): string {
    return withLocationLink(buildRowSummaryText(buildRowObject(r)), rawGpsOf(r));
  }

  function shareResultRow(r: MatchResult) {
    void shareTextViaChooser(rowShareText(r));
  }
  /** نص المشاركة للصفوف المحددة — نفس النص للمشاركة وللنسخ. */
  function selectedShareText(indices: Set<number>): string {
    const rows = displayResults
      .filter((_, i) => indices.has(i))
      .map((r) => ({ obj: buildRowObject(r), gps: rawGpsOf(r) }));
    return buildSelectedShareText(rows, buildRowSummaryText);
  }
  function shareSelectedToWhatsApp(indices: Set<number>) {
    void shareTextViaChooser(selectedShareText(indices));
  }

  /** خلية GPS الخام لصف لصق — نفس عمود موقع الداتا. */
  function rawGpsOfPaste(p: { row: Record<string, string> }): string {
    if (gpsCol) {
      const direct = gpsCellToLink(String(p.row?.[gpsCol] ?? ""));
      if (direct) return direct;
    }
    return pickMapsLink(p.row, dataTable?.headers ?? null) || pickMapsLink(p.row, null);
  }
  /** ملخّص صف لصق + سطر «📍 لينك الموقع». */
  function pasteShareText(p: { converted: string; row: Record<string, string> }): string {
    const body = Object.entries(p.row).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
    return withLocationLink(`🚗 ${p.converted}\n${body}`, rawGpsOfPaste(p));
  }
  function sharePasteToWhatsApp() {
    const text = `*اللوحات المطلوبة (${pasteResults.length})*\n\n` +
      pasteResults.map((p, i) => `${i + 1}. ${pasteShareText(p)}`).join("\n\n──────────\n\n");
    void shareTextViaChooser(text);
  }

  // ── Selection ──
  // التحديد بقى **لكل نافذة** (win = رقم ملف الداتا)، والأرقام جواه فهارس عامّة
  // في displayResults — فالمشاركة والحذف مابيتغيّروش.
  function toggleResult(win: number, i: number) {
    setSelectedByWin((p) => {
      const n = new Set(p[win] ?? []);
      if (n.has(i)) n.delete(i); else n.add(i);
      return { ...p, [win]: n };
    });
  }
  function toggleAllResults(win: number, all: number[]) {
    setSelectedByWin((p) => {
      const cur = p[win] ?? new Set<number>();
      return { ...p, [win]: cur.size === all.length ? new Set<number>() : new Set(all) };
    });
  }
  // الحذف بيزحزح الفهارس العامّة، فبنفضّي تحديد كل النوافذ (أأمن من تصحيح جزئي).
  function deleteResult(i: number) { const r = displayResults[i]; setResults((p) => p ? p.filter((x) => x !== r) : null); setSelectedByWin({}); }
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
      rows.map((p, i) => `${i + 1}. ${pasteShareText(p)}`).join("\n\n──────────\n\n");
    void shareTextViaChooser(text);
  }
  async function copyPasteRow(p: { converted: string; row: Record<string, string> }, i: number) {
    await navigator.clipboard.writeText(withLocationLink(buildRowSummaryText(buildPasteRowObject(p)), rawGpsOfPaste(p)));
    setPasteCopiedIdx(i);
    setTimeout(() => setPasteCopiedIdx(null), 1200);
  }

  async function copyPasteRecordRow(p: { converted: string; row: Record<string, string> }, i: number) {
    await navigator.clipboard.writeText(withLocationLink(buildRowSummaryText(buildPasteRecordRowObject(p)), rawGpsOfPaste(p)));
    setPasteRecordCopiedIdx(i);
    setTimeout(() => setPasteRecordCopiedIdx(null), 1200);
  }

  // قسم «الأعمدة» لأي مربع إضافي (داتا أو إحالة) — نفس شكل ومنطق المربع الأساسي.
  function extraColsPicker(id: string, table: ExcelTable, kind: "data" | "referral") {
    const arabicCol = detectArabicPlateColumn(table.headers);
    const plateCol = arabicCol ?? detectPlateColumn(table.headers, table.rows);
    const sel = extraColsSel[id] ?? new Set<string>();
    const open = extraColsOpen.has(id);
    const label = kind === "data" ? "الأعمدة" : "أعمدة إضافية في النتائج";
    return (
      <div className="rounded-xl border border-border bg-surface">
        <button onClick={() => toggleExtraColsOpen(id)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink">
          <span>{label} — محدد: {sel.size}</span>
          <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
            <p className="text-[11px] text-muted">
              عمود اللوحة (اكتشاف تلقائي): <span className="font-bold text-primary">{plateCol ?? "—"}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {table.headers.filter((h) => h !== plateCol).map((h) => {
                const mandatory = kind === "data" && isMandatory(h);
                const active = mandatory || sel.has(h);
                return (
                  <button key={h} onClick={() => { if (!mandatory) toggleExtraCol(id, h); }} disabled={mandatory}
                    className={`rounded-full px-3 py-1 text-xs transition ${active ? (mandatory ? "bg-primary text-night font-bold opacity-80 cursor-default" : "bg-primary text-night font-bold") : "border border-border text-muted"}`}>
                    {h}{mandatory ? " 🔒" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!hydrated) return <p className="py-10 text-center text-sm text-muted">جارٍ تحميل الملفات المحفوظة...</p>;

  return (
    <div className="rtl-text flex flex-col gap-4 w-full min-w-0" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-ink">الفرز</h1>
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
        title={extraData.length > 0 ? "ملف الداتا 1" : "ملف الداتا"}
        loadedAccent="data"
        hint="بيانات التفريغ الميداني"
        parsedFile={dataFile}
        parsedRowCount={dataStreamed && dataStreamMeta ? dataStreamMeta.rowCount : (dataTable?.rows.length ?? null)}
        onParsed={(table, file) => ((table.allSheetNames?.length ?? 0) > 1
          ? handleMultiSheetData(file)
          : persistAndSet("data", table, file))}
        onClear={() => clearSlot("data")}
        showReplaceButtons
        largeFileThresholdBytes={LARGE_DATA_THRESHOLD_BYTES}
        onLargeFile={handleLargeData}
      />
      {/* ملف داتا فيه أكتر من ورقة → المندوب يعلّم على اللي عايز يفرز عليه */}
      <ReferralSheetPicker
        sheets={dataSheetInfos}
        selected={dataSheetSel}
        onChange={setDataSheetSelection}
        total={selectedDataRowTotal}
        unit="صف"
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

      {/* ملفات داتا إضافية (داتا ٢، ٣...) — بتتدمج كلها في نفس الفرز (جديد/كلي/
          مطلوب/لصق). كل مربع مُضاف ليه زر «مسح المربع» يلغيه (الأول ثابت). */}
      {extraData.map((ed, i) => (
        <div key={ed.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-bold text-muted">داتا إضافية {i + 2}</span>
            <button onClick={() => clearExtraDataBox(i)} title="مسح هذا المربع"
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-danger/50 hover:text-danger">
              <X size={13} /> مسح المربع
            </button>
          </div>
          <FileUploadBox
            title={`ملف الداتا ${i + 2}`}
            loadedAccent="data"
            hint="داتا إضافية تُدمج مع الأولى في نفس الفرز"
            parsedFile={ed.file}
            parsedRowCount={ed.streamed && ed.streamMeta ? ed.streamMeta.rowCount : (ed.table?.rows.length ?? null)}
            onParsed={(table, file) => onExtraDataParsed(i, table, file)}
            largeFileThresholdBytes={LARGE_DATA_THRESHOLD_BYTES}
            onLargeFile={(file, onProgress) => handleExtraLargeData(i, file, onProgress)}
            onClear={() => clearExtraDataFile(i)}
            showReplaceButtons
          />
          {ed.table && extraColsPicker(ed.id, ed.table, "data")}
        </div>
      ))}

      {/* زر إضافة ملف داتا جديد */}
      <button onClick={addDataBox}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/10">
        <Plus size={16} /> إضافة ملف داتا
      </button>

      {/* سجلات المندوب مربوطة كخانة داتا (من صفحة السجلات) — ربط حي بيتحدّث لوحده */}
      {recordsLinked && tashyeekTable && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-ink">
              📋 سجلاتي {recordsTgt === "main" && !dataTable ? "(مربع الداتا الأساسي)" : "(مربع داتا إضافي)"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {tashyeekTable.rows.length} سيارة من صفحة السجلات — بتتحدّث تلقائياً، مش محتاج ترفع ملف.
            </p>
          </div>
          <button onClick={() => { unlinkRecords(); setRecordsLinked(false); }} title="شيل سجلاتي من الفرز"
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-danger/50 hover:text-danger">
            <X size={13} /> شيل
          </button>
        </div>
      )}
      </>)}

      {/* ③ SORT MODE TABS */}
      <div className="flex gap-2 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => switchMode("new")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${sortMode === "new" ? "bg-primary text-night font-bold" : "text-muted"}`}>
          <ScanLine size={15} /> فرز جديد
        </button>
        <button onClick={() => switchMode("full")}
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
        title={extraReferrals.length > 0 ? "ملف الإحالة 1" : "ملف الإحالة"}
        loadedAccent="referral"
        hint={sortMode === "new" ? "إحالة اليوم الجديدة" : "قائمة البنك بالسيارات المطلوبة"}
        parsedFile={referralFile}
        parsedRowCount={referralTable?.rows.length ?? null}
        onParsed={(table, file) => persistAndSet("referral", table, file)}
        onClear={() => clearSlot("referral")}
        showReplaceButtons
      />
      {/* ملف إحالة فيه أكتر من ورقة → المندوب يعلّم على اللي عايز يفرز عليه */}
      <ReferralSheetPicker
        sheets={refSheets}
        selected={refSheetSel}
        onChange={setRefSheetSelection}
        total={selectedRefPlateCount}
      />
      {referralTable && (
        <div className="rounded-xl border border-border bg-surface">
          <button onClick={() => setReferralColsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink">
            <span>أعمدة الإحالة ({refPickerCols.length}) — محدد: {referralExtraCols.size}</span>
            <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${referralColsOpen ? "rotate-180" : ""}`} />
          </button>
          {referralColsOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
              <div>
                <p className="text-[11px] text-muted">
                  عمود اللوحة (اكتشاف تلقائي): <span className="font-bold text-primary">{refPickerPlateCol ?? "—"}</span>
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] text-muted">أعمدة إضافية في النتائج:</p>
                <div className="flex flex-wrap gap-2">
                  {refPickerCols.map((h) => (
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

      {/* شيتات إحالة إضافية (إحالة ٢، ٣، ٤...) — بتتدمج كلها في فرز واحد.
          كل مربع مُضاف ليه زر «مسح المربع» يلغيه بالكامل (الأول ثابت). */}
      {extraReferrals.map((er, i) => (
        <div key={er.id} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-bold text-muted">إحالة إضافية {i + 2}</span>
            <button onClick={() => clearExtraReferral(i)} title="مسح هذا المربع"
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-danger/50 hover:text-danger">
              <X size={13} /> مسح المربع
            </button>
          </div>
          <FileUploadBox
            title={`ملف الإحالة ${i + 2}`}
            loadedAccent="referral"
            hint="إحالة إضافية تُدمج مع الأولى في نفس الفرز"
            parsedFile={er.file}
            parsedRowCount={er.table?.rows.length ?? null}
            onParsed={(table, file) => onExtraReferralParsed(i, table, file)}
            onClear={() => clearExtraReferralFile(i)}
            showReplaceButtons
          />
          {er.table && extraColsPicker(er.id, er.table, "referral")}
        </div>
      ))}

      {/* زر إضافة شيت إحالة جديد */}
      <button onClick={addReferralBox}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/10">
        <Plus size={16} /> إضافة ملف إحالة
      </button>
      </>)}

      {/* ⑤ SORT BUTTON */}
      <button onClick={handleSort} disabled={sorting || !canSort}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-50">
        <ListFilter size={18} />
        {sorting ? "جارٍ الفرز..." : "فرز"}
      </button>

      {/* زر «مسح نتايج الفرز» العام اتشال — بقى فيه زر مسح خاص جوه كل نافذة نتائج */}

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
                <p className="text-xl font-black text-ink">{totalReferralRows}</p>
                <p className="text-xs text-muted">
                  إجمالي الإحالة{extraReferrals.some((e) => e.table) ? ` (${collectRefSources().length} شيتات)` : ""}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-brand">
              {sortMode === "new" ? "نتيجة السيارات المطلوبة في فرز جديد" : "نتيجة السيارات المطلوبة في فرز كلي"}
            </h2>
            <div className="flex items-center gap-1.5">
              {/* إخفاء السيارات المقفولة (مسحوبة / سدّد / حد تاني) — اختياري */}
              {(hideClosed || closedCount > 0) && (
                <button onClick={() => setHideClosed((v) => !v)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs transition ${hideClosed ? "bg-primary text-night font-bold" : "border border-border text-muted hover:text-primary"}`}>
                  {hideClosed ? `مخفي ${closedCount}` : "إخفاء المقفولة"}
                </button>
              )}
              {gpsCol && (
                <button onClick={handleNearest} disabled={locating}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${nearestActive ? "bg-primary text-night font-bold" : "border border-border text-muted hover:text-primary"}`}>
                  <Navigation size={13} />
                  {locating ? "جارٍ..." : "الأقرب"}
                </button>
              )}
            </div>
          </div>

          {/* ترتيب الأعمدة — رقم اللوحة/نوع السيارة/الماركة ثابتين في الأول،
              والباقي المندوب يدوس عليه بالترتيب اللي عايزه (رقم بيبان جنبه). لو
              ماختارش حاجة → الثابت بس. الاختيار بيتحفظ ويطبّق على النتيجة والإكسيل
              والصورة وكل أنواع الفرز وصفحة المطلوب. */}
          {(orderableGroups.data.length > 0 || orderableGroups.ref.length > 0 || allResultColsRaw.length > 0) && (
            <div className="rounded-xl border border-border bg-surface">
              <button onClick={() => setResultColsPickerOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink">
                <span>ترتيب الأعمدة {orderMode === "custom" ? `(تخصيص · ${colOrder.length})` : "(أساسي)"}</span>
                <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${resultColsPickerOpen ? "rotate-180" : ""}`} />
              </button>
              {resultColsPickerOpen && (
                <div className="space-y-2.5 border-t border-border px-3 pb-3 pt-2">
                  {/* خيارين تحت بعض: الأساسي (افتراضي) / تخصيص */}
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => setOrderMode("basic")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-right text-xs font-bold transition ${orderMode === "basic" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${orderMode === "basic" ? "border-primary" : "border-muted"}`}>{orderMode === "basic" && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
                      الترتيب الأساسي للأعمدة (زي البرنامج)
                    </button>
                    <button onClick={() => setOrderMode("custom")}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-right text-xs font-bold transition ${orderMode === "custom" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted"}`}>
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${orderMode === "custom" ? "border-primary" : "border-muted"}`}>{orderMode === "custom" && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
                      تخصيص (رتّب الأعمدة بنفسك)
                    </button>
                  </div>

                  {/* قسم التخصيص — يظهر لما «تخصيص» متحدّد */}
                  {orderMode === "custom" && (
                    <div className="space-y-2.5 border-t border-border pt-2.5">
                      <div>
                        <p className="mb-1 text-[11px] text-muted">📌 ثابت في الأول (مايتغيّرش):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {["رقم اللوحة", ...FIXED_LEADING_LABELS].map((l) => (
                            <span key={l} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">📌 {l}</span>
                          ))}
                        </div>
                      </div>
                      {(orderableGroups.data.length > 0 || orderableGroups.ref.length > 0) && (() => {
                        const chip = (label: string) => {
                          const idx = colOrder.indexOf(label);
                          const on = idx >= 0;
                          return (
                            <button key={label} onClick={() => toggleOrderCol(label)}
                              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${on ? "bg-primary text-night font-bold" : "border border-border text-muted"}`}>
                              {on && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px] font-black">{idx + 1}</span>}
                              {label}
                            </button>
                          );
                        };
                        return (
                          <div className="space-y-2.5">
                            <p className="text-[11px] text-muted">دوس بالترتيب اللي عايزه — الرقم بيبان جنبه (دوس تاني يشيله):</p>
                            {orderableGroups.data.length > 0 && (
                              <div>
                                <p className="mb-1 text-[11px] font-bold text-primary">📄 أعمدة الداتا</p>
                                <div className="flex flex-wrap gap-2">{orderableGroups.data.map(chip)}</div>
                              </div>
                            )}
                            {orderableGroups.ref.length > 0 && (
                              <div className="border-t border-dashed border-border pt-2.5">
                                <p className="mb-1 text-[11px] font-bold text-primary">🏦 أعمدة الإحالة</p>
                                <div className="flex flex-wrap gap-2">{orderableGroups.ref.map(chip)}</div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* نافذة نتيجة لكل ملف داتا. لو ملف واحد → مجموعة واحدة بلا عنوان
              وبلا إطار زيادة، يعني نفس الشكل القديم بالظبط. */}
          {resultGroups.map((g) => {
          const gRows = g.items.map((it) => it.r);
          const gIdxs = g.items.map((it) => it.gi);
          const gSel = selOf(g.key);
          const gVisible = visibleOf(g.key);
          const gSelInWin = gIdxs.filter((gi) => gSel.has(gi)).length;
          return (
          <div key={g.key} className={g.title ? "flex flex-col gap-3 rounded-xl border border-brand/40 bg-surface p-3" : "flex flex-col gap-3"}>
          {g.title && (
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-brand">{g.title}</h3>
              <span className="rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-bold text-brand">{gRows.length} سيارة</span>
            </div>
          )}

          {/* «تحديد الكل» على اليمين والزوم على الشمال (بطلب المستخدم) */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
            <button onClick={() => toggleAllResults(g.key, gIdxs)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
              {gSelInWin === gIdxs.length && gIdxs.length > 0 ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
              {gSelInWin === gIdxs.length && gIdxs.length > 0 ? "إلغاء الكل" : "تحديد الكل"}
            </button>
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
          </div>

          <div ref={resPinchFor(g.key)} className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh", touchAction: "pan-x pan-y" }}>
            <div style={{ fontSize: `${ZOOM_LEVELS[zoom] * 12}px`, minWidth: "max-content" }}>
              <table className="border-collapse w-full" style={{ direction: "rtl" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-2 text-muted">
                    {/* التحديد (للمشاركة الجماعية) أول عمود، وبعده الترقيم + نسخ/واتساب/حذف */}
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">☐</th>
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                    <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                    {allResultCols.map((rc) => (
                      <th key={rc.id} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{rc.label}</th>
                    ))}
                    {nearestActive && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">المسافة</th>}
                    {nearestActive && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الوقت</th>}
                    {/* آخر الويندو (بعد أعمدة الداتا والتاريخ) بطلب المستخدم */}
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">موقعها في الداتا</th>
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">الحالة</th>
                    <th className="border-b border-border px-2 py-2 text-center font-bold whitespace-nowrap">السجل</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.slice(0, gVisible).map(({ r, gi: i }, rowNo) => {
                    const plate = plateForRow(r);
                    const isSel = gSel.has(i);
                    // refPlateNorm محسوبة وقت الفرز بعمود لوحة الشيت الصح (شامل الإحالات
                    // الإضافية)؛ نستخدمها للتلوين زي ما plateColorMap/التصدير بيعملوا —
                    // إعادة الحساب من effectiveReferralPlateCol بتفشل لصفوف الشيتات الإضافية.
                    const plateKey = r.refPlateNorm ?? normalizePlate(bankPlateToArabic(String(r.referralRow[effectiveReferralPlateCol ?? ""] ?? "")));
                    const colorIdx = plateColorMap.get(plateKey);
                    // المكرر بس بيتلوّن؛ اللي ملهاش شبيه تفضل بيضا (بدون أي لون) بطلب المستخدم.
                    const rowBg = isSel ? "bg-primary/15" : colorIdx !== undefined ? DUPE_COLORS[colorIdx].tw : "hover:bg-brand/10";
                    return (
                      <tr key={i} className={`border-b border-border transition ${rowBg}`}>
                        {/* التحديد أول عمود (بيفتح شريط المشاركة الجماعية على واتساب) */}
                        <td className="border-l border-border px-2 py-2 text-center">
                          <button onClick={() => toggleResult(g.key, i)} className="text-muted hover:text-primary transition">
                            {isSel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                          </button>
                        </td>
                        {/* ترقيم + نسخ/واتساب/حذف */}
                        <td className="border-l border-border px-2 py-2">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            {/* الترقيم بيبدأ من ١ في كل نافذة لوحدها */}
                            <span className="text-[11px] font-bold text-muted">{rowNo + 1}</span>
                            {/* النسخ والمشاركة الاتنين بيطلعوا معاهم لينك موقع السيارة */}
                            <button onClick={async () => { await navigator.clipboard.writeText(rowShareText(r)); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1200); }} className="text-muted hover:text-primary transition" title="نسخ">
                              {copiedIdx === i ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                            </button>
                            <button onClick={() => shareResultRow(r)} className="text-muted hover:text-primary transition" title="واتساب"><Share2 size={13} /></button>
                            <button onClick={() => deleteResult(i)} className="text-muted hover:text-danger transition" title="حذف"><Trash2 size={13} /></button>
                          </div>
                        </td>
                        <td className="border-l border-border px-3 py-2 font-bold text-ink whitespace-nowrap">{plate}</td>
                        {allResultCols.map((rc) => {
                          const val = cellValue(rc.source === "data" ? r.dataRow : r.referralRow, rc);
                          return (
                            <td key={rc.id} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                              {(() => {
                                const v = String(val).trim();
                                const link = gpsCellToLink(v);
                                if (link) return <a href={labeledGpsLink(link, [r.dataRow, r.referralRow], plate)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary">📍 خريطة</a>;
                                return <>{v || "—"}</>;
                              })()}
                            </td>
                          );
                        })}
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
                        {/* آخر الويندو: موقعها في الداتا › الحالة › السجل */}
                        <td className="border-l border-border px-2 py-2 text-center">
                          <button onClick={() => void showNeighbors(r)} disabled={neighborsLoading}
                            title="شوف موقعها بين الجيران في نفس الشارع"
                            className="inline-flex items-center gap-0.5 rounded-lg bg-brand/15 px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand/25 transition disabled:opacity-50">
                            <MapPin size={12} /> {neighborsLoading ? "بندوّر…" : "موقعها"}
                          </button>
                        </td>
                        {/* الحالة: زرين تسجيل سريع (ضغطة واحدة تحفظ)، أو الحالة المسجّلة */}
                        <td className="border-l border-border px-2 py-2 text-center whitespace-nowrap">
                          {(() => {
                            const hp = plateKey;
                            const st = history.get(hp)?.status ?? "none";
                            const stAt = history.get(hp)?.statusAt;
                            if (st === "none") {
                              return (
                                <span className="inline-flex gap-1">
                                  <button onClick={() => void applyPlateStatus(hp, "taken")} title="سحبتها"
                                    className="inline-flex items-center gap-0.5 rounded-lg border border-primary/50 bg-primary/10 px-1.5 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/25">
                                    <Check size={11} /> سحبتها
                                  </button>
                                  <button onClick={() => void applyPlateStatus(hp, "notFound")} title="مش في الموقع"
                                    className="inline-flex items-center gap-0.5 rounded-lg border border-border px-1.5 py-1 text-[11px] text-muted transition hover:border-alert hover:text-alert">
                                    <X size={11} /> ملقيتهاش
                                  </button>
                                </span>
                              );
                            }
                            const closed = isClosedStatus(st);
                            const label = st === "taken" ? "مسحوبة" : st === "otherTook" ? "حد تاني سحبها"
                              : st === "paid" ? "العميل سدّد" : st === "excluded" ? "مستبعدة" : "مش في الموقع";
                            return (
                              <button onClick={() => setHistoryPlate(hp)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${closed ? "bg-primary/15 text-primary" : "bg-alert/15 text-alert"}`}>
                                {closed ? <Check size={11} /> : <X size={11} />}
                                {label}{stAt ? ` · ${stAt.slice(8)}/${stAt.slice(5, 7)}` : ""}
                              </button>
                            );
                          })()}
                        </td>
                        {/* السجل: شارة تفتح نافذة تفاصيل السيارة */}
                        <td className="border-l border-border px-2 py-2 text-center whitespace-nowrap">
                          {(() => {
                            const e = history.get(plateKey);
                            if (!e || e.count <= 1) {
                              const d = e ? describeHistory(e, todayStr()) : null;
                              if (!d || d.tone === "new") {
                                return (
                                  <button onClick={() => setHistoryPlate(plateKey)}
                                    className="text-[11px] text-muted underline decoration-dotted transition hover:text-primary">جديدة</button>
                                );
                              }
                            }
                            const d = describeHistory(e!, todayStr());
                            const cls = d.tone === "danger" ? "bg-danger/15 text-danger" : "bg-alert/15 text-alert";
                            return (
                              <button onClick={() => setHistoryPlate(plateKey)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition ${cls}`}>
                                <History size={11} /> {d.text}
                              </button>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {g.items.length > gVisible && (
            <button onClick={() => setVisibleByWin((p) => ({ ...p, [g.key]: (p[g.key] ?? PAGE_SIZE) + PAGE_SIZE }))}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm text-muted hover:text-ink transition">
              <ChevronDown size={15} /> تحميل المزيد ({g.items.length - gVisible} متبقي)
            </button>
          )}

          {gSelInWin > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <span className="text-xs font-bold text-ink">{gSelInWin} محددة</span>
              <div className="flex gap-2">
                {/* النسخ بيوصّل القائمة كاملة — الحافظة مالهاش حد الـ١٦ كيلوبايت
                    اللي بتقصّ عنده share sheet بتاعة الآيفون في صمت. */}
                <button onClick={() => void copyBulk(selectedShareText(gSel), "results")}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink transition hover:border-primary hover:text-primary">
                  {bulkCopied === "results" ? <Check size={13} className="text-primary" /> : <Copy size={13} />} {bulkCopied === "results" ? "تم النسخ" : "نسخ الكل"}
                </button>
                <button onClick={() => shareSelectedToWhatsApp(gSel)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night">
                  <Share2 size={13} /> واتساب
                </button>
              </div>
            </div>
          )}

          {/* ⑥ مشاركة الفرز — زر موحّد (فتح / واتساب / صورة). بيشارك صفوف
              النافذة دي **+ سيارات السجلات** معلّم قدامها «سجلات» (بطلب المندوب)
              عشان تطلع مشاركة واحدة فيها الاتنين. excelBlob = النسخة الملوّنة. */}
          <ShareSortButton title={g.title ?? "نتائج الفرز"}
            rows={() => [
              ...gRows.map(buildRowObject),
              ...(tashyeekResults ?? []).map((r) => ({ "المصدر": "سجلات", ...buildTashyeekRowObj(r) })),
            ]}
            imageTable={() => buildSortImageTable(gRows, tashyeekResults ?? [])}
            excelBlob={() => buildSortExcelBlob(gRows, tashyeekResults ?? [])} />
          </div>
          );
          })}

          <button onClick={clearMainResults}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/5 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10">
            <Trash2 size={15} /> مسح نتايج الفرز
          </button>
        </div>
      )}

      {/* ⑤ SORT RESULTS — بدون تطابقات */}
      {sorted && results && matchedResults.length === 0 && (() => {
        // عدد اللوحات اللي اتفحصت: في «فرز جديد» = اللوحات الجديدة، في «فرز
        // كلي» = كل لوحات الإحالة.
        const checkedCount = sortMode === "new" ? newPlatesCount : (referralTable?.rows.length ?? 0);
        return (
        <div className="rounded-2xl border border-danger/40 bg-surface p-4 space-y-3">

          {/* ── رسالة واضحة: عدد اللوحات + لا يوجد تطابق ── */}
          <div className="rounded-xl border-2 border-danger/50 bg-danger/10 p-4 text-center space-y-2">
            <p className="text-2xl font-black text-danger">{checkedCount}</p>
            <p className="text-sm font-bold text-danger">
              {sortMode === "new"
                ? (checkedCount > 0 ? "لوحة جديدة — ولا يوجد أي تطابق في الداتا" : "لا توجد لوحات جديدة في الإحالة")
                : "لوحة في الإحالة — ولا يوجد أي تطابق في الداتا"}
            </p>
            <p className="text-xs text-muted">
              {checkedCount > 0
                ? `تم فحص ${checkedCount} لوحة ولم يتطابق منها أي لوحة مع ملف الداتا`
                : "راجع ملف الإحالة"}
            </p>
          </div>

          {/* تشخيص تقني — للأدمن فقط، ومطوي افتراضياً (يُفتح بالسهم) */}
          {isAdmin && (
            <div className="rounded-lg bg-surface-2 overflow-hidden">
              <button onClick={() => setDiagOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold text-ink">
                <span>🛠️ تشخيص تقني (أدمن)</span>
                <ChevronDown size={15} className={`text-muted transition-transform duration-200 ${diagOpen ? "rotate-180" : ""}`} />
              </button>
              {diagOpen && (
                <div className="text-xs text-muted space-y-1.5 font-mono px-3 pb-3">
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
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* ⑥ TASHYEEK RESULTS */}
      {sorted && tashyeekResults !== null && (
        tashyeekResults.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border-2 border-primary/60 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-primary">سيارات مطلوبة من ملف التشييك (السجلات)</h2>
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
            <div ref={tashPinch} className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "40vh", touchAction: "pan-x pan-y" }}>
              <table className="border-collapse w-full text-xs" style={{ direction: "rtl" }}>
                <thead className="sticky top-0 z-10">
                  <tr className="bg-surface-2 text-muted">
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">☐</th>
                    <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
                    <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                    {orderedTashyeekCols.map((c) => (
                      <th key={c.id} className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">{c.label}</th>
                    ))}
                    {nearestActive && tashyeekGpsCol && <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">المسافة</th>}
                    {nearestActive && tashyeekGpsCol && <th className="border-b border-border px-3 py-2 text-right font-bold whitespace-nowrap">الوقت</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayTashyeek.map(({ r, idx: i, _dist, _min }, n) => {
                    const plate = r.tashyeekRow[tashyeekPlateCol ?? "رقم اللوحة"] ?? "";
                    const sel = tashyeekSelected.has(i);
                    return (
                      <tr key={i} className={`border-b border-border transition ${sel ? "bg-primary/15" : "bg-primary/5 hover:bg-primary/10"}`}>
                        {/* التحديد أول عمود (بيفتح شريط المشاركة الجماعية على واتساب) */}
                        <td className="border-l border-border px-2 py-2 text-center">
                          <button onClick={() => toggleTashyeekSel(i)} className="text-muted hover:text-primary transition">
                            {sel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                          </button>
                        </td>
                        {/* ترقيم + نسخ/واتساب/حذف */}
                        <td className="border-l border-border px-2 py-2">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-[11px] font-bold text-muted">{n + 1}</span>
                            <button onClick={() => copyTashyeekRow(r, i)} title="نسخ" className="text-muted hover:text-primary transition">
                              {tashyeekCopiedIdx === i ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                            </button>
                            <button onClick={() => shareTashyeekRow(r)} title="واتساب" className="text-muted hover:text-primary transition"><Share2 size={13} /></button>
                            <button onClick={() => removeTashyeekRow(i)} title="حذف" className="text-muted hover:text-danger transition"><Trash2 size={13} /></button>
                          </div>
                        </td>
                        <td className="border-l border-border px-3 py-2 font-bold text-ink whitespace-nowrap">{plate}</td>
                        {orderedTashyeekCols.map((c) => {
                          // عمود من شيت السجلات → يتقرا من صف السجل؛ من المحفظة →
                          // من صف الإحالة. وبنسيب الاحتياطي على المصدر التاني.
                          const val = c.source === "referral"
                            ? (cellValue(r.referralRow, c) || cellValue(r.tashyeekRow, c))
                            : (cellValue(r.tashyeekRow, c) || cellValue(r.referralRow, c));
                          return (
                            <td key={c.id} className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                              {(() => {
                                const link = gpsCellToLink(String(val));
                                return link
                                  ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary">📍 خريطة</a>
                                  : <>{String(val).trim() || "—"}</>;
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
                  <button onClick={() => void copyBulk(tashyeekSelectedShareText(), "tashyeek")}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink transition hover:border-primary hover:text-primary">
                    {bulkCopied === "tashyeek" ? <Check size={13} className="text-primary" /> : <Copy size={13} />} {bulkCopied === "tashyeek" ? "تم النسخ" : "نسخ الكل"}
                  </button>
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

            {/* مشاركة الفرز — زر موحّد (فتح / واتساب / صورة) */}
            <ShareSortButton title="سيارات مطلوبة من ملف التشييك (السجلات)"
              rows={() => displayTashyeek.map(({ r }) => buildTashyeekRowObj(r))} />
            <button onClick={clearTashyeekResults}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/5 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10">
              <Trash2 size={15} /> مسح نتايج الفرز
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-primary/30 bg-surface p-3 text-center">
            <p className="text-xs text-muted">لا يوجد تطابق بين ملف التشييك وقائمة الإحالة</p>
          </div>
        )
      )}

      {/* ⑥.٥ مطلوب من أرقام الشاص — فرز شيت الشاص على عمود الشاص في الإحالة */}
      {chassisResults && chassisResults.length > 0 && (
        <div className="rounded-2xl border border-danger/30 bg-surface p-3" dir="rtl">
          <div className="mb-2 flex items-center gap-2">
            <ScanLine size={18} className="shrink-0 text-danger" />
            <h2 className="text-sm font-bold text-ink">مطلوب من أرقام الشاص</h2>
            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-bold text-danger">{chassisResults.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" dir="rtl">
              <thead>
                <tr className="text-muted">
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">رقم الشاص</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">رقم اللوحة</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">نوع السيارة</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold">التاريخ</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-bold">الموقع</th>
                </tr>
              </thead>
              <tbody>
                {chassisResults.map((m, i) => {
                  const plate = pickReferralCol(m.referralRow, ["لوحة", "plate"]);
                  const vtype = pickReferralCol(m.referralRow, ["نوع السيارة", "نوع المركبة", "vehicle name", "vehicle type", "طراز", "صانع", "موديل", "make", "model"]) || m.record.vehicleType || "";
                  const link = m.record.mapsLink || (m.record.lat != null && m.record.lng != null ? `https://www.google.com/maps?q=${m.record.lat},${m.record.lng}` : "");
                  return (
                    <tr key={m.record.id || i} className="border-t border-border bg-danger/5">
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono font-bold text-ink" dir="ltr">{m.record.chassis}{m.matchType !== "exact" ? " ⚠️" : ""}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-bold text-ink">{plate || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-ink">{vtype || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{fmtChassisDate(m.record.checkedAt)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex text-primary" aria-label="الموقع"><Navigation size={15} /></a>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">اللوحة والنوع من ملف الإحالة، والموقع والتاريخ من سجل الشاص المحفوظ. (⚠️ = تطابق تقريبي)</p>
        </div>
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
                if (!pasteBusy) void runPasteSort();
              }
            }}
            placeholder={"كل لوحة في سطر أو مفصولة بفاصلة...\nمثال: أبح1234 أو GUR4560"}
            rows={5}
            dir="rtl"
            className="rtl-text w-full rounded-xl border border-border bg-surface-2 p-3 text-sm text-ink placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* معاينة تحويل اللوحات الإنجليزية للعربي — عشان المندوب يتأكد إن التحويل
            صح قبل الفرز. بتظهر تلقائي أول ما يلصق لوحات فيها حروف إنجليزي. */}
        {pasteLatinCount > 0 && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5">
            <p className="mb-1.5 text-[11px] font-bold text-primary">
              تحويل اللوحات الإنجليزية للعربي ({pasteLatinCount.toLocaleString("en-US")}) — راجعها قبل الفرز
            </p>
            <div className="flex max-h-44 flex-wrap gap-1.5 overflow-auto">
              {pastePreview.map((p, i) => (
                <span key={i} dir="ltr"
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${p.hasLatin ? "border-primary/30 bg-surface" : "border-border bg-surface-2"}`}>
                  <span className="font-mono text-muted">{p.raw}</span>
                  {p.hasLatin && (
                    <>
                      <span className="text-muted">⟵</span>
                      <span dir="rtl" className="font-bold text-ink">{p.ar}</span>
                    </>
                  )}
                </span>
              ))}
            </div>
            {/* نسخ/مشاركة اللوحات المتعرَّبة فقط (بدون الإنجليزي) */}
            <div className="mt-2 flex gap-2 border-t border-primary/20 pt-2">
              <button onClick={() => void copyPasteArabic()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-2 text-xs font-bold text-ink transition active:scale-95">
                {pasteArCopied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                {pasteArCopied ? "اتنسخت" : "نسخ العربي"}
              </button>
              <button onClick={() => void shareTextViaChooser(pasteArabicText, "مشاركة اللوحات")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-night transition active:scale-95">
                <Share2 size={14} /> مشاركة العربي
              </button>
            </div>
          </div>
        )}

        <button onClick={() => { if (!pasteBusy) void runPasteSort(); }} disabled={!pasteText.trim() || !dataTable || pasteBusy}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night disabled:opacity-50">
          <ListFilter size={16} /> {pasteBusy ? "جاري الفرز..." : "فرز"}
        </button>

        {!dataTable && <p className="text-xs text-alert">رفع «ملف الداتا» بالأعلى مطلوب أولاً.</p>}

        {pasteRan && pasteResults.length === 0 && (
          <p className="py-2 text-center text-sm text-muted">لا توجد تطابقات في ملف الداتا.</p>
        )}

        {pasteRan && pasteResults.length > 0 && (
          <>
            <h2 className="text-sm font-bold text-brand">نتيجة فرز لصق نصي</h2>
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
              </div>
            </div>

            <div ref={pastePinch} className="overflow-auto" style={{ maxHeight: "60vh", direction: "rtl", touchAction: "pan-x pan-y" }}>
              <div style={{ fontSize: `${ZOOM_LEVELS[pasteZoom] * 12}px`, minWidth: "max-content", width: "100%" }}>
                <table className="border-collapse w-full">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface-2 text-muted">
                      <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">☐</th>
                      <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">إجراءات</th>
                      <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                      {nearestActive && <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">المسافة</th>}
                      {pasteAllCols.map((col) => (
                        <th key={col} className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
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
                        {/* التحديد أول عمود (بيفتح شريط المشاركة الجماعية على واتساب) */}
                        <td className="border-l border-border px-2 py-1.5 text-center">
                          <button onClick={() => togglePasteSel(i)} className="text-muted hover:text-primary transition">
                            {pasteSelected.has(i) ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                          </button>
                        </td>
                        {/* ترقيم + نسخ/واتساب/حذف */}
                        <td className="border-l border-border px-2 py-1.5">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                            <button onClick={() => copyPasteRow(p, i)} title="نسخ" className="text-muted hover:text-primary transition">
                              {pasteCopiedIdx === i ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                            </button>
                            <button onClick={() => void shareTextViaChooser(pasteShareText(p))} title="واتساب" className="text-muted hover:text-primary transition">
                              <Share2 size={12} />
                            </button>
                            <button onClick={() => deletePasteResult(i)} title="حذف" className="text-muted hover:text-danger transition">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
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
                          const link = gpsCellToLink(v);
                          return (
                            <td key={col} className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                              {link ? (
                                <a href={labeledGpsLink(link, [p.row], p.converted)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">📍 خريطة</a>
                              ) : v.trim() ? (
                                <span className="text-ink">{v}</span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
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
                <div ref={pastePinch2} className="overflow-auto" style={{ maxHeight: "50vh", direction: "rtl", touchAction: "pan-x pan-y" }}>
                  <table className="border-collapse w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-surface-2 text-muted">
                        <th className="border-b border-l border-border px-2 py-1.5 text-center font-bold whitespace-nowrap">إجراءات</th>
                        <th className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                        {pasteRecordCols.map((col) => (
                          <th key={col} className="border-b border-l border-border px-3 py-1.5 text-right font-bold whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pasteRecordResults.map((p, i) => (
                        <tr key={i} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-surface-2/40"}`}>
                          {/* ترقيم + نسخ/واتساب — أول عمود */}
                          <td className="border-l border-border px-2 py-1.5">
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                              <button onClick={() => copyPasteRecordRow(p, i)} title="نسخ" className="text-muted hover:text-primary transition">
                                {pasteRecordCopiedIdx === i ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                              </button>
                              <button onClick={() => void shareTextViaChooser(withLocationLink(buildRowSummaryText(buildPasteRecordRowObject(p)), rawGpsOfPaste(p)))} title="واتساب" className="text-muted hover:text-primary transition">
                                <Share2 size={12} />
                              </button>
                            </div>
                          </td>
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
                            const link = gpsCellToLink(v); // ينظّف روابط الاتجاهات/&amp; ويحوّل الإحداثيات
                            return (
                              <td key={col} className="border-l border-border px-3 py-1.5 whitespace-nowrap">
                                {link ? (
                                  <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">📍 خريطة</a>
                                ) : v ? (
                                  <span className="text-ink">{v}</span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* مشاركة الفرز + مسح — لوحات سبق تشييكها */}
                <div className="flex flex-col gap-2 border-t border-brand/20 p-3">
                  <ShareSortButton title="لوحات سبق تشييكها"
                    rows={() => pasteRecordResults.map((p) => buildPasteRecordRowObject(p))} />
                  <button onClick={clearPasteRecordResults}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/5 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10">
                    <Trash2 size={15} /> مسح نتايج الفرز
                  </button>
                </div>
              </div>
            )}

        {pasteRan && pasteResults.length > 0 && (
          /* مشاركة الفرز + مسح — نتائج اللصق النصي */
          <>
            <ShareSortButton title="نتائج اللصق" rows={() => displayPaste.map((p) => buildPasteRowObject(p))} />
            <button onClick={clearPasteResults}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/5 py-2.5 text-sm font-bold text-danger transition hover:bg-danger/10">
              <Trash2 size={15} /> مسح نتايج الفرز
            </button>
          </>
        )}

        <LocationNeighborsModal view={neighborView} onClose={() => setNeighborView(null)} />

        {/* نافذة سجل السيارة — تواريخ الظهور + الإجراءات + تسجيل نتيجة */}
        {historyPlate && (() => {
          const row = matchedResults.find((r) => rowPlateNorm(r) === historyPlate);
          const dataRow = row?.dataRow;
          const locCol = dataTable ? detectLocationColumn(dataTable.headers) : null;
          const addrCol = dataTable?.headers.find((h) => /العنوان|عنوان|الشارع|شارع|address|street/i.test(h)) ?? null;
          const loc = [locCol ? dataRow?.[locCol] : "", addrCol ? dataRow?.[addrCol] : ""]
            .map((v) => String(v ?? "").trim()).filter(Boolean).join(" — ");
          // سطر وصف مختصر: أول ٣ أعمدة نتيجة فيها قيمة (بدون GPS/الروابط).
          const sub = row
            ? allResultCols
                .filter((rc) => !/gps|خريطة|موقع/i.test(rc.label))
                .map((rc) => String(cellValue(rc.source === "data" ? row.dataRow : row.referralRow, rc)).trim())
                .filter((v) => v && !gpsCellToLink(v))
                .slice(0, 3)
                .join(" · ")
            : undefined;
          // هل ظهرت في سجلات تشييكه (شافها بعينه)؟ من شيت السجلات لو محمّل.
          let seen: string | null = null;
          if (tashyeekTable && tashyeekPlateCol) {
            const hit = tashyeekTable.rows.find((tr) => normalizePlate(bankPlateToArabic(String(tr[tashyeekPlateCol] ?? ""))) === historyPlate);
            if (hit) {
              const dCol = tashyeekTable.headers.find((h) => /تاريخ|date/i.test(h));
              const raw = dCol ? String(hit[dCol] ?? "").trim() : "";
              seen = /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : (raw || todayStr());
            }
          }
          return (
            <PlateHistoryModal
              plate={historyPlate}
              entry={history.get(historyPlate) ?? null}
              today={todayStr()}
              subtitle={sub}
              location={loc || undefined}
              seenInChecks={seen}
              onSetStatus={(st) => { void applyPlateStatus(historyPlate, st); setHistoryPlate(null); }}
              onClose={() => setHistoryPlate(null)}
            />
          );
        })()}
      </div>
    </div>
  );
}

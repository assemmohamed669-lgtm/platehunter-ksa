"use client";

/**
 * 📄 «شهايد النهارده» — جملة خضرا بعدد الشهايد اللي نزلت + زرار الفرز عليها + نافذتين («في الداتا»
 * و«في السجلات» — فبيبان العربية جاية منين). نفس الميزة في مكانين:
 *  · صفحة المطلوب (`variant="sorting"`) — داتا صفحة الفرز كلها + السجلات.
 *  · تبويب «شهايد» لمشتركين الصوت فقط (`variant="team"`) — داتا المجموعة + السجلات.
 *
 * المالك (٦ أكتوبر ٢٠٢٦): «عايز يبقي فيه خيار افرز علي شهايد من امبارح من اول امبارح من يومين لمدة
 * اسبوع ... ويظهرلو كم شهاد نزلت اليوم دة ويقدر يفرز عليهم» ⇒ صف أيام (النهارده + ٧ قبله)، وكل يوم
 * بعدده ونتيجته. «وشهايد اليوم الحالي ... عايزها تتحدث تلقائي لانها ممكن تنزل اي وقت من اليوم» ⇒
 * العدد بيتحدّث كل دقيقة، والنتيجة بتتعاد لوحدها لما شهايد جديدة تتقري (واللي المندوب مسحه مايرجعش).
 *
 * المحرّك `lib/dailyCertSort.ts` · الداتا `lib/dailyCertSources.ts` · الأعمدة `lib/certColumns.ts`.
 * مين يشوفها بيقرّره اللي بيحطها (`DAILY_CERTS_FOR_ALL`).
 */
import { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Trash2, ChevronDown, Loader2 } from "lucide-react";
import WantedResultsTable, { type WantedRow } from "@/components/WantedResultsTable";
import ShareSortButton from "@/components/ShareSortButton";
import LocationNeighborsModal, { type NeighborsView } from "@/components/LocationNeighborsModal";
import { supabase } from "@/lib/supabaseClient";
import { CERT_DAYS_BACK, certDayLabel, certDayDate, dayMinus, riyadhDayStart, type DailyCertEntry } from "@/lib/certDaily";
import { runDailyCertSort, type CertDataSource } from "@/lib/dailyCertSort";
import { collectCertDataSources, type CertSourceDeps } from "@/lib/dailyCertSources";
import {
  CERT_DEFAULT_COLS, CERT_EXTRA_COLS, CERT_ACTION_COLS, DEFAULT_CERT_COL_PREFS, certDisplayCols, toggleCertCol,
  isCertColOn, loadCertColPrefs, saveCertColPrefs, certExportRow, type CertColPrefs,
} from "@/lib/certColumns";
import { getUploadedFile, getAllFieldCheckEntries, saveUploadedFile, type FieldCheckEntry } from "@/lib/idb";
import { getDataMeta, getSampleRows, iterateRows } from "@/lib/dataStore";
import { collapseDuplicateChecks } from "@/lib/fieldCheck";
import { getChassisRecords } from "@/lib/chassisRecords";
import { loadAllCheckSources, combinedCheckPlates } from "@/lib/checkSheets";
import { detectChassisColumn, normalizeChassis } from "@/lib/chassis";
import { fetchTeamDataState, downloadTeamData, TEAM_DATA_SLOT } from "@/lib/teamData";
import { detectLocationColumn, neighborsInSameLocation, neighborsFromStream, findIndexByPlate, sameDataRow } from "@/lib/locationNeighbors";
import { normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { buildColoredSortExcel } from "@/lib/excel";
import { playSortBeep } from "@/lib/sortBeep";
import { shareFileName } from "@/lib/shareNames";
import { buildDisplayRows } from "@/lib/exportColumns";

type Variant = "sorting" | "team";
type Row = Record<string, string>;
type Which = "dataRows" | "recordRows";

/** العدد بيتسأل كل دقيقة والصفحة قدام المندوب. */
export const CERT_POLL_MS = 60_000;
/** أقل وقت بين تحديثين تلقائيين للنتيجة (الفرز بيلف على الداتا كلها — مانتقّلش على الموبايل):
 *  كل سؤالين للعدد بالكتير، يعني النتيجة بتتحدّث في خلال دقيقتين من ما الشهادة تتقري. */
export const CERT_AUTO_RESORT_MS = 90_000;

// نتيجة كل يوم بتفضل ثابتة لو المندوب خرج ورجع أو بدّل اليوم. المصادر من غير صفوفها — «موقعها»
// بتعيد قراية الملف من الجهاز وقت الدوس، فالداتا مابتفضلش ماسكة الذاكرة (الآيفون).
interface DayResult {
  day: string;
  dataRows: WantedRow[];
  recordRows: WantedRow[];
  sources: CertDataSource[];
  plateCols: (string | null)[];
  /** عدد الشهايد المقروءة وقت الفرز — لو زاد ⇒ فيه جديد يتفرز. */
  parsedAt: number;
  sortedAt: number;
  /** اللي المندوب مسحه — مايرجعش مع التحديث التلقائي. */
  deleted: string[];
  /** آخر تحديث تلقائي: إمتى واتضاف كام عربية. */
  auto?: { at: string; added: number };
}
const cache: Partial<Record<Variant, Record<string, DayResult>>> = {};

const n = (x: number) => x.toLocaleString("en-US");

interface DailyResponse { day: string; today?: string; total?: number; parsed?: number; setup?: boolean; entries?: DailyCertEntry[] }

async function fetchDailyCerts(countOnly: boolean, offset: number): Promise<DailyResponse | null> {
  const { data: s } = await supabase.auth.getSession();
  const res = await fetch(`/api/certificate/daily?offset=${offset}${countOnly ? "&count=1" : ""}`, {
    headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` },
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as DailyResponse | null;
}

/** تاريخ تشييك المندوب بنفس شكل صفحة التشييك (يوم-شهر-سنة ساعة:دقيقة). */
function fmtCheckDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// كل لوحة مكررة بلون في الإكسيل والصورة (زي نوافذ المطلوب).
const DUPE_HEX = ["#FEF9C3", "#DBEAFE", "#DCFCE7", "#F3E8FF", "#FFEDD5", "#FCE7F3", "#CCFBF1", "#FEE2E2"];
function dupeHexColors(rows: WantedRow[]): (string | null)[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.norm, (counts.get(r.norm) ?? 0) + 1);
  const colorByNorm = new Map<string, string>();
  let ci = 0;
  for (const r of rows) {
    if ((counts.get(r.norm) ?? 0) > 1 && !colorByNorm.has(r.norm)) { colorByNorm.set(r.norm, DUPE_HEX[ci % DUPE_HEX.length]); ci++; }
  }
  return rows.map((r) => colorByNorm.get(r.norm) ?? null);
}

/** أعمدة نافذة «موقعها» جنب اللوحة (النوع والعنوان) — زي فرز المطلوب. */
function neighborDetailCols(headers: string[], plateCol: string, locCol: string | null): string[] {
  const t = headers.find((h) => /نوع|طراز/i.test(h)) ?? headers.find((h) => /ماركة|صانع|vehicle|model|make/i.test(h));
  const addr = headers.find((h) => /العنوان|عنوان|الشارع|شارع|address|street/i.test(h)) ?? locCol ?? undefined;
  return [...new Set([t, addr].filter((h): h is string => !!h && h !== plateCol))];
}

const sourceDeps: CertSourceDeps = {
  getUploadedFile: (agentId, slot) => getUploadedFile(agentId, slot),
  getDataMeta: (slot) => getDataMeta(slot),
  getSampleRows: (count, slot) => getSampleRows(count, slot),
  teamState: async () => {
    const s = await fetchTeamDataState();
    return { role: s.role, file: s.file ? { path: s.file.path, fileName: s.file.fileName, updatedAt: s.file.updatedAt } : null };
  },
  // نفس اللي تبويب «فرز» بتاع مشتركين الصوت بيعمله لما يلاقي نسخة أحدث.
  refreshTeamData: async (file) => {
    const blob = await downloadTeamData(file.path);
    if (!blob) return null;
    const f = new File([blob], file.fileName, { type: blob.type });
    const { parseExcelFile } = await import("@/lib/excel");
    const parsed = await parseExcelFile(f).catch(() => null);
    if (!parsed) return null;
    await saveUploadedFile({
      key: `local:${TEAM_DATA_SLOT}`, agentId: "local", slot: TEAM_DATA_SLOT,
      fileName: file.fileName, headers: parsed.headers, rows: parsed.rows, uploadedAt: file.updatedAt, fileBlob: f,
    });
    return { headers: parsed.headers, rows: parsed.rows };
  },
};

/** كام يوم بين `day` والنهارده. */
function offsetOf(day: string, today: string): number {
  return Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(day + "T00:00:00Z")) / 86_400_000);
}

export default function DailyCertSort({ variant }: { variant: Variant }) {
  // اليوم المختار: ٠ = النهارده … ٧ = قبل أسبوع. «النهارده» من السيرفر (ساعة الموبايل ممكن تبقى غلط).
  const [offset, setOffset] = useState(0);
  const [today, setToday] = useState<string>(() => riyadhDayStart(new Date()).day);
  const [daily, setDaily] = useState<{ day: string; total: number; parsed: number; setup?: boolean } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, DayResult>>(() => ({ ...(cache[variant] ?? {}) }));
  const [prefs, setPrefsState] = useState<CertColPrefs>(DEFAULT_CERT_COL_PREFS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [neighborView, setNeighborView] = useState<NeighborsView | null>(null);
  const [locating, setLocating] = useState(false);
  const cols = certDisplayCols(prefs);
  // للعدّاد اللي شغّال كل دقيقة (مايقراش حالة قديمة)
  const resultsRef = useRef(results);
  const busyRef = useRef(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const selDay = daily?.day ?? dayMinus(today, offset);
  const result: DayResult | undefined = results[selDay];
  const label = certDayLabel(offset);

  useEffect(() => { setPrefsState(loadCertColPrefs()); }, []);
  function setPrefs(p: CertColPrefs) { setPrefsState(p); saveCertColPrefs(p); }

  function keep(r: DayResult) {
    const next = { ...resultsRef.current, [r.day]: r };
    resultsRef.current = next;
    cache[variant] = next;
    setResults(next);
  }

  /** فرز يوم: بالزرار (بصوت ورسايل) أو لوحده لما تنزل شهايد جديدة (من غير إزعاج). */
  async function sortDay(off: number, silent: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!silent) { playSortBeep(); setSorting(true); setError(null); }
    try {
      const d = await fetchDailyCerts(false, off);
      if (!d) { if (!silent) setError("تعذّر جلب الشهايد — جرّب تاني."); return; }
      if (d.setup) { if (!silent) setError("الشهايد لسه محتاجة خطوة على سوبابيز."); return; }
      if (d.today) setToday(d.today);
      if (off === offsetRef.current) setDaily({ day: d.day, total: d.total ?? 0, parsed: d.parsed ?? 0 });
      const certs = d.entries ?? [];
      if (certs.length === 0) {
        if (!silent) {
          setError((d.total ?? 0) > 0 ? "لسه بنقرا الشهايد دي — جرّب كمان دقيقة." : off === 0 ? "لسه مانزلش شهايد النهارده." : "مفيش شهايد متسجّلة لليوم ده.");
        }
        return;
      }
      const [sources, fieldEntries, checkSources] = await Promise.all([
        collectCertDataSources(variant, sourceDeps),
        getAllFieldCheckEntries().catch(() => [] as FieldCheckEntry[]).then(collapseDuplicateChecks),
        loadAllCheckSources().catch(() => []),
      ]);
      // «مطلوبة» = اللوحة أو الشاص في أي ملف تشييك
      const checkPlates = combinedCheckPlates(checkSources);
      const checkVins = new Set<string>();
      for (const s of checkSources) {
        const col = detectChassisColumn(s.headers, s.rows);
        if (!col) continue;
        for (const row of s.rows) { const v = normalizeChassis(String(row[col] ?? "")); if (v) checkVins.add(v); }
      }
      const out = await runDailyCertSort({
        certs, sources, fieldEntries, chassisRecords: getChassisRecords(), checkPlates, checkVins, fmtDate: fmtCheckDate,
        iterate: (slot, onBatch) => iterateRows((rows, base) => onBatch(rows, base), { slot }),
      });
      const prev = resultsRef.current[d.day];
      const deleted = new Set(prev?.deleted ?? []);
      const dataRows = out.dataRows.filter((r) => !deleted.has(r.id));
      const recordRows = out.recordRows.filter((r) => !deleted.has(r.id));
      let auto: DayResult["auto"];
      if (silent && prev) {
        const had = new Set([...prev.dataRows, ...prev.recordRows].map((r) => r.id));
        auto = { at: fmtTime(new Date()), added: [...dataRows, ...recordRows].filter((r) => !had.has(r.id)).length };
      }
      keep({
        day: d.day, dataRows, recordRows, plateCols: out.plateCols,
        sources: sources.map((s) => (s.kind === "mem" ? { ...s, rows: [] } : s)),
        parsedAt: d.parsed ?? 0, sortedAt: Date.now(), deleted: [...deleted], auto: silent ? auto : undefined,
      });
    } catch (err) {
      if (!silent) setError(`تعذّر الفرز: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busyRef.current = false;
      if (!silent) setSorting(false);
    }
  }

  // عدد اليوم المختار بيتحدّث كل دقيقة والصفحة قدام المندوب — ولو نتيجته موجودة وفيه شهايد جديدة
  // اتقرت، النتيجة بتتعاد لوحدها.
  useEffect(() => {
    let stop = false;
    setDaily(null);
    const load = async () => {
      const d = await fetchDailyCerts(true, offset).catch(() => null);
      if (stop || !d || !d.day) return;
      if (d.today) setToday(d.today);
      setDaily({ day: d.day, total: d.total ?? 0, parsed: d.parsed ?? 0, setup: d.setup });
      const r = resultsRef.current[d.day];
      if (r && (d.parsed ?? 0) > r.parsedAt && Date.now() - r.sortedAt >= CERT_AUTO_RESORT_MS) void sortDay(offset, true);
    };
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, CERT_POLL_MS);
    return () => { stop = true; clearInterval(t); };
    // sortDay بتقرا الحالة من الـrefs — مش محتاجة تبقى في الاعتماديات
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  /** «موقعها في الداتا»: الصف نفسه في ملفه + ١٥ قبله و١٥ بعده — بعد ما نتأكد إنه هو هو. */
  async function locate(r: WantedRow) {
    const src = r.srcIdx != null ? result?.sources[r.srcIdx] : undefined;
    const plateCol = r.srcIdx != null ? result?.plateCols[r.srcIdx] : null;
    if (!src || !plateCol || r.dataIdx == null) { alert("مفيش بيانات موقع للعربية دي في ملف الداتا."); return; }
    setLocating(true);
    try {
      const locCol = detectLocationColumn(src.headers);
      const detailCols = neighborDetailCols(src.headers, plateCol, locCol);
      const plateOf = (row: Row | undefined) => (row ? normalizePlate(bankPlateToArabic(String(row[plateCol] ?? ""))) : "");
      let view: NeighborsView | null = null;
      if (src.kind === "mem") {
        const rows = src.ref ? (await getUploadedFile("local", src.ref).catch(() => null))?.rows ?? [] : [];
        let idx = r.dataIdx < rows.length && sameDataRow(rows[r.dataIdx], r.dataRow) ? r.dataIdx : -1;
        if (idx < 0 && r.dataRow) idx = rows.findIndex((row) => sameDataRow(row, r.dataRow));
        if (idx < 0) idx = rows.findIndex((row) => plateOf(row) === r.norm);
        if (idx >= 0) view = { ...neighborsInSameLocation(rows, idx, locCol), target: rows[idx], plateCol, detailCols };
      } else {
        const iterate = (onBatch: (rows: Row[], base: number) => void | Promise<void>) =>
          iterateRows((rows, base) => onBatch(rows, base), { slot: src.slot });
        let res = await neighborsFromStream(iterate, r.dataIdx, locCol);
        if (!res.target || (r.dataRow && !sameDataRow(res.target, r.dataRow))) {
          const idx = await findIndexByPlate(iterate, plateCol, r.norm);
          res = idx >= 0 ? await neighborsFromStream(iterate, idx, locCol) : { ctx: res.ctx, target: null };
        }
        if (res.target) view = { ...res.ctx, target: res.target, plateCol, detailCols };
      }
      if (!view) { alert("مالقيناش العربية دي في ملف الداتا. يمكن الملف اتغيّر بعد الفرز — افرز تاني."); return; }
      setNeighborView(view);
    } finally {
      setLocating(false);
    }
  }

  function deleteRows(which: Which, ids: string[]) {
    if (!result) return;
    const del = new Set(ids);
    keep({ ...result, [which]: result[which].filter((r) => !del.has(r.id)), deleted: [...new Set([...result.deleted, ...ids])] });
  }
  function clearWindow(which: Which) {
    if (!result) return;
    if (!window.confirm(`متأكد إنك عايز تمسح كل الـ ${result[which].length} لوحة من النافذة دي؟`)) return;
    keep({ ...result, [which]: [], deleted: [...new Set([...result.deleted, ...result[which].map((r) => r.id)])] });
  }

  function windowBlock(title: string, which: Which, onLocate?: (r: WantedRow) => void) {
    const rows = result?.[which] ?? [];
    // صفوف التصدير بنفس أعمدة الجدول (من غير الأزرار والأعمدة الفاضية)
    const exportRows = () => buildDisplayRows(rows.map((r) => certExportRow(r, cols))).rows;
    const imageTable = () => {
      const full = rows.map((r) => certExportRow(r, cols));
      // من غير GPS (الرابط مالوش لازمة في الصورة) ومن غير الأعمدة الفاضية
      const columns = ["رقم اللوحة", ...cols.filter((c) => !CERT_ACTION_COLS.has(c) && c !== "GPS" && full.some((f) => f[c]))];
      return { columns, rows: full.map((f) => columns.map((c) => f[c] ?? "")), rowColors: dupeHexColors(rows) };
    };
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" dir="rtl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-ink">{title}</span>
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand">{rows.length} لوحة</span>
        </div>
        <WantedResultsTable rows={rows} onDelete={(ids) => deleteRows(which, ids)} onLocate={onLocate} mode="certs" certCols={cols} />
        {rows.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <ShareSortButton
              title={title}
              fileName={shareFileName("wanted")}
              label="مشاركة النتيجة"
              rows={exportRows}
              excelBlob={async () => ({ blob: await buildColoredSortExcel(exportRows(), title, dupeHexColors(rows)), ext: "xlsx" })}
              imageTable={imageTable}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"
            />
            <button onClick={() => clearWindow(which)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/10 py-3 text-sm font-bold text-danger transition hover:bg-danger/20"><Trash2 size={15} /> مسح نتايج الفرز</button>
          </div>
        )}
      </div>
    );
  }

  const chip = (lbl: string, on: boolean, num?: number) => (
    <button key={lbl} onClick={() => setPrefs(toggleCertCol(prefs, lbl))}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ${on ? "bg-primary text-night font-bold" : "border border-border text-muted"}`}>
      {on && num != null && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px] font-black">{num}</span>}
      {lbl}
    </button>
  );

  // اسم يوم النتيجة (لو النهارده اتغيّر وهي مفتوحة — نص الليل — بيتحسب من جديد)
  const resultName = result ? certDayLabel(offsetOf(result.day, today)) : label;

  return (
    <>
      <div className="flex flex-col gap-2 rounded-2xl border border-green-600/40 bg-green-600/5 p-3" dir="rtl">
        {/* اليوم: النهارده أو أي يوم لحد أسبوع ورا */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {Array.from({ length: CERT_DAYS_BACK + 1 }, (_, i) => (
            <button key={i} onClick={() => { setOffset(i); setError(null); }}
              className={`flex shrink-0 flex-col items-center rounded-xl border px-3 py-1.5 transition ${i === offset ? "border-green-600 bg-green-600 text-white" : "border-border bg-surface text-muted hover:text-ink"}`}>
              <span className="whitespace-nowrap text-xs font-bold">{certDayLabel(i)}</span>
              <span className="whitespace-nowrap text-[10px]">{certDayDate(dayMinus(today, i))}</span>
            </button>
          ))}
        </div>

        {/* جملة خضرا بعدد اليوم المختار (بتتحدّث كل دقيقة) */}
        {daily?.setup ? (
          <p className="text-xs font-bold text-alert">الشهايد محتاجة خطوة واحدة على سوبابيز الأول.</p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm font-bold text-green-600">
            <FileText size={15} className="shrink-0" />
            {!daily
              ? "بنجيب عدد الشهايد…"
              : daily.total > 0
                ? (offset === 0
                    ? <>النهارده نزل {n(daily.total)} شهادة جديدة — هيتم الفرز عليها</>
                    : <>{label} ({certDayDate(daily.day)}) نزل {n(daily.total)} شهادة — هيتم الفرز عليها</>)
                : (offset === 0 ? "لسه مانزلش شهايد النهارده" : `مفيش شهايد متسجّلة يوم ${certDayDate(daily.day)} لسه`)}
          </p>
        )}
        {daily && !daily.setup && daily.total > daily.parsed && (
          <p className="text-[11px] text-muted">بيتقرا منهم {n(daily.total - daily.parsed)} دلوقتي — اللي بيخلص بيدخل الفرز.</p>
        )}
        <button onClick={() => void sortDay(offset, false)} disabled={sorting}
          className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50 active:scale-[0.99]">
          {sorting ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
          {sorting ? "جاري الفرز..." : `افرز على شهايد ${label}`}
        </button>
        {result && offset === 0 && (
          <p className="text-[11px] text-muted">
            🔄 بيتحدّث لوحده لما تنزل شهايد جديدة
            {result.auto ? ` — آخر تحديث ${result.auto.at}${result.auto.added > 0 ? ` واتضاف ${n(result.auto.added)} عربية` : ""}` : ""}
          </p>
        )}
        {error && <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-center text-xs text-danger">{error}</p>}
      </div>

      {result && (
        <>
          {/* أعمدة النتيجة: ترتيب المالك ثابت، والمندوب يخفي/يظهر بإيده */}
          <div className="rounded-2xl border border-border bg-surface" dir="rtl">
            <button onClick={() => setPickerOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-ink">
              <span>أعمدة نتيجة الشهايد ({cols.length + 1})</span>
              <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${pickerOpen ? "rotate-180" : ""}`} />
            </button>
            {pickerOpen && (
              <div className="space-y-2.5 border-t border-border px-3 pb-3 pt-2">
                <p className="text-[11px] text-muted">📌 رقم اللوحة ثابت في الأول. دوس على أي عمود تخفيه، ودوس تاني يرجع مكانه.</p>
                <div className="flex flex-wrap gap-2">{CERT_DEFAULT_COLS.map((lbl) => chip(lbl, isCertColOn(prefs, lbl)))}</div>
                <p className="text-[11px] text-muted">أعمدة زيادة — بتظهر في الآخر بالترتيب اللي بتدوس بيه:</p>
                <div className="flex flex-wrap gap-2">
                  {CERT_EXTRA_COLS.map((lbl) => { const i = prefs.extras.indexOf(lbl); return chip(lbl, i >= 0, i + 1); })}
                </div>
                <button onClick={() => setPrefs(DEFAULT_CERT_COL_PREFS)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-muted transition hover:text-ink">
                  رجّع الأعمدة الأساسية
                </button>
              </div>
            )}
          </div>
          {locating && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted" dir="rtl"><Loader2 size={13} className="animate-spin" /> بندوّر على موقعها في ملف الداتا…</p>
          )}
          {windowBlock(`شهايد ${resultName} في الداتا`, "dataRows", locate)}
          {windowBlock(`شهايد ${resultName} في السجلات`, "recordRows")}
        </>
      )}
      <LocationNeighborsModal view={neighborView} onClose={() => setNeighborView(null)} />
    </>
  );
}

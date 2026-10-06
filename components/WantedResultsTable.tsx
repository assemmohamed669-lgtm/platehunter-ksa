"use client";

/**
 * جدول نتيجة «المطلوب» — أعمدة ثابتة (رقم اللوحة/نوع/ماركة/بنك-شركة/شارع/حي/ملاحظات/GPS)،
 * بترتيب الداتا (مش بيعيد الترتيب إلا لو فعّلت «الأقرب»)، وبيلوّن كل لوحة **مكررة**
 * بلون مختلف عن غيرها عشان تبان تحت بعضها. فيه زوم + تحديد الكل + نسخ/مشاركة/حذف
 * لكل لوحة + حذف جماعي.
 */
import { useMemo, useState } from "react";
import { Copy, Check, Share2, Trash2, MapPin, Navigation, CheckSquare, Square, FileText, Loader2 } from "lucide-react";
import ZoomControl, { zoomFontPx } from "@/components/ZoomControl";
import { usePinchZoom } from "@/components/usePinchZoom";
import { gpsService, haversineKm, formatDistanceKm } from "@/lib/gps";
import { shareTextViaChooser } from "@/lib/share";
import { orderedLabels, type OrderMode } from "@/lib/columnOrder";
import { CERT_DEFAULT_COLS, certCellValue, certShareText } from "@/lib/certColumns";
import CertCell from "@/components/CertCell";
import { useCertsEnabled, useCertStates, retryCertificate } from "@/lib/certificateBatch";

// أعمدة بيانات المطلوب: label → قيمة الصف. الترتيب الأساسي لو المندوب ماختارش
// ترتيب. رقم اللوحة (ثابت أول عمود) وموقعها (عمود إجراء آخر) مش هنا.
const WANTED_FIELD_GET: Record<string, (r: WantedRow) => string> = {
  "نوع السيارة": (r) => r.type,
  "العنوان": (r) => r.address,
  "الحي": (r) => r.district ?? "",
  "الماركة": (r) => r.brand,
  "البنك": (r) => r.bank ?? "",
  "GPS": (r) => r.mapsLink,
  "اللون": (r) => r.color,
  "سنة الصنع": (r) => r.year,
  "تاريخ التسجيل": (r) => r.date,
};
const WANTED_FIELD_ORDER = ["نوع السيارة", "العنوان", "الحي", "الماركة", "البنك", "GPS", "اللون", "سنة الصنع", "تاريخ التسجيل"];

/** أعمدة بيانات المطلوب المعروضة: أساسي = كلها زي البرنامج؛ مخصّص = الثابت +
 *  اختيار المندوب. المتاح (اللي فيه بيانات) بس. */
export function wantedDataCols(rows: WantedRow[], colOrder: string[], mode: OrderMode = "custom"): string[] {
  const available = WANTED_FIELD_ORDER.filter((l) => rows.some((r) => String(WANTED_FIELD_GET[l](r) ?? "").trim()));
  return mode === "basic" ? available : orderedLabels(available, colOrder);
}

// الأعمدة الثابتة المطلوبة: رقم اللوحة › نوع السيارة › الماركة › العنوان › GPS ›
// اللون › سنة الصنع › تاريخ التسجيل. تتحدّد بالاسم أو بالمحتوى في wanted/page.tsx.
export interface WantedRow {
  id: string;
  plate: string;
  norm: string;      // مطبّعة — للتجميع/التلوين
  type: string;      // نوع السيارة
  brand: string;     // الماركة
  bank?: string;     // البنك/الجهة المالكة (من شيت التشييك) — يظهر لو موجود
  address: string;   // العنوان (شارع)
  district?: string; // الحي (من شيت الداتا/السجلات) — يظهر لو موجود
  color: string;     // اللون
  year: string;      // سنة الصنع
  date: string;      // تاريخ التسجيل
  mapsLink: string;  // GPS
  lat?: number;
  lng?: number;
  dataIdx?: number;  // موضع الصف في ملف الداتا المرتّب — لعرض «موقعها» (الجيران)
  // 📄 «شهايد النهارده» بس:
  vehicleModel?: string;   // نوع المركبة (راف فور/توسان…) — من الشهادة
  srcIdx?: number;         // أنهي ملف داتا (لـ«موقعها» — الموضع جوّه الملف ده)
  dataRow?: Record<string, string>;   // الصف نفسه — «موقعها» بتتأكد إنها على نفس العربية
  vin?: string;            // الشاص (من الشهادة)
  contract?: string;       // حالة العقد (متعثر/نشط …)
  certDate?: string;       // تاريخ الشهادة
  certFile?: { id: string; name: string };
  certNo?: string;         // رقم العقد المسجل — بيظهر بالأزرق بدل كلمة «شهادة»
  certLink?: string;       // 🔗 لينك الشهادة اللي بيتنسخ/يتبعت على واتساب
  wantedStatus?: "مطلوبة" | "تثبيت";   // في شيت التشييك ولا لأ
}

// ألوان تمييز اللوحات المكررة — كل مجموعة لون مختلف، تشتغل على الفاتح والغامق.
const DUP_COLORS = [
  "rgba(239,68,68,0.16)", "rgba(59,130,246,0.16)", "rgba(16,185,129,0.16)",
  "rgba(234,179,8,0.18)", "rgba(168,85,247,0.16)", "rgba(236,72,153,0.16)",
  "rgba(20,184,166,0.16)", "rgba(249,115,22,0.17)",
];

function rowText(r: WantedRow): string {
  const lines = [`🚗 ${r.plate}`];
  // الترتيب: اللوحة › نوع السيارة › اسم الموقع (عنوان/حي) › باقي البيانات
  if (r.type) lines.push(`نوع السيارة: ${r.type}`);
  if (r.address) lines.push(`العنوان: ${r.address}`);
  if (r.district) lines.push(`الحي: ${r.district}`);
  if (r.brand) lines.push(`الماركة: ${r.brand}`);
  if (r.bank) lines.push(`البنك: ${r.bank}`);
  if (r.color) lines.push(`اللون: ${r.color}`);
  if (r.year) lines.push(`سنة الصنع: ${r.year}`);
  if (r.date) lines.push(`تاريخ التسجيل: ${r.date}`);
  if (r.mapsLink) lines.push(`📍 ${r.mapsLink}`);
  return lines.join("\n");
}

// أعمدة الشهايد اللي محتواها في النص (أزرار/حالة)
const CERT_CENTER: ReadonlySet<string> = new Set(["موقعها في الداتا", "الشهادة", "الحالة"]);

/**
 * رقم الشهادة (رقم العقد المسجل) بالأزرق — ولو مالهاش رقم «شهادة» — الدوس بيحمّل الملف ويفتحه زي خانة
 * «شهايد» (المالك ٦ أكتوبر ٢٠٢٦: «بدل كلمه شهادة عايز رقم كل شهادة … والمندوب يدوس عليها تفتح»).
 */
function CertOpen({ file, label }: { file: { id: string; name: string }; label?: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const { fetchCertBlob, openCertBlob } = await import("@/lib/certificate");
      const blob = await fetchCertBlob(file.id);
      if (blob) await openCertBlob(blob, file.name);
      else alert("تعذّر تحميل الشهادة.");
    } catch {
      alert("تعذّر فتح الشهادة.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button onClick={() => void open()} disabled={busy} title={file.name}
      className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-primary underline disabled:opacity-50">
      {busy ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
      <span dir="ltr">{label || "شهادة"}</span>
    </button>
  );
}

export default function WantedResultsTable({
  rows,
  onDelete,
  onLocate,
  colOrder = [],
  orderMode = "custom",
  mode = "wanted",
  certCols = [...CERT_DEFAULT_COLS],
}: {
  rows: WantedRow[];
  onDelete: (ids: string[]) => void;
  onLocate?: (r: WantedRow) => void;
  colOrder?: string[];
  orderMode?: OrderMode;
  /** «certs» = جدول «شهايد النهارده» (بيانات الشهادة + زرار الشهادة + الحالة). */
  mode?: "wanted" | "certs";
  /** أعمدة جدول الشهايد بالترتيب (`lib/certColumns.ts`) — رقم اللوحة ثابت قبلهم. */
  certCols?: string[];
}) {
  const certMode = mode === "certs";
  // أعمدة البيانات المعروضة (حسب الوضع). رقم اللوحة ثابت أول عمود وموقعها عمود
  // إجراء آخر — الاتنين برّه الترتيب.
  const dataCols = useMemo(
    () => (certMode ? [] : wantedDataCols(rows, colOrder, orderMode)),
    [rows, colOrder, orderMode, certMode],
  );
  // 📄 عمود «شهايد» (المالك ٤ أكتوبر ٢٠٢٦) — كل لوحات الجدول بتتسأل مرة واحدة في درايف
  // (`lib/certificateBatch.ts`). السوبر أدمن الأول. (جدول «شهايد النهارده» الشهادة معروفة أصلاً.)
  const certsOn = useCertsEnabled() && !certMode;
  const certPlates = useMemo(() => (certsOn ? rows.map((r) => r.plate) : []), [certsOn, rows]);
  const certOf = useCertStates(certPlates, certsOn);
  const [zoom, setZoom] = useState(3);
  const pinchRef = usePinchZoom(zoom, setZoom);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nearest, setNearest] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  // لون لكل لوحة متكررة (>1) — بترتيب أول ظهور.
  const colorByNorm = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.norm, (counts.get(r.norm) ?? 0) + 1);
    const m = new Map<string, string>();
    let ci = 0;
    for (const r of rows) {
      if ((counts.get(r.norm) ?? 0) > 1 && !m.has(r.norm)) { m.set(r.norm, DUP_COLORS[ci % DUP_COLORS.length]); ci++; }
    }
    return m;
  }, [rows]);

  // الافتراضي = ترتيب الداتا؛ «الأقرب» بيعيد الترتيب بالمسافة بس.
  const ordered = useMemo(() => {
    if (!nearest || !userLoc) return rows;
    const dist = (r: WantedRow) => (r.lat != null && r.lng != null ? haversineKm(userLoc.lat, userLoc.lng, r.lat, r.lng) : Infinity);
    return [...rows].sort((a, b) => dist(a) - dist(b));
  }, [rows, nearest, userLoc]);

  // مسافة الصف عن موقع المندوب (كم) — بتظهر في عمود «المسافة» والمشاركة لما «الأقرب» مفعّل.
  const showDist = nearest && !!userLoc;
  const distOf = (r: WantedRow): number =>
    showDist && r.lat != null && r.lng != null && userLoc
      ? haversineKm(userLoc.lat, userLoc.lng, r.lat, r.lng) : Infinity;
  const distText = (r: WantedRow): string => {
    const d = distOf(r);
    return Number.isFinite(d) ? formatDistanceKm(d) : "—";
  };
  // نص المشاركة + سطر المسافة لو «الأقرب» مفعّل.
  const rowShareText = (r: WantedRow): string => {
    const base = certMode ? certShareText(r, certCols) : rowText(r);
    return showDist && Number.isFinite(distOf(r)) ? `${base}\nالمسافة: ${distText(r)}` : base;
  };

  async function toggleNearest() {
    if (nearest) { setNearest(false); return; }
    setLocating(true);
    try {
      const warm = gpsService.getLastCoords();
      let loc: { lat: number; lng: number } | null = warm ? { lat: warm.lat, lng: warm.lng } : null;
      if (!loc) {
        // 🔴 نفس سبب `RecordingsTable`: النداء المباشر بيطلّع رسالة إذن الموقع
        //    للموقع الإلكتروني جوّه التطبيق.
        const fx = await gpsService.getFreshFix({ timeoutMs: 10000 }).catch(() => null);
        loc = fx ? { lat: fx.lat, lng: fx.lng } : null;
      }
      if (!loc) { alert("تعذّر تحديد موقعك — تأكد من إذن الـ GPS."); return; }
      setUserLoc(loc); setNearest(true);
    } finally { setLocating(false); }
  }

  function toggleSel(id: string) { setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setSelected((p) => (p.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))); }
  async function copyRow(r: WantedRow) { try { await navigator.clipboard.writeText(rowShareText(r)); setCopiedId(r.id); setTimeout(() => setCopiedId(null), 1200); } catch { /* no clipboard */ } }
  function shareRow(r: WantedRow) { void shareTextViaChooser(rowShareText(r)); }
  function selectedText(): string | null {
    const rs = rows.filter((r) => selected.has(r.id));
    if (!rs.length) return null;
    return `*لوحات (${rs.length})*\n\n` + rs.map((r, i) => `${i + 1}. ${rowShareText(r)}`).join("\n\n──────────\n\n");
  }
  function shareSelected() {
    const text = selectedText();
    if (text) void shareTextViaChooser(text);
  }
  // 📋 نسخ المحدد — يتلزق في واتساب مكتوب ومعاه لينك كل شهادة (الشهايد — المالك ٦ أكتوبر ٢٠٢٦)
  const [copiedSel, setCopiedSel] = useState(false);
  async function copySelected() {
    const text = selectedText();
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopiedSel(true); setTimeout(() => setCopiedSel(false), 1500); }
    catch { alert("تعذّر النسخ — جرّب «واتساب»."); }
  }

  if (rows.length === 0) return <p className="py-4 text-center text-xs text-muted">مفيش نتايج.</p>;

  const allSel = selected.size === rows.length;
  const showLocate = !!onLocate && !certMode; // عمود «موقعها» يظهر لنافذة الداتا بس (الجيران متاحين) — الشهايد ليها عمودها في ترتيبها
  const px = zoomFontPx(zoom);
  const TH = "border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap";
  const TD = "border-l border-border px-3 py-2 whitespace-nowrap text-ink";

  return (
    <div className="flex flex-col gap-2">
      {/* «تحديد الكل» على اليمين والزوم على الشمال (بطلب المستخدم) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button onClick={toggleAll} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
            {allSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />} {allSel ? "إلغاء الكل" : "تحديد الكل"}
          </button>
          <button onClick={toggleNearest} disabled={locating}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition ${nearest ? "bg-primary text-night font-bold" : "border border-border bg-surface-2 text-muted hover:text-primary"}`}>
            <Navigation size={13} /> {locating ? "..." : "الأقرب"}
          </button>
        </div>
        <ZoomControl zoom={zoom} setZoom={setZoom} />
      </div>

      <div ref={pinchRef} className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh", touchAction: "pan-x pan-y" }}>
        <table className="border-collapse w-full" style={{ direction: "rtl", fontSize: `${px}px`, minWidth: "max-content" }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-2 text-muted">
              {/* التحديد (للمشاركة الجماعية) أول عمود، وبعده الترقيم + نسخ/واتساب/حذف — في الشهايد المربع جنب
                  اللوحة نفسها («حط مربع قدام كل لوحه»). */}
              {!certMode && <th className="border-b border-l border-border px-2 py-2 text-center font-bold">☐</th>}
              <th className="border-b border-l border-border px-2 py-2 text-center font-bold whitespace-nowrap">إجراءات</th>
              <th className={TH}>رقم اللوحة</th>
              {dataCols.map((label) => <th key={label} className={TH}>{label}</th>)}
              {/* «شهايد النهارده»: ترتيب المالك (أو اللي المندوب ظهّره/خبّاه) */}
              {certMode && certCols.map((label) => (
                <th key={label} className={CERT_CENTER.has(label) ? "border-b border-l border-border px-3 py-2 text-center font-bold whitespace-nowrap" : TH}>{label}</th>
              ))}
              {/* عمود «المسافة» يظهر بس لما «الأقرب» مفعّل */}
              {showDist && <th className={TH}>المسافة</th>}
              {/* آخر الويندو بعد التاريخ بطلب المستخدم */}
              {showLocate && <th className="border-b border-border px-2 py-2 text-center font-bold whitespace-nowrap">موقعها في الداتا</th>}
              {certsOn && <th className="border-b border-r border-border px-3 py-2 text-center font-bold whitespace-nowrap">شهايد</th>}
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => {
              const sel = selected.has(r.id);
              const dup = colorByNorm.get(r.norm);
              const bg = sel ? "rgba(107,163,232,0.22)" : dup ?? (i % 2 === 0 ? "transparent" : "rgba(127,127,127,0.06)");
              return (
                <tr key={r.id} className="border-b border-border" style={{ backgroundColor: bg }}>
                  {/* التحديد أول عمود (بيفتح شريط المشاركة الجماعية على واتساب) */}
                  {!certMode && (
                    <td className="border-l border-border px-2 py-2 text-center">
                      <button onClick={() => toggleSel(r.id)} className="text-muted hover:text-primary transition">
                        {sel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                      </button>
                    </td>
                  )}
                  {/* ترقيم + نسخ/واتساب/حذف */}
                  <td className="border-l border-border px-2 py-2">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-muted">{i + 1}</span>
                      <button onClick={() => copyRow(r)} className="text-muted hover:text-primary transition" title="نسخ">
                        {copiedId === r.id ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                      </button>
                      <button onClick={() => shareRow(r)} className="text-muted hover:text-primary transition" title="واتساب"><Share2 size={13} /></button>
                      <button onClick={() => onDelete([r.id])} className="text-muted hover:text-danger transition" title="حذف"><Trash2 size={13} /></button>
                    </div>
                  </td>
                  {certMode ? (
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-ink">
                      <span className="inline-flex items-center gap-2">
                        <button onClick={() => toggleSel(r.id)} title="علّم اللوحة دي" className="text-muted hover:text-primary transition">
                          {sel ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                        </button>
                        {r.plate}
                      </span>
                    </td>
                  ) : (
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-ink">{r.plate}</td>
                  )}
                  {dataCols.map((label) =>
                    label === "GPS" ? (
                      <td key={label} className="border-l border-border px-3 py-2">
                        {r.mapsLink
                          ? <a href={r.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline whitespace-nowrap"><MapPin size={10} /> خريطة</a>
                          : "—"}
                      </td>
                    ) : (
                      <td key={label} className={TD}>{WANTED_FIELD_GET[label](r) || "—"}</td>
                    )
                  )}
                  {certMode && certCols.map((label) => {
                    if (label === "GPS") {
                      return (
                        <td key={label} className="border-l border-border px-3 py-2">
                          {r.mapsLink
                            ? <a href={r.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline whitespace-nowrap"><MapPin size={10} /> خريطة</a>
                            : "—"}
                        </td>
                      );
                    }
                    if (label === "موقعها في الداتا") {
                      return (
                        <td key={label} className="border-l border-border px-2 py-2 text-center">
                          {onLocate && r.dataIdx != null ? (
                            <button onClick={() => onLocate(r)} title="شوف موقعها بين الجيران في ملف الداتا"
                              className="inline-flex items-center gap-0.5 rounded-lg bg-brand/15 px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand/25 transition">
                              <MapPin size={12} /> موقعها
                            </button>
                          ) : "—"}
                        </td>
                      );
                    }
                    if (label === "الشهادة") {
                      return (
                        <td key={label} className="border-l border-border px-3 py-2 text-center whitespace-nowrap">
                          {r.certFile ? <CertOpen file={r.certFile} label={r.certNo} /> : "—"}
                        </td>
                      );
                    }
                    if (label === "الحالة") {
                      // مطلوبة (في شيت التشييك) بالأحمر / تثبيت
                      return (
                        <td key={label} className={`border-l border-border px-3 py-2 text-center whitespace-nowrap font-bold ${r.wantedStatus === "مطلوبة" ? "text-danger" : "text-muted"}`}>
                          {r.wantedStatus ?? "—"}
                        </td>
                      );
                    }
                    return <td key={label} className={TD}>{certCellValue(r, label) || "—"}</td>;
                  })}
                  {showDist && (
                    <td className="border-l border-border px-3 py-2 font-bold text-primary whitespace-nowrap">{distText(r)}</td>
                  )}
                  {/* آخر الويندو: موقعها في الداتا */}
                  {showLocate && (
                    <td className="px-2 py-2 text-center">
                      {r.dataIdx != null ? (
                        <button onClick={() => onLocate!(r)} title="شوف موقعها بين الجيران في نفس الشارع"
                          className="inline-flex items-center gap-0.5 rounded-lg bg-brand/15 px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand/25 transition">
                          <MapPin size={12} /> موقعها
                        </button>
                      ) : "—"}
                    </td>
                  )}
                  {certsOn && (
                    <td className="border-r border-border px-3 py-2 text-center whitespace-nowrap">
                      <CertCell state={certOf(r.plate)} onRetry={() => retryCertificate(r.plate)} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <span className="text-xs font-bold text-ink">{selected.size} محددة</span>
          <div className="flex gap-2">
            {certMode && (
              <button onClick={() => void copySelected()} className="flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20">
                {copiedSel ? <Check size={13} /> : <Copy size={13} />} {copiedSel ? "اتنسخ" : "نسخ"}
              </button>
            )}
            <button onClick={shareSelected} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90"><Share2 size={13} /> واتساب</button>
            <button onClick={() => { onDelete(Array.from(selected)); setSelected(new Set()); }} className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20"><Trash2 size={13} /> مسح</button>
          </div>
        </div>
      )}
    </div>
  );
}

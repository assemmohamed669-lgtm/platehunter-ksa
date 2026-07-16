"use client";

/**
 * جدول نتيجة «المطلوب» — أعمدة ثابتة (رقم اللوحة/نوع/ماركة/بنك-شركة/شارع/حي/ملاحظات/GPS)،
 * بترتيب الداتا (مش بيعيد الترتيب إلا لو فعّلت «الأقرب»)، وبيلوّن كل لوحة **مكررة**
 * بلون مختلف عن غيرها عشان تبان تحت بعضها. فيه زوم + تحديد الكل + نسخ/مشاركة/حذف
 * لكل لوحة + حذف جماعي.
 */
import { useMemo, useState } from "react";
import { Copy, Check, Share2, Trash2, MapPin, Navigation, CheckSquare, Square } from "lucide-react";
import ZoomControl, { zoomFontPx } from "@/components/ZoomControl";
import { gpsService, haversineKm } from "@/lib/gps";

export interface WantedRow {
  id: string;
  plate: string;
  norm: string;      // مطبّعة — للتجميع/التلوين
  type: string;      // نوع السيارة
  brand: string;     // الماركة (من التشييك)
  bank: string;      // البنك/الشركة (من التشييك)
  street: string;
  district: string;
  notes: string;
  mapsLink: string;
  lat?: number;
  lng?: number;
}

// ألوان تمييز اللوحات المكررة — كل مجموعة لون مختلف، تشتغل على الفاتح والغامق.
const DUP_COLORS = [
  "rgba(239,68,68,0.16)", "rgba(59,130,246,0.16)", "rgba(16,185,129,0.16)",
  "rgba(234,179,8,0.18)", "rgba(168,85,247,0.16)", "rgba(236,72,153,0.16)",
  "rgba(20,184,166,0.16)", "rgba(249,115,22,0.17)",
];

function rowText(r: WantedRow): string {
  const lines = [`🚗 ${r.plate}`];
  if (r.type) lines.push(`النوع: ${r.type}`);
  if (r.brand) lines.push(`الماركة: ${r.brand}`);
  if (r.bank) lines.push(`البنك/الشركة: ${r.bank}`);
  if (r.street) lines.push(`الشارع: ${r.street}`);
  if (r.district) lines.push(`الحي: ${r.district}`);
  if (r.notes) lines.push(`ملاحظات: ${r.notes}`);
  if (r.mapsLink) lines.push(`📍 ${r.mapsLink}`);
  return lines.join("\n");
}

export default function WantedResultsTable({
  rows,
  onDelete,
}: {
  rows: WantedRow[];
  onDelete: (ids: string[]) => void;
}) {
  const [zoom, setZoom] = useState(3);
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

  async function toggleNearest() {
    if (nearest) { setNearest(false); return; }
    setLocating(true);
    try {
      const warm = gpsService.getLastCoords();
      let loc: { lat: number; lng: number } | null = warm ? { lat: warm.lat, lng: warm.lng } : null;
      if (!loc && navigator.geolocation) {
        loc = await new Promise((res) => navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => res(null), { timeout: 10000, maximumAge: 60000 }));
      }
      if (!loc) { alert("تعذّر تحديد موقعك — تأكد من إذن الـ GPS."); return; }
      setUserLoc(loc); setNearest(true);
    } finally { setLocating(false); }
  }

  function toggleSel(id: string) { setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setSelected((p) => (p.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))); }
  async function copyRow(r: WantedRow) { try { await navigator.clipboard.writeText(rowText(r)); setCopiedId(r.id); setTimeout(() => setCopiedId(null), 1200); } catch { /* no clipboard */ } }
  function shareRow(r: WantedRow) { window.open(`https://wa.me/?text=${encodeURIComponent(rowText(r))}`, "_blank"); }
  function shareSelected() {
    const rs = rows.filter((r) => selected.has(r.id));
    if (!rs.length) return;
    const text = `*لوحات (${rs.length})*\n\n` + rs.map((r, i) => `${i + 1}. ${rowText(r)}`).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  if (rows.length === 0) return <p className="py-4 text-center text-xs text-muted">مفيش نتايج.</p>;

  const allSel = selected.size === rows.length;
  const px = zoomFontPx(zoom);
  const TH = "border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap";
  const TD = "border-l border-border px-3 py-2 whitespace-nowrap text-ink";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <ZoomControl zoom={zoom} setZoom={setZoom} />
        <div className="flex items-center gap-1.5">
          <button onClick={toggleNearest} disabled={locating}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition ${nearest ? "bg-primary text-night font-bold" : "border border-border bg-surface-2 text-muted hover:text-primary"}`}>
            <Navigation size={13} /> {locating ? "..." : "الأقرب"}
          </button>
          <button onClick={toggleAll} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
            {allSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />} {allSel ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: "55vh" }}>
        <table className="border-collapse w-full" style={{ direction: "rtl", fontSize: `${px}px`, minWidth: "max-content" }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-2 text-muted">
              <th className="border-b border-l border-border px-2 py-2 text-center font-bold">☐</th>
              <th className={TH}>رقم اللوحة</th>
              <th className={TH}>نوع السيارة</th>
              <th className={TH}>الماركة</th>
              <th className={TH}>البنك/الشركة</th>
              <th className={TH}>الشارع</th>
              <th className={TH}>الحي</th>
              <th className={TH}>ملاحظات</th>
              <th className={TH}>GPS</th>
              <th className="border-b border-border px-2 py-2 text-center font-bold">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => {
              const sel = selected.has(r.id);
              const dup = colorByNorm.get(r.norm);
              const bg = sel ? "rgba(107,163,232,0.22)" : dup ?? (i % 2 === 0 ? "transparent" : "rgba(127,127,127,0.06)");
              return (
                <tr key={r.id} className="border-b border-border" style={{ backgroundColor: bg }}>
                  <td className="border-l border-border px-2 py-2 text-center">
                    <button onClick={() => toggleSel(r.id)} className="text-muted hover:text-primary transition">
                      {sel ? <CheckSquare size={14} className="text-primary" /> : <Square size={14} />}
                    </button>
                  </td>
                  <td className="border-l border-border px-3 py-2 whitespace-nowrap font-bold text-ink">{r.plate}</td>
                  <td className={TD}>{r.type || "—"}</td>
                  <td className={TD}>{r.brand || "—"}</td>
                  <td className={TD}>{r.bank || "—"}</td>
                  <td className={TD}>{r.street || "—"}</td>
                  <td className={TD}>{r.district || "—"}</td>
                  <td className={TD}>{r.notes || "—"}</td>
                  <td className="border-l border-border px-3 py-2">
                    {r.mapsLink ? (
                      <a href={r.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline whitespace-nowrap"><MapPin size={10} /> خريطة</a>
                    ) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => copyRow(r)} className="text-muted hover:text-primary transition" title="نسخ">
                        {copiedId === r.id ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
                      </button>
                      <button onClick={() => shareRow(r)} className="text-muted hover:text-primary transition" title="واتساب"><Share2 size={13} /></button>
                      <button onClick={() => onDelete([r.id])} className="text-muted hover:text-danger transition" title="حذف"><Trash2 size={13} /></button>
                    </div>
                  </td>
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
            <button onClick={shareSelected} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90"><Share2 size={13} /> واتساب</button>
            <button onClick={() => { onDelete(Array.from(selected)); setSelected(new Set()); }} className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20"><Trash2 size={13} /> مسح</button>
          </div>
        </div>
      )}
    </div>
  );
}

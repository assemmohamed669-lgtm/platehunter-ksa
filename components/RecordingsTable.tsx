"use client";

import { useState, useMemo } from "react";
import {
  Trash2,
  Share2,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  MapPin,
  CheckCircle2,
  Clock,
  CheckSquare,
  Square,
  Pencil,
  AlertTriangle,
  Play,
  Pause,
  Navigation,
} from "lucide-react";
import type { RecordingEntry } from "@/lib/idb";
import { findDuplicates, normalizePlate } from "@/lib/plateParser";
import { haversineKm, gpsService } from "@/lib/gps";
import PlateImagesButton from "@/components/PlateImagesButton";
import type { PlateImageRow } from "@/lib/plateImage";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

function rowToText(entry: RecordingEntry): string {
  const lines: string[] = [];
  if (entry.plate)        lines.push(`🚗 رقم اللوحة: ${entry.plate}`);
  if (entry.vehicleType)  lines.push(`نوع السيارة: ${entry.vehicleType}`);
  if (entry.street)       lines.push(`الشارع: ${entry.street}`);
  if (entry.district)     lines.push(`الحي: ${entry.district}`);
  if (entry.notes)        lines.push(`ملاحظات: ${entry.notes}`);
  if (entry.recorderName) lines.push(`المسجّل: ${entry.recorderName}`);
  if (entry.mapsLink)     lines.push(`📍 الموقع على الخريطة: ${entry.mapsLink}`);
  lines.push(`التاريخ: ${formatDate(entry.recordedAt)}`);
  return lines.join("\n");
}

interface Props {
  recordings: RecordingEntry[];
  onDelete: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  onUpdatePlate?: (id: string, plate: string) => void;
  onUpdateField?: (id: string, field: "vehicleType" | "notes", value: string) => void;
  onPlayAudio?: (entry: RecordingEntry) => void;
  onShareAudio?: (entry: RecordingEntry) => void;
  playingId?: string | null;
  checkPlates?: Set<string>;
}

const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];

export default function RecordingsTable({ recordings, onDelete, onDeleteMany, onUpdatePlate, onUpdateField, onPlayAudio, onShareAudio, playingId, checkPlates }: Props) {
  const [zoom, setZoom] = useState(3); // index into ZOOM_LEVELS (1.0 default)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingField, setEditingField] = useState<{ id: string; field: "vehicleType" | "notes" } | null>(null);
  const [editFieldValue, setEditFieldValue] = useState("");
  // «الأقرب» — ترتيب التسجيلات حسب أقرب سيارة لموقع المندوب. التحديد بالـ localId
  // فإعادة الترتيب مابتخربطش أي صف متحدّد.
  const [nearest, setNearest] = useState(false);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  const duplicates = useMemo(
    () => findDuplicates(recordings.map((r) => r.plate)),
    [recordings]
  );

  async function handleNearest() {
    if (nearest) { setNearest(false); return; }
    setLocating(true);
    try {
      const warm = gpsService.getLastCoords();
      let loc = warm ? { lat: warm.lat, lng: warm.lng } : null;
      if (!loc && navigator.geolocation) {
        loc = await new Promise<{ lat: number; lng: number } | null>((resolve) =>
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 10000, maximumAge: 60000 }
          )
        );
      }
      if (!loc) { alert("تعذّر الوصول للموقع. تأكد من إذن الـ GPS."); return; }
      setUserLoc(loc);
      setNearest(true);
    } finally { setLocating(false); }
  }

  const sortedRecordings = useMemo(() => {
    if (!nearest || !userLoc) return recordings;
    const distOf = (r: RecordingEntry) =>
      r.lat != null && r.lng != null ? haversineKm(userLoc.lat, userLoc.lng, r.lat, r.lng) : Infinity;
    return [...recordings].sort((a, b) => distOf(a) - distOf(b));
  }, [recordings, nearest, userLoc]);

  function imgRows(): PlateImageRow[] {
    return sortedRecordings.map((e) => {
      const details: [string, string][] = [];
      if (e.vehicleType) details.push(["النوع", e.vehicleType]);
      if (e.street) details.push(["الشارع", e.street]);
      if (e.district) details.push(["الحي", e.district]);
      if (e.notes) details.push(["ملاحظات", e.notes]);
      if (e.recorderName) details.push(["المسجّل", e.recorderName]);
      return { plate: e.plate, details };
    });
  }

  const scale = ZOOM_LEVELS[zoom];

  function zoomIn()  { setZoom((z) => Math.min(z + 1, ZOOM_LEVELS.length - 1)); }
  function zoomOut() { setZoom((z) => Math.max(z - 1, 0)); }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === recordings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(recordings.map((r) => r.localId)));
    }
  }

  async function copyRow(entry: RecordingEntry) {
    await navigator.clipboard.writeText(rowToText(entry));
    setCopiedId(entry.localId);
    setTimeout(() => setCopiedId(null), 1200);
  }

  function shareRow(entry: RecordingEntry) {
    const text = rowToText(entry);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function shareSelected() {
    const rows = recordings.filter((r) => selected.has(r.localId));
    const text = rows
      .map((r, i) => `${i + 1}. ${rowToText(r)}`)
      .join("\n\n──────────\n\n");
    const full = `*السجلات الميدانية (${rows.length})*\n\n${text}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, "_blank");
  }

  function startEdit(entry: RecordingEntry) {
    if (!onUpdatePlate || entry.plate.startsWith("📍")) return;
    setEditingId(entry.localId);
    setEditValue(entry.plate);
  }

  function commitEdit() {
    if (editingId) {
      const trimmed = editValue.trim();
      if (trimmed) onUpdatePlate?.(editingId, trimmed);
    }
    setEditingId(null);
    setEditValue("");
  }

  function startFieldEdit(entry: RecordingEntry, field: "vehicleType" | "notes") {
    if (!onUpdateField) return;
    setEditingField({ id: entry.localId, field });
    setEditFieldValue((field === "vehicleType" ? entry.vehicleType : entry.notes) || "");
  }

  function commitFieldEdit() {
    if (editingField) {
      onUpdateField?.(editingField.id, editingField.field, editFieldValue.trim());
    }
    setEditingField(null);
    setEditFieldValue("");
  }

  function deleteSelected() {
    const ids = Array.from(selected);
    if (onDeleteMany) {
      onDeleteMany(ids);
    } else {
      ids.forEach(onDelete);
    }
    setSelected(new Set());
  }

  const allSelected = selected.size === recordings.length && recordings.length > 0;
  const someSelected = selected.size > 0;
  const syncedCount  = recordings.filter((r) => r.synced).length;
  const dupCount     = duplicates.size;

  if (recordings.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-border bg-surface p-2">
          <p className="text-lg font-black text-ink">{recordings.length}</p>
          <p className="text-[11px] text-muted">إجمالي</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-2">
          <p className="text-lg font-black text-primary">{syncedCount}</p>
          <p className="text-[11px] text-muted">مزامَن</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-2">
          <p className="text-lg font-black text-alert">{dupCount}</p>
          <p className="text-[11px] text-muted">مكرر</p>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={zoomOut} disabled={zoom === 0}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 hover:text-ink transition">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-muted w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} disabled={zoom === ZOOM_LEVELS.length - 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted disabled:opacity-30 hover:text-ink transition">
            <ZoomIn size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleNearest} disabled={locating} title="ترتيب حسب الأقرب لموقعك"
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition ${nearest ? "bg-primary text-night font-bold" : "border border-border bg-surface-2 text-muted hover:text-primary"}`}>
            <Navigation size={13} /> {locating ? "..." : "الأقرب"}
          </button>
          <PlateImagesButton title="السجلات الميدانية" build={imgRows}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-primary transition" />
          <button onClick={toggleAll}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
            {allSelected ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
            {allSelected ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>
      </div>

      {/* Table container — fixed height, scrollable both axes */}
      <div
        className="overflow-auto rounded-xl border border-border"
        style={{ maxHeight: "55vh" }}
      >
        <div style={{ fontSize: `${scale * 12}px`, minWidth: "max-content" }}>
          <table className="border-collapse w-full" style={{ direction: "rtl" }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface-2 text-muted">
                <th className="border-b border-l border-border px-2 py-2 text-right font-bold whitespace-nowrap">☐</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">رقم اللوحة</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">نوع السيارة</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الشارع</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">الحي</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">التاريخ</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">ملاحظات</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">المسجّل</th>
                <th className="border-b border-l border-border px-3 py-2 text-right font-bold whitespace-nowrap">GPS</th>
                <th className="border-b border-border px-2 py-2 text-right font-bold whitespace-nowrap">⋮</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecordings.map((entry, i) => {
                const normPlate = normalizePlate(entry.plate);
                const isDup = duplicates.has(normPlate);
                const isMatched = !!(checkPlates?.has(normPlate));
                const isSelected = selected.has(entry.localId);
                const isPin = entry.plate.startsWith("📍");
                return (
                  <tr
                    key={entry.localId}
                    className={`border-b border-border transition ${
                      isSelected
                        ? "bg-primary/15"
                        : isMatched
                        ? "bg-brand/10"
                        : isDup
                        ? "bg-alert/10"
                        : i % 2 === 0
                        ? "bg-surface"
                        : "bg-surface-2/40"
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="border-l border-border px-2 py-2 text-center">
                      <button onClick={() => toggleSelect(entry.localId)} className="text-muted hover:text-primary transition">
                        {isSelected
                          ? <CheckSquare size={14} className="text-primary" />
                          : <Square size={14} />
                        }
                      </button>
                    </td>

                    {/* Plate */}
                    <td className="border-l border-border px-3 py-2">
                      {editingId === entry.localId ? (
                        <input
                          autoFocus
                          dir="rtl"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                          }}
                          className="w-24 rounded-lg border border-primary bg-surface px-2 py-1 text-sm font-bold text-ink focus:outline-none"
                        />
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 whitespace-nowrap ${onUpdatePlate && !isPin ? "cursor-pointer" : ""}`}
                          onClick={() => startEdit(entry)}
                        >
                          {entry.synced
                            ? <CheckCircle2 size={10} className="text-primary shrink-0" />
                            : <Clock size={10} className="text-muted shrink-0" />
                          }
                          <span className={`font-bold ${isMatched ? "text-brand" : isDup ? "text-alert" : isPin ? "text-primary" : "text-ink"}`}>
                            {entry.plate}
                          </span>
                          {onUpdatePlate && !isPin && <Pencil size={10} className="text-muted shrink-0" />}
                          {entry.uncertain && (
                            <span title="الاستخراج مش متأكد منه — يستاهل نظرة" className="flex items-center rounded-full bg-alert/20 px-1 py-0.5 leading-none">
                              <AlertTriangle size={10} className="text-alert" />
                            </span>
                          )}
                          {isMatched && (
                            <span className="rounded-full bg-brand/20 px-1 py-0.5 text-[9px] font-bold text-brand leading-none">
                              مطلوبة
                            </span>
                          )}
                          {isDup && !isMatched && (
                            <span className="rounded-full bg-alert/20 px-1 py-0.5 text-[9px] font-bold text-alert leading-none">
                              مكررة
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Vehicle type */}
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                      {editingField?.id === entry.localId && editingField.field === "vehicleType" ? (
                        <input
                          autoFocus dir="rtl" value={editFieldValue}
                          onChange={(e) => setEditFieldValue(e.target.value)}
                          onBlur={commitFieldEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitFieldEdit();
                            if (e.key === "Escape") { setEditingField(null); setEditFieldValue(""); }
                          }}
                          className="w-28 rounded-lg border border-primary bg-surface px-2 py-1 text-sm text-ink focus:outline-none"
                        />
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 ${onUpdateField ? "cursor-pointer" : ""}`}
                          onClick={() => startFieldEdit(entry, "vehicleType")}
                        >
                          <span>{entry.vehicleType || "—"}</span>
                          {onUpdateField && <Pencil size={10} className="text-muted shrink-0" />}
                        </div>
                      )}
                    </td>

                    {/* Street */}
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                      {entry.street || "—"}
                    </td>

                    {/* District */}
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap text-ink">
                      {entry.district || "—"}
                    </td>

                    {/* Date */}
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">
                      {formatDate(entry.recordedAt)}
                    </td>

                    {/* Notes */}
                    <td className="border-l border-border px-3 py-2 text-ink">
                      {editingField?.id === entry.localId && editingField.field === "notes" ? (
                        <input
                          autoFocus dir="rtl" value={editFieldValue}
                          onChange={(e) => setEditFieldValue(e.target.value)}
                          onBlur={commitFieldEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitFieldEdit();
                            if (e.key === "Escape") { setEditingField(null); setEditFieldValue(""); }
                          }}
                          className="w-36 rounded-lg border border-primary bg-surface px-2 py-1 text-sm text-ink focus:outline-none"
                        />
                      ) : (
                        <div
                          className={`flex items-center gap-1.5 ${onUpdateField ? "cursor-pointer" : ""}`}
                          onClick={() => startFieldEdit(entry, "notes")}
                        >
                          <span>{entry.notes || "—"}</span>
                          {onUpdateField && <Pencil size={10} className="text-muted shrink-0" />}
                        </div>
                      )}
                    </td>

                    {/* Recorder */}
                    <td className="border-l border-border px-3 py-2 whitespace-nowrap text-muted">
                      {entry.recorderName || "—"}
                    </td>

                    {/* GPS */}
                    <td className="border-l border-border px-3 py-2">
                      {entry.mapsLink ? (
                        <a href={entry.mapsLink} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-primary underline whitespace-nowrap">
                          <MapPin size={10} /> خريطة
                        </a>
                      ) : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        {onPlayAudio && entry.audioBlobBase64 && (
                          <button onClick={() => onPlayAudio(entry)} title="تشغيل المقطع الصوتي"
                            className="text-muted hover:text-primary transition">
                            {playingId === entry.localId
                              ? <Pause size={13} className="text-primary" />
                              : <Play size={13} />
                            }
                          </button>
                        )}
                        {onShareAudio && entry.audioBlobBase64 && (
                          <button onClick={() => onShareAudio(entry)} title="مشاركة المقطع الصوتي"
                            className="text-muted hover:text-primary transition">
                            <Share2 size={13} />
                          </button>
                        )}
                        <button onClick={() => copyRow(entry)} title="نسخ"
                          className="text-muted hover:text-primary transition">
                          {copiedId === entry.localId
                            ? <Check size={13} className="text-primary" />
                            : <Copy size={13} />
                          }
                        </button>
                        <button onClick={() => shareRow(entry)} title="واتساب"
                          className="text-muted hover:text-primary transition">
                          <Share2 size={13} />
                        </button>
                        <button onClick={() => onDelete(entry.localId)} title="حذف"
                          className="text-muted hover:text-danger transition">
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

      {/* Bulk action bar — shows when rows selected */}
      {someSelected && (
        <div className="sticky bottom-0 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
          <span className="text-xs font-bold text-ink">{selected.size} محددة</span>
          <div className="flex gap-2">
            <button
              onClick={shareSelected}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90"
            >
              <Share2 size={13} /> واتساب
            </button>
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20"
            >
              <Trash2 size={13} /> مسح
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

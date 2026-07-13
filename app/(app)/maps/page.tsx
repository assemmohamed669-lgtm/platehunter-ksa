"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  MapPin, Search, Trash2, Mic, Keyboard, Camera, ShieldAlert,
  Navigation, Crosshair, Copy, Check, CheckSquare, Square, EyeOff, Eye, Share2,
  ChevronDown, Minimize2, Maximize2, ClipboardList, X, Download,
} from "lucide-react";
import {
  getAllRecordings, getAllFieldCheckEntries, getUploadedFile,
  deleteRecording, deleteFieldCheckEntry,
  type RecordingEntry, type FieldCheckEntry,
} from "@/lib/idb";
import { detectPlateColumn, detectPlateColumnByContent } from "@/lib/plateParser";
import { plateKey } from "@/lib/fieldCheck";
import { buildSpreadsheetBlob, openExcelBlob } from "@/lib/excel";
import { supabase } from "@/lib/supabaseClient";
import {
  gpsService, haversineKm, estimateDriveMinutes, formatDistanceKm, formatDurationMin,
} from "@/lib/gps";
import PlateBadge from "@/components/PlateBadge";
import type { MapPoint } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-surface text-muted text-sm">
      جارٍ تحميل الخريطة...
    </div>
  ),
});

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// A wanted car that turned up in the field, from any source.
interface Match {
  key: string;
  source: "rec" | "field";
  id: string;
  plate: string;
  method: string;
  methodIcon: "voice" | "manual" | "camera";
  when: string;
  lat?: number;
  lng?: number;
  mapsLink?: string;
  info: [string, string][];
  _dist?: number;
  _min?: number;
}

const METHOD_ICON = { voice: Mic, manual: Keyboard, camera: Camera };
const COLOR = { voice: "#1FAE6E", manual: "#3B82F6", camera: "#8B5CF6" };

// أحجام نافذة الخريطة المستقلة — المندوب يتحكم فيها بحرّية (تكبير/تصغير/إخفاء).
type MapSize = "small" | "medium" | "large";
const MAP_HEIGHTS: Record<MapSize, number> = { small: 220, medium: 420, large: 640 };
const LS_MAP_COLLAPSED = "ph:maps:collapsed";
const LS_MAP_SIZE = "ph:maps:size";

export default function MapsPage() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [fieldEntries, setFieldEntries] = useState<FieldCheckEntry[]>([]);
  const [wanted, setWanted] = useState<{ map: Map<string, Record<string, string>>; col: string | null }>(
    { map: new Map(), col: null }
  );
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");

  // الموقع الحي + التحكم في الخريطة
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [pointsHidden, setPointsHidden] = useState(false);
  const [nearest, setNearest] = useState(false);

  // نافذة الخريطة مستقلة تماماً عن نافذة قائمة اللوحات — حجمها وحالة طيّها يتحفظوا.
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [mapSize, setMapSize] = useState<MapSize>("medium");
  useEffect(() => {
    try {
      setMapCollapsed(localStorage.getItem(LS_MAP_COLLAPSED) === "1");
      const s = localStorage.getItem(LS_MAP_SIZE);
      if (s === "small" || s === "medium" || s === "large") setMapSize(s);
    } catch { /* storage unavailable */ }
  }, []);
  function toggleMapCollapsed() {
    setMapCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(LS_MAP_COLLAPSED, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }
  function changeMapSize(size: MapSize) {
    setMapSize(size);
    try { localStorage.setItem(LS_MAP_SIZE, size); } catch { /* ignore */ }
  }

  // تحديد/نسخ في نافذة المطلوبة — نافذة منبثقة مستقلة (ويندو لوحدها).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const [recs, fields, check] = await Promise.all([
        data.user ? getAllRecordings(data.user.id) : Promise.resolve([]),
        getAllFieldCheckEntries(data.user?.id),
        getUploadedFile("local", "check"),
      ]);
      setRecordings(recs);
      setFieldEntries(fields);
      if (check) {
        const col = detectPlateColumn(check.headers) ?? detectPlateColumnByContent(check.headers, check.rows);
        const map = new Map<string, Record<string, string>>();
        if (col) for (const row of check.rows) { const k = plateKey(String(row[col] ?? "")); if (k) map.set(k, row); }
        setWanted({ map, col });
      }
      setReady(true);
    })();
  }, []);

  // تتبّع موقع المندوب الحي.
  useEffect(() => {
    gpsService.startTracking().catch(() => {});
    const unsub = gpsService.subscribe((c) => { if (c) setUserLoc({ lat: c.lat, lng: c.lng }); });
    return () => unsub();
  }, []);

  // كل السيارات المطلوبة اللي اتلاقت (من التسجيلات + السجلات).
  const matches = useMemo<Match[]>(() => {
    const { map: refMap, col } = wanted;
    if (refMap.size === 0) return [];
    const out: Match[] = [];
    const refInfo = (plate: string): [string, string][] => {
      const row = refMap.get(plateKey(plate));
      if (!row) return [];
      return Object.entries(row).filter(([k, v]) => k !== col && String(v ?? "").trim()).map(([k, v]) => [k, String(v)]);
    };
    for (const r of recordings) {
      if (!refMap.has(plateKey(r.plate))) continue;
      const extra: [string, string][] = [];
      if (r.vehicleType) extra.push(["النوع", r.vehicleType]);
      if (r.street) extra.push(["الشارع", r.street]);
      if (r.district) extra.push(["الحي", r.district]);
      if (r.notes) extra.push(["ملاحظات", r.notes]);
      out.push({
        key: `rec-${r.localId}`, source: "rec", id: r.localId, plate: r.plate,
        method: r.isManual ? "إدخال يدوي (تسجيل)" : "تسجيل صوتي",
        methodIcon: r.isManual ? "manual" : "voice",
        when: r.recordedAt, lat: r.lat, lng: r.lng, mapsLink: r.mapsLink,
        info: [...refInfo(r.plate), ...extra],
      });
    }
    for (const e of fieldEntries) {
      if (!refMap.has(plateKey(e.plate))) continue;
      const mi: Match["methodIcon"] = e.method.includes("صوت") ? "voice" : e.method.includes("كاميرا") ? "camera" : "manual";
      const extra = Object.entries(e.row).filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => [k, String(v)] as [string, string]);
      out.push({
        key: `field-${e.id}`, source: "field", id: e.id, plate: e.plate,
        method: e.method, methodIcon: mi,
        when: e.checkedAt, lat: e.lat, lng: e.lng, mapsLink: e.mapsLink,
        info: [...refInfo(e.plate), ...extra],
      });
    }
    out.sort((a, b) => (a.when < b.when ? 1 : -1));
    return out;
  }, [recordings, fieldEntries, wanted]);

  // نقاط الخريطة — كل التشييكات السابقة (مش المطلوبة بس) بألوان حسب الطريقة.
  const allPoints = useMemo<MapPoint[]>(() => {
    if (pointsHidden) return [];
    const pts: MapPoint[] = [];
    for (const r of recordings) {
      if (r.lat != null && r.lng != null)
        pts.push({ lat: r.lat, lng: r.lng, plate: r.plate, subtitle: r.isManual ? "يدوي (تسجيل)" : "صوتي", when: formatDate(r.recordedAt), mapsLink: r.mapsLink, color: COLOR[r.isManual ? "manual" : "voice"] });
    }
    for (const e of fieldEntries) {
      if (e.lat != null && e.lng != null) {
        const mi = e.method.includes("صوت") ? "voice" : e.method.includes("كاميرا") ? "camera" : "manual";
        pts.push({ lat: e.lat, lng: e.lng, plate: e.plate, subtitle: e.method, when: formatDate(e.checkedAt), mapsLink: e.mapsLink, color: COLOR[mi] });
      }
    }
    return pts;
  }, [recordings, fieldEntries, pointsHidden]);

  // نافذة المطلوبة — بحث + ترتيب بالأقرب + الوقت.
  const filtered = useMemo<Match[]>(() => {
    const q = plateKey(query);
    let list = q ? matches.filter((m) => plateKey(m.plate).includes(q)) : matches;
    if (nearest && userLoc) {
      list = [...list]
        .map((m) => {
          const dist = m.lat != null && m.lng != null ? haversineKm(userLoc.lat, userLoc.lng, m.lat, m.lng) : Infinity;
          return { ...m, _dist: dist, _min: estimateDriveMinutes(dist) };
        })
        .sort((a, b) => (a._dist ?? Infinity) - (b._dist ?? Infinity));
    }
    return list;
  }, [matches, query, nearest, userLoc]);

  function matchText(m: Match): string {
    const lines = [`🚗 لوحة مطلوبة: ${m.plate}`, `الطريقة: ${m.method}`];
    for (const [k, v] of m.info) lines.push(`${k}: ${v}`);
    if (m.mapsLink) lines.push(`📍 الموقع: ${m.mapsLink}`);
    lines.push(`التاريخ: ${formatDate(m.when)}`);
    return lines.join("\n");
  }
  async function copyMatch(m: Match) {
    try { await navigator.clipboard.writeText(matchText(m)); } catch { /* ignore */ }
    setCopiedKey(m.key); setTimeout(() => setCopiedKey(null), 1200);
  }
  function shareMatch(m: Match) {
    window.open(`https://wa.me/?text=${encodeURIComponent(matchText(m))}`, "_blank");
  }
  function toggleSel(k: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  }
  function toggleSelAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((m) => m.key))));
  }
  function shareSelected() {
    const rows = filtered.filter((m) => selected.has(m.key));
    if (!rows.length) return;
    const text = `*سيارات مطلوبة (${rows.length})*\n\n` + rows.map((m, i) => `${i + 1}. ${matchText(m)}`).join("\n\n──────────\n\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }
  // صف Excel لكل لوحة — يحوي كل التفاصيل.
  function matchToRow(m: Match): Record<string, unknown> {
    const row: Record<string, unknown> = { "رقم اللوحة": m.plate, "طريقة التشييك": m.method };
    for (const [k, v] of m.info) if (!(k in row)) row[k] = v;
    row["التاريخ"] = formatDate(m.when);
    row["GPS"] = m.mapsLink ?? "";
    return row;
  }
  // فتح المحدّد (أو الكل إن لم يُحدَّد شيء) في إكسيل.
  async function excelSelected() {
    const rows = selected.size ? filtered.filter((m) => selected.has(m.key)) : filtered;
    if (!rows.length) return;
    setBusy(true);
    try {
      const { blob, ext } = buildSpreadsheetBlob(rows.map(matchToRow), "لوحات مطلوبة");
      await openExcelBlob(blob, `لوحات-مطلوبة.${ext}`);
    } catch {
      alert("تعذّر فتح Excel.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(m: Match) {
    if (!confirm(`تحذف اللوحة ${m.plate} من القائمة؟`)) return;
    if (m.source === "rec") { await deleteRecording(m.id); setRecordings((prev) => prev.filter((r) => r.localId !== m.id)); }
    else { await deleteFieldCheckEntry(m.id); setFieldEntries((prev) => prev.filter((e) => e.id !== m.id)); }
    setSelected((prev) => { const n = new Set(prev); n.delete(m.key); return n; });
  }
  async function deleteSelected() {
    const rows = filtered.filter((m) => selected.has(m.key));
    if (!rows.length || !confirm(`تحذف ${rows.length} لوحة من القائمة؟`)) return;
    for (const m of rows) {
      if (m.source === "rec") { await deleteRecording(m.id); }
      else { await deleteFieldCheckEntry(m.id); }
    }
    const recIds = new Set(rows.filter((m) => m.source === "rec").map((m) => m.id));
    const fieldIds = new Set(rows.filter((m) => m.source === "field").map((m) => m.id));
    setRecordings((prev) => prev.filter((r) => !recIds.has(r.localId)));
    setFieldEntries((prev) => prev.filter((e) => !fieldIds.has(e.id)));
    setSelected(new Set());
  }

  const allSel = selected.size === filtered.length && filtered.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">الخرائط</h1>
        <p className="text-xs text-muted">كل نقاط التشييك على الخريطة + السيارات المطلوبة</p>
      </div>

      {/* Stat */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <ShieldAlert size={20} className="text-brand shrink-0" />
        <span className="text-2xl font-black text-brand">{matches.length}</span>
        <span className="text-sm text-muted">مطلوبة اتلاقت</span>
        <span className="ml-auto text-xs text-muted">{allPoints.length} نقطة على الخريطة</span>
      </div>

      {/* ── نافذة الخريطة — مستقلة تماماً عن قائمة اللوحات، بحجمها الخاص ── */}
      <div className="rounded-2xl border border-border bg-surface p-3">
        <button onClick={toggleMapCollapsed} className="flex w-full items-center justify-between">
          <span className="text-sm font-bold text-ink">الخريطة</span>
          <ChevronDown size={16} className={`text-muted transition-transform ${mapCollapsed ? "" : "rotate-180"}`} />
        </button>

        {!mapCollapsed && (
          <div className="mt-3 flex flex-col gap-3">
            {/* أدوات الخريطة + التحكم في الحجم */}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setRecenterKey((k) => k + 1)} disabled={!userLoc}
                className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/20 disabled:opacity-40">
                <Crosshair size={14} /> موقعي
              </button>
              <button onClick={() => setPointsHidden((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition ${pointsHidden ? "bg-primary text-night" : "border border-border text-muted hover:text-ink"}`}>
                {pointsHidden ? <><Eye size={14} /> إظهار النقاط</> : <><EyeOff size={14} /> مسح النقاط</>}
              </button>
              <button onClick={() => setNearest((v) => !v)} disabled={!userLoc}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition disabled:opacity-40 ${nearest ? "bg-primary text-night" : "border border-border text-muted hover:text-primary"}`}>
                <Navigation size={14} /> الأقرب
              </button>
              {/* تكبير/تصغير حجم نافذة الخريطة */}
              <div className="mr-auto flex items-center gap-1 rounded-xl border border-border p-1">
                <button onClick={() => changeMapSize("small")} title="أصغر"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${mapSize === "small" ? "bg-primary text-night" : "text-muted hover:text-ink"}`}>
                  <Minimize2 size={13} />
                </button>
                <button onClick={() => changeMapSize("medium")} title="متوسطة"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${mapSize === "medium" ? "bg-primary text-night" : "text-muted hover:text-ink"}`}>
                  <Square size={13} />
                </button>
                <button onClick={() => changeMapSize("large")} title="أكبر"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${mapSize === "large" ? "bg-primary text-night" : "text-muted hover:text-ink"}`}>
                  <Maximize2 size={13} />
                </button>
              </div>
            </div>
            {pointsHidden && <p className="text-[11px] text-muted">النقاط متخفية من العرض فقط — السجلات محفوظة زي ما هي.</p>}

            <MapView points={allPoints} userLocation={userLoc} recenterKey={recenterKey} heightPx={MAP_HEIGHTS[mapSize]} />
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input dir="rtl" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن لوحة..."
          className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
      </div>

      {/* ── نافذة قائمة اللوحات — تفتح كويندو مستقلة فوق الشاشة (مش خلف الخريطة) ── */}
      {!ready ? (
        <p className="py-8 text-center text-sm text-muted">جارٍ التحميل...</p>
      ) : wanted.map.size === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface py-10 text-center">
          <MapPin size={36} className="text-muted/30" />
          <p className="text-sm text-muted">ارفع «ملف التشييك المرجعي» الأول عشان نعرف المطلوبين.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface py-10 text-center">
          <MapPin size={36} className="text-muted/30" />
          <p className="text-sm text-muted">{query ? "مفيش لوحة بالبحث ده." : "لسه مفيش سيارة مطلوبة اتلاقت."}</p>
        </div>
      ) : (
        <button
          onClick={() => setWindowOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-brand/40 bg-brand/10 py-3.5 text-sm font-bold text-brand transition active:scale-[0.98]"
        >
          <ClipboardList size={18} />
          عرض قائمة اللوحات ({filtered.length})
        </button>
      )}

      {/* نافذة اللوحات المطلوبة — modal مستقل بالكامل عن الخريطة.
          z-index عالي جداً (فوق أي طبقة داخلية لـ Leaflet) عشان لا تظهر خلف
          الخريطة أبداً — هذا كان الخلل المُبلَّغ عنه. */}
      {windowOpen && (
        <div className="fixed inset-0 z-[2000] flex flex-col bg-night/70 backdrop-blur-sm" onClick={() => setWindowOpen(false)}>
          <div
            className="mx-auto mt-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس النافذة */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-ink">اللوحات المطلوبة ({filtered.length})</h2>
              <button onClick={() => setWindowOpen(false)} className="rounded-lg p-1.5 text-muted hover:text-ink" title="إغلاق"><X size={18} /></button>
            </div>

            {/* شريط الأدوات — ترتيب بالأقرب + تحديد الكل */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <button onClick={() => setNearest((v) => !v)} disabled={!userLoc}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition disabled:opacity-40 ${nearest ? "bg-primary text-night" : "bg-surface-2 text-ink"}`}>
                <Navigation size={13} /> {nearest ? "الأقرب أولاً ✓" : "رتّب حسب الأقرب"}
              </button>
              <button onClick={toggleSelAll} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink transition">
                {allSel ? <CheckSquare size={13} /> : <Square size={13} />} تحديد الكل
              </button>
              <span className="mr-auto text-[11px] text-muted">{selected.size} محددة</span>
            </div>

            {/* أزرار الإجراءات الجماعية — مسح / مشاركة / فتح في إكسيل */}
            <div className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2">
              <button onClick={deleteSelected} disabled={selected.size === 0 || busy} className="flex items-center justify-center gap-1.5 rounded-xl bg-danger/10 py-2 text-xs font-bold text-danger transition disabled:opacity-40"><Trash2 size={14} /> مسح</button>
              <button onClick={shareSelected} disabled={selected.size === 0} className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2 text-xs font-bold text-ink transition disabled:opacity-40"><Share2 size={14} /> مشاركة</button>
              <button onClick={excelSelected} disabled={busy || filtered.length === 0} className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2 text-xs font-bold text-ink transition disabled:opacity-40"><Download size={14} /> إكسيل</button>
            </div>

            {/* القائمة */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="flex flex-col gap-2.5">
                {filtered.map((m) => {
                  const Icon = METHOD_ICON[m.methodIcon];
                  const sel = selected.has(m.key);
                  return (
                    <div key={m.key} className={`flex flex-col gap-2 rounded-xl border p-2.5 transition ${sel ? "border-primary bg-primary/10" : "border-border bg-surface-2"}`}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSel(m.key)} className="shrink-0 text-muted hover:text-primary transition">
                          {sel ? <CheckSquare size={18} className="text-primary" /> : <Square size={18} />}
                        </button>
                        <div className="flex-1 min-w-0"><PlateBadge value={m.plate} size="xs" /></div>
                        {nearest && m._dist != null && m._dist !== Infinity && (
                          <span className="flex items-center gap-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary shrink-0">
                            <Navigation size={10} /> {formatDistanceKm(m._dist)} · {formatDurationMin(m._min ?? Infinity)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-ink shrink-0">
                          <Icon size={11} style={{ color: COLOR[m.methodIcon] }} /> {m.method}
                        </span>
                      </div>

                      {m.info.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-surface/70 p-2">
                          {m.info.map(([k, v], i) => (
                            <div key={i} className="flex gap-1 text-[11px] min-w-0">
                              <span className="text-muted shrink-0">{k}:</span>
                              <span className="text-ink truncate font-medium">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span>🕐 {formatDate(m.when)}</span>
                        {m.mapsLink && (
                          <a href={m.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline">
                            <MapPin size={10} /> الموقع
                          </a>
                        )}
                        <div className="mr-auto flex items-center gap-2.5">
                          <button onClick={() => copyMatch(m)} className="text-muted hover:text-primary transition" title="نسخ">
                            {copiedKey === m.key ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                          </button>
                          <button onClick={() => shareMatch(m)} className="text-muted hover:text-primary transition" title="واتساب"><Share2 size={14} /></button>
                          <button onClick={() => remove(m)} className="text-muted hover:text-danger transition" title="حذف"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

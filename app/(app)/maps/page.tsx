"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  MapPin, Search, Trash2, Mic, Keyboard, Camera, ShieldAlert,
  Navigation, Crosshair, Copy, Check, CheckSquare, Square, EyeOff, Eye, Share2,
  ChevronDown, Minimize2, Maximize2,
} from "lucide-react";
import {
  getAllRecordings, getAllFieldCheckEntries, getUploadedFile,
  deleteRecording, deleteFieldCheckEntry,
  type RecordingEntry, type FieldCheckEntry,
} from "@/lib/idb";
import { detectPlateColumn, detectPlateColumnByContent } from "@/lib/plateParser";
import { plateKey } from "@/lib/fieldCheck";
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

  // نافذة الخريطة مستقلة تماماً عن قائمة اللوحات — حجمها وحالة طيّها يتحفظوا.
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

  // تحديد/نسخ في نافذة المطلوبة
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

      {/* ── نافذة قائمة اللوحات — مستقلة تماماً عن الخريطة ── */}
      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="mb-3 text-sm font-bold text-ink">قائمة اللوحات المطلوبة</p>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input dir="rtl" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن لوحة..."
            className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none" />
        </div>

        {/* Matched list */}
        {!ready ? (
          <p className="py-8 text-center text-sm text-muted">جارٍ التحميل...</p>
        ) : wanted.map.size === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MapPin size={36} className="text-muted/30" />
            <p className="text-sm text-muted">ارفع «ملف التشييك المرجعي» الأول عشان نعرف المطلوبين.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MapPin size={36} className="text-muted/30" />
            <p className="text-sm text-muted">{query ? "مفيش لوحة بالبحث ده." : "لسه مفيش سيارة مطلوبة اتلاقت."}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-brand">{filtered.length} لوحة</span>
              <button onClick={toggleSelAll} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-ink transition">
                {allSel ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                {allSel ? "إلغاء الكل" : "تحديد الكل"}
              </button>
            </div>

            {filtered.map((m) => {
            const Icon = METHOD_ICON[m.methodIcon];
            const sel = selected.has(m.key);
            return (
              <div key={m.key} className={`flex flex-col gap-2 rounded-2xl border p-3 transition ${sel ? "border-primary bg-primary/10" : "border-brand/30 bg-brand/5"}`}>
                <div className="flex items-start gap-2">
                  <button onClick={() => toggleSel(m.key)} className="mt-1 shrink-0 text-muted hover:text-primary transition">
                    {sel ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} />}
                  </button>
                  <div className="flex-1 min-w-0"><PlateBadge value={m.plate} size="sm" /></div>
                  <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-ink shrink-0">
                    <Icon size={12} style={{ color: COLOR[m.methodIcon] }} /> {m.method}
                  </span>
                </div>

                {nearest && m._dist != null && (
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="text-primary">📏 {formatDistanceKm(m._dist)}</span>
                    <span className="text-brand">🕐 {formatDurationMin(m._min ?? Infinity)}</span>
                  </div>
                )}

                {m.info.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-surface/60 p-2.5">
                    {m.info.map(([k, v], i) => (
                      <div key={i} className="flex gap-1 text-xs min-w-0">
                        <span className="text-muted shrink-0">{k}:</span>
                        <span className="text-ink truncate font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span>🕐 {formatDate(m.when)}</span>
                  {m.mapsLink && (
                    <a href={m.mapsLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-primary underline">
                      <MapPin size={11} /> الموقع
                    </a>
                  )}
                  <div className="mr-auto flex items-center gap-2">
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

          {/* شريط جماعي */}
          {selected.size > 0 && (
            <div className="sticky bottom-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
              <span className="text-xs font-bold text-ink">{selected.size} محددة</span>
              <div className="flex gap-2">
                <button onClick={shareSelected} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night transition hover:bg-primary/90"><Share2 size={13} /> واتساب</button>
                <button onClick={deleteSelected} className="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger transition hover:bg-danger/20"><Trash2 size={13} /> مسح</button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

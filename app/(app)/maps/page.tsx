"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { MapPin, Search, Trash2, Mic, Keyboard, Camera, ShieldAlert, X, Share2, Download, CheckSquare, Square, Navigation, ClipboardList } from "lucide-react";
import {
  getAllRecordings,
  getAllFieldCheckEntries,
  getUploadedFile,
  deleteRecording,
  deleteFieldCheckEntry,
  type RecordingEntry,
  type FieldCheckEntry,
} from "@/lib/idb";
import { detectPlateColumn, detectPlateColumnByContent } from "@/lib/plateParser";
import { plateKey } from "@/lib/fieldCheck";
import { buildSpreadsheetBlob, openExcelBlob, shareExcelBlob } from "@/lib/excel";
import { gpsService, haversineKm } from "@/lib/gps";
import { supabase } from "@/lib/supabaseClient";
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
  key: string;                       // unique row key
  source: "rec" | "field";           // which store to delete from
  id: string;                        // localId (rec) or field id
  plate: string;
  method: string;                    // كيف اتشيّكت
  methodIcon: "voice" | "manual" | "camera";
  when: string;                      // ISO
  lat?: number;
  lng?: number;
  mapsLink?: string;
  info: [string, string][];          // كل معلومات السيارة (من ملف المطلوبين + الإضافات)
}

const METHOD_ICON = { voice: Mic, manual: Keyboard, camera: Camera };
const COLOR = { voice: "#1FAE6E", manual: "#3B82F6", camera: "#8B5CF6" };

export default function MapsPage() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [fieldEntries, setFieldEntries] = useState<FieldCheckEntry[]>([]);
  const [wanted, setWanted] = useState<{ map: Map<string, Record<string, string>>; col: string | null }>(
    { map: new Map(), col: null }
  );
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");

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
        if (col) {
          for (const row of check.rows) {
            const k = plateKey(String(row[col] ?? ""));
            if (k) map.set(k, row);
          }
        }
        setWanted({ map, col });
      }
      setReady(true);
    })();
  }, []);

  // Build the list of matched wanted cars from BOTH stores.
  const matches = useMemo<Match[]>(() => {
    const { map: refMap, col } = wanted;
    if (refMap.size === 0) return [];
    const out: Match[] = [];

    const refInfo = (plate: string): [string, string][] => {
      const row = refMap.get(plateKey(plate));
      if (!row) return [];
      return Object.entries(row)
        .filter(([k, v]) => k !== col && String(v ?? "").trim())
        .map(([k, v]) => [k, String(v)]);
    };

    for (const r of recordings) {
      if (!refMap.has(plateKey(r.plate))) continue;
      const extra: [string, string][] = [];
      if (r.vehicleType) extra.push(["النوع", r.vehicleType]);
      if (r.street) extra.push(["الشارع", r.street]);
      if (r.district) extra.push(["الحي", r.district]);
      if (r.notes) extra.push(["ملاحظات", r.notes]);
      out.push({
        key: `rec-${r.localId}`,
        source: "rec",
        id: r.localId,
        plate: r.plate,
        method: r.isManual ? "إدخال يدوي (تسجيل)" : "تسجيل صوتي",
        methodIcon: r.isManual ? "manual" : "voice",
        when: r.recordedAt,
        lat: r.lat,
        lng: r.lng,
        mapsLink: r.mapsLink,
        info: [...refInfo(r.plate), ...extra],
      });
    }

    for (const e of fieldEntries) {
      if (!refMap.has(plateKey(e.plate))) continue;
      const mi: Match["methodIcon"] = e.method.includes("صوت")
        ? "voice"
        : e.method.includes("كاميرا")
        ? "camera"
        : "manual";
      const extra = Object.entries(e.row)
        .filter(([, v]) => String(v ?? "").trim())
        .map(([k, v]) => [k, String(v)] as [string, string]);
      out.push({
        key: `field-${e.id}`,
        source: "field",
        id: e.id,
        plate: e.plate,
        method: e.method,
        methodIcon: mi,
        when: e.checkedAt,
        lat: e.lat,
        lng: e.lng,
        mapsLink: e.mapsLink,
        info: [...refInfo(e.plate), ...extra],
      });
    }

    out.sort((a, b) => (a.when < b.when ? 1 : -1));
    return out;
  }, [recordings, fieldEntries, wanted]);

  const filtered = useMemo(() => {
    const q = plateKey(query);
    if (!q) return matches;
    return matches.filter((m) => plateKey(m.plate).includes(q));
  }, [matches, query]);

  const points = useMemo<MapPoint[]>(
    () =>
      filtered
        .filter((m) => m.lat != null && m.lng != null)
        .map((m) => ({
          lat: m.lat!,
          lng: m.lng!,
          plate: m.plate,
          subtitle: m.method,
          when: formatDate(m.when),
          mapsLink: m.mapsLink,
          color: COLOR[m.methodIcon],
        })),
    [filtered]
  );

  // ── نافذة اللوحات (#4) ────────────────────────────────────────────────────
  const [windowOpen, setWindowOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nearestSort, setNearestSort] = useState(false);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  // ترتيب حسب الأقرب لموقعي — يجلب الموقع الحالي ثم يرتّب بالمسافة.
  async function toggleNearest() {
    if (nearestSort) { setNearestSort(false); return; }
    setLocating(true);
    try {
      const c = await gpsService.pinCurrentLocation();
      setMyLoc({ lat: c.lat, lng: c.lng });
      setNearestSort(true);
    } catch {
      alert("تعذّر تحديد موقعك الحالي — تأكد من تفعيل الـ GPS.");
    } finally {
      setLocating(false);
    }
  }

  // القائمة المعروضة داخل النافذة، مرتّبة بالأقرب عند التفعيل.
  const windowList = useMemo<Match[]>(() => {
    if (!nearestSort || !myLoc) return filtered;
    const dist = (m: Match) =>
      m.lat != null && m.lng != null
        ? haversineKm(myLoc.lat, myLoc.lng, m.lat, m.lng)
        : Infinity; // اللوحات بدون موقع تنزل آخر القائمة
    return [...filtered].sort((a, b) => dist(a) - dist(b));
  }, [filtered, nearestSort, myLoc]);

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }
  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === windowList.length ? new Set() : new Set(windowList.map((m) => m.key))
    );
  }

  const selectedMatches = useMemo(
    () => windowList.filter((m) => selected.has(m.key)),
    [windowList, selected]
  );

  // صف Excel/مشاركة لكل لوحة — يحوي كل التفاصيل.
  function matchToRow(m: Match): Record<string, unknown> {
    const row: Record<string, unknown> = {
      "رقم اللوحة": m.plate,
      "طريقة التشييك": m.method,
    };
    for (const [k, v] of m.info) if (!(k in row)) row[k] = v;
    row["التاريخ"] = formatDate(m.when);
    row["GPS"] = m.mapsLink ?? "";
    return row;
  }

  async function deleteMatches(list: Match[]) {
    const recIds = new Set(list.filter((m) => m.source === "rec").map((m) => m.id));
    const fieldIds = new Set(list.filter((m) => m.source === "field").map((m) => m.id));
    await Promise.all([
      ...[...recIds].map((id) => deleteRecording(id)),
      ...[...fieldIds].map((id) => deleteFieldCheckEntry(id)),
    ]);
    if (recIds.size) setRecordings((prev) => prev.filter((r) => !recIds.has(r.localId)));
    if (fieldIds.size) setFieldEntries((prev) => prev.filter((e) => !fieldIds.has(e.id)));
    setSelected((prev) => {
      const n = new Set(prev);
      for (const m of list) n.delete(m.key);
      return n;
    });
  }

  async function deleteSelected() {
    if (selectedMatches.length === 0) return;
    if (!confirm(`تحذف ${selectedMatches.length} لوحة من القائمة؟`)) return;
    await deleteMatches(selectedMatches);
  }

  async function shareSelected() {
    const list = selectedMatches.length ? selectedMatches : windowList;
    if (list.length === 0) return;
    setBusy(true);
    try {
      const { blob, ext } = buildSpreadsheetBlob(list.map(matchToRow), "لوحات مطلوبة");
      await shareExcelBlob(blob, `لوحات-مطلوبة.${ext}`, "لوحات مطلوبة اتلاقت");
    } catch {
      alert("تعذّرت المشاركة.");
    } finally {
      setBusy(false);
    }
  }

  async function excelSelected() {
    const list = selectedMatches.length ? selectedMatches : windowList;
    if (list.length === 0) return;
    setBusy(true);
    try {
      const { blob, ext } = buildSpreadsheetBlob(list.map(matchToRow), "لوحات مطلوبة");
      await openExcelBlob(blob, `لوحات-مطلوبة.${ext}`);
    } catch {
      alert("تعذّر فتح Excel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">الخرائط</h1>
        <p className="text-xs text-muted">السيارات المطلوبة اللي اتلاقت في الميدان</p>
      </div>

      {/* Stat */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
        <ShieldAlert size={20} className="text-brand shrink-0" />
        <span className="text-2xl font-black text-brand">{matches.length}</span>
        <span className="text-sm text-muted">سيارة مطلوبة اتلاقت</span>
        <span className="ml-auto text-xs text-muted">{points.length} عليها موقع</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          dir="rtl"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن لوحة..."
          className="w-full rounded-xl border border-border bg-surface-2 py-2.5 pr-9 pl-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
      </div>

      {/* Map */}
      {points.length > 0 && <MapView points={points} />}

      {/* Matched list */}
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
          <p className="text-sm text-muted">
            {query ? "مفيش لوحة بالبحث ده." : "لسه مفيش سيارة مطلوبة اتلاقت."}
          </p>
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

      {/* ── نافذة اللوحات المطلوبة (#4) ── */}
      {windowOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-night/70 backdrop-blur-sm" onClick={() => setWindowOpen(false)}>
          <div
            className="mx-auto mt-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس النافذة */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold text-ink">
                اللوحات المطلوبة ({windowList.length})
              </h2>
              <button onClick={() => setWindowOpen(false)} className="rounded-lg p-1.5 text-muted hover:text-ink" title="إغلاق">
                <X size={18} />
              </button>
            </div>

            {/* شريط الأدوات */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <button
                onClick={toggleNearest}
                disabled={locating}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  nearestSort ? "bg-brand text-white" : "bg-surface-2 text-ink"
                }`}
              >
                <Navigation size={13} className={locating ? "animate-pulse" : ""} />
                {locating ? "بيحدد موقعك..." : nearestSort ? "الأقرب أولاً ✓" : "رتّب حسب الأقرب"}
              </button>
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink transition">
                {selected.size === windowList.length && windowList.length > 0 ? <CheckSquare size={13} /> : <Square size={13} />}
                تحديد الكل
              </button>
              <span className="mr-auto text-[11px] text-muted">{selected.size} محدّدة</span>
            </div>

            {/* أزرار الإجراءات الجماعية */}
            <div className="grid grid-cols-3 gap-2 border-b border-border px-3 py-2">
              <button
                onClick={deleteSelected}
                disabled={selected.size === 0 || busy}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-danger/10 py-2 text-xs font-bold text-danger transition disabled:opacity-40"
              >
                <Trash2 size={14} /> مسح
              </button>
              <button
                onClick={shareSelected}
                disabled={busy || windowList.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2 text-xs font-bold text-ink transition disabled:opacity-40"
              >
                <Share2 size={14} /> مشاركة
              </button>
              <button
                onClick={excelSelected}
                disabled={busy || windowList.length === 0}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-surface-2 py-2 text-xs font-bold text-ink transition disabled:opacity-40"
              >
                <Download size={14} /> إكسيل
              </button>
            </div>

            {/* قائمة اللوحات — خط عادي منظّم */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="flex flex-col gap-2.5">
                {windowList.map((m) => {
                  const Icon = METHOD_ICON[m.methodIcon];
                  const isSel = selected.has(m.key);
                  const km = nearestSort && myLoc && m.lat != null && m.lng != null
                    ? haversineKm(myLoc.lat, myLoc.lng, m.lat, m.lng)
                    : null;
                  return (
                    <div
                      key={m.key}
                      className={`flex flex-col gap-2 rounded-xl border p-2.5 transition ${
                        isSel ? "border-brand bg-brand/10" : "border-border bg-surface-2"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleSelect(m.key)} className="shrink-0 text-brand" title="تحديد">
                          {isSel ? <CheckSquare size={18} /> : <Square size={18} className="text-muted" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <PlateBadge value={m.plate} size="xs" />
                        </div>
                        {km != null && (
                          <span className="flex items-center gap-0.5 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand shrink-0">
                            <Navigation size={10} /> {km < 1 ? `${Math.round(km * 1000)} م` : `${km.toFixed(1)} كم`}
                          </span>
                        )}
                        <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-ink shrink-0">
                          <Icon size={11} style={{ color: COLOR[m.methodIcon] }} /> {m.method}
                        </span>
                      </div>

                      {/* كل تفاصيل اللوحة — خط عادي */}
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
                          <a href={m.mapsLink} target="_blank" rel="noopener noreferrer"
                            className="mr-auto flex items-center gap-0.5 text-primary underline">
                            <MapPin size={10} /> الموقع
                          </a>
                        )}
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

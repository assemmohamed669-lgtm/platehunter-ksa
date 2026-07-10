"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { MapPin, Search, Trash2, Mic, Keyboard, Camera, ShieldAlert } from "lucide-react";
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
        getAllFieldCheckEntries(),
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

  async function remove(m: Match) {
    if (!confirm(`تحذف اللوحة ${m.plate} من القائمة؟`)) return;
    if (m.source === "rec") {
      await deleteRecording(m.id);
      setRecordings((prev) => prev.filter((r) => r.localId !== m.id));
    } else {
      await deleteFieldCheckEntry(m.id);
      setFieldEntries((prev) => prev.filter((e) => e.id !== m.id));
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
        <div className="flex flex-col gap-3">
          {filtered.map((m) => {
            const Icon = METHOD_ICON[m.methodIcon];
            return (
              <div key={m.key} className="flex flex-col gap-2 rounded-2xl border border-brand/30 bg-brand/5 p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <PlateBadge value={m.plate} size="sm" />
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-ink shrink-0">
                    <Icon size={12} style={{ color: COLOR[m.methodIcon] }} /> {m.method}
                  </span>
                  <button
                    onClick={() => remove(m)}
                    className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* كل معلومات السيارة */}
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
                    <a href={m.mapsLink} target="_blank" rel="noopener noreferrer"
                      className="mr-auto flex items-center gap-0.5 text-primary underline">
                      <MapPin size={11} /> الموقع على الخريطة
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

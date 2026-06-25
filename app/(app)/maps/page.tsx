"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { MapPin, Mic, Navigation } from "lucide-react";
import { getAllRecordings, type RecordingEntry } from "@/lib/idb";
import { supabase } from "@/lib/supabaseClient";

// Load Leaflet map only on the client (no SSR — Leaflet needs window)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-surface text-muted text-sm">
      جارٍ تحميل الخريطة...
    </div>
  ),
});

export default function MapsPage() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAgentId(data.user.id);
        getAllRecordings(data.user.id).then(setRecordings);
      }
    });
  }, []);

  const withGps = recordings.filter((r) => r.lat && r.lng);
  const manualPins = recordings.filter((r) => r.plate.startsWith("📍") && r.lat);
  const voiceRecs = withGps.filter((r) => !r.plate.startsWith("📍"));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">الخرائط</h1>
        <p className="text-xs text-muted">مسارات العمل ونقاط التسجيل</p>
      </div>

      {/* Legend + stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "إجمالي النقاط", val: withGps.length, color: "#4A82BF", icon: <Navigation size={14}/> },
          { label: "تسجيلات صوتية", val: voiceRecs.length, color: "#4A82BF", icon: <Mic size={14}/> },
          { label: "دبابيس يدوية", val: manualPins.length, color: "#3B82F6", icon: <MapPin size={14}/> },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-center gap-1 mb-1"
              style={{ color: s.color }}>
              {s.icon}
              <span className="text-xl font-black">{s.val}</span>
            </div>
            <p className="text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-primary border-2 border-white" />
          تسجيل صوتي
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-500 border-2 border-white" />
          دبوس يدوي
        </span>
      </div>

      {/* Map */}
      {withGps.length > 0 ? (
        <MapView recordings={recordings} />
      ) : (
        <div className="flex h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-surface text-center">
          <MapPin size={40} className="text-muted/30" />
          <p className="text-sm text-muted">
            لا توجد نقاط GPS بعد.
            <br />
            سجّل لوحات من تاب التسجيل لتظهر على الخريطة.
          </p>
        </div>
      )}

      {/* Recent locations list */}
      {withGps.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-bold text-ink">آخر النقاط</h2>
          {withGps.slice(0, 10).map((r) => (
            <div key={r.localId} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.plate.startsWith("📍") ? "bg-blue-500" : "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-ink">{r.plate}</p>
                <p className="truncate text-xs text-muted">
                  {r.street ?? `${r.lat?.toFixed(4)}°N`}
                  {r.district ? ` • ${r.district}` : ""}
                </p>
              </div>
              {r.mapsLink && (
                <a href={r.mapsLink} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline shrink-0">
                  عرض
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

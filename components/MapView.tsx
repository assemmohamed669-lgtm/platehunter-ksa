"use client";

import { useEffect, useRef } from "react";
import type { RecordingEntry } from "@/lib/idb";

interface Props {
  recordings: RecordingEntry[];
  center?: [number, number];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function MapView({ recordings, center = [24.7136, 46.6753] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import Leaflet (client-only)
    import("leaflet").then((L) => {
      // Fix default icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 12);
      mapRef.current = map;

      // OpenStreetMap tiles — free, no API key
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const withGps = recordings.filter((r) => r.lat && r.lng);
      if (!withGps.length) return;

      // Color by type
      function markerColor(r: RecordingEntry): string {
        if (r.plate.startsWith("📍")) return "#3B82F6"; // blue = manual pin
        return "#1FAE6E"; // green = voice recording
      }

      withGps.forEach((r) => {
        const color = markerColor(r);
        const icon = L.divIcon({
          html: `<div style="
            width:12px;height:12px;border-radius:50%;
            background:${color};
            border:2.5px solid #fff;
            box-shadow:0 0 6px ${color}88;
          "></div>`,
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const popup = `
          <div dir="rtl" style="font-family:Tahoma,sans-serif;min-width:160px">
            <b style="color:#1FAE6E;font-size:15px">${r.plate}</b><br/>
            ${r.vehicleType ? `<span style="color:#666">${r.vehicleType}</span><br/>` : ""}
            ${r.street ? `📍 ${r.street}` : ""} ${r.district ? `• ${r.district}` : ""}<br/>
            <span style="color:#999;font-size:11px">${formatDate(r.recordedAt)}</span><br/>
            ${r.mapsLink ? `<a href="${r.mapsLink}" target="_blank" style="color:#1FAE6E">فتح في خرائط Google</a>` : ""}
          </div>
        `;

        L.marker([r.lat!, r.lng!], { icon })
          .addTo(map)
          .bindPopup(popup, { maxWidth: 220 });
      });

      // Fit map to all markers
      const bounds = L.latLngBounds(withGps.map((r) => [r.lat!, r.lng!]));
      if (withGps.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
    });

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapRef.current as any)?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-[420px] w-full rounded-2xl overflow-hidden border border-border"
    />
  );
}

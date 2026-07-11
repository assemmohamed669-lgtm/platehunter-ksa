"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

export interface MapPoint {
  lat: number;
  lng: number;
  plate: string;
  subtitle?: string;
  when?: string;
  mapsLink?: string;
  color?: string;
}

interface Props {
  points: MapPoint[];
  center?: [number, number];
}

// Escape any value going into popup HTML — plate/notes are user/OCR content
// and could contain markup, which Leaflet would render as innerHTML.
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
function safeHttps(url: unknown): string | null {
  const u = String(url ?? "");
  return /^https:\/\//i.test(u) ? u : null;
}

export default function MapView({ points, center = [24.7136, 46.6753] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import("leaflet").then((L) => {
      if (!containerRef.current) return;

      const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 12);
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // The container often hasn't settled to its final size on first paint
      // (dynamic import + flex layout), which leaves tiles half-rendered.
      const fix = () => map.invalidateSize();
      setTimeout(fix, 0);
      setTimeout(fix, 250);
      window.addEventListener("resize", fix);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map as any)._phFix = fix;

      if (!points.length) return;

      points.forEach((p) => {
        const color = p.color ?? "#1FAE6E";
        const icon = L.divIcon({
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${color};
            border:2.5px solid #fff;
            box-shadow:0 0 6px ${color}88;
          "></div>`,
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const link = safeHttps(p.mapsLink);
        const popup = `
          <div dir="rtl" style="font-family:Tahoma,sans-serif;min-width:160px">
            <b style="color:${color};font-size:15px">${esc(p.plate)}</b><br/>
            ${p.subtitle ? `<span style="color:#666">${esc(p.subtitle)}</span><br/>` : ""}
            ${p.when ? `<span style="color:#999;font-size:11px">${esc(p.when)}</span><br/>` : ""}
            ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" style="color:#1FAE6E">فتح في خرائط Google</a>` : ""}
          </div>
        `;

        L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(popup, { maxWidth: 220 });
      });

      if (points.length > 1) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView([points[0].lat, points[0].lng], 14);
      }
    });

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = mapRef.current as any;
      if (m?._phFix) window.removeEventListener("resize", m._phFix);
      m?.remove();
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

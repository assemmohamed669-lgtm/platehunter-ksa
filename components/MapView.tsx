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
  /** موقع المندوب الحالي — يظهر كنقطة زرقاء نابضة. */
  userLocation?: { lat: number; lng: number } | null;
  /** كل ما يتغيّر الرقم ده → الخريطة ترجع لموقع المندوب وتكمّل تتبّع. */
  recenterKey?: number;
  /** ارتفاع الحاوية بالبكسل — نافذة الخريطة المستقلة تتحكم في حجمها بيه. */
  heightPx?: number;
}

// Escape any value going into popup HTML — plate/notes are user/OCR content.
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
function safeHttps(url: unknown): string | null {
  const u = String(url ?? "");
  return /^https:\/\//i.test(u) ? u : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function MapView({ points, center = [24.7136, 46.6753], userLocation, recenterKey, heightPx = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const followRef = useRef(true);          // نتبع الموقع لحد ما المستخدم يحرّك الخريطة بنفسه
  const didInitialFitRef = useRef(false);

  // ── Init once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 12);
      mapRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      // أول ما المستخدم يحرّك/يزوّم بإيده → نوقف التتبّع التلقائي.
      const stopFollow = () => { followRef.current = false; };
      map.on("dragstart", stopFollow);
      map.on("zoomstart", (e: any) => { if (e.hard !== false && (e as any).originalEvent) followRef.current = false; });

      const fix = () => map.invalidateSize();
      setTimeout(fix, 0);
      setTimeout(fix, 250);
      window.addEventListener("resize", fix);
      (map as any)._phFix = fix;

      // أول رسم للنقاط + الموقع.
      renderMarkers();
      renderUser();
    });

    return () => {
      cancelled = true;
      const m = mapRef.current;
      if (m?._phFix) window.removeEventListener("resize", m._phFix);
      m?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── إعادة رسم النقاط لما تتغيّر ──
  function renderMarkers() {
    const L = LRef.current, map = mapRef.current, layer = markersLayerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();

    points.forEach((p) => {
      const color = p.color ?? "#1FAE6E";
      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 0 6px ${color}88;"></div>`,
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
        </div>`;
      L.marker([p.lat, p.lng], { icon }).addTo(layer).bindPopup(popup, { maxWidth: 220 });
    });

    // أول مرة بس نعمل fit على كل النقاط (وبعدها نسيب التتبّع/تحريك المستخدم).
    if (!didInitialFitRef.current && points.length > 0 && !userLocation) {
      didInitialFitRef.current = true;
      if (points.length > 1) map.fitBounds(L.latLngBounds(points.map((p: MapPoint) => [p.lat, p.lng])), { padding: [40, 40] });
      else map.setView([points[0].lat, points[0].lng], 14);
    }
  }

  function renderUser() {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!userLocation) { if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; } return; }
    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563EB;border:3px solid #fff;box-shadow:0 0 0 4px #2563EB44;"></div>`,
      className: "",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    if (userMarkerRef.current) userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    else userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon, zIndexOffset: 1000 }).addTo(map).bindPopup("موقعك الحالي");
    if (followRef.current) map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 15), { animate: true });
  }

  useEffect(() => { renderMarkers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [points]);
  useEffect(() => { renderUser(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [userLocation]);

  // لما نافذة الخريطة تتكبّر/تتصغّر بتغيير heightPx، الحاوية بتاخد وقت CSS
  // قصير لتطبّق الارتفاع الجديد — نستنى شوية بعدها ونعمل invalidateSize عشان
  // Leaflet يعيد رسم الـ tiles على المقاس الصحيح (وإلا يفضل فيه فراغ رمادي).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(t);
  }, [heightPx]);

  // زر «موقعي» — يرجّع التتبّع ويروح للموقع.
  useEffect(() => {
    if (recenterKey === undefined) return;
    followRef.current = true;
    const map = mapRef.current;
    if (map && userLocation) map.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2xl overflow-hidden border border-border transition-[height] duration-200"
      style={{ height: heightPx }}
    />
  );
}

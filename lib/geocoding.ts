/**
 * Reverse Geocoding — converts GPS coordinates to street/district names.
 * Uses OpenStreetMap Nominatim (free, no API key required).
 * Results are cached locally to avoid duplicate requests.
 */

export interface GeoAddress {
  street: string;
  district: string;
}

const cache = new Map<string, GeoAddress>();

function cacheKey(lat: number, lng: number): string {
  // Round to 5 decimals (~1.1m) so two nearby points on DIFFERENT streets don't
  // share a cache entry and get the wrong street name — precision matters here.
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseNominatimAddress(addr: Record<string, any>): GeoAddress {
  const street =
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.street ||
    addr.path ||
    addr.residential ||
    addr.neighbourhood ||
    "غير معروف";

  const district =
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    addr.county ||
    addr.city ||
    addr.town ||
    addr.village ||
    "غير معروف";

  return { street, district };
}

/** نتيجة بحث مكان/شارع بالاسم (بحث أمامي — اسم → إحداثيات). */
export interface PlaceResult { label: string; lat: number; lng: number; }

/**
 * بحث عن مكان/شارع بالاسم (زي بحث خرائط جوجل) — بيرجّع لحد ٦ نتايج بإحداثياتها.
 * بيستخدم Nominatim (نفس خدمة العناوين)، مقيّد للسعودية، وبيبايّس النتايج ناحية
 * موقع المندوب (لو متوفّر) عشان الشارع الأقرب يطلع الأول. بيرجّع [] عند أي فشل.
 */
export async function searchPlace(
  query: string,
  near?: { lat: number; lng: number } | null,
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const params = new URLSearchParams({
      q, format: "json", limit: "6", "accept-language": "ar", countrycodes: "sa",
    });
    if (near) {
      // صندوق حوالين موقع المندوب لترجيح النتايج القريبة (مش مقيّد — لسه بيلاقي البعيد).
      const d = 0.4;
      params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
      params.set("bounded", "0");
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "PlateHunterKSA/2.0" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    return data
      .map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoAddress> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key)!;

  try {
    // zoom=18 → building/street level (most precise). addressdetails=1 → return
    // the structured address breakdown we parse the road name out of.
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=ar`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PlateHunterKSA/2.0" },
    });

    if (!res.ok) throw new Error("Geocoding request failed");

    const data = await res.json();
    const result = parseNominatimAddress(data.address ?? {});
    cache.set(key, result);
    return result;
  } catch {
    return { street: "غير متاح", district: "غير متاح" };
  }
}

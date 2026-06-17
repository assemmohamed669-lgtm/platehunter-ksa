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
  // Round to 4 decimal places (~11m precision) for cache grouping
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<GeoAddress> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar`;
    const res = await fetch(url, {
      headers: { "User-Agent": "PlateHunterKSA/2.0" },
    });

    if (!res.ok) throw new Error("Geocoding request failed");

    const data = await res.json();
    const addr = data.address ?? {};

    const street =
      addr.road ||
      addr.pedestrian ||
      addr.footway ||
      addr.street ||
      addr.path ||
      "غير معروف";

    const district =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.city_district ||
      addr.county ||
      addr.city ||
      "غير معروف";

    const result: GeoAddress = { street, district };
    cache.set(key, result);
    return result;
  } catch {
    return { street: "غير متاح", district: "غير متاح" };
  }
}

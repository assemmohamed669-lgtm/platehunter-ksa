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

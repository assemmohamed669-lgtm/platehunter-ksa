/**
 * GPS Service for PlateHunter KSA.
 * - Auto mode: pings coordinates every 5 seconds in the background.
 * - Manual pin: captures exact GPS at the moment the agent presses the pin button.
 */

export interface GpsCoords {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

type GpsCallback = (coords: GpsCoords | null) => void;

class GpsService {
  private watchId: number | null = null;
  private lastCoords: GpsCoords | null = null;
  private listeners: Set<GpsCallback> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  /** Start background GPS pinging every 5 seconds. */
  startTracking() {
    if (typeof window === "undefined") return;

    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      return;
    }

    // High-accuracy watch for real-time position
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        this.notifyListeners(this.lastCoords);
      },
      (err) => {
        console.warn("GPS error:", err.message);
        this.notifyListeners(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    // Redundant 5-second ping (notifies listeners even if coords haven't changed,
    // so the UI heartbeat stays alive)
    this.intervalId = setInterval(() => {
      this.notifyListeners(this.lastCoords);
    }, 5000);
  }

  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Subscribe to GPS updates. Returns an unsubscribe function. */
  subscribe(cb: GpsCallback): () => void {
    this.listeners.add(cb);
    // Fire immediately with last known position
    cb(this.lastCoords);
    return () => this.listeners.delete(cb);
  }

  /** Returns the last known position (may be null if GPS not yet acquired). */
  getLastCoords(): GpsCoords | null {
    return this.lastCoords;
  }

  /** Manual pin: captures the exact current position with a fresh one-time query. */
  async pinCurrentLocation(): Promise<GpsCoords> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: GpsCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          this.lastCoords = coords;
          resolve(coords);
        },
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    });
  }

  private notifyListeners(coords: GpsCoords | null) {
    this.listeners.forEach((cb) => cb(coords));
  }
}

// Singleton
export const gpsService = new GpsService();

/** Build a Google Maps link from coordinates */
export function toMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Reverse of toMapsLink — extracts {lat, lng} back out of a maps URL, if present. */
export function extractLatLngFromMapsLink(url: string): { lat: number; lng: number } | null {
  const match = url.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

/** Great-circle distance between two coordinates, in kilometers. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

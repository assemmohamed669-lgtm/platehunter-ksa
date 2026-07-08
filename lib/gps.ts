export interface GpsCoords {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

type GpsCallback = (coords: GpsCoords | null) => void;

class GpsService {
  private watchId: number | null = null;
  private capWatchId: string | null = null;
  private lastCoords: GpsCoords | null = null;
  private listeners: Set<GpsCallback> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  async startTracking() {
    if (typeof window === "undefined") return;

    // Native Android: use Capacitor Geolocation plugin
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        await Geolocation.requestPermissions();

        // Phase 1 — a FAST, coarse fix (network/wi-fi, no satellite lock) so a
        // location shows in ~1-2s instead of the 15-45s a cold high-accuracy
        // GPS lock can take. Best-effort; the watch below refines it.
        Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 })
          .then((pos) => {
            if (!pos) return;
            this.lastCoords = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            };
            this.notifyListeners(this.lastCoords);
          })
          .catch(() => {});

        // Phase 2 — keep refining with high accuracy in the background.
        this.capWatchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 20000 },
          (pos, err) => {
            // A transient watch error must NOT wipe an already-good fix.
            if (err || !pos) { if (!this.lastCoords) this.notifyListeners(null); return; }
            this.lastCoords = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            };
            this.notifyListeners(this.lastCoords);
          }
        );
        this.intervalId = setInterval(() => this.notifyListeners(this.lastCoords), 5000);
        return;
      }
    } catch (e) {
      console.warn("Capacitor geolocation failed, falling back to web API:", e);
    }

    // Web fallback (browser)
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      return;
    }

    // Phase 1 — fast, coarse fix (cached up to 60s is fine) shown immediately.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.lastCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        this.notifyListeners(this.lastCoords);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );

    // Phase 2 — high-accuracy watch refines it in the background.
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
        if (!this.lastCoords) this.notifyListeners(null);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    this.intervalId = setInterval(() => this.notifyListeners(this.lastCoords), 5000);
  }

  stopTracking() {
    if (this.capWatchId !== null) {
      const id = this.capWatchId;
      this.capWatchId = null;
      import("@capacitor/geolocation").then(({ Geolocation }) => {
        Geolocation.clearWatch({ id });
      }).catch(() => {});
    }
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  subscribe(cb: GpsCallback): () => void {
    this.listeners.add(cb);
    cb(this.lastCoords);
    return () => this.listeners.delete(cb);
  }

  getLastCoords(): GpsCoords | null {
    return this.lastCoords;
  }

  async pinCurrentLocation(): Promise<GpsCoords> {
    // Native Android
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        // Accept a fix up to 10s old so a good recent lock returns instantly.
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
        const coords: GpsCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        };
        this.lastCoords = coords;
        return coords;
      }
    } catch (e) {
      console.warn("Capacitor getCurrentPosition failed:", e);
      // Don't strand the caller — a fix from the running watch is good enough.
      if (this.lastCoords) return this.lastCoords;
    }

    // Web fallback
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        if (this.lastCoords) { resolve(this.lastCoords); return; }
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
        (err) => {
          // Fall back to the most recent watch fix rather than failing outright.
          if (this.lastCoords) resolve(this.lastCoords);
          else reject(new Error(err.message));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
      );
    });
  }

  private notifyListeners(coords: GpsCoords | null) {
    this.listeners.forEach((cb) => cb(coords));
  }
}

export const gpsService = new GpsService();

export function toMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function extractLatLngFromMapsLink(url: string): { lat: number; lng: number } | null {
  const match = url.match(/q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!match) return null;
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
}

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

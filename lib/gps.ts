export interface GpsCoords {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

type GpsCallback = (coords: GpsCoords | null) => void;

// فوق الزمن ده الفيكس القديم يُعتبر "بايت" (المندوب على الأرجح اتحرك مكانه).
export const GPS_STALE_MS = 10000;
// فيكس بالدقة دي أو أحسن = كفاية للشارع؛ الحداثة ساعتها أهم من فرق دقة بسيط.
export const GPS_GOOD_ACCURACY_M = 20;

/**
 * يقرّر أي فيكس نحتفظ بيه: الأحدث **مش** دايماً الأفضل. فيكس شبكة/واي-فاي خشن
 * (±٤٠م) ممكن يوصل بعد قفلة GPS دقيقة (±٨م) ويمسحها → الموقع يقع في الشارع
 * الموازي. الحل: نسيب الفيكس الخشن يمسح الكويس بس لو (أ) القديم بقى بايت، أو
 * (ب) الجديد دقته كويسة أصلاً. دالة نقية — قابلة للاختبار. مبنية على منطق
 * Android isBetterLocation الكلاسيكي.
 */
export function pickBetterFix(prev: GpsCoords | null, next: GpsCoords | null): GpsCoords | null {
  if (!next) return prev;
  if (!prev) return next;
  const newer = next.timestamp - prev.timestamp; // موجب = الجديد أحدث
  if (newer > GPS_STALE_MS) return next;   // القديم بايت → المندوب اتحرك → خُد الجديد
  if (newer < -GPS_STALE_MS) return prev;  // الجديد أقدم بكتير (خارج الترتيب) → سيب القديم
  if (next.accuracy <= prev.accuracy) return next; // أدق أو مساوي → خده
  if (newer >= 0 && next.accuracy <= GPS_GOOD_ACCURACY_M) return next; // أحدث ودقته كويسة → الحداثة أهم
  return prev; // الجديد أقل دقة وأحدث بشوية بس → سيب الفيكس الكويس القريب
}

/** تصنيف جودة الدقة لعرضها للمندوب: ممتاز / متوسط / ضعيف. */
export function gpsAccuracyLevel(accuracy: number): "good" | "ok" | "poor" {
  if (!isFinite(accuracy) || accuracy <= 0) return "poor";
  if (accuracy <= 15) return "good";
  if (accuracy <= 35) return "ok";
  return "poor";
}

class GpsService {
  private watchId: number | null = null;
  private capWatchId: string | null = null;
  private lastCoords: GpsCoords | null = null;
  private listeners: Set<GpsCallback> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startCount = 0;

  async startTracking() {
    if (typeof window === "undefined") return;

    // مستخدمين كُثُر بيشاركوا نفس المتتبّع (المكوّن الدائم للحضور + صفحات التشييك/
    // التسجيل/الخرائط). نعدّهم عشان مانفتحش أكتر من watch (بطارية) ومانوقفش
    // التتبّع طالما لسه فيه مستخدم واحد محتاجه. النداء الزائد = زيادة العدّاد بس.
    this.startCount++;
    if (this.startCount > 1) return;

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
            this.lastCoords = pickBetterFix(this.lastCoords, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
            this.notifyListeners(this.lastCoords);
          })
          .catch(() => {});

        // Phase 2 — keep refining with high accuracy in the background.
        this.capWatchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 20000 },
          (pos, err) => {
            // A transient watch error must NOT wipe an already-good fix.
            if (err || !pos) { if (!this.lastCoords) this.notifyListeners(null); return; }
            this.lastCoords = pickBetterFix(this.lastCoords, {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
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
        this.lastCoords = pickBetterFix(this.lastCoords, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        this.notifyListeners(this.lastCoords);
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );

    // Phase 2 — high-accuracy watch refines it in the background.
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastCoords = pickBetterFix(this.lastCoords, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
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
    // مستخدم واحد ساب المتتبّع — لسه فيه غيره؟ سيبه شغّال. أوقفه بس لما مايبقاش
    // فيه ولا مستخدم (العدّاد وصل صفر).
    if (this.startCount > 0) this.startCount--;
    if (this.startCount > 0) return;
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
        // «تحديث» = المندوب عايز موقعه الحالي بالظبط → اقرا فيكس جديد تماماً
        // (maximumAge:0) عشان مايرجعش نفس الفيكس الغلط المخزّن.
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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

/**
 * يحاول يطلّع إحداثيات من خلية GPS — يدعم رابط خرائط (q=lat,lng) وكمان
 * صيغة "lat,lng" الخام.
 */
export function parseLatLngCell(raw: string): { lat: number; lng: number } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const fromLink = extractLatLngFromMapsLink(s);
  if (fromLink) return fromLink;
  const m = s.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  return null;
}

// تقدير زمن الوصول بالسيارة (أوفلاين) من المسافة المستقيمة:
// نضرب في معامل الطرق (الطرق أطول من الخط المستقيم) ونقسم على سرعة مدينة متوسطة.
const ROAD_FACTOR = 1.3;      // الطريق الفعلي ≈ 1.3× المسافة المستقيمة
const CITY_SPEED_KMH = 30;    // سرعة متوسطة داخل المدينة

export function estimateDriveMinutes(straightKm: number): number {
  if (!isFinite(straightKm) || straightKm < 0) return Infinity;
  return (straightKm * ROAD_FACTOR) / CITY_SPEED_KMH * 60;
}

/** مسافة مقروءة: أمتار تحت الكيلو، وإلا كيلومترات. */
export function formatDistanceKm(km: number): string {
  if (!isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} م`;
  return `${km.toFixed(1)} كم`;
}

/** زمن مقروء: دقائق، أو ساعات ودقائق. */
export function formatDurationMin(min: number): string {
  if (!isFinite(min)) return "—";
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} س ${r} د` : `${h} س`;
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

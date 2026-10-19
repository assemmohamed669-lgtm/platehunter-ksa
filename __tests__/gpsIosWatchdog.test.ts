import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 📍 حارس الموقع على الآيفون — تقرير الصندوق الأسود (١٩ أكتوبر ٢٠٢٦، آيفون ١٦ برو ماكس): ٦ دقايق الآيفون بيبعت موقع جديد
 * ~مرة ونص في الثانية وكل لوحة بمكانها، وبعدين **وقف خالص** (صفر تحديثات لـ١٤٦ ثانية والبرنامج قدامه) والقراية الجديدة بترجع
 * نفس القديمة ⇒ كل اللوحات بنقطة واحدة. الآيفون بيوقّف الموقع لوحده لما يحس إن صاحبه واقف (ووضع الطاقة المنخفضة بيسرّعه)
 * ومابيرجعش لوحده — البرنامج لازم يعيد تشغيله. المالك: «ماشي المهم ميأثرش علي باقي المناديب».
 * ⇒ الآيفون بس، والبرنامج قدامه، والموقع واقف ⇒ نعيد تشغيله. شغّال كويس ⇒ ولا حاجة بتتغيّر. الأندرويد/المتصفّح مايتلمسوش.
 */
type Pos = { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number };

let watches: { id: string; cb: (p: Pos | null, err?: unknown) => void }[];
let clearWatch: ReturnType<typeof vi.fn>;
let getCurrentPosition: ReturnType<typeof vi.fn>;
let vis = "visible";

async function load(platform: "ios" | "android") {
  vi.resetModules();
  watches = [];
  clearWatch = vi.fn(async () => {});
  getCurrentPosition = vi.fn(async (): Promise<Pos> => ({ coords: { latitude: 24.7, longitude: 46.6, accuracy: 18 }, timestamp: Date.now() - 20_000 }));
  vi.doMock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => platform } }));
  vi.doMock("@capacitor/geolocation", () => ({
    Geolocation: {
      requestPermissions: async () => ({ location: "granted" }),
      getCurrentPosition,
      watchPosition: async (_o: unknown, cb: (p: Pos | null, err?: unknown) => void) => {
        const id = "w" + (watches.length + 1);
        watches.push({ id, cb });
        return id;
      },
      clearWatch,
    },
  }));
  const m = await import("@/lib/gps");
  m.__resetNativeCache();
  return m;
}
const tick = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };
const send = (lat = 24.7) => watches[watches.length - 1].cb({ coords: { latitude: lat, longitude: 46.6, accuracy: 4 }, timestamp: Date.now() });

beforeEach(() => {
  vi.useFakeTimers();
  vis = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => vis });
});
afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@capacitor/geolocation");
});

describe("🔴 الآيفون: الموقع وقف ⇒ بيتعاد تشغيله لوحده", () => {
  it("شغّال كويس (تحديث كل ثانية) ⇒ ولا إعادة تشغيل", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    for (let i = 0; i < 30; i++) { send(24.7 + i * 1e-5); await tick(1000); }
    expect(watches.length).toBe(1);
    expect(clearWatch).not.toHaveBeenCalled();
    gpsService.stopTracking();
  });

  it("وقف ٦ ثواني والبرنامج قدامه ⇒ بيقفل المراقب القديم ويشغّل واحد جديد", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    send(); await tick(1000);
    await tick(7000);
    expect(clearWatch).toHaveBeenCalledWith({ id: "w1" });
    expect(watches.length).toBe(2);
    // المراقب الجديد بيوصّل ⇒ الموقع بيرجع يتحدّث
    send(24.71);
    expect(gpsService.getLastCoords()?.lat).toBe(24.71);
    gpsService.stopTracking();
  });

  it("لسه واقف بعد الإعادة ⇒ مش أكتر من مرة كل ١٥ ثانية", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    send(); await tick(1000);
    await tick(7000);
    expect(watches.length).toBe(2);
    await tick(10_000);
    expect(watches.length).toBe(2);
    await tick(6000);
    expect(watches.length).toBe(3);
    gpsService.stopTracking();
  });

  it("أول تشغيل ولسه ماجاش ولا موقع ⇒ بيستنى ٣٠ ثانية (قفلة الأقمار بتاخد وقت)", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    await tick(20_000);
    expect(watches.length).toBe(1);
    await tick(11_000);
    expect(watches.length).toBe(2);
    gpsService.stopTracking();
  });

  it("لوحة جت والموقع واقف ⇒ إعادة التشغيل على طول (من غير ما يستنى العدّاد)", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    send(); await tick(1000);
    vi.setSystemTime(Date.now() + 6500);        // الوقت عدّى من غير ما العدّاد يلف
    await gpsService.getFreshReading({ timeoutMs: 100 });
    await tick(0);
    expect(watches.length).toBe(2);
    gpsService.stopTracking();
  });

  it("وقف التتبّع في نص الإعادة ⇒ المراقب الجديد بيتقفل (مايفضلش شغّال على الفاضي)", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    send(); await tick(1000);
    await tick(6000);                              // الإعادة بدأت
    gpsService.stopTracking();
    await tick(2000);
    const lastId = watches[watches.length - 1].id;
    expect(clearWatch).toHaveBeenCalledWith({ id: lastId });
  });
});

describe("🔒 باقي المناديب زي ما هم", () => {
  it("الأندرويد: حتى لو الموقع وقف دقيقة ⇒ ولا حاجة بتتغيّر", async () => {
    const { gpsService } = await load("android");
    await gpsService.startTracking();
    send(); await tick(60_000);
    expect(watches.length).toBe(1);
    expect(clearWatch).not.toHaveBeenCalled();
    gpsService.stopTracking();
  });
  it("الآيفون والبرنامج في الخلفية ⇒ مابنعملش حاجة", async () => {
    const { gpsService } = await load("ios");
    await gpsService.startTracking();
    send(); vis = "hidden";
    await tick(60_000);
    expect(watches.length).toBe(1);
    gpsService.stopTracking();
  });
});

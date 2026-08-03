import { describe, it, expect, beforeEach, vi } from "vitest";
import { gpsService, type GpsCoords } from "@/lib/gps";

/**
 * «الموقع مش متقري، وأدوس تحديث ومفيش أي استجابة ولا تغيير» — شكوى مندوب
 * (٢٠٢٦/٠٨/٠٢)، وقال إن **الشبكة عنده كويسة**.
 *
 * والسبب في الكود: `pinCurrentLocation` بتطلب `enableHighAccuracy: true` بس،
 * يعني **أقمار صناعية فقط**. المندوب جوّه عربية أو مبنى فالقفلة الباردة بتاخد
 * أكتر من ١٥ ثانية أو مابتجيش. وقتها الكود:
 *   • بيسجّل الغلط في console (المندوب مايشوفهوش)
 *   • **بيرجّع نفس الفيكس القديم** ⇒ الواجهة مافيهاش أي تغيير
 * وده حرفياً «مفيش أي استجابة».
 *
 * والشبكة الكويسة هي الدليل: الشبكة تمام، بس إحنا مش بنستعملها.
 *
 * المطلوب: لو الدقة العالية فشلت، **نجرّب الشبكة** قبل ما نستسلم؛ ولو رجّعنا
 * فيكس قديم، نعلّمه `stale` عشان الواجهة تقول للمندوب الحقيقة.
 */

type PosCb = (p: GeolocationPosition) => void;
type ErrCb = (e: GeolocationPositionError) => void;

const pos = (lat: number, lng: number, acc: number): GeolocationPosition =>
  ({ coords: { latitude: lat, longitude: lng, accuracy: acc }, timestamp: Date.now() } as GeolocationPosition);

function mockGeo(handler: (opts: PositionOptions | undefined) => GeolocationPosition | Error) {
  const calls: (PositionOptions | undefined)[] = [];
  (globalThis as any).navigator = {
    geolocation: {
      getCurrentPosition: (ok: PosCb, bad: ErrCb, opts?: PositionOptions) => {
        calls.push(opts);
        const r = handler(opts);
        if (r instanceof Error) bad({ code: 2, message: r.message } as GeolocationPositionError);
        else ok(r);
      },
      watchPosition: () => 1,
      clearWatch: () => {},
    },
  };
  return calls;
}

beforeEach(() => {
  (gpsService as any).lastCoords = null;
  vi.restoreAllMocks();
});

describe("تحديث الموقع — الرجوع للشبكة لما الأقمار تفشل", () => {
  it("الدقة العالية فشلت ⇒ يجرّب الشبكة بدل ما يستسلم", async () => {
    const calls = mockGeo((o) =>
      o?.enableHighAccuracy ? new Error("Timeout expired") : pos(25.1, 55.2, 40),
    );
    const c = await gpsService.pinCurrentLocation();
    expect(c.lat).toBeCloseTo(25.1);
    expect(calls.length).toBe(2);                    // محاولتين: أقمار ثم شبكة
    expect(calls[0]?.enableHighAccuracy).toBe(true);
    expect(calls[1]?.enableHighAccuracy).toBe(false);
    expect((c as GpsCoords).stale).toBeFalsy();      // فيكس جديد، مش قديم
  });

  it("الاتنين فشلوا وفيه فيكس قديم ⇒ يرجّعه **معلّم stale**", async () => {
    (gpsService as any).lastCoords = { lat: 1, lng: 2, accuracy: 10, timestamp: Date.now() - 60000 };
    mockGeo(() => new Error("Position unavailable"));
    const c = await gpsService.pinCurrentLocation();
    expect(c.lat).toBe(1);
    expect((c as GpsCoords).stale).toBe(true);       // ← ده اللي يخلّي الواجهة تقول الحقيقة
  });

  it("الاتنين فشلوا ومافيش فيكس قديم ⇒ يرمي غلط بسبب واضح", async () => {
    mockGeo(() => new Error("User denied Geolocation"));
    await expect(gpsService.pinCurrentLocation()).rejects.toThrow(/denied|Geolocation/i);
  });

  it("الدقة العالية نجحت ⇒ محاولة واحدة بس، وبلا stale", async () => {
    const calls = mockGeo(() => pos(30.5, 31.5, 8));
    const c = await gpsService.pinCurrentLocation();
    expect(c.accuracy).toBe(8);
    expect(calls.length).toBe(1);
    expect((c as GpsCoords).stale).toBeFalsy();
  });
});

/**
 * «التصدير التلقائي» في صفحة التشييك: مفتاح لما يكون مفتوح، اللوحات المتشيّكة
 * بتروح لشيت السجلات لوحدها. مقفول = زي ما هو، لازم يدوس «تصدير للسجلات».
 *
 * **القاعدة الحاكمة (بأمر المالك): مفيش تصدير تلقائي بلا موقع.**
 * «بدون ما يتحط موقعها بالظبط ملهاش لازمه مع المندوب» — فاللوحة اللي لسه
 * مستنية الـGPS بتفضل في التشييك، مهما طال، مش بتتصدّر ناقصة.
 */
import { describe, it, expect } from "vitest";
import {
  readyForAutoExport, waitingForLocation, hasRowLocation, loadAutoExport, saveAutoExport,
  AUTO_EXPORT_TICK_MS, AUTO_EXPORT_KEY,
} from "@/lib/autoExport";

type R = { id: string; mapsLink?: string | null; lat?: number | null };
const withGps = (id: string): R => ({ id, lat: 24.7, mapsLink: "https://maps.google.com/?q=24.7,46.6" });
const noGps = (id: string): R => ({ id });

describe("readyForAutoExport", () => {
  it("اللي معاه موقع بيتصدّر", () => {
    expect(readyForAutoExport([withGps("a")]).map((r) => r.id)).toEqual(["a"]);
  });

  it("اللي بلا موقع مايتصدّرش — أبداً", () => {
    expect(readyForAutoExport([noGps("a")])).toEqual([]);
  });

  it("مفيش مهلة تعدّي وتصدّره ناقص — مهما طال", () => {
    // مافيش بارامتر وقت أصلاً: القرار على الموقع بس، مش على الانتظار.
    expect(readyForAutoExport([noGps("a")])).toEqual([]);
    expect(readyForAutoExport([noGps("a")])).toEqual([]);
  });

  it("بيخلط: الجاهز يمشي واللي مستني يفضل", () => {
    const out = readyForAutoExport([withGps("a"), noGps("b"), withGps("c")]);
    expect(out.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("قايمة فاضية", () => {
    expect(readyForAutoExport([])).toEqual([]);
  });
});

describe("waitingForLocation", () => {
  it("بيعدّ اللي لسه مستني موقعه", () => {
    expect(waitingForLocation([withGps("a"), noGps("b"), noGps("c")])).toBe(2);
  });

  it("كلهم جاهزين = صفر", () => {
    expect(waitingForLocation([withGps("a")])).toBe(0);
  });

  it("قايمة فاضية = صفر", () => {
    expect(waitingForLocation([])).toBe(0);
  });
});

describe("hasRowLocation — قاعدة واحدة للتلات طرق", () => {
  it("رابط خريطة = معاه موقع", () => {
    expect(hasRowLocation({ mapsLink: "https://maps.google.com/?q=24,46" })).toBe(true);
  });

  it("إحداثيات من غير رابط = معاه موقع", () => {
    expect(hasRowLocation({ lat: 24.7 })).toBe(true);
  });

  it("خط عرض صفر = موقع صحيح، مش «فاضي»", () => {
    expect(hasRowLocation({ lat: 0 })).toBe(true);
  });

  it("ولا واحدة = لسه بلا موقع", () => {
    expect(hasRowLocation({})).toBe(false);
    expect(hasRowLocation({ mapsLink: "", lat: null })).toBe(false);
    expect(hasRowLocation({ mapsLink: null, lat: undefined })).toBe(false);
  });
});

describe("إيقاع المحرّك", () => {
  it("بيبص كل شوية — بسرعة كفاية إن اللوحة تروح أول ما موقعها يوصل", () => {
    expect(AUTO_EXPORT_TICK_MS).toBeLessThanOrEqual(5_000);
  });

  it("ومش سريع لدرجة إنه يتعب الجهاز", () => {
    expect(AUTO_EXPORT_TICK_MS).toBeGreaterThanOrEqual(1_000);
  });
});

describe("الافتراضي مقفول — مفيش سلوك بيتغيّر لحد من غير ما يطلبه", () => {
  it("مفيش قيمة محفوظة = مقفول", () => {
    try { localStorage.removeItem(AUTO_EXPORT_KEY); } catch { /* ignore */ }
    expect(loadAutoExport()).toBe(false);
  });

  it("بيفتكر اختيار المندوب", () => {
    saveAutoExport(true);
    expect(loadAutoExport()).toBe(true);
    saveAutoExport(false);
    expect(loadAutoExport()).toBe(false);
  });
});

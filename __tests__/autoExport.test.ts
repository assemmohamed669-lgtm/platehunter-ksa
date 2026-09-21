/**
 * «التصدير التلقائي» في صفحة التشييك: مفتاح لما يكون مفتوح، اللوحات المتشيّكة
 * بتروح لشيت السجلات لوحدها من غير ما المندوب يدوس. مقفول = زي ما هو بالظبط،
 * لازم يدوس «تصدير اللوحات للسجلات».
 *
 * الحتة الحسّاسة: **الموقع**. اللوحة بتتسجّل قبل ما الـGPS يوصل بثواني، فلو
 * صدّرناها على طول بتتحفظ في السجلات **بلا موقع للأبد**. فالتلقائي بيستنى
 * الموقع، وبمهلة قصوى عشان اللوحة ماتعلّقش لو الـGPS مقفول خالص.
 */
import { describe, it, expect } from "vitest";
import {
  trackFirstSeen, readyForAutoExport, hasRowLocation, loadAutoExport, saveAutoExport,
  AUTO_EXPORT_WAIT_MS, AUTO_EXPORT_TICK_MS, AUTO_EXPORT_KEY,
} from "@/lib/autoExport";

type R = { id: string; gps: boolean };
const row = (id: string, gps = false): R => ({ id, gps });
const idOf = (r: R) => r.id;
const hasLoc = (r: R) => r.gps;

describe("trackFirstSeen", () => {
  it("بيسجّل أول مرة شاف فيها كل صف", () => {
    const seen = new Map<string, number>();
    trackFirstSeen(["a", "b"], seen, 1000);
    expect(seen.get("a")).toBe(1000);
    expect(seen.get("b")).toBe(1000);
  });

  it("مابيغيّرش وقت صف شافه قبل كده", () => {
    const seen = new Map([["a", 1000]]);
    trackFirstSeen(["a", "b"], seen, 5000);
    expect(seen.get("a")).toBe(1000);
    expect(seen.get("b")).toBe(5000);
  });

  it("بينضّف الصفوف اللي راحت (اتصدّرت أو اتمسحت)", () => {
    const seen = new Map([["a", 1000], ["قديم", 1000]]);
    trackFirstSeen(["a"], seen, 5000);
    expect(seen.has("قديم")).toBe(false);
    expect(seen.has("a")).toBe(true);
  });
});

describe("readyForAutoExport", () => {
  const seen = (ids: [string, number][]) => new Map(ids);

  it("الصف اللي معاه موقع بيتصدّر على طول", () => {
    const out = readyForAutoExport([row("a", true)], idOf, hasLoc, seen([["a", 0]]), 0);
    expect(out.map(idOf)).toEqual(["a"]);
  });

  it("الصف اللي لسه بلا موقع بيستنى — مايتصدّرش ناقص", () => {
    const out = readyForAutoExport([row("a", false)], idOf, hasLoc, seen([["a", 0]]), 1000);
    expect(out).toEqual([]);
  });

  it("بس مايستناش للأبد — بعد المهلة بيتصدّر بلا موقع", () => {
    const out = readyForAutoExport([row("a", false)], idOf, hasLoc, seen([["a", 0]]), AUTO_EXPORT_WAIT_MS + 1);
    expect(out.map(idOf)).toEqual(["a"]);
  });

  it("بيخلط: اللي جاهز يمشي واللي لسه يستنى", () => {
    const out = readyForAutoExport(
      [row("a", true), row("b", false), row("c", true)],
      idOf, hasLoc, seen([["a", 0], ["b", 0], ["c", 0]]), 500,
    );
    expect(out.map(idOf)).toEqual(["a", "c"]);
  });

  it("صف لسه ما اتسجّلش في الخريطة بيتعامل كأنه دلوقتي (يستنى)", () => {
    const out = readyForAutoExport([row("جديد", false)], idOf, hasLoc, new Map(), 9_999_999);
    expect(out).toEqual([]);
  });

  it("قايمة فاضية", () => {
    expect(readyForAutoExport([], idOf, hasLoc, new Map(), 0)).toEqual([]);
  });

  it("المهلة قابلة للتغيير", () => {
    const out = readyForAutoExport([row("a", false)], idOf, hasLoc, seen([["a", 0]]), 100, 50);
    expect(out.map(idOf)).toEqual(["a"]);
  });

  it("المهلة الافتراضية معقولة — ثوانٍ مش دقايق", () => {
    expect(AUTO_EXPORT_WAIT_MS).toBeGreaterThanOrEqual(5_000);
    expect(AUTO_EXPORT_WAIT_MS).toBeLessThanOrEqual(60_000);
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
  it("الدورة أسرع بكتير من مهلة انتظار الموقع", () => {
    // لو الاتنين قرّبوا، الصف اللي الـGPS مش جايله بيقعد دورات زيادة مستني.
    expect(AUTO_EXPORT_TICK_MS).toBeLessThan(AUTO_EXPORT_WAIT_MS / 4);
  });

  it("الدورة مش سريعة لدرجة إنها تتعب الجهاز", () => {
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

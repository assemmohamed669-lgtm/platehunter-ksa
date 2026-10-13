import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import {
  ALERT_TONES, DEFAULT_ALERT_TONE, ALERT_TONES_FOR_ALL, alertToneById, loadAlertToneId, saveAlertToneId,
} from "@/lib/alertTones";

/**
 * 🔔 «نغمة التحصيل» — المالك (١٤ أكتوبر ٢٠٢٦): «عايزك تضيف نغمات الرنين اللي في الرابط دة للبرنامج … وحط في صفحه
 * الخلفيه والنمط خيار اسمه نغمه التحصيل وحطهم فيه بحيث ان المندوب لو حب يختار واحده فيهم تبقي نغمه يسمعها لما
 * يلاقي سيارة مطلوبه». الصفّارة الحالية تفضل الافتراضي، والنغمة بتلف لحد «تم» زيها بالظبط.
 */
const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

describe("🔴 قايمة النغمات", () => {
  it("الافتراضي = صفّارة البرنامج (من غير ملف) + نغمات المالك الـ١٢", () => {
    expect(DEFAULT_ALERT_TONE).toBe("siren");
    expect(ALERT_TONES[0]).toMatchObject({ id: "siren", file: null });
    expect(ALERT_TONES.filter((t) => t.file).length).toBe(12);
    expect(new Set(ALERT_TONES.map((t) => t.id)).size).toBe(ALERT_TONES.length);
    for (const t of ALERT_TONES) expect(t.name.trim()).not.toBe("");
  });
  it("كل ملف موجود في public/tones وخفيف (أقل من ٤٠٠ كيلو — بيتحمّل في الذاكرة وهو بيرن)", () => {
    for (const t of ALERT_TONES.filter((x) => x.file)) {
      expect(t.file).toMatch(/^\/tones\/[a-z0-9-]+\.mp3$/);
      const p = path.join(ROOT, "public", t.file as string);
      expect(existsSync(p), p).toBe(true);
      expect(statSync(p).size).toBeLessThan(400_000);
    }
  });
});

describe("🔴 الاختيار بيتحفظ على الموبايل", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("مفيش اختيار ⇒ الصفّارة", () => {
    expect(loadAlertToneId()).toBe("siren");
  });
  it("اختار نغمة ⇒ بتفضل محفوظة", () => {
    saveAlertToneId("military");
    expect(loadAlertToneId()).toBe("military");
  });
  it("نغمة مش موجودة (اتشالت مثلاً) ⇒ الصفّارة — عمره ما يسكت", () => {
    saveAlertToneId("gone");
    expect(loadAlertToneId()).toBe("siren");
    expect(alertToneById("gone").id).toBe("siren");
  });
  it("التخزين واقع ⇒ الصفّارة ومن غير ما يوقع", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("x"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("x"); });
    expect(loadAlertToneId()).toBe("siren");
    expect(() => saveAlertToneId("funny")).not.toThrow();
  });
});

describe("🔴 التوصيل", () => {
  it("🔓 «انشر للكل» (المالك ١٤ أكتوبر ٢٠٢٦) — الخيار ظاهر لكل المناديب (والشرط فاضل للرجوع)", () => {
    expect(ALERT_TONES_FOR_ALL).toBe(true);
    const page = read("app/(app)/appearance/page.tsx");
    expect(page).toMatch(/نغمة التحصيل/);
    expect(page).toMatch(/\(ALERT_TONES_FOR_ALL \|\| isSuper\) &&/);
  });
  it("تنبيه المطلوب بيحمّل النغمة المختارة من أول ما التطبيق يفتح", () => {
    expect(read("components/WantedAlertOverlay.tsx")).toMatch(/void preloadAlertTone\(\);/);
  });
});

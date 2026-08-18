import { describe, it, expect } from "vitest";
import { pickModelBase, MODEL_URL_MAX_AGE_MS } from "@/lib/modelEndpoint";

/**
 * خدمة الموديل بتتعرض عبر نفق **مؤقت** — الرابط بيتغيّر كل مرة الجهاز يشتغل.
 * فبقت تسجّل رابطها في الإعدادات، والتطبيق يقراه لوحده بدل ما يتحط في كل
 * تليفون يدوي.
 *
 * وبنتجاهل الرابط لو **قديم**: نفق واقع من امبارح رابطه لسه مكتوب، والطلب
 * عليه بيستنى ويفشل — أحسن نعتبره مقفول من الأول ونروح على البديل.
 */
const now = 1_700_000_000_000;
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("اختيار عنوان خدمة الموديل", () => {
  it("الرابط المسجّل حديثاً بيتستخدم", () => {
    expect(pickModelBase({ url: "https://abc.trycloudflare.com", at: ago(60_000) }, null, now))
      .toBe("https://abc.trycloudflare.com");
  });

  it("الرابط القديم بيتتجاهل — النفق غالباً واقع", () => {
    expect(pickModelBase({ url: "https://old.trycloudflare.com", at: ago(MODEL_URL_MAX_AGE_MS + 1000) }, null, now))
      .toBeNull();
  });

  it("رابط الجهاز اليدوي بيغلب — الأدمن بيجرّب حاجة معيّنة", () => {
    expect(pickModelBase({ url: "https://auto.example.com", at: ago(1000) }, "https://manual.example.com", now))
      .toBe("https://manual.example.com");
  });

  it("مافيش مسجّل → اليدوي", () => {
    expect(pickModelBase(null, "https://manual.example.com", now)).toBe("https://manual.example.com");
  });

  it("مافيش ولا واحد → null (نروح على البديل)", () => {
    expect(pickModelBase(null, null, now)).toBeNull();
  });

  it("الشرطة المايلة في الآخر بتتشال", () => {
    expect(pickModelBase({ url: "https://abc.com/", at: ago(1000) }, null, now)).toBe("https://abc.com");
  });

  it("رابط مش https بيترفض — التطبيق نفسه https", () => {
    expect(pickModelBase({ url: "http://abc.com", at: ago(1000) }, null, now)).toBeNull();
  });

  it("رابط فاضي أو بايظ بيترفض", () => {
    expect(pickModelBase({ url: "", at: ago(1000) }, null, now)).toBeNull();
    expect(pickModelBase({ url: "مش رابط", at: ago(1000) }, null, now)).toBeNull();
  });

  it("مسجّل بلا تاريخ بيترفض — مانعرفش هو حي ولا لأ", () => {
    expect(pickModelBase({ url: "https://abc.com", at: null }, null, now)).toBeNull();
  });
});

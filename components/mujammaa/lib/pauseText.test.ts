import { describe, expect, it } from "vitest";
import { pauseBannerText } from "./pauseText";

/** ⏸️ شريط «واقف مؤقت» (٢٢ أكتوبر ٢٠٢٦): المندوب يعرف إن كلامه مش بيتسجّل، ومن إمتى، وإزاي يكمّل */
describe("pauseBannerText", () => {
  it("بيقول إن اللي بيتقال مش بيتسجّل + مدة الوقفة + إزاي يكمّل في نفس الملف", () => {
    const t = pauseBannerText(65_000);
    expect(t).toContain("1:05");
    expect(t).toContain("مش هتتسجّل");
    expect(t).toContain("كمّل التسجيل");
    expect(t).toContain("نفس الملف");
  });

  it("ساعة وأكتر ⇒ بالساعات", () => {
    expect(pauseBannerText(3_725_000)).toContain("1:02:05");
  });

  it("رقم بايظ ⇒ صفر", () => {
    expect(pauseBannerText(Number.NaN)).toContain("0:00");
    expect(pauseBannerText(-5)).toContain("0:00");
  });
});

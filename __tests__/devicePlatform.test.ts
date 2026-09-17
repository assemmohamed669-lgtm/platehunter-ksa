import { describe, it, expect } from "vitest";
import { resolvePlatform } from "@/lib/devicePlatform";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 Chrome/120";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120";

describe("resolvePlatform", () => {
  it("التطبيق المثبَّت على آيفون → ios بغضّ النظر عن الـUA", () => {
    expect(resolvePlatform("ios", DESKTOP_UA)).toBe("ios");
  });

  it("التطبيق المثبَّت على أندرويد → android", () => {
    expect(resolvePlatform("android", IPHONE_UA)).toBe("android");
  });

  it("متصفح على آيفون → web-ios", () => {
    expect(resolvePlatform("web", IPHONE_UA)).toBe("web-ios");
    expect(resolvePlatform(null, IPHONE_UA)).toBe("web-ios");
  });

  it("متصفح على أندرويد → web-android", () => {
    expect(resolvePlatform("web", ANDROID_UA)).toBe("web-android");
  });

  it("متصفح على كمبيوتر → web", () => {
    expect(resolvePlatform("web", DESKTOP_UA)).toBe("web");
    expect(resolvePlatform(null, "")).toBe("web");
  });
});

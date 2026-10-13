import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { foregroundBannerOf, claimPushListeners } from "@/lib/foregroundPush";

/**
 * 🔔 إشعار وصل والتطبيق **مفتوح** — المالك (١٣ أكتوبر ٢٠٢٦) جرّب «جرّب الإشعار على موبايلي»: «اتبعت على ١ جهاز» بس
 * «مجانيش الاشعار». على أندرويد إشعار FCM والتطبيق قدام المندوب مابيظهرش في الشريط لوحده — بيتسلّم للتطبيق، وماكانش
 * فيه حد بيستقبله (ومستمعين الإشعارات ماكانوش في صفحات لوحة الأدمن خالص). ⇒ شريط فوق الشاشة بنفس الكلام.
 * يعني كمان المندوب اللي فاتح البرنامج وهو شغّال كان مش هيشوف إشعار الشهايد.
 */
describe("🔔 مين يتعرض كشريط", () => {
  it("🔴 إشعار الشهايد (الحقيقي والتجربة) ⇒ شريط بنفس الكلام والدوسة", () => {
    expect(foregroundBannerOf({ title: "📄 نزل ٢٣ شهادة جديدة", body: "الراجحي ١٥", data: { kind: "certs", url: "/wanted" } }))
      .toEqual({ title: "📄 نزل ٢٣ شهادة جديدة", body: "الراجحي ١٥", url: "/wanted" });
    expect(foregroundBannerOf({ title: "🧪 تجربة — 📄 نزل ٣ شهادة جديدة", body: "x", data: { kind: "certs-test", url: "/wanted" } })?.title)
      .toContain("تجربة");
    expect(foregroundBannerOf({ title: "📄", body: "", data: { kind: "certs", url: "/instant-check?tab=cert" } })?.url)
      .toBe("/instant-check?tab=cert");
  });
  it("🔒 «لقى سيارة مطلوبة» لأ — ليها تنبيه جوّه التطبيق أصلاً (مايتكرّرش)", () => {
    expect(foregroundBannerOf({ title: "🚗 أحمد لقى سيارة مطلوبة", body: "", data: { url: "/group-find?id=1" } })).toBeNull();
  });
  it("من غير عنوان ⇒ لأ", () => {
    expect(foregroundBannerOf({ title: "", body: "", data: { kind: "certs" } })).toBeNull();
  });
});

describe("🔴 المستمعين بيتسجّلوا مرة واحدة بس (حتى لو الصفحات اتنقلت بين التطبيق ولوحة الأدمن)", () => {
  it("التانية ⇒ لأ", () => {
    expect(claimPushListeners()).toBe(true);
    expect(claimPushListeners()).toBe(false);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 الإشعار والتطبيق مفتوح ⇒ الشريط", () => {
    const r = read("components/PushRegistrar.tsx");
    expect(r).toMatch(/addListener\("pushNotificationReceived", \(n\) => \{\n\s+const b = foregroundBannerOf\(n\);/);
    expect(r).toMatch(/if \(claimPushListeners\(\)\) \{/);
  });
  it("🔴 صفحات التطبيق ولوحة الأدمن الاتنين", () => {
    const app = read("app/(app)/layout.tsx");
    expect(app).toMatch(/<PushRegistrar \/>\n\s+<ForegroundPushBanner \/>/);
    const admin = read("app/admin/layout.tsx");
    expect(admin).toMatch(/<PushRegistrar \/>/);
    expect(admin).toMatch(/<ForegroundPushBanner \/>/);
  });
});

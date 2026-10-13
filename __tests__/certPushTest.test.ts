import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { certPushTestMessage } from "@/lib/certPush";

/**
 * 🧪 تجربة إشعار الشهايد على موبايل السوبر أدمن — المالك (١٣ أكتوبر ٢٠٢٦): «مفيش اي استعلام نعمله ل السوبر ادمن يشوف
 * من خلاله ان فيه اشعارات بالفعل بتيجي حتي لو اي اشعار وهمي». SQL مايقدرش يبعت إشعار (بيتبعت من السيرفر بـFirebase)،
 * فزرار في «إحصائيات الشهايد» بيبعت نفس الإشعار الحقيقي على أجهزته هو بس ويقول اللي حصل.
 */
describe("🧪 رسالة نتيجة التجربة", () => {
  it("🔴 اتبعت ⇒ بيقول على كام جهاز", () => {
    expect(certPushTestMessage({ configured: true, devices: 2, sent: 2, dead: 0 }))
      .toEqual({ level: "ok", text: "✅ اتبعت على ٢ جهاز — بص على شريط الإشعارات في موبايلك." });
  });
  it("🔴 مافيش جهاز مسجّل ⇒ بيقول يفتح التطبيق المتثبّت ويوافق على الإشعارات", () => {
    const m = certPushTestMessage({ configured: true, devices: 0, sent: 0, dead: 0 });
    expect(m.level).toBe("warn");
    expect(m.text).toContain("مافيش موبايل مسجّل");
  });
  it("🔴 الإشعارات مش متظبّطة على السيرفر", () => {
    expect(certPushTestMessage({ configured: false, devices: 0, sent: 0, dead: 0 }).level).toBe("error");
  });
  it("الأجهزة كلها رفضت (التطبيق اتمسح) ⇒ بيقول", () => {
    const m = certPushTestMessage({ configured: true, devices: 1, sent: 0, dead: 1 });
    expect(m.level).toBe("error");
    expect(m.text).toContain("اتمسح");
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 السوبر أدمن بس، وعلى أجهزته هو بس", () => {
    const r = read("app/api/admin/cert-push-test/route.ts");
    expect(r).toMatch(/if \(!admin \|\| !admin\.isSuper\) return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\);/);
    expect(r).toMatch(/\.from\("device_tokens"\)\.select\("token"\)\.eq\("agent_id", admin\.id\)/);
    expect(r).not.toMatch(/profiles"\)\.select\(/);   // مابيجيبش مشتركين تانيين
  });
  it("🔴 الزرار في صفحة إحصائيات الشهايد", () => {
    expect(read("app/admin/certificates/page.tsx")).toMatch(/fetch\("\/api\/admin\/cert-push-test", \{ method: "POST"/);
  });
});

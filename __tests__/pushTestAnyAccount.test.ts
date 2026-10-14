import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { certPushTestMessage, likeExact } from "@/lib/certPush";

/**
 * 🧪 «جرّب الإشعار» على **حساب تاني** — المالك (١٤ أكتوبر ٢٠٢٦): الآيفون اللي هيجرّب عليه الإشعارات داخل بحساب أدمن
 * (مش السوبر أدمن)، فالتجربة ماكانتش هتوصله. ⇒ خانة إيميل: التجربة تروح لأجهزة الحساب ده. وبتقول الأجهزة المسجّلة
 * آيفون ولا أندرويد — عشان نعرف إن الآيفون اتسجّل فعلاً (ولو مندوب قال «الإشعار مش بيجيلي» نجرّب على حسابه).
 */
describe("🔴 رسالة النتيجة", () => {
  it("على حساب تاني ⇒ بيقول الإيميل ونوع الأجهزة", () => {
    expect(certPushTestMessage({ configured: true, devices: 2, sent: 2, dead: 0, platforms: { ios: 1, android: 1 }, target: "a@b.com" }))
      .toEqual({ level: "ok", text: "✅ اتبعت على ٢ جهاز لـ a@b.com (آيفون ١ · أندرويد ١) — بص على شريط الإشعارات في الموبايل." });
  });
  it("على موبايلي مع نوع الأجهزة", () => {
    expect(certPushTestMessage({ configured: true, devices: 1, sent: 1, dead: 0, platforms: { ios: 1, android: 0 } }).text)
      .toBe("✅ اتبعت على ١ جهاز (آيفون ١) — بص على شريط الإشعارات في موبايلك.");
  });
  it("الحساب التاني مالوش موبايل مسجّل ⇒ يفتح أحدث نسخة ويوافق على الإشعارات", () => {
    const m = certPushTestMessage({ configured: true, devices: 0, sent: 0, dead: 0, target: "a@b.com" });
    expect(m.level).toBe("warn");
    expect(m.text).toContain("a@b.com");
    expect(m.text).toContain("أحدث نسخة");
  });
  it("مفيش حساب بالإيميل ده", () => {
    expect(certPushTestMessage({ configured: true, devices: 0, sent: 0, dead: 0, target: "x@y.com", notFound: true }))
      .toEqual({ level: "error", text: "❌ مفيش حساب بالإيميل x@y.com." });
  });
  it("من غير حساب تاني ونوع الأجهزة ⇒ نفس الرسالة القديمة بالظبط", () => {
    expect(certPushTestMessage({ configured: true, devices: 2, sent: 2, dead: 0 }).text)
      .toBe("✅ اتبعت على ٢ جهاز — بص على شريط الإشعارات في موبايلك.");
  });
});

describe("🔴 البحث بالإيميل بالظبط", () => {
  it("_ و% في الإيميل مايبقوش «أي حرف» في البحث", () => {
    expect(likeExact("ahmed_ali@gmail.com")).toBe("ahmed\\_ali@gmail.com");
    expect(likeExact("a%b\\c")).toBe("a\\%b\\\\c");
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  const r = read("app/api/admin/cert-push-test/route.ts");
  it("🔒 السوبر أدمن بس — زي ما هو", () => {
    expect(r).toMatch(/if \(!admin \|\| !admin\.isSuper\) return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\);/);
  });
  it("إيميل ⇒ الحساب ده بالظبط (حروف كبيرة/صغيرة سوا) · من غيره ⇒ أجهزتي أنا", () => {
    expect(r).toMatch(/\.ilike\("email", likeExact\(email\)\)/);
    expect(r).toMatch(/auth\.admin\.listUsers\(/);   // حسابات إيميلها في الدخول بس
    expect(r).toMatch(/const targetId = email \? /);
    expect(r).toMatch(/\.from\("device_tokens"\)\.select\("token, platform"\)\.eq\("agent_id", targetId\)/);
  });
  it("الصفحة فيها خانة الإيميل وبتبعته", () => {
    const p = read("app/admin/certificates/page.tsx");
    expect(p).toMatch(/placeholder="إيميل حساب تاني \(اختياري\)"/);
    expect(p).toMatch(/body: JSON\.stringify\(\{ email: cleanEmail\(pushEmail\) \}\)/);
  });
});

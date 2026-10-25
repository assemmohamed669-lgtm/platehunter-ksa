/**
 * 📱 رقم التطبيق الحقيقي (٢٥ أكتوبر ٢٠٢٦) — `lib/nativeAppVersion.ts`.
 * المالك: «ليه ظاهر معايا … في القايمه الجانبيه … ان النسخه اللي عندي هيا 1.7 مش 1.8» · «اعمله علشان لو مندوب قال مش
 * شغال اشوف هو شغال علي اي نسخه بالظبط». الـ1.7.0 كان `APP_VERSION` بتاع الصفحات (ثابت) مش رقم التطبيق.
 *  · القايمة: «التطبيق 1.8 (8)» + الصفحات.
 *  · السيرفر: نفس خانة `app_version` = «الصفحات|التطبيق» (من غير SQL) ⇒ صفحة الأدمن بتفصلهم: «أحدث نسخة» من الصفحات
 *    زي الأول + «📱 1.8 (8)».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cap = vi.hoisted(() => ({ native: true, info: { version: "1.8", build: "8" } as { version: string; build: string } | null, throws: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => cap.native } }));
vi.mock("@capacitor/app", () => ({
  App: { getInfo: vi.fn(async () => { if (cap.throws) throw new Error("x"); return cap.info; }) },
}));

async function load() {
  vi.resetModules();
  return await import("@/lib/nativeAppVersion");
}

beforeEach(() => { cap.native = true; cap.info = { version: "1.8", build: "8" }; cap.throws = false; });

describe("📱 رقم التطبيق من الموبايل نفسه", () => {
  it("تطبيق أندرويد/آيفون ⇒ الرقم والبيلد", async () => {
    const m = await load();
    expect(await m.getNativeAppInfo()).toEqual({ version: "1.8", build: "8" });
    expect(m.nativeVersionLabel({ version: "1.8", build: "8" })).toBe("1.8 (8)");
    expect(m.nativeVersionLabel({ version: "1.3", build: "" })).toBe("1.3");
    expect(m.nativeVersionLabel(null)).toBeNull();
  });
  it("متصفح / وقع ⇒ null (والقايمة بتعرض رقم الصفحات بس زي الأول)", async () => {
    cap.native = false;
    expect(await (await load()).getNativeAppInfo()).toBeNull();
    cap.native = true; cap.throws = true;
    expect(await (await load()).getNativeAppInfo()).toBeNull();
  });
});

describe("☁️ اللي بيتبعت للسيرفر وصفحة الأدمن", () => {
  it("الصفحات|التطبيق في نفس الخانة — والمتصفح زي الأول بالحرف", async () => {
    const m = await load();
    expect(m.heartbeatVersion("1.7.0", { version: "1.8", build: "8" })).toBe("1.7.0|1.8 (8)");
    expect(m.heartbeatVersion("1.7.0", null)).toBe("1.7.0");
  });
  it("الأدمن بيفصلهم — والقديم (من غير |) لسه بيتقري", async () => {
    const m = await load();
    expect(m.parseAgentVersion("1.7.0|1.8 (8)")).toEqual({ web: "1.7.0", native: "1.8 (8)" });
    expect(m.parseAgentVersion("1.7.0")).toEqual({ web: "1.7.0", native: null });
    expect(m.parseAgentVersion(null)).toEqual({ web: null, native: null });
  });
});

describe("🔌 التوصيل", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("النبضة بتبعت الرقمين", () => {
    const L = read("app/(app)/layout.tsx");
    expect(L).toMatch(/const hbVersion = heartbeatVersion\(APP_VERSION, await getNativeAppInfo\(\)\);/);
    expect(L).toMatch(/\.rpc\("touch_last_seen", \{ p_version: hbVersion, p_platform: getDevicePlatform\(\) \}\)/);
    expect(L).toMatch(/supabase\.rpc\("touch_last_seen", \{ p_version: hbVersion \}\)/);
  });
  it("القايمة الجانبية بتعرض رقم التطبيق الحقيقي", () => {
    const M = read("components/AppMenu.tsx");
    expect(M).toMatch(/void getNativeAppInfo\(\)\.then\(\(i\) => setNativeVer\(nativeVersionLabel\(i\)\)\)/);
    expect(M).toMatch(/\{nativeVer \? <>التطبيق \{nativeVer\} · الصفحات \{APP_VERSION\}<\/> : <>الإصدار \{APP_VERSION\}<\/>\}/);
  });
  it("صفحة الأدمن: «أحدث نسخة» من الصفحات زي الأول + رقم التطبيق جنبها", () => {
    const A = read("app/admin/page.tsx");
    expect(A).toMatch(/const av = parseAgentVersion\(a\.app_version\);/);
    expect(A).toMatch(/av\.web === APP_VERSION/);
    expect(A).toMatch(/📱 \{av\.native\}/);
  });
});

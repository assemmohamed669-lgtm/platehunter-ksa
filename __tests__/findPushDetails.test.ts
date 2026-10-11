import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFindPush, findDetailsHref, formatFindTime } from "@/lib/findPush";

/**
 * 🔔 إشعار المطلوب بالتفاصيل — المالك (١١ أكتوبر ٢٠٢٦): «الاشعار يوصل لحظي ... في شريط الاشعارات من قناص اللوحات
 * بيقوله ان المندوب كذا علي حسب اسمه اللي متسجل بيه علي البرنامج حصل سيارة كذا ... وبالتاريخ والوقت وكل حاجه ولما
 * المسئول يفتح الاشعار يتفتحلو علي البرنامج ويشوف كل البيانات بتاع السيارة بالموقع بتاعها ... ومين حصلها ... بالتاريخ
 * والوقت». بيانات وهمية.
 */
const row = {
  id: "11111111-2222-3333-4444-555555555555",
  team: "مجموعة الشمال",
  finder_name: "أحمد",
  plate: "حبك1234",
  info: [["الماركة", "تويوتا"], ["اللون", "أبيض"], ["البنك", "بنك تجريبي"], ["سنة الصنع", "2021"]] as [string, string][],
  maps_link: "https://maps.google.com/?q=24.7,46.6",
  created_at: "2026-10-11T12:45:00.000Z",
};

describe("🔴 نص الإشعار", () => {
  it("🔴 اسم المندوب + اللوحة + المجموعة + التاريخ والوقت", () => {
    const p = buildFindPush(row);
    expect(p.title).toContain("أحمد");
    expect(p.title).toContain("لقى سيارة مطلوبة");
    expect(p.body).toContain("حبك1234");
    expect(p.body).toContain("مجموعة الشمال");
    expect(p.body).toContain(formatFindTime(row.created_at));
  });
  it("بيانات العربية (أول ٣) في سطر تاني", () => {
    const p = buildFindPush(row);
    expect(p.body).toContain("الماركة: تويوتا");
    expect(p.body).toContain("اللون: أبيض");
    expect(p.body).toContain("البنك: بنك تجريبي");
    expect(p.body).not.toContain("سنة الصنع");
  });
  it("🔴 الوقت بتوقيت السعودية", () => {
    // ١٢:٤٥ جرينتش = ٣:٤٥ العصر في الرياض
    expect(formatFindTime(row.created_at)).toMatch(/[3٣]:[4٤][5٥]/);
  });
  it("🔴 بيانات الضغط: رقم اللقطة + صفحة التفاصيل (قيم نصّية بس — شرط FCM)", () => {
    const p = buildFindPush(row);
    expect(p.data.findId).toBe(row.id);
    expect(p.data.url).toBe(findDetailsHref(row.id));
    for (const v of Object.values(p.data)) expect(typeof v).toBe("string");
  });
  it("من غير اسم ولا بيانات ولا وقت ⇒ مايقعش", () => {
    const p = buildFindPush({ id: "x", team: "أ", finder_name: null, plate: "ابح1234", info: null, maps_link: null, created_at: null });
    expect(p.title).toContain("زميلك");
    expect(p.body).toContain("ابح1234");
  });
  it("صفحة التفاصيل", () => {
    expect(findDetailsHref("a b")).toBe("/group-find?id=a%20b");
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 التطبيق بيبعت رقم اللقطة للسيرفر", () => {
    const n = read("components/GroupFindNotifier.tsx");
    expect(n).toMatch(/\.insert\(\{[\s\S]*?\}\)\.select\("id"\)\.single\(\)/);
    expect(n).toMatch(/findId: ins\?\.id \?\? ""/);
  });
  it("🔴 السيرفر بيبني الإشعار من صف اللقطة نفسه", () => {
    const r = read("app/api/group-push/route.ts");
    expect(r).toMatch(/const r = await sendPush\(tokens, buildFindPush\(/);
    expect(r).toMatch(/\.eq\("finder_id", uid\)/);
  });
  it("🔴 الضغط على الإشعار بيفتح صفحة التفاصيل", () => {
    const pr = read("components/PushRegistrar.tsx");
    expect(pr).toMatch(/addListener\("pushNotificationActionPerformed"/);
    expect(pr).toMatch(/router\.push\(url\)/);
  });
});

describe("🔴 مشترك «صوت فقط» ممكن يبقى مسئول — صفحة التفاصيل لازم تفتح له", () => {
  it("🔴 /group-find مسموحة (وإلا الحارس بيرجّعه للتشييك)", async () => {
    const { isAllowedForVoiceOnly } = await import("@/lib/voiceOnlyRoutes");
    expect(isAllowedForVoiceOnly("/group-find?id=abc")).toBe(true);
    expect(isAllowedForVoiceOnly("/group-finder")).toBe(false);
  });
});

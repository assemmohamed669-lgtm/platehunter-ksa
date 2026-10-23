import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 🩺 «صفحة المطلوب كانت بتقفل البرنامج» — المالك (٢٣ أكتوبر ٢٠٢٦): مندوب آيفون (3f220bb5…) «كان بيفرز في صفحه المطلوب
 * ف جابلو الرساله دي» (حارس الفتح: الصفحة قفلت البرنامج ٣ مرات ورا بعض). الفرز بيحمّل ملف التشييك (٦٠٬٩٣٣ صف) والداتا
 * والسجلات مرة واحدة — بدل التخمين، الصندوق الأسود (حسابه بس) بيكتب كل خطوة وأرقامها، وآخر خطوة قبل الوقعة هي السبب.
 */
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

describe("🔒 الحساب ده بس", () => {
  it("في قايمة الصندوق، وباقي المناديب لأ", async () => {
    const { DIAG_AGENT_IDS, diagEnabledFor } = await import("@/lib/deviceDiag");
    expect(DIAG_AGENT_IDS).toContain("3f220bb5-aa99-44b2-a384-72c3279d5478");
    expect(diagEnabledFor("22222222-2222-4222-8222-222222222222")).toBe(false);
  });
});

describe("📝 خطوات فرز «المطلوب»", () => {
  const src = read("app/(app)/wanted/page.tsx");
  it("كل خطوة بتتكتب جوّه diagActive بس (باقي المناديب مابيتحسبلهمش حاجة)", () => {
    expect(src).toMatch(/const dn = \(step: string, d: Record<string, unknown> = \{\}\) => \{ if \(diagActive\(\)\) diagNote\("wanted-sort", \{ step, \.\.\.d \}\); \};/);
  });
  it("البداية · اللي اتحمّل · الإضافي · الفهرس · الداتا · السجلات · الآخر · اترسم", () => {
    for (const step of ["start", "loaded", "extras", "index", "data-mem", "data-stream", "data-progress", "data-done", "records-done", "done", "rendered", "error"]) {
      expect(src).toContain(`dn("${step}"`);
    }
  });
});

describe("📝 خطوات فرز «شهايد النهارده» (في نفس الصفحة)", () => {
  it("start · loaded · done · error", () => {
    const src = read("components/DailyCertSort.tsx");
    expect(src).toMatch(/const dn = \(step: string, d: Record<string, unknown> = \{\}\) => \{ if \(diagActive\(\)\) diagNote\("cert-sort", \{ step, \.\.\.d \}\); \};/);
    for (const step of ["start", "loaded", "done", "error"]) expect(src).toContain(`dn("${step}"`);
  });
});

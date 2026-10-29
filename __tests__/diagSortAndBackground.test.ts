/**
 * 🩺 فحص ٢٩ أكتوبر ٢٠٢٦ — المالك: «اعمل فحص علي البرنامج واعرف كل حاجه حصلت وحصلت ليه وحلها» ⇒ «يلا اعمل الصح».
 *  ١. الصندوق الكامل على اللي الفرز بيقع/يهنّج عندهم (عبدالله فتحي ١٥ وقعة · احمد بهاء انيس ١٢ · احمد عبدالفتاح جلال
 *     ١٢٦ تهنيج ~١٥ث) + سطور الفرز (`sort-open` / `sort-run` / `sort-done`) بالأحجام بس — عشان نعرف وقع في أنهي خطوة.
 *  ٢. الصندوق (كامل/خفيف) بيحكم بحالة التطبيق نفسه مش رأي الصفحة (أندرويد 1.8 بيقول للصفحة «ظاهرة» في الخلفية).
 * تسجيل بس — مفيش تغيير في سلوك الفرز ولا التسجيل.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAG_AGENT_IDS } from "@/lib/deviceDiag";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const SORT = read("app/(app)/sorting/page.tsx");
const DIAG = read("lib/deviceDiag.ts");
const ISSUES = read("lib/issueLog.ts");

describe("الصندوق الكامل على التلاتة", () => {
  it("في القايمة", () => {
    expect(DIAG_AGENT_IDS).toEqual(expect.arrayContaining([
      "82b31667-6265-4c6c-89ed-f7762428fb9a",   // احمد عبدالفتاح جلال
      "27fbbb4a-d657-4d61-ad41-ff6153578caa",   // عبدالله فتحي
      "fafa6a71-c61a-45b7-bb82-00a5e1767447",   // احمد بهاء انيس
    ]));
  });
});

describe("سطور الفرز في الصندوق (للي عليهم الصندوق بس)", () => {
  it("فتح الصفحة بالأحجام · بداية الفرز · نهايته بالمدة", () => {
    expect(SORT).toMatch(/import \{ diagActive, diagNote \} from "@\/lib\/deviceDiag";/);
    expect(SORT).toMatch(/if \(diagActive\(\)\) diagNote\("sort-open", sortSizes\(\)\);/);
    expect(SORT).toMatch(/if \(diagActive\(\)\) diagNote\("sort-run", \{ mode: sortMode, \.\.\.sortSizes\(\) \}\);/);
    expect(SORT.match(/diagNote\("sort-done", \{ mode: "(full|new)", ms: Date\.now\(\) - sortT0/g)?.length).toBe(2);
  });
});

describe("الحكم بحالة التطبيق نفسه (`lib/appForeground.ts`)", () => {
  it("سجل المشاكل", () => {
    expect(ISSUES).toMatch(/const vis = \(\) => pageVisibility\(\);/);
    expect(ISSUES).toMatch(/!appAwaySince\(lastTick\)/);
    expect(ISSUES).toMatch(/onAppState\(/);
  });
  it("الصندوق: الحالة المحفوظة + التهنيج + سطر «app»", () => {
    expect(DIAG).not.toMatch(/vis: document\.visibilityState \}\)/);
    expect(DIAG).toMatch(/pageVisibility\(\) === "visible" && !\(hiddenAt >= lastTick\) && !appAwaySince\(lastTick\)/);
    expect(DIAG).toMatch(/onAppState\(\(active\) => \{/);
  });
});

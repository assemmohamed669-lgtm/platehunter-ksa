import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { AREA_FILL_FOR_ALL } from "@/lib/areaBackfill";

/**
 * 📍 «املأ الحي والشارع» — مكانين (المالك ١٩ أكتوبر ٢٠٢٦: «اعملها من عندي وكمان يكون فيه زرار عند المندوب»):
 *  · لوحة الأدمن: زرار للسوبر أدمن بس ⇒ `/admin/area-fill` بالـID.
 *  · سجلات المندوب (التشييك): زرار لسجلاته هو — **السوبر أدمن الأول** لحد ما المالك يجرّب.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("🔘 الزرارين", () => {
  it("لوحة الأدمن: الزرار جوّه isSuper ورايح لصفحة الـID", () => {
    const src = read("app/admin/page.tsx");
    expect(src).toMatch(/\{isSuper && \(\s*<button onClick=\{\(\) => router\.push\("\/admin\/area-fill"\)\}/);
  });
  it("صفحة الـID للسوبر أدمن بس", () => {
    const src = read("app/admin/area-fill/page.tsx");
    expect(src).toMatch(/prof\?\.role !== "admin" \|\| !prof\?\.is_super/);
    expect(src).toMatch(/<AreaFillPanel mode="admin" \/>/);
  });
  it("سجلات المندوب: سجلاتي بس + (للكل أو السوبر أدمن)", () => {
    const src = read("app/(app)/instant-check/page.tsx");
    expect(src).toMatch(/scopeMine && \(AREA_FILL_FOR_ALL \|\| isSuper\) && \(\s*<AreaFillPanel mode="self"/);
  });
  it("🔒 لسه للسوبر أدمن بس (المالك يجرّب الأول)", () => {
    expect(AREA_FILL_FOR_ALL).toBe(false);
  });
});

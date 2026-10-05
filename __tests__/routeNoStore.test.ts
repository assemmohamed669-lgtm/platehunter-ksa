import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 🧊 نكست ١٤.٢: راوت GET بس عليه `dynamic = "force-dynamic"` لوحده ⇒ قرايات سوبابيز جوّاه
 * بتتخزّن للأبد في كاش السيرفر، والراوت بيفضل يرجّع أول نتيجة.
 *
 * اللي حصل (٥ أكتوبر ٢٠٢٦): «شهايد النهارده» الجملة الخضرا بتقول ٦٩٠ والفرز بيقول «لسه مانزلش» —
 * أول دوسة كانت والجدول فاضي فاتخزّنت فاضية. ونفس الحكاية في «إحصائيات الشهايد» («العد واقف»).
 * العلاج زي دورات السيرفر: `fetchCache = "force-no-store"` + `revalidate = 0`.
 */
function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routeFiles(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

describe("🔴 راوتات force-dynamic مابتخزّنش قرايات الداتابيز", () => {
  it("🔴 أي راوت force-dynamic بيستنّى حاجة (داتابيز/شبكة) لازم force-no-store + revalidate 0", () => {
    const bad = routeFiles("app/api").filter((f) => {
      const s = readFileSync(f, "utf8");
      if (!/export const dynamic = "force-dynamic"/.test(s)) return false;
      if (!/\bawait\b/.test(s)) return false; // زي /api/version — مفيش أي قراية
      return !/export const fetchCache = "force-no-store"/.test(s) || !/export const revalidate = 0/.test(s);
    }).map((f) => f.replace(/\\/g, "/"));
    expect(bad).toEqual([]);
  });

  it("🔴 شهايد النهارده + إحصائيات الشهايد بالذات", () => {
    for (const f of ["app/api/certificate/daily/route.ts", "app/api/admin/cert-stats/route.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toMatch(/export const fetchCache = "force-no-store"/);
      expect(s, f).toMatch(/export const revalidate = 0/);
    }
  });
});

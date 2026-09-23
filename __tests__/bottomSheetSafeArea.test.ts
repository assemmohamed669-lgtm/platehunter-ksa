import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * حارس — **أي شاشة بتطلع من تحت لازم تاخد مسافة الأمان السفلية.**
 *
 * بلاغ المندوب (٢٣ سبتمبر ٢٠٢٦، لقطة شاشة): زر «مشاركة واتساب» في «صورة
 * النتائج» كان **تحت شريط تنقّل التليفون** فمش بيتداس خالص.
 *
 * السبب: اللياوت فيه `viewport-fit=cover` — يعني المحتوى بيترسم **تحت**
 * أشرطة النظام على أندرويد و iOS بالظبط زي بعض. و`items-end` بيلزق الشاشة
 * في آخر الـviewport، واللي هو تحت الشريط. `BottomNav` بياخد المسافة دي من
 * زمان (`pb-[max(0.5rem,env(safe-area-inset-bottom))]`)، والشاشات المنبثقة
 * كانت فايتاها كلها — ٩ شاشة.
 *
 * ⚠️ نفس عيلة الباج اللي ضربت الشريط العلوي في `/admin` قبل كده. الفرق إن
 *    ده بيمنع **ضغطة** مش بيخبّي كلام بس.
 */
const ROOTS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("الشاشات المنبثقة من تحت — مسافة الأمان السفلية", () => {
  const offenders: string[] = [];
  const checked: string[] = [];

  for (const root of ROOTS) {
    for (const file of walk(join(process.cwd(), root))) {
      const src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      src.split("\n").forEach((line, i) => {
        // الغلاف اللي بيلزق المحتوى في آخر الشاشة
        if (!line.includes("fixed inset-0")) return;
        if (!line.includes("items-end ")) return;
        const where = `${file.replace(process.cwd(), "").replace(/\\/g, "/")}:${i + 1}`;
        checked.push(where);
        if (!line.includes("safe-area-inset-bottom") && !line.includes("safe-bottom")) {
          offenders.push(where);
        }
      });
    }
  }

  it("الحارس لاقى شاشات يفحصها فعلاً (مش بيعدّي على الفاضي)", () => {
    // من غير ده الاختبار بينجح وهو مش بيقيس حاجة — وده أسوأ من إنه يفشل.
    expect(checked.length).toBeGreaterThanOrEqual(9);
  });

  it("🔴 ولا شاشة واحدة من غير مسافة أمان سفلية", () => {
    expect(offenders).toEqual([]);
  });
});

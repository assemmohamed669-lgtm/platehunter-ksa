import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🖼️ «كل الورقات في مشاركة واحدة» — في كل مكان، مش الفرز بس
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (١٣ أكتوبر ٢٠٢٦): «في صفحة الفرز كل الفرز وفي صفحة المطلوب — لما
 *  نتيجة الفرز تطلع أكتر من ورقة، عايز كل الورقات يتشاركوا مع بعض في نفس
 *  المشاركة مش ورقة ورقة.»
 *
 *  الزرار اتعمل في #410 بس اتحط في **صفحة الفرز بس** (٦ أماكن). صفحة المطلوب
 *  وشهايد النهارده فضلوا بيشاركوا صورة صورة.
 *
 *  الحارس ده بيفشل لو أي `ShareSortButton` جديد اتكتب من غير `shareAllAtOnce`
 *  — عشان مانرجعش للعيب ده تاني في صفحة جديدة.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const SEP = String.fromCharCode(92);   // الشرطة المقلوبة في مسارات ويندوز

describe("🖼️ كل استعمالات زرار المشاركة", () => {
  it("كل `<ShareSortButton` معاه `shareAllAtOnce`", () => {
    const root = process.cwd();
    const files = [...walk(join(root, "app")), ...walk(join(root, "components"))]
      .filter((f) => !f.endsWith("ShareSortButton.tsx"));

    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // كل استعمال = من `<ShareSortButton` لحد ما العنصر يتقفل
      for (const m of src.matchAll(/<ShareSortButton\b[\s\S]*?\/>/g)) {
        if (!m[0].includes("shareAllAtOnce")) {
          missing.push(f.slice(root.length + 1).split(SEP).join("/"));
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

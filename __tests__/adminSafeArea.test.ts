/**
 * أي شريط علوي ثابت في البرنامج لازم ياخد مسافة المنطقة الآمنة، وإلا بيترسم
 * تحت شريط الحالة (الساعة/الواي فاي/البطارية) — وده اللي حصل في /admin لأن
 * ليها لياوت منفصل عن لياوت المندوب.
 *
 * الاختبار ده حارس: أي لياوت جديد بشريط `sticky top-0` من غير `--safe-top`
 * بيفشل هنا بدل ما المندوب يكتشفه على تليفونه.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const LAYOUTS = ["app/(app)/layout.tsx", "app/admin/layout.tsx"];
const SAFE_TOP = "pt-[max(0.75rem,var(--safe-top))]";

describe("المنطقة الآمنة فوق", () => {
  for (const f of LAYOUTS) {
    it(`${f} — الشريط العلوي بياخد --safe-top`, () => {
      const src = readFileSync(f, "utf8");
      const header = src.match(/<header className="[^"]*sticky top-0[^"]*"/);
      expect(header, `مافيش شريط sticky في ${f}`).not.toBeNull();
      expect(header![0]).toContain(SAFE_TOP);
    });

    it(`${f} — مافيش py- على الشريط (بتلغي مسافة الأمان)`, () => {
      const src = readFileSync(f, "utf8");
      const header = src.match(/<header className="[^"]*sticky top-0[^"]*"/)![0];
      expect(header).not.toMatch(/\spy-\d/);
    });
  }

  it("viewport-fit=cover مضبوط — من غيره env(safe-area) بترجع صفر", () => {
    expect(readFileSync("app/layout.tsx", "utf8")).toContain('viewportFit: "cover"');
  });

  it("--safe-top متعرّفة من env", () => {
    expect(readFileSync("app/globals.css", "utf8")).toContain("--safe-top: env(safe-area-inset-top)");
  });
});

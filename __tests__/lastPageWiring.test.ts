import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { rememberPage, lastPage } from "@/lib/lastPage";

/**
 * حارس — **آخر صفحة لازم تفضل موصّلة من الطرفين.**
 *
 * الدالة لوحدها مابتعملش حاجة: محتاجة (أ) اللياوت يفتكر مع كل تنقّل،
 * و(ب) شاشة البداية تفتح عليها بدل `/sorting` الثابتة.
 * أي طرف يتفك ⇒ المندوب يرجع للفرز تاني، والاختبار الوحدة يفضل أخضر.
 */
function codeOf(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("توصيل «آخر صفحة»", () => {
  const layout = codeOf("app", "(app)", "layout.tsx");
  const splash = codeOf("app", "page.tsx");

  it("🔴 اللياوت بيفتكر الصفحة مع كل تنقّل", () => {
    expect(layout).toContain("rememberPage");
    expect(layout).toContain("[pathname]");
  });

  it("🔴 شاشة البداية بتفتح على آخر صفحة مش على الفرز الثابت", () => {
    expect(splash).toContain("lastPage()");
    // الاحتياطي لازم يفضل موجود لأول دخول
    expect(splash).toContain('"/sorting"');
  });

  it("🔴 ومافيش تحويل ثابت للفرز من غير آخر صفحة", () => {
    // الشكل القديم: `dest = data.session ? "/sorting" : "/login"`
    expect(splash).not.toMatch(/data\.session\s*\?\s*"\/sorting"/);
  });

  it("🔴 الرجوع من الخلفية بيعدّي شاشة البداية", () => {
    expect(splash).toContain("isWarmResume()");
    // والانتظار بقى مشروط — مش ٢٠٠٠ ثابتة
    expect(splash).not.toMatch(/setTimeout\(r,\s*2000\)/);
  });
});

/**
 * 🔴 **القايمة البيضا لازم تطابق مجلدات `app/(app)/` الحقيقية.**
 *
 * لو اتضافت صفحة جديدة ومااتضافتش للقايمة، المندوب اللي واقف عليها بيرجع
 * للفرز — وده بالظبط الباج اللي بنصلّحه، بس على صفحة واحدة بدل الكل.
 */
describe("القايمة البيضا مطابقة للصفحات الموجودة", () => {
  const dir = join(process.cwd(), "app", "(app)");
  const real = readdirSync(dir)
    .filter((n) => statSync(join(dir, n)).isDirectory())
    .filter((n) => {
      // بس اللي فيها صفحة فعلاً
      try { return statSync(join(dir, n, "page.tsx")).isFile(); } catch { return false; }
    });

  it("الحارس لاقى صفحات فعلاً", () => {
    expect(real.length).toBeGreaterThan(8);
  });

  for (const page of real) {
    it(`صفحة «${page}» مسموح الرجوع لها`, () => {
      rememberPage(`/${page}`);
      expect(lastPage()).toBe(`/${page}`);
    });
  }
});

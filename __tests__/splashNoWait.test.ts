/**
 * ⬛ «صفحه سودا ومش بيفتح» (المالك ٨ نوفمبر ٢٠٢٦ — أندرويد وآيفون). شاشة البداية (فيديو على خلفية غامقة) كانت بتستنى
 * `supabase.auth.getSession()` **من غير حد** — وده بيروح للشبكة يجدّد الجلسة. الصبح ١٥ من ٣١ مندوب كان عندهم طلبات
 * Supabase بتفشل/بتعلّق ⇒ الشاشة بتفضل واقفة. دلوقتي: حد `SPLASH_SESSION_MAX_MS`، وبعده اللي كان داخل قبل كده (آخر صفحة
 * محفوظة) بيفتح على صفحته؛ اللي ماعندوش (أول مرة/خرج) ⇒ بيستنى الجلسة زي الأول.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPLASH_SESSION_MAX_MS } from "@/lib/lastPage";

const PAGE = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("شاشة البداية مابتستناش النت للأبد", () => {
  it("الحد ثواني", () => {
    expect(SPLASH_SESSION_MAX_MS).toBeGreaterThanOrEqual(3000);
    expect(SPLASH_SESSION_MAX_MS).toBeLessThanOrEqual(8000);
  });
  it("سباق بين الجلسة والحد — بعد الحد آخر صفحة لو موجودة، وإلا يستنى الجلسة", () => {
    expect(PAGE).toMatch(/const capped = Promise\.race\(\[session, new Promise<void>\(\(r\) => \{\s*setTimeout\(\(\) => \{ const lp = lastPage\(\); if \(lp\) \{ dest = lp; r\(\); \} \}, SPLASH_SESSION_MAX_MS\);\s*\}\)\]\);/);
    expect(PAGE).toMatch(/Promise\.all\(\[capped, delay\]\)\.then\(\(\) => router\.replace\(dest\)\);/);
    expect(PAGE).not.toMatch(/Promise\.all\(\[session, delay\]\)/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🐞 محمد عفيفي اتشال من «مجموعه عفيفي شغل» من غير قصد (المالك ١١ أكتوبر ٢٠٢٦ — «المسئول مش عضو»): الصفحة كانت
 * بتعرض المجموعات قبل ما العضويات توصل (من profiles.team بس)، و«حفظ التغييرات» كان بيشيل أي حد مش في القايمة.
 */
const pg = readFileSync(path.resolve(__dirname, "../app/admin/groups/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("🔴 صفحة المجموعات مابتشيلش حد من غير قصد", () => {
  it("🔴 «جارٍ التحميل» لحد ما العضويات توصل (وبحد زمني)", () => {
    const load = pg.slice(pg.indexOf("const load = useCallback"), pg.indexOf("}, []);", pg.indexOf("const load = useCallback")));
    expect(load).toMatch(/finally \{ setLoading\(false\); \}\s*$/);
    expect(load.match(/setLoading\(false\)/g)?.length).toBe(1);
    expect(load).toMatch(/withTimeout\(fetch\("\/api\/admin\/group-settings"/);
  });
  it("🔴 الحفظ بيشيل اللي اتدوس قدامه «شيل» بس، وبيضيف اللي اتضاف بالإيد بس", () => {
    expect(pg).toMatch(/const added = \[\.\.\.editSet\]\.filter\(\(id\) => !current\.has\(id\) && !!addMode\[id\]\);/);
    expect(pg).toMatch(/const removed = \[\.\.\.removedByHand\]\.filter\(\(id\) => current\.has\(id\) && !editSet\.has\(id\)\);/);
    expect(pg).toMatch(/setRemovedByHand\(\(s\) => new Set\(s\)\.add\(id\)\);/);
  });
  it("🔴 شيل المسئول بيسأل الأول", () => {
    expect(pg).toMatch(/هو مسئول المجموعة — لو اتشال هتبقى من غير مسئول\. تكمّل؟/);
  });
});

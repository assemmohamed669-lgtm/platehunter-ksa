/**
 * ⏱️ «الفرز مهنج مش بيفرز» (المالك ٢٩ أكتوبر ٢٠٢٦ — سامي عفيفي ومحمد عفيفي). الفرز كان بيستنى من النت **من غير حد**
 * (بيانات المجموعة + مطابقة سجلات المجموعة) قبل ما يعرض النتيجة ⇒ النت المعلّق = «جارٍ الفرز...» دقايق.
 * المنطق في `lib/groupRecordsWait.test.ts`؛ هنا الربط في صفحة الفرز.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync(join(process.cwd(), "app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("صفحة الفرز", () => {
  it("مفيش استنا لبيانات المجموعة من غير حد", () => {
    expect(PAGE).not.toMatch(/await teamReadyRef\.current\?\.catch/);
    expect(PAGE.match(/await waitUpTo\(teamReadyRef\.current, GROUP_RECORDS_WAIT_MS\)/g)?.length).toBe(2);
  });

  it("مطابقة سجلات المجموعة بحد (والطلب الطاير بيتلغي)", () => {
    expect(PAGE.match(/await pagesUpTo</g)?.length).toBe(2);
    expect(PAGE.match(/\.rpc\("match_group_plates", \{ p_norms: norms \}\)\s*\.range\(from, from \+ RPC_PAGE - 1\)\s*\.abortSignal\(signal\)/g)?.length).toBe(2);
  });

  it("اتأخّرت ⇒ رسالة للمندوب (مش صمت) — بتتصفّر مع كل فرز", () => {
    expect(PAGE).toMatch(/const \[groupMissed, setGroupMissed\] = useState\(false\);/);
    expect(PAGE).toMatch(/\{groupMissed && !sorting && \(/);
    expect(PAGE).toMatch(/setGroupMissed\(false\);/);
    // اللصق: نفس الرسالة جوّه مربعه
    expect(PAGE).toMatch(/\{pasteGroupMissed && pasteRan && !pasteBusy && \(/);
    expect(PAGE).toMatch(/setPasteGroupMissed\(false\);/);
  });
});

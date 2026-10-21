import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🧭 توصيل سجل شغل الأعضاء — صفحة الفرز بتسجّل (الفرز الكلي/الجديد/اللصق · فتح موقع عربية · مشاركة صورة/إكسيل/نص)،
 * و«إدارة مجموعتي» فيها تاب «شغل الأعضاء» للمسئول. (المالك ١٥ أكتوبر ٢٠٢٦)
 */
const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const S = read("app/(app)/sorting/page.tsx");

describe("🔴 صفحة الفرز بتسجّل", () => {
  it("كل فرز (كلي/جديد/لصق) بعدد اللي طلع", () => {
    expect(S).toMatch(/logAgentEvent\("sort", \{ mode: "full", results: matches\.length, records: finalTashyeek\?\.length \?\? 0 \}\);/);
    expect(S).toMatch(/logAgentEvent\("sort", \{ mode: "new", results: matches\.length, records: finalTashyeek\?\.length \?\? 0, newPlates: newEntries\.length \}\);/);
    expect(S).toMatch(/logAgentEvent\("sort", \{ mode: "paste", results: matches\.length, plates: tokens\.length \}\);/);
  });
  it("🔴 فتح موقع عربية من أي جدول نتيجة ⇒ اللوحة + مكان المندوب", () => {
    expect(S).toMatch(/<div className="rtl-text flex flex-col gap-4 w-full min-w-0" dir="rtl" onClickCapture=\{onResultsClick\}>/);
    expect(S).toMatch(/if \(!a \|\| !isMapsHref\(a\.href\)\) return;/);
    expect(S).toMatch(/logAgentEvent\("open_location", \{ plate, link: a\.href\.slice\(0, 300\) \}, \{ withLocation: true \}\);/);
    // اللوحة على صف كل جدول نتيجة (الداتا/السجلات/اللصق/سجلات اللصق/الشاص) — جدول الشاص بقى مكوّن
    // (`ChassisResultsBox`) بيترسم جوّه نفس الحاوية اللي بتمسك الدوسة
    const chassisBox = read("components/ChassisResultsBox.tsx");
    expect(chassisBox).toMatch(/data-plate=\{plate\}/);
    expect(S).toMatch(/<ChassisResultsBox matches=\{chassisResults \?\? \[\]\} \/>/);
    expect((S.match(/data-plate=\{/g)?.length ?? 0) + 1).toBeGreaterThanOrEqual(5);
  });
  it("🔴 المشاركة (صورة/إكسيل) من زرار المشاركة + نص واتساب", () => {
    expect(S.match(/onShared=\{onSortShared\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(S).toMatch(/logAgentEvent\("share", \{ kind, count, title \}, \{ withLocation: true \}\);/);
    expect(S).toMatch(/function logTextShare\(count\?: number\)/);
  });
  it("زرار المشاركة بيبلّغ بعد ما الصورة/الإكسيل يتبعتوا", () => {
    const b = read("components/ShareSortButton.tsx");
    expect(b).toMatch(/onShared\?: \(kind: "image" \| "excel", count: number, title: string\) => void;/);
    expect(b.match(/onShared\?\.\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("🔴 «إدارة مجموعتي» ⇒ «شغل الأعضاء»", () => {
  const G = read("app/(app)/my-group/page.tsx");
  it("تاب للمسئول (مش مستني تقرير النشاط) بأعضاء المجموعة دي بس", () => {
    expect(G).toMatch(/setTab\("work"\)/);
    expect(G).toMatch(/<TeamWorkLog team=\{g\.team\} members=\{g\.members\} \/>/);
  });
  it("الشاشة: آخر فرز + «مافرزش النهارده» + شغله كله + خريطة مكانه", () => {
    const c = read("components/TeamWorkLog.tsx");
    expect(c).toMatch(/fetchTeamEvents\(team\)/);
    expect(c).toMatch(/summarizeTeamEvents\(/);
    expect(c).toMatch(/مافرزش النهارده/);
    expect(c).toMatch(/toMapsLink\(e\.lat, e\.lng\)/);
  });
});

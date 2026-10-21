import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";

/**
 * 🗂️ «يقرأ كل السجلات ويفرز علي كل السجلات صوتي ويدوي وشاص والشاص يفرز برقم الشاص والصوتي واليدوي يفرز برقم
 * اللوحه» — المالك (٢١ أكتوبر ٢٠٢٦)، بعد ما شاف «سجل التشييك ١٠٣٧» و«شيت السجلات قاري ٥٤٩ لوحة».
 *  · ٥٤٩ = لوحات **مختلفة**؛ و١٠٣٧ = كل السجلات (فيها إرسال مكرر لنفس التشييك بيتحسب مرة) ⇒ المربع بيقول الاتنين.
 *  · الشاص: صفحة الفرز كانت بتفرزه برقم الشاص؛ «صوت فقط» لأ ⇒ اتضاف، وبنفس الجدول.
 */
beforeEach(() => { localStorage.clear(); });

const match = {
  record: { id: "ch1", chassis: "WVGZZZ5NZJM131395", checkedAt: "2026-10-20T10:00:00.000Z", lat: 24.7, lng: 46.6 },
  referralRow: { "رقم اللوحة": "ابح1234", "نوع السيارة": "تيجوان" },
  matchType: "exact" as const,
};

describe("🔩 نتيجة الشاص (نفس جدول صفحة الفرز)", () => {
  it("رقم الشاص + اللوحة والنوع من الإحالة + التاريخ + الموقع", async () => {
    const { default: ChassisResultsBox } = await import("@/components/ChassisResultsBox");
    render(<ChassisResultsBox matches={[match as never]} />);
    expect(screen.getByText(/مطلوب من أرقام الشاص/)).toBeTruthy();
    expect(screen.getByText("WVGZZZ5NZJM131395")).toBeTruthy();
    expect(screen.getByText("ابح1234")).toBeTruthy();
    expect(screen.getByText("تيجوان")).toBeTruthy();
    expect(screen.getByText("20-10-2026")).toBeTruthy();
    expect(screen.getByLabelText("الموقع").getAttribute("href")).toContain("24.7,46.6");
  });
  it("مفيش ⇒ ولا حاجة", async () => {
    const { default: ChassisResultsBox } = await import("@/components/ChassisResultsBox");
    const { container } = render(<ChassisResultsBox matches={[]} />);
    expect(container.textContent).toBe("");
  });
});

describe("🔢 المربع بيقول هو بيفرز على إيه بالظبط", () => {
  const table = { headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح1234" }, { "رقم اللوحة": "ابح1234" }, { "رقم اللوحة": "دده4444" }] };
  it("السطر الصغير = نفس أرقام صفحة السجلات: «سجل التشييك ١٬٠٣٧ · شاص ٦» (المالك: «مش كاتب انه قاري ١٬٠٣٧»)", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} summary={{ check: 1037, mj: 0, chassis: 6 }} />);
    const line = screen.getByRole("button", { name: /شيت السجلات/ });
    expect(line.textContent).toMatch(/سجل التشييك ١٬٠٣٧/);
    expect(line.textContent).toMatch(/شاص ٦/);
    expect(line.textContent).not.toMatch(/التسجيلات/);           // مفيش داتا تسجيلات ⇒ مابتظهرش
    expect(line.textContent).not.toMatch(/لوحة/);                // عدد اللوحات المختلفة في التفاصيل بس
  });
  it("فيه داتا تسجيلات ⇒ عددها في السطر كمان", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} summary={{ check: 1037, mj: 12, chassis: 0 }} />);
    const line = screen.getByRole("button", { name: /شيت السجلات/ });
    expect(line.textContent).toMatch(/التسجيلات ١٢/);
    expect(line.textContent).not.toMatch(/شاص/);
  });
  it("من غير العدّ (لسه) ⇒ عدد اللوحات زي الأول", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} />);
    expect(screen.getByRole("button", { name: /شيت السجلات/ }).textContent).toMatch(/٢ لوحة/);
  });
  it("التفاصيل: كل السجلات + داتا التسجيلات + الشاص، والمكرر بيتحسب مرة، والشاص برقم الشاص", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} summary={{ check: 1037, mj: 12, chassis: 6 }} />);
    fireEvent.click(screen.getByRole("button", { name: /شيت السجلات/ }));
    expect(screen.getByText(/١٬٠٣٧ سجل تشييك/)).toBeTruthy();
    expect(screen.getByText(/١٢ من داتا التسجيلات/)).toBeTruthy();
    expect(screen.getByText(/٦ رقم شاص/)).toBeTruthy();
    expect(screen.getByText(/الإرسال المكرر/)).toBeTruthy();
    expect(screen.getByText(/الشاص برقم الشاص/)).toBeTruthy();
  });
});

describe("🔢 العدّ من السجلات الجاهزة", () => {
  it("سجل التشييك ومن داتا التسجيلات (خام — زي «الكل» في السجلات) من غير المجموعات المستخبية", async () => {
    const idb = await import("@/lib/idb");
    const { getRecordsSummary } = await import("@/lib/recordsSheet");
    await idb.clearFieldCheck();
    const t = new Date(Date.UTC(2026, 9, 2, 9, 0, 10)).toISOString();
    const mk = (id: string, plate: string, team?: string) => ({ id, agentId: "u", plate, row: {}, method: "x", checkedAt: t, ...(team ? { team } : {}) });
    await idb.saveFieldCheckEntries([mk("fc-ptt-1", "ابح1234"), mk("fc-ptt-2", "ابح1234"), mk("fc-mj-u-1", "دده4444"), mk("fc-cam-3", "سسس5555", "t9")]);
    expect(await getRecordsSummary()).toEqual({ check: 3, mj: 1 });
    localStorage.setItem("ph:hiddenRecordTeams", JSON.stringify(["t9"]));
    expect(await getRecordsSummary()).toEqual({ check: 2, mj: 1 });
  });
});

describe("🔌 التوصيل", () => {
  it("«صوت فقط» بيفرز الشاص برقم الشاص على الإحالة وبيعرض نتيجته، والصفحتين بيقولوا العدد", () => {
    const vo = readFileSync("components/VoiceOnlySort.tsx", "utf8");
    expect(vo).toMatch(/setChassisMatches\(matchChassisRecordsAgainstReferrals\(getChassisRecords\(\), \[\{ headers: refTable\.headers, rows: refTable\.rows \}\]\)\)/);
    expect(vo).toMatch(/<ChassisResultsBox matches=\{chassisMatches\} \/>/);
    expect(vo).toMatch(/<RecordsSheetBox table=\{recSheet\} loading=\{recEntries === null\} summary=\{/);
    const sort = readFileSync("app/(app)/sorting/page.tsx", "utf8");
    expect(sort).toMatch(/<ChassisResultsBox matches=\{chassisResults \?\? \[\]\} \/>/);
    expect(sort).toMatch(/<RecordsSheetBox table=\{tashyeekTable === builtRecordsTableRef\.current \? tashyeekTable : null\} loading=\{!recordsLoaded\} summary=\{/);
  });
});

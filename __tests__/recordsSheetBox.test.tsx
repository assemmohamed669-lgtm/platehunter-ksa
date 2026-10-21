import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { readFileSync } from "node:fs";

/**
 * 🗂️ مربع «شيت السجلات» — المالك (٢١ أكتوبر ٢٠٢٦): «المستخدم يشوف ان فيه شيت سجلات قدامه وبيفرز عليه وعدد اللوحات
 * اللي فيه كذا بس اهم حاجه ميقدرش يستبدل الشيت دة يقدر يفتحو او يشاركه عادي بس ميستبدلوش».
 * في صفحة الفرز و«صوت فقط». فتح ومشاركة بس — **مفيش** تغيير ولا مسح.
 */
const shareExcelBlob = vi.fn(async () => {});
vi.mock("@/lib/excel", async (orig) => ({ ...(await orig<typeof import("@/lib/excel")>()), shareExcelBlob }));

beforeEach(() => { shareExcelBlob.mockClear(); });

const table = {
  headers: ["رقم اللوحة", "النوع", "الحي-الشارع"],
  rows: [
    { "رقم اللوحة": "ابح1234", "النوع": "ج", "الحي-الشارع": "ش - ح" },
    { "رقم اللوحة": "ابح1234", "النوع": "ج", "الحي-الشارع": "ش - ح" },
    { "رقم اللوحة": "دده4444", "النوع": "ن", "الحي-الشارع": "" },
  ],
};

describe("🗂️ المربع", () => {
  it("قاري + كام صف وكام لوحة + بيدخل الفرز", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} />);
    expect(screen.getByText(/شيت السجلات/)).toBeTruthy();
    expect(screen.getByText(/قاري/)).toBeTruthy();
    expect(screen.getByText(/٣ صف · ٢ لوحة/)).toBeTruthy();
    expect(screen.getByText(/بيدخل في الفرز/)).toBeTruthy();
  });
  it("فتح ومشاركة بس — مفيش تغيير ولا مسح ولا رفع", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} />);
    expect(screen.getByRole("button", { name: /فتح/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /مشاركة/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تغيير|مسح|رفع|استبدال/ })).toBeNull();
    expect(document.querySelector("input[type=file]")).toBeNull();
  });
  it("مشاركة ⇒ إكسيل بكل الصفوف", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={table} loading={false} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /مشاركة/ })); });
    expect(shareExcelBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = shareExcelBlob.mock.calls[0] as unknown as [Blob, string];
    expect(blob.size).toBeGreaterThan(0);
    expect(name).toMatch(/^شيت السجلات .+\.(xlsx|csv)$/);
  });
  it("لسه بيتحمّل ⇒ بيقول كده، ومفيش أزرار لسه", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={null} loading />);
    expect(screen.getByText(/بيتحمّل/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /مشاركة/ })).toBeNull();
  });
  it("مفيش سجلات ⇒ «صدّر لوحات وهتظهر هنا»", async () => {
    const { default: RecordsSheetBox } = await import("@/components/RecordsSheetBox");
    render(<RecordsSheetBox table={null} loading={false} />);
    expect(screen.getByText(/مفيش سجلات لسه/)).toBeTruthy();
  });
});

describe("⚡ «صوت فقط» من نفس السجلات الجاهزة", () => {
  it("getRecordsEntries = نفس اللي كان بيتقري (المكرر سطر واحد، الأحدث الأول)", async () => {
    const idb = await import("@/lib/idb");
    const { collapseDuplicateChecks } = await import("@/lib/fieldCheck");
    const { getRecordsEntries } = await import("@/lib/recordsSheet");
    await idb.clearFieldCheck();
    const t = new Date(Date.UTC(2026, 9, 2, 9, 0, 10)).toISOString();
    const mk = (id: string, plate: string, at: string) => ({ id, agentId: "u", plate, row: {}, method: "x", checkedAt: at });
    await idb.saveFieldCheckEntries([
      mk("a", "ابح1234", t), mk("b", "ابح1234", t), mk("c", "دده4444", new Date(Date.UTC(2026, 9, 3)).toISOString()),
    ]);
    const before = collapseDuplicateChecks(await idb.getAllFieldCheckEntries()).map((e) => e.id);
    expect((await getRecordsEntries()).map((e) => e.id)).toEqual(before);
  });
});

describe("🔌 التوصيل", () => {
  it("صفحة الفرز و«صوت فقط» فيهم المربع، و«صوت فقط» بيفرز من السجلات الجاهزة", () => {
    const sort = readFileSync("app/(app)/sorting/page.tsx", "utf8");
    expect(sort).toMatch(/<RecordsSheetBox table=\{tashyeekTable === builtRecordsTableRef\.current \? tashyeekTable : null\} loading=\{!recordsLoaded\}/);
    const vo = readFileSync("components/VoiceOnlySort.tsx", "utf8");
    expect(vo).toMatch(/<RecordsSheetBox /);
    expect(vo).not.toMatch(/collapseDuplicateChecks\(await getAllFieldCheckEntries\(\)\)/);
    expect(vo.match(/const entries = await getRecordsEntries\(\);/g)?.length).toBe(2);
  });
});

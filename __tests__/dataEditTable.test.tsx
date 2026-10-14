import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import DataEditTable from "@/components/DataEditTable";
import { isGpsHeader, DATA_EDIT_FOR_ALL } from "@/lib/dataEdit";
import type { EditRow } from "@/lib/dataEdit";

/**
 * ✏️ جدول تعديل الداتا — زي الإكسيل: كل خانة بتتكتب فيها، صف اللوحة اللي اتدوّر عليها متعلّم، والصف المتعلّم للمسح
 * بيبان متشطّب لحد الحفظ. (المالك ١٤ أكتوبر ٢٠٢٦ — `lib/dataEdit.ts`)
 */
const headers = ["رقم اللوحة", "الحي", "GPS", "ملاحظات"];
const rows: EditRow[] = [
  { loc: "r:4", rowNo: 5, sheet: "", row: { "رقم اللوحة": "رقس4278", "الحي": "الصفاء", "GPS": "" }, match: false },
  { loc: "r:5", rowNo: 6, sheet: "", row: { "رقم اللوحة": "رقه9312", "الحي": "النسيم", "GPS": "" }, match: true },
];

function setup(over: Partial<Parameters<typeof DataEditTable>[0]> = {}) {
  const props = {
    headers, rows, edits: {}, deletes: new Set<string>(), picked: new Set<string>(),
    onCell: vi.fn(), onPick: vi.fn(), onUndoDelete: vi.fn(), onMyLocation: vi.fn(), locating: null,
    ...over,
  };
  render(<DataEditTable {...props} />);
  return props;
}

describe("🔴 الجدول", () => {
  it("كل أعمدة الشيت + رقم الصف، وكل خانة بتتكتب فيها", () => {
    const p = setup();
    for (const h of headers) expect(screen.getByRole("columnheader", { name: h })).toBeTruthy();
    const cell = screen.getByDisplayValue("النسيم");
    fireEvent.change(cell, { target: { value: "الشرفية" } });
    expect(p.onCell).toHaveBeenCalledWith(rows[1], "الحي", "الشرفية");
    expect(screen.getByText("6")).toBeTruthy();
  });
  it("التعديل اللي لسه ماتحفظش بيبان في الخانة", () => {
    setup({ edits: { "r:4": { "ملاحظات": "اتسحبت" } } });
    expect(screen.getByDisplayValue("اتسحبت")).toBeTruthy();
  });
  it("صف اللوحة اللي اتدوّر عليها متعلّم", () => {
    setup();
    expect(screen.getByDisplayValue("رقه9312").closest("tr")!.getAttribute("data-match")).toBe("1");
    expect(screen.getByDisplayValue("رقس4278").closest("tr")!.getAttribute("data-match")).toBe("0");
  });
  it("الصف اللي هيتمسح متشطّب وفيه «تراجع»", () => {
    const p = setup({ deletes: new Set(["r:4"]) });
    const tr = screen.getByDisplayValue("رقس4278").closest("tr")!;
    expect(tr.getAttribute("data-deleted")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(p.onUndoDelete).toHaveBeenCalledWith("r:4");
  });
  it("التعليم على صف للمسح", () => {
    const p = setup();
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    expect(p.onPick).toHaveBeenCalledWith("r:5");
  });
  it("📍 موقعي جنب خانة الـGPS بس", () => {
    const p = setup();
    const btns = screen.getAllByRole("button", { name: "📍 موقعي" });
    expect(btns.length).toBe(2);                 // صف لكل صف (عمود GPS واحد)
    fireEvent.click(btns[1]);
    expect(p.onMyLocation).toHaveBeenCalledWith(rows[1], "GPS");
    expect(isGpsHeader("الموقع")).toBe(true);
    expect(isGpsHeader("الحي")).toBe(false);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🛑 السوبر أدمن الأول — الشرط في الزرار والصفحة (صفحة الفرز نفسها مافيهاش شرط سوبر أدمن)", () => {
    expect(DATA_EDIT_FOR_ALL).toBe(false);
    expect(read("app/(app)/data-edit/page.tsx")).toMatch(/DATA_EDIT_FOR_ALL \|\| isSuper/);
    expect(read("components/DataEditLink.tsx")).toMatch(/if \(!show \|\| !\(DATA_EDIT_FOR_ALL \|\| isSuper\)\) return null;/);
    expect(read("app/(app)/sorting/page.tsx")).not.toMatch(/isSuper|is_super/);
  });
  it("زرار «تعديل» تحت كل ملف داتا بيفتح صفحة التعديل على نفس الملف", () => {
    const s = read("app/(app)/sorting/page.tsx");
    expect(s).toMatch(/<DataEditLink slot="data" show=\{!!dataTable\} \/>/);
    expect(s).toMatch(/<DataEditLink slot=\{`data-\$\{i \+ 2\}`\} show=\{!!ed\.table\} \/>/);
    expect(read("components/DataEditLink.tsx")).toMatch(/href=\{`\/data-edit\?slot=\$\{slot\}`\}/);
  });
  it("الصفحة: بحث + حفظ بتأكيد + تصدير + احترام قفل الداتا", () => {
    const p = read("app/(app)/data-edit/page.tsx");
    expect(p).toMatch(/searchDataFile\(/);
    expect(p).toMatch(/saveDataEdits\(file\.ref, \{ edits, deletes: \[\.\.\.deletes\] \}, result\?\.stamp\)/);
    expect(p).toMatch(/editSummary\(pending\)/);
    expect(p).toMatch(/exportDataFile\(file\.ref\)/);
    expect(p).toMatch(/ph:sorting:dataLocked/);
  });
  it("🔒 عضو مقفول عليه الفرز ⇒ صفحة التعديل مقفولة كمان", () => {
    expect(read("lib/groupLocks.ts")).toMatch(/const SORT_ROUTES = \[[^\]]*"\/data-edit"/);
  });
});

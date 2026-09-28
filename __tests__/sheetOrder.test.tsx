import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { orderRunsBySheet, moveInOrder } from "@/lib/sheetOrder";
import ReferralSheetPicker from "@/components/ReferralSheetPicker";
import type { SheetInfo } from "@/lib/referralSheets";

/**
 * 📑 **نتيجة الفرز بترتيب ورقات المندوب.**
 *
 * طلب المالك (٢٨ سبتمبر ٢٠٢٦): ملف داتا فيه ورقتين («داتا» و«داتا قديمه»)،
 * ولما المندوب يعلّم على الاتنين النتيجة بتطلع بترتيب الملف. المطلوب: «الورقه
 * اللي يختارها الاول هيا اللي تظهر نتيجتها فوق، والتانية تحتها — المندوب هو اللي
 * يختار يدوي بإيده».
 *
 * السبب: `iterateRows` بيلفّ على الدفعات بترتيب تخزينها (= ترتيب الملف)، والاختيار
 * بيفلتر بس ومابيرتّبش.
 */
type Row = { id: string; srcIdx?: number; sheet?: string };
const g = (r: Row) => r.srcIdx ?? 0;

afterEach(() => cleanup());

describe("orderRunsBySheet", () => {
  it("🔴 الورقة اللي المندوب اختارها الأول نتيجتها فوق", () => {
    const rows: Row[] = [
      { id: "q1", sheet: "داتا قديمه" }, { id: "q2", sheet: "داتا قديمه" },
      { id: "n1", sheet: "داتا" }, { id: "n2", sheet: "داتا" },
    ];
    const out = orderRunsBySheet(rows, g, () => ["داتا", "داتا قديمه"]);
    expect(out.map((r) => r.id)).toEqual(["n1", "n2", "q1", "q2"]);
  });

  it("الترتيب جوّه الورقة الواحدة زي ما هو (ترتيب الملف)", () => {
    const rows: Row[] = [
      { id: "a", sheet: "س" }, { id: "x", sheet: "ص" }, { id: "b", sheet: "س" }, { id: "y", sheet: "ص" },
    ];
    const out = orderRunsBySheet(rows, g, () => ["ص", "س"]);
    expect(out.map((r) => r.id)).toEqual(["x", "y", "a", "b"]);
  });

  it("🔴 مابينقلش صفوف من ملف لملف — كل ملف نافذته", () => {
    const rows: Row[] = [
      { id: "m1", srcIdx: 0, sheet: "ب" }, { id: "m2", srcIdx: 0, sheet: "أ" },
      { id: "e1", srcIdx: 1, sheet: "أ" }, { id: "e2", srcIdx: 1, sheet: "ب" },
    ];
    const orders: Record<number, string[]> = { 0: ["أ", "ب"], 1: ["ب", "أ"] };
    const out = orderRunsBySheet(rows, g, (s) => orders[s]);
    expect(out.map((r) => r.id)).toEqual(["m2", "m1", "e2", "e1"]);
  });

  it("من غير ترتيب (ورقة واحدة / مفيش ورقات) النتيجة زي ما هي بالظبط", () => {
    const rows: Row[] = [{ id: "1" }, { id: "2", sheet: "داتا" }, { id: "3" }];
    expect(orderRunsBySheet(rows, g, () => null).map((r) => r.id)).toEqual(["1", "2", "3"]);
    expect(orderRunsBySheet(rows, g, () => ["داتا"]).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("الصف اللي ورقته مش في الترتيب (نتيجة قديمة مكاشة) بيفضل بعد المرتّب وبترتيبه", () => {
    const rows: Row[] = [{ id: "old1" }, { id: "n", sheet: "ب" }, { id: "old2" }, { id: "m", sheet: "أ" }];
    const out = orderRunsBySheet(rows, g, () => ["أ", "ب"]);
    expect(out.map((r) => r.id)).toEqual(["m", "n", "old1", "old2"]);
  });

  it("مابيغيّرش المصفوفة الأصلية", () => {
    const rows: Row[] = [{ id: "a", sheet: "ب" }, { id: "b", sheet: "أ" }];
    orderRunsBySheet(rows, g, () => ["أ", "ب"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("moveInOrder", () => {
  it("بيطلّع ورقة لفوق وبينزّل ورقة لتحت", () => {
    expect(moveInOrder(["أ", "ب", "ج"], "ج", -1)).toEqual(["أ", "ج", "ب"]);
    expect(moveInOrder(["أ", "ب", "ج"], "أ", 1)).toEqual(["ب", "أ", "ج"]);
  });
  it("عند الحافة أو لورقة مش موجودة مابيعملش حاجة", () => {
    expect(moveInOrder(["أ", "ب"], "أ", -1)).toEqual(["أ", "ب"]);
    expect(moveInOrder(["أ", "ب"], "ب", 1)).toEqual(["أ", "ب"]);
    expect(moveInOrder(["أ", "ب"], "ج", 1)).toEqual(["أ", "ب"]);
  });
});

// ── المنتقي ─────────────────────────────────────────────────────────────────
const sheet = (name: string, rows: number): SheetInfo => ({
  name, headerRow: 0, plateCol: 0, plateColName: "رقم اللوحة",
  plateCount: rows, rowCount: rows, headers: [], rows: [], hidden: false,
});
const SHEETS = [sheet("داتا", 1024162), sheet("داتا قديمه", 1010057)];

function rowNames(): string[] {
  return screen.getAllByTestId("sheet-row").map((el) => el.getAttribute("data-sheet") ?? "");
}

describe("ReferralSheetPicker — ترتيب الورقات (للداتا بس)", () => {
  it("🔴 الورقات المختارة بتظهر فوق بترتيب اختيار المندوب ومرقّمة", () => {
    render(<ReferralSheetPicker ordered sheets={SHEETS} selected={new Set(["داتا قديمه", "داتا"])}
      onChange={() => {}} total={0} unit="صف" />);
    fireEvent.click(screen.getByText(/ورقات الملف/));
    expect(rowNames()).toEqual(["داتا قديمه", "داتا"]);
    expect(screen.getByTestId("sheet-rank-داتا قديمه").textContent).toBe("1");
    expect(screen.getByTestId("sheet-rank-داتا").textContent).toBe("2");
  });

  it("🔴 السهم بيغيّر الترتيب بإيد المندوب", () => {
    const onChange = vi.fn();
    render(<ReferralSheetPicker ordered sheets={SHEETS} selected={new Set(["داتا قديمه", "داتا"])}
      onChange={onChange} total={0} unit="صف" />);
    fireEvent.click(screen.getByText(/ورقات الملف/));
    fireEvent.click(screen.getByLabelText("طلّع «داتا» لفوق"));
    expect([...(onChange.mock.calls[0][0] as Set<string>)]).toEqual(["داتا", "داتا قديمه"]);
  });

  it("التعليم على ورقة جديدة بيحطها آخر الترتيب", () => {
    const onChange = vi.fn();
    render(<ReferralSheetPicker ordered sheets={SHEETS} selected={new Set(["داتا قديمه"])}
      onChange={onChange} total={0} unit="صف" />);
    fireEvent.click(screen.getByText(/ورقات الملف/));
    fireEvent.click(screen.getByText("داتا"));
    expect([...(onChange.mock.calls[0][0] as Set<string>)]).toEqual(["داتا قديمه", "داتا"]);
  });

  it("«تحديد الكل» بيحافظ على ترتيب اللي المندوب اختاره", () => {
    const onChange = vi.fn();
    const three = [...SHEETS, sheet("ورقة ٣", 10)];
    render(<ReferralSheetPicker ordered sheets={three} selected={new Set(["ورقة ٣"])}
      onChange={onChange} total={0} unit="صف" />);
    fireEvent.click(screen.getByText(/ورقات الملف/));
    fireEvent.click(screen.getByText("تحديد الكل"));
    expect([...(onChange.mock.calls[0][0] as Set<string>)]).toEqual(["ورقة ٣", "داتا", "داتا قديمه"]);
  });

  it("🔴 منتقي الإحالة (من غير ordered) زي ما هو: ترتيب الملف ومن غير أرقام ولا أسهم", () => {
    render(<ReferralSheetPicker sheets={SHEETS} selected={new Set(["داتا قديمه", "داتا"])}
      onChange={() => {}} total={0} />);
    fireEvent.click(screen.getByText(/ورقات الملف/));
    expect(rowNames()).toEqual(["داتا", "داتا قديمه"]);
    expect(screen.queryByTestId("sheet-rank-داتا")).toBeNull();
    expect(screen.queryByLabelText("طلّع «داتا» لفوق")).toBeNull();
  });
});

// ── حارس التوصيل في صفحة الفرز ──────────────────────────────────────────────
describe("توصيل ترتيب الورقات في صفحة الفرز", () => {
  const code = readFileSync(join(process.cwd(), "app", "(app)", "sorting", "page.tsx"), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");

  it("🔴 كل لفّة على ملفات الداتا بتاخد اسم الورقة (مفيش `async (batch) =>` لوحدها)", () => {
    expect(code).not.toMatch(/iterateRows\(async \(batch\) =>/);
  });

  it("🔴 الترتيب بيتطبّق في الفرز الكلي والجديد واللصق", () => {
    const uses = code.match(/orderRunsBySheet\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it("🔴 منتقيات الداتا بتاخد ordered، ومنتقي الإحالة لأ", () => {
    const pickers = code.match(/<ReferralSheetPicker[\s\S]*?\/>/g) ?? [];
    expect(pickers.length).toBe(3);
    const data = pickers.filter((p) => /dataSheetInfos|extraSheetInfos/.test(p));
    const ref = pickers.filter((p) => /refSheets/.test(p));
    expect(data.length).toBe(2);
    for (const p of data) expect(p).toMatch(/\bordered\b/);
    expect(ref.length).toBe(1);
    expect(ref[0]).not.toMatch(/\bordered\b/);
  });
});

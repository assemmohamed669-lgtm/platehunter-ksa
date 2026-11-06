import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

/**
 * 📍 المشاركة بنفس ترتيب «الأقرب» — المالك (٦ نوفمبر ٢٠٢٦): «لما يدوس علي زر الاقرب … نتيجه الفرز اللي بتبقي طالعاله
 * لما ييجي يشاركها مش بتيجي بنفس الترتيب … لو مدسش الاقرب يروح بنفس الترتيب اللي طلعلو بس لو داس يتشاركو بنفس الترتيب
 * اللي في نتيجه الفرز بعد مايدوس الاقرب».
 *  · «المطلوب» و«شهايد النهارده» (`WantedResultsTable` + أزرار المشاركة تحته) · «فرز» بتاع «صوت فقط» · المحدد في سجلات
 *    صفحة الفرز. (أزرار المشاركة الكبيرة في صفحة الفرز كانت ماشية بترتيب الأقرب أصلاً.)
 *  · السوبر أدمن الأول (`NEAREST_SHARE_FOR_ALL = false`) — باقي المناديب زي الأول بالحرف.
 */

let nearOn = true;
vi.mock("@/lib/nearestShare", async (orig) => ({
  ...(await orig<typeof import("@/lib/nearestShare")>()),
  useNearestShareOn: () => nearOn,
}));
const shared: string[] = [];
vi.mock("@/lib/share", () => ({ shareTextViaChooser: async (t: string) => { shared.push(t); return true; } }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

import { NEAREST_SHARE_FOR_ALL, orderByIds, pickShareIndexes } from "@/lib/nearestShare";
import WantedResultsTable, { type WantedRow } from "@/components/WantedResultsTable";
import { gpsService } from "@/lib/gps";

describe("🔒 مين ياخده", () => {
  it("🔴 السوبر أدمن الأول — مش مفتوح للكل لسه", () => {
    expect(NEAREST_SHARE_FOR_ALL).toBe(false);
  });
});

describe("📐 ترتيب المشاركة", () => {
  const rows = ["a", "b", "c", "d"].map((id) => ({ id }));
  it("🔴 بترتيب الأقرب — واللي مش في الترتيب بيفضل في الآخر بترتيبه", () => {
    expect(orderByIds(rows, ["c", "a"]).map((r) => r.id)).toEqual(["c", "a", "b", "d"]);
    expect(orderByIds(rows, ["d", "c", "b", "a"]).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
    expect(orderByIds(rows, ["zz", "b"]).map((r) => r.id)).toEqual(["b", "a", "c", "d"]);
  });
  it("🔴 من غير الأقرب ⇒ نفس الترتيب اللي طلع", () => {
    expect(orderByIds(rows, null)).toBe(rows);
  });
  it("🔴 بالأرقام (صوت فقط): الأقرب ⇐ ترتيبه · المحدد بس لو فيه تحديد", () => {
    expect(pickShareIndexes(4, [2, 0, 3, 1], new Set())).toEqual([2, 0, 3, 1]);
    expect(pickShareIndexes(4, [2, 0, 3, 1], new Set([1, 2]))).toEqual([2, 1]);
    expect(pickShareIndexes(4, null, new Set())).toEqual([0, 1, 2, 3]);
    expect(pickShareIndexes(4, null, new Set([2, 1]))).toEqual([1, 2]);
  });
});

// ── الجدول نفسه: ٣ عربيات — البعيدة الأول في النتيجة ──
const ME = { lat: 21.5, lng: 39.2 };
const row = (id: string, plate: string, lat: number): WantedRow => ({
  id, plate, norm: plate.replace(/\s/g, ""), type: "", address: "", brand: "", mapsLink: "", color: "", year: "",
  lat, lng: ME.lng,
} as unknown as WantedRow);
const ROWS = [row("far", "ابح 1111", 22.5), row("near", "دسب 2222", 21.51), row("mid", "هطو 3333", 21.8)];

beforeEach(() => {
  shared.length = 0;
  vi.spyOn(gpsService, "getLastCoords").mockReturnValue({ ...ME, accuracy: 5, ts: Date.now() } as unknown as ReturnType<typeof gpsService.getLastCoords>);
});
afterEach(() => { cleanup(); nearOn = true; vi.restoreAllMocks(); });

async function pressNearest() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /الأقرب/ })); });
}
const bulkShare = () => screen.getAllByRole("button", { name: /^واتساب$/ }).find((b) => b.textContent?.includes("واتساب"))!;
const order = (text: string) => ["ابح 1111", "دسب 2222", "هطو 3333"].sort((a, b) => text.indexOf(a) - text.indexOf(b));

describe("📋 «المطلوب» / «شهايد النهارده»", () => {
  it("🔴 الجدول بيبلّغ الصفحة بترتيب الأقرب (عشان أزرار المشاركة تحته) — والقفل بيرجّعه", async () => {
    const onOrder = vi.fn();
    render(<WantedResultsTable rows={ROWS} onDelete={() => {}} onOrderChange={onOrder} />);
    expect(onOrder).toHaveBeenLastCalledWith(null);
    await pressNearest();
    expect(onOrder).toHaveBeenLastCalledWith(["near", "mid", "far"]);
    await pressNearest();
    expect(onOrder).toHaveBeenLastCalledWith(null);
  });

  it("🔴 «واتساب» للمحدد بعد الأقرب ⇒ بنفس ترتيب الشاشة", async () => {
    render(<WantedResultsTable rows={ROWS} onDelete={() => {}} />);
    await pressNearest();
    fireEvent.click(screen.getByRole("button", { name: /تحديد الكل/ }));
    fireEvent.click(bulkShare());
    expect(shared).toHaveLength(1);
    expect(order(shared[0])).toEqual(["دسب 2222", "هطو 3333", "ابح 1111"]);
  });

  it("من غير الأقرب ⇒ نفس الترتيب اللي طلع", () => {
    render(<WantedResultsTable rows={ROWS} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /تحديد الكل/ }));
    fireEvent.click(bulkShare());
    expect(order(shared[0])).toEqual(["ابح 1111", "دسب 2222", "هطو 3333"]);
  });

  it("باقي المناديب (المفتاح مقفول) ⇒ زي الأول بالحرف", async () => {
    nearOn = false;
    render(<WantedResultsTable rows={ROWS} onDelete={() => {}} />);
    await pressNearest();
    fireEvent.click(screen.getByRole("button", { name: /تحديد الكل/ }));
    fireEvent.click(bulkShare());
    expect(order(shared[0])).toEqual(["ابح 1111", "دسب 2222", "هطو 3333"]);
  });
});

describe("🔌 التوصيل في كل مكان بيفرز", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 «شهايد النهارده»: النافذتين + «مشاركة الكل» بترتيب الأقرب", () => {
    const c = read("components/DailyCertSort.tsx");
    expect(c).toMatch(/const nearestShare = useNearestShareOn\(\);/);
    expect(c).toMatch(/onOrderChange=\{\(ids\) => \{ nearOrderRef\.current\[which\] = ids; \}\}/);
    expect(c).toMatch(/nearestShare \? orderByIds\(rows, nearOrderRef\.current\[which\]\) : rows/);
    // كل حاجة في المشاركة (الصفوف + الصورة + الإكسيل + الألوان) من الصفوف المترتّبة
    expect(c).not.toMatch(/buildColoredSortExcel\(exportRows\(\), title, dupeHexColors\(rows\)\)/);
    expect(c).toMatch(/certCombinedExportRows\(shareRowsOf\("dataRows"\), shareRowsOf\("recordRows"\), cols\)/);
  });
  it("🔴 «المطلوب»: نافذتين الداتا والسجلات", () => {
    const w = read("app/(app)/wanted/page.tsx");
    expect(w).toMatch(/const nearestShare = useNearestShareOn\(\);/);
    expect(w).toMatch(/onOrderChange=\{\(ids\) => \{ nearOrderRef\.current\[title\] = ids; \}\}/);
    expect(w).toMatch(/toExportRows\(shareRows\(\), colOrder, orderMode\)/);
    expect(w).toMatch(/toImageTable\(shareRows\(\), colOrder, orderMode\)/);
    expect(w).toMatch(/dupeHexColors\(shareRows\(\)\)/);
  });
  it("🔴 «صوت فقط»: إكسيل/صورة/نص بترتيب «الأقرب أولاً»", () => {
    const v = read("components/VoiceOnlySort.tsx");
    expect(v).toMatch(/const nearestShare = useNearestShareOn\(\);/);
    expect(v).toMatch(/pickShareIndexes\(table\.rows\.length, nearestShare && nearest && userLoc \? view\.map\(\(x\) => x\.i\) : null, sel\)/);
  });
  it("🔴 صفحة الفرز: «واتساب»/«نسخ» للسجلات المحددة بترتيب الأقرب", () => {
    const s = read("app/(app)/sorting/page.tsx");
    expect(s).toMatch(/const nearestShare = useNearestShareOn\(\);/);
    expect(s).toMatch(/nearestShare && nearestActive\n?\s*\? displayTashyeek\.filter\(\(x\) => tashyeekSelected\.has\(x\.idx\)\)\.map\(\(x\) => x\.r\)/);
  });
});

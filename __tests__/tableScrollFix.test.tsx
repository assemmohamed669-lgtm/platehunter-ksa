import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

/**
 * ↔️ جدول النتيجة بيرجع لأول الصف لوحده على الآيفون — المالك (٦ نوفمبر ٢٠٢٦) عن العبيدي (آيفون): «بيمشي صباعه
 * ويسحب في المربع علشان يشوف الاعمدة … امشي ب صباعي علشان اجيب اخر الصف علشان احمل الشهادة يرجعه من الاول
 * ويجيبه يمين المربع».
 *
 *  · السحب الجانبي جوّه الجدول بقى «شمال ⇐ يمين» من جوّه (`dir="ltr"`) والجدول نفسه زي ما هو (`direction: rtl`،
 *    اللوحة على اليمين) — محرّك الآيفون عنده مشاكل معروفة في حفظ مكان السحب الجانبي في الجداول اللي بتتقري من اليمين.
 *  · الجدول فاكر المندوب واقف فين (بُعده عن أول الصف — اليمين) وبيرجّعه لنفس المكان بعد أي تحديث للصفوف.
 *  · التحديث التلقائي لـ«شهايد النهارده» مابيرسمش الجدول وصباعه عليه — بيستنى لحد ما يشيله ويقف شوية.
 *  · للعبيدي + السوبر أدمن الأول (`TABLE_SCROLL_FIX_FOR_ALL = false`) — باقي المناديب الجدول زي الأول بالحرف.
 */

let fixOn = true;
vi.mock("@/lib/tableScrollFix", async (orig) => ({
  ...(await orig<typeof import("@/lib/tableScrollFix")>()),
  useTableScrollFix: () => fixOn,
}));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

import {
  TABLE_SCROLL_FIX_FOR_ALL, TABLE_SCROLL_FIX_IDS, TABLE_TOUCH_IDLE_MS, TABLE_TOUCH_STALE_MS,
  tableScrollFixFor, fromRightOf, scrollLeftFor, noteTableTouch, tableBusy, waitTableIdle, resetTableTouch,
} from "@/lib/tableScrollFix";
import WantedResultsTable, { type WantedRow } from "@/components/WantedResultsTable";

const OBAIDI = "db903add-ebc1-4b1e-96e8-8cacd87dc13b";

describe("🔒 مين ياخده", () => {
  it("🔴 العبيدي + السوبر أدمن بس — مش مفتوح للكل لسه", () => {
    expect(TABLE_SCROLL_FIX_FOR_ALL).toBe(false);
    expect(TABLE_SCROLL_FIX_IDS).toContain(OBAIDI);
    expect(tableScrollFixFor(OBAIDI, false)).toBe(true);
    expect(tableScrollFixFor("someone-else", false)).toBe(false);
    expect(tableScrollFixFor(null, false)).toBe(false);
    expect(tableScrollFixFor("someone-else", true)).toBe(true);
  });
});

describe("📐 حساب مكان السحب (من غير شاشة)", () => {
  it("🔴 البُعد عن أول الصف (اليمين) ⇐ ومنه مكان السحب تاني", () => {
    // جدول ١٠٠٠ والمربع ٣٠٠ ⇒ أقصى سحب ٧٠٠. اليمين (اللوحة) = ٧٠٠.
    expect(fromRightOf(700, 1000, 300)).toBe(0);
    expect(fromRightOf(100, 1000, 300)).toBe(600);
    expect(scrollLeftFor(0, 1000, 300)).toBe(700);
    expect(scrollLeftFor(600, 1000, 300)).toBe(100);
    // الجدول عرض ⇒ نفس البُعد عن اللوحة
    expect(scrollLeftFor(600, 1200, 300)).toBe(300);
    // الجدول ضاق ⇒ مانطلعش برّه
    expect(scrollLeftFor(900, 1000, 300)).toBe(0);
    expect(scrollLeftFor(0, 200, 300)).toBe(0);
    expect(fromRightOf(0, 200, 300)).toBe(0);
  });
});

describe("✋ الصباع على الجدول", () => {
  beforeEach(() => resetTableTouch());
  it("🔴 ماسك ⇒ مشغول · شال ⇒ مشغول لحد ما يقف شوية · بعدها فاضي", () => {
    expect(tableBusy(1000)).toBe(false);
    noteTableTouch("start", 1000);
    expect(tableBusy(1000 + 5000)).toBe(true);
    noteTableTouch("end", 7000);
    expect(tableBusy(7000 + TABLE_TOUCH_IDLE_MS - 1)).toBe(true);
    expect(tableBusy(7000 + TABLE_TOUCH_IDLE_MS)).toBe(false);
  });
  it("🔴 السحب لوحده (الزحلقة بعد ما الصباع يتشال) بيأخّر برضه", () => {
    noteTableTouch("scroll", 2000);
    expect(tableBusy(2000 + TABLE_TOUCH_IDLE_MS - 1)).toBe(true);
    expect(tableBusy(2000 + TABLE_TOUCH_IDLE_MS)).toBe(false);
  });
  it("🔴 لمسة مافيهاش «شال» (الجدول اتشال وهو ماسك) مابتعلّقش التحديث على طول", () => {
    noteTableTouch("start", 0);
    expect(tableBusy(TABLE_TOUCH_STALE_MS - 1)).toBe(true);
    expect(tableBusy(TABLE_TOUCH_STALE_MS)).toBe(false);
  });
  it("🔴 الاستنى: بيخلص أول ما يفضى — أو عند الحد الأقصى", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(10_000);
      noteTableTouch("end", 10_000);
      let done = false;
      void waitTableIdle(20_000).then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(TABLE_TOUCH_IDLE_MS - 600);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(done).toBe(true);

      // ماسك على طول ⇒ الحد الأقصى
      noteTableTouch("start", Date.now());
      let done2 = false;
      void waitTableIdle(3000).then(() => { done2 = true; });
      await vi.advanceTimersByTimeAsync(2500);
      expect(done2).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(done2).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ── الجدول نفسه: jsdom مافيهوش مقاسات ⇒ بنحدد عرض الجدول والمربع ومكان السحب بإيدينا ──
let sw = 1000;
const cw = 300;
const scrollPos = new WeakMap<Element, number>();
const isBox = (el: Element) => el instanceof HTMLDivElement && el.classList.contains("overflow-auto");
const saved: Record<string, PropertyDescriptor | undefined> = {};
beforeAll(() => {
  for (const k of ["scrollWidth", "clientWidth", "scrollLeft"]) saved[k] = Object.getOwnPropertyDescriptor(Element.prototype, k);
  Object.defineProperty(Element.prototype, "scrollWidth", { configurable: true, get() { return isBox(this) ? sw : 0; } });
  Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() { return isBox(this) ? cw : 0; } });
  Object.defineProperty(Element.prototype, "scrollLeft", {
    configurable: true,
    get() { return scrollPos.get(this) ?? 0; },
    set(v: number) { scrollPos.set(this, v); },
  });
});
afterAll(() => {
  for (const [k, d] of Object.entries(saved)) if (d) Object.defineProperty(Element.prototype, k, d);
});
afterEach(() => { cleanup(); sw = 1000; fixOn = true; resetTableTouch(); });

const row = (i: number): WantedRow => ({
  id: `r${i}`, plate: `ابح ${1000 + i}`, norm: `ابح${1000 + i}`, type: "", address: "", brand: "", mapsLink: "", color: "", year: "",
} as unknown as WantedRow);
const box = (c: HTMLElement) => c.querySelector("div.overflow-auto") as HTMLDivElement;

describe("↔️ الجدول", () => {
  it("🔴 السحب من جوّه «شمال ⇐ يمين» والجدول نفسه من اليمين — وبيفتح على اللوحة (اليمين)", () => {
    const { container } = render(<WantedResultsTable rows={[row(1), row(2)]} onDelete={() => {}} mode="certs" />);
    const b = box(container);
    expect(b.getAttribute("dir")).toBe("ltr");
    expect((b.querySelector("table") as HTMLTableElement).style.direction).toBe("rtl");
    expect(b.scrollLeft).toBe(700);
  });

  it("🔴 تحديث الصفوف (الجدول عرض) ⇒ بيفضل واقف عند نفس العمود اللي المندوب كان عنده", () => {
    const { container, rerender } = render(<WantedResultsTable rows={[row(1)]} onDelete={() => {}} mode="certs" />);
    const b = box(container);
    // المندوب سحب ناحية آخر الصف (الشمال)
    b.scrollLeft = 100;
    fireEvent.scroll(b);
    // التحديث التلقائي: صفوف جديدة والجدول بقى أعرض
    sw = 1200;
    rerender(<WantedResultsTable rows={[row(1), row(2), row(3)]} onDelete={() => {}} mode="certs" />);
    expect(b.scrollLeft).toBe(300);   // نفس البُعد عن اللوحة (٦٠٠) — مارجعش لأول الصف
  });

  it("🔴 لمس الجدول بيتسجّل (عشان التحديث التلقائي يستنى)", () => {
    const { container } = render(<WantedResultsTable rows={[row(1)]} onDelete={() => {}} mode="certs" />);
    act(() => { fireEvent.touchStart(box(container)); });
    expect(tableBusy(Date.now())).toBe(true);
  });

  it("باقي المناديب ⇒ الجدول زي الأول بالحرف (من اليمين، ومحدش بيلمس مكان السحب)", () => {
    fixOn = false;
    const { container, rerender } = render(<WantedResultsTable rows={[row(1)]} onDelete={() => {}} mode="certs" />);
    const b = box(container);
    expect(b.getAttribute("dir")).toBeNull();
    expect(b.scrollLeft).toBe(0);
    b.scrollLeft = -250;
    sw = 1200;
    rerender(<WantedResultsTable rows={[row(1), row(2)]} onDelete={() => {}} mode="certs" />);
    expect(b.scrollLeft).toBe(-250);
  });
});

describe("🔌 التوصيل في «شهايد النهارده»", () => {
  const src = readFileSync(path.resolve(__dirname, "..", "components/DailyCertSort.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 التحديث التلقائي (silent) بيستنى الصباع يتشال قبل ما يرسم — الدوسة على «فرز» لأ", () => {
    expect(src).toMatch(/const scrollFix = useTableScrollFix\(\);/);
    // قبل ما يقرا اللي المندوب مسحه — عشان اللي يتمسح وهو مستني مايرجعش
    expect(src).toMatch(/if \(silent && scrollFixRef\.current\) await waitTableIdle\(CERT_TOUCH_WAIT_MAX_MS\);\n\s*const prev = resultsRef\.current\[d\.day\];/);
    expect(src).toMatch(/const CERT_TOUCH_WAIT_MAX_MS = 20_000;/);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

/**
 * 📄 مربع «شهايد النهارده» شغّال فعلاً — المالك (٥ أكتوبر ٢٠٢٦) مالوش حساب «صوت فقط» يجرّب بيه:
 * «اهم حاجه تتأكد انه اتعمل زي دة وشغال». الاختبار ده بيعمل اللي المندوب بيعمله: يفتح التبويب ⇒
 * الجملة الخضرا بالعدد ⇒ يدوس «افرز» ⇒ النافذتين بأعمدة المالك ⇒ «موقعها».
 */
const TEAM = "team-data";
const teamRows = [
  { "رقم اللوحة": "ا ب ح 1111", "النوع": "سيدان", "العنوان": "شارع ١" },
  { "رقم اللوحة": "ر ق ح 8377", "النوع": "ونيت", "العنوان": "شارع التخصصي" },
  { "رقم اللوحة": "د ه و 2222", "النوع": "فان", "العنوان": "شارع ٢" },
];
const files: Record<string, { headers: string[]; rows: Record<string, string>[]; uploadedAt?: string; streamed?: boolean; streamSlot?: string }> = {};
// ملفات على الجهاز (الكبيرة/متعددة الورقات): slot ⇒ صفوفها كلها
const stream: Record<string, { headers: string[]; rows: Record<string, string>[] }> = {};

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }), getUser: async () => ({ data: { user: null } }) } },
}));
vi.mock("@/lib/idb", async (orig) => ({
  ...(await orig<typeof import("@/lib/idb")>()),
  getUploadedFile: async (_a: string, slot: string) => files[slot] ?? null,
  getAllFieldCheckEntries: async () => [],
  saveUploadedFile: async () => {},
}));
vi.mock("@/lib/dataStore", () => ({
  getDataMeta: async (slot: string) => (stream[slot] ? { headers: stream[slot].headers, plateCol: "" } : null),
  getSampleRows: async (n: number, slot: string) => (stream[slot]?.rows ?? []).slice(0, Math.min(n, 1)),
  iterateRows: async (onBatch: (rows: Record<string, string>[], base: number) => Promise<void>, { slot }: { slot: string }) => {
    const rows = stream[slot]?.rows ?? [];
    for (let i = 0; i < rows.length; i += 2) await onBatch(rows.slice(i, i + 2), i);
  },
}));
vi.mock("@/lib/teamData", async (orig) => ({
  ...(await orig<typeof import("@/lib/teamData")>()),
  fetchTeamDataState: async () => ({ role: "member", team: "ف", open: false, file: { path: "t/x.xlsx", fileName: "x.xlsx", rowCount: 3, plateCount: 3, updatedAt: "2026-10-05T00:00:00Z" } }),
  downloadTeamData: async () => null,
}));
vi.mock("@/lib/chassisRecords", async (orig) => ({
  ...(await orig<typeof import("@/lib/chassisRecords")>()),
  getChassisRecords: () => [{ id: "ch1", chassis: "JTDBR32E720012345", vehicleType: "جيب", region: "حي الملز", found: false, checkedAt: "2026-10-05T10:00:00.000Z" }],
}));
vi.mock("@/lib/checkSheets", async (orig) => ({
  ...(await orig<typeof import("@/lib/checkSheets")>()),
  loadAllCheckSources: async () => [{ headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ر ق ح 8377" }] }],
}));
vi.mock("@/lib/sortBeep", () => ({ playSortBeep: () => {} }));
vi.mock("@/components/ShareSortButton", () => ({ default: () => null }));
vi.mock("@/components/LocationNeighborsModal", () => ({
  default: ({ view }: { view: { target: Record<string, string> } | null }) => (view ? <div>موقع: {view.target["العنوان"]}</div> : null),
}));

import DailyCertSort from "@/components/DailyCertSort";

const entries = [
  { fileId: "F1aaaaaaaaaa", name: "8377.pdf", createdAt: "2026-10-05T05:00:00.000Z", plate: "رقح8377", plateText: "ر ق ح 8377", vin: "MR0FA3CD100123456",
    bank: "مصرف الراجحي", make: "تويوتا", model: "هايلكس", year: "2021", color: "ابيض", status: "متعثر", certDate: "05/10/2026" },
  { fileId: "F2bbbbbbbbbb", name: "JTDBR32E720012345.pdf", createdAt: "2026-10-05T06:00:00.000Z", plate: "سصط5678", plateText: "س ص ط 5678", vin: "JTDBR32E720012345",
    bank: "البنك الأهلي", make: "لكزس", model: "LX570", year: "2019", color: "اسود", status: "متعثر", certDate: "05/10/2026" },
];

// السيرفر: النهارده ٦ أكتوبر — كل يوم (offset) بعدده وشهايده
const yesterdayCert = { ...entries[0], fileId: "F3cccccccccc", name: "1111.pdf", plate: "ابح1111", plateText: "ا ب ح 1111", vin: "" };
let days: Record<number, { total: number; parsed: number; entries: typeof entries }> = {};
const fetchMock = vi.fn(async (url: string) => {
  const u = new URL(String(url), "https://x.test");
  const off = Number(u.searchParams.get("offset") ?? "0");
  const day = ["2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03", "2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"][off];
  const d = days[off] ?? { total: 0, parsed: 0, entries: [] };
  const body = u.searchParams.get("count") === "1"
    ? { day, today: "2026-10-06", offset: off, total: d.total, parsed: d.parsed }
    : { day, today: "2026-10-06", offset: off, total: d.total, parsed: d.parsed, entries: d.entries };
  return { ok: true, json: async () => body } as Response;
});

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k];
  for (const k of Object.keys(stream)) delete stream[k];
  files[TEAM] = { headers: ["رقم اللوحة", "النوع", "العنوان"], rows: teamRows, uploadedAt: "2026-10-05T00:00:00Z" };
  localStorage.clear();
  days = { 0: { total: 2, parsed: 2, entries }, 1: { total: 1, parsed: 1, entries: [yesterdayCert] } };
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); fetchMock.mockClear(); });

const headersOf = (table: HTMLElement) => [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim());

describe("🔴 تبويب «شهايد» لمشتركين الصوت فقط — من الأول للآخر", () => {
  it("🔴 الجملة الخضرا ⇒ افرز ⇒ داتا المجموعة + سجل الشاص · أعمدة المالك · مطلوبة/تثبيت · موقعها", async () => {
    // داتا صفحة الفرز على نفس الجهاز مش بتاعة التبويب ده (مشترك الصوت فقط = داتا المجموعة)
    files.data = { headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "س ص ط 5678" }] };
    render(<DailyCertSort variant="team" />);
    expect(await screen.findByText(/النهارده نزل 2 شهادة جديدة — هيتم الفرز عليها/)).toBeTruthy();

    fireEvent.click(screen.getByText("افرز على شهايد النهارده"));
    const dataTitle = await screen.findByText("شهايد النهارده في الداتا");
    const dataBox = dataTitle.closest("div.rounded-2xl") as HTMLElement;
    const recBox = screen.getByText("شهايد النهارده في السجلات").closest("div.rounded-2xl") as HTMLElement;

    // ترتيب المالك بالظبط بعد رقم اللوحة
    const tbl = dataBox.querySelector("table") as HTMLElement;
    expect(headersOf(tbl).slice(2)).toEqual(["رقم اللوحة", "النوع", "نوع المركبة", "العنوان", "GPS", "تاريخ التسجيل", "موقعها في الداتا", "الشهادة", "الحالة", "المؤجر"]);

    // الداتا: العربية اللي في داتا المجموعة — ونيت/هايلكس، ومطلوبة (في شيت التشييك)
    const dataRows = within(dataBox).getAllByRole("row").slice(1);
    expect(dataRows).toHaveLength(1);
    const cells = [...dataRows[0].querySelectorAll("td")].map((td) => td.textContent?.trim());
    expect(cells.slice(3, 6)).toEqual(["ونيت", "هايلكس", "شارع التخصصي"]);
    expect(cells).toContain("مطلوبة");
    expect(cells[cells.length - 1]).toBe("مصرف الراجحي");

    // السجلات: سجل الشاص اتطابق برقم الشاص — وتثبيت (مش في شيت التشييك)
    const recRows = within(recBox).getAllByRole("row").slice(1);
    expect(recRows).toHaveLength(1);
    const rc = [...recRows[0].querySelectorAll("td")].map((td) => td.textContent?.trim());
    expect(rc).toContain("جيب");
    expect(rc).toContain("LX570");
    expect(rc).toContain("تثبيت");

    // «موقعها في الداتا» بتفتح على نفس العربية
    fireEvent.click(within(dataBox).getByText("موقعها"));
    expect(await screen.findByText("موقع: شارع التخصصي")).toBeTruthy();
  });

  it("🔴 المندوب يظهّر عمود زيادة ⇒ بيطلع في الآخر · ويخفي عمود ⇒ بيختفي", async () => {
    render(<DailyCertSort variant="team" />);
    fireEvent.click(await screen.findByText("افرز على شهايد النهارده"));
    const dataBox = (await screen.findByText("شهايد النهارده في الداتا")).closest("div.rounded-2xl") as HTMLElement;
    fireEvent.click(screen.getByText(/أعمدة نتيجة الشهايد/));
    fireEvent.click(screen.getByRole("button", { name: "رقم الشاص" }));
    fireEvent.click(screen.getByRole("button", { name: "العنوان" }));
    const h = headersOf(dataBox.querySelector("table") as HTMLElement);
    expect(h[h.length - 1]).toBe("رقم الشاص");
    expect(h).not.toContain("العنوان");
    expect(JSON.parse(localStorage.getItem("ph:certs:cols") ?? "{}")).toEqual({ hidden: ["العنوان"], extras: ["رقم الشاص"] });
  });
});

describe("🔴 صفحة المطلوب — الداتا الإضافية الكبيرة بتتفرز (المالك: «مش بيرفرز عليها»)", () => {
  it("🔴 العربية في آخر الملف الإضافي اللي على الجهاز (برّه العيّنة) بتطلع", async () => {
    delete files[TEAM];   // من غير داتا مجموعة — الإضافي بس
    files.data = { headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ل م ن 1234" }] };
    files["data-2"] = { headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "عيّنة" }], streamed: true, streamSlot: "xdata-1" };
    stream["xdata-1"] = {
      headers: ["رقم اللوحة", "الشارع"],
      rows: [{ "رقم اللوحة": "ا ا ا 1", "الشارع": "١" }, { "رقم اللوحة": "ب ب ب 2", "الشارع": "٢" }, { "رقم اللوحة": "ج ج ج 3", "الشارع": "٣" },
             { "رقم اللوحة": "د د د 4", "الشارع": "٤" }, { "رقم اللوحة": "س ص ط 5678", "الشارع": "طريق الملك عبدالله" }],
    };
    render(<DailyCertSort variant="sorting" />);
    fireEvent.click(await screen.findByText("افرز على شهايد النهارده"));
    const dataBox = (await screen.findByText("شهايد النهارده في الداتا")).closest("div.rounded-2xl") as HTMLElement;
    const rows = within(dataBox).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("طريق الملك عبدالله");
    fireEvent.click(within(dataBox).getByText("موقعها"));
    expect(await screen.findByText(/موقع:/)).toBeTruthy();
  });
});

/**
 * المالك (٦ أكتوبر ٢٠٢٦): «يختار مثلا اليوم اللي نزل فيه شهايد ... ف يظهرلو كم شهاد نزلت اليوم دة ويقدر
 * يفرز عليهم» و«شهايد اليوم الحالي ... عايزها تتحدث تلقائي لانها ممكن تنزل اي وقت من اليوم».
 */
describe("🔴 أي يوم لحد أسبوع ورا + النهارده بيتحدّث لوحده", () => {
  it("🔴 يختار «امبارح» ⇒ عدد امبارح ⇒ يفرز عليه ⇒ نتيجة امبارح", async () => {
    render(<DailyCertSort variant="team" />);
    expect(await screen.findByText(/النهارده نزل 2 شهادة جديدة/)).toBeTruthy();
    expect(screen.getAllByRole("button").filter((b) => /^(النهارده|امبارح|أول امبارح|قبل \d أيام)/.test(b.textContent ?? ""))).toHaveLength(8);

    fireEvent.click(screen.getByRole("button", { name: /^امبارح/ }));
    expect(await screen.findByText("امبارح (الإثنين 5/10) نزل 1 شهادة — هيتم الفرز عليها")).toBeTruthy();
    fireEvent.click(screen.getByText("افرز على شهايد امبارح"));
    const box = (await screen.findByText("شهايد امبارح في الداتا")).closest("div.rounded-2xl") as HTMLElement;
    const rows = within(box).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("شارع ١");
    expect(fetchMock.mock.calls.some(([u]) => /offset=1(?!&count)/.test(String(u)) && !String(u).includes("count=1"))).toBe(true);

    // الرجوع للنهارده: نتيجة امبارح مابتختلطش بيه
    fireEvent.click(screen.getByRole("button", { name: /^النهارده/ }));
    expect(await screen.findByText(/النهارده نزل 2 شهادة جديدة/)).toBeTruthy();
    expect(screen.queryByText("شهايد امبارح في الداتا")).toBeNull();
  });

  it("🔴 النهارده: شهايد جديدة اتقرت ⇒ النتيجة بتتعاد لوحدها · واللي المندوب مسحه مايرجعش", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // الصفحة قدام المندوب (جيسدوم بيعتبرها مستخبية)
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    files[TEAM].rows = [...teamRows, { "رقم اللوحة": "ل م ن 4444", "النوع": "دباب", "العنوان": "شارع ٤" }];
    days[0].entries = [...entries, { ...entries[0], fileId: "F4dddddddddd", plate: "لمن4444", plateText: "ل م ن 4444", vin: "", name: "4444.pdf" }];
    days[0].total = 3; days[0].parsed = 3;
    render(<DailyCertSort variant="team" />);
    fireEvent.click(await screen.findByText("افرز على شهايد النهارده"));
    const box = (await screen.findByText("شهايد النهارده في الداتا")).closest("div.rounded-2xl") as HTMLElement;
    expect(within(box).getAllByRole("row").slice(1)).toHaveLength(2);
    expect(screen.getByText(/بيتحدّث لوحده لما تنزل شهايد جديدة/)).toBeTruthy();

    // المندوب مسح عربية «ل م ن 4444»
    const del = within(box).getAllByRole("row").slice(1).find((r) => r.textContent?.includes("دباب"))!;
    fireEvent.click(within(del).getByTitle("حذف"));
    expect(within(box).getAllByRole("row").slice(1)).toHaveLength(1);

    // نزلت شهادة جديدة واتقرت (د ه و 2222 في داتا المجموعة)
    days[0] = { total: 4, parsed: 4, entries: [...days[0].entries, { ...entries[0], fileId: "F5eeeeeeeeee", plate: "دهو2222", plateText: "د ه و 2222", vin: "", name: "2222.pdf" }] };
    await act(async () => { await vi.advanceTimersByTimeAsync(130_000); });
    await vi.waitFor(() => expect(within(box).getAllByRole("row").slice(1)).toHaveLength(2));
    const texts = within(box).getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(texts.some((t) => t.includes("فان"))).toBe(true);      // الجديدة
    expect(texts.some((t) => t.includes("دباب"))).toBe(false);    // اللي اتمسحت مارجعتش
    expect(screen.getByText(/واتضاف 1 عربية/)).toBeTruthy();
  });
});


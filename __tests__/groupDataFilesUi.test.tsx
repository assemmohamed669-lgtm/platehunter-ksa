import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";

/**
 * 📂 «ملفات الداتا» — شاشة المسئول في «إدارة مجموعتي» + التوصيل عند العضو (الفرز / «شهايد النهارده» / «صوت فقط»).
 * المالك (٦ نوفمبر ٢٠٢٦): «يرفع اكتر من ملف داتا من صفحه ادارة مجموعتي ويختار الداتا دي تظهر ل مين في مجموعته بالظبط».
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const LEADER = "33333333-3333-4333-8333-333333333333";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const F2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const api = {
  listGroupFiles: vi.fn(),
  uploadGroupFile: vi.fn(async () => {}),
  setGroupFileAudience: vi.fn(async () => {}),
  deleteGroupFile: vi.fn(async () => {}),
};
vi.mock("@/lib/groupDataFiles", async (orig) => ({
  ...(await orig<typeof import("@/lib/groupDataFiles")>()),
  listGroupFiles: (...a: unknown[]) => api.listGroupFiles(...a),
  uploadGroupFile: (...a: unknown[]) => (api.uploadGroupFile as (...x: unknown[]) => Promise<void>)(...a),
  setGroupFileAudience: (...a: unknown[]) => (api.setGroupFileAudience as (...x: unknown[]) => Promise<void>)(...a),
  deleteGroupFile: (...a: unknown[]) => (api.deleteGroupFile as (...x: unknown[]) => Promise<void>)(...a),
}));
vi.mock("@/components/MemberDataManager", () => ({ countFile: async () => ({ rowCount: 5, plateCount: 4 }) }));

import GroupDataFilesManager from "@/components/GroupDataFilesManager";
import { collectCertDataSources, type CertSourceDeps } from "@/lib/dailyCertSources";

const MEMBERS = [{ id: A, username: "أحمد" }, { id: B, username: "محمد" }, { id: LEADER, username: "المسئول" }];
const file = (id: string, fileName: string, audience: "all" | "members", memberIds: string[] = []) =>
  ({ id, fileName, updatedAt: "2026-11-06T10:00:00Z", rowCount: 100, plateCount: 90, audience, memberIds });

beforeEach(() => {
  api.listGroupFiles.mockResolvedValue({
    files: [file(F1, "مكة.xlsx", "all"), file(F2, "الطايف.xlsx", "members", [A, B])],
    members: MEMBERS, leaderId: LEADER,
  });
  api.uploadGroupFile.mockClear(); api.setGroupFileAudience.mockClear(); api.deleteGroupFile.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  const r = render(<GroupDataFilesManager team="مكة" />);
  await screen.findByText("مكة.xlsx");
  return r;
}

describe("🧭 شاشة المسئول", () => {
  it("🔴 كل ملف قدامه بيظهر لمين", async () => {
    await mount();
    expect(screen.getByText("الطايف.xlsx")).toBeTruthy();
    expect(screen.getByText("👥 المجموعة كلها")).toBeTruthy();
    expect(screen.getByText("👤 أحمد، محمد")).toBeTruthy();
  });

  it("🔴 رفع كذا ملف مرة واحدة لأعضاء معيّنين — ومايترفعش من غير ما يختار حد", async () => {
    const { container } = await mount();
    fireEvent.click(screen.getByRole("button", { name: /رفع ملفات داتا/ }));
    fireEvent.click(screen.getByRole("button", { name: /أعضاء معيّنين/ }));
    const choose = screen.getByRole("button", { name: /اختار ملف أو أكتر/ }) as HTMLButtonElement;
    expect(choose.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "أحمد" }));
    expect(choose.disabled).toBe(false);
    const input = container.querySelector("input[type=file][multiple]") as HTMLInputElement;
    const f1 = new File(["a"], "جدة.xlsx"); const f2 = new File(["b"], "الدمام.xlsx");
    await act(async () => { fireEvent.change(input, { target: { files: [f1, f2] } }); });
    await waitFor(() => expect(api.uploadGroupFile).toHaveBeenCalledTimes(2));
    expect(api.uploadGroupFile).toHaveBeenNthCalledWith(1, "مكة", f1, { rowCount: 5, plateCount: 4 }, "members", [A]);
    expect(api.uploadGroupFile).toHaveBeenNthCalledWith(2, "مكة", f2, { rowCount: 5, plateCount: 4 }, "members", [A]);
  });

  it("🔴 «مين يشوفه» ⇒ يغيّر من غير رفع تاني", async () => {
    await mount();
    fireEvent.click(screen.getAllByRole("button", { name: /مين يشوفه/ })[1]);
    fireEvent.click(screen.getByRole("button", { name: /المجموعة كلها/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "حفظ" })); });
    expect(api.setGroupFileAudience).toHaveBeenCalledWith("مكة", F2, "all", []);
  });

  it("🔴 «تغيير الملف» بيحتفظ بنفس الناس · «شيل» بعد تأكيد", async () => {
    const { container } = await mount();
    fireEvent.click(screen.getAllByRole("button", { name: /تغيير الملف/ })[1]);
    const single = container.querySelector("input[type=file]:not([multiple])") as HTMLInputElement;
    const nf = new File(["c"], "الطايف٢.xlsx");
    await act(async () => { fireEvent.change(single, { target: { files: [nf] } }); });
    await waitFor(() => expect(api.uploadGroupFile).toHaveBeenCalledWith("مكة", nf, { rowCount: 5, plateCount: 4 }, "members", [A, B], F2));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /شيل/ })[0]); });
    expect(api.deleteGroupFile).toHaveBeenCalledWith("مكة", F1);
  });
});

describe("📄 «شهايد النهارده» بيفرز على ملفات المسئول", () => {
  const deps = (teamOn: boolean): CertSourceDeps => ({
    getUploadedFile: async () => null,
    getDataMeta: async (slot) => (slot === `gdf-${F2}` ? { headers: ["رقم اللوحة"], plateCol: "رقم اللوحة" } : null),
    getSampleRows: async () => [],
    teamState: async () => ({ role: teamOn ? "member" : "off", file: null }),
    groupFiles: async () => [
      { slot: `gdf-${F1}`, streamed: false, headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح 1234" }] },
      { slot: `gdf-${F2}`, streamed: true, headers: ["رقم اللوحة"], rows: [] },
    ],
  });
  it("🔴 المطلوب (sorting): الصغير صفوفه والكبير دفعات من سلوته", async () => {
    const out = await collectCertDataSources("sorting", deps(true));
    expect(out).toEqual([
      { kind: "mem", headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح 1234" }], ref: `gdf-${F1}` },
      { kind: "stream", slot: `gdf-${F2}`, headers: ["رقم اللوحة"], sample: [], plateCol: "رقم اللوحة" },
    ]);
  });
  it("🔴 تبويب «شهايد» (صوت فقط) — حتى لو داتا المجموعة مقفولة", async () => {
    const out = await collectCertDataSources("team", deps(false));
    expect(out.map((s) => (s.kind === "stream" ? s.slot : s.ref))).toEqual([`gdf-${F1}`, `gdf-${F2}`]);
  });
});

describe("🔌 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 «إدارة مجموعتي»: تاب «ملفات الداتا» — و«داتا الأعضاء» زي ما هي", () => {
    const g = read("app/(app)/my-group/page.tsx");
    expect(g).toMatch(/\{tab === "dataFiles" && <GroupDataFilesManager team=\{g\.team\} \/>\}/);
    expect(g).toMatch(/\{tab === "memberData" && <MemberDataManager team=\{g\.team\} \/>\}/);
  });
  it("🔴 الفرز: كل ملف مصدر داتا (مع داتا المجموعة/المخصوصة) + بيكفي للفرز + أعمدة النتيجة", () => {
    const s = read("app/(app)/sorting/page.tsx");
    expect(s).toMatch(/for \(const g of groupFiles\) \{[\s\S]{0,400}srcs\.push\(\{ rows: \[\], plateCol: pc, slot: g\.slot/);
    expect(s).toMatch(/teamDataReady \|\| memberDataReady \|\| groupFilesReady \|\| recordsAsDataReady/);
    expect(s).toMatch(/\} else if \(groupFiles\[0\]\) \{/);
    expect(s).toMatch(/const r = await syncMyGroupFiles\(\)/);
  });
  it("🔴 «صوت فقط»: الفرز واللصق دفعة دفعة", () => {
    const v = read("components/VoiceOnlySort.tsx");
    expect(v.match(/await eachGroupFileChunk\(/g)?.length).toBe(2);
    expect(v).toMatch(/\.\.\.matchChunkAgainstIndex\(\[\.\.\.mine, \.\.\.teamDataRows\], REC_PLATE_COL, index, 88, false\), \.\.\.gfMatches\]/);
    expect(v).toMatch(/matchPastedOnRecords\(tokens, \[\.\.\.mine, \.\.\.teamDataRows, \.\.\.gfRows\]\)/);
  });
  it("🔴 «شهايد النهارده» بياخد الملفات · قلب المجموعة بيشيلها من الموبايل", () => {
    expect(read("components/DailyCertSort.tsx")).toMatch(/groupFiles: async \(\) => \{\n\s*const synced = await withTimeout\(syncMyGroupFiles\(\), 20_000\)/);
    expect(read("lib/activeTeamSwitch.ts")).toMatch(/await clearAllGroupFiles\(\)\.catch/);
  });
});

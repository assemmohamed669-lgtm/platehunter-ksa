import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 📁 اسم ملف الإكسيل من اسم ملف الإحالة — المالك (١١ أكتوبر ٢٠٢٦): «لما يشارك اكسيل ل فرز معين يبقي اسم ملف
 * الاكسيل مثلا لو المحفظه اسمها الراجحي ... كلي راجحي ... جديد راجحي ... لصق نصي راجخي ... علي حسب اسم اسم ملف
 * الاحاله». أسماء وهمية.
 */
const native = { on: false };
const written: string[] = [];
const shareCalls: { url?: string }[] = [];
const shareImpl = { fail: (_url: string) => false };
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    writeFile: vi.fn(async ({ path: p }: { path: string }) => { written.push(p); return { uri: `file:///cache/${p}` }; }),
    appendFile: vi.fn(async () => {}),
    getUri: vi.fn(async ({ path: p }: { path: string }) => ({ uri: `file:///cache/${p}` })),
    deleteFile: vi.fn(async () => {}),
    stat: vi.fn(async () => ({ size: 1 })),
  },
}));
vi.mock("@capacitor/share", () => ({
  Share: {
    share: vi.fn(async (o: { url?: string }) => {
      shareCalls.push(o);
      if (shareImpl.fail(o.url ?? "")) throw new Error("FileProvider failed");
      return {};
    }),
  },
}));

import { referralLabel, referralShareName } from "@/lib/shareNames";
import { shareExcelBlob } from "@/lib/excel";

const ON = "2026-10-11T10:00:00";

describe("🔴 الاسم = نوع الفرز + اسم ملف الإحالة", () => {
  it("🔴 كلي / جديد / لصق نصي + اسم الإحالة من غير الامتداد", () => {
    const ref = referralLabel(["الراجحي.xlsx"]);
    expect(referralShareName("full", ref, ON)).toBe("كلي الراجحي 11-10-2026");
    expect(referralShareName("new", ref, ON)).toBe("جديد الراجحي 11-10-2026");
    expect(referralShareName("paste", ref, ON)).toBe("لصق نصي الراجحي 11-10-2026");
    expect(referralShareName("full", referralLabel(["تأجير المؤتمن.xlsx"]), ON)).toBe("كلي تأجير المؤتمن 11-10-2026");
  });
  it("زرار «الداتا والسجلات» زي الداتا، وزرار السجلات مكتوب عليه «سجلات»", () => {
    const ref = referralLabel(["الراجحي.xlsx"]);
    expect(referralShareName("fullAll", ref, ON)).toBe("كلي الراجحي 11-10-2026");
    expect(referralShareName("newAll", ref, ON)).toBe("جديد الراجحي 11-10-2026");
    expect(referralShareName("pasteAll", ref, ON)).toBe("لصق نصي الراجحي 11-10-2026");
    expect(referralShareName("fullRecords", ref, ON)).toBe("كلي سجلات الراجحي 11-10-2026");
    expect(referralShareName("newRecords", ref, ON)).toBe("جديد سجلات الراجحي 11-10-2026");
    expect(referralShareName("pasteRecords", ref, ON)).toBe("لصق نصي سجلات الراجحي 11-10-2026");
  });
  it("كذا ملف إحالة ⇒ الأسماء كلها، ومن غير تكرار ولا خانات فاضية", () => {
    expect(referralLabel(["الراجحي.xlsx", null, "تأجير المؤتمن.xlsb", "الراجحي.xlsx"])).toBe("الراجحي + تأجير المؤتمن");
  });
  it("مافيش ملف إحالة ⇒ مافيش اسم (الزرار بيرجع للاسم القديم)", () => {
    expect(referralLabel([null, undefined, ""])).toBe("");
    expect(referralShareName("full", "", ON)).toBeNull();
  });
  it("حروف ممنوعة في أسماء الملفات بتتشال", () => {
    expect(referralLabel(['بنك: "س/ص".xlsx'])).toBe("بنك- -س-ص-");
  });
});

describe("🔴 على الموبايل الاسم العربي بيوصل — ولو المشاركة فشلت بيرجع للاسم القديم", () => {
  beforeEach(() => { native.on = true; written.length = 0; shareCalls.length = 0; shareImpl.fail = () => false; });
  const blob = () => new Blob(["x"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  it("🔴 keepName ⇒ الملف بيتكتب بالاسم العربي", async () => {
    await shareExcelBlob(blob(), "كلي الراجحي 11-10-2026.xlsx", "نتائج الفرز", { keepName: true, fallbackName: "فرز كلي full-sort 11-10-2026.xlsx" });
    expect(written.at(-1)).toBe("كلي الراجحي 11-10-2026.xlsx");
    expect(shareCalls).toHaveLength(1);
  });
  it("🔴 المشاركة بالاسم العربي فشلت ⇒ تاني مرة بالاسم القديم الآمن (المندوب مايتوقفش)", async () => {
    shareImpl.fail = (url) => url.includes("الراجحي");
    await shareExcelBlob(blob(), "كلي الراجحي 11-10-2026.xlsx", "نتائج الفرز", { keepName: true, fallbackName: "فرز كلي full-sort 11-10-2026.xlsx" });
    expect(shareCalls).toHaveLength(2);
    expect(written.at(-1)).toBe("full-sort-11-10-2026.xlsx");
  });
  it("من غير keepName ⇒ زي الأول بالحرف (العربي بيتشال)", async () => {
    await shareExcelBlob(blob(), "فرز كلي full-sort 11-10-2026.xlsx", "نتائج الفرز");
    expect(written.at(-1)).toBe("full-sort-11-10-2026.xlsx");
  });
});

describe("🔴 التوصيل في صفحة الفرز — السوبر أدمن الأول", () => {
  const btn = readFileSync(path.resolve(__dirname, "../components/ShareSortButton.tsx"), "utf8").replace(/\r\n/g, "\n");
  const page = readFileSync(path.resolve(__dirname, "../app/(app)/sorting/page.tsx"), "utf8").replace(/\r\n/g, "\n");
  it("🔴 زرار المشاركة بياخد اسم الإكسيل ويبعته بالاسم العربي على الموبايل", () => {
    expect(btn).toMatch(/excelName\?: string/);
    expect(btn).toMatch(/shareExcelBlob\(res\.blob, `\$\{excelBase\}\.\$\{res\.ext\}`, title, \{ keepName: true, fallbackName: `\$\{fileBase\}\.\$\{res\.ext\}` \}\)/);
  });
  it("🔴 الأزرار الستة بياخدوا اسم الإحالة — للكل (المالك «انشر للكل» ١١ أكتوبر)", () => {
    expect((page.match(/excelName=\{referralShareName\([^\n]*\) \?\? undefined\}/g) ?? []).length).toBe(6);
    expect(page).toMatch(/const refLabel = referralLabel\(\[referralFile\?\.name, \.\.\.extraReferrals\.map\(\(e\) => e\.file\?\.name\)\]\)/);
    expect(page).not.toMatch(/isSuper/);
  });
});

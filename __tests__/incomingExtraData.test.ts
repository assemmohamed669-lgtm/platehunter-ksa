import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  incomingExcelOptions, firstFreeSlotNum, saveIncomingExtraData, EXTRA_DATA_STREAM_BYTES,
  EXTRA_DATA_FROM_SHARE_FOR_ALL, type ExtraDataDeps,
} from "@/lib/incomingExcel";
import type { UploadedFileRecord } from "@/lib/idb";

/**
 * المالك (٥ أكتوبر ٢٠٢٦): «لما مندوب يرفع داتا عن طريق واتس اب … بيجيبلو خيارات افتح الملف في
 * ويختار ملف الداتا بس لما يحب يرفع داتا اضافيه مفيش خيار ملف داتا اضافيه عايزك تزود في الخيارات
 * زر ملف داتا اضافي لما المندوب يدوس عليها يتحط الملف في مربع داتا اضافي تحت مربع الداتا الاساسي».
 */
describe("🔴 خيار «ملف داتا إضافي»", () => {
  it("🔴 بيظهر تحت «ملف الداتا» على طول لو فيه داتا أساسية — وبيروح لأول مربع إضافي فاضي", () => {
    const opts = incomingExcelOptions({ voiceOnly: false, nextReferralNum: null, nextDataNum: 2 });
    expect(opts.map((o) => o.slot)).toEqual(["data", "data-2", "referral", "check"]);
    const extra = opts.find((o) => o.slot === "data-2")!;
    expect(extra.label).toBe("ملف داتا إضافي");
    expect(extra.hint).toContain("ملف الداتا 2");
  });
  it("مع إحالة إضافية كمان", () => {
    const opts = incomingExcelOptions({ voiceOnly: false, nextReferralNum: 2, nextDataNum: 3 });
    expect(opts.map((o) => o.slot)).toEqual(["data", "data-3", "referral", "referral-2", "check"]);
    expect(opts.find((o) => o.slot === "data-3")!.hint).toContain("ملف الداتا 3");
  });
  it("مفيش داتا أساسية ⇒ مفيش خيار إضافي (زي الإحالة) · صوت-فقط ⇒ مفيش داتا خالص", () => {
    expect(incomingExcelOptions({ voiceOnly: false, nextReferralNum: null, nextDataNum: null }).map((o) => o.slot))
      .toEqual(["data", "referral", "check"]);
    expect(incomingExcelOptions({ voiceOnly: true, nextReferralNum: null, nextDataNum: 2 }).map((o) => o.slot))
      .toEqual(["check", "voice-referral"]);
  });
  it("🔴 السوبر أدمن الأول (لحد ما المالك يجرّب ويقول «انشر للكل»)", () => {
    expect(EXTRA_DATA_FROM_SHARE_FOR_ALL).toBe(false);
  });
});

describe("أول مربع إضافي فاضي", () => {
  it("بيبدأ من ٢ ويقف عند أول فاضي", async () => {
    const taken = new Set([2, 3]);
    expect(await firstFreeSlotNum(async (n) => taken.has(n))).toBe(4);
    expect(await firstFreeSlotNum(async () => false)).toBe(2);
  });
});

/** ملف بحجم معيّن من غير ما نحجز الذاكرة فعلاً. */
function fakeFile(name: string, size: number): File {
  const f = new File(["x"], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function deps(over: Partial<ExtraDataDeps> = {}) {
  const saved: UploadedFileRecord[] = [];
  const d: ExtraDataDeps = {
    readSheetNames: vi.fn(async () => ["ورقة1"]),
    importMultiSheetData: vi.fn(async () => ({ headers: ["رقم اللوحة"], rowCount: 900, plateCol: "رقم اللوحة" }) as never),
    importLargeDataFile: vi.fn(async () => ({ headers: ["رقم اللوحة"], rowCount: 50_000, plateCol: "رقم اللوحة" }) as never),
    getSampleRows: vi.fn(async () => [{ "رقم اللوحة": "ابح1234" }]),
    parseExcelFile: vi.fn(async () => ({ headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح1234" }] })),
    saveUploadedFile: vi.fn(async (r: UploadedFileRecord) => { saved.push(r); }),
    nextStreamSlot: () => "xdata-7",
    ...over,
  };
  return { d, saved };
}

describe("🔴 الملف بيتحفظ في مربع الداتا الإضافي — بنفس طريقة صفحة الفرز", () => {
  const now = new Date("2026-10-05T09:00:00Z");

  it("🔴 ملف صغير بورقة واحدة ⇒ صفوفه + الملف نفسه في data-N", async () => {
    const { d, saved } = deps();
    const blob = new Blob(["x"]);
    await saveIncomingExtraData("data-2", fakeFile("داتا.xlsx", 1000), blob, undefined, d, now);
    expect(saved).toEqual([{
      key: "local:data-2", agentId: "local", slot: "data-2", fileName: "داتا.xlsx",
      headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح1234" }], uploadedAt: now.toISOString(), fileBlob: blob,
    }]);
    expect(d.importLargeDataFile).not.toHaveBeenCalled();
  });

  it("🔴 ملف كبير ⇒ بيتقرا على دفعات في مكان خاص بيه، والمربع فيه مؤشّر + عيّنة (مايتحملش في الذاكرة)", async () => {
    const { d, saved } = deps();
    await saveIncomingExtraData("data-3", fakeFile("كبير.xlsx", EXTRA_DATA_STREAM_BYTES + 1), new Blob(), undefined, d, now);
    expect(d.importLargeDataFile).toHaveBeenCalledWith(expect.anything(), { slot: "xdata-7" });
    expect(saved).toEqual([{
      key: "local:data-3", agentId: "local", slot: "data-3", fileName: "كبير.xlsx",
      headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح1234" }], uploadedAt: now.toISOString(),
      streamed: true, streamSlot: "xdata-7",
    }]);
  });

  it("🔴 ملف فيه أكتر من ورقة ⇒ كل الورقات على دفعات (زي مربع الصفحة)", async () => {
    const { d, saved } = deps({ readSheetNames: vi.fn(async () => ["أ", "ب"]) });
    await saveIncomingExtraData("data-2", fakeFile("ورقتين.xlsx", 1000), new Blob(), undefined, d, now);
    expect(d.importMultiSheetData).toHaveBeenCalledWith(expect.anything(), { slot: "xdata-7" });
    expect(saved[0]).toMatchObject({ slot: "data-2", streamed: true, streamSlot: "xdata-7" });
  });

  it("ملف كبير مااتقراش على دفعات (محمي مثلاً) ⇒ القارئ العادي — اللي بيطلب كلمة المرور", async () => {
    const pwdErr = new Error("الملف محمياً بكلمة مرور");
    const { d } = deps({
      importLargeDataFile: vi.fn(async () => { throw new Error("not xlsx"); }),
      parseExcelFile: vi.fn(async () => { throw pwdErr; }),
    });
    await expect(saveIncomingExtraData("data-2", fakeFile("محمي.xlsx", EXTRA_DATA_STREAM_BYTES + 1), new Blob(), undefined, d, now))
      .rejects.toBe(pwdErr);
    // ومع كلمة المرور ⇒ القارئ العادي على طول
    const ok = deps();
    await saveIncomingExtraData("data-2", fakeFile("محمي.xlsx", EXTRA_DATA_STREAM_BYTES + 1), new Blob(), "1234", ok.d, now);
    expect(ok.d.parseExcelFile).toHaveBeenCalledWith(expect.anything(), "1234");
    expect(ok.d.importLargeDataFile).not.toHaveBeenCalled();
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  it("🔴 نافذة «افتح الملف في»: الخيار للسوبر أدمن الأول · بيحفظ في data-N · بيبلّغ صفحة الفرز · بيروح لها", () => {
    const h = read("components/IncomingExcelHandler.tsx");
    expect(h).toMatch(/EXTRA_DATA_FROM_SHARE_FOR_ALL \|\| isSuper/);
    expect(h).toMatch(/firstFreeSlotNum\(/);
    expect(h).toMatch(/saveIncomingExtraData\(/);
    expect(h).toMatch(/slot\.startsWith\("data-"\)/);
    expect(h).toMatch(/idbFileUpdated/);
  });
  it("صفحة الفرز ونافذة الملف بيستخدموا نفس عدّاد أماكن الملفات الكبيرة", () => {
    const page = read("app/(app)/sorting/page.tsx");
    expect(page).toMatch(/import \{ nextStreamSlot \} from "@\/lib\/extraDataSlot"/);
    expect(page).not.toMatch(/function nextStreamSlot\(/);
    expect(read("components/IncomingExcelHandler.tsx")).toMatch(/nextStreamSlot/);
  });
});

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ChassisTable, RawSheet } from "@/lib/chassisLoad";

/**
 * 🧯 **ملف التشييك اللي وقّع الموبايل وهو بيتقري مايتقريش تاني على نفس الموبايل.**
 *
 * المالك (٣ أكتوبر ٢٠٢٦): مندوب بآيفون ١١ «لما بيفتح البرنامج يجيبلو جاري التحقق وياخر
 * شوي وبعدين يفتح وبعدين يجيلو جاري التحقق… لحد ما الصفحة تعمل فريز وتهنج». صفحة
 * «الجديد» بتحلّل ملف التشييك كله عشان أرقام الهيكل (٨–١٦ ثانية و١٢٠–٢٥٠ ميجا على
 * ملف ٦٠ ألف صف) ⇒ الآيفون بيقفل الصفحة ⇒ بتتفتح تاني وتحلّل تاني… لفّة.
 *
 * قبل قراية الملف بتتكتب علامة على الجهاز وبتتشال لما القراية تخلص. العلامة لسه
 * موجودة لنفس الملف في الفتحة الجاية ⇒ القراية ماخلصتش (الموبايل قفل في النص) ⇒
 * الخريطة من الورقات المحمّلة بس وبتتحفظ — من غير ما نلمس الملف تاني.
 */

const MAIN: ChassisTable = {
  headers: ["رقم اللوحة", "رقم الهيكل"],
  rows: [{ "رقم اللوحة": "ابح1234", "رقم الهيكل": "JTDKBAA0000000001" }],
};
// ورقة تانية جوّه الملف فيها هيكل لوحة تانية — بتتقري من الـblob بس
const OTHER_SHEET: RawSheet[] = [
  { name: "تانية", aoa: [["رقم اللوحة", "رقم الهيكل"], ["دهو5678", "LFP82APE2N1D03256"]] },
];

/** جلسة جديدة (التطبيق اتقفل واتفتح): الذاكرة بتتمسح، والجهاز (IndexedDB + التخزين) لأ. */
async function freshSession() {
  vi.resetModules();
  return import("@/lib/chassisLoad");
}

const blob = new Blob(["check-file-bytes"]);
const opts = (fp: string, readSheets: (f: File) => Promise<RawSheet[]>) => ({
  fingerprint: fp, sources: [MAIN], blob, fileName: "check.xlsx", fileStamp: "stamp-" + fp, readSheets,
});

beforeEach(async () => {
  localStorage.clear();
  const cache = await import("@/lib/chassisCache");
  cache.clearChassisCache();
  await cache.clearPersistedChassis();
});

describe("🧯 قراية ملف وقّعت الموبايل", () => {
  it("🔴 الموبايل وقع وهو بيقرا الملف ⇒ الفتحة الجاية مابتقراهوش (الورقة المحمّلة بس) وبتحفظها", async () => {
    // ① القراية بدأت ومارجعتش أبداً — الموبايل قفل الصفحة في النص
    const s1 = await freshSession();
    const hang = vi.fn(() => new Promise<RawSheet[]>(() => {}));
    void s1.loadChassisMap(opts("f1", hang));
    await vi.waitFor(() => expect(hang).toHaveBeenCalled());

    // ② الفتحة الجاية — نفس الملف: مابيتقريش
    const s2 = await freshSession();
    const read2 = vi.fn(async () => OTHER_SHEET);
    const m2 = await s2.loadChassisMap(opts("f1", read2));
    expect(read2).not.toHaveBeenCalled();
    expect([...m2.entries()]).toEqual([["ابح1234", "JTDKBAA0000000001"]]);

    // ③ اللي بعدها — محفوظة على الجهاز: ولا قراية
    const s3 = await freshSession();
    const read3 = vi.fn(async () => OTHER_SHEET);
    expect([...(await s3.loadChassisMap(opts("f1", read3))).keys()]).toEqual(["ابح1234"]);
    expect(read3).not.toHaveBeenCalled();
  });

  it("القراية خلصت عادي ⇒ مفيش علامة، وكل الورقات بتدخل (زي الأول بالظبط)", async () => {
    const s1 = await freshSession();
    const read = vi.fn(async () => OTHER_SHEET);
    const m = await s1.loadChassisMap(opts("f2", read));
    expect(read).toHaveBeenCalledTimes(1);
    expect([...m.keys()]).toEqual(["ابح1234", "دهو5678"]);
    expect(localStorage.getItem("ph:chassisReadInFlight")).toBeNull();
  });

  it("وقعة ملف قديم مابتمنعش قراية ملف تاني", async () => {
    const s1 = await freshSession();
    void s1.loadChassisMap(opts("old", () => new Promise<RawSheet[]>(() => {})));
    await vi.waitFor(() => expect(localStorage.getItem("ph:chassisReadInFlight")).not.toBeNull());

    const s2 = await freshSession();
    const read = vi.fn(async () => OTHER_SHEET);
    const m = await s2.loadChassisMap(opts("new", read));
    expect(read).toHaveBeenCalledTimes(1);
    expect([...m.keys()]).toEqual(["ابح1234", "دهو5678"]);
  });

  it("الملف مش مقروء (رمية) ⇒ العلامة بتتشال ومابيتحفظش (يتجرّب تاني زي الأول)", async () => {
    const s1 = await freshSession();
    await s1.loadChassisMap(opts("f3", async () => { throw new Error("bad zip"); }));
    expect(localStorage.getItem("ph:chassisReadInFlight")).toBeNull();
    const s2 = await freshSession();
    const read = vi.fn(async () => OTHER_SHEET);
    await s2.loadChassisMap(opts("f3", read));
    expect(read).toHaveBeenCalledTimes(1);
  });
});

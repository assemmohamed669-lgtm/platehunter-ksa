import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  saveRecording, saveUploadedFile, saveFieldCheckEntry, deleteFieldCheckEntries,
  getAllRecordings, getAllRecordingsLite, getUploadedFile,
  getAllFieldCheckEntries, getFieldCheckDeletes,
  __breakDbConnectionForTest,
  type FieldCheckEntry, type RecordingEntry, type UploadedFileRecord,
} from "@/lib/idb";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🍏 «صفحة السجلات بتعلّق على جاري التحميل ومابتفتحش»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٩ سبتمبر ٢٠٢٦): مندوب **آيفون** بيفتح «لوحات السجلات» فتفضل
 *  واقفة على «جاري التحميل...» للأبد. ومناديب عندهم سجلات **أكتر** بيفتحوا
 *  عادي — يعني العدد مش السبب، الجهاز هو السبب.
 *
 *  ده نفس عطل ٢٤ سبتمبر (#306) بالظبط: الآيفون بيقتل اتصال IndexedDB بعد ما
 *  التطبيق يقعد في الخلفية، والبرنامج ماسك في الاتصال الميت. وقتها صلّحنا
 *  **الكتابة** بس (`saveFieldCheckEntry`) وسيبنا **القراءة** زي ما هي.
 *
 *  والقراءة هي اللي الصفحة دي بتعتمد عليها.
 *
 *  فيه عطلين مختلفين في نفس السطر:
 *    ١) الاتصال ميت ⇒ العملية بتفشل بدل ما تفتح اتصال جديد وتكمّل.
 *    ٢) المعاملة بتتلغي في النص (`abort`) ⇒ مافيش `onabort` فالوعد **عمره**
 *       ما بيتقفل. مش خطأ — **وقفة أبدية**. وده اللي بيطلّع «جاري التحميل...»
 *       على طول، لأن React مابيبدّلش الشاشة غير لما الوعد يرجع.
 */

const entry = (id: string): FieldCheckEntry => ({
  id, plate: "ابح1234", row: { "رقم اللوحة": "ابح1234" },
  method: "متشيكة بالصوت", checkedAt: new Date(0).toISOString(),
});

const rec = (localId: string, agentId: string): RecordingEntry => ({
  localId, agentId, plate: "ابح1234",
  recordedAt: new Date(0).toISOString(), synced: false,
});

const file = (key: string, agentId: string): UploadedFileRecord => ({
  key, agentId, slot: "check", name: "تشييك.xlsx",
  headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح1234" }],
  size: 1, savedAt: new Date(0).toISOString(),
});

/** بيفشّل الاختبار لو العملية علّقت بدل ما ترجع — الوقفة مش بتطلّع خطأ لوحدها. */
function withinTimeout<T>(p: Promise<T>, ms = 3000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("علّقت — الوعد عمره ما رجع")), ms)),
  ]);
}

describe("🍏 القراءة بعد موت اتصال التخزين", () => {
  it("🔴 «لوحات السجلات» — getAllFieldCheckEntries بترجع بدل ما تفشل", async () => {
    await saveFieldCheckEntry(entry("read-1"));
    __breakDbConnectionForTest();
    const rows = await withinTimeout(getAllFieldCheckEntries());
    expect(rows.map((e) => e.id)).toContain("read-1");
  });

  it("🔴 «التسجيلات الصوتية» — getAllRecordings بترجع", async () => {
    await saveRecording(rec("rec-1", "agent-a"));
    __breakDbConnectionForTest();
    const rows = await withinTimeout(getAllRecordings("agent-a"));
    expect(rows.map((r) => r.localId)).toContain("rec-1");
  });

  it("🔴 صفحة الخرائط — getAllRecordingsLite بترجع", async () => {
    await saveRecording(rec("lite-1", "agent-b"));
    __breakDbConnectionForTest();
    const rows = await withinTimeout(getAllRecordingsLite("agent-b"));
    expect(rows.map((r) => r.localId)).toContain("lite-1");
  });

  it("🔴 ملف التشييك المرفوع — getUploadedFile بترجع", async () => {
    await saveUploadedFile(file("agent-c:check", "agent-c"));
    __breakDbConnectionForTest();
    const got = await withinTimeout(getUploadedFile("agent-c", "check"));
    expect(got?.key).toBe("agent-c:check");
  });

  it("🔴 شواهد المسح — getFieldCheckDeletes بترجع", async () => {
    await saveFieldCheckEntry(entry("del-1"));
    await deleteFieldCheckEntries(["del-1"]);
    __breakDbConnectionForTest();
    const rows = await withinTimeout(getFieldCheckDeletes());
    expect(rows.map((d) => d.id)).toContain("del-1");
  });

  it("🔴 الكتابة كمان — saveRecording بتنجح بعد موت الاتصال", async () => {
    await saveRecording(rec("w-0", "agent-d"));
    __breakDbConnectionForTest();
    await expect(withinTimeout(saveRecording(rec("w-1", "agent-d")))).resolves.toBeUndefined();
  });
});

describe("🔴 مافيش معاملة من غير حارس إلغاء (ده اللي بيعلّق للأبد)", () => {
  it("كل `db.transaction` في lib/idb.ts معاها onabort", () => {
    const src = readFileSync(join(process.cwd(), "lib/idb.ts"), "utf8");
    // كل دالة بتبدأ بـ`function` على أول العمود — بنقسّم عليها ونفحص كل بلوك لوحده.
    const blocks = src.split(/\n(?=(?:export )?(?:async )?function )/);
    const guilty = blocks
      .filter((b) => b.includes("db.transaction(") && !b.includes("onabort"))
      .map((b) => (b.match(/function (\w+)/) ?? [])[1] ?? "?");
    expect(guilty).toEqual([]);
  });
});

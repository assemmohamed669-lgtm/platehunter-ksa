import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  saveFieldCheckEntry, saveFieldCheckEntries, getAllFieldCheckEntries,
  __breakDbConnectionForTest, type FieldCheckEntry,
} from "@/lib/idb";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 «مانفعش يتحفظ ولا سجل» — اتصال التخزين مات والبرنامج ماسك فيه
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٤ سبتمبر ٢٠٢٦): «فيه مندوب بيحاول يصدّر اللوحات في صفحة الجديد
 *  بيجيبله الرسالة دي» — على **آيفون**، و٢٩ لوحة كلها فشلت.
 *
 *  `lib/idb.ts` بيفتح الاتصال **مرة واحدة** وبيمسك فيه للأبد. الآيفون معروف
 *  إنه بيقتل اتصال IndexedDB بعد ما التطبيق يروح للخلفية شوية («Connection
 *  to Indexed Database server lost») — والاتصال الميت بيفضل متخزّن، فـ**كل**
 *  حفظ بعده بيفشل لحد ما البرنامج يتقفل ويتفتح.
 *
 *  (المسودّة سليمة: `checkDrafts` بيفتح اتصال جديد مع كل حفظ — فاللوحات
 *  نفسها ماضاعتش، اللي فشل هو التصدير للسجلات.)
 */
const entry = (id: string): FieldCheckEntry => ({
  id, plate: "ابح1234", row: { "رقم اللوحة": "ابح1234" },
  method: "متشيكة بالصوت", checkedAt: new Date(0).toISOString(),
});

describe("اتصال التخزين الميت — الحفظ بيفتح اتصال جديد", () => {
  it("🔴 الاتصال مات بعد أول حفظ ⇒ الحفظ التاني لسه بينجح", async () => {
    await saveFieldCheckEntry(entry("dead-1"));
    __breakDbConnectionForTest();
    await expect(saveFieldCheckEntry(entry("dead-2"))).resolves.toBeUndefined();
    const ids = (await getAllFieldCheckEntries()).map((e) => e.id);
    expect(ids).toContain("dead-1");
    expect(ids).toContain("dead-2");
  });

  it("🔴 الدفعة كمان (التصدير الكبير) بتنجح بعد موت الاتصال", async () => {
    await saveFieldCheckEntry(entry("batch-0"));
    __breakDbConnectionForTest();
    await expect(saveFieldCheckEntries([entry("batch-1"), entry("batch-2")])).resolves.toBeUndefined();
    const ids = (await getAllFieldCheckEntries()).map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(["batch-1", "batch-2"]));
  });

  it("٢٩ لوحة مع بعض بعد موت الاتصال ⇒ كلهم بيتحفظوا (زي بلاغ المندوب)", async () => {
    await saveFieldCheckEntry(entry("many-0"));
    __breakDbConnectionForTest();
    const batch = Array.from({ length: 29 }, (_, i) => entry("many-" + (i + 1)));
    const settled = await Promise.allSettled(batch.map((e) => saveFieldCheckEntry(e)));
    expect(settled.filter((s) => s.status === "rejected")).toHaveLength(0);
  });
});

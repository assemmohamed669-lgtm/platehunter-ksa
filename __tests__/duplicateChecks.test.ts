import { describe, it, expect } from "vitest";
import { collapseDuplicateChecks, duplicateCheckIds } from "@/lib/fieldCheck";
import type { FieldCheckEntry } from "@/lib/idb";

/**
 * لوحة واحدة طلعت **٨ مرات** في ٧٦ ثانية — بنفس الـGPS بالظبط وفواصل توصل نص
 * ثانية. مستحيل المندوب قالها ٨ مرات وهو واقف مكانه.
 *
 * محاولة أولى (#220) جمّعت **بالدقيقة** — وده فشل على الحالة دي بالذات: ٧٦
 * ثانية بتعدّي حدود الدقيقة، فالـ٨ بقوا ٢-٣ بدل واحد.
 *
 * القاعدة الصح: **نفس اللوحة + نفس الموقع + في نفس الفترة** = تشييك واحد.
 * والمعيار الحاكم اللي المالك حدّده: «شيّكها مرة تظهر مرة، شيّكها مرتين تظهر
 * مرتين» — فالتشييك الحقيقي التاني (وقت تاني أو مكان تاني) لازم **يفضل**.
 */
const e = (id: string, plate: string, checkedAt: string, link?: string): FieldCheckEntry =>
  ({ id, plate, row: {}, method: "صوت", checkedAt, ...(link ? { mapsLink: link } : {}) });

const PIN = "https://maps.google.com/?q=24.7,46.6";
const PIN2 = "https://maps.google.com/?q=24.9,46.9";

describe("collapseDuplicateChecks", () => {
  it("٨ إرسالات في ٧٦ ثانية بنفس الموقع = صف واحد (الحالة الحقيقية)", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      e(`${i}`, "رري3706", new Date(Date.UTC(2026, 8, 10, 8, 15, 20 + i * 11)).toISOString(), PIN));
    const out = collapseDuplicateChecks(rows);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("0");
  });

  it("بيعدّي حدود الدقيقة — ده اللي كسر محاولة #220", () => {
    const out = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:59.000Z", PIN),
      e("2", "رري3706", "2026-09-10T08:16:01.000Z", PIN),
    ]);
    expect(out).toHaveLength(1);
  });

  it("🔴 شيّكها تاني بعد فترة = تشييك حقيقي ⇒ صفين", () => {
    const out = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:00.000Z", PIN),
      e("2", "رري3706", "2026-09-10T09:30:00.000Z", PIN),
    ]);
    expect(out).toHaveLength(2);
  });

  it("🔴 نفس اللوحة في مكان تاني = تشييك حقيقي ⇒ صفين", () => {
    const out = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:00.000Z", PIN),
      e("2", "رري3706", "2026-09-10T08:15:30.000Z", PIN2),
    ]);
    expect(out).toHaveLength(2);
  });

  it("لوحتين مختلفتين في نفس المكان والوقت مايتجمّعوش", () => {
    const out = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:00.000Z", PIN),
      e("2", "اسر2244", "2026-09-10T08:15:02.000Z", PIN),
    ]);
    expect(out).toHaveLength(2);
  });

  it("من غير موقع: بيرجع لقاعدة الدقيقة بدل ما يجمّع تشييكات بعيدة", () => {
    const same = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:15:40.000Z"),
    ]);
    expect(same).toHaveLength(1);
    const apart = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:03.000Z"),
      e("2", "رري3706", "2026-09-10T08:20:00.000Z"),
    ]);
    expect(apart).toHaveLength(2);
  });

  it("بيحافظ على الترتيب وبياخد البيانات الأكمل", () => {
    const out = collapseDuplicateChecks([
      e("1", "رري3706", "2026-09-10T08:15:00.000Z", PIN),
      { ...e("2", "رري3706", "2026-09-10T08:15:20.000Z", PIN), lat: 24.7, lng: 46.6 },
      e("3", "اسر2244", "2026-09-10T08:16:00.000Z", PIN),
    ]);
    expect(out.map((x) => x.id)).toEqual(["1", "3"]);
    expect(out[0].lat).toBe(24.7);
  });

  it("المسح بيشيل المجموعة كلها — مايرجعش أخوه مكانه", () => {
    const rows = [
      e("1", "رري3706", "2026-09-10T08:15:00.000Z", PIN),
      e("2", "رري3706", "2026-09-10T08:15:30.000Z", PIN),
      e("3", "رري3706", "2026-09-10T08:16:10.000Z", PIN),
    ];
    expect(duplicateCheckIds(rows).get("1")).toEqual(["1", "2", "3"]);
  });
});

/** سجلات المجموعة جاية من السيرفر بشكل تاني — نفس القاعدة بالظبط. */
describe("dedupeDuplicateRows", () => {
  const r = (id: string, plate: string, at: string, owner: string, location: string | null) =>
    ({ id, plate, at, owner, location });
  const get = (x: ReturnType<typeof r>) => ({ plate: x.plate, at: x.at, owner: x.owner, location: x.location });

  it("بيجمّع تكرار نفس المندوب في نفس المكان", async () => {
    const { dedupeDuplicateRows } = await import("@/lib/fieldCheck");
    const out = dedupeDuplicateRows([
      r("1", "رري3706", "2026-09-10T08:15:00Z", "a", PIN),
      r("2", "رري3706", "2026-09-10T08:16:10Z", "a", PIN),
    ], get);
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });

  it("🔴 مندوبين مختلفين شيّكوا نفس اللوحة = صفين", async () => {
    const { dedupeDuplicateRows } = await import("@/lib/fieldCheck");
    const out = dedupeDuplicateRows([
      r("1", "رري3706", "2026-09-10T08:15:00Z", "a", PIN),
      r("2", "رري3706", "2026-09-10T08:15:30Z", "b", PIN),
    ], get);
    expect(out).toHaveLength(2);
  });
});

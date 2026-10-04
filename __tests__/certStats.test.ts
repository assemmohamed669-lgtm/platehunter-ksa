import { describe, it, expect, vi } from "vitest";
import { isCertName, riyadhDay, buildCertStats, resolveTopFolders, NO_FOLDER } from "@/lib/certStats";

/**
 * 📊 **إحصائيات الشهايد** — المالك (٤ أكتوبر ٢٠٢٦): «عايز اجمالي الشهادات ل كل الشركات
 * وعايز كل شركه رافعه كم شهادة وعايز كم شهادة اترفعت يوميا».
 *  · الشهادة = PDF اسمه لوحة (زي ما الشهايد متسمّية) — PDF تاني بيتعدّ لوحده ومايدخلش.
 *  · الشركة = الفولدر اللي الشركة مشاركاه مع حساب درايف (أعلى فولدر نقدر نوصله).
 *  · اليوم بتوقيت السعودية (نص الليل لنص الليل).
 */

describe("الشهادة = PDF اسمه لوحة", () => {
  it("أسماء الشهايد بأي شكل", () => {
    for (const n of ["س د ط 2539.pdf", "سدط2539.PDF", "DLY 2104.pdf", "2539 س د ط.pdf", "أ ب ح 12.pdf"]) {
      expect(isCertName(n), n).toBe(true);
    }
  });
  it("PDF مش باسم لوحة", () => {
    for (const n of ["فاتورة.pdf", "report 2026-10-03.pdf", "12345678.pdf", "scan.pdf"]) {
      expect(isCertName(n), n).toBe(false);
    }
  });
});

describe("اليوم بتوقيت السعودية", () => {
  it("بعد ٩ بالليل بتوقيت جرينتش = اليوم اللي بعده في السعودية", () => {
    expect(riyadhDay("2026-10-03T20:59:59Z")).toBe("2026-10-03");
    expect(riyadhDay("2026-10-03T21:00:00Z")).toBe("2026-10-04");
  });
});

describe("🔴 الإجمالي · كل شركة · كل يوم", () => {
  const now = new Date("2026-10-04T09:00:00Z");   // ١٢ الضهر في السعودية
  const f = (id: string, name: string, createdTime: string, company: string) => ({ id, name, createdTime, parents: [company] });
  const files = [
    f("1", "س د ط 2539.pdf", "2026-10-04T05:00:00Z", "A"),   // النهارده
    f("2", "ا ب ح 1111.pdf", "2026-10-04T06:00:00Z", "B"),   // النهارده
    f("3", "د ه و 2222.pdf", "2026-10-03T10:00:00Z", "A"),   // امبارح
    f("4", "ر س ص 3333.pdf", "2026-09-01T10:00:00Z", "A"),   // أقدم من ٣٠ يوم
    f("5", "فاتورة.pdf", "2026-10-04T07:00:00Z", "A"),       // مش شهادة
  ];
  const companyOf = (file: { parents?: string[] }) => ({ A: "شركة أ", B: "شركة ب" } as Record<string, string>)[file.parents?.[0] ?? ""] ?? NO_FOLDER;
  const s = buildCertStats(files, companyOf, now, 30);

  it("🔴 الإجمالي لكل الشركات = الشهايد بس (من غير الـPDF التاني)", () => {
    expect(s.total).toBe(4);
    expect(s.otherPdfs).toBe(1);
  });

  it("🔴 كل شركة: إجماليها وآخر ٣٠ يوم — الأكتر فوق", () => {
    expect(s.companies).toEqual([
      { name: "شركة أ", total: 3, last30: 2 },
      { name: "شركة ب", total: 1, last30: 1 },
    ]);
  });

  it("🔴 كل يوم (آخر ٣٠ يوم) — الأحدث فوق، والأيام الفاضية صفر، وكل شركة رفعت كام في اليوم", () => {
    expect(s.daily).toHaveLength(30);
    expect(s.daily[0]).toEqual({ day: "2026-10-04", total: 2, byCompany: [{ name: "شركة أ", count: 1 }, { name: "شركة ب", count: 1 }] });
    expect(s.daily[1]).toEqual({ day: "2026-10-03", total: 1, byCompany: [{ name: "شركة أ", count: 1 }] });
    expect(s.daily[2]).toEqual({ day: "2026-10-02", total: 0, byCompany: [] });
    expect(s.daily[29].day).toBe("2026-09-05");
  });

  it("ملف من غير فولدر بيتحسب برضه (تحت «من غير فولدر»)", () => {
    const loose = buildCertStats([{ id: "9", name: "ا ا ا 1234.pdf", createdTime: "2026-10-04T05:00:00Z" }], () => NO_FOLDER, now, 30);
    expect(loose.companies).toEqual([{ name: NO_FOLDER, total: 1, last30: 1 }]);
  });
});

describe("🔴 الشركة = أعلى فولدر نقدر نوصله (الفولدر المشارك)", () => {
  // شركة أ مشاركة «تمويل أ» وجواه فولدرات شهور؛ فولدر الشركة نفسه أبوه مش متاح لينا
  const tree: Record<string, { name: string; parents?: string[] } | null> = {
    m1: { name: "أكتوبر", parents: ["topA"] },
    m2: { name: "سبتمبر", parents: ["topA"] },
    topA: { name: "تمويل أ", parents: ["hiddenRoot"] },
    hiddenRoot: null,                         // درايف الشركة — مش متاح
    topB: { name: "شركة ب" },                 // فولدر مشارك من غير أب
  };

  it("فولدرات الشهور بتتجمع تحت فولدر الشركة، وكل فولدر بيتسأل عنه مرة واحدة", async () => {
    const get = vi.fn(async (id: string) => tree[id] ?? null);
    const m = await resolveTopFolders(["m1", "m2", "topB"], get);
    expect(m.get("m1")).toBe("تمويل أ");
    expect(m.get("m2")).toBe("تمويل أ");
    expect(m.get("topB")).toBe("شركة ب");
    const asked = get.mock.calls.map((c) => c[0]);
    expect(new Set(asked).size).toBe(asked.length);   // مفيش فولدر اتسأل مرتين
  });

  it("فولدر مش متاح خالص ⇒ «من غير فولدر» (مايوقّعش العدّ)", async () => {
    const m = await resolveTopFolders(["gone"], async () => null);
    expect(m.get("gone")).toBe(NO_FOLDER);
  });

  it("سلسلة فيها لفّة (بيانات بايظة) مابتعلّقش", async () => {
    const loop: Record<string, { name: string; parents: string[] }> = { x: { name: "X", parents: ["y"] }, y: { name: "Y", parents: ["x"] } };
    const m = await resolveTopFolders(["x"], async (id) => loop[id] ?? null);
    expect(typeof m.get("x")).toBe("string");
  });
});

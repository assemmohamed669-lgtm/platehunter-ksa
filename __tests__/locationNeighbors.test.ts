import { describe, it, expect } from "vitest";
import { detectLocationColumn, neighborsInSameLocation, neighborsFromStream, findIndexByPlate } from "@/lib/locationNeighbors";

describe("detectLocationColumn", () => {
  it("يفضّل «اسم الموقع»", () => {
    expect(detectLocationColumn(["رقم اللوحة", "اسم الموقع", "الحي", "الشارع"])).toBe("اسم الموقع");
  });
  it("يمسك الشارع/العنوان لو مفيش «اسم الموقع»", () => {
    expect(detectLocationColumn(["رقم اللوحة", "الحي", "الشارع"])).toBe("الشارع");
    expect(detectLocationColumn(["رقم اللوحة", "العنوان"])).toBe("العنوان");
  });
  it("يرجع للحي لو مفيش شارع", () => {
    expect(detectLocationColumn(["رقم اللوحة", "الحي", "اللون"])).toBe("الحي");
    expect(detectLocationColumn(["plate", "district", "color"])).toBe("district");
  });
  it("مايختارش عمود GPS/الموقع كاسم موقع", () => {
    expect(detectLocationColumn(["رقم اللوحة", "GPS", "اللون"])).toBeNull();
    expect(detectLocationColumn(["رقم اللوحة", "الموقع", "اللون"])).toBeNull();
  });
});

describe("neighborsInSameLocation — ١٥ قبل + ١٥ بعد بالموضع", () => {
  // ملف مرتّب بترتيب القيادة — كل ١٠ صفوف شارع. النافذة بقت بالموضع (مش بالشارع).
  const rows = Array.from({ length: 40 }, (_, i) => ({
    "رقم اللوحة": `P${i}`, "الشارع": `شارع ${Math.floor(i / 10)}`,
  }));

  it("١٥ قبل و١٥ بعد في نص الملف (بالموضع، بتعدّي حدود الشارع)", () => {
    const c = neighborsInSameLocation(rows, 20, "الشارع");
    expect(c.before).toHaveLength(15);
    expect(c.after).toHaveLength(15);
    expect(c.before[0]["رقم اللوحة"]).toBe("P5");     // 20 - 15
    expect(c.before[14]["رقم اللوحة"]).toBe("P19");
    expect(c.after[0]["رقم اللوحة"]).toBe("P21");
    expect(c.after[14]["رقم اللوحة"]).toBe("P35");
    expect(c.isFirstInLocation).toBe(false);
    expect(c.isLastInLocation).toBe(false);
    expect(c.locationName).toBe("شارع 2");            // floor(20/10)
    // الجيران بيشملوا شوارع مختلفة (مش محدودة بنفس الشارع)
    const streets = new Set([...c.before, ...c.after].map((r) => r["الشارع"]));
    expect(streets.size).toBeGreaterThan(1);
  });

  it("أول سيارة → مفيش قبلها + العلامة", () => {
    const c = neighborsInSameLocation(rows, 0, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.isFirstInLocation).toBe(true);
    expect(c.after).toHaveLength(15);
    expect(c.after[0]["رقم اللوحة"]).toBe("P1");
  });

  it("آخر سيارة → مفيش بعدها + العلامة", () => {
    const c = neighborsInSameLocation(rows, 39, "الشارع");
    expect(c.after).toEqual([]);
    expect(c.isLastInLocation).toBe(true);
    expect(c.before).toHaveLength(15);
    expect(c.before[14]["رقم اللوحة"]).toBe("P38");
  });

  it("قرب الحافة → بياخد اللي متاح بس", () => {
    const c = neighborsInSameLocation(rows, 3, "الشارع");
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["P0", "P1", "P2"]);
    expect(c.after).toHaveLength(15);
  });

  it("عمود الموقع اختياري (بدونه بيشتغل والعنوان فاضي)", () => {
    const c = neighborsInSameLocation(rows, 20);
    expect(c.before).toHaveLength(15);
    expect(c.after).toHaveLength(15);
    expect(c.locationName).toBe("");
  });

  it("index غير صالح → سياق فاضي", () => {
    const c = neighborsInSameLocation(rows, -1, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.after).toEqual([]);
  });
});

// ── الملف الكبير: الصفوف على الجهاز مش في الذاكرة ──────────────────────────
// 🐞 زرار «موقعها» كان بيفشل دايماً مع ملف داتا كبير: الفرز بيدّي السيارة رقم
// صفها في **الملف الكامل** (ممكن ٣١٢ ألف)، لكن الذاكرة فيها **عيّنة ٥٠ صف بس**
// — فالبحث بيفشل. الحل: نقرا من الجهاز على دفعات بذاكرة نافذة صغيرة (٣١ صف).
describe("neighborsFromStream — الجيران من ملف على الجهاز (١٥+١٥ بالموضع)", () => {
  const LOC = "اسم الموقع";
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ "رقم اللوحة": `أبح ${1000 + i}`, [LOC]: `شارع ${Math.floor(i / 10)}` }));
  /** يقلّد iterateRows: بيسلّم الصفوف على دفعات مع فهرس البداية. */
  const streamOf = (rows: Record<string, string>[], batch = 7) =>
    async (onBatch: (rows: Record<string, string>[], base: number) => void | Promise<void>) => {
      for (let i = 0; i < rows.length; i += batch) await onBatch(rows.slice(i, i + batch), i);
    };

  it("بيطابق نتيجة النسخة اللي في الذاكرة بالظبط", async () => {
    const rows = mk(60);
    for (const idx of [0, 1, 19, 20, 30, 44, 45, 59]) {
      const want = neighborsInSameLocation(rows, idx, LOC);
      const got = await neighborsFromStream(streamOf(rows), idx, LOC);
      expect(got.ctx, `الصف ${idx}`).toEqual(want);
      expect(got.target).toEqual(rows[idx]);
    }
  });

  it("١٥ قبل + ١٥ بعد حتى لو السيارة على حدّ دفعة", async () => {
    const rows = mk(60);
    for (const batch of [1, 2, 3, 7, 60]) {
      const got = await neighborsFromStream(streamOf(rows, batch), 30, LOC);
      expect(got.ctx.before, `دفعة ${batch}`).toHaveLength(15);
      expect(got.ctx.after, `دفعة ${batch}`).toHaveLength(15);
      expect(got.ctx.before[0]).toEqual(rows[15]);
      expect(got.ctx.after[14]).toEqual(rows[45]);
    }
  });

  it("🐞 بيلاقي سيارة في عمق ملف كبير (اللي كان بيفشل)", async () => {
    const rows = mk(100_000);
    const got = await neighborsFromStream(streamOf(rows, 3000), 62_345, LOC);
    expect(got.target).toEqual(rows[62_345]);
    expect(got.ctx.before).toHaveLength(15);
    expect(got.ctx.after).toHaveLength(15);
    expect(got.ctx.before[0]).toEqual(rows[62_330]);
    expect(got.ctx.after[14]).toEqual(rows[62_360]);
  });

  it("مابيحملش الملف كله — ٣١ صف بالكتير مهما كبر", async () => {
    const rows = mk(50_000);
    const got = await neighborsFromStream(streamOf(rows, 1000), 25_000, LOC);
    expect(got.target).toEqual(rows[25_000]);
    // ١٥ قبل + الهدف + ١٥ بعد = ٣١ (مش الملف كله)
    expect(got.ctx.before.length + got.ctx.after.length + 1).toBe(31);
    expect(got.ctx.before[0]).toEqual(rows[24_985]);
    expect(got.ctx.after[14]).toEqual(rows[25_015]);
  });

  it("أول الملف وآخره بيتعلّموا صح", async () => {
    const rows = mk(40);
    const first = await neighborsFromStream(streamOf(rows), 0, LOC);
    expect(first.ctx.isFirstInLocation).toBe(true);
    expect(first.ctx.before).toEqual([]);
    const last = await neighborsFromStream(streamOf(rows), 39, LOC);
    expect(last.ctx.isLastInLocation).toBe(true);
    expect(last.ctx.after).toEqual([]);
  });

  it("فهرس خارج الملف بيرجّع فاضي بدل ما يرمي", async () => {
    const rows = mk(10);
    const got = await neighborsFromStream(streamOf(rows), 999, LOC);
    expect(got.target).toBeNull();
    expect(got.ctx.before).toEqual([]);
    expect(got.ctx.after).toEqual([]);
  });
});

// مربعات الداتا الإضافية الكبيرة: الفرز بيدّي فهرس **عام** عبر كل الملفات، فلو
// حبّينا نحوّله لفهرس محلّي محتاجين نعرف طول كل ملف قبله — وده مش متاح بدقة مع
// فلتر الورقات. فبدل حسابات ممكن تغلط في صمت، بندوّر باللوحة نفسها: أدق وأبسط.
describe("findIndexByPlate — تحديد الصف باللوحة بدل الفهرس", () => {
  const P = "رقم اللوحة";
  const rows = [
    { [P]: "أبح 1111" }, { [P]: "سعد 2222" }, { [P]: "نكد 3333" }, { [P]: "أبح 1111" },
  ];
  const streamOf = (rs: Record<string, string>[], batch = 2) =>
    async (onBatch: (r: Record<string, string>[], b: number) => void | Promise<void>) => {
      for (let i = 0; i < rs.length; i += batch) await onBatch(rs.slice(i, i + batch), i);
    };

  it("بيرجّع فهرس أول صف بلوحة مطابقة", async () => {
    expect(await findIndexByPlate(streamOf(rows), P, "سعد2222")).toBe(1);
    expect(await findIndexByPlate(streamOf(rows), P, "نكد3333")).toBe(2);
  });

  it("بياخد أول ظهور لو اللوحة مكرّرة", async () => {
    expect(await findIndexByPlate(streamOf(rows), P, "ابح1111")).toBe(0);
  });

  it("بيطبّع اللوحة (فراغات/همزة) زي الفرز بالظبط", async () => {
    expect(await findIndexByPlate(streamOf(rows), P, "ابح1111")).toBe(0);   // أ → ا
  });

  it("بيرجّع -1 لو مش موجودة بدل ما يرمي", async () => {
    expect(await findIndexByPlate(streamOf(rows), P, "خخخ9999")).toBe(-1);
  });

  it("بيشتغل عبر حدود الدفعات", async () => {
    for (const b of [1, 2, 3, 4, 10]) {
      expect(await findIndexByPlate(streamOf(rows, b), P, "نكد3333"), `دفعة ${b}`).toBe(2);
    }
  });
});

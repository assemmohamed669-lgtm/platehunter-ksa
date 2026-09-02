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

describe("neighborsInSameLocation", () => {
  // ملف مرتّب: موقع «أ» (٨ سيارات) ثم موقع «ب» (٣ سيارات)
  const rows = [
    { "رقم اللوحة": "A1", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A2", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A3", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A4", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A5", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A6", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A7", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "A8", "الشارع": "شارع النهضة" },
    { "رقم اللوحة": "B1", "الشارع": "شارع الملك" },
    { "رقم اللوحة": "B2", "الشارع": "شارع الملك" },
    { "رقم اللوحة": "B3", "الشارع": "شارع الملك" },
  ];

  it("٥ قبل و٥ بعد في نص الموقع (لو متاح)", () => {
    // A6 (index 5): قبله A1..A5 (٥)، بعده A7,A8 (٢ بس لحد حدود الموقع)
    const c = neighborsInSameLocation(rows, 5, "الشارع");
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["A1", "A2", "A3", "A4", "A5"]);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["A7", "A8"]);
    expect(c.isFirstInLocation).toBe(false);
    expect(c.isLastInLocation).toBe(false);
    expect(c.locationName).toBe("شارع النهضة");
  });

  it("أول سيارة في الموقع → مفيش قبلها + العلامة", () => {
    const c = neighborsInSameLocation(rows, 0, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.isFirstInLocation).toBe(true);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["A2", "A3", "A4", "A5", "A6"]);
  });

  it("آخر سيارة في الموقع → مفيش بعدها + العلامة", () => {
    // A8 (index 7): آخر واحدة في «شارع النهضة»
    const c = neighborsInSameLocation(rows, 7, "الشارع");
    expect(c.after).toEqual([]);
    expect(c.isLastInLocation).toBe(true);
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["A3", "A4", "A5", "A6", "A7"]);
  });

  it("مايعديش حدود الموقع (موقع مختلف مايتحسبش)", () => {
    // B1 (index 8): أول «شارع الملك» — مفيش قبله من نفس الموقع، بعده B2,B3
    const c = neighborsInSameLocation(rows, 8, "الشارع");
    expect(c.before).toEqual([]);
    expect(c.isFirstInLocation).toBe(true);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["B2", "B3"]);
    expect(c.isLastInLocation).toBe(false);
  });

  it("سيارة وسط موقع صغير (سيارتين قبل بس)", () => {
    // A3 (index 2): قبله A1,A2 (٢)، بعده A4..A8 (٥)
    const c = neighborsInSameLocation(rows, 2, "الشارع");
    expect(c.before.map((r) => r["رقم اللوحة"])).toEqual(["A1", "A2"]);
    expect(c.after.map((r) => r["رقم اللوحة"])).toEqual(["A4", "A5", "A6", "A7"].concat("A8").slice(0, 5));
    expect(c.after).toHaveLength(5);
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
// — فالبحث بيفشل وتطلع «تعذّر تحديد موقع السيارة… جرّب تعمل فرز من جديد»
// (ونصيحة غلط كمان: إعادة الفرز مابتغيّرش حاجة).
// الحل: نقرا من الجهاز على دفعات زي ما الفرز بيعمل — بذاكرة دفعة واحدة.
describe("neighborsFromStream — الجيران من ملف على الجهاز", () => {
  const LOC = "اسم الموقع";
  const mk = (n: number, loc: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => ({ "رقم اللوحة": `أبح ${1000 + i}`, [LOC]: loc(i) }));
  /** يقلّد iterateRows: بيسلّم الصفوف على دفعات مع فهرس البداية. */
  const streamOf = (rows: Record<string, string>[], batch = 7) =>
    async (onBatch: (rows: Record<string, string>[], base: number) => void | Promise<void>) => {
      for (let i = 0; i < rows.length; i += batch) await onBatch(rows.slice(i, i + batch), i);
    };

  it("بيطابق نتيجة النسخة اللي في الذاكرة بالظبط", async () => {
    const rows = mk(60, (i) => (i < 20 ? "شارع الأمير" : i < 45 ? "شارع الملك" : "شارع النخيل"));
    for (const idx of [0, 1, 19, 20, 30, 44, 45, 59]) {
      const want = neighborsInSameLocation(rows, idx, LOC);
      const got = await neighborsFromStream(streamOf(rows), idx, LOC);
      expect(got.ctx, `الصف ${idx}`).toEqual(want);
      expect(got.target).toEqual(rows[idx]);
    }
  });

  it("بيشتغل لو السيارة على حدّ دفعة (مش جوه دفعة واحدة)", async () => {
    const rows = mk(30, () => "شارع واحد");
    for (const batch of [1, 2, 3, 7, 30]) {
      const got = await neighborsFromStream(streamOf(rows, batch), 14, LOC);
      expect(got.ctx.before, `دفعة ${batch}`).toHaveLength(5);
      expect(got.ctx.after, `دفعة ${batch}`).toHaveLength(5);
      expect(got.ctx.before[0]).toEqual(rows[9]);
      expect(got.ctx.after[4]).toEqual(rows[19]);
    }
  });

  it("🐞 بيلاقي سيارة في عمق ملف كبير (اللي كان بيفشل)", async () => {
    const rows = mk(100_000, (i) => `شارع ${Math.floor(i / 50)}`);
    const got = await neighborsFromStream(streamOf(rows, 3000), 62_345, LOC);
    expect(got.target).toEqual(rows[62_345]);
    expect(got.ctx.locationName).toBe("شارع 1246");
    expect(got.ctx.before).toHaveLength(5);
    expect(got.ctx.after).toHaveLength(4);      // ٦٢٣٤٦..٦٢٣٤٩ وبعدها موقع تاني
    expect(got.ctx.isLastInLocation).toBe(false); // لسه فيه سيارات بعدها في نفس الموقع
  });

  it("مابيحملش الملف كله — ١١ صف بالكتير مهما كبر", async () => {
    const rows = mk(50_000, () => "شارع واحد");   // كل الملف موقع واحد
    const got = await neighborsFromStream(streamOf(rows, 1000), 25_000, LOC);
    expect(got.target).toEqual(rows[25_000]);
    // لو كان بيحمّل الموقع كله كان رجّع ٥٠ ألف — المفروض ٥ قبل + الهدف + ٥ بعد
    expect(got.ctx.before.length + got.ctx.after.length + 1).toBe(11);
    expect(got.ctx.before[0]).toEqual(rows[24_995]);
    expect(got.ctx.after[4]).toEqual(rows[25_005]);
  });

  it("أول الموقع وآخره بيتعلّموا صح", async () => {
    const rows = mk(20, (i) => (i < 10 ? "أ" : "ب"));
    const first = await neighborsFromStream(streamOf(rows), 10, LOC);
    expect(first.ctx.isFirstInLocation).toBe(true);
    expect(first.ctx.before).toEqual([]);
    const last = await neighborsFromStream(streamOf(rows), 9, LOC);
    expect(last.ctx.isLastInLocation).toBe(true);
    expect(last.ctx.after).toEqual([]);
  });

  it("آخر صف في الملف كله = آخر الموقع", async () => {
    const rows = mk(12, () => "شارع واحد");
    const got = await neighborsFromStream(streamOf(rows), 11, LOC);
    expect(got.ctx.isLastInLocation).toBe(true);
    expect(got.ctx.after).toEqual([]);
    expect(got.ctx.before).toHaveLength(5);
  });

  it("فهرس خارج الملف بيرجّع فاضي بدل ما يرمي", async () => {
    const rows = mk(10, () => "شارع");
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

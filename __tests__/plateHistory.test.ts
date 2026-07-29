import { describe, it, expect } from "vitest";
import {
  sheetFingerprint,
  recordAppearances,
  setPlateStatus,
  isClosedStatus,
  describeHistory,
  pruneDetail,
  newHistoryMap,
  type HistoryMap,
} from "@/lib/plateHistory";

const P1 = "ابح1234";
const P2 = "دمم5012";

function seed(): HistoryMap { return newHistoryMap(); }

describe("sheetFingerprint", () => {
  it("نفس اللوحات (بأي ترتيب) = نفس البصمة", () => {
    expect(sheetFingerprint([P1, P2])).toBe(sheetFingerprint([P2, P1]));
  });
  it("لوحات مختلفة = بصمة مختلفة", () => {
    expect(sheetFingerprint([P1, P2])).not.toBe(sheetFingerprint([P1]));
  });
  it("قائمة فاضية ليها بصمة ثابتة", () => {
    expect(sheetFingerprint([])).toBe(sheetFingerprint([]));
  });
});

describe("recordAppearances — قاعدة عدم التكرار", () => {
  it("أول فرز: بيسجّل ظهور واحد لكل لوحة", () => {
    const fp = sheetFingerprint([P1, P2]);
    const { map, added, incremented } = recordAppearances(seed(), [P1, P2], { today: "2026-05-05", fingerprint: fp });
    expect(added).toBe(2);
    expect(incremented).toBe(0);
    expect(map.get(P1)!.count).toBe(1);
    expect(map.get(P1)!.firstSeen).toBe("2026-05-05");
    expect(map.get(P1)!.dates).toEqual(["2026-05-05"]);
  });

  it("فرز تاني نفس اليوم بنفس الشيت: مايزيدش العدد", () => {
    const fp = sheetFingerprint([P1]);
    let m = recordAppearances(seed(), [P1], { today: "2026-05-05", fingerprint: fp }).map;
    const r2 = recordAppearances(m, [P1], { today: "2026-05-05", fingerprint: fp });
    expect(r2.incremented).toBe(0);
    expect(r2.map.get(P1)!.count).toBe(1);
    expect(r2.map.get(P1)!.dates.length).toBe(1);
  });

  it("فرز بعد يومين بنفس الشيت: مايزيدش (جوه فترة السماح)", () => {
    const fp = sheetFingerprint([P1]);
    let m = recordAppearances(seed(), [P1], { today: "2026-05-05", fingerprint: fp }).map;
    m = recordAppearances(m, [P1], { today: "2026-05-07", fingerprint: fp }).map;
    expect(m.get(P1)!.count).toBe(1);
    expect(m.get(P1)!.lastSeen).toBe("2026-05-07"); // بيحدّث آخر مرة بس
  });

  it("شيت مختلف (دفعة جديدة): بيزيد العدد", () => {
    let m = recordAppearances(seed(), [P1], { today: "2026-05-05", fingerprint: "fpMay" }).map;
    const r = recordAppearances(m, [P1], { today: "2026-06-02", fingerprint: "fpJune" });
    expect(r.incremented).toBe(1);
    expect(r.map.get(P1)!.count).toBe(2);
    expect(r.map.get(P1)!.firstSeen).toBe("2026-05-05"); // أول رصد مايتغيّرش
    expect(r.map.get(P1)!.dates).toEqual(["2026-06-02", "2026-05-05"]);
  });

  it("نفس الشيت بس بعد فترة السماح: بيزيد (شبكة أمان)", () => {
    const fp = sheetFingerprint([P1]);
    let m = recordAppearances(seed(), [P1], { today: "2026-05-05", fingerprint: fp }).map;
    const r = recordAppearances(m, [P1], { today: "2026-05-20", fingerprint: fp, cooldownDays: 7 });
    expect(r.map.get(P1)!.count).toBe(2);
  });

  it("تفاصيل التواريخ محدودة (آخر ٥) بس العدد بيفضل يزيد", () => {
    let m = seed();
    const days = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01"];
    days.forEach((d, i) => { m = recordAppearances(m, [P1], { today: d, fingerprint: `fp${i}` }).map; });
    const e = m.get(P1)!;
    expect(e.count).toBe(7);
    expect(e.dates.length).toBe(5);
    expect(e.dates[0]).toBe("2026-07-01");     // الأحدث الأول
    expect(e.firstSeen).toBe("2026-01-01");     // أول رصد محفوظ للأبد
  });

  it("بيتخطّى اللوحات الفاضية", () => {
    const { map, added } = recordAppearances(seed(), ["", "  "], { today: "2026-05-05", fingerprint: "x" });
    expect(added).toBe(0);
    expect(map.size).toBe(0);
  });
});

describe("setPlateStatus / isClosedStatus", () => {
  it("بيسجّل «سحبتها» بتاريخها", () => {
    let m = recordAppearances(seed(), [P1], { today: "2026-05-05", fingerprint: "a" }).map;
    m = setPlateStatus(m, P1, "taken", "2026-07-29");
    expect(m.get(P1)!.status).toBe("taken");
    expect(m.get(P1)!.statusAt).toBe("2026-07-29");
  });

  it("«ملقيتهاش» بيعدّ المحاولات", () => {
    let m = recordAppearances(seed(), [P1], { today: "2026-05-05", fingerprint: "a" }).map;
    m = setPlateStatus(m, P1, "notFound", "2026-05-06");
    m = setPlateStatus(m, P1, "notFound", "2026-06-10");
    expect(m.get(P1)!.notFoundCount).toBe(2);
  });

  it("الحالات المقفولة مقابل المفتوحة", () => {
    expect(isClosedStatus("taken")).toBe(true);
    expect(isClosedStatus("otherTook")).toBe(true);
    expect(isClosedStatus("paid")).toBe(true);
    expect(isClosedStatus("notFound")).toBe(false);
    expect(isClosedStatus("none")).toBe(false);
    expect(isClosedStatus("excluded")).toBe(true);
  });

  it("بيسجّل حالة لوحة عمرها ما ظهرت (بينشئ سجل)", () => {
    const m = setPlateStatus(seed(), P2, "taken", "2026-07-29");
    expect(m.get(P2)!.status).toBe("taken");
    expect(m.get(P2)!.firstSeen).toBe("2026-07-29");
  });
});

describe("describeHistory", () => {
  it("لوحة جديدة (ظهور واحد)", () => {
    const m = recordAppearances(seed(), [P1], { today: "2026-07-29", fingerprint: "a" }).map;
    const d = describeHistory(m.get(P1)!, "2026-07-29");
    expect(d.tone).toBe("new");
    expect(d.count).toBe(1);
    expect(d.months).toBe(0);
  });

  it("مطلوبة من ٥ شهور و٣ مرات → إشارة قوية", () => {
    let m = recordAppearances(seed(), [P1], { today: "2026-02-20", fingerprint: "a" }).map;
    m = recordAppearances(m, [P1], { today: "2026-05-01", fingerprint: "b" }).map;
    m = recordAppearances(m, [P1], { today: "2026-07-01", fingerprint: "c" }).map;
    const d = describeHistory(m.get(P1)!, "2026-07-29");
    expect(d.count).toBe(3);
    expect(d.months).toBe(5);
    expect(d.tone).toBe("danger");
  });

  it("ظهرت مرتين بس → تحذير متوسط", () => {
    let m = recordAppearances(seed(), [P1], { today: "2026-06-01", fingerprint: "a" }).map;
    m = recordAppearances(m, [P1], { today: "2026-07-01", fingerprint: "b" }).map;
    expect(describeHistory(m.get(P1)!, "2026-07-29").tone).toBe("warn");
  });
});

describe("pruneDetail — تفاصيل ٥ شهور بس، والملخص للأبد", () => {
  it("بيمسح التواريخ الأقدم من ٥ شهور ويحافظ على الملخص", () => {
    let m = seed();
    const days = ["2025-08-01", "2026-01-01", "2026-06-01", "2026-07-01"];
    days.forEach((d, i) => { m = recordAppearances(m, [P1], { today: d, fingerprint: `fp${i}` }).map; });
    const pruned = pruneDetail(m, "2026-07-29", 5);
    const e = pruned.get(P1)!;
    // التفاصيل: بس اللي جوه ٥ شهور
    expect(e.dates).toEqual(["2026-07-01", "2026-06-01"]);
    // الملخص محفوظ بالكامل
    expect(e.count).toBe(4);
    expect(e.firstSeen).toBe("2025-08-01");
  });

  it("مابيمسحش سجل بالكامل حتى لو كل تفاصيله قديمة", () => {
    const m = recordAppearances(seed(), [P1], { today: "2024-01-01", fingerprint: "a" }).map;
    const pruned = pruneDetail(m, "2026-07-29", 5);
    expect(pruned.has(P1)).toBe(true);
    expect(pruned.get(P1)!.dates).toEqual([]);
    expect(pruned.get(P1)!.firstSeen).toBe("2024-01-01");
  });
});

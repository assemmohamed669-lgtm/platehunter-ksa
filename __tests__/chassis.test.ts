import { describe, it, expect } from "vitest";
import {
  normalizeChassis,
  detectChassisColumn,
  buildChassisIndex,
  matchChassis,
} from "@/lib/chassis";

describe("normalizeChassis", () => {
  it("uppercases and strips spaces/dashes", () => {
    expect(normalizeChassis("waub hcfc8 dn029594")).toBe("WAUBHCFC8DN029594");
    expect(normalizeChassis("3KPA241A5JE-017513")).toBe("3KPA241A5JE017513");
  });
  it("drops any non-alphanumeric noise", () => {
    expect(normalizeChassis("  KNADN4126G6555369.  ")).toBe("KNADN4126G6555369");
  });
  it("returns empty for junk", () => {
    expect(normalizeChassis("—")).toBe("");
    expect(normalizeChassis("")).toBe("");
  });
});

describe("detectChassisColumn — by header name", () => {
  it("matches Arabic رقم الهيكل", () => {
    expect(detectChassisColumn(["رقم اللوحة", "رقم الهيكل", "الحي"])).toBe("رقم الهيكل");
  });
  it("matches شاصي / شاسيه variants", () => {
    expect(detectChassisColumn(["اللوحة", "رقم الشاصي"])).toBe("رقم الشاصي");
    expect(detectChassisColumn(["اللوحة", "الشاسيه"])).toBe("الشاسيه");
  });
  it("matches الشاص / رقم الشاص / شاص (without ي)", () => {
    expect(detectChassisColumn(["اللوحة", "رقم الشاص"])).toBe("رقم الشاص");
    expect(detectChassisColumn(["اللوحة", "الشاص"])).toBe("الشاص");
    expect(detectChassisColumn(["اللوحة", "شاص"])).toBe("شاص");
  });
  it("matches English Chassis / VIN", () => {
    expect(detectChassisColumn(["Plate", "Chassis Number", "Year"])).toBe("Chassis Number");
    expect(detectChassisColumn(["Plate", "VIN"])).toBe("VIN");
  });
  it("returns null when no chassis-like column exists by name or content", () => {
    expect(detectChassisColumn(["اللوحة", "الحي", "اللون"])).toBeNull();
  });
});

describe("detectChassisColumn — by content when header is unrecognizable", () => {
  const rows = [
    { "اللوحة": "أبح1234", "عمود": "WAUBHCFC8DN029594", "الحي": "العليا" },
    { "اللوحة": "دبك5678", "عمود": "KNADN4126G6555369", "الحي": "الملز" },
    { "اللوحة": "طعق9012", "عمود": "3KPA241A5JE017513", "الحي": "النسيم" },
  ];
  it("finds the VIN-shaped column", () => {
    expect(detectChassisColumn(["اللوحة", "عمود", "الحي"], rows)).toBe("عمود");
  });
});

describe("buildChassisIndex + matchChassis", () => {
  const rows = [
    { "رقم الهيكل": "WAUBHCFC8DN029594", "المالك": "أحمد" },
    { "رقم الهيكل": "KNADN4126G6555369", "المالك": "سعيد" },
  ];
  const idx = buildChassisIndex(rows, "رقم الهيكل");

  it("matches an exact VIN (case/space-insensitive)", () => {
    const m = matchChassis("waubhcfc8 dn029594", idx);
    expect(m.found).toBe(true);
    expect(m.matchType).toBe("exact");
    expect(m.row?.["المالك"]).toBe("أحمد");
  });
  it("does not match an unrelated VIN", () => {
    const m = matchChassis("3KPA241A5JE017513", idx);
    expect(m.found).toBe(false);
  });
});

// المطابقة تامة فقط — لا تقريب (حرف OCR واحد) ولا مطابقة بآخر الأرقام.
describe("matchChassis — تام فقط (no fuzzy / no partial)", () => {
  it("لا يطابق مع اختلاف حرف واحد (كان fuzzy قبل كده)", () => {
    const idx = buildChassisIndex([{ "رقم الهيكل": "WAUBHCFC8DN029594" }], "رقم الهيكل");
    expect(matchChassis("WAUBHCFC8DNO29594", idx).found).toBe(false); // O بدل 0
  });

  it("لا يطابق بآخر الأرقام (كان partial قبل كده)", () => {
    const idx = buildChassisIndex([{ "رقم الشاص": "1061458", "اللوحة": "حبك1234" }], "رقم الشاص");
    expect(matchChassis("MHFBA8FS5N1061458", idx).found).toBe(false);
    const idx2 = buildChassisIndex([{ "رقم الهيكل": "MHFBA8FS5N1061458" }], "رقم الهيكل");
    expect(matchChassis("1061458", idx2).found).toBe(false);
  });

  // الباج الحقيقي: رقما هيكل مختلفان تماماً بيشتركوا في آخر ٥ أرقام «03256»
  // كانوا بيتطابقوا partial ويطلّعوا «مطلوب» كاذب. لازم مايتطابقوش.
  it("لا يطابق رقمي هيكل مختلفين يشتركان في آخر الأرقام فقط", () => {
    const idx = buildChassisIndex([{ "الشاص": "LFP82APE2N1D03256", "اللوحة": "غير مطلوب" }], "الشاص");
    expect(matchChassis("L10DA4299L0103256", idx).found).toBe(false);
  });

  it("يطابق نفس الهيكل بالظبط (بغضّ النظر عن الفراغات/الشرطات)", () => {
    const idx = buildChassisIndex([{ "الشاص": "L10DA4299L0103256" }], "الشاص");
    expect(matchChassis("l10da4299 l0103256", idx).found).toBe(true);
  });
});

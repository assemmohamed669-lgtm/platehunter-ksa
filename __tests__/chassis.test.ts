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
  it("tolerates a single OCR slip (0↔O) as fuzzy", () => {
    const m = matchChassis("WAUBHCFC8DNO29594", idx); // O instead of 0
    expect(m.found).toBe(true);
    expect(m.matchType).toBe("fuzzy");
  });
  it("does not match an unrelated VIN", () => {
    const m = matchChassis("3KPA241A5JE017513", idx);
    expect(m.found).toBe(false);
  });
});

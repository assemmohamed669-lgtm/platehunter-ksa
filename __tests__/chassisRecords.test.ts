import { describe, it, expect } from "vitest";
import {
  pickBank,
  pickVehicleType,
  chassisExportRow,
  buildReferralChassisIndex,
  sortChassisAgainstReferrals,
} from "@/lib/chassisRecords";
import type { SheetTable } from "@/lib/chassis";
import type { ChassisEntry } from "@/lib/idb";

describe("pickBank / pickVehicleType — التقاط بيانات السيارة من صف مطابق", () => {
  it("يلتقط البنك", () => {
    expect(pickBank({ "البنك": "الأهلي", "رقم الهيكل": "X" })).toBe("الأهلي");
    expect(pickBank({ "Bank Name": "SNB" })).toBe("SNB");
    expect(pickBank({ "الحي": "النرجس" })).toBe("");
  });
  it("يلتقط نوع/طراز السيارة ومايخلطش مع «نوع الهيكل»", () => {
    expect(pickVehicleType({ "نوع السيارة": "كامري" })).toBe("كامري");
    expect(pickVehicleType({ "طراز المركبة": "هايلوكس" })).toBe("هايلوكس");
    expect(pickVehicleType({ "نوع الهيكل": "صالون" })).toBe(""); // بدن مش نوع سيارة
  });
});

describe("chassisExportRow — صف تصدير أرقام الشاص", () => {
  it("يبني الأعمدة المطلوبة مع الحالة والموقع", () => {
    const e: ChassisEntry = {
      id: "1", chassis: "JT2BG22K1W0000001", found: true, matchType: "exact",
      plate: "ابح1234", bank: "الأهلي", vehicleType: "كامري",
      lat: 24.7, lng: 46.6, checkedAt: "2026-07-26T09:05:00Z",
    };
    const row = chassisExportRow(e);
    expect(row["رقم الشاص"]).toBe("JT2BG22K1W0000001");
    expect(row["رقم اللوحة"]).toBe("ابح1234");
    expect(row["البنك"]).toBe("الأهلي");
    expect(row["نوع السيارة"]).toBe("كامري");
    expect(row["الحالة"]).toBe("مطلوب");
    expect(row["الموقع"]).toBe("24.7,46.6");
    expect(row["التاريخ والوقت"]).not.toBe("");
  });
  it("غير المطابق → الحالة «غير مطابق»", () => {
    const e: ChassisEntry = { id: "2", chassis: "ABC123456789", found: false, checkedAt: "2026-07-26T09:05:00Z" };
    expect(chassisExportRow(e)["الحالة"]).toBe("غير مطابق");
  });
});

describe("sortChassisAgainstReferrals — فرز شيت الشاص على الإحالات", () => {
  const referral: SheetTable = {
    sheetName: "احالة",
    headers: ["رقم اللوحة", "رقم الهيكل", "البنك"],
    rows: [
      { "رقم اللوحة": "ابح1234", "رقم الهيكل": "JT2BG22K1W0000001", "البنك": "الأهلي" },
      { "رقم اللوحة": "دهس5678", "رقم الهيكل": "MHFLW9EM5K1234567", "البنك": "الراجحي" },
    ],
  };

  it("يبني فهرس شاص من الإحالة", () => {
    const idx = buildReferralChassisIndex([referral]);
    expect(idx.size).toBe(2);
    expect(idx.has("JT2BG22K1W0000001")).toBe(true);
  });

  it("يطابق أرقام الشاص على الإحالة (تام + تقريبي + غير موجود)", () => {
    const rows = sortChassisAgainstReferrals(
      ["JT2BG22K1W0000001", "mhflw9em5k1234560", "ZZZ999999999"],
      [referral],
    );
    expect(rows[0].found).toBe(true);
    expect(rows[0].matchType).toBe("exact");
    expect(rows[0].referralRow?.["البنك"]).toBe("الأهلي");
    expect(rows[1].found).toBe(true);
    expect(rows[1].matchType).toBe("fuzzy"); // خانة واحدة فرق
    expect(rows[2].found).toBe(false);
  });
});

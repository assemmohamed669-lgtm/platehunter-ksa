import { describe, it, expect } from "vitest";
import {
  buildReferralChassisIndex,
  matchChassisRecordsAgainstReferrals,
  type ReferralSheet,
} from "@/lib/chassisRecords";
import type { ChassisRecord } from "@/lib/chassisRecords";

function rec(chassis: string, over: Partial<ChassisRecord> = {}): ChassisRecord {
  return { id: chassis, chassis, found: false, checkedAt: "2026-07-26T10:00:00Z", ...over };
}

describe("matchChassisRecordsAgainstReferrals — فرز أرقام الشاص على الإحالة", () => {
  const referral: ReferralSheet = {
    headers: ["رقم اللوحة", "هيكل المرور", "نوع السيارة"],
    rows: [
      { "رقم اللوحة": "أ ب ح 1234", "هيكل المرور": "6G1LL54F56L462203", "نوع السيارة": "سوناتا" },
      { "رقم اللوحة": "د ه س 5678", "هيكل المرور": "KMHDT41BX7U015975", "نوع السيارة": "النترا" },
      { "رقم اللوحة": "ط ع ق 9012", "هيكل المرور": "MR0ES12G463009941", "نوع السيارة": "هايلوكس" },
    ],
  };

  it("يمسك عمود «هيكل المرور» ويطابق الأرقام المسجّلة", () => {
    const records = [
      rec("6G1LL54F56L462203", { vehicleType: "سيارة", lat: 24.7, lng: 46.6, mapsLink: "https://maps.app.goo.gl/x" }),
      rec("KMHDT41BX7U015975"),
      rec("ZZZNOTINREFERRAL9"), // مش في الإحالة
    ];
    const out = matchChassisRecordsAgainstReferrals(records, [referral]);
    expect(out.length).toBe(2);
    const first = out.find((m) => m.record.chassis === "6G1LL54F56L462203");
    expect(first).toBeTruthy();
    expect(first!.referralRow["رقم اللوحة"]).toBe("أ ب ح 1234");
    expect(first!.referralRow["نوع السيارة"]).toBe("سوناتا");
    expect(first!.record.mapsLink).toBe("https://maps.app.goo.gl/x"); // الموقع من السجل
  });

  it("مايرجّعش اللي مش في الإحالة", () => {
    const out = matchChassisRecordsAgainstReferrals([rec("ZZZNOTINREFERRAL9")], [referral]);
    expect(out.length).toBe(0);
  });

  it("يكتشف عمود الشاص بالمحتوى لو الاسم مش معروف (قيم VIN)", () => {
    const unnamed: ReferralSheet = {
      headers: ["اللوحة", "عمود مجهول", "الحي"],
      rows: [
        { "اللوحة": "أبح1", "عمود مجهول": "JF1SG93M16J072860", "الحي": "العليا" },
        { "اللوحة": "دبك2", "عمود مجهول": "JN6DD21S96X098914", "الحي": "الملز" },
        { "اللوحة": "طعق3", "عمود مجهول": "6T1BE42K07X378790", "الحي": "النسيم" },
      ],
    };
    const out = matchChassisRecordsAgainstReferrals([rec("JN6DD21S96X098914")], [unnamed]);
    expect(out.length).toBe(1);
    expect(out[0].referralRow["اللوحة"]).toBe("دبك2");
  });

  it("يدمج أكتر من ورقة إحالة", () => {
    const extra: ReferralSheet = {
      headers: ["رقم الشاص", "رقم اللوحة"],
      rows: [{ "رقم الشاص": "KL1VJ53K47B025437", "رقم اللوحة": "ك ل م 7777" }],
    };
    const out = matchChassisRecordsAgainstReferrals(
      [rec("KL1VJ53K47B025437"), rec("6G1LL54F56L462203")],
      [referral, extra],
    );
    expect(out.length).toBe(2);
  });

  it("مفيش عمود شاص في الإحالة → فهرس فاضي", () => {
    const noCol: ReferralSheet = { headers: ["الحي", "اللون"], rows: [{ "الحي": "النرجس", "اللون": "أبيض" }] };
    expect(buildReferralChassisIndex([noCol]).size).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  areaSource, regionLabel, autoAreaEligible, AreaResolver,
  AUTO_AREA_MAX_ACCURACY_M,
} from "@/lib/autoArea";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🏘️ «الحي تلقائي» في صفحة «الجديد»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٥ سبتمبر ٢٠٢٦): «عايز يبقى فيه زر لما يفتحه المندوب ياخد اسم الحي
 *  واسم الشارع تلقائي ويحطهم أمام السيارات… زي اللي في صفحة التشييك. بس لو
 *  المندوب كتب في المربع والزر ده مفتوح يتطبق اللي المندوب كاتبه، ولو المربع
 *  فاضي ياخد اسم الحي من الجي بي اس ويكون دقيق… واسم المسجّل لو محطوط
 *  ميمنعش التلقائي».
 */
describe("areaSource — مين يكسب", () => {
  it("🔴 المندوب كاتب ⇒ اللي كتبه، حتى والزرار مفتوح", () => {
    expect(areaSource("النسيم - شارع ٣٠", true)).toBe("typed");
  });
  it("المربع فاضي والزرار مفتوح ⇒ من الـGPS", () => {
    expect(areaSource("", true)).toBe("auto");
    expect(areaSource("   ", true)).toBe("auto");
  });
  it("الزرار مقفول ⇒ زي الأول (المكتوب أو مافيش)", () => {
    expect(areaSource("النسيم", false)).toBe("typed");
    expect(areaSource("", false)).toBe("none");
  });
});

describe("regionLabel — «الشارع - الحي» زي صفحة التشييك", () => {
  it("الاتنين موجودين", () => {
    expect(regionLabel({ street: "شارع الأمير سلطان", district: "النسيم" })).toBe("شارع الأمير سلطان - النسيم");
  });
  it("🔴 «غير معروف»/«غير متاح» مابيتكتبوش — الفاضي أحسن من الغلط", () => {
    expect(regionLabel({ street: "غير معروف", district: "النسيم" })).toBe("النسيم");
    expect(regionLabel({ street: "غير متاح", district: "غير متاح" })).toBe("");
  });
  it("الشارع والحي نفس الاسم ⇒ مرة واحدة", () => {
    expect(regionLabel({ street: "النسيم", district: "النسيم" })).toBe("النسيم");
  });
});

describe("autoAreaEligible — «ويكون دقيق»", () => {
  it(`دقة ≤ ${AUTO_AREA_MAX_ACCURACY_M}م ⇒ أيوه`, () => {
    expect(autoAreaEligible({ lat: 24.7, lng: 46.7, gpsAccuracy: 12 })).toBe(true);
    expect(autoAreaEligible({ lat: 24.7, lng: 46.7, gpsAccuracy: AUTO_AREA_MAX_ACCURACY_M })).toBe(true);
  });
  it("🔴 دقة ضعيفة ⇒ لأ (الشارع هيطلع غلط)", () => {
    expect(autoAreaEligible({ lat: 24.7, lng: 46.7, gpsAccuracy: AUTO_AREA_MAX_ACCURACY_M + 1 })).toBe(false);
  });
  it("مافيش موقع أو دقة ⇒ لأ", () => {
    expect(autoAreaEligible({ lat: null, lng: null, gpsAccuracy: 5 })).toBe(false);
    expect(autoAreaEligible({ lat: 24.7, lng: 46.7, gpsAccuracy: null })).toBe(false);
  });
});

describe("AreaResolver — نداء واحد لكل مكان · واحد ورا التاني", () => {
  const fake = () => {
    const calls: Array<[number, number]> = [];
    let active = 0, maxActive = 0;
    const reverse = async (lat: number, lng: number) => {
      calls.push([lat, lng]); active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { street: "شارع " + calls.length, district: "النسيم" };
    };
    return { calls, reverse, max: () => maxActive };
  };

  it("نفس المكان تقريباً (أقل من ١٥ متر) ⇒ نفس العنوان من غير نداء جديد", async () => {
    const f = fake();
    const r = new AreaResolver(f.reverse, { minGapMs: 0 });
    const a = await r.resolve(24.700000, 46.700000);
    const b = await r.resolve(24.700050, 46.700050);   // ~٧ متر
    expect(a).toBe("شارع 1 - النسيم");
    expect(b).toBe(a);
    expect(f.calls.length).toBe(1);
  });

  it("اتحرّك أكتر من ١٥ متر ⇒ نداء جديد", async () => {
    const f = fake();
    const r = new AreaResolver(f.reverse, { minGapMs: 0 });
    await r.resolve(24.7, 46.7);
    await r.resolve(24.7005, 46.7);   // ~٥٥ متر
    expect(f.calls.length).toBe(2);
  });

  it("🔴 طلبات كتير مع بعض ⇒ واحد ورا التاني (خدمة العناوين بتحظر أكتر من طلب في الثانية)", async () => {
    const f = fake();
    const r = new AreaResolver(f.reverse, { minGapMs: 0 });
    await Promise.all([r.resolve(24.70, 46.70), r.resolve(24.71, 46.70), r.resolve(24.72, 46.70)]);
    expect(f.max()).toBe(1);
    expect(f.calls.length).toBe(3);
  });

  it("الخدمة فشلت ⇒ فاضي (مش «غير متاح»)", async () => {
    const r = new AreaResolver(async () => { throw new Error("net"); }, { minGapMs: 0 });
    expect(await r.resolve(24.7, 46.7)).toBe("");
  });
});

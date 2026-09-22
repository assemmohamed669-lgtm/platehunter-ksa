import { describe, it, expect } from "vitest";
import { heardNotShown } from "@/lib/trialTwin";

/**
 * 🔴 **إنذار كاذب في التقرير** (جلسة المالك، ٢٢ سبتمبر ٢٠٢٦ · ٤٣ لوحة):
 *
 *     «لوحة اتسمعت وماظهرتش: 1  [حبل6899]»
 *
 * و`حبل6899` **مش لوحة ضاعت** — دي قراءة مغلوطة لـ`حبل6819` اللي ظهرت
 * فعلاً (صف ٤٢). النافذة اللي بعدها قرتها صح، ولمّ التوائم شالها زي ما
 * المفروض. العدّاد بس كان بيقارن **بالتطابق الحرفي** فعدّها ضياع.
 *
 * ⇒ التقرير بيقول «فقدنا لوحة» والحقيقة صفر فقد. وده أخطر من عيب تجميل:
 *   المالك بيقرا الرقم ده عشان يحكم على الموديل.
 */
describe("«اتسمعت وماظهرتش» — التوائم مش ضياع", () => {
  const shown = [{ plate: "حبل6819", atMs: 105_500 }];

  it("القراءة المطابقة تماماً مش ضياع", () => {
    const reads = [{ plate: "حبل6819", tMs: 105_500, accepted: true, blocked: false }];
    expect(heardNotShown(reads, shown)).toEqual([]);
  });

  it("🔴 قراءة مغلوطة للوحة **ظهرت** مش ضياع", () => {
    const reads = [{ plate: "حبل6899", tMs: 104_000, accepted: true, blocked: false }];
    expect(heardNotShown(reads, shown)).toEqual([]);
  });

  it("لوحة تانية خالص ماظهرتش ⇒ ضياع حقيقي", () => {
    const reads = [{ plate: "دطس2177", tMs: 104_000, accepted: true, blocked: false }];
    expect(heardNotShown(reads, shown)).toEqual(["دطس2177"]);
  });

  it("لوحة شبيهة بس **بعيدة زمنياً** ⇒ عربية تانية فعلاً ⇒ ضياع", () => {
    const reads = [{ plate: "حبل6899", tMs: 5_000, accepted: true, blocked: false }];
    expect(heardNotShown(reads, shown)).toEqual(["حبل6899"]);
  });

  it("نافذة فيها لوحتين — المعروضة تتشال والباقية تتحسب", () => {
    const reads = [
      { plate: "ادل2521 حبل6899", tMs: 104_000, accepted: true, blocked: false },
    ];
    expect(heardNotShown(reads, [...shown, { plate: "ادل2521", atMs: 104_000 }])).toEqual([]);
  });

  it("المحجوب كاختراع والمرفوض مابيتحسبوش", () => {
    const reads = [
      { plate: "دطس2177", tMs: 104_000, accepted: true, blocked: true },
      { plate: "رقب2177", tMs: 104_000, accepted: false, blocked: false },
    ];
    expect(heardNotShown(reads, shown)).toEqual([]);
  });

  it("الشكل الغلط مابيتحسبش (مش ٣ حروف + ٤ أرقام)", () => {
    const reads = [{ plate: "رمس6", tMs: 800, accepted: true, blocked: false }];
    expect(heardNotShown(reads, shown)).toEqual([]);
  });

  it("التكرار بيتلمّ — نفس اللوحة الضايعة مرة واحدة", () => {
    const reads = [
      { plate: "دطس2177", tMs: 10_000, accepted: true, blocked: false },
      { plate: "دطس2177", tMs: 11_500, accepted: true, blocked: false },
    ];
    expect(heardNotShown(reads, shown)).toEqual(["دطس2177"]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { maskCertLine, certTextShape } from "@/lib/certTextShape";

/**
 * 📄 شكل نص الشهادة — مفيش اسم ولا رقم بيطلع، بس مكان اللوحة وشكلها (المالك ٦ أكتوبر ٢٠٢٦: «فيه حد
 * بيفرز مش بيطلع معاه نتيجه» — الشهايد اللي القارئ مالقاش فيها لوحة).
 */
describe("🔴 الإخفاء", () => {
  it("🔴 الأسامي والأرقام بتستخبى كلها — العناوين بس اللي بتفضل", () => {
    expect(maskCertLine("االسم: محمد أحمد علي")).toBe("االسم: عععع عععع ععع");
    expect(maskCertLine("رقم الهوية 1012345678")).toBe("رقم عععععع 9999999999");
    expect(maskCertLine("رقم اللوحة: ر ق ح 8377")).toBe("رقم اللوحة: ع ع ع 9999");
    expect(maskCertLine("Plate No. 8377 JGR")).toBe("Plate No. 9999 LLL");
    expect(maskCertLine("VIN: MR0FA3CD100123456")).toBe("VIN: LL9LL9LL999999999");
  });
  it("السطور الفاضية بتتشال والعدد محدود", () => {
    expect(certTextShape("أ\n\n  \nب 12\nج", 2)).toEqual(["ع", "ع 99"]);
  });
  it("🔴 الدورة بترجّع الشكل المخفي بس", () => {
    const r = readFileSync("app/api/cron/cert-daily/route.ts", "utf8");
    expect(r).toMatch(/searchParams\.get\("diag"\) === "shape"/);
    expect(r).toMatch(/certTextShape\(/);
  });
});

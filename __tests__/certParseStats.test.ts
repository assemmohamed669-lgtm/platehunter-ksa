import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { certParseStats } from "@/lib/certParseStats";

/**
 * 📄 مقياس القارئ على الشهايد الحقيقية — المالك (٦ أكتوبر ٢٠٢٦): «فيه حد بيفرز مش بيطلع معاه نتيجه
 * الفرز». أرقام بس، مفيش لوحة بتطلع برّه السيرفر.
 */
describe("🔴 القارئ بيقرا اللوحة صح؟", () => {
  it("🔴 زي اسم الملف · حروفها مقلوبة · حاجة تانية · مالقاش لوحة · اسم أرقام بس", () => {
    const s = certParseStats([
      { name: "ر ل ي 8370.pdf", plate: "رلي8370", vin: "" },          // زيها
      { name: "حبد8948.pdf", plate: "دبح8948", vin: "" },             // مقلوبة
      { name: "س ص ط 5678.pdf", plate: "ابح1234", vin: "" },          // تانية
      { name: "ل م ن 4444.pdf", plate: "", vin: "MR0FA3CD100123456" }, // مالقاش لوحة
      { name: "8377.pdf", plate: "رقح8377", vin: "" },                // أرقام بس — زيها
      { name: "0912.pdf", plate: "دهو912", vin: "" },
      { name: "JTDBR32E720012345.pdf", plate: "", vin: "JTDBR32E720012345", certNo: "CRN-119-00133431" },
    ]);
    expect(s).toEqual({
      withPlate: 5, withVin: 2, withCertNo: 1, nameFull: 4, nameAgree: 1, nameReversed: 1, nameOther: 1, nameNoPlate: 1, nameDigits: 2, digitsAgree: 2,
    });
  });
  it("🔴 الدورة بترجّعه بالأرقام بس (مفيش لوحات ولا أسامي)", () => {
    const r = readFileSync("app/api/cron/cert-daily/route.ts", "utf8");
    expect(r).toMatch(/searchParams\.get\("diag"\) === "1"/);
    expect(r).toMatch(/certParseStats\(/);
    expect(r).not.toMatch(/entries:\s*d\.entries/);
  });
});

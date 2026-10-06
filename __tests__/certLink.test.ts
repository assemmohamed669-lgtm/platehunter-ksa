import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { signCertLink, verifyCertLink, CERT_LINK_DAYS } from "@/lib/certLink";

/**
 * 🔗 لينك الشهادة اللي بيتبعت على واتساب — المالك (٦ أكتوبر ٢٠٢٦): «ويبقي فيهم لينك الشهادة ع الواتس
 * يتبعت معاهم لما يدوس عليها يفتحها». الشهادة على درايف حساب الشهايد (مش متاحة لحد) ⇒ لينك من البرنامج
 * موقّع (حرف واحد يتغيّر يبطل) وبينتهي بعد ٣٠ يوم.
 */
const S = "test-secret-123";
const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const NOW = Date.parse("2026-10-06T10:00:00Z");

describe("🔴 التوقيع", () => {
  it("🔴 اللينك بيرجّع نفس الملف", () => {
    const t = signCertLink(ID, NOW, S);
    expect(t.startsWith(`${ID}.`)).toBe(true);
    expect(verifyCertLink(t, NOW + 60_000, S)).toBe(ID);
  });
  it("🔴 حرف واحد يتغيّر ⇒ مايفتحش (ملف تاني أو توقيع تاني)", () => {
    const t = signCertLink(ID, NOW, S);
    const other = t.replace(ID, ID.slice(0, -1) + "9");
    expect(verifyCertLink(other, NOW, S)).toBeNull();
    const last = t.slice(-1) === "A" ? "B" : "A";
    expect(verifyCertLink(t.slice(0, -1) + last, NOW, S)).toBeNull();
  });
  it("🔴 بينتهي بعد ٣٠ يوم", () => {
    expect(CERT_LINK_DAYS).toBe(30);
    const t = signCertLink(ID, NOW, S);
    expect(verifyCertLink(t, NOW + 29 * 86_400_000, S)).toBe(ID);
    expect(verifyCertLink(t, NOW + 31 * 86_400_000, S)).toBeNull();
  });
  it("🔴 مفتاح تاني أو مفيش مفتاح ⇒ مفيش لينك", () => {
    const t = signCertLink(ID, NOW, S);
    expect(verifyCertLink(t, NOW, "other")).toBeNull();
    expect(signCertLink(ID, NOW, "")).toBe("");
    expect(verifyCertLink(t, NOW, "")).toBeNull();
    expect(verifyCertLink("../../etc", NOW, S)).toBeNull();
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("🔴 /c/[token]: بيتأكد من التوقيع · بيحدّ عدد الطلبات · بيرجّع الـPDF من درايف", () => {
    const r = read("app/c/[token]/route.ts");
    expect(r).toMatch(/verifyCertLink\(/);
    expect(r).toMatch(/rateLimit\(/);
    expect(r).toMatch(/getDriveAccessToken\(\)/);
    expect(r).toMatch(/"Content-Type": "application\/pdf"/);
    expect(r).toMatch(/export const fetchCache = "force-no-store"/);
  });
  it("🔴 شهايد اليوم بترجع بلينك لكل شهادة", () => {
    const r = read("app/api/certificate/daily/route.ts");
    expect(r).toMatch(/signCertLink\(/);
    expect(r).toMatch(/\/c\//);
  });
});

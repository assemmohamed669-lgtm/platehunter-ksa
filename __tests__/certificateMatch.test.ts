import { describe, it, expect } from "vitest";
import { toLatinDigits, looksLikeChassis, looksLikeCertNumber, certSearchToken, plateDigits, plateCertKey, matchCertFiles } from "@/lib/certificateMatch";

describe("certificateMatch", () => {
  it("يحوّل الأرقام العربية للاتينية", () => {
    expect(toLatinDigits("٨٤٠٣")).toBe("8403");
    expect(toLatinDigits("د و ا ٨٤٠٣")).toBe("د و ا 8403");
  });

  it("يكتشف رقم الشاص (VIN)", () => {
    expect(looksLikeChassis("MHKAB1BA2PJ062911")).toBe(true);
    expect(looksLikeChassis("mhkab1ba2pj062911")).toBe(true);
    expect(looksLikeChassis("د و ا 8403")).toBe(false);   // لوحة سعودية
    expect(looksLikeChassis("8403")).toBe(false);          // أرقام بس
    expect(looksLikeChassis("ABCDEFG")).toBe(false);       // حروف بس
  });

  it("يكتشف رقم الشهادة (REPO/CRN/رقم طويل)", () => {
    expect(looksLikeCertNumber("REPO-211-00265929")).toBe(true);
    expect(looksLikeCertNumber("repo 211 00265929")).toBe(true);
    expect(looksLikeCertNumber("CRN-211-01645769")).toBe(true);
    expect(looksLikeCertNumber("00265929")).toBe(true);      // رقم طويل
    expect(looksLikeCertNumber("211-00265929")).toBe(true);
    expect(looksLikeCertNumber("د و ا 8403")).toBe(false);   // لوحة
    expect(looksLikeCertNumber("8403")).toBe(false);          // أرقام لوحة (٤) مش شهادة
  });

  it("توكن بحث الشهادة: ملزوق → آخر ٨، وإلا زي ما هو", () => {
    expect(certSearchToken("REPO-211-00265929")).toBe("REPO-211-00265929");
    expect(certSearchToken("211-00265929")).toBe("211-00265929");
    expect(certSearchToken("21100265929")).toBe("00265929");   // ملزوق → آخر ٨
    expect(certSearchToken("00265929")).toBe("00265929");
  });

  it("يطلّع أرقام اللوحة", () => {
    expect(plateDigits("د و ا 8403")).toBe("8403");
    expect(plateDigits("٨٤٠٣ دوا")).toBe("8403");
    expect(plateDigits("8403-د و م")).toBe("8403");
  });

  it("المفتاح الموحّد نفسه لكل أشكال اللوحة", () => {
    const key = "دوا8403";
    expect(plateCertKey("د و ا 8403.pdf")).toBe(key);
    expect(plateCertKey("دوا8403")).toBe(key);
    expect(plateCertKey("٨٤٠٣ دوا")).toBe(key);
    expect(plateCertKey("8403-د و ا")).toBe(key);
    expect(plateCertKey("د و ا 8403.PDF")).toBe(key);
  });

  it("يوحّد أشكال الألف", () => {
    expect(plateCertKey("أ ب ح 1234")).toBe(plateCertKey("ا ب ح 1234"));
  });

  it("يطابق الملف الصح من قائمة أسماء مختلفة الأشكال", () => {
    const files = [
      { name: "ر ك ك 8403.pdf" },
      { name: "د م ا 8403.pdf" },
      { name: "د و ا 8403.PDF" },   // ده المطلوب
      { name: "8403-ر ع س.pdf" },
    ];
    // المندوب كتب بأي شكل → يلاقي «د و ا 8403»
    expect(matchCertFiles("دوا8403", files).map((f) => f.name)).toEqual(["د و ا 8403.PDF"]);
    expect(matchCertFiles("٨٤٠٣ د و ا", files).map((f) => f.name)).toEqual(["د و ا 8403.PDF"]);
    expect(matchCertFiles("ر ك ك ٨٤٠٣", files).map((f) => f.name)).toEqual(["ر ك ك 8403.pdf"]);
  });

  it("مفيش مطابقة = قائمة فاضية", () => {
    expect(matchCertFiles("زذر9999", [{ name: "د و ا 8403.pdf" }])).toEqual([]);
  });
});

/**
 * أشكال أسماء الشهادات على الدرايف (من صورة المالك ٢٠٢٦-٠٩-١٥):
 *   «س د ط 2104.pdf» · «2104-د ل ي.pdf» · «د ع ن 2104.PDF» · وبالإنجليزي كمان.
 */
describe("بحث الشهايد — أشكال اسم الملف", () => {
  const files = [
    { name: "د ه ق 2104.pdf" },
    { name: "س د ط 2104.pdf" },
    { name: "2104-د ل ي.pdf" },
    { name: "د ع ن 2104.PDF" },
    { name: "SDT 2104.pdf" },      // نفس «س د ط» بالإنجليزي
    { name: "د ه ق 5555.pdf" },
  ];

  it("المندوب بيكتب الحروف ملزوقة والملف بمسافات", () => {
    expect(matchCertFiles("سدط2104", files).map((f) => f.name))
      .toEqual(["س د ط 2104.pdf", "SDT 2104.pdf"]);
  });

  it("الأرقام قبل الحروف في اسم الملف بتتطابق برضه", () => {
    expect(matchCertFiles("دلي2104", files).map((f) => f.name)).toEqual(["2104-د ل ي.pdf"]);
  });

  it("اسم الملف إنجليزي والمندوب كتب عربي", () => {
    expect(matchCertFiles("سدط 2104", files).some((f) => f.name === "SDT 2104.pdf")).toBe(true);
  });

  it("بحث بالأرقام بس بيرجّع كل شهادات الرقم ده", () => {
    const names = matchCertFiles("2104", files).map((f) => f.name);
    expect(names).toHaveLength(5);
    expect(names).not.toContain("د ه ق 5555.pdf");
  });

  it("الامتداد مابيدخلش في مفتاح اللوحة", () => {
    expect(plateCertKey("د ه ق 2104.pdf")).toBe(plateCertKey("دهق2104"));
  });
});

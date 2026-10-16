import { describe, it, expect } from "vitest";
import { numberTokenValue, parseNumberGroup, isNumberWord } from "../arabicNumbers";
import { toWesternDigits } from "../textNormalize";

describe("toWesternDigits — توحيد الأرقام الهندية", () => {
  it("يحوّل الأرقام العربية-الهندية", () => {
    expect(toWesternDigits("١٢٣٤")).toBe("1234");
    expect(toWesternDigits("٥٦٧٨٩٠")).toBe("567890");
  });

  it("يحوّل الأرقام الفارسية", () => {
    expect(toWesternDigits("۱۲۳۴")).toBe("1234");
  });

  it("يسيب الأرقام العادية زي ما هي", () => {
    expect(toWesternDigits("1234")).toBe("1234");
  });
});

describe("numberTokenValue — قيمة كل كلمة رقم", () => {
  it("الوحدات بكل اللهجات", () => {
    expect(numberTokenValue("صفر")?.value).toBe(0);
    expect(numberTokenValue("واحد")?.value).toBe(1);
    expect(numberTokenValue("اتنين")?.value).toBe(2);
    expect(numberTokenValue("اثنين")?.value).toBe(2);
    expect(numberTokenValue("تلاتة")?.value).toBe(3);
    expect(numberTokenValue("ثلاثة")?.value).toBe(3);
    expect(numberTokenValue("أربعة")?.value).toBe(4);
    expect(numberTokenValue("اربع")?.value).toBe(4);
    expect(numberTokenValue("خمسة")?.value).toBe(5);
    expect(numberTokenValue("خمس")?.value).toBe(5);
    expect(numberTokenValue("ستة")?.value).toBe(6);
    expect(numberTokenValue("ست")?.value).toBe(6);
    expect(numberTokenValue("سبعة")?.value).toBe(7);
    expect(numberTokenValue("سبع")?.value).toBe(7);
    expect(numberTokenValue("تمانية")?.value).toBe(8);
    expect(numberTokenValue("ثمانية")?.value).toBe(8);
    expect(numberTokenValue("تسعة")?.value).toBe(9);
    expect(numberTokenValue("تسع")?.value).toBe(9);
  });

  it("العشرات", () => {
    expect(numberTokenValue("عشرة")?.value).toBe(10);
    expect(numberTokenValue("عشرين")?.value).toBe(20);
    expect(numberTokenValue("تلاتين")?.value).toBe(30);
    expect(numberTokenValue("ثلاثين")?.value).toBe(30);
    expect(numberTokenValue("أربعين")?.value).toBe(40);
    expect(numberTokenValue("خمسين")?.value).toBe(50);
    expect(numberTokenValue("تسعين")?.value).toBe(90);
  });

  it("المئات", () => {
    expect(numberTokenValue("مية")?.value).toBe(100);
    expect(numberTokenValue("مئة")?.value).toBe(100);
    expect(numberTokenValue("ميتين")?.value).toBe(200);
    expect(numberTokenValue("تلتمية")?.value).toBe(300);
    expect(numberTokenValue("سبعمية")?.value).toBe(700);
    expect(numberTokenValue("تسعمائة")?.value).toBe(900);
  });

  it("الآلاف", () => {
    expect(numberTokenValue("ألفين")?.value).toBe(2000);
    expect(numberTokenValue("الفين")?.value).toBe(2000);
    expect(numberTokenValue("آلاف")?.isScale).toBe(true);
  });

  it("«ألف» علامة ملتبسة — رقم ١٠٠٠ أو حرف الألف", () => {
    const t = numberTokenValue("ألف");
    expect(t?.value).toBe(1000);
    expect(t?.ambiguousWithLetter).toBe("ا");
  });

  it("كلمة مش رقم ترجّع null", () => {
    expect(numberTokenValue("سيارة")).toBeNull();
  });
});

describe("parseNumberGroup — تجميع الأرقام", () => {
  it("أرقام منفصلة تتلزق ورا بعض", () => {
    expect(parseNumberGroup(["واحد", "اتنين", "تلاتة", "أربعة"]).digits).toBe("1234");
  });

  it("الصفر يفضل صفر في أوله", () => {
    expect(parseNumberGroup(["صفر", "خمسة", "تسعة", "اتنين"]).digits).toBe("0592");
  });

  it("«ألفين وسبعمية» = 2700", () => {
    const r = parseNumberGroup(["ألفين", "و", "سبعمية"]);
    expect(r.digits).toBe("2700");
    expect(r.mode).toBe("compound");
  });

  it("«تلاتين» = 30", () => {
    expect(parseNumberGroup(["تلاتين"]).digits).toBe("30");
  });

  it("«سبعة وعشرين» = 27 (الوحدات قبل العشرات في العربي)", () => {
    expect(parseNumberGroup(["سبعة", "و", "عشرين"]).digits).toBe("27");
  });

  it("«ألف وتلتمية وستة وستين» = 1366", () => {
    expect(parseNumberGroup(["ألف", "و", "تلتمية", "و", "ستة", "و", "ستين"]).digits).toBe("1366");
  });

  it("«أربعة آلاف وخمسمية» = 4500", () => {
    expect(parseNumberGroup(["أربعة", "آلاف", "و", "خمسمية"]).digits).toBe("4500");
  });

  it("«مية وخمسة وعشرين» = 125", () => {
    expect(parseNumberGroup(["مية", "و", "خمسة", "و", "عشرين"]).digits).toBe("125");
  });

  it("«خمسة عشر» = 15", () => {
    expect(parseNumberGroup(["خمسة", "عشر"]).digits).toBe("15");
  });

  it("أرقام مكتوبة رقمياً تتلزق", () => {
    expect(parseNumberGroup(["12", "34"]).digits).toBe("1234");
    expect(parseNumberGroup(["1234"]).digits).toBe("1234");
  });

  it("كل الكلمات وحدات = تسلسل مش مركّب (خمسة واتنين = 52 مش 7)", () => {
    const r = parseNumberGroup(["خمسة", "و", "اتنين"]);
    expect(r.digits).toBe("52");
    expect(r.mode).toBe("sequence");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 أرقام Deepgram بصيغة عشرية — «٦.٨» بدل «ستة ثمانية»
 * ══════════════════════════════════════════════════════════════════════
 *
 *  من جلسة المالك ١٨ أغسطس، سجل «اللي المحرك سمعه»:
 *      «راح عين ع ٦.٨ اربعة»     ⇐ المنطوق: ر ع ع ستة خمسة ثمانية أربعة
 *      «الف س ص1.511»            ⇐ المنطوق: ا س ص واحد خمسة واحد واحد
 *      «حاء ياء كاف 5371»
 *      «ب س هاء9796»
 *
 *  Deepgram بـ‎numerals: true‎ بيلزّق الأرقام وساعات بيحطّ نقطة عشرية.
 *  والمحلّل شرطه ‎/^\d+$/‎ — فأي رقم فيه نقطة **بيتشال بالسكوت** وخاناته
 *  تضيع. و«رعع6584» ضاعت بالظبط كده (والخمسة ضاعت من Deepgram أصلاً).
 *
 *  ⚠️ والقاعدة هنا مش «شيل النقطة وخلاص»: «١.٥» في لوحة معناها خانتين
 *  (١ و٥)، مش واحد وخمسة من عشرة. اللوحات مافيهاش كسور.
 */
describe("أرقام بصيغة عشرية من Deepgram", () => {
  it("«٦.٨» = خانتين ٦ و٨ مش كسر", () => {
    expect(parseNumberGroup(["6.8"]).digits).toBe("68");
    expect(parseNumberGroup(["٦.٨"]).digits).toBe("68");
  });

  it("مثال حقيقي: «٦.٨ اربعة» ⇒ ٦٨٤", () => {
    expect(parseNumberGroup(["6.8", "اربعة"]).digits).toBe("684");
  });

  it("مثال حقيقي: «1.511» ⇒ ١٥١١", () => {
    expect(parseNumberGroup(["1.511"]).digits).toBe("1511");
  });

  it("الأرقام الملزوقة العادية ماتتأثرش", () => {
    expect(parseNumberGroup(["5371"]).digits).toBe("5371");
    expect(parseNumberGroup(["9796"]).digits).toBe("9796");
    expect(parseNumberGroup(["83", "6", "أربعة"]).digits).toBe("8364");
  });

  it("مايفهمش أي كلام فيه نقطة كأنه رقم", () => {
    expect(isNumberWord("6.8")).toBe(true);
    expect(isNumberWord("حاء.سين")).toBe(false);
    expect(isNumberWord("...")).toBe(false);
  });
});

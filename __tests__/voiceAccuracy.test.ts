/**
 * voiceAccuracy — اختبارات دقة التفريغ الصوتي (المرحلة ١أ)
 * مبنية على حالات حقيقية من اختبار صوت فيديو المنافس على محركاتنا.
 * الهدف: (١) وقف الحشو الصامت بالأصفار، (٢) أرقام «عشر عشرين»=1020
 * و«تلات خمسات»=555، (٣) صيغ حروف آمنة إضافية.
 */
import { describe, it, expect } from "vitest";
import { extractMultiplePlates } from "@/lib/plateParser";

describe("voiceAccuracy — نطق «زيري» للصفر (من قياس Deepgram الحقيقي)", () => {
  it("«زيري» تُعامَل كصفر (Deepgram بيطلّعها بدل صفر أحياناً)", () => {
    // حالة حقيقية: احد0250 اتفرّغت «الف حاء دال زيرو اتنين خمسة زيري»
    const plates = extractMultiplePlates("الف حاء دال زيرو اتنين خمسة زيري");
    expect(plates.length).toBeGreaterThan(0);
    expect(plates[0].normalized).toBe("احد0250");
  });
});

describe("voiceAccuracy — وقف الحشو الصامت بالأصفار", () => {
  it("لوحة بأقل من ٤ أرقام تتعلّم كـ«ناقصة» (uncertain) مش تتقدّم كأنها صح", () => {
    // المحرك سمع رقمين بس من الأربعة → مايصحّش نعرضها كلوحة مؤكّدة «دمك0056»
    const res = extractMultiplePlates("دال ميم كاف خمسة ستة");
    expect(res).toHaveLength(1);
    expect(res[0].uncertain).toBe(true);
  });

  it("لوحة كاملة بـ٤ أرقام تفضل مؤكّدة (مش uncertain)", () => {
    const res = extractMultiplePlates("دال ميم كاف خمسة ستة خمسة واحد");
    expect(res).toHaveLength(1);
    expect(res[0].plate).toBe("دمك5651");
    expect(res[0].uncertain).toBeFalsy();
  });
});

describe("voiceAccuracy — أرقام مركّبة/ملخّصة", () => {
  it("«عشرة عشرين» = 1020 (النطق الصحيح بالتاء)", () => {
    const res = extractMultiplePlates("دال دال نون عشرة عشرين");
    expect(res[0].plate).toBe("ددن1020");
  });

  // «عشر» المفردة اتشالت (كانت بتفسد الملاحظات). صيغة «عشر عشرين» ناقصة التاء
  // مابقتش تتحوّل تلقائياً — تتعلّم ⚠️ناقصة للمراجعة بدل ما تتخبّى غلط.
  it("«عشر عشرين» (تاء ناقصة) تتعلّم ناقصة مش تتحوّل بالغلط", () => {
    const res = extractMultiplePlates("دال دال نون عشر عشرين");
    expect(res[0].uncertain).toBe(true);
  });

  it("«تلات خمسات واحد» = 5551 (Whisper بيلخّص المكرر)", () => {
    const res = extractMultiplePlates("راء راء نون تلات خمسات واحد");
    expect(res[0].plate).toBe("ررن5551");
  });

  it("«تلات خمسات ستة» = 5556", () => {
    const res = extractMultiplePlates("راء راء نون تلات خمسات ستة");
    expect(res[0].plate).toBe("ررن5556");
  });

  it("العشرات العامّية بالهاء: «خمسه عشر سته عشر» = 1516", () => {
    expect(extractMultiplePlates("دال دال نون خمسه عشر سته عشر")[0].plate).toBe("ددن1516");
    expect(extractMultiplePlates("دال دال نون اربعه عشر خمسه عشر")[0].plate).toBe("ددن1415");
  });

  // حراسة: مايكسرش الأرقام القديمة
  it("«عشرين» لوحدها فاضلة 20 و«عشرة» فاضلة 10", () => {
    expect(extractMultiplePlates("دال دال نون عشرين تلاتين")[0].plate).toBe("ددن2030");
    expect(extractMultiplePlates("دال دال نون عشرة عشرين")[0].plate).toBe("ددن1020");
  });
});

// حراسة ضد باجات المراجعة العدائية: كلمات شائعة في الملاحظات مايتحوّلوش لحرف/رقم
describe("voiceAccuracy — حماية الملاحظات من التلوث", () => {
  it("«العين» في ملاحظة مابتتحوّلش لحرف ع (مفيش لوحة وهمية)", () => {
    const res = extractMultiplePlates("دال حاء راء واحد اتنين تلاتة اربعة قدام العين");
    expect(res).toHaveLength(1);
    expect(res[0].plate).toBe("دحر1234");
  });

  it("«عشر عمارات» في ملاحظة مابتحقنش رقم وهمي", () => {
    const res = extractMultiplePlates("دال حاء راء واحد اتنين تلاتة اربعة بعد عشر عمارات");
    expect(res).toHaveLength(1);
    expect(res[0].plate).toBe("دحر1234");
  });
});

describe("voiceAccuracy — صيغ حروف آمنة (الـ + الاسم)", () => {
  it("«الراء الميم الكاف» = رمك", () => {
    const res = extractMultiplePlates("الراء الميم الكاف واحد اتنين تلاتة اربعة");
    expect(res[0].plate).toBe("رمك1234");
  });

  it("regression: ونيت لسه بتروح لعمود النوع", () => {
    const res = extractMultiplePlates("دال ميم كاف واحد اتنين تلاتة اربعة ونيت");
    expect(res[0].vehicleType).toBe("ونيت");
  });
});

import { describe, it, expect } from "vitest";
import { decodeSijilText, extractSijilFields, looksLikeSijilGlyphs } from "@/lib/sijilGlyphs";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📄 فك رموز شهايد «السجل السعودي»
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (١٤ أكتوبر ٢٠٢٦): شيت الشهايد طلع **٠ من ١٩٩** في نوع المركبة
 *  والمصنع واللون والمؤجر والمستأجر — واللوحة والهيكل ورقم العقد كاملين.
 *  كل اللي فضي كان عربي، وكل اللي اشتغل إنجليزي وأرقام.
 *
 *  السطور تحت **منسوخة حرفياً** من شهادة حقيقية بعتها المالك
 *  (`REPO-119-00280319.pdf`)، والنتيجة المتوقّعة من صورة نفس الشهادة.
 */

// اسم المؤجر: البنك الأهلي السعودي
const LESSOR = "ͷ͡͵̯̠̺͙ ́ Ͼ͙̽͋ Ͱ̼̗̺͙ :௛͖̻̺͙̚ Ͳ̠͙";
// اسم المستأجر: صفاء جوير جبري الخضيري
const TENANT = "ͷ௛௬̭̞̺͙ ͷ௛̗̚ ௛̗̀͵̚ ̵̢͓̓ :௛̔̚௪̠̻̺͙ Ͳ̠͙";
// المصنع: تويوتا … رقم اللوحة باللغة العربية: س أ ل 4285
const MAKE = "4285 ͱ ͕ ͥ :͂௬̗௛̯̺͙ ̲͂ Ͼ̺̗̓ ̜͂ ͵Ͼ̺͙ Ͳ̷̘ͣ̓ ͵̀͵̘ :̢̰̼̻̺͙";
// نوع المركبة: كورولا … رقم اللوحة باللغة الإنجليزية: 4285LAS
const MODEL = "4285LAS :͂̀௜௬Ͼ̼̚΀͙ ̲͂ Ͼ̺̗̓ ̜͂ ͵Ͼ̺͙ Ͳ̷ͣ͆ ͵ͣ͵̹ :̗̹͂௛̻̺͙ ͫ ͵̼ͨ";
// رقم الهيكل: RKLB… لون المركبة: ابيض
const COLOR = "௬̗͙ :̗̹͂௛̻̺͙ ͳ͵̺ RKLB30EEXS0030956 :ͱ̹௬̺͙̾ Ͳ̷ͣ ͚";

describe("🔴 العربي المرمّز بيترجع", () => {
  it("اسم المؤجر", () => {
    expect(decodeSijilText(LESSOR)).toContain("اسم المؤجر");
    expect(decodeSijilText(LESSOR)).toContain("البنك الأهلي السعودي");
  });

  it("اسم المستأجر", () => {
    const out = decodeSijilText(TENANT);
    expect(out).toContain("اسم المستأجر");
    expect(out).toContain("صفاء");
    expect(out).toContain("جبري");
    expect(out).toContain("الخضيري");
  });

  /**
   * الملف بيقطّع الكلمة أحياناً («تويو تا»)، فالقيمة بتتاخد بالعنوان مش
   * بالمسافات — `extractSijilFields` هي العقد الحقيقي مش شكل النص.
   */
  it("🔴 المصنع من العنوان مهما اتقطّعت الكلمة", () => {
    expect(extractSijilFields(decodeSijilText(MAKE)).make).toBe("تويوتا");
  });

  it("العناوين نفسها بتتقرا", () => {
    expect(decodeSijilText(MAKE)).toContain("المصنع");
    expect(decodeSijilText(MODEL)).toContain("المركبة");
    expect(decodeSijilText(COLOR)).toContain("لون المركبة");
  });
});

describe("🔒 اللي مش من «السجل» مايتلمسش", () => {
  it("شهادة «توثيق» (عربيها سليم) بترجع زي ما هي بالحرف", () => {
    const tawtheeq = "المصنع: تويوتا\nرقم اللوحة: ا ب ح 1234\nلون الأصل: ابيض\nاالسم: مصرف الراجحي";
    expect(decodeSijilText(tawtheeq)).toBe(tawtheeq);
    expect(looksLikeSijilGlyphs(tawtheeq)).toBe(false);
  });

  it("نص فاضي أو إنجليزي بس ⇒ زي ما هو", () => {
    expect(decodeSijilText("")).toBe("");
    expect(decodeSijilText("RKLB30EEXS0030956")).toBe("RKLB30EEXS0030956");
  });

  it("🔴 الأرقام والإنجليزي مابيتقلبوش", () => {
    expect(decodeSijilText(COLOR)).toContain("RKLB30EEXS0030956");
    expect(decodeSijilText(MODEL)).toContain("4285LAS");
  });
});

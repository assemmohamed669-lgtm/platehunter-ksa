import { describe, it, expect } from "vitest";
import { speechmaticsTranscript } from "@/lib/speechmaticsRT";

/**
 * Speechmatics بيحوّل الأرقام المنطوقة لصيغة رقمية (ITN)، وفي العربي (RTL) بيعكس
 * ترتيبها: المندوب يقول ٢٥٧٨ فيطلع "87 5 2" (معكوس!). ده أكبر قاتل للدقة.
 *
 * الحل: لمّا نفعّل enable_entities، كل رقم بيرجع كـ entity فيه:
 *   - alternatives[0].content = الصيغة الرقمية المنسّقة (المعكوسة) ← بنتجاهلها
 *   - spoken_form = الكلمات زي ما اتقالت بالترتيب الصح ← بنستخدمها
 * فبنبني النص من الكلمات المنطوقة → الترتيب صح + القاموس بتاعنا يشتغل عليها.
 */
describe("speechmaticsTranscript — يفضّل صيغة النطق (spoken_form) على الأرقام المعكوسة", () => {
  it("رقم entity: يستخدم spoken_form (الكلمات) مش content (الرقم المنسّق المعكوس)", () => {
    const msg = {
      message: "AddTranscript",
      metadata: { transcript: "قاف كاف نون 87 5 2" }, // النص المنسّق = معكوس
      results: [
        { type: "word", alternatives: [{ content: "قاف" }] },
        { type: "word", alternatives: [{ content: "كاف" }] },
        { type: "word", alternatives: [{ content: "نون" }] },
        {
          type: "entity",
          entity_class: "number",
          alternatives: [{ content: "87" }], // معكوس — نتجاهله
          spoken_form: [
            { type: "word", alternatives: [{ content: "اثنين" }] },
            { type: "word", alternatives: [{ content: "خمسة" }] },
            { type: "word", alternatives: [{ content: "سبعة" }] },
            { type: "word", alternatives: [{ content: "ثمانية" }] },
          ],
        },
      ],
    };
    // نبني من الكلمات: الحروف + الأرقام بالترتيب الصح
    expect(speechmaticsTranscript(msg)).toBe("قاف كاف نون اثنين خمسة سبعة ثمانية");
  });

  it("أرقام مركّبة تفضل كلمات (عشان القاموس يحوّلها): «ثلاث ستات»", () => {
    const msg = {
      message: "AddTranscript",
      metadata: { transcript: "حاء دال كاف 666" },
      results: [
        { type: "word", alternatives: [{ content: "حاء" }] },
        { type: "word", alternatives: [{ content: "دال" }] },
        { type: "word", alternatives: [{ content: "كاف" }] },
        {
          type: "entity",
          entity_class: "number",
          alternatives: [{ content: "666" }],
          spoken_form: [
            { type: "word", alternatives: [{ content: "ثلاث" }] },
            { type: "word", alternatives: [{ content: "ستات" }] },
          ],
        },
      ],
    };
    expect(speechmaticsTranscript(msg)).toBe("حاء دال كاف ثلاث ستات");
  });

  it("بدون entities: يبني من content زي ما هو (توافق رجعي)", () => {
    const msg = {
      message: "AddTranscript",
      metadata: { transcript: "دال سين كاف" },
      results: [
        { type: "word", alternatives: [{ content: "دال" }] },
        { type: "word", alternatives: [{ content: "سين" }] },
        { type: "word", alternatives: [{ content: "كاف" }] },
      ],
    };
    expect(speechmaticsTranscript(msg)).toBe("دال سين كاف");
  });

  it("مفيش results: يرجع لـ metadata.transcript (توافق رجعي)", () => {
    expect(speechmaticsTranscript({ metadata: { transcript: "قاف نون نون" } })).toBe("قاف نون نون");
  });

  it("entity من غير spoken_form: يستخدم content عادي", () => {
    const msg = {
      results: [
        { type: "word", alternatives: [{ content: "ميم" }] },
        { type: "entity", alternatives: [{ content: "2109" }] }, // مفيش spoken_form
      ],
    };
    expect(speechmaticsTranscript(msg)).toBe("ميم 2109");
  });

  it("فاضي يرجع نص فاضي", () => {
    expect(speechmaticsTranscript({})).toBe("");
    expect(speechmaticsTranscript(null)).toBe("");
  });
});

/**
 * مفتاح Groq بيتحل على السيرفر: مفتاح المندوب لو باعته، وإلا مفتاح الشركة.
 *
 * السياق: مناديب كتير معملوش مفاتيح Groq، فصوت التسجيل كان بيقف عندهم — كان
 * الراوت بيرفض الطلب لو مافيش مفتاح من العميل، بدون ما يرجع لمفتاح السيرفر
 * (بخلاف read-plate و structure-plates و reanalyze اللي بيرجعوا له).
 *
 * المفتاح **مايوصلش جهاز المندوب** أبداً — Groq بيتنده من السيرفر بس، بخلاف
 * Deepgram اللي المتصفح بيفتح عليه WebSocket بنفسه.
 */
import { describe, it, expect } from "vitest";
import { resolveGroqKey } from "@/lib/groqKey";

describe("resolveGroqKey", () => {
  it("بيفضّل مفتاح المندوب لما يبعته", () => {
    // كده الحدود تفضل موزّعة على المناديب اللي عندهم مفاتيح.
    expect(resolveGroqKey("gsk_agent", "gsk_server")).toBe("gsk_agent");
  });

  it("بيرجع لمفتاح الشركة لما المندوب مايبعتش مفتاح", () => {
    expect(resolveGroqKey(undefined, "gsk_server")).toBe("gsk_server");
    expect(resolveGroqKey(null, "gsk_server")).toBe("gsk_server");
    expect(resolveGroqKey("", "gsk_server")).toBe("gsk_server");
  });

  it("بيعتبر المفتاح الفاضي (مسافات) كأنه مش موجود", () => {
    // خانة فاضية في صفحة المفاتيح مالازمش تمنع الشغل.
    expect(resolveGroqKey("   ", "gsk_server")).toBe("gsk_server");
  });

  it("بيتجاهل أي نوع غير نص", () => {
    expect(resolveGroqKey(123, "gsk_server")).toBe("gsk_server");
    expect(resolveGroqKey({ key: "x" }, "gsk_server")).toBe("gsk_server");
  });

  it("بيشذّب الفراغات من مفتاح المندوب", () => {
    // لزقة من الموبايل بتجيب مسافة أو سطر جديد ورا المفتاح.
    expect(resolveGroqKey("  gsk_agent\n", "gsk_server")).toBe("gsk_agent");
  });

  it("بيرجّع فاضي لما مافيش أي مفتاح — الراوت يرد بخطأ واضح", () => {
    expect(resolveGroqKey(undefined, undefined)).toBe("");
    expect(resolveGroqKey("", "")).toBe("");
    expect(resolveGroqKey("  ", "   ")).toBe("");
  });
});

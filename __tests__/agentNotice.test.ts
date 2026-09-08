import { describe, it, expect } from "vitest";
import { normalizeAgentNotice, AGENT_NOTICE_MAX } from "@/lib/agentNotice";

/**
 * رسالة خاصة لمندوب واحد: الأدمن بيكتبها من صفحة المندوب، وتظهر عنده هو
 * **لوحده** بالأحمر لحد ما الأدمن يشيلها.
 *
 * المنطق الوحيد اللي فيه احتمال زلل هو تطبيع النص قبل الحفظ: الفاضي لازم
 * يتحوّل لـ`null` (يعني «مافيش رسالة») مش لنص فاضي — وإلا البانر بيظهر عند
 * المندوب فاضي ومايعرفش يقفله، وهو مالوش زر إخفاء أصلاً.
 */
describe("normalizeAgentNotice — تطبيع الرسالة قبل الحفظ", () => {
  it("النص العادي بيتحفظ زي ما هو (بلا فراغات أطراف)", () => {
    expect(normalizeAgentNotice("  كلّمني ضروري  ")).toBe("كلّمني ضروري");
  });

  it("🔴 الفاضي = مسح الرسالة (null مش نص فاضي)", () => {
    expect(normalizeAgentNotice("")).toBeNull();
    expect(normalizeAgentNotice("   ")).toBeNull();
    expect(normalizeAgentNotice("\n\t ")).toBeNull();
  });

  it("null/undefined = مسح", () => {
    expect(normalizeAgentNotice(null)).toBeNull();
    expect(normalizeAgentNotice(undefined)).toBeNull();
  });

  it("قيمة مش نص بتترفض (مسح) بدل ما تتكتب زي ما هي", () => {
    expect(normalizeAgentNotice(123 as unknown as string)).toBeNull();
    expect(normalizeAgentNotice({} as unknown as string)).toBeNull();
  });

  it("بيقصّ الرسالة الطويلة عند الحد بدل ما يرفضها", () => {
    const long = "ا".repeat(AGENT_NOTICE_MAX + 500);
    const out = normalizeAgentNotice(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(AGENT_NOTICE_MAX);
  });

  it("بيسيب سطور الرسالة جوّه زي ما هي", () => {
    expect(normalizeAgentNotice("سطر\nسطر تاني")).toBe("سطر\nسطر تاني");
  });
});

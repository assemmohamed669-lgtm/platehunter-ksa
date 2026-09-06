import { describe, it, expect } from "vitest";
import { resolveNewAgentFlags } from "@/lib/adminFlags";

/**
 * المالك عايز يحدّد **وقت إنشاء المندوب** هو هيشتغل بصوت VoiceX ولا لأ، وباقي
 * صفحات البرنامج مفتوحة عنده ولا لأ — بدل ما ينشئه الأول وبعدين يفتح صفحته
 * ويظبّطهم.
 *
 * القواعد المحفوظة زي ما هي:
 *  • `voicex_enabled` افتراضي **false** (ديبجرام) — المالك بيفتحه بإيده.
 *  • `rest_pages_enabled` افتراضي **true** (كل الصفحات مفتوحة).
 *  • العلمان دول **للسوبر أدمن بس** (زي `manage-agent` بالظبط) — أدمن عادي
 *    بينشئ مندوب بياخد الافتراضي مهما بعت في الطلب.
 */
describe("resolveNewAgentFlags — علما المندوب الجديد", () => {
  const SUPER = { isSuper: true, role: "agent" as const };
  const ADMIN = { isSuper: false, role: "agent" as const };

  it("بلا اختيار → الافتراضي: صوت مقفول وباقي الصفحات مفتوحة", () => {
    expect(resolveNewAgentFlags({}, SUPER)).toEqual({
      voicex_enabled: false,
      rest_pages_enabled: true,
    });
  });

  it("السوبر أدمن يقدر يفتح الصوت وقت الإنشاء", () => {
    expect(resolveNewAgentFlags({ voicexEnabled: true }, SUPER)).toEqual({
      voicex_enabled: true,
      rest_pages_enabled: true,
    });
  });

  it("السوبر أدمن يقدر يقفل باقي الصفحات (مندوب صوت-فقط)", () => {
    expect(resolveNewAgentFlags({ voicexEnabled: true, restPagesEnabled: false }, SUPER)).toEqual({
      voicex_enabled: true,
      rest_pages_enabled: false,
    });
  });

  it("🔒 أدمن عادي بياخد الافتراضي مهما بعت — نفس قاعدة manage-agent", () => {
    expect(resolveNewAgentFlags({ voicexEnabled: true, restPagesEnabled: false }, ADMIN)).toEqual({
      voicex_enabled: false,
      rest_pages_enabled: true,
    });
  });

  it("الأدمن الجديد مالوش العلمين دول — بياخد الافتراضي", () => {
    expect(resolveNewAgentFlags(
      { voicexEnabled: true, restPagesEnabled: false },
      { isSuper: true, role: "admin" },
    )).toEqual({ voicex_enabled: false, rest_pages_enabled: true });
  });

  it("قيم مش boolean بتتجاهل (مابتتحوّلش ضمنياً)", () => {
    expect(resolveNewAgentFlags({ voicexEnabled: "yes", restPagesEnabled: 0 }, SUPER)).toEqual({
      voicex_enabled: false,
      rest_pages_enabled: true,
    });
  });

  it("false صريحة على الصوت = الافتراضي برضه", () => {
    expect(resolveNewAgentFlags({ voicexEnabled: false }, SUPER).voicex_enabled).toBe(false);
  });
});

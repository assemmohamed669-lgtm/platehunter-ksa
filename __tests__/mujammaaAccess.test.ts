/**
 * 🧮 مين يشوف المجمّع («التسجيل») — ١٨ أكتوبر ٢٠٢٦.
 *
 * المالك: «هيكون متاح مبدأيا ل اللي مشترك في كل خدمات البرنامج يظهر معاه تلقائي لكن اللي مشترك
 * صوت بس واللي مشترك فرز بس ميظهرش معاهم».
 *  · كل الخدمات = الصوت (`voiceTabVisible`: مفعّل + أيامه سارية) **و** باقي البرنامج
 *    (`rest_pages_enabled` مش مقفول + `rest_until` سارية) — نفس الشرطين اللي التطبيق بيقفل بيهم.
 *  · السوبر أدمن دايماً.
 */
import { describe, expect, it } from "vitest";
import { canUseMujammaa, hasAllServices, MUJAMMAA_FOR_DELEGATES } from "@/lib/mujammaaAccess";
import { canSeeTab, visibleTabs } from "@/lib/navTabs";

const FUTURE = "2999-12-31";
const PAST = "2000-01-01";
const all = { voicex_enabled: true, voicex_until: FUTURE, rest_pages_enabled: true, rest_until: FUTURE };

describe("hasAllServices / canUseMujammaa", () => {
  it("مشترك في كل الخدمات ⇒ يظهر — بس لما المالك يفتح (`MUJAMMAA_FOR_DELEGATES`)", () => {
    expect(hasAllServices(all)).toBe(true);
    expect(canUseMujammaa(all)).toBe(MUJAMMAA_FOR_DELEGATES);
  });

  it("⛔ مقفول على المناديب لحد ما المالك يقول (١٨ أكتوبر: «المهم متفتحش للمناديب دلوقتي»)", () => {
    expect(MUJAMMAA_FOR_DELEGATES).toBe(false);
    expect(canUseMujammaa(all)).toBe(false);
    expect(canUseMujammaa({ is_super: true })).toBe(true);
  });

  it("صوت بس ⇒ لأ (باقي البرنامج مقفول أو أيامه خلصت)", () => {
    expect(canUseMujammaa({ ...all, rest_pages_enabled: false })).toBe(false);
    expect(canUseMujammaa({ ...all, rest_until: PAST })).toBe(false);
  });

  it("فرز بس ⇒ لأ (الصوت مش مفعّل أو أيامه خلصت)", () => {
    expect(canUseMujammaa({ ...all, voicex_enabled: false })).toBe(false);
    expect(canUseMujammaa({ ...all, voicex_until: PAST })).toBe(false);
  });

  it("تواريخ فاضية = من غير حد (زي باقي التطبيق)", () => {
    expect(hasAllServices({ voicex_enabled: true, rest_pages_enabled: true })).toBe(true);
    expect(canUseMujammaa({ voicex_enabled: true, rest_pages_enabled: true })).toBe(MUJAMMAA_FOR_DELEGATES);
  });

  it("السوبر أدمن دايماً، والبروفايل المش معروف ⇒ لأ (مقفول لحد ما نتأكد)", () => {
    expect(canUseMujammaa({ is_super: true })).toBe(true);
    expect(canUseMujammaa({ is_super: true, voicex_enabled: false, rest_pages_enabled: false })).toBe(true);
    expect(canUseMujammaa(null)).toBe(false);
    expect(canUseMujammaa(undefined)).toBe(false);
  });
});

describe("تبويب «التسجيل» في الشريط — needsAll", () => {
  const TABS = [
    { href: "/instant-check", label: "التشييك" },
    { href: "/registration", label: "التسجيل", needsAll: true },
  ];
  it("بيظهر لكل الخدمات وللسوبر أدمن بس", () => {
    expect(canSeeTab(TABS[1], { isSuper: false, isAdmin: false, hasAll: true })).toBe(true);
    expect(canSeeTab(TABS[1], { isSuper: true, isAdmin: false })).toBe(true);
    expect(canSeeTab(TABS[1], { isSuper: false, isAdmin: false, hasAll: false })).toBe(false);
    // مش معروف لسه ⇒ مقفول (مايظهرش ويتشال قدامه)
    expect(canSeeTab(TABS[1], { isSuper: false, isAdmin: false })).toBe(false);
    expect(visibleTabs(TABS, { isSuper: false, isAdmin: false, hasAll: false }).map((t) => t.href)).toEqual(["/instant-check"]);
  });
});

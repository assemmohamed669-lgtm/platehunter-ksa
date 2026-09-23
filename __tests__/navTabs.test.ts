import { describe, it, expect } from "vitest";
import { canSeeTab, visibleTabs, type TabPerm } from "@/lib/navTabs";

const TABS: (TabPerm & { href: string; label: string })[] = [
  { href: "/sorting", label: "الفرز" },
  { href: "/instant-check", label: "التشييك" },
  { href: "/registration", label: "التسجيل", superOnly: true },
  { href: "/maps", label: "الخرائط" },
  { href: "/wanted", label: "المطلوب" },
  { href: "/data-upload", label: "رفع داتا", adminOnly: true },
];

const AGENT = { isSuper: false, isAdmin: false };
const ADMIN = { isSuper: false, isAdmin: true };
const SUPER = { isSuper: true, isAdmin: false };

describe("تبويبات الشريط السفلي", () => {
  it("المندوب بيشوف تبويباته الأربعة بس", () => {
    expect(visibleTabs(TABS, AGENT).map((t) => t.label))
      .toEqual(["الفرز", "التشييك", "الخرائط", "المطلوب"]);
  });

  it("المندوب مايشوفش «رفع داتا»", () => {
    expect(canSeeTab({ adminOnly: true }, AGENT)).toBe(false);
  });

  it("الأدمن بيشوف «رفع داتا»", () => {
    expect(visibleTabs(TABS, ADMIN).map((t) => t.label)).toContain("رفع داتا");
  });

  it("السوبر أدمن اللي مش أدمن مايشوفش «رفع داتا»", () => {
    const labels = visibleTabs(TABS, SUPER).map((t) => t.label);
    expect(labels).toContain("التسجيل");
    expect(labels).not.toContain("رفع داتا");
  });

  it("التبويبات العادية بتظهر للكل — مالمستهاش", () => {
    for (const p of [AGENT, ADMIN, SUPER]) {
      const labels = visibleTabs(TABS, p).map((t) => t.label);
      for (const t of ["الفرز", "التشييك", "الخرائط", "المطلوب"]) expect(labels).toContain(t);
    }
  });

  it("الترتيب مابيتغيّرش — المندوب اتعوّد على أماكن الأيقونات", () => {
    expect(visibleTabs(TABS, ADMIN).map((t) => t.label))
      .toEqual(["الفرز", "التشييك", "الخرائط", "المطلوب", "رفع داتا"]);
  });

  it("الأدمن السوبر بيشوف الستة", () => {
    expect(visibleTabs(TABS, { isSuper: true, isAdmin: true })).toHaveLength(6);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  تبويب «الجديد» — أدمن **أو** سوبر، مش أدمن بس
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «هنضيف صفحة زيادة تحت هنسميها الجديد وهنحط
 *  فيها الموديل اللي على ماليزيا».
 *
 *  🔴 **ليه علم جديد مش `adminOnly`:** الصفحة نفسها بتفتح بـ
 *  `canOpenTrialPage` = `role === "admin" || is_super === true`. و`adminOnly`
 *  بيتطلّب `isAdmin` **لوحده** — فسوبر أدمن مش رول-أدمن كان هيبقى عنده صفحة
 *  **مفتوحة ومالهاش تبويب**. التبويب لازم يطابق قفل الصفحة بالظبط، وإلا يا
 *  تبويب بيرمي برّه يا صفحة محدش يوصلها.
 */
describe("adminOrSuper — التبويب يطابق قفل الصفحة", () => {
  const tab = { href: "/registration-v2", label: "الجديد", adminOrSuper: true };

  it("الأدمن يشوفه", () => {
    expect(canSeeTab(tab, { isSuper: false, isAdmin: true })).toBe(true);
  });

  it("السوبر أدمن يشوفه حتى لو مش رول-أدمن", () => {
    expect(canSeeTab(tab, { isSuper: true, isAdmin: false })).toBe(true);
  });

  it("المندوب العادي مايشوفهوش", () => {
    expect(canSeeTab(tab, { isSuper: false, isAdmin: false })).toBe(false);
  });

  it("مابيأثرش على التبويبات العادية", () => {
    expect(canSeeTab({ href: "/sorting" }, { isSuper: false, isAdmin: false })).toBe(true);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  needsVoice — تبويب «الجديد» مربوط بخدمة الصوت زي «صوتي»
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «اللي مشترك كل خدمات البرنامج الصفحة تضاف
 *  معاه تحت ويشوفها… الصفحة تتقفل فقط على اللي مش مشترك معانا في خدمة
 *  الصوت».
 *
 *  ⇒ مالوش علاقة بالرول. بيظهر **لأي حد عنده صوت** (`hasVoice` محسوبة
 *    بـ`voiceTabVisible` — نفس دالة «صوتي»)، وبيختفي عند اللي مالوش.
 */
describe("needsVoice — الصوت بس هو اللي بيحكم", () => {
  const tab = { href: "/registration-v2", label: "الجديد", needsVoice: true };

  it("🔴 عنده صوت ⇒ يشوفه، مهما كان رولّه", () => {
    expect(canSeeTab(tab, { isSuper: false, isAdmin: false, hasVoice: true })).toBe(true);
  });

  it("🔴 مالوش صوت ⇒ مايشوفهوش — حتى لو أدمن", () => {
    expect(canSeeTab(tab, { isSuper: false, isAdmin: true, hasVoice: false })).toBe(false);
    expect(canSeeTab(tab, { isSuper: false, isAdmin: false, hasVoice: false })).toBe(false);
  });

  it("⚠️ الصوت مش معروف (مثلاً القراءة لسه ماخلصتش) ⇒ مخفي — الفشل بيقفل", () => {
    expect(canSeeTab(tab, { isSuper: false, isAdmin: false })).toBe(false);
  });

  it("مابيأثرش على التبويبات التانية", () => {
    expect(canSeeTab({ href: "/sorting" }, { isSuper: false, isAdmin: false, hasVoice: false })).toBe(true);
  });
});

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

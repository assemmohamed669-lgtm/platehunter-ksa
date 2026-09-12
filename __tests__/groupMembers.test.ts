import { describe, it, expect } from "vitest";
import { GROUP_ELIGIBLE_ROLES, canJoinGroup, memberBadge, membersLabel } from "@/lib/groupMembers";

// صفحة المجموعات كانت بتجيب role = 'agent' بس، فالأدمنز مايظهروش في القوايم
// ومكانش ينفع يتحطوا في مجموعة. والباك إند بيدعمهم أصلاً: setTeam مافيهوش فلتر
// دور، و my_team_members() بترجّع أي حد team بتاعه مطابق بغض النظر عن الدور.
describe("مين ينفع يتحط في مجموعة", () => {
  it("🐞 الأدمن ينفع — ده اللي كان ناقص", () => {
    expect(canJoinGroup("admin")).toBe(true);
    expect(GROUP_ELIGIBLE_ROLES).toContain("admin");
  });

  it("المندوب ينفع زي ما كان", () => {
    expect(canJoinGroup("agent")).toBe(true);
  });

  it("أي دور تاني أو فاضي مايتحطّش", () => {
    expect(canJoinGroup("viewer")).toBe(false);
    expect(canJoinGroup(null)).toBe(false);
    expect(canJoinGroup(undefined)).toBe(false);
    expect(canJoinGroup("")).toBe(false);
  });
});

// لازم يبان إن ده أدمن مش مندوب — من غير كده السوبر أدمن ممكن يضيف واحد
// وهو فاكره حد تاني، والاسم لوحده مش كفاية للتفرقة.
describe("علامة الأدمن في القايمة", () => {
  it("الأدمن عليه علامة", () => {
    expect(memberBadge("admin")).toBe("أدمن");
  });

  it("المندوب من غير علامة — ده الوضع الطبيعي", () => {
    expect(memberBadge("agent")).toBeNull();
    expect(memberBadge(null)).toBeNull();
  });
});

// العدّاد كان مكتوب «كذا مندوب» — بقى غلط لما المجموعة تبقى فيها أدمن.
describe("عدّاد أعضاء المجموعة", () => {
  const mk = (role: string) => ({ role });

  it("كلهم مناديب → «مناديب» زي الأول", () => {
    expect(membersLabel([mk("agent"), mk("agent"), mk("agent")])).toBe("٣ مناديب");
  });

  it("🐞 فيه أدمن → بيوضّح التقسيم", () => {
    expect(membersLabel([mk("agent"), mk("agent"), mk("admin")])).toBe("٣ أعضاء · فيهم ١ أدمن");
  });

  it("أكتر من أدمن", () => {
    expect(membersLabel([mk("agent"), mk("admin"), mk("admin")])).toBe("٣ أعضاء · فيهم ٢ أدمن");
  });

  it("مندوب واحد", () => {
    expect(membersLabel([mk("agent")])).toBe("١ مندوب");
  });

  it("مجموعة فاضية ماتكسرش", () => {
    expect(membersLabel([])).toBe("٠ مناديب");
  });
});

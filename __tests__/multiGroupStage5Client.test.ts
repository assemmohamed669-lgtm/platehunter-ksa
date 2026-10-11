import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchMyGroupsNames } from "@/lib/groupNames";

/**
 * 👥 الفرز على المجموعتين + «ضيفه كمان» في «إنشئ مجموعة جديدة» — المالك (١١ أكتوبر ٢٠٢٦): «عايزة لما ييجي يفرز
 * الفرز يتطبق معاه للمجموعتين» + صورة الشاشة اللي كانت بتقول «هينتقل» لمحمد عفيفي.
 */
const fake = (res: Record<string, { data: unknown; error: unknown }>) => ({
  rpc: async (fn: string) => res[fn] ?? { data: null, error: { message: "missing" } },
});

describe("🔴 أسامي أعضاء كل مجموعاتي", () => {
  it("🔴 من الدالة الجديدة (المجموعتين)", async () => {
    const names = await fetchMyGroupsNames(fake({
      my_groups_members: { data: [{ id: "a", username: "أحمد" }, { id: "b", username: "محمد" }], error: null },
    }));
    expect(names).toEqual({ a: "أحمد", b: "محمد" });
  });
  it("الدالة لسه ماتشغّلتش ⇒ أعضاء مجموعتي الحالية زي الأول", async () => {
    const names = await fetchMyGroupsNames(fake({ my_team_members: { data: [{ id: "a", username: "أحمد" }], error: null } }));
    expect(names).toEqual({ a: "أحمد" });
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 الفرز والفرز على سجلات المجموعة وفرز «صوت فقط» بياخدوا أسامي المجموعتين", () => {
    expect(read("app/(app)/sorting/page.tsx")).toMatch(/groupNamesRef\.current = await fetchMyGroupsNames\(supabase\);/);
    expect(read("app/(app)/group-sort/page.tsx")).toMatch(/setNames\(await fetchMyGroupsNames\(supabase\)\);/);
    expect(read("components/VoiceOnlySort.tsx")).toMatch(/const names = await fetchMyGroupsNames\(supabase\);/);
  });
  it("🔴 «إنشئ مجموعة جديدة»: «انقله / ضيفه كمان» للي في مجموعة تانية", () => {
    const pg = read("app/admin/groups/page.tsx");
    expect(pg).toMatch(/onClick=\{\(\) => pick\("move"\)\}/);
    expect(pg).toMatch(/onClick=\{\(\) => pick\("also"\)\}/);
    expect(pg).toMatch(/if \(also\.length\) await setTeamFor\(also, name, "addTeam"\);/);
    expect(pg).toMatch(/هيفضل في مجموعته كمان/);
  });
});

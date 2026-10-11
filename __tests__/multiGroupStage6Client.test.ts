import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { withoutHiddenTeams } from "@/lib/activeTeam";

/** 👥 إصلاح الـtimeout على الجهاز وفي «سجلات المجموعة» (سطر «سجلاتك القديمة تبع مجموعة كذا» بدل ختم كل سجل). */
describe("🔴 سجلاتي القديمة تبع مجموعة مستخبية ⇒ تستخبى", () => {
  const rows = [{ id: "قديم" }, { id: "أ", team: "أ" }, { id: "ب", team: "ب" }];
  it("🔴 القديمة (من غير ختم) بتستخبى لو مجموعتها مستخبية", () => {
    expect(withoutHiddenTeams(rows, new Set(["أ"]), true).map((r) => r.id)).toEqual(["ب"]);
  });
  it("مجموعتها مش مستخبية ⇒ القديمة ظاهرة", () => {
    expect(withoutHiddenTeams(rows, new Set(["أ"]), false).map((r) => r.id)).toEqual(["قديم", "ب"]);
  });
  it("مفيش حاجة مستخبية (كل المناديب دلوقتي) ⇒ زي الأول بالحرف", () => {
    expect(withoutHiddenTeams(rows, new Set(), false)).toBe(rows);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 «سجلات المجموعة»: الفلتر بكل اللي ليهم شغل فيها (حتى اللي مشيوا)", () => {
    const g = read("components/GroupRecordsView.tsx");
    expect(g).toMatch(/scopeIdsRef\.current = list\.map\(\(m\) => m\.id\);/);
    expect(g).toMatch(/const ids = scopeIdsRef\.current\.length \? scopeIdsRef\.current : memberIdsRef\.current;/);
  });
  it("🔴 الجهاز بيعرف سجلاته القديمة تبع أنهي مجموعة", () => {
    const c = read("lib/groupLocksClient.ts");
    expect(c).toMatch(/from\("agent_legacy_team"\)\.select\("team"\)\.eq\("agent_id", uid\)\.maybeSingle\(\)/);
    expect(c).toMatch(/saveHideLegacyRecords\(!!legacyTeam && hidden\.includes\(legacyTeam\)\);/);
  });
});

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { saveFieldCheckEntries, getAllFieldCheckEntries, getPendingFieldChecks, type FieldCheckEntry } from "@/lib/idb";
import { saveHiddenRecordTeams, loadHiddenRecordTeams, withoutHiddenTeams } from "@/lib/activeTeam";

/**
 * 👥 مندوب في أكتر من مجموعة — المرحلة ٤ على الجهاز وفي صفحة المجموعات.
 * المالك: «لو مقفوله عنه السجلات دي متروحش معاه ابدا» + «ضيفه كمان» من غير ما يتشال من مجموعته.
 */
const entry = (id: string, team?: string): FieldCheckEntry => ({
  id, plate: `ابح${id}`, row: {}, method: "يدوي", checkedAt: new Date().toISOString(), ...(team ? { team } : {}),
});

describe("🔴 السجلات المختومة بمجموعة مستخبية مابتظهرش", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });

  it("🔴 بتختفي من العرض — والقديمة (من غير ختم) وبتاعة المجموعات التانية زي ما هي", async () => {
    await saveFieldCheckEntries([entry("h1", "أ"), entry("h2", "ب"), entry("h3")]);
    saveHiddenRecordTeams(["أ"]);
    const ids = (await getAllFieldCheckEntries()).map((e) => e.id).filter((x) => x.startsWith("h")).sort();
    expect(ids).toEqual(["h2", "h3"]);
  });
  it("🔴 مابتتمسحش — لسه على الجهاز (والرفع المعلّق بيشوفها)", async () => {
    await saveFieldCheckEntries([{ ...entry("p1", "أ"), synced: false }]);
    saveHiddenRecordTeams(["أ"]);
    expect((await getPendingFieldChecks()).some((e) => e.id === "p1")).toBe(true);
    saveHiddenRecordTeams([]);
    expect((await getAllFieldCheckEntries()).some((e) => e.id === "p1")).toBe(true);
  });
  it("مفيش مستخبي (كل المناديب دلوقتي) ⇒ زي الأول بالحرف", () => {
    const rows = [{ team: "أ" }, {}, { team: "ب" }];
    expect(withoutHiddenTeams(rows, new Set())).toBe(rows);
    expect(loadHiddenRecordTeams().size).toBe(0);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 صفحة المجموعات: «انقله» / «ضيفه كمان»، والشيل من المجموعة دي بس", () => {
    const pg = read("app/admin/groups/page.tsx");
    expect(pg).toMatch(/onClick=\{\(\) => add\("move"\)\}/);
    expect(pg).toMatch(/onClick=\{\(\) => add\("also"\)\}/);
    expect(pg).toMatch(/if \(also\.length\) await setTeamFor\(also, openGroup, "addTeam"\);/);
    expect(pg).toMatch(/if \(memberships\) await setTeamFor\(removed, openGroup, "removeTeam"\);/);
    expect(pg).toMatch(/مش عضو في المجموعة دي دلوقتي/);
  });
  it("🔴 السيرفر: الإجراءين الجداد + العضويات للصفحة", () => {
    const r = read("app/api/admin/manage-agent/route.ts");
    expect(r).toMatch(/case "addTeam":\n\s+case "removeTeam": \{/);
    expect(r).toMatch(/action === "addTeam" \? "add_agent_to_team" : "remove_agent_from_team"/);
    // قبل تشغيل الملف: الشيل بيرجع للطريقة القديمة
    expect(r).toMatch(/if \(missing && action === "removeTeam"\)/);
    expect(read("app/api/admin/group-settings/route.ts")).toMatch(/memberships: tm\.error \? null : \(tm\.data \?\? \[\]\)/);
  });
  it("🔴 المستخبي بيتحسب من السيرفر مع أقفال المجموعة", () => {
    const c = read("lib/groupLocksClient.ts");
    expect(c).toMatch(/from\("agent_hidden_record_teams"\)\.select\("team"\)\.eq\("agent_id", uid\)/);
    expect(c).toMatch(/await refreshHiddenRecordTeams\(supabase, uid, p\);/);
    const idb = read("lib/idb.ts");
    expect(idb).toMatch(/return withoutHiddenTeams\(await getAllFieldCheckEntriesRaw\(agentId\)\);/);
    // 🔴 الرفع بيقرا الكل — المستخبي عن العرض لازم يوصل للسيرفر (للمسئول)
    expect(idb).toMatch(/const all = await getAllFieldCheckEntriesRaw\(agentId\);/);
    expect(read("lib/syncFieldCheck.ts")).toMatch(/const all = await getAllFieldCheckEntriesRaw\(uid\);/);
  });
});

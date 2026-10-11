import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));
import { readFileSync } from "node:fs";
import path from "node:path";
import { saveFieldCheckEntry, getAllFieldCheckEntries, type FieldCheckEntry } from "@/lib/idb";
import { saveActiveTeam, loadActiveTeam } from "@/lib/activeTeam";
import { splitByTeam } from "@/lib/syncFieldCheck";
import { checkSlotFor } from "@/lib/activeTeamSwitch";

/**
 * 👥 مندوب في أكتر من مجموعة — المرحلة ٣ على الجهاز. المالك: «كل مجموعه خاصه بيها شغلها ومش عايز لخبطه».
 * السجل بيتختم بالمجموعة اللي شغّال لها **وقت التشييك** (مش وقت الرفع)، والتعديل مابيغيّرش ختمه.
 */
const entry = (id: string, extra: Partial<FieldCheckEntry> = {}): FieldCheckEntry => ({
  id, plate: "ابح1234", row: {}, method: "يدوي", checkedAt: new Date().toISOString(), ...extra,
});
const byId = async (id: string) => (await getAllFieldCheckEntries()).find((e) => e.id === id);

describe("🔴 ختم السجل بالمجموعة وقت التشييك", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });

  it("🔴 سجل جديد ⇒ المجموعة اللي شغّال لها", async () => {
    saveActiveTeam("أ");
    await saveFieldCheckEntry(entry("n1"));
    expect((await byId("n1"))?.team).toBe("أ");
  });
  it("🔴 تعديل سجل بعد ما قلب لمجموعة تانية ⇒ ختمه مابيتغيّرش", async () => {
    saveActiveTeam("أ");
    await saveFieldCheckEntry(entry("n2"));
    saveActiveTeam("ب");
    await saveFieldCheckEntry({ ...entry("n2"), plate: "ابح9999" });   // تعديل من غير team
    const e = await byId("n2");
    expect(e?.plate).toBe("ابح9999");
    expect(e?.team).toBe("أ");
  });
  it("سجل جاي بمجموعته (من السيرفر) بيفضل زي ما هو", async () => {
    saveActiveTeam("ب");
    await saveFieldCheckEntry(entry("n3", { team: "أ" }));
    expect((await byId("n3"))?.team).toBe("أ");
  });
  it("من غير مجموعة ⇒ من غير ختم (السيرفر بيقرّر)", async () => {
    saveActiveTeam(null);
    expect(loadActiveTeam()).toBeNull();
    await saveFieldCheckEntry(entry("n4"));
    expect((await byId("n4"))?.team).toBeUndefined();
  });
  it("سجل قديم موجود من غير ختم ⇒ مابيتختمش وقت التعديل", async () => {
    saveActiveTeam(null);
    await saveFieldCheckEntry(entry("n5"));
    saveActiveTeam("ب");
    await saveFieldCheckEntry({ ...entry("n5"), plate: "ابح1111" });
    expect((await byId("n5"))?.team).toBeUndefined();
  });
});

describe("🔴 الرفع على دفعات", () => {
  it("🔴 اللي ليه مجموعة واللي من غيرها في طلبين (السيرفر بيرفض دفعة مخلوطة)", () => {
    const parts = splitByTeam([{ id: "1" }, { id: "2", team: "أ" }, { id: "3" }, { id: "4", team: "ب" }]);
    expect(parts.map((p) => p.map((x) => x.id))).toEqual([["1", "3"], ["2", "4"]]);
    expect(splitByTeam([{ id: "1" }])).toHaveLength(1);
    expect(splitByTeam([])).toHaveLength(0);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 الرفع بيبعت المجموعة بس لو معروفة، والاسترجاع بيرجّعها", () => {
    const s = read("lib/syncFieldCheck.ts");
    expect(s).toMatch(/\.\.\.\(e\.team \? \{ team: e\.team \} : \{\}\)/);
    expect(s).toMatch(/const \{ error, status \} = await upsertChunk\(uid, chunk\);/);
    expect(s).toMatch(/typeof r\.team === "string" && r\.team \? \{ team: r\.team \} : \{\}/);
  });
  it("🔴 الإشعار جوّه البرنامج: قناة لكل مجموعة أنا عضو فيها", () => {
    const n = read("components/GroupFindNotifier.tsx");
    expect(n).toMatch(/from\("team_members"\)\.select\("team"\)\.eq\("agent_id", uid\)/);
    expect(n).toMatch(/for \(const t of teams\)/);
    expect(n).toMatch(/multiTeam && notif\.team/);
  });
  it("🔴 السيرفر: النقل بالدالة (والقديم لو لسه ماتشغّلتش) + الإشعارات من جدول العضوية", () => {
    expect(read("app/api/admin/manage-agent/route.ts")).toMatch(/rpc\("move_agent_team", \{ p_agent: agentId, p_team: team \}\)/);
    expect(read("app/api/group-push/route.ts")).toMatch(/from\("team_members"\)\.select\("agent_id"\)\.eq\("team", team\)/);
    expect(read("app/api/admin/push/route.ts")).toMatch(/from\("team_members"\)\.select\("agent_id"\)\.eq\("team", team\)/);
  });
  it("🔴 «شغّال لـ» بيظهر بس للي في أكتر من مجموعة", () => {
    const sw = read("components/ActiveTeamSwitcher.tsx");
    expect(sw).toMatch(/if \(teams\.length < 2\) return null;/);
    expect(read("components/AppMenu.tsx")).toMatch(/<ActiveTeamSwitcher \/>/);
    expect(checkSlotFor("أ")).toBe("check@أ");
  });
});

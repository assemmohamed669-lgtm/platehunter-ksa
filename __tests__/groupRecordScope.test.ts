import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { teamScopeFilter, authorLabel } from "@/lib/groupRecordScope";

/** 👥 سجلات المجموعة = المجموعة اللي شغّال لها بس (المالك ١١ أكتوبر ٢٠٢٦: «كل مجموعه خاصه بيها شغلها»). */
describe("🔴 فلتر سجلات المجموعة", () => {
  it("🔴 المختوم بالمجموعة + القديم من غير ختم لأعضائها", () => {
    expect(teamScopeFilter("أ", ["u1", "u2"])).toBe('team.eq."أ",and(team.is.null,agent_id.in.(u1,u2))');
  });
  it("أسامي فيها مسافات وعلامات بتتحط بين علامتين", () => {
    expect(teamScopeFilter('مجموعة "الشمال", ١', [])).toBe('team.eq."مجموعة \\"الشمال\\", ١"');
  });
  it("«سجلات فلان»: اللي مشي مكتوب جنبه", () => {
    expect(authorLabel({ username: "أحمد", is_member: true })).toBe("أحمد");
    expect(authorLabel({ username: "أحمد", is_member: false })).toBe("أحمد (خرج من المجموعة)");
  });
});

describe("🔴 التوصيل في صفحة سجلات المجموعة", () => {
  const s = readFileSync(path.resolve(__dirname, "../components/GroupRecordsView.tsx"), "utf8");
  it("🔴 بتستخدم الفلتر بدل «أعضاء دلوقتي بس» + «سجلات فلان»", () => {
    // الفلتر الجديد الأول، ولو السيرفر رفضه ⇒ الطريقة القديمة (الصفحة ماتقفش)
    expect(s).toMatch(/q = scoped \? q\.or\(teamScopeFilter\(teamRef\.current, ids\)\) : q\.in\("agent_id", ids\);/);
    expect(s).toMatch(/let \{ data, count, error \} = await build\(true\);/);
    expect(s).toMatch(/if \(error && gen === genRef\.current\) \(\{ data, count, error \} = await build\(false\)\);/);
    expect(s).toMatch(/rpc\("my_team_record_authors"\)/);
    expect(s).toMatch(/if \(authorRef\.current\) q = q\.eq\("agent_id", authorRef\.current\);/);
    // للمسئول والأدمن بس — العضو العادي مابيشوفش الفلتر
    expect(s).toMatch(/authors\.length > 1 && \(isLeader \|\| viewer\.role === "admin"\)/);
  });
});

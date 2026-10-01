import { describe, it, expect } from "vitest";
import {
  teamDataRole, teamDataOpenForMembers, canUseTeamFile,
  type TeamDataSettings,
} from "@/lib/teamData";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  👥 مفتاح المسئول: «شارك داتا المجموعة» — افتح/اقفل بإيده
 * ══════════════════════════════════════════════════════════════════════
 *  طلب المالك (١ أكتوبر ٢٠٢٦): «زر عند مسئول المجموعة — لو فتحه، الداتا اللي
 *  رافعها توصل لباقي الأعضاء. ولو قفله، الداتا تظهر **للمسئول فقط**. مكانه في
 *  صفحة الفرز تحت مربع رفع الداتا، ويظهر للمسئول بس.»
 *
 *  وقرار المالك: **الافتراضي مقفول** — المسئول يفتحه بإيده وقت ما يحب.
 *
 *  فيه مفتاحين مترتبين، والاتنين لازم يكونوا مفتوحين عشان العضو يشوف:
 *    ١) مفتاح المالك لكل مجموعة (`enabled`) — موجود من قبل، مابيتلمسش.
 *    ٢) مفتاح المسئول الجديد (`open`).
 *
 *  🔒 والمسئول **بيفضل شايف ملفه** في كل الأحوال — القفل بيمنع الأعضاء بس.
 */
const LEADER = "leader-1";
const MEMBER = "member-2";

const s = (over: Partial<TeamDataSettings> = {}): TeamDataSettings => ({
  leaderId: LEADER, enabled: true, open: true, ...over,
});

describe("الدور ما اتغيّرش", () => {
  it("المسئول مسئول، والعضو عضو، حتى والمفتاح مقفول", () => {
    expect(teamDataRole(s({ open: false }), LEADER)).toBe("leader");
    expect(teamDataRole(s({ open: false }), MEMBER)).toBe("member");
  });

  it("مفتاح المالك مقفول ⇒ مافيش حاجة لأي حد", () => {
    expect(teamDataRole(s({ enabled: false }), LEADER)).toBe("off");
    expect(teamDataRole(s({ enabled: false }), MEMBER)).toBe("off");
  });
});

describe("مفتاح المسئول", () => {
  it("مفتوح ⇒ الأعضاء يشوفوا", () => {
    expect(teamDataOpenForMembers(s({ open: true }))).toBe(true);
  });

  it("🔒 مقفول ⇒ الأعضاء مايشوفوش", () => {
    expect(teamDataOpenForMembers(s({ open: false }))).toBe(false);
  });

  it("🔒 الافتراضي مقفول — قرار المالك (قيمة ناقصة = مقفول)", () => {
    expect(teamDataOpenForMembers({ leaderId: LEADER, enabled: true })).toBe(false);
  });

  it("مفتاح المالك مقفول ⇒ مقفول مهما كان مفتاح المسئول", () => {
    expect(teamDataOpenForMembers(s({ enabled: false, open: true }))).toBe(false);
  });

  it("مافيش إعدادات خالص ⇒ مقفول", () => {
    expect(teamDataOpenForMembers(null)).toBe(false);
  });
});

describe("مين يقدر يستعمل الملف فعلاً", () => {
  it("🔒 المسئول شايف ملفه دايماً — القفل بيمنع الأعضاء بس", () => {
    expect(canUseTeamFile("leader", false)).toBe(true);
    expect(canUseTeamFile("leader", true)).toBe(true);
  });

  it("العضو: مفتوح أيوه، مقفول لأ", () => {
    expect(canUseTeamFile("member", true)).toBe(true);
    expect(canUseTeamFile("member", false)).toBe(false);
  });

  it("الميزة مقفولة من المالك ⇒ محدش", () => {
    expect(canUseTeamFile("off", true)).toBe(false);
    expect(canUseTeamFile("off", false)).toBe(false);
  });
});

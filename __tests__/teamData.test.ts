import { describe, it, expect } from "vitest";
import {
  teamDataRole, needsTeamDataRefresh, teamDataPath, TEAM_DATA_SLOT,
} from "@/lib/teamData";

/**
 * داتا المجموعة: المسئول يرفع ملف، والأعضاء **يفرزوا عليه بس** — مايفتحوهش ولا
 * يحمّلوه ولا يغيّروه ولا يمسحوه.
 *
 * أهم قاعدة: الميزة **مقفولة افتراضياً**. أي شك (مفيش إعدادات، مفيش مسئول،
 * المفتاح مقفول) ⇒ **مافيش أي مربع بيظهر لأي حد**.
 */
describe("teamDataRole", () => {
  const me = "u-me";

  it("مفيش إعدادات للمجموعة = الميزة مقفولة", () => {
    expect(teamDataRole(null, me)).toBe("off");
  });

  it("المفتاح مقفول = مقفولة حتى لو فيه مسئول", () => {
    expect(teamDataRole({ leaderId: me, enabled: false }, me)).toBe("off");
  });

  it("مفيش مسئول = مقفولة حتى لو المفتاح مفتوح", () => {
    expect(teamDataRole({ leaderId: null, enabled: true }, me)).toBe("off");
  });

  it("أنا المسئول = «leader» (بيرفع ويغيّر ويمسح)", () => {
    expect(teamDataRole({ leaderId: me, enabled: true }, me)).toBe("leader");
  });

  it("مسئول غيري = «member» (يفرز بس)", () => {
    expect(teamDataRole({ leaderId: "u-ahmed", enabled: true }, me)).toBe("member");
  });

  it("مش مسجّل دخول = مقفولة", () => {
    expect(teamDataRole({ leaderId: "u-ahmed", enabled: true }, null)).toBe("off");
  });
});

describe("needsTeamDataRefresh", () => {
  const T1 = "2026-09-17T08:00:00.000Z";
  const T2 = "2026-09-17T09:00:00.000Z";

  it("مافيش نسخة محلية = لازم ينزّل", () => {
    expect(needsTeamDataRefresh(null, T1)).toBe(true);
  });

  it("النسخة المحلية أقدم = لازم ينزّل", () => {
    expect(needsTeamDataRefresh(T1, T2)).toBe(true);
  });

  it("نفس النسخة = مايحمّلش تاني (توفير نت للمندوب)", () => {
    expect(needsTeamDataRefresh(T1, T1)).toBe(false);
  });

  it("المحلية أحدث (ساعة الجهاز مظبوطة غلط) = مايحمّلش", () => {
    expect(needsTeamDataRefresh(T2, T1)).toBe(false);
  });

  it("المسئول مسح الملف = مافيش نسخة بعيدة ⇒ مايحمّلش", () => {
    expect(needsTeamDataRefresh(T1, null)).toBe(false);
  });

  it("تاريخ باظ = ينزّل (أأمن من إننا نفضل على نسخة قديمة)", () => {
    expect(needsTeamDataRefresh("مش تاريخ", T1)).toBe(true);
  });
});

describe("teamDataPath", () => {
  it("أول جزء في المسار = اسم المجموعة (كل السياسات مبنية عليه)", () => {
    expect(teamDataPath("شرف")).toBe("شرف/data.xlsx");
  });

  it("سلوت التخزين المحلي ثابت", () => {
    expect(TEAM_DATA_SLOT).toBe("team-data");
  });
});

import { describe, it, expect } from "vitest";
import { needsTeamCheckRefresh, teamCheckPath } from "@/lib/teamCheck";

describe("teamCheck — دوال نقية", () => {
  it("teamCheckPath = <المجموعة>/check.xlsx", () => {
    expect(teamCheckPath("فريق-الرياض")).toBe("فريق-الرياض/check.xlsx");
  });

  it("needsTeamCheckRefresh: مافيش نسخة بعيدة → لأ (المسئول مسح)", () => {
    expect(needsTeamCheckRefresh("2026-09-01T00:00:00Z", null)).toBe(false);
  });
  it("مافيش نسخة محلية + فيه بعيدة → نزّل", () => {
    expect(needsTeamCheckRefresh(null, "2026-09-01T00:00:00Z")).toBe(true);
  });
  it("البعيدة أحدث → نزّل؛ مش أحدث → لأ", () => {
    expect(needsTeamCheckRefresh("2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z")).toBe(true);
    expect(needsTeamCheckRefresh("2026-09-02T00:00:00Z", "2026-09-01T00:00:00Z")).toBe(false);
    expect(needsTeamCheckRefresh("2026-09-02T00:00:00Z", "2026-09-02T00:00:00Z")).toBe(false);
  });
  it("تاريخ محلي باظ → نزّل (أأمن)", () => {
    expect(needsTeamCheckRefresh("مش تاريخ", "2026-09-01T00:00:00Z")).toBe(true);
  });
});

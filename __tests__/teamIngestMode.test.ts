import { describe, it, expect } from "vitest";
import { teamIngestMode } from "@/lib/teamData";

const T = 3 * 1024 * 1024; // 3MB

describe("teamIngestMode — داتا المجموعة كبيرة/صغيرة", () => {
  it("أقل من العتبة → small (تتفتح عادي)", () => {
    expect(teamIngestMode(1_000_000, T)).toBe("small");
    expect(teamIngestMode(T, T)).toBe("small"); // مساوي مش أكبر
  });
  it("أكبر من العتبة → large (streaming بلا كراش ذاكرة)", () => {
    expect(teamIngestMode(T + 1, T)).toBe("large");
    expect(teamIngestMode(50 * 1024 * 1024, T)).toBe("large");
  });
});

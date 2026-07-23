import { describe, it, expect } from "vitest";
import { buildCentralManifest, type CentralSampleRow } from "@/lib/trainingCentral";

function row(over: Partial<CentralSampleRow>): CentralSampleRow {
  return {
    id: "r1", session_id: "s1", plate: "ابح1234", tier: "trusted", reason: "trusted-export",
    start_ms: 0, end_ms: 900, audio_path: "agentA/s1.webm", agent_id: "agentA",
    created_at: "2026-07-23T10:00:00Z", ...over,
  };
}

describe("buildCentralManifest — تجميع عيّنات المناديب من السيرفر", () => {
  it("يجمّع بالمندوب ثم الجلسة، ويرتّب اللوحات بالتوقيت", () => {
    const rows = [
      row({ id: "1", agent_id: "A", session_id: "s1", plate: "ابح1234", start_ms: 500 }),
      row({ id: "2", agent_id: "A", session_id: "s1", plate: "درس5678", start_ms: 100 }),
      row({ id: "3", agent_id: "B", session_id: "s9", plate: "كلم9999", audio_path: "B/s9.webm" }),
    ];
    const m = buildCentralManifest(rows);
    expect(m.count).toBe(3);
    expect(m.agents).toHaveLength(2);
    const a = m.agents.find((x) => x.agentId === "A")!;
    expect(a.sampleCount).toBe(2);
    expect(a.sessions[0].plates.map((p) => p.plate)).toEqual(["درس5678", "ابح1234"]); // مرتّبة بالتوقيت
    expect(a.sessions[0].audioPath).toBe("agentA/s1.webm");
    const b = m.agents.find((x) => x.agentId === "B")!;
    expect(b.sampleCount).toBe(1);
  });

  it("يتعامل مع توقيت/مسار ناقص بأمان", () => {
    const m = buildCentralManifest([row({ start_ms: null, end_ms: null, audio_path: null, agent_id: null })]);
    expect(m.count).toBe(1);
    expect(m.agents[0].agentId).toBe("unknown");
    expect(m.agents[0].sessions[0].plates[0].startMs).toBe(0);
    expect(m.agents[0].sessions[0].audioPath).toBeNull();
  });
});

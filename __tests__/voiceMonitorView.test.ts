import { describe, it, expect } from "vitest";
import { groupSessions, describeTelEvent, findOutages, serverStateAt, dayRange } from "@/lib/voiceMonitorView";

/** صفحة «مراقبة الصوت» — المنطق اللي بيحوّل الصفوف لحكاية تتقري. */
const row = (o: Record<string, unknown>) => ({
  id: 1, agent_id: "a1", session_id: "s1", session_started_at: "2026-10-02T20:00:00.000Z",
  started_at: "2026-10-02T20:00:00.000Z", ended_at: "2026-10-02T20:02:00.000Z",
  platform: "android", build: "b", server: "voice.qannas-ksa.com",
  counts: { reads: 10, accepted: 6, rejected: 1, empty: 3, replays: 1, shown: 5, fails: { http_503: 1 }, skips: { silence_gate: 4 }, events_dropped: 0 },
  latency: { p50: 700, p95: 1500, max: 2000, model_p50: 120, n: 10 },
  events: [["e", 0, "start", null], ["f", 65, "request_failed:http_503"]],
  ...o,
});

describe("groupSessions", () => {
  it("بيجمّع دفعات نفس الجلسة: العدادات بتتجمع والأحداث بالوقت الحقيقي", () => {
    const s = groupSessions([
      row({}),
      row({ id: 2, started_at: "2026-10-02T20:02:00.000Z", ended_at: "2026-10-02T20:03:30.000Z",
        counts: { reads: 4, accepted: 4, rejected: 0, empty: 0, replays: 0, shown: 3, fails: { http_503: 2, timeout: 1 }, skips: { busy_window: 2 }, events_dropped: 0 },
        latency: { p50: 900, p95: 3000, max: 4000, model_p50: 130, n: 4 },
        events: [["s", 130, "حبك1234", 1000, 2, 0.97, "green"], ["e", 210, "stop", "{\"reason\":\"manual\"}"]] }),
    ]);
    expect(s).toHaveLength(1);
    const x = s[0];
    expect(x.counts).toMatchObject({ reads: 14, accepted: 10, shown: 8, replays: 1 });
    expect(x.counts.fails).toEqual({ http_503: 3, timeout: 1 });
    expect(x.counts.skips).toEqual({ silence_gate: 4, busy_window: 2 });
    expect(x.latencyMax).toBe(4000);
    expect(x.endedAt).toBe("2026-10-02T20:03:30.000Z");
    expect(x.events.map((e) => e.at.toISOString())).toEqual([
      "2026-10-02T20:00:00.000Z", "2026-10-02T20:01:05.000Z", "2026-10-02T20:02:10.000Z", "2026-10-02T20:03:30.000Z",
    ]);
  });

  it("جلستين ⇐ الأحدث الأول", () => {
    const s = groupSessions([row({}), row({ session_id: "s2", session_started_at: "2026-10-02T21:00:00.000Z", started_at: "2026-10-02T21:00:00.000Z", ended_at: "2026-10-02T21:02:00.000Z" })]);
    expect(s.map((x) => x.sessionId)).toEqual(["s2", "s1"]);
  });
});

describe("describeTelEvent", () => {
  it("كل نوع حدث ليه وصف عربي", () => {
    expect(describeTelEvent(["f", 1, "request_failed:http_503"]).label).toContain("فشل");
    expect(describeTelEvent(["f", 1, "request_failed:timeout"]).text).toContain("مهلة");
    expect(describeTelEvent(["r", 1, "حبك1234", 0, 0, 0.6, -1, 800, 100, 9000]).label).toContain("اترفضت");
    expect(describeTelEvent(["r", 1, "حبك1234", 1, 0, 0.97, -0.1, 800, 100, 9000]).label).toContain("قراية");
    expect(describeTelEvent(["t", 1, "انا سبعه", 0.5, 800, 9000]).label).toContain("من غير لوحة");
    expect(describeTelEvent(["s", 1, "حبك1234", 1000, 2, 0.97, "green"]).label).toContain("ظهرت");
    expect(describeTelEvent(["b", 1, "busy_window"]).label).toContain("اترمت");
    expect(describeTelEvent(["x", 1]).label).toContain("إعادة");
    expect(describeTelEvent(["e", 1, "offline"]).label).toContain("النت وقع");
    expect(describeTelEvent(["e", 1, "mic_lost", "{\"reason\":\"call\"}"]).label).toContain("المايك");
    expect(describeTelEvent(["zz", 1]).label).toBe("zz");
  });
});

describe("findOutages + serverStateAt", () => {
  const h = (min: number, ok: boolean, error: string | null = null) => ({
    checked_at: new Date(Date.UTC(2026, 9, 2, 20, min)).toISOString(), ok, ms: ok ? 300 : null, error, status: ok ? 200 : 502, inflight: 0,
  });
  const rows = [h(0, true), h(1, false, "http_502"), h(2, false, "timeout"), h(3, true), h(4, true), h(5, false, "network"), h(6, true)];

  it("النبضات الفاشلة المتتالية ⇐ فترة وقوع واحدة", () => {
    const o = findOutages(rows);
    expect(o).toHaveLength(2);
    expect(o[0]).toMatchObject({ checks: 2, errors: ["http_502", "timeout"] });
    expect(o[0].from).toBe(rows[1].checked_at);
    expect(o[0].to).toBe(rows[2].checked_at);
  });

  it("حالة السيرفر وقت الفشل: أقرب نبضة في حدود دقيقتين", () => {
    expect(serverStateAt(rows, new Date(Date.UTC(2026, 9, 2, 20, 3, 20)))).toBe("up");
    expect(serverStateAt(rows, new Date(Date.UTC(2026, 9, 2, 20, 1, 40)))).toBe("down");
    expect(serverStateAt(rows, new Date(Date.UTC(2026, 9, 2, 23, 0)))).toBe("unknown");
    expect(serverStateAt([], new Date())).toBe("unknown");
  });
});

describe("dayRange", () => {
  it("اليوم بتوقيت السعودية (+٣) من نص الليل لنص الليل", () => {
    expect(dayRange("2026-10-02")).toEqual({ from: "2026-10-01T21:00:00.000Z", to: "2026-10-02T21:00:00.000Z" });
  });
});

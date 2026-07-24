import { describe, it, expect } from "vitest";
import { buildTrainingManifest, mimeToExt, sanitizeFileName, fileStamp, trainingFilePrefix } from "@/lib/trainingExport";
import type { TrainingSample, TrainingSession } from "@/lib/trainingStore";

function sample(over: Partial<TrainingSample>): TrainingSample {
  return {
    id: "x", sessionId: "s1", plate: "ابح1234", tier: "trusted", reason: "trusted-export",
    startMs: 0, endMs: 900, agentId: "a", createdAt: "2026-07-23T10:00:00Z", synced: false, ...over,
  };
}
function session(over: Partial<TrainingSession>): TrainingSession {
  return { sessionId: "s1", audioBase64: "AAAA", mimeType: "audio/webm;codecs=opus", agentId: "a", createdAt: "2026-07-23T10:00:00Z", synced: false, ...over };
}

describe("mimeToExt — امتداد الملف من نوع الصوت", () => {
  it("webm → webm", () => expect(mimeToExt("audio/webm;codecs=opus")).toBe("webm"));
  it("m4a/mp4 → m4a", () => { expect(mimeToExt("audio/mp4")).toBe("m4a"); expect(mimeToExt("audio/x-m4a")).toBe("m4a"); });
  it("فاضي → webm افتراضي", () => expect(mimeToExt("")).toBe("webm"));
});

describe("تسمية ملفات التدريب — فريدة ومتسلسلة لكل مندوب (بدون تكرار)", () => {
  it("sanitizeFileName يشيل المحارف الممنوعة والمسافات ويسيب العربي", () => {
    expect(sanitizeFileName("assem.mohamed669@arabnation.com")).toBe("assem.mohamed669@arabnation.com");
    expect(sanitizeFileName("عاصم تجريبي")).toBe("عاصم_تجريبي");
    expect(sanitizeFileName('a/b:c*d?e"f<g>h|i')).toBe("a_b_c_d_e_f_g_h_i");
    expect(sanitizeFileName("  ")).toBe("unknown");
    expect(sanitizeFileName("")).toBe("unknown");
  });

  it("fileStamp طابع زمني متسلسل YYYYMMDD-HHMMSS", () => {
    // يوليو = الشهر 6 (صفري) → 07
    expect(fileStamp(new Date(2026, 6, 24, 16, 2, 5))).toBe("20260724-160205");
    expect(fileStamp(new Date(2026, 0, 1, 0, 0, 0))).toBe("20260101-000000");
  });

  it("trainingFilePrefix = اسم آمن + طابع زمني (بادئة فريدة لكل تنزيل)", () => {
    const d = new Date(2026, 6, 24, 16, 2, 5);
    expect(trainingFilePrefix("عاصم تجريبي", d)).toBe("عاصم_تجريبي-20260724-160205");
    // تنزيلين في وقتين مختلفين لنفس المندوب → بادئتين مختلفتين (مفيش تكرار)
    const d2 = new Date(2026, 6, 24, 16, 2, 6);
    expect(trainingFilePrefix("عاصم تجريبي", d)).not.toBe(trainingFilePrefix("عاصم تجريبي", d2));
    // نفس الوقت لمندوبين مختلفين → بادئتين مختلفتين (كل مندوب مميّز)
    expect(trainingFilePrefix("ahmed", d)).not.toBe(trainingFilePrefix("mohamed", d));
  });
});

describe("buildTrainingManifest — تجميع اللوحات تحت جلساتها", () => {
  it("يجمّع العيّنات تحت جلستها ويسمّي ملف الصوت", () => {
    const samples = [sample({ id: "1", plate: "ابح1234", startMs: 500 }), sample({ id: "2", plate: "درس5678", startMs: 100 })];
    const sessions = [session({})];
    const m = buildTrainingManifest(samples, sessions);
    expect(m.count).toBe(2);
    expect(m.sessionCount).toBe(1);
    expect(m.sessions[0].audioFile).toBe("s1.webm");
    // مرتّبة بالتوقيت — الأقدم أولاً
    expect(m.sessions[0].plates.map((p) => p.plate)).toEqual(["درس5678", "ابح1234"]);
  });

  it("عيّنات من جلستين → مجموعتين", () => {
    const samples = [sample({ id: "1", sessionId: "s1" }), sample({ id: "2", sessionId: "s2" })];
    const sessions = [session({ sessionId: "s1" }), session({ sessionId: "s2", mimeType: "audio/mp4" })];
    const m = buildTrainingManifest(samples, sessions);
    expect(m.sessionCount).toBe(2);
    const s2 = m.sessions.find((s) => s.sessionId === "s2");
    expect(s2?.audioFile).toBe("s2.m4a");
  });

  it("عيّنة بلا جلسة معروفة → تفضل موجودة بامتداد افتراضي", () => {
    const m = buildTrainingManifest([sample({ sessionId: "ghost" })], []);
    expect(m.sessions[0].audioFile).toBe("ghost.webm");
    expect(m.sessions[0].plates).toHaveLength(1);
  });
});

// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
  JUDGE_LOG_DB_NAME,
  type JudgeLogRecord,
  newJudgeLogRecord,
  summarizeJudgeLog,
  toJsonl,
  appendJudgeLog,
  markJudgeExported,
  getJudgeLog,
  countJudgeLog,
  judgeLogJsonl,
  clearJudgeLog,
} from "@/lib/plateJudgeLog";
import { PILOT_OWNER_ID } from "@/lib/plateJudgeGate";

// ─────────────────────────────────────────────────────────────────────────────
// سجل قياس الطيّار — سطر لكل نبضة، أسبوع كامل، **معزول تماماً**.
//
// ليه IndexedDB مش localStorage؟ ٢٠٠ لوحة/يوم × ٧ أيام = ١٤٠٠ سجل، والسجل
// الواحد ~٤٠٠ بايت (وقت + لوحتين + مصدر + سبب + ٣ أرقام ثقة + أزمنة) ⇒ **~٠٫٦
// ميجا في الأسبوع** = ١٢٪ من ميزانية localStorage (~٥ ميجا) اللي **مشتركة** مع
// `ic-ptt-results` و`ic-hits` ومفتاح Deepgram والخرايط المتعلّمة. وكمان
// localStorage **متزامن** فبيوقف الخيط الرئيسي وقت التفريغ الحي، والتطبيق عنده
// حادثة موثّقة لفقد داتا بسبب طرد التخزين في الـWebView. فقاعدة IDB **منفصلة**
// (اسم DB خاص) + شرط `isPilotOwner` على كل كتابة.
// ─────────────────────────────────────────────────────────────────────────────

const OTHER = "11111111-2222-4333-8444-555555555555";

function rec(over: Partial<JudgeLogRecord> = {}): JudgeLogRecord {
  return newJudgeLogRecord({
    id: "row-1",
    agentId: PILOT_OWNER_ID,
    sessionId: "s-1",
    dgPlate: "ابح1234",
    oursPlate: "ابح1234",
    fusedPlate: "ابح1234",
    source: "agree",
    reason: "agree",
    agreed: true,
    needsReview: false,
    accepted: true,
    meanLogprob: -0.11,
    serverMs: 287,
    ...over,
  });
}

describe("newJudgeLogRecord — سجل كامل بقيم افتراضية آمنة", () => {
  it("بيملّي الوقت والحقول الناقصة بلا undefined (JSON.stringify بيرمي undefined)", () => {
    const r = rec();
    expect(r.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.exported).toBe(false);
    expect(r.skipped).toBeNull();
    expect(r.minLogprob).toBeNull();
    expect(r.noSpeechProb).toBeNull();
    expect(r.clientMs).toBeNull();
    expect(r.bytes).toBeNull();
    for (const [k, v] of Object.entries(r)) expect(v, k).not.toBeUndefined();
  });

  it("بيحفظ الحقول اللي المهمة كلها موصوفة في المطلوب", () => {
    const r = rec({ source: "ours", reason: "disagree_prefer_ours", agreed: false, needsReview: true, oursPlate: "حبل5818", dgPlate: "حكل5818", fusedPlate: "حبل5818" });
    expect([r.dgPlate, r.oursPlate, r.fusedPlate]).toEqual(["حكل5818", "حبل5818", "حبل5818"]);
    expect(r.agreed).toBe(false);
    expect(r.source).toBe("ours");
    expect(r.needsReview).toBe(true);
  });
});

describe("toJsonl — سطر JSON واحد لكل نبضة", () => {
  it("سطر لكل سجل، بلا سطور فاضية، وكل سطر JSON صالح", () => {
    const out = toJsonl([rec({ id: "a" }), rec({ id: "b" })]);
    const lines = out.split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).id).toBe("a");
    expect(JSON.parse(lines[1]).id).toBe("b");
    expect(out.endsWith("\n")).toBe(true);
  });

  it("العربي بيفضل عربي (مش \\uXXXX)", () => {
    expect(toJsonl([rec()])).toContain("ابح1234");
  });

  it("قايمة فاضية → نص فاضي", () => {
    expect(toJsonl([])).toBe("");
  });
});

describe("summarizeJudgeLog — أرقام الأسبوع", () => {
  it("بيعدّ النبضات والاتفاق ونسبته والمُصدَّر", () => {
    const s = summarizeJudgeLog([
      rec({ id: "1", agreed: true, source: "agree", exported: true }),
      rec({ id: "2", agreed: true, source: "agree", exported: false }),
      rec({ id: "3", agreed: false, source: "ours", exported: true }),
      rec({ id: "4", agreed: false, source: "deepgram", exported: false }),
      rec({ id: "5", skipped: "prefix_too_large", source: "skipped", agreed: false }),
    ]);
    expect(s.total).toBe(5);
    expect(s.answered).toBe(4);          // اللي فيها رأي فعلي
    expect(s.agreed).toBe(2);
    expect(s.agreeRate).toBe(50);        // ٢ من ٤ نبضات مجاوبة
    expect(s.skipped).toBe(1);
    expect(s.exported).toBe(2);
    expect(s.bySource).toEqual({ agree: 2, ours: 1, deepgram: 1, none: 0, skipped: 1 });
  });

  it("متوسط زمن الخدمة على النبضات المجاوبة بس", () => {
    const s = summarizeJudgeLog([
      rec({ id: "1", serverMs: 200 }),
      rec({ id: "2", serverMs: 400 }),
      rec({ id: "3", serverMs: null, skipped: "timeout", source: "skipped" }),
    ]);
    expect(s.avgServerMs).toBe(300);
  });

  it("قايمة فاضية → أصفار بلا قسمة على صفر", () => {
    const s = summarizeJudgeLog([]);
    expect(s.total).toBe(0);
    expect(s.agreeRate).toBe(0);
    expect(s.avgServerMs).toBeNull();
  });
});

describe("مخزن IDB — قاعدة منفصلة، والمالك بس", () => {
  beforeEach(async () => { await clearJudgeLog(); });

  it("اسم القاعدة منفصل عن قاعدة التطبيق وقاعدة التدريب", () => {
    expect(JUDGE_LOG_DB_NAME).toBe("platehunter_judge_pilot");
    expect(JUDGE_LOG_DB_NAME).not.toBe("platehunter");
    expect(JUDGE_LOG_DB_NAME).not.toBe("platehunter_training");
  });

  it("كتابة وقراءة", async () => {
    expect(await appendJudgeLog(rec({ id: "a" }))).toBe(true);
    expect(await appendJudgeLog(rec({ id: "b", agreed: false, source: "ours" }))).toBe(true);
    const all = await getJudgeLog();
    expect(all.length).toBe(2);
    expect(all.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(await countJudgeLog()).toBe(2);
  });

  it("**بيرفض** أي مستخدم غير المالك — ولا سجل واحد بيتكتب", async () => {
    for (const uid of [OTHER, "", "   ", null, undefined, "not-a-uuid", PILOT_OWNER_ID.toUpperCase()]) {
      expect(await appendJudgeLog(rec({ id: `x-${String(uid)}`, agentId: uid as string })), String(uid)).toBe(false);
    }
    expect(await countJudgeLog()).toBe(0);
  });

  it("علامة «اتصدّر» بتتحدّث بعدين على نفس الصف", async () => {
    await appendJudgeLog(rec({ id: "a" }));
    await appendJudgeLog(rec({ id: "b" }));
    expect(await markJudgeExported(["a", "missing"])).toBe(1);
    const all = await getJudgeLog();
    expect(all.find((r) => r.id === "a")!.exported).toBe(true);
    expect(all.find((r) => r.id === "b")!.exported).toBe(false);
  });

  it("markJudgeExported بقايمة فاضية → صفر بلا رمي", async () => {
    expect(await markJudgeExported([])).toBe(0);
  });

  it("judgeLogJsonl بيطلّع كل السجل سطر-سطر", async () => {
    await appendJudgeLog(rec({ id: "a" }));
    await appendJudgeLog(rec({ id: "b" }));
    const lines = (await judgeLogJsonl()).split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0])).toHaveProperty("dgPlate");
  });

  it("نفس المعرّف مرتين بيستبدل (مش بيكرّر) — الصف الواحد سجل واحد", async () => {
    await appendJudgeLog(rec({ id: "a", serverMs: 100 }));
    await appendJudgeLog(rec({ id: "a", serverMs: 200 }));
    const all = await getJudgeLog();
    expect(all.length).toBe(1);
    expect(all[0].serverMs).toBe(200);
  });

  it("clearJudgeLog بيفضّي", async () => {
    await appendJudgeLog(rec({ id: "a" }));
    await clearJudgeLog();
    expect(await countJudgeLog()).toBe(0);
  });
});

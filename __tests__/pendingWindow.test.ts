/**
 * **نافذة الصوت اللي الخط كان مزنوق وقتها مابتترميش — بتستنى دورها.**
 *
 * المحرك بيبعت نافذة ٥ث كل ١.٥ث، وبحد أقصى نافذتين طايرين. لما الاتنين
 * مشغولين كانت النبضة بتعمل `return` وخلاص — **بلا طابور ولا إعادة محاولة**،
 * والتعليق مكتوب فيه «النافذة الجاية هتلحق». ولما الرد بياخد أكتر من ٣ ثواني
 * (= نافذتين × ١.٥ث) الخط بيفضل مزنوق، والنبضات بتتلغي ورا بعض — فآخر لوحة
 * في السلسلة ممكن **ماتدخلش أي نافذة اتبعتت أصلاً**: لا صفّارة ولا صف.
 *
 * ⚠️ ده **مابيغيّرش الصوت** اللي بيوصل للموديل: نفس المدى، نفس الطول، نفس
 * المعدّل. الصوت محفوظ في الجلسة فقصّ نفس المدى بعدين بيجيب نفس البايتات.
 */
import { describe, it, expect } from "vitest";
import { PendingWindow } from "@/lib/pendingWindow";

describe("PendingWindow", () => {
  it("فاضية في الأول", () => {
    const p = new PendingWindow();
    expect(p.has).toBe(false);
    expect(p.take()).toBeNull();
  });

  it("بتمسك النافذة اللي الخط كان مزنوق وقتها", () => {
    const p = new PendingWindow();
    p.set({ start: 0, end: 5 });
    expect(p.has).toBe(true);
    expect(p.take()).toEqual({ start: 0, end: 5 });
  });

  it("**الأحدث تغلب** — النوافذ متداخلة فالقديمة مالهاش لازمة", () => {
    // نبضة اتزنقت عند ٥، واللي بعدها عند ٦.٥ — الأحدث هي اللي فيها آخر كلام.
    const p = new PendingWindow();
    p.set({ start: 0, end: 5 });
    p.set({ start: 1.5, end: 6.5 });
    expect(p.take()).toEqual({ start: 1.5, end: 6.5 });
  });

  it("الأخذ بيفضّيها — مابتتبعتش مرتين", () => {
    const p = new PendingWindow();
    p.set({ start: 0, end: 5 });
    expect(p.take()).not.toBeNull();
    expect(p.take()).toBeNull();
    expect(p.has).toBe(false);
  });

  it("نافذة واحدة مستنية بالكتير — مافيش تكديس بيوصل متأخر", () => {
    const p = new PendingWindow();
    for (let i = 0; i < 20; i++) p.set({ start: i, end: i + 5 });
    expect(p.take()).toEqual({ start: 19, end: 24 });
    expect(p.take()).toBeNull();
  });

  it("clear بتفضّيها (عند إعادة التشغيل)", () => {
    const p = new PendingWindow();
    p.set({ start: 0, end: 5 });
    p.clear();
    expect(p.has).toBe(false);
  });
});

// ── حارس على المحرك نفسه ──
import { readFileSync } from "node:fs";
const ENGINE = readFileSync("lib/voicexEngine.ts", "utf8").replace(/\r\n/g, "\n");

/** يشيل التعليقات — التعليق نفسه بيذكر أسماء الدوال فبيلخبط ترتيب البحث. */
const stripComments = (t: string) =>
  t.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

describe("المحرك مابيرميش نافذة لأن الخط مزنوق", () => {
  it("النبضة بتأجّل بدل ما ترمي", () => {
    expect(ENGINE).not.toContain("if (inflight >= MAX_INFLIGHT) return;");
    expect(ENGINE).toContain("pending.set({ start: from, end: elapsed })");
  });

  it("أول ما يفضى مكان بتتبعت المستنية", () => {
    expect(ENGINE).toContain("if (!stopped && pending.has && inflight < MAX_INFLIGHT)");
  });

  it("الإيقاف بيبعت المستنية **قبل** ما يقفل الميك ويستنى", () => {
    const i = ENGINE.indexOf("async function finalize");
    // من غير التعليقات — التعليق نفسه بيذكر mic.stop() فبيلخبط ترتيب البحث.
    const body = stripComments(ENGINE.slice(i, i + 1400));
    const send = body.indexOf("sliceAndSend(last.start, last.end)");
    const micStop = body.indexOf("mic.stop()");
    const wait = body.indexOf("Promise.allSettled");
    expect(send).toBeGreaterThan(-1);
    expect(send).toBeLessThan(micStop);   // الميك لسه ماسك الصوت وقت القصّ
    expect(send).toBeLessThan(wait);      // فالانتظار بيغطّيها
  });

  it("الصوت المبعوت مابيتغيّرش — بنخزّن المدى مش البايتات", () => {
    expect(ENGINE).toContain("pending.set({ start:");
    expect(ENGINE).not.toMatch(/pending\.set\(\s*wav/);
  });
});

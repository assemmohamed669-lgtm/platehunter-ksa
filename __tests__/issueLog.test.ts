import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 🧯 «سجل المشاكل» الخفيف — المالك (٢٣ أكتوبر ٢٠٢٦): «عايزينه اخف ويسجل فقط كل يوم ب يومه» · «محدش هيتأثر فيهم بحاجه
 * ولا دة هيعمل لخبطه … في التشييك او في التسجيل».
 *  · الوقعات والأغلاط والتهنيج **بس** — مفيش خطوات، ولا متابعة طلبات النت، ولا لمس للتشييك/التسجيل/Voice PRO.
 *  · على الموبايل: مشاكل النهارده بس وبحد صغير. على السيرفر: صف صغير **لما يحصل حاجة بس**، وبيتمسح بعد يومين.
 *  · السوبر أدمن الأول (`ISSUE_LOG_FOR_ALL = false`). الحسابات اللي عليها الصندوق الكامل مابتشغّلوش (مفيش تكرار).
 */
const UID = "11111111-1111-4111-8111-111111111111";

async function load() {
  vi.resetModules();
  return await import("@/lib/issueLog");
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-23T08:00:00Z")); });
afterEach(() => { vi.useRealTimers(); });

describe("📦 الحد والتكرار واليوم", () => {
  it("حد أقصى للسطور، والغلط نفسه في نفس الدقيقة مرة واحدة، واليوم الجديد بيبدأ من الأول", async () => {
    const { addIssue, ISSUE_MAX_EVENTS } = await load();
    let buf = { day: "2026-10-23", events: [] as { t: number; k: string; p: string; msg?: string }[] };
    for (let i = 0; i < ISSUE_MAX_EVENTS + 20; i++) buf = addIssue(buf, { t: 1000 + i * 70_000, k: "err", p: "/x", msg: "m" + i }, "2026-10-23");
    expect(buf.events.length).toBe(ISSUE_MAX_EVENTS);
    const same = addIssue(addIssue({ day: "2026-10-23", events: [] }, { t: 1, k: "err", p: "/x", msg: "a" }, "2026-10-23"), { t: 30_000, k: "err", p: "/x", msg: "a" }, "2026-10-23");
    expect(same.events.length).toBe(1);
    const next = addIssue(buf, { t: 9e12, k: "err", p: "/x", msg: "z" }, "2026-10-24");
    expect(next).toEqual({ day: "2026-10-24", events: [{ t: 9e12, k: "err", p: "/x", msg: "z" }] });
  });
});

describe("🔒 مين بيشتغل عنده", () => {
  it("مش سوبر أدمن (والمفتاح للكل مقفول) ⇒ ولا مستمع ولا مؤقّت", async () => {
    const { startIssueLog } = await load();
    const add = vi.spyOn(window, "addEventListener");
    const timers = vi.getTimerCount();
    startIssueLog(UID, { isSuper: false, insert: vi.fn() });
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(timers);
    add.mockRestore();
  });
  it("الصندوق الكامل شغّال على الحساب ⇒ مابيشتغلش (مفيش تكرار)", async () => {
    const { startIssueLog } = await load();
    const add = vi.spyOn(window, "addEventListener");
    startIssueLog(UID, { isSuper: true, diagOn: true, insert: vi.fn() });
    expect(add).not.toHaveBeenCalled();
    add.mockRestore();
  });
});

describe("🧯 بيسجّل إيه", () => {
  it("غلط في الكود + وعد اترفض ⇒ سطر لكل واحد (والصفحة)", async () => {
    const { startIssueLog, readIssueBuffer } = await load();
    const stop = startIssueLog(UID, { isSuper: true, insert: vi.fn(async () => ({ error: null })) });
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", filename: "https://x/_next/a.js", lineno: 7 }));
    const rej = new Event("unhandledrejection") as Event & { reason?: unknown };
    rej.reason = new Error("nope");
    window.dispatchEvent(rej);
    const ev = readIssueBuffer()!.events;
    expect(ev.map((e) => e.k)).toEqual(["err", "rej"]);
    expect(ev[0]).toMatchObject({ msg: "boom", src: "a.js", line: 7 });
    stop();
  });
  it("البرنامج اتقفل والصفحة قدامه (نبضة حديثة، من غير قفل عادي) ⇒ «crash» على صفحته", async () => {
    localStorage.setItem("ph:issues:state", JSON.stringify({ path: "/wanted", beat: Date.now() - 20_000, vis: "visible" }));
    const { startIssueLog, readIssueBuffer } = await load();
    const stop = startIssueLog(UID, { isSuper: true, insert: vi.fn(async () => ({ error: null })) });
    expect(readIssueBuffer()!.events[0]).toMatchObject({ k: "crash", p: "/wanted" });
    stop();
  });
  it("قفل عادي / كان في الخلفية / من زمان ⇒ مش وقعة", async () => {
    for (const prev of [
      { path: "/wanted", beat: Date.now() - 20_000, vis: "visible", reload: true },
      { path: "/wanted", beat: Date.now() - 20_000, vis: "hidden" },
      { path: "/wanted", beat: Date.now() - 3 * 3_600_000, vis: "visible" },
    ]) {
      localStorage.clear();
      localStorage.setItem("ph:issues:state", JSON.stringify(prev));
      const { startIssueLog, readIssueBuffer } = await load();
      const stop = startIssueLog(UID, { isSuper: true, insert: vi.fn(async () => ({ error: null })) });
      expect(readIssueBuffer()?.events ?? []).toEqual([]);
      stop();
    }
  });
  it("الشاشة وقفت ٥ ثواني والبرنامج قدامه ⇒ «freeze»", async () => {
    const { startIssueLog, readIssueBuffer } = await load();
    const stop = startIssueLog(UID, { isSuper: true, insert: vi.fn(async () => ({ error: null })) });
    await vi.advanceTimersByTimeAsync(2000);
    vi.setSystemTime(Date.now() + 6000);           // الخيط الرئيسي اتعلّق ٦ ثواني
    await vi.advanceTimersByTimeAsync(2000);
    expect(readIssueBuffer()!.events.some((e) => e.k === "freeze" && (e.ms ?? 0) >= 5000)).toBe(true);
    stop();
  });
});

describe("☁️ الرفع", () => {
  it("بعد دقيقتين من أول مشكلة ⇒ صف واحد «issues» لليوم، والموبايل بيتفضى بعده", async () => {
    const { startIssueLog, readIssueBuffer } = await load();
    const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
    const stop = startIssueLog(UID, { isSuper: true, insert });
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(insert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({ agent_id: UID, server: "issues", session_id: "issues-2026-10-23" });
    expect((row.events as unknown[]).length).toBe(1);
    expect(readIssueBuffer()?.events ?? []).toEqual([]);
    stop();
  });
  it("الرفع فشل (مفيش نت) ⇒ السطور بتفضل للمرة الجاية", async () => {
    const { startIssueLog, readIssueBuffer } = await load();
    const insert = vi.fn(async () => ({ error: { message: "offline" } }));
    const stop = startIssueLog(UID, { isSuper: true, insert });
    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));
    await vi.advanceTimersByTimeAsync(130_000);
    expect(readIssueBuffer()!.events.length).toBe(1);
    stop();
  });
  it("مفيش مشاكل ⇒ مفيش رفع خالص", async () => {
    const { startIssueLog } = await load();
    const insert = vi.fn(async () => ({ error: null }));
    const stop = startIssueLog(UID, { isSuper: true, insert });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(insert).not.toHaveBeenCalled();
    stop();
  });
});

describe("🔌 التوصيل", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  it("بيبدأ من اللياوت بعد الصندوق الكامل، بصلاحية السوبر أدمن", () => {
    expect(read("app/(app)/layout.tsx")).toMatch(/startIssueLog\(userId, \{ isSuper: rp\?\.is_super === true, diagOn: diagActive\(\) \}\);/);
  });
  it("السيرفر بيمسحه بعد يومين، و«مراقبة الصوت» مابتعرضوش", () => {
    expect(read("app/api/cron/voice-health/route.ts")).toMatch(/\.eq\("server", ISSUE_LOG_SERVER\)\.lt\("started_at", issuesCutoff\(new Date\(\)\)\)/);
    const vm = read("app/admin/voice-monitor/page.tsx");
    expect(vm.match(/server\.not\.in\.\(diag,issues\)/g)?.length).toBe(2);
    expect(vm).not.toMatch(/server\.neq\.diag/);
  });
  it("🔒 لسه للسوبر أدمن بس", async () => {
    const { ISSUE_LOG_FOR_ALL } = await load();
    expect(ISSUE_LOG_FOR_ALL).toBe(false);
  });
});

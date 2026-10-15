import { describe, it, expect, vi } from "vitest";
import {
  createEventLogger, isMapsHref, summarizeTeamEvents, describeEvent, type AgentEventRow, type TeamEvent,
} from "@/lib/agentEvents";

/**
 * 🧭 سجل شغل الأعضاء (الموبايل) — بيسجّل الفرز وفتح موقع عربية ومشاركة النتيجة، ومكان العضو ساعتها. النت في الشارع
 * ضعيف ⇒ اللي مااتبعتش بيستنى في طابور على الموبايل ويتبعت مع أول تسجيل بعدها. (المالك ١٥ أكتوبر ٢٠٢٦)
 */
function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}
function deps(over: Partial<Parameters<typeof createEventLogger>[0]> = {}) {
  const sent: AgentEventRow[][] = [];
  const d = {
    insert: vi.fn(async (rows: AgentEventRow[]) => { sent.push(rows); return { ok: true }; }),
    getFix: vi.fn(async () => ({ lat: 21.42, lng: 39.82 })),
    now: () => new Date("2026-10-15T10:00:00Z"),
    team: () => "أ",
    storage: memStorage(),
    ...over,
  };
  return { d, sent };
}

describe("🔴 التسجيل", () => {
  it("فرز ⇒ بيتبعت بالنوع والتفاصيل والمجموعة (من غير ما يستنى الموقع)", async () => {
    const { d, sent } = deps();
    await createEventLogger(d).log("sort", { mode: "new", results: 12 });
    expect(sent[0][0]).toMatchObject({ kind: "sort", team: "أ", details: { mode: "new", results: 12 }, at: "2026-10-15T10:00:00.000Z", lat: null, lng: null });
    expect(d.getFix).not.toHaveBeenCalled();
  });
  it("🔴 فتح موقع / مشاركة ⇒ ومعاه مكان العضو ساعتها", async () => {
    const { d, sent } = deps();
    await createEventLogger(d).log("open_location", { plate: "رقه9312" }, { withLocation: true });
    expect(sent[0][0]).toMatchObject({ kind: "open_location", lat: 21.42, lng: 39.82 });
  });
  it("الموقع مش متاح ⇒ بيتسجّل برضه من غيره", async () => {
    const { d, sent } = deps({ getFix: vi.fn(async () => null) });
    await createEventLogger(d).log("share", { kind: "image" }, { withLocation: true });
    expect(sent[0][0]).toMatchObject({ kind: "share", lat: null });
  });
  it("🔴 من غير نت ⇒ بيستنى في الطابور ويتبعت مع التسجيل الجاي", async () => {
    const { d, sent } = deps();
    d.insert.mockResolvedValueOnce({ ok: false });
    const lg = createEventLogger(d);
    await lg.log("sort", { mode: "full" });
    await lg.log("share", { kind: "excel" });
    expect(d.insert).toHaveBeenCalledTimes(2);
    expect(sent[0].map((r) => r.kind)).toEqual(["sort", "share"]);   // الأولى فشلت ⇒ اتبعتوا الاتنين مع بعض
    expect(JSON.parse(d.storage.getItem("ph:agentEvents:queue") ?? "[]")).toEqual([]);
  });
  it("الطابور أقصاه ٥٠، والأقدم من ٢٣ ساعة بيتشال (الداتابيز بترفضه)", async () => {
    const { d } = deps({ insert: vi.fn(async () => ({ ok: false })) });
    const old = { kind: "sort", at: "2026-10-14T09:00:00.000Z", team: "أ", details: {}, lat: null, lng: null };
    d.storage.setItem("ph:agentEvents:queue", JSON.stringify([old]));
    const lg = createEventLogger(d);
    for (let i = 0; i < 60; i++) await lg.log("sort", { i });
    const q = JSON.parse(d.storage.getItem("ph:agentEvents:queue") ?? "[]");
    expect(q.length).toBe(50);
    expect(q.some((r: AgentEventRow) => r.at === old.at)).toBe(false);
  });
  it("الجدول لسه ماتعملش (الـSQL ماتشغّلش) ⇒ بيوقف ومايملاش الموبايل", async () => {
    const { d } = deps({ insert: vi.fn(async () => ({ ok: false, missing: true })) });
    const lg = createEventLogger(d);
    await lg.log("sort", {});
    await lg.log("sort", {});
    expect(d.insert).toHaveBeenCalledTimes(1);
    expect(JSON.parse(d.storage.getItem("ph:agentEvents:queue") ?? "[]")).toEqual([]);
  });
  it("التفاصيل الطويلة بتتقص (الداتابيز بترفض أكتر من ٤ كيلو)", async () => {
    const { d, sent } = deps();
    await createEventLogger(d).log("sort", { note: "x".repeat(10_000) });
    expect(JSON.stringify(sent[0][0].details).length).toBeLessThan(3000);
  });
});

describe("🔴 لينك الموقع", () => {
  it("لينكات الخرايط بس", () => {
    for (const h of ["https://maps.google.com/?q=21.4,39.8", "https://www.google.com/maps?q=21,39", "https://maps.app.goo.gl/abc", "https://goo.gl/maps/xyz", "geo:21.4,39.8"]) expect(isMapsHref(h)).toBe(true);
    for (const h of ["https://wa.me/123", "https://play.google.com/store/apps/details?id=x", ""]) expect(isMapsHref(h)).toBe(false);
  });
});

describe("🔴 ملخص كل عضو للمسئول", () => {
  const members = [{ id: "a", username: "محمد" }, { id: "b", username: "أحمد" }, { id: "c", username: "محمود" }];
  const ev = (agent_id: string, kind: TeamEvent["kind"], at: string, details: Record<string, unknown> = {}, lat: number | null = null, lng: number | null = null): TeamEvent =>
    ({ id: Math.random(), agent_id, username: "", kind, at, details, lat, lng });
  const now = new Date("2026-10-15T12:00:00Z");   // ٣ العصر في السعودية
  const events = [
    ev("a", "sort", "2026-10-15T09:00:00Z", { mode: "new", results: 12 }),
    ev("a", "sort", "2026-10-14T20:00:00Z", { mode: "full", results: 40 }),
    ev("a", "open_location", "2026-10-15T09:30:00Z", { plate: "رقه9312" }, 21.4, 39.8),
    ev("b", "share", "2026-10-15T08:00:00Z", { kind: "image", count: 20 }),
  ];
  it("آخر فرز + عدد النهارده (بتوقيت السعودية) — واللي مافرزش", () => {
    const s = summarizeTeamEvents(events, members, now);
    expect(s.find((x) => x.id === "a")).toMatchObject({ lastSortAt: "2026-10-15T09:00:00Z", sortsToday: 1, opensToday: 1, sharesToday: 0 });
    expect(s.find((x) => x.id === "b")).toMatchObject({ lastSortAt: null, sortsToday: 0, sharesToday: 1 });
    expect(s.find((x) => x.id === "c")).toMatchObject({ lastSortAt: null, events: [] });
    expect(s.find((x) => x.id === "a")!.events.map((e) => e.kind)).toEqual(["open_location", "sort", "sort"]);   // الأحدث فوق
  });
  it("الكلام اللي بيظهر للمسئول", () => {
    expect(describeEvent(ev("a", "sort", "", { mode: "new", results: 12, records: 3 }))).toBe("فرز جديد — ١٢ عربية مطلوبة + ٣ من السجلات");
    expect(describeEvent(ev("a", "sort", "", { mode: "full", results: 0 }))).toBe("فرز كلي — مطلعش مطلوب");
    expect(describeEvent(ev("a", "sort", "", { mode: "paste", results: 2 }))).toBe("لصق نصي — ٢ عربية مطلوبة");
    expect(describeEvent(ev("a", "open_location", "", { plate: "رقه9312" }))).toBe("فتح موقع العربية رقه9312");
    expect(describeEvent(ev("a", "share", "", { kind: "image", count: 20 }))).toBe("شارك صور النتيجة (٢٠ عربية)");
    expect(describeEvent(ev("a", "share", "", { kind: "excel", count: 5 }))).toBe("شارك إكسيل النتيجة (٥ عربية)");
    expect(describeEvent(ev("a", "share", "", { kind: "text" }))).toBe("شارك النتيجة على واتساب");
  });
});

import { describe, it, expect } from "vitest";
import {
  certSourcesFor, parseAccessMode, mergeDayCerts, mergeCertBatch, pushAudience,
  CERT_SOURCE_TABLES, CERT_PUSH_STATE_TABLES,
} from "@/lib/certPrivate";
import type { DailyCertEntry } from "@/lib/certDaily";

/**
 * 🔒 الشهايد الخاصة (حساب درايف تاني) — المالك (١٧ نوفمبر ٢٠٢٦): «الايميل القديم المربوط حاليا ل المستخدمين
 * هيفضل زي ماهو والايميل الجديد اللي هنربطه دة هيبقي ل ناس معينه فقط انا اختارهم».
 * قراراته: السوبر أدمن يختار بالاسم · لكل واحد «الجديد بس» أو «الجديد والقديم» · الإشعار للمختارين بس وبنفس الشكل.
 */

const entry = (fileId: string, createdAt: string, plate = "ابح1234"): DailyCertEntry => ({
  fileId, name: `${plate}.pdf`, createdAt, plate, plateText: plate, vin: "", bank: "", tenant: "",
  make: "", model: "", year: "", color: "", status: "", certDate: "", certNo: "",
});

describe("🔒 مين بيشوف إيه", () => {
  it("🔴 اللي مش في القايمة ⇒ القديم بس (زي دلوقتي بالظبط)", () => {
    expect(certSourcesFor(null)).toEqual(["main"]);
  });
  it("🔴 «الجديد والقديم» ⇒ الاتنين", () => {
    expect(certSourcesFor("both")).toEqual(["main", "private"]);
  });
  it("🔴 «الجديد بس» ⇒ الجديد بس (القديم مايظهرش)", () => {
    expect(certSourcesFor("private_only")).toEqual(["private"]);
  });
  it("القيمة من الداتابيز: أي حاجة غريبة ⇒ مش في القايمة", () => {
    expect(parseAccessMode("both")).toBe("both");
    expect(parseAccessMode("private_only")).toBe("private_only");
    expect(parseAccessMode("all")).toBeNull();
    expect(parseAccessMode(null)).toBeNull();
    expect(parseAccessMode(undefined)).toBeNull();
  });
  it("القديم في جدوله زي ما هو، والجديد في جدول لوحده", () => {
    expect(CERT_SOURCE_TABLES).toEqual({ main: "cert_daily", private: "cert_daily_private" });
    expect(CERT_PUSH_STATE_TABLES).toEqual({ main: "cert_push_state", private: "cert_push_state_private" });
  });
});

describe("📄 «شهايد النهارده» من الحسابين مع بعض", () => {
  it("🔴 العدد بيتجمع والشهايد بترتيب الرفع — ونفس الملف لو اتشارك مع الحسابين مرة واحدة", () => {
    const main = { total: 3, parsed: 2, entries: [entry("aaaaaaaaaa1", "2026-11-17T08:00:00Z"), entry("bbbbbbbbbb1", "2026-11-17T10:00:00Z")] };
    const priv = { total: 2, parsed: 2, entries: [entry("cccccccccc1", "2026-11-17T09:00:00Z"), entry("bbbbbbbbbb1", "2026-11-17T10:00:00Z")] };
    const m = mergeDayCerts([main, priv]);
    expect(m.total).toBe(5);
    expect(m.parsed).toBe(4);
    expect(m.entries.map((e) => e.fileId)).toEqual(["aaaaaaaaaa1", "cccccccccc1", "bbbbbbbbbb1"]);
  });
  it("مصدر واحد ⇒ هو هو", () => {
    const one = { total: 1, parsed: 1, entries: [entry("aaaaaaaaaa1", "2026-11-17T08:00:00Z")] };
    expect(mergeDayCerts([one])).toEqual(one);
  });
});

describe("📄 عمود «شهايد» في الفرز من الحسابين", () => {
  it("🔴 الشهايد بتتجمع لكل لوحة من غير تكرار", () => {
    const m = mergeCertBatch([
      { results: { "ابح1234": [{ id: "x1", name: "ابح1234.pdf" }], "دسب2222": [] }, failed: [] },
      { results: { "ابح1234": [{ id: "x1", name: "ابح1234.pdf" }, { id: "x2", name: "ابح 1234.pdf" }], "دسب2222": [{ id: "y1", name: "دسب2222.pdf" }] }, failed: [] },
    ]);
    expect(m.results["ابح1234"].map((h) => h.id)).toEqual(["x1", "x2"]);
    expect(m.results["دسب2222"].map((h) => h.id)).toEqual(["y1"]);
    expect(m.failed).toEqual([]);
  });
  it("🔴 حساب ماردّش واللوحة ليها شهادة من التاني ⇒ تبان (مش «تعذّر»)", () => {
    const m = mergeCertBatch([
      { results: { "ابح1234": [{ id: "x1", name: "ابح1234.pdf" }] }, failed: [] },
      { results: {}, failed: ["ابح1234", "دسب2222"] },
    ]);
    expect(m.results["ابح1234"].map((h) => h.id)).toEqual(["x1"]);
    expect(m.failed).toEqual(["دسب2222"]);
  });
});

describe("🔔 الإشعار", () => {
  const today = "2026-11-17";
  const profiles = [
    { id: "a", role: "agent", is_active: true, subscription_end: "2026-12-30", rest_pages_enabled: true },
    { id: "b", role: "agent", is_active: true, subscription_end: "2026-12-30", rest_pages_enabled: false },
    { id: "c", role: "agent", is_active: true, subscription_end: "2026-12-30", rest_pages_enabled: true },
    { id: "d", role: "agent", is_active: false, subscription_end: "2026-12-30", rest_pages_enabled: true },
    { id: "e", role: "agent", is_active: true, subscription_end: "2026-10-01", rest_pages_enabled: true },
  ];
  const access = new Map([["b", "both" as const], ["c", "private_only" as const], ["d", "both" as const], ["e", "both" as const]]);
  const ids = (g: { url: string; ids: string[] }[]) => g.flatMap((x) => x.ids).sort();

  /**
   * 🔴 المالك (١٩ نوفمبر ٢٠٢٦): «اهم حاجه اللي اختارة يجيلو فقط اشعار ل الشهادات اللي بتنزل علي الايميل دة فقط
   * اما اللي مش هختارة دة يفضل شغال زي ماهو» ⇒ أي حد في القايمة (أي وضع) **مايجيلوش** إشعار القديم.
   */
  it("🔴 شهايد القديم ⇒ كل المشتركين زي دلوقتي، إلا **أي حد مختار** («الجديد بس» أو «الجديد والقديم»)", () => {
    expect(ids(pushAudience(profiles, today, "main", access))).toEqual(["a"]);
  });
  it("🔴 شهايد الجديد ⇒ المختارين بس (واشتراكهم شغّال)", () => {
    expect(ids(pushAudience(profiles, today, "private", access))).toEqual(["b", "c"]);
  });
  it("مفيش قايمة (الجدول لسه ماتعملش) ⇒ القديم لكل المشتركين بالظبط، والجديد لحد", () => {
    expect(ids(pushAudience(profiles, today, "main", new Map()))).toEqual(["a", "b", "c"]);
    expect(ids(pushAudience(profiles, today, "private", new Map()))).toEqual([]);
  });
  it("الدوسة بتفتح نفس المكان زي الإشعار الحالي", () => {
    const g = pushAudience(profiles, today, "private", access);
    expect(g.find((x) => x.ids.includes("b"))?.url).toBe("/instant-check?tab=cert");
    expect(g.find((x) => x.ids.includes("c"))?.url).toBe("/wanted");
  });
});

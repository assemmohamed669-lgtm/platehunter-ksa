// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

/**
 * 🔎 البحث بالرقم بيلاقي الشهايد اللي **اسم ملفها مش لوحة** — المالك (١٩ نوفمبر ٢٠٢٦): «فيهم لوحه رعب4925 ببحث عليها
 * علي البرنامج … مش موجوده يعني البحث مش بيجيب الشهايد». السبب: البحث كان بالاسم في درايف بس، و١٥٨ من ٢٠٤ شهادة
 * يوم ١٨ نوفمبر اسمها رقم عقد («REPO-301-00291063.pdf»). دلوقتي كمان بيدوّر في **اللوحات اللي اتقرت من جوّه الملفات**
 * (`cert_daily`)، وبتفضل محفوظة سنة مش أسبوع.
 */

let mode: "private_only" | "both" | null = null;
const parsedCalls: unknown[][] = [];

vi.mock("@/lib/apiAuth", () => ({ verifySession: async () => "u1", rateLimit: () => true }));
vi.mock("@/lib/certAccessStore", () => ({ certAccessOf: async () => mode }));
let driveOk = true;
vi.mock("@/lib/gdrive", () => ({
  getDriveAccessToken: async (source?: string) => `tok-${source ?? "main"}`,
  // درايف بالاسم مالقاش حاجة (الملف اسمه REPO-…)
  driveSearch: async () => [{ id: "OTHERFILE01", name: "REPO-301-00299999.pdf" }],
  driveSearchWithStatus: async () => ({ files: [{ id: "OTHERFILE01", name: "REPO-301-00299999.pdf" }], ok: driveOk, truncated: false }),
}));
vi.mock("@/lib/certDailyStore", () => ({
  findParsedByPlates: async (keys: string[], table?: string) => {
    parsedCalls.push(["byPlates", keys, table]);
    const m = new Map<string, { id: string; name: string }[]>();
    if (!table && keys.includes("رعا4925")) m.set("رعا4925", [{ id: "1_haNJv0Wqb", name: "REPO-301-00291063.pdf" }]);
    return m;
  },
  findParsedCerts: async (...args: unknown[]) => {
    parsedCalls.push(args);
    const [query, table] = args as [{ plate?: string; digits?: string; vin?: string }, string | undefined];
    if (table === "cert_daily_private") return query.plate === "رعا4925" ? [{ id: "PRIVFILE001", name: "REPO-9-1.pdf" }] : [];
    if (query.plate === "رعا4925" || query.digits === "4925") return [{ id: "1_haNJv0Wqb", name: "REPO-301-00291063.pdf" }];
    if (query.vin === "LGWEE4A50RK605167") return [{ id: "1_haNJv0Wqb", name: "REPO-301-00291063.pdf" }];
    return [];
  },
}));

beforeEach(() => { mode = null; parsedCalls.length = 0; });
const req = (q: string) => new NextRequest(`http://localhost/api/certificate?q=${encodeURIComponent(q)}`, { headers: { authorization: "Bearer x" } });

describe("🔎 البحث في اللوحات اللي اتقرت من جوّه الملفات", () => {
  it("🔴 «رعا4925» بيلاقي «REPO-301-00291063.pdf» (اسمه مش لوحة)", async () => {
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("رعا4925"))).json();
    expect(body.found).toBe(true);
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(["1_haNJv0Wqb"]);
  });
  it("🔴 أي شكل للوحة (مسافات / «أ») بيتطبّع زي المحفوظ", async () => {
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("ر ع أ 4925"))).json();
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(["1_haNJv0Wqb"]);
    expect(parsedCalls[0][0]).toEqual({ plate: "رعا4925" });
  });
  it("الأرقام بس ⇒ كل اللي بالأرقام دي", async () => {
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("4925"))).json();
    expect(parsedCalls[0][0]).toEqual({ digits: "4925" });
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(["1_haNJv0Wqb"]);
  });
  it("🔴 الشاص بيدوّر في المقري كمان", async () => {
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("LGWEE4A50RK605167"))).json();
    expect(body.results.map((r: { id: string }) => r.id)).toContain("1_haNJv0Wqb");
  });
  it("🔒 الشهايد الخاصة: المقري من جدولها بس للمختار", async () => {
    mode = "private_only";
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("رعا4925"))).json();
    expect(parsedCalls.map((c) => c[1])).toEqual(["cert_daily_private"]);
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(["PRIVFILE001"]);
  });
  it("مش في القايمة ⇒ الجدول القديم بس", async () => {
    const { GET } = await import("@/app/api/certificate/route");
    await GET(req("رعا4925"));
    expect(parsedCalls.map((c) => c[1])).toEqual([undefined]);
  });
});

describe("📄 عمود «شهايد» في نتايج الفرز — نفس العيب ونفس الحل", () => {
  const post = (plates: string[]) => new NextRequest("http://localhost/api/certificate/batch", {
    method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json" }, body: JSON.stringify({ plates }),
  });
  beforeEach(async () => { driveOk = true; (await import("@/lib/certBatch")).clearCertBatchCache(); });

  it("🔴 «ر ع ا 4925» بتاخد شهادتها من المقري (اسم الملف مش لوحة)", async () => {
    const { POST } = await import("@/app/api/certificate/batch/route");
    const body = await (await POST(post(["ر ع ا 4925", "دسب2222"]))).json();
    expect(body.results["ر ع ا 4925"].map((h: { id: string }) => h.id)).toEqual(["1_haNJv0Wqb"]);
    expect(body.results["دسب2222"]).toEqual([]);
    expect(parsedCalls.find((c) => c[0] === "byPlates")?.[1]).toEqual(["رعا4925", "دسب2222"]);
  });
  it("🔴 درايف ماردّش بس لقيناها في المقري ⇒ تبان (مش «تعذّر»)", async () => {
    driveOk = false;
    const { POST } = await import("@/app/api/certificate/batch/route");
    const body = await (await POST(post(["رعا4925", "دسب2222"]))).json();
    expect(body.results["رعا4925"].map((h: { id: string }) => h.id)).toEqual(["1_haNJv0Wqb"]);
    expect(body.failed).toEqual(["دسب2222"]);
  });
});

describe("📦 الشهايد المقرية بتتحفظ سنة (للبحث) — والقراية والفرز زي ما هم أسبوع", () => {
  it("🔴 المسح بعد سنة مش أسبوع", () => {
    const job = readFileSync("lib/certDailyJob.ts", "utf8");
    expect(job).toMatch(/export const STORE_KEEP_DAYS = 400;/);
    expect(job).toMatch(/d\.cleanup\(dayMinus\(day, STORE_KEEP_DAYS\)\)/);
    // القراية والإعادة لسه على الأسبوع
    expect(job).toMatch(/d\.pending\(dayMinus\(day, KEEP_DAYS\)/);
  });
});

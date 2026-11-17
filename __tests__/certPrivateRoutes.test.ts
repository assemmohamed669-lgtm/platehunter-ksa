// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

/**
 * 🔒 الشهايد الخاصة — الراوتات اللي المندوب بيطلب منها الشهايد. القاعدة:
 *  · مش في القايمة ⇒ **نفس النداءات بالظبط** زي دلوقتي (الحساب القديم بس).
 *  · «الجديد والقديم» ⇒ الاتنين مع بعض · «الجديد بس» ⇒ الجديد بس.
 *  · الإذن من السيرفر — المندوب مابيبعتش هو عايز أنهي حساب.
 */

let mode: "private_only" | "both" | null = null;
const readCalls: unknown[][] = [];
const countCalls: unknown[][] = [];
let privateMissing = false;
const tokenCalls: (string | undefined)[] = [];
const searchCalls: { q: string; token: string }[] = [];
const downloadCalls: { id: string; token: string }[] = [];
let mainHasFile = true;

const entry = (fileId: string, createdAt: string) => ({
  fileId, name: `${fileId}.pdf`, createdAt, plate: "ابح1234", plateText: "ابح1234", vin: "", bank: "", tenant: "",
  make: "", model: "", year: "", color: "", status: "", certDate: "", certNo: "",
});

vi.mock("@/lib/apiAuth", () => ({ verifySession: async () => "u1", rateLimit: () => true }));
vi.mock("@/lib/certAccessStore", () => ({ certAccessOf: async () => mode }));
vi.mock("@/lib/certLink", () => ({ signCertLink: (id: string) => `t-${id}`, verifyCertLink: (t: string) => t.replace(/^t-/, "") }));
vi.mock("@/lib/securityLogServer", () => ({ requestMeta: () => ({ ip: "1.1.1.1" }), logSecurityEvent: () => {} }));
vi.mock("@/lib/certDailyStore", () => ({
  readDayCerts: async (...args: unknown[]) => {
    readCalls.push(args);
    if (args[1] === "cert_daily_private") {
      if (privateMissing) throw Object.assign(new Error('relation "cert_daily_private" does not exist'), { code: "42P01" });
      return { total: 1, parsed: 1, entries: [entry("PRIVATE0001", "2026-11-17T09:00:00Z")] };
    }
    return { total: 2, parsed: 2, entries: [entry("MAINFILE001", "2026-11-17T08:00:00Z")] };
  },
  countDayCerts: async (...args: unknown[]) => {
    countCalls.push(args);
    return args[1] === "cert_daily_private" ? { total: 1, parsed: 1 } : { total: 2, parsed: 2 };
  },
}));
vi.mock("@/lib/gdrive", () => ({
  getDriveAccessToken: async (source?: string) => { tokenCalls.push(source); return `tok-${source ?? "main"}`; },
  privateDriveConfigured: () => true,
  driveSearch: async (q: string, token: string) => {
    searchCalls.push({ q, token });
    return token === "tok-private" ? [{ id: "PRIVATE0001", name: "ابح 1234.pdf" }] : [{ id: "MAINFILE001", name: "ابح1234.pdf" }];
  },
  driveSearchWithStatus: async (q: string, token: string) => {
    searchCalls.push({ q, token });
    const files = token === "tok-private" ? [{ id: "PRIVATE0001", name: "ابح 1234.pdf" }] : [{ id: "MAINFILE001", name: "ابح1234.pdf" }];
    return { files, ok: true, truncated: false };
  },
  driveDownloadPdf: async (id: string, token: string) => {
    downloadCalls.push({ id, token });
    if (token === "tok-main" && !mainHasFile) return null;
    return new TextEncoder().encode(`pdf-${token}`).buffer;
  },
}));

beforeEach(async () => {
  mode = null; privateMissing = false; mainHasFile = true;
  readCalls.length = 0; countCalls.length = 0; tokenCalls.length = 0; searchCalls.length = 0; downloadCalls.length = 0;
  const { clearCertBatchCache } = await import("@/lib/certBatch");
  clearCertBatchCache();
});

const req = (path: string, init: RequestInit = {}) =>
  new NextRequest(`http://localhost${path}`, { ...init, headers: { authorization: "Bearer x", ...(init.headers ?? {}) } });

describe("📄 /api/certificate/daily", () => {
  it("🔴 مش في القايمة ⇒ الجدول القديم بس — نفس النداء بالظبط (من غير جدول)", async () => {
    const { GET } = await import("@/app/api/certificate/daily/route");
    const body = await (await GET(req("/api/certificate/daily?offset=0"))).json();
    expect(readCalls).toHaveLength(1);
    expect(readCalls[0]).toHaveLength(1);
    expect(body.entries.map((e: { fileId: string }) => e.fileId)).toEqual(["MAINFILE001"]);
    expect(body.total).toBe(2);
  });
  it("🔴 «الجديد والقديم» ⇒ الاتنين مع بعض", async () => {
    mode = "both";
    const { GET } = await import("@/app/api/certificate/daily/route");
    const body = await (await GET(req("/api/certificate/daily?offset=0"))).json();
    expect(body.entries.map((e: { fileId: string }) => e.fileId)).toEqual(["MAINFILE001", "PRIVATE0001"]);
    expect(body.total).toBe(3);
    expect(body.entries[1].link).toBe("http://localhost/c/t-PRIVATE0001");
  });
  it("🔴 «الجديد بس» ⇒ الجديد بس (القديم مايتقراش أصلاً)", async () => {
    mode = "private_only";
    const { GET } = await import("@/app/api/certificate/daily/route");
    const body = await (await GET(req("/api/certificate/daily?offset=0"))).json();
    expect(readCalls.map((c) => c[1])).toEqual(["cert_daily_private"]);
    expect(body.entries.map((e: { fileId: string }) => e.fileId)).toEqual(["PRIVATE0001"]);
  });
  it("العدد بس (`count=1`) بيتجمع من المصادر", async () => {
    mode = "both";
    const { GET } = await import("@/app/api/certificate/daily/route");
    const body = await (await GET(req("/api/certificate/daily?offset=0&count=1"))).json();
    expect(body.total).toBe(3);
    expect(body.parsed).toBe(3);
  });
  it("🔴 الجدول الجديد لسه ماتعملش و«الجديد والقديم» ⇒ القديم يفضل يظهر (مايبوظش)", async () => {
    mode = "both"; privateMissing = true;
    const { GET } = await import("@/app/api/certificate/daily/route");
    const body = await (await GET(req("/api/certificate/daily?offset=0"))).json();
    expect(body.setup).toBeUndefined();
    expect(body.entries.map((e: { fileId: string }) => e.fileId)).toEqual(["MAINFILE001"]);
  });
});

describe("🔎 /api/certificate (البحث بالرقم)", () => {
  it("🔴 مش في القايمة ⇒ الحساب القديم بس", async () => {
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("/api/certificate?q=" + encodeURIComponent("ابح1234")))).json();
    expect(new Set(searchCalls.map((c) => c.token))).toEqual(new Set(["tok-main"]));
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(["MAINFILE001"]);
  });
  it("🔴 «الجديد والقديم» ⇒ نتيجة الاتنين", async () => {
    mode = "both";
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("/api/certificate?q=" + encodeURIComponent("ابح1234")))).json();
    expect(body.results.map((r: { id: string }) => r.id).sort()).toEqual(["MAINFILE001", "PRIVATE0001"]);
  });
  it("🔴 «الجديد بس» ⇒ الجديد بس", async () => {
    mode = "private_only";
    const { GET } = await import("@/app/api/certificate/route");
    const body = await (await GET(req("/api/certificate?q=" + encodeURIComponent("ابح1234")))).json();
    expect(new Set(searchCalls.map((c) => c.token))).toEqual(new Set(["tok-private"]));
    expect(body.results.map((r: { id: string }) => r.id)).toEqual(["PRIVATE0001"]);
  });
});

describe("📄 /api/certificate/batch (عمود «شهايد» في الفرز)", () => {
  const post = () => req("/api/certificate/batch", { method: "POST", body: JSON.stringify({ plates: ["ابح1234"] }), headers: { "content-type": "application/json" } });
  it("🔴 مش في القايمة ⇒ القديم بس", async () => {
    const { POST } = await import("@/app/api/certificate/batch/route");
    const body = await (await POST(post())).json();
    expect(body.results["ابح1234"].map((h: { id: string }) => h.id)).toEqual(["MAINFILE001"]);
    expect(new Set(searchCalls.map((c) => c.token))).toEqual(new Set(["tok-main"]));
  });
  it("🔴 «الجديد والقديم» ⇒ الاتنين", async () => {
    mode = "both";
    const { POST } = await import("@/app/api/certificate/batch/route");
    const body = await (await POST(post())).json();
    expect(body.results["ابح1234"].map((h: { id: string }) => h.id).sort()).toEqual(["MAINFILE001", "PRIVATE0001"]);
  });
  it("🔴 «الجديد بس» ⇒ الجديد بس", async () => {
    mode = "private_only";
    const { POST } = await import("@/app/api/certificate/batch/route");
    const body = await (await POST(post())).json();
    expect(body.results["ابح1234"].map((h: { id: string }) => h.id)).toEqual(["PRIVATE0001"]);
  });
});

describe("⬇️ فتح الشهادة", () => {
  it("🔴 مش في القايمة ⇒ الحساب القديم بس (مايجرّبش الجديد أبداً)", async () => {
    mainHasFile = false;
    const { GET } = await import("@/app/api/certificate/download/route");
    const res = await GET(req("/api/certificate/download?fileId=PRIVATE0001"));
    expect(res.status).toBe(502);
    expect(downloadCalls.map((c) => c.token)).toEqual(["tok-main"]);
  });
  it("🔴 مختار ⇒ لو الملف مش على القديم بيتجاب من الجديد", async () => {
    mode = "both"; mainHasFile = false;
    const { GET } = await import("@/app/api/certificate/download/route");
    const res = await GET(req("/api/certificate/download?fileId=PRIVATE0001"));
    expect(res.status).toBe(200);
    expect(downloadCalls.map((c) => c.token)).toEqual(["tok-main", "tok-private"]);
  });
  it("🔴 «الجديد بس» ⇒ الجديد الأول", async () => {
    mode = "private_only";
    const { GET } = await import("@/app/api/certificate/download/route");
    const res = await GET(req("/api/certificate/download?fileId=PRIVATE0001"));
    expect(res.status).toBe(200);
    expect(downloadCalls[0].token).toBe("tok-private");
  });
  it("🔗 لينك واتساب (`/c/`) لشهادة خاصة بيفتح (الإذن هو التوقيع زي القديم)", async () => {
    mainHasFile = false;
    const { GET } = await import("@/app/c/[token]/route");
    const res = await GET(req("/c/t-PRIVATE0001"), { params: { token: "t-PRIVATE0001" } });
    expect(res.status).toBe(200);
    expect(downloadCalls.map((c) => c.token)).toEqual(["tok-main", "tok-private"]);
  });
});

describe("⏱️ الدورة كل دقيقة", () => {
  it("🔴 دورة لوحدها للحساب التاني (القديمة مابتتلمسش)", () => {
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    const paths = v.crons.map((c: { path: string }) => c.path);
    expect(paths).toContain("/api/cron/cert-daily");
    expect(paths).toContain("/api/cron/cert-daily-private");
    const r = readFileSync("app/api/cron/cert-daily-private/route.ts", "utf8");
    expect(r).toMatch(/getDriveAccessToken\("private"\)/);
    expect(r).toMatch(/cert_daily_private|CERT_SOURCE_TABLES\.private/);
    expect(r).toMatch(/runCertPush\("private"\)/);
    expect(r).toMatch(/cronAuthorized/);
  });
});

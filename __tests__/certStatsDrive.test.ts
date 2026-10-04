// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * 📊 إحصائيات الشهايد — جزء درايف والسيرفر والصفحة. المالك (٤ أكتوبر ٢٠٢٦): «مش عايز
 * التأخير دة يحصل … عايز كل الشهادات ميسيبش ولا شهادة ويجيب اسم الشركه بالظبط اللي منزله
 * الشهادة … انا مش عايز العدد يكون ناقص».
 */
const verifyAdminContext = vi.fn();
vi.mock("@/lib/supabaseAdmin", () => ({ verifyAdminContext: (...a: unknown[]) => verifyAdminContext(...a) }));
vi.mock("@/lib/apiAuth", () => ({ rateLimit: () => true }));
vi.mock("@/lib/gdrive", async (orig) => ({ ...(await orig<typeof import("@/lib/gdrive")>()), getDriveAccessToken: async () => "tok" }));

import { driveSearchWithStatus, driveListPage } from "@/lib/gdrive";

let urls: string[] = [];
const driveReplies = (...pages: object[]) => {
  urls = [];
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    urls.push(u);
    const p = pages[Math.min(i++, pages.length - 1)];
    return { ok: !("fail" in p), json: async () => p } as Response;
  }));
};
beforeEach(() => verifyAdminContext.mockResolvedValue({ id: "u1", isSuper: true }));
afterEach(() => vi.unstubAllGlobals());

describe("lib/gdrive", () => {
  it("🔴 صفحة واحدة مترتّبة بتاريخ الرفع + علامة الصفحة الجاية", async () => {
    driveReplies({ files: [{ id: "a", name: "x.pdf" }], nextPageToken: "T2" });
    const r = await driveListPage("q", "tok", { fields: "nextPageToken,files(createdTime)", pageToken: "T1", orderBy: "createdTime" });
    expect(r).toEqual({ ok: true, files: [{ id: "a", name: "x.pdf" }], next: "T2" });
    const u = decodeURIComponent(urls[0]);
    expect(u).toContain("pageToken=T1");
    expect(u).toContain("pageSize=1000");
    expect(u).toContain("orderBy=createdTime");
    expect(u).toContain("includeItemsFromAllDrives=true");
  });

  it("درايف رفض ⇒ ok=false", async () => {
    driveReplies({ fail: 1 });
    expect(await driveListPage("q", "tok", { fields: "nextPageToken,files(id)" })).toEqual({ ok: false, files: [], next: null });
  });

  it("البحث العادي (شهادة العربية) زي ما هو بالظبط", async () => {
    driveReplies({ files: [] });
    await driveSearchWithStatus("q", "tok");
    expect(decodeURIComponent(urls[0])).toContain("fields=nextPageToken,files(id,name,webViewLink)");
  });
});

describe("🔴 /api/admin/cert-stats/files — خطوة", () => {
  const get = async (qs: string) => {
    const { GET } = await import("@/app/api/admin/cert-stats/files/route");
    return GET(new Request("http://localhost/api/admin/cert-stats/files" + qs, { headers: { Authorization: "Bearer x" } }) as never);
  };

  it("سوبر أدمن بس — ومايسألش درايف", async () => {
    verifyAdminContext.mockResolvedValue({ id: "u1", isSuper: false });
    driveReplies({ files: [] });
    expect((await get("")).status).toBe(403);
    expect(urls).toHaveLength(0);
  });

  it("🔴 كل الـPDF في الفترة (من غير المحذوف) · مترتّب بتاريخ الرفع · باللي رفع (اسمه وإيميله)", async () => {
    driveReplies({ files: [
      { createdTime: "2026-10-04T05:00:00.000Z", owners: [{ displayName: "شركة قمة", emailAddress: "a@qemma.sa" }] },
      { createdTime: "2026-10-04T06:00:00.000Z", lastModifyingUser: { displayName: "التحصيل", emailAddress: "d@tahseel.sa" } },
    ] });
    const res = await get("?after=2026-10-01T00:00:00.000Z&until=2026-10-05T00:00:00.000Z&pageToken=P");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      counts: { "a@qemma.sa": { "2026-10-04": 1 }, "d@tahseel.sa": { "2026-10-04": 1 } },
      people: { "a@qemma.sa": "شركة قمة", "d@tahseel.sa": "التحصيل" },
      n: 2, next: null, resume: null,
    });
    const u = new URL(urls[0]).searchParams;
    expect(u.get("q")).toBe("mimeType='application/pdf' and trashed=false and createdTime >= '2026-10-01T00:00:00.000Z' and createdTime < '2026-10-05T00:00:00.000Z'");
    expect(u.get("orderBy")).toBe("createdTime");
    expect(u.get("pageToken")).toBe("P");
    expect(u.get("fields")).toContain("owners(displayName,emailAddress)");
    expect(u.get("fields")).toContain("lastModifyingUser(displayName,emailAddress)");
  });

  it("من غير فترة ⇒ الأرشيف كله (مافيش اسم ملف بيتفلتر)", async () => {
    driveReplies({ files: [] });
    await get("");
    expect(new URL(urls[0]).searchParams.get("q")).toBe("mimeType='application/pdf' and trashed=false");
  });

  it("تاريخ مش سليم ⇒ مرفوض ومايدخلش سؤال درايف", async () => {
    driveReplies({ files: [] });
    expect((await get("?after=" + encodeURIComponent("2026-10-01T00:00:00Z' or name contains '1"))).status).toBe(400);
    expect(urls).toHaveLength(0);
  });

  it("درايف فشل ⇒ 502 (الصفحة بتعيد الخطوة — مش بتكمّل بنتيجة ناقصة)", async () => {
    driveReplies({ fail: 1 });
    expect((await get("")).status).toBe(502);
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

  it("الطلب الواحد الطويل وأسامي الفولدرات اتشالوا", () => {
    expect(existsSync("app/api/admin/cert-stats/route.ts")).toBe(false);
    expect(existsSync("app/api/admin/cert-stats/folders/route.ts")).toBe(false);
  });

  it("🔴 الصفحة: العدّ كله مع بعض · المحفوظ يظهر على طول · الاسم والإيميل · مفيش تحذير «ناقص»", () => {
    const p = read("app/admin/certificates/page.tsx");
    expect(p).toMatch(/countAll\(/);
    expect(p).toMatch(/\/api\/admin\/cert-stats\/files/);
    expect(p).toMatch(/ph:certStatsCache:v2/);
    expect(p).toMatch(/اتقرا \{n\(progress\)\}/);
    expect(p).toMatch(/c\.email/);
    expect(p).toMatch(/إجمالي الشهايد/);
    expect(p).toMatch(/كل شركة رافعة كام/);
    expect(p).toMatch(/اترفع كام كل يوم/);
    expect(p).not.toMatch(/ناقص|truncated|otherPdfs|عدّ من الأول/);
    const admin = read("app/admin/page.tsx");
    expect(admin).toMatch(/\{isSuper && \(\s*<button onClick=\{\(\) => router\.push\("\/admin\/certificates"\)\}/);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { driveSearchWithStatus, driveGetFolder } from "@/lib/gdrive";

/**
 * 📊 إحصائيات الشهايد — جزء درايف (قايمة كل الـPDF بتاريخ رفعها وفولدرها + اسم الفولدر)،
 * والراوت والصفحة. المالك (٤ أكتوبر ٢٠٢٦): إجمالي الشهايد · كل شركة · كل يوم.
 */
afterEach(() => vi.unstubAllGlobals());

describe("lib/gdrive — اللي الإحصائيات محتاجاه", () => {
  it("🔴 الحقول بتتطلب (تاريخ الرفع والفولدر) وعدد الصفحات بيتحدد", async () => {
    const urls: string[] = [];
    let page = 0;
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      urls.push(u);
      page++;
      return { ok: true, json: async () => ({ files: [{ id: "f" + page, name: "x.pdf" }], nextPageToken: "t" + page }) } as Response;
    }));
    const r = await driveSearchWithStatus("q", "tok", { fields: "nextPageToken,files(id,name,createdTime,parents)", maxPages: 3, maxFiles: 100 });
    expect(urls).toHaveLength(3);
    expect(decodeURIComponent(urls[0])).toContain("fields=nextPageToken,files(id,name,createdTime,parents)");
    expect(r.files).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it("من غير خيارات ⇒ نفس الحقول القديمة بالظبط (البحث العادي مايتأثرش)", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return { ok: true, json: async () => ({ files: [] }) } as Response; }));
    await driveSearchWithStatus("q", "tok");
    expect(decodeURIComponent(urls[0])).toContain("fields=nextPageToken,files(id,name,webViewLink)");
  });

  it("🔴 اسم الفولدر وأبوه — ومش متاح ⇒ null", async () => {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => (u.includes("/files/ok?")
      ? { ok: true, json: async () => ({ id: "ok", name: "تمويل أ", parents: ["p"] }) }
      : { ok: false, json: async () => ({}) }) as Response));
    expect(await driveGetFolder("ok", "tok")).toEqual({ name: "تمويل أ", parents: ["p"] });
    expect(await driveGetFolder("gone", "tok")).toBeNull();
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

  it("الراوت: للسوبر أدمن بس، كل الـPDF (من غير المحذوف) بتاريخ الرفع والفولدر، ومحفوظ نص ساعة", () => {
    const r = read("app/api/admin/cert-stats/route.ts");
    expect(r).toMatch(/verifyAdminContext\(/);
    expect(r).toMatch(/!admin\.isSuper/);
    expect(r).toMatch(/mimeType='application\/pdf' and trashed=false/);
    expect(r).toMatch(/createdTime,parents/);
    expect(r).toMatch(/resolveTopFolders\(/);
    expect(r).toMatch(/buildCertStats\(/);
    expect(r).toMatch(/export const maxDuration = \d+/);
    expect(r).toMatch(/CACHE_MS = 30 \* 60_000/);
  });

  it("الصفحة: الإجمالي · كل شركة · كل يوم — وزرارها في لوحة الأدمن للسوبر أدمن بس", () => {
    const p = read("app/admin/certificates/page.tsx");
    expect(p).toMatch(/إجمالي الشهايد/);
    expect(p).toMatch(/كل شركة رافعة كام/);
    expect(p).toMatch(/اترفع كام كل يوم/);
    expect(p).toMatch(/\/api\/admin\/cert-stats/);
    const admin = read("app/admin/page.tsx");
    expect(admin).toMatch(/\{isSuper && \(\s*<button onClick=\{\(\) => router\.push\("\/admin\/certificates"\)\}/);
  });
});

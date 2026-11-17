import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 🔒 الشهايد الخاصة — توصيل حساب الدرايف التاني (`GDRIVE2_*`) من غير ما القديم يتلمس،
 * وذاكرة بحث عمود «شهايد» منفصلة لكل حساب (ماتسرّبش شهادة خاصة لحد مش متختار).
 */

const ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env.GDRIVE_CLIENT_ID = "main-id";
  process.env.GDRIVE_CLIENT_SECRET = "main-secret";
  process.env.GDRIVE_REFRESH_TOKEN = "main-refresh";
  delete process.env.GDRIVE2_REFRESH_TOKEN;
  delete process.env.GDRIVE2_CLIENT_ID;
  delete process.env.GDRIVE2_CLIENT_SECRET;
});
afterEach(() => {
  process.env = { ...ENV };
  vi.unstubAllGlobals();
});

function stubTokenEndpoint() {
  const bodies: URLSearchParams[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: URLSearchParams }) => {
    bodies.push(new URLSearchParams(init.body));
    const rt = new URLSearchParams(init.body).get("refresh_token");
    return new Response(JSON.stringify({ access_token: `access-for-${rt}`, expires_in: 3600 }), { status: 200 });
  }));
  return bodies;
}

describe("🔑 توكن درايف", () => {
  it("🔴 القديم زي ما هو: من غير اختيار ⇒ الحساب القديم", async () => {
    stubTokenEndpoint();
    const { getDriveAccessToken } = await import("@/lib/gdrive");
    expect(await getDriveAccessToken()).toBe("access-for-main-refresh");
    expect(await getDriveAccessToken("main")).toBe("access-for-main-refresh");
  });

  it("🔴 الحساب التاني بمفتاحه هو، وبنفس بيانات التطبيق لو مالوش بيانات لوحده", async () => {
    process.env.GDRIVE2_REFRESH_TOKEN = "private-refresh";
    const bodies = stubTokenEndpoint();
    const { getDriveAccessToken, privateDriveConfigured } = await import("@/lib/gdrive");
    expect(privateDriveConfigured()).toBe(true);
    expect(await getDriveAccessToken("private")).toBe("access-for-private-refresh");
    expect(bodies[0].get("client_id")).toBe("main-id");
    expect(bodies[0].get("client_secret")).toBe("main-secret");
  });

  it("الحساب التاني ببيانات تطبيق لوحده لو اتحطت", async () => {
    process.env.GDRIVE2_REFRESH_TOKEN = "private-refresh";
    process.env.GDRIVE2_CLIENT_ID = "p-id";
    process.env.GDRIVE2_CLIENT_SECRET = "p-secret";
    const bodies = stubTokenEndpoint();
    const { getDriveAccessToken } = await import("@/lib/gdrive");
    await getDriveAccessToken("private");
    expect(bodies[0].get("client_id")).toBe("p-id");
    expect(bodies[0].get("client_secret")).toBe("p-secret");
  });

  it("🔴 كل حساب ليه ذاكرة توكن لوحده (مايدّيش توكن القديم للجديد ولا العكس)", async () => {
    process.env.GDRIVE2_REFRESH_TOKEN = "private-refresh";
    stubTokenEndpoint();
    const { getDriveAccessToken } = await import("@/lib/gdrive");
    expect(await getDriveAccessToken("main")).toBe("access-for-main-refresh");
    expect(await getDriveAccessToken("private")).toBe("access-for-private-refresh");
    expect(await getDriveAccessToken("main")).toBe("access-for-main-refresh");
  });

  it("الحساب التاني لسه ماتوصلش ⇒ null (والقديم شغّال عادي)", async () => {
    stubTokenEndpoint();
    const { getDriveAccessToken, privateDriveConfigured } = await import("@/lib/gdrive");
    expect(privateDriveConfigured()).toBe(false);
    expect(await getDriveAccessToken("private")).toBeNull();
    expect(await getDriveAccessToken()).toBe("access-for-main-refresh");
  });
});

describe("📄 ذاكرة عمود «شهايد» منفصلة لكل حساب", () => {
  it("🔴 نتيجة الحساب التاني ماتطلعش لحد بيدوّر في القديم", async () => {
    const { batchFindCertificates, clearCertBatchCache } = await import("@/lib/certBatch");
    clearCertBatchCache();
    const privSearch = vi.fn(async () => ({ files: [{ id: "PRIV1", name: "ابح1234.pdf" }], ok: true, truncated: false }));
    const mainSearch = vi.fn(async () => ({ files: [], ok: true, truncated: false }));
    const p = await batchFindCertificates(["ابح1234"], privSearch, 1_000, "private");
    expect(p.results["ابح1234"].map((h) => h.id)).toEqual(["PRIV1"]);
    const m = await batchFindCertificates(["ابح1234"], mainSearch, 1_001);
    expect(mainSearch).toHaveBeenCalled();           // ماخدش من ذاكرة الحساب التاني
    expect(m.results["ابح1234"]).toEqual([]);
  });
});

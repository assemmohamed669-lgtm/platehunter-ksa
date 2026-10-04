import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 📄 شهايد الجداول **محفوظة على الموبايل** — المالك (٤ أكتوبر ٢٠٢٦): «ليه بيأخر كتير
 * علي ما بيدور علي الشهايد؟». كل فتحة للبرنامج كانت بتسأل عن كل العربيات من الأول.
 * دلوقتي اللي اتعرف بيظهر **على طول**:
 *  · «ليها شهادة» بتتفتكر يوم (الشهادة مابتختفيش).
 *  · «مالهاش» ربع ساعة بس (شهادة جديدة اترفعت تظهر).
 *  · «تعذّر» مابتتفتكرش.
 */
vi.mock("@/lib/authHeader", () => ({ authHeader: async () => ({}) }));
vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) } },
}));

type Body = { plates: string[] };
let posts: Body[] = [];
let failAll = false;

beforeEach(() => {
  localStorage.clear();
  posts = [];
  failAll = false;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body) as Body;
    posts.push(b);
    const results = failAll ? {} : Object.fromEntries(b.plates.map((p) => [p, p.includes("1234") ? [{ id: "c1", name: "ا ب ح 1234.pdf" }] : []]));
    return { ok: true, json: async () => ({ results, failed: failAll ? b.plates : [] }) } as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

/** التطبيق اتقفل واتفتح: الذاكرة بتتمسح، والموبايل (localStorage) لأ. */
async function freshApp() {
  vi.resetModules();
  return import("@/lib/certificateBatch");
}

describe("🔴 الشهايد محفوظة على الموبايل", () => {
  it("🔴 الفتحة الجاية بتظهر النتيجة على طول من غير ما تسأل", async () => {
    const a = await freshApp();
    a.requestCertificates(["ابح1234", "دهو5678"], 1_000);
    await vi.waitFor(() => expect(a.getCertState("دهو5678")?.s).toBe("none"));

    const b = await freshApp();
    expect(b.getCertState("ابح1234")).toMatchObject({ s: "found", cert: { id: "c1", name: "ا ب ح 1234.pdf" } });
    expect(b.getCertState("دهو5678")).toEqual({ s: "none" });
    b.requestCertificates(["ابح1234", "دهو5678"], 2_000);
    await new Promise((r) => setTimeout(r, 0));
    expect(posts).toHaveLength(1);
  });

  it("«مالهاش» بتتسأل تاني بعد ربع ساعة، و«ليها» لسه محفوظة", async () => {
    const a = await freshApp();
    a.requestCertificates(["ابح1234", "دهو5678"], 0);
    await vi.waitFor(() => expect(a.getCertState("دهو5678")?.s).toBe("none"));

    const b = await freshApp();
    expect(b.CERT_STATE_TTL_MS).toBe(15 * 60_000);
    expect(b.CERT_FOUND_TTL_MS).toBe(24 * 60 * 60_000);
    b.requestCertificates(["ابح1234", "دهو5678"], b.CERT_STATE_TTL_MS + 1);
    await vi.waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].plates).toEqual([b.certKey("دهو5678")]);
    b.requestCertificates(["ابح1234"], b.CERT_FOUND_TTL_MS + 1);
    await vi.waitFor(() => expect(posts).toHaveLength(3));
  });

  it("«تعذّر» مابتتحفظش — الفتحة الجاية بتسأل تاني", async () => {
    failAll = true;
    const a = await freshApp();
    a.requestCertificates(["ابح1234"], 0);
    await vi.waitFor(() => expect(a.getCertState("ابح1234")?.s).toBe("error"));
    const b = await freshApp();
    expect(b.getCertState("ابح1234")).toBeUndefined();
  });

  it("تخزين بايظ مايوقّعش حاجة", async () => {
    localStorage.setItem("ph:certStates:v1", "{not json");
    const a = await freshApp();
    expect(a.getCertState("ابح1234")).toBeUndefined();
    a.requestCertificates(["ابح1234"], 0);
    await vi.waitFor(() => expect(a.getCertState("ابح1234")?.s).toBe("found"));
  });
});

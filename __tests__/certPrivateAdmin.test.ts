// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * 🔒 الشهايد الخاصة — لوحة التحكّم (`/api/admin/cert-private`): **السوبر أدمن بس** بيضيف/يشيل بالاسم ويختار لكل واحد
 * «الجديد بس» أو «الجديد والقديم».
 */

let admin: { id: string; isSuper: boolean } | null = { id: "super1", isSuper: true };
let rows: { agent_id: string; mode: string; added_at: string }[] = [];
const sets: unknown[][] = [];
const removes: string[] = [];
let listThrows: { code: string; message: string } | null = null;
const profileQueries: string[][] = [];

vi.mock("@/lib/supabaseAdmin", () => {
  const profiles = [
    { id: "a1", username: "محمد ابو عبده", team: null },
    { id: "a2", username: "احمد حسني", team: "مجموعه سلام" },
  ];
  const chain = (ops: string[]) => {
    const p: Record<string, unknown> = {};
    for (const m of ["select", "ilike", "in", "order", "limit", "eq"]) p[m] = (...a: unknown[]) => { ops.push(`${m}:${JSON.stringify(a)}`); return p; };
    p.then = (res: (v: unknown) => void) => {
      const inArg = ops.find((o) => o.startsWith("in:"));
      const ids: string[] = inArg ? JSON.parse(inArg.slice(3))[1] : [];
      const data = inArg ? profiles.filter((x) => ids.includes(x.id)) : profiles.filter((x) => x.username.includes("عبده"));
      res({ data, error: null });
    };
    return p;
  };
  return {
    supabaseAdmin: { from: (t: string) => { const ops: string[] = [t]; profileQueries.push(ops); return chain(ops); } },
    verifyAdminContext: async () => admin,
  };
});
vi.mock("@/lib/certAccessStore", () => ({
  listCertAccess: async () => { if (listThrows) throw Object.assign(new Error(listThrows.message), { code: listThrows.code }); return rows; },
  setCertAccess: async (...a: unknown[]) => { sets.push(a); },
  removeCertAccess: async (id: string) => { removes.push(id); },
}));
vi.mock("@/lib/certDailyStore", () => ({ countDayCerts: async () => ({ total: 4, parsed: 3 }) }));
vi.mock("@/lib/gdrive", () => ({ privateDriveConfigured: () => true }));

beforeEach(() => {
  admin = { id: "super1", isSuper: true };
  rows = []; sets.length = 0; removes.length = 0; listThrows = null; profileQueries.length = 0;
});

const get = (q = "") => new NextRequest(`http://localhost/api/admin/cert-private${q}`, { headers: { authorization: "Bearer x" } });
const post = (body: unknown) => new NextRequest("http://localhost/api/admin/cert-private", {
  method: "POST", headers: { authorization: "Bearer x", "content-type": "application/json" }, body: JSON.stringify(body),
});

describe("🔒 السوبر أدمن بس", () => {
  it("🔴 أدمن عادي ⇒ ممنوع (قراية وتعديل)", async () => {
    admin = { id: "adm", isSuper: false };
    const { GET, POST } = await import("@/app/api/admin/cert-private/route");
    expect((await GET(get())).status).toBe(403);
    expect((await POST(post({ action: "add", agentId: "a1", mode: "both" }))).status).toBe(403);
    expect(sets).toHaveLength(0);
  });
  it("🔴 مش داخل ⇒ ممنوع", async () => {
    admin = null;
    const { GET } = await import("@/app/api/admin/cert-private/route");
    expect((await GET(get())).status).toBe(403);
  });
});

describe("👥 القايمة", () => {
  it("🔴 المختارين بأساميهم ووضعهم + حالة الحساب التاني وعدد النهارده", async () => {
    rows = [{ agent_id: "a2", mode: "private_only", added_at: "2026-11-17T10:00:00Z" }];
    const { GET } = await import("@/app/api/admin/cert-private/route");
    const body = await (await GET(get())).json();
    expect(body.configured).toBe(true);
    expect(body.today).toEqual({ total: 4, parsed: 3 });
    expect(body.members).toEqual([{ agentId: "a2", name: "احمد حسني", team: "مجموعه سلام", mode: "private_only" }]);
  });
  it("الجداول لسه ماتعملتش ⇒ `setup: true` (الصفحة بتقول «محتاج خطوة على سوبابيز»)", async () => {
    listThrows = { code: "42P01", message: 'relation "cert_private_access" does not exist' };
    const { GET } = await import("@/app/api/admin/cert-private/route");
    const body = await (await GET(get())).json();
    expect(body.setup).toBe(true);
  });
  it("🔴 البحث بالاسم", async () => {
    const { GET } = await import("@/app/api/admin/cert-private/route");
    const body = await (await GET(get("?q=" + encodeURIComponent("عبده")))).json();
    expect(body.matches).toEqual([{ agentId: "a1", name: "محمد ابو عبده", team: null }]);
    expect(profileQueries[0].some((o) => o.startsWith("ilike:") && o.includes("عبده"))).toBe(true);
  });
});

describe("✏️ إضافة / تغيير / شيل", () => {
  it("🔴 إضافة بوضع", async () => {
    const { POST } = await import("@/app/api/admin/cert-private/route");
    expect((await POST(post({ action: "add", agentId: "a1", mode: "private_only" }))).status).toBe(200);
    expect(sets).toEqual([["a1", "private_only", "super1"]]);
  });
  it("🔴 تغيير الوضع", async () => {
    const { POST } = await import("@/app/api/admin/cert-private/route");
    await POST(post({ action: "mode", agentId: "a1", mode: "both" }));
    expect(sets).toEqual([["a1", "both", "super1"]]);
  });
  it("🔴 شيل", async () => {
    const { POST } = await import("@/app/api/admin/cert-private/route");
    await POST(post({ action: "remove", agentId: "a1" }));
    expect(removes).toEqual(["a1"]);
  });
  it("وضع غريب أو مندوب ناقص ⇒ مرفوض", async () => {
    const { POST } = await import("@/app/api/admin/cert-private/route");
    expect((await POST(post({ action: "add", agentId: "a1", mode: "everyone" }))).status).toBe(400);
    expect((await POST(post({ action: "add", mode: "both" }))).status).toBe(400);
    expect((await POST(post({ action: "nuke", agentId: "a1" }))).status).toBe(400);
    expect(sets).toHaveLength(0);
  });
});

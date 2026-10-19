// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 📍 «املأ الحي والشارع» — السيرفر (`app/api/area-fill/route.ts`).
 *  · السوبر أدمن ⇒ أي مندوب بالـID بتاعه. غيره ⇒ سجلاته هو بس (ولما الزرار يتفتح للكل).
 *  · «scan» ⇒ السجلات اللي **ليها موقع ومن غير حي** بس.
 *  · «apply» ⇒ بيضيف عمود الحي على `extra` **ومابيلمسش أي حاجة تانية** — ولو السجل خد حي في النص مابيكتبش فوقه.
 */
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  updates: [] as { table: string; patch: Row; n: number }[],
}));

vi.mock("@/lib/supabaseAdmin", () => {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let lim = Infinity;
    let ord: string | null = null;
    let patch: Row | null = null;
    const run = () => {
      const out = (h.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (ord) { const k = ord; out.sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1)); }
      return out.slice(0, lim);
    };
    const exec = () => {
      if (patch) {
        const hit = run();
        hit.forEach((r) => Object.assign(r, patch));
        h.updates.push({ table, patch, n: hit.length });
        return { data: null, error: null };
      }
      return { data: run(), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      not: (k: string) => { filters.push((r) => r[k] !== null && r[k] !== undefined); return b; },
      gt: (k: string, v: unknown) => { filters.push((r) => String(r[k]) > String(v)); return b; },
      in: (k: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[k])); return b; },
      order: (k: string) => { ord = k; return b; },
      limit: (n: number) => { lim = n; return b; },
      update: (p: Row) => { patch = p; return b; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
    };
    return b;
  }
  return {
    supabaseAdmin: {
      from,
      auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null }, error: null }) },
    },
  };
});

const SUPER = "11111111-1111-4111-8111-111111111111";
const AGENT = "56627d4f-1e8c-4f74-bf1e-8e75077d5143";
const OTHER = "22222222-2222-4222-8222-222222222222";

async function post(jwt: string, body: object) {
  const { POST } = await import("@/app/api/area-fill/route");
  const res = await POST(new Request("http://localhost/api/area-fill", {
    method: "POST", headers: { Authorization: "Bearer " + jwt, "Content-Type": "application/json" }, body: JSON.stringify(body),
  }) as never);
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  h.updates.length = 0;
  h.tables = {
    profiles: [
      { id: SUPER, role: "admin", is_super: true, is_active: true, username: "المالك" },
      { id: AGENT, role: "agent", is_super: false, is_active: true, username: "مندوب الآيفون" },
      { id: OTHER, role: "agent", is_super: false, is_active: true, username: "تاني" },
    ],
    field_checks: [
      { id: "001", local_id: "fc-trial-a-1", agent_id: AGENT, lat: 24.7, lng: 46.6, checked_at: "2026-10-01T10:00:00Z", extra: { "رقم اللوحة": "ابح1234", "النوع": "ج" } },
      { id: "002", local_id: "fc-trial-a-2", agent_id: AGENT, lat: 24.71, lng: 46.61, checked_at: "2026-10-01T10:01:00Z", extra: { "اسم الحي - الشارع": "كتبه المندوب" } },
      { id: "003", local_id: "fc-cam-3", agent_id: AGENT, lat: null, lng: null, checked_at: "2026-10-01T10:02:00Z", extra: {} },
      { id: "004", local_id: "fc-cam-4", agent_id: AGENT, lat: 24.72, lng: 46.62, checked_at: "2026-10-01T10:03:00Z", extra: null },
      { id: "005", local_id: "fc-trial-o-1", agent_id: OTHER, lat: 24.7, lng: 46.6, checked_at: "2026-10-01T10:00:00Z", extra: {} },
    ],
  };
});

describe("🔒 مين يقدر", () => {
  it("مفيش جلسة ⇒ 401", async () => {
    expect((await post("", { action: "scan", agentId: AGENT })).status).toBe(401);
  });
  it("مندوب على سجلات مندوب تاني ⇒ ممنوع", async () => {
    const r = await post(OTHER, { action: "scan", agentId: AGENT });
    expect(r.status).toBe(403);
  });
  it("مندوب على سجلاته هو والزرار لسه للسوبر أدمن بس ⇒ ممنوع", async () => {
    const r = await post(AGENT, { action: "scan" });
    expect(r.status).toBe(403);
  });
  it("ID غلط ⇒ رسالة واضحة", async () => {
    const r = await post(SUPER, { action: "scan", agentId: "مش id" });
    expect(r.status).toBe(400);
    const r2 = await post(SUPER, { action: "scan", agentId: "33333333-3333-4333-8333-333333333333" });
    expect(r2.status).toBe(404);
    expect(r2.json.error).toContain("مش موجود");
  });
});

describe("🔎 scan", () => {
  it("السوبر أدمن بالـID ⇒ اللي ليها موقع ومن غير حي بس (ومن المندوب ده بس) + اسمه", async () => {
    const r = await post(SUPER, { action: "scan", agentId: AGENT });
    expect(r.status).toBe(200);
    expect(r.json.items.map((i: { id: string }) => i.id)).toEqual(["fc-trial-a-1", "fc-cam-4"]);
    expect(r.json.items[0]).toEqual({ id: "fc-trial-a-1", lat: 24.7, lng: 46.6, at: "2026-10-01T10:00:00Z" });
    expect(r.json.name).toBe("مندوب الآيفون");
    expect(r.json.next).toBeNull();
  });
});

describe("✍️ apply", () => {
  it("بيضيف الحي في عموده ومابيلمسش الباقي، واللي ليه حي مابيتكتبش فوقه", async () => {
    const r = await post(SUPER, { action: "apply", agentId: AGENT, items: [
      { id: "fc-trial-a-1", street: "شارع ٣٠", district: "النسيم" },
      { id: "fc-trial-a-2", street: "شارع ٣٠", district: "النسيم" },
      { id: "fc-cam-4", street: "طريق الملك", district: "العليا" },
    ] });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ updated: 2, skipped: 1 });
    const fc = h.tables.field_checks;
    expect(fc[0].extra).toEqual({ "رقم اللوحة": "ابح1234", "النوع": "ج", "اسم الحي - الشارع": "شارع ٣٠ - النسيم" });
    expect(fc[1].extra).toEqual({ "اسم الحي - الشارع": "كتبه المندوب" });
    expect(fc[3].extra).toEqual({ "الحي-الشارع": "طريق الملك - العليا" });
    // التحديث بيغيّر extra بس
    expect(h.updates.every((u) => Object.keys(u.patch).join() === "extra" && u.n === 1)).toBe(true);
  });
  it("سجل مندوب تاني بنفس الـID في الطلب ⇒ مايتلمسش", async () => {
    await post(SUPER, { action: "apply", agentId: AGENT, items: [{ id: "fc-trial-o-1", street: "ش", district: "ح" }] });
    expect(h.tables.field_checks[4].extra).toEqual({});
    expect(h.updates.length).toBe(0);
  });
  it("دفعة كبيرة أوي ⇒ مرفوضة", async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ id: "x" + i, street: "ش", district: "ح" }));
    expect((await post(SUPER, { action: "apply", agentId: AGENT, items })).status).toBe(400);
  });
});

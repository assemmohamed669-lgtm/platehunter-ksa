import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * 🔒 الشهايد الخاصة — التخزين: الجديد في جدوله لوحده، والقديم بنفس جدوله لو ماحدّدناش (زي الأول بالظبط).
 * وقايمة المختارين: لو الجدول لسه ماتعملش ⇒ «مش في القايمة» (يعني كل حد زي دلوقتي) — مانكسرش حاجة.
 */

const calls: { table: string; ops: string[] }[] = [];
let nextResult: { data: unknown; error: unknown; count?: number } = { data: [], error: null };

function builder(table: string) {
  const rec = { table, ops: [] as string[] };
  calls.push(rec);
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: (v: unknown) => void) => res(nextResult);
      return (...args: unknown[]) => { rec.ops.push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(",")})`); return proxy; };
    },
  });
  return proxy;
}

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => builder(t) } }));

beforeEach(() => { calls.length = 0; nextResult = { data: [], error: null }; });

describe("📦 جدول الشهايد", () => {
  it("🔴 من غير تحديد ⇒ الجدول القديم (cert_daily) زي الأول", async () => {
    const s = await import("@/lib/certDailyStore");
    await s.readDayCerts("2026-11-17");
    await s.countDayCerts("2026-11-17");
    await s.insertNewCerts([]);
    await s.pendingCerts("2026-11-10", 5);
    await s.cleanupCerts("2026-11-10");
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(["cert_daily"]));
  });

  it("🔴 الجديد ⇒ جدوله لوحده (cert_daily_private) وبس", async () => {
    const s = await import("@/lib/certDailyStore");
    const T = "cert_daily_private";
    await s.readDayCerts("2026-11-17", T);
    await s.countDayCerts("2026-11-17", T);
    await s.insertNewCerts([], T);
    await s.pendingCerts("2026-11-10", 5, T);
    await s.saveParsedCert("abcdefghij1", null, 1, false, T);
    await s.requeueNoPlateCerts("2026-11-10", "2026-11-01T00:00:00Z", T);
    await s.requeueMissingCertNoCerts("2026-11-10", T);
    await s.requeueMissingTenantCerts("2026-11-10", T);
    await s.requeueStaleFieldsCerts("2026-11-10", "2026-11-01T00:00:00Z", T);
    await s.cleanupCerts("2026-11-10", T);
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set([T]));
  });
});

describe("👥 قايمة المختارين", () => {
  it("🔴 مندوب في القايمة ⇒ وضعه", async () => {
    nextResult = { data: { mode: "private_only" }, error: null };
    const { certAccessOf } = await import("@/lib/certAccessStore");
    expect(await certAccessOf("u1")).toBe("private_only");
    expect(calls[0].table).toBe("cert_private_access");
  });
  it("🔴 مش في القايمة ⇒ null", async () => {
    nextResult = { data: null, error: null };
    const { certAccessOf } = await import("@/lib/certAccessStore");
    expect(await certAccessOf("u1")).toBeNull();
  });
  it("🔴 الجدول لسه ماتعملش (أو الداتابيز ماردّتش) ⇒ null — كل حد زي دلوقتي", async () => {
    nextResult = { data: null, error: { code: "42P01", message: 'relation "cert_private_access" does not exist' } };
    const { certAccessOf, certAccessMap } = await import("@/lib/certAccessStore");
    expect(await certAccessOf("u1")).toBeNull();
    expect((await certAccessMap()).size).toBe(0);
  });
  it("الخريطة للإشعار: كل المختارين بوضعهم", async () => {
    nextResult = { data: [{ agent_id: "a", mode: "both" }, { agent_id: "b", mode: "private_only" }, { agent_id: "c", mode: "??" }], error: null };
    const { certAccessMap } = await import("@/lib/certAccessStore");
    const m = await certAccessMap();
    expect([...m]).toEqual([["a", "both"], ["b", "private_only"]]);
  });
});

describe("🔔 حالة الإشعار لكل حساب", () => {
  const src = readFileSync("lib/certPushStore.ts", "utf8");
  it("🔴 القديم بنفس جدوله وحالته (الافتراضي)، والجديد بجدول وحالة لوحدهم", () => {
    expect(src).toMatch(/export async function runCertPush\(source: CertSource = "main"\)/);
    expect(src).toMatch(/CERT_PUSH_STATE_TABLES\[source\]/);
    expect(src).toMatch(/CERT_SOURCE_TABLES\[source\]/);
    expect(src).toMatch(/pushAudience\(/);
    expect(src).not.toMatch(/from\("cert_daily"\)/);
    expect(src).not.toMatch(/from\("cert_push_state"\)/);
  });
});

describe("🗄️ الـSQL", () => {
  const sql = readFileSync("docs/sql/cert-private.sql", "utf8");
  it("🔴 ٣ جداول جديدة بس — والقديم مابيتلمسش", () => {
    expect(sql).toMatch(/create table if not exists public\.cert_daily_private/);
    expect(sql).toMatch(/create table if not exists public\.cert_push_state_private/);
    expect(sql).toMatch(/create table if not exists public\.cert_private_access/);
    expect(sql).not.toMatch(/alter table public\.cert_daily\s/);
    expect(sql).not.toMatch(/drop /i);
  });
  it("🔴 للسيرفر بس (RLS من غير سياسات + المنح صريح لـservice_role)", () => {
    for (const t of ["cert_daily_private", "cert_push_state_private", "cert_private_access"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant [a-z, ]+ on public\\.${t} to service_role`));
    }
    expect(sql).toMatch(/check \(mode in \('private_only', 'both'\)\)/);
  });
});

// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * 📊 إحصائيات الشهايد — درايف + السيرفر + الصفحة. المالك (٤ أكتوبر ٢٠٢٦): العدّ من الموبايل
 * قعد ربع ساعة وعدّى ٦٠٠ ألف ملف ⇒ السيرفر بيعدّ لوحده في الخلفية (دورة كل دقيقة) ويحفظ،
 * والصفحة بتقرا آخر نتيجة على طول — بعدد اللوحات المختلفة جنب عدد الملفات.
 */
const verifyAdminContext = vi.fn();
let stateRow: { data: unknown; error: unknown } = { data: null, error: null };
let selected = "";
vi.mock("@/lib/supabaseAdmin", () => {
  const chain = {
    select: (s: string) => { selected = s; return chain; },
    eq: () => chain,
    maybeSingle: async () => stateRow,
  };
  return {
    verifyAdminContext: (...a: unknown[]) => verifyAdminContext(...a),
    supabaseAdmin: { from: () => chain },
  };
});

import { driveSearchWithStatus, driveListPage } from "@/lib/gdrive";
import { snapshotFromPass, newPass, stepFromPage } from "@/lib/certStats";

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
beforeEach(() => {
  verifyAdminContext.mockResolvedValue({ id: "u1", isSuper: true });
  stateRow = { data: null, error: null };
});
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
  });

  it("🔴 سؤال علّق أكتر من الحد ⇒ بيتقفل وok=false (مايوقفش دورة السيرفر)", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init?: RequestInit) => new Promise((_, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    })));
    const r = await driveListPage("q", "tok", { fields: "nextPageToken,files(id)", timeoutMs: 20 });
    expect(r).toEqual({ ok: false, files: [], next: null });
  });

  it("البحث العادي (شهادة العربية) زي ما هو بالظبط", async () => {
    driveReplies({ files: [] });
    await driveSearchWithStatus("q", "tok");
    expect(decodeURIComponent(urls[0])).toContain("fields=nextPageToken,files(id,name,webViewLink)");
  });
});

describe("🔴 /api/admin/cert-stats — آخر نتيجة (الصفحة)", () => {
  const get = async () => {
    const { GET } = await import("@/app/api/admin/cert-stats/route");
    return GET(new Request("http://localhost/api/admin/cert-stats", { headers: { Authorization: "Bearer x" } }) as never);
  };

  it("سوبر أدمن بس", async () => {
    verifyAdminContext.mockResolvedValue({ id: "u1", isSuper: false });
    expect((await get()).status).toBe(403);
  });

  it("الجدول لسه ماتعملش ⇒ setup (الصفحة بتقول محتاج خطوة سوبابيز)", async () => {
    stateRow = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.cert_stats_state' in the schema cache" } };
    expect(await (await get()).json()).toEqual({ setup: true });
  });

  it("🔴 النتيجة المحفوظة ⇒ اللوحات المختلفة + الملفات + كل شركة — من غير طابور العدّ", async () => {
    const now = new Date();
    const r = stepFromPage([
      { id: "1", name: "س د ط 2539.pdf", createdTime: now.toISOString(), owners: [{ displayName: "شركة قمة", emailAddress: "a@qemma.sa" }] },
      { id: "2", name: "س د ط 2539.pdf", createdTime: now.toISOString(), owners: [{ displayName: "شركة قمة", emailAddress: "a@qemma.sa" }] },
    ], null, "");
    const snap = snapshotFromPass({ ...newPass(1, now), counts: r.counts, people: r.people, n: 2 }, 1, { "a@qemma.sa": 1 }, now);
    stateRow = { data: { snapshot: snap, running_n: 500, running_started: now.toISOString(), running_fails: 0, running_fail: null, last_error: null }, error: null };
    const j = await (await get()).json();
    expect(j.view.files).toBe(2);
    expect(j.view.plates).toBe(1);
    expect(j.view.companies[0]).toMatchObject({ name: "شركة قمة", total: 2, plates: 1 });
    expect(j.running).toEqual({ n: 500, startedAt: now.toISOString(), fails: 0, lastFail: null });
    expect(selected).not.toMatch(/queue|counts/);
  });
});

describe("🔴 /api/cron/cert-stats — الدورة", () => {
  it("مفتاح الدورة غلط ⇒ مرفوض من غير ما يلمس حاجة", async () => {
    const before = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "s3cret";
    try {
      const { GET } = await import("@/app/api/cron/cert-stats/route");
      const res = await GET(new Request("http://localhost/api/cron/cert-stats", { headers: { Authorization: "Bearer wrong" } }));
      expect(res.status).toBe(401);
    } finally {
      if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before;
    }
  });
});

describe("🔴 التوصيل", () => {
  const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

  it("العدّ من الموبايل اتشال", () => {
    expect(existsSync("app/api/admin/cert-stats/files/route.ts")).toBe(false);
    expect(read("app/admin/certificates/page.tsx")).not.toMatch(/countAll|cert-stats\/files/);
  });

  it("🔴 الدورة كل دقيقة: كل الـبي دي إف من غير المحذوف · مترتّبة · بالاسم واللي رفع · بحد وقت", () => {
    const crons = JSON.parse(read("vercel.json")).crons as { path: string; schedule: string }[];
    expect(crons).toContainEqual({ path: "/api/cron/cert-stats", schedule: "* * * * *" });
    const r = read("app/api/cron/cert-stats/route.ts");
    expect(r).toMatch(/cronAuthorized\(/);
    expect(r).toMatch(/mimeType='application\/pdf' and trashed=false/);
    expect(r).toMatch(/files\(id,name,createdTime,owners\(displayName,emailAddress\),lastModifyingUser\(displayName,emailAddress\)\)/);
    expect(r).toMatch(/orderBy: "createdTime"/);
    expect(r).toMatch(/timeoutMs: 25_000/);
    expect(r).toMatch(/certStatsTick\(/);
    expect(r).toMatch(/stepFromPage\(r\.files, r\.next, t\.after, cut, true\)/);
  });

  it("🔴 الجداول: للسيرفر بس (RLS من غير سياسات) + منح صريح + صف الحالة", () => {
    const sql = read("docs/sql/cert-stats.sql");
    for (const t of ["cert_stats_state", "cert_stats_plates", "cert_stats_plate_uploaders"]) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t}`));
      expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`));
      expect(sql).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${t}\\s+to service_role`));
    }
    expect(sql).not.toMatch(/create policy/);
    expect(sql).toMatch(/insert into public\.cert_stats_state \(id\) values \(1\)/);
    expect(sql).toMatch(/primary key \(k, u\)/);
  });

  it("🔴 الصفحة: آخر نتيجة من السيرفر · اللوحات المختلفة · بتسأل وهو بيعدّ · فحص درايف", () => {
    const p = read("app/admin/certificates/page.tsx");
    expect(p).toMatch(/\/api\/admin\/cert-stats"/);
    expect(p).toMatch(/view\.plates/);
    expect(p).toMatch(/لوحة مختلفة ليها شهادة/);
    expect(p).toMatch(/لوحات مختلفة/);
    expect(p).toMatch(/c\.email/);
    expect(p).toMatch(/setInterval\(/);
    expect(p).toMatch(/اتقرا \{n\(running\.n\)\} ملف/);
    expect(p).toMatch(/\/api\/admin\/drive-health/);
    expect(p).toMatch(/كل شركة رافعة كام/);
    expect(p).toMatch(/اترفع كام كل يوم/);
    const admin = read("app/admin/page.tsx");
    expect(admin).toMatch(/\{isSuper && \(\s*<button onClick=\{\(\) => router\.push\("\/admin\/certificates"\)\}/);
  });
});

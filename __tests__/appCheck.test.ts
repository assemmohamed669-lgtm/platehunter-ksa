/**
 * 📢 «تشييك البرنامج» (٢٥ أكتوبر ٢٠٢٦) — `lib/appCheck.ts`.
 *
 * المالك: «لما ادمن عندي يرفعه يظهر عند كل الناس اكن المناديب هيا اللي رفعاه ولو رفعت تحت اي محفظه او تشييك او
 * اكتر زياده بردة ينزل عند كل الناس» · «لو رفع تشييك هو من عندو يشتغل ب تشييكه هو ولو مسح التشييك بتاعه هو يقرأ
 * تلقائي التشييك اللي الادمن رافعو» · «يظهر عند الادمن تحت صفحه التشييك كم واحد قاري عندو التشييك وكم واحد مش شغال
 * بيه». قراراته: لكل المناديب · ملف الأدمن بيستبدل · **آخر رفع يكسب**.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Rec = { key: string; agentId: string; slot: string; fileName: string; headers: string[]; rows: Record<string, string>[]; uploadedAt: string; fileBlob?: Blob; source?: string; appVersion?: string };

const m = vi.hoisted(() => {
  const files = new Map<string, Rec>();
  const objects = new Map<string, Blob>();
  const state = {
    uid: "u-agent" as string | null,
    profile: { role: "agent", is_super: false, email: "agent@x.com" } as Record<string, unknown>,
    set: null as null | { version: string; files: unknown[]; updated_at: string },
    setError: null as null | { message: string },
    status: new Map<string, Record<string, unknown>>(),
    clock: Date.parse("2026-10-25T10:00:00Z"),
    rpcCalls: [] as unknown[],
  };
  const tables = new Map<string, { headers: string[]; rows: Record<string, string>[] }>();
  return { files, objects, state, tables, notify: vi.fn() };
});

vi.mock("@/lib/idb", () => ({
  getUploadedFile: vi.fn(async (_a: string, slot: string) => m.files.get(`local:${slot}`) ?? null),
  saveUploadedFile: vi.fn(async (r: Rec) => { m.files.set(r.key, r); }),
  deleteUploadedFile: vi.fn(async (_a: string, slot: string) => { m.files.delete(`local:${slot}`); }),
}));
vi.mock("@/lib/checkSheetSync", () => ({ notifyCheckSheetChanged: m.notify }));
vi.mock("@/lib/authSession", () => ({ currentSession: vi.fn(async () => ({ userId: m.state.uid, signedOut: !m.state.uid })) }));
vi.mock("@/lib/excel", () => ({
  parseExcelFile: vi.fn(async (f: File) => {
    const t = m.tables.get(f.name);
    if (!t) throw new Error("bad file");
    return t;
  }),
}));
vi.mock("@/lib/supabaseClient", () => {
  const from = (table: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      single: async () => (table === "profiles" ? { data: m.state.profile, error: null } : { data: null, error: null }),
      maybeSingle: async () => {
        if (table !== "app_check_set") return { data: null, error: null };
        if (m.state.setError) return { data: null, error: m.state.setError };
        return { data: m.state.set, error: null };
      },
      upsert: async (row: Record<string, unknown>) => { m.state.status.set(String(row.agent_id), row); return { error: null }; },
    };
    return q;
  };
  return {
    supabase: {
      from,
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        m.state.rpcCalls.push({ fn, args });
        if (fn === "publish_app_check") {
          const updated_at = new Date(m.state.clock).toISOString();
          m.state.set = { version: String(args.p_version), files: args.p_files as unknown[], updated_at };
          return { data: updated_at, error: null };
        }
        return { data: null, error: null };
      }),
      storage: {
        from: () => ({
          upload: vi.fn(async (path: string, blob: Blob) => { m.objects.set(path, blob); return { data: { path }, error: null }; }),
          download: vi.fn(async (path: string) => {
            const b = m.objects.get(path);
            return b ? { data: b, error: null } : { data: null, error: { message: "not found" } };
          }),
          remove: vi.fn(async (paths: string[]) => { for (const p of paths) m.objects.delete(p); return { error: null }; }),
        }),
      },
      channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
      auth: { getSession: vi.fn(async () => ({ data: { session: m.state.uid ? { user: { id: m.state.uid } } : null } })) },
    },
  };
});

import {
  APP_CHECK_FOR_ALL, APP_CHECK_TEST_EMAILS, appCheckMode, canPublishAppCheck, canReceiveAppCheck, planAppCheckSync,
  slotForIndex, publishAppCheck, syncAppCheck, onUserCheckChanged, __resetAppCheckForTest,
} from "@/lib/appCheck";

const T1 = { headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "ابح1234" }, { "رقم اللوحة": "دهل5231" }] };
const T2 = { headers: ["Plate Number"], rows: [{ "Plate Number": "NKD 5678" }] };
const T3 = { headers: ["اللوحه"], rows: [{ "اللوحه": "رسي3367" }] };
m.tables.set("ادمن ١.xlsx", T1);
m.tables.set("ادمن ٢.xlsx", T2);
m.tables.set("بتاعي.xlsx", T3);

function put(slot: string, fileName: string, extra: Partial<Rec> = {}) {
  const t = m.tables.get(fileName)!;
  m.files.set(`local:${slot}`, { key: `local:${slot}`, agentId: "local", slot, fileName, headers: t.headers, rows: t.rows, uploadedAt: new Date(m.state.clock).toISOString(), fileBlob: new Blob([fileName]), ...extra });
}
const slots = () => [...m.files.values()].sort((a, b) => (a.slot < b.slot ? -1 : 1)).map((r) => `${r.slot}:${r.fileName}:${r.source ?? "own"}`);

function asSuper() { m.state.uid = "u-super"; m.state.profile = { role: "admin", is_super: true, email: "boss@x.com" }; }
function asTester() { m.state.uid = "u-tester"; m.state.profile = { role: "agent", is_super: false, email: "Google.Review@qannas-ksa.com " }; }

beforeEach(() => {
  m.files.clear(); m.objects.clear(); m.notify.mockClear();
  m.state.set = null; m.state.setError = null; m.state.status.clear(); m.state.rpcCalls = [];
  m.state.clock = Date.parse("2026-10-25T10:00:00Z");
  __resetAppCheckForTest();
});

describe("🔒 مين ينشر ومين يستقبل (السوبر أدمن الأول)", () => {
  it("قبل الفتح للكل: السوبر أدمن بس ينشر، والسوبر أدمن + حسابات التجربة بس يستقبلوا", () => {
    expect(APP_CHECK_FOR_ALL).toBe(false);
    expect(canPublishAppCheck({ isSuper: true, role: "admin" })).toBe(true);
    expect(canPublishAppCheck({ isSuper: false, role: "admin" })).toBe(false);
    expect(canPublishAppCheck({ isSuper: false, role: "agent" })).toBe(false);
    expect(canReceiveAppCheck({ isSuper: true })).toBe(true);
    expect(APP_CHECK_TEST_EMAILS).toContain("google.review@qannas-ksa.com");
    expect(canReceiveAppCheck({ isSuper: false, email: " Google.Review@Qannas-KSA.com" })).toBe(true);
    expect(canReceiveAppCheck({ isSuper: false, email: "agent@x.com" })).toBe(false);
  });
});

describe("📐 القواعد", () => {
  const SET = { version: "v2", updatedAt: "2026-10-25T10:00:00Z", files: [{ slot: "check", path: "v2/check", fileName: "a" }, { slot: "check-2", path: "v2/check-2", fileName: "b" }] };
  it("الخانات متتابعة: check ثم check-2 …", () => {
    expect([0, 1, 2].map(slotForIndex)).toEqual(["check", "check-2", "check-3"]);
  });
  it("الوضع: مفيش ⇒ none · من البرنامج ⇒ app · أي ملف بتاعه ⇒ own", () => {
    expect(appCheckMode([])).toBe("none");
    expect(appCheckMode([{ slot: "check", source: "app", appVersion: "v1" }])).toBe("app");
    expect(appCheckMode([{ slot: "check", source: "app" }, { slot: "check-2" }])).toBe("own");
  });
  it("مفيش حاجة عنده ⇒ ينزّل · عنده نفس النسخة كاملة ⇒ ولا حاجة · نسخة قديمة أو ناقصة ⇒ ينزّل", () => {
    expect(planAppCheckSync([], SET)).toBe("apply");
    expect(planAppCheckSync([{ slot: "check", source: "app", appVersion: "v2" }, { slot: "check-2", source: "app", appVersion: "v2" }], SET)).toBe("none");
    expect(planAppCheckSync([{ slot: "check", source: "app", appVersion: "v1" }], SET)).toBe("apply");
    expect(planAppCheckSync([{ slot: "check", source: "app", appVersion: "v2" }], SET)).toBe("apply");
  });
  it("⏱️ آخر رفع يكسب: ملفه أحدث من نسخة الأدمن ⇒ بتوعه · أقدم ⇒ نسخة الأدمن تستبدله", () => {
    expect(planAppCheckSync([{ slot: "check", uploadedAt: "2026-10-25T11:00:00Z" }], SET)).toBe("none");
    expect(planAppCheckSync([{ slot: "check", uploadedAt: "2026-10-25T09:00:00Z" }], SET)).toBe("apply");
  });
  it("الأدمن مسح كل ملفاته ⇒ ملفات البرنامج تتشال، وملفات المندوب نفسه ماتتلمسش", () => {
    const empty = { version: "v3", updatedAt: "2026-10-25T12:00:00Z", files: [] };
    expect(planAppCheckSync([{ slot: "check", source: "app", appVersion: "v2" }], empty)).toBe("clear");
    expect(planAppCheckSync([{ slot: "check", source: "app" }], null)).toBe("clear");
    expect(planAppCheckSync([{ slot: "check" }], empty)).toBe("none");
    expect(planAppCheckSync([], null)).toBe("none");
  });
});

describe("📤 النشر (الأدمن رفع)", () => {
  it("السوبر أدمن: الملفين بيترفعوا، والنسخة بتتسجّل، وملفاته بتتعلّم «من البرنامج» (مايتنزّلوش عنده تاني)", async () => {
    asSuper();
    put("check", "ادمن ١.xlsx");
    put("check-2", "ادمن ٢.xlsx");
    const r = await publishAppCheck();
    expect(r).toEqual({ ok: true, files: 2 });
    const call = m.state.rpcCalls.find((c) => (c as { fn: string }).fn === "publish_app_check") as { args: { p_version: string; p_files: { slot: string; fileName: string; path: string; plates: number }[] } };
    expect(call.args.p_files.map((f) => [f.slot, f.fileName, f.plates])).toEqual([["check", "ادمن ١.xlsx", 2], ["check-2", "ادمن ٢.xlsx", 1]]);
    for (const f of call.args.p_files) expect(m.objects.has(f.path)).toBe(true);
    expect(call.args.p_files[0].path).toMatch(/^[a-z0-9-]+\/check$/);   // مسار إنجليزي (التخزين بيرفض العربي)
    expect(slots()).toEqual(["check:ادمن ١.xlsx:app", "check-2:ادمن ٢.xlsx:app"]);
    expect([...m.files.values()].every((f) => f.appVersion === call.args.p_version)).toBe(true);
    expect(await syncAppCheck()).toBe(false);   // عنده نفس النسخة
  });

  it("مندوب عادي ⇒ مابينشرش ولا بيرفع حاجة", async () => {
    m.state.uid = "u-agent"; m.state.profile = { role: "agent", is_super: false, email: "agent@x.com" };
    put("check", "بتاعي.xlsx");
    expect(await publishAppCheck()).toBeNull();
    expect(m.objects.size).toBe(0);
  });
});

describe("📥 الاستقبال عند المندوب", () => {
  async function adminPublishes(names: string[]) {
    asSuper();
    m.files.clear();
    names.forEach((n, i) => put(slotForIndex(i), n));
    await publishAppCheck();
    m.files.clear();
    __resetAppCheckForTest();
    asTester();
  }

  it("مفيش عنده حاجة ⇒ الملفين بينزلوا في نفس خانات التشييك كأنه رافعهم + الصفحات بتتبلّغ + حالته «قاري»", async () => {
    await adminPublishes(["ادمن ١.xlsx", "ادمن ٢.xlsx"]);
    expect(await syncAppCheck()).toBe(true);
    expect(slots()).toEqual(["check:ادمن ١.xlsx:app", "check-2:ادمن ٢.xlsx:app"]);
    expect(m.files.get("local:check")!.rows).toEqual(T1.rows);
    expect(m.notify).toHaveBeenCalled();
    expect(m.state.status.get("u-tester")).toMatchObject({ mode: "app", version: m.state.set!.version, files: 2 });
  });

  it("رفع ملف بنفسه بعد نسخة الأدمن ⇒ بيشتغل على بتاعه بس (ملفات البرنامج بتتشال) + حالته «بتاعه»", async () => {
    await adminPublishes(["ادمن ١.xlsx", "ادمن ٢.xlsx"]);
    await syncAppCheck();
    m.state.clock += 60_000;
    put("check", "بتاعي.xlsx");          // استبدل الأساسي بملفه
    await onUserCheckChanged();
    expect(slots()).toEqual(["check:بتاعي.xlsx:own"]);
    expect(m.state.status.get("u-tester")).toMatchObject({ mode: "own" });
    expect(await syncAppCheck()).toBe(false);      // ملفه أحدث ⇒ مايتلمسش
    expect(slots()).toEqual(["check:بتاعي.xlsx:own"]);
  });

  it("مسح ملفه ⇒ تشييك البرنامج بيرجع تلقائي", async () => {
    await adminPublishes(["ادمن ١.xlsx"]);
    m.state.clock += 60_000;
    put("check", "بتاعي.xlsx");
    await syncAppCheck();
    expect(slots()).toEqual(["check:بتاعي.xlsx:own"]);
    m.files.delete("local:check");             // مسح
    await onUserCheckChanged();
    expect(slots()).toEqual(["check:ادمن ١.xlsx:app"]);
  });

  it("⏱️ الأدمن رفع تاني بعد ما المندوب رفع لنفسه ⇒ نسخة الأدمن الجديدة تستبدل (آخر رفع يكسب)", async () => {
    await adminPublishes(["ادمن ١.xlsx"]);
    m.state.clock += 60_000;
    put("check", "بتاعي.xlsx");
    m.state.clock += 60_000;
    const mine = new Map(m.files);
    await adminPublishes(["ادمن ٢.xlsx"]);
    for (const [k, v] of mine) m.files.set(k, v);
    expect(await syncAppCheck()).toBe(true);
    expect(slots()).toEqual(["check:ادمن ٢.xlsx:app"]);
  });

  it("الأدمن مسح كل ملفاته ⇒ بتتشال عند المندوب", async () => {
    await adminPublishes(["ادمن ١.xlsx", "ادمن ٢.xlsx"]);
    await syncAppCheck();
    m.state.clock += 60_000;
    m.state.set = { version: "v-empty", files: [], updated_at: new Date(m.state.clock).toISOString() };
    expect(await syncAppCheck()).toBe(true);
    expect(slots()).toEqual([]);
  });

  it("🛡️ السيرفر مش بيرد ⇒ ولا حاجة بتتمسح · ملف مابيتقريش ⇒ مابيستبدلش اللي عنده", async () => {
    await adminPublishes(["ادمن ١.xlsx"]);
    await syncAppCheck();
    m.state.setError = { message: "offline" };
    expect(await syncAppCheck()).toBe(false);
    expect(slots()).toEqual(["check:ادمن ١.xlsx:app"]);
    m.state.setError = null;
    m.tables.delete("ادمن ٢.xlsx");
    await adminPublishes(["ادمن ١.xlsx"]);
    m.state.set!.files = [{ slot: "check", path: "x/check", fileName: "ادمن ٢.xlsx" }];
    m.state.set!.version = "broken";
    m.objects.set("x/check", new Blob(["?"]));
    put("check", "ادمن ١.xlsx", { source: "app", appVersion: "old" });
    expect(await syncAppCheck()).toBe(false);
    expect(slots()).toEqual(["check:ادمن ١.xlsx:app"]);
    m.tables.set("ادمن ٢.xlsx", T2);
  });

  it("مش في التجربة ⇒ مفيش أي استقبال ولا لمس لملفاته", async () => {
    await adminPublishes(["ادمن ١.xlsx"]);
    m.state.uid = "u-agent"; m.state.profile = { role: "agent", is_super: false, email: "agent@x.com" };
    __resetAppCheckForTest();
    put("check", "بتاعي.xlsx", { uploadedAt: "2026-01-01T00:00:00Z" });
    expect(await syncAppCheck()).toBe(false);
    expect(slots()).toEqual(["check:بتاعي.xlsx:own"]);
  });
});

describe("🔌 التوصيل", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  it("اللياوت بيشغّل المزامنة بعد ما يعرف الحساب", () => {
    expect(read("app/(app)/layout.tsx")).toMatch(/startAppCheckSync\(userId\);/);
  });

  it("كل مكان المستخدم بيرفع/يمسح فيه ملف تشييك بإيده بيبلّغ (الأدمن ينشر · المندوب بتاعه/يرجع للبرنامج)", () => {
    const ops = read("lib/checkFileOps.ts");
    expect(ops.match(/void onUserCheckChanged\(\)/g)?.length).toBe(2);
    const ic = read("app/(app)/instant-check/page.tsx");
    expect(ic.match(/void onUserCheckChanged\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    const vp = read("app/(app)/registration-v2/page.tsx");
    expect(vp.match(/void onUserCheckChanged\(\)/g)?.length).toBe(2);
    expect(read("components/IncomingExcelHandler.tsx")).toMatch(/void onUserCheckChanged\(\)/);
  });

  it("صفحة التشييك بتعيد قراية الملفات الإضافية لما تشييك البرنامج ينزل", () => {
    expect(read("app/(app)/instant-check/page.tsx")).toMatch(/if \(!slot \|\| slot === "check"\) loadCheck\(\);\s*if \(detail\?\.all\) void loadExtraChecks\(\);/);
  });

  it("ملف المجموعة القديم مابيتخانقش مع تشييك البرنامج", () => {
    const tc = read("lib/teamCheck.ts");
    expect(tc).toMatch(/if \(await appCheckReceivingNow\(\)\) return false;/);
    expect(tc).toMatch(/if \(APP_CHECK_FOR_ALL\) return null;/);
  });

  it("المندوب بيشوف «شغّال على تشييك البرنامج» والأدمن بيشوف كام قاري تحت صفحة التشييك", () => {
    const ic = read("app/(app)/instant-check/page.tsx");
    expect(ic).toMatch(/<AppCheckBadge \/>/);
    expect(ic).toMatch(/<AppCheckReportCard \/>/);
    expect(read("app/(app)/registration-v2/page.tsx")).toMatch(/<AppCheckBadge \/>/);
  });

  it("SQL: صف النسخة + الحالة + المخزن + الصلاحيات + الإشعار الفوري", () => {
    const s = read("docs/sql/app-check.sql");
    for (const x of [
      "create table if not exists public.app_check_set",
      "create table if not exists public.app_check_status",
      "create or replace function public.app_check_is_admin()",
      "create or replace function public.publish_app_check(",
      "create or replace function public.app_check_report()",
      "values ('app-check', 'app-check', false)",
      "alter publication supabase_realtime add table public.app_check_set",
      "grant select on public.app_check_set to authenticated",
      "grant select, insert, update on public.app_check_status to authenticated",
    ]) expect(s).toContain(x);
  });
});

describe("🧮 كارت الأدمن: كام قاري وكام لأ", () => {
  it("قاري = آخر نسخة · بتاعه = رفع لنفسه · مش شغّال = نسخة قديمة/مافتحش/مفيش", async () => {
    const { classifyAppCheckReport } = await import("@/lib/appCheck");
    const set = { version: "v9", updatedAt: "2026-10-25T10:00:00Z", files: [{ slot: "check", path: "v9/check", fileName: "a" }] };
    const row = (agent_id: string, mode: string | null, version: string | null) => ({ agent_id, username: agent_id, mode, version, files: 1, updated_at: null, last_seen: null });
    const r = classifyAppCheckReport([row("a", "app", "v9"), row("b", "app", "v8"), row("c", "own", null), row("d", null, null), row("e", "none", null)], set);
    expect(r.reading.map((x) => x.agent_id)).toEqual(["a"]);
    expect(r.own.map((x) => x.agent_id)).toEqual(["c"]);
    expect(r.notReading.map((x) => x.agent_id)).toEqual(["b", "d", "e"]);
  });

  it("مسح ملف إضافي بيحافظ على أصل الملفات اللي بعده (من البرنامج ولا بتاعه) ووقت رفعها", () => {
    const ic = readFileSync(join(__dirname, "..", "app", "(app)", "instant-check", "page.tsx"), "utf8").replace(/\r\n/g, "\n");
    expect(ic).toMatch(/const orig = origRecs\.get\(kept\[i\]\?\.id \?\? -1\) \?\? null;\s*await saveUploadedFile\(\{\s*\.\.\.\(orig \?\? \{\}\),/);
    expect(ic).toMatch(/uploadedAt: orig\?\.uploadedAt \?\? new Date\(\)\.toISOString\(\), fileBlob: e\.file,/);
  });
});

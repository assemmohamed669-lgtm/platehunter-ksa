import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * المسح كان **محلي بس**: `deleteFieldCheckEntry` بيشيل الصف من IndexedDB،
 * والسيرفر بيفضل شايله. وأول ما المندوب يفتح صفحة التشييك، `restoreFieldChecks`
 * بيسحب كل صفوفه من `field_checks` تاني → **السجل الممسوح بيرجع**.
 *
 * الإصلاح: كل مسح بيسيب «شاهدة مسح» (tombstone) في IDB:
 *   - `pushFieldCheckDeletes` بينفّذ المسح على السيرفر ويشيل الشاهدة.
 *   - `restoreFieldChecks` بيتخطّى أي صف ليه شاهدة (فالمسح الأوفلاين مايترجعش
 *     قبل ما يوصل السيرفر).
 */

// ── Supabase موهوم: جدول field_checks في الذاكرة ─────────────────────────────
type Row = Record<string, unknown>;
const serverRows: Row[] = [];
let sessionUid: string | null = null;

function makeQuery() {
  const st: {
    op: "select" | "delete" | "upsert";
    filters: [string, unknown][];
    inFilter: [string, unknown[]] | null;
    range: [number, number] | null;
    head: boolean;
    row?: Row;
  } = { op: "select", filters: [], inFilter: null, range: null, head: false };

  const matches = (r: Row) =>
    st.filters.every(([c, v]) => r[c] === v) &&
    (!st.inFilter || st.inFilter[1].includes(r[st.inFilter[0]]));

  function run() {
    if (st.op === "upsert") {
      const row = st.row!;
      const i = serverRows.findIndex((r) => r.local_id === row.local_id);
      if (i >= 0) serverRows[i] = row;
      else serverRows.push(row);
      return { data: null, error: null };
    }
    if (st.op === "delete") {
      for (let i = serverRows.length - 1; i >= 0; i--) if (matches(serverRows[i])) serverRows.splice(i, 1);
      return { data: null, error: null };
    }
    const rows = serverRows.filter(matches);
    if (st.head) return { data: null, count: rows.length, error: null };
    const [from, to] = st.range ?? [0, rows.length - 1];
    return { data: rows.slice(from, to + 1), count: rows.length, error: null };
  }

  const q = {
    select: (_c?: string, o?: { head?: boolean }) => { st.op = "select"; st.head = !!o?.head; return q; },
    delete: () => { st.op = "delete"; return q; },
    upsert: (row: Row) => { st.op = "upsert"; st.row = row; return q; },
    eq: (c: string, v: unknown) => { st.filters.push([c, v]); return q; },
    in: (c: string, v: unknown[]) => { st.inFilter = [c, v]; return q; },
    order: () => q,
    range: (f: number, t: number) => { st.range = [f, t]; return q; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return q;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => makeQuery(),
    auth: { getSession: async () => ({ data: { session: sessionUid ? { user: { id: sessionUid } } : null } }) },
  },
}));

const {
  saveFieldCheckEntry, saveFieldCheckEntries, getAllFieldCheckEntries,
  deleteFieldCheckEntry, deleteFieldCheckEntries, getFieldCheckDeletes,
} = await import("@/lib/idb");
const { pushFieldCheckDeletes, restoreFieldChecks, pushFieldChecks } = await import("@/lib/syncFieldCheck");
type FieldCheckEntry = import("@/lib/idb").FieldCheckEntry;

const AG = "7b4bc404-50e7-46ad-935f-aa65e293d6b8";

const mk = (i: number, agentId = AG): FieldCheckEntry => ({
  id: `fc-${i}`,
  agentId,
  plate: `ابح${1000 + i}`,
  row: { "الحي": "العليا" },
  method: "متشيكة بالصوت",
  checkedAt: new Date(2026, 8, 1, 12, i % 60).toISOString(),
});

async function wipeLocal() {
  const all = await getAllFieldCheckEntries();
  await deleteFieldCheckEntries(all.map((e) => e.id));
  await getFieldCheckDeletes().then((t) => t.map((d) => d.id));
  const { clearFieldCheckDeletes } = await import("@/lib/idb");
  await clearFieldCheckDeletes((await getFieldCheckDeletes()).map((d) => d.id));
}

describe("مسح سجل التشييك — لازم يوصل السيرفر فمايرجعش تاني", () => {
  beforeEach(async () => {
    serverRows.length = 0;
    sessionUid = AG;
    await wipeLocal();
  });

  it("المسح بيسيب شاهدة مسح (tombstone) فيها هوية المندوب", async () => {
    await saveFieldCheckEntry(mk(1));
    await deleteFieldCheckEntry("fc-1");

    expect(await getAllFieldCheckEntries(AG)).toHaveLength(0);
    const tombs = await getFieldCheckDeletes(AG);
    expect(tombs.map((t) => t.id)).toEqual(["fc-1"]);
    expect(tombs[0].agentId).toBe(AG);
  });

  it("pushFieldCheckDeletes بيمسح الصف من السيرفر ويشيل الشاهدة", async () => {
    await saveFieldCheckEntries([mk(1), mk(2)]);
    await pushFieldChecks(AG);
    expect(serverRows).toHaveLength(2);

    await deleteFieldCheckEntry("fc-1");
    const res = await pushFieldCheckDeletes(AG);

    expect(res.deleted).toBe(1);
    expect(serverRows.map((r) => r.local_id)).toEqual(["fc-2"]);
    expect(await getFieldCheckDeletes(AG)).toHaveLength(0);
  });

  it("🔴 الباج الأصلي: الاسترجاع كان بيرجّع الممسوح — دلوقتي لأ", async () => {
    await saveFieldCheckEntries([mk(1), mk(2), mk(3)]);
    await pushFieldChecks(AG);

    await deleteFieldCheckEntry("fc-2");
    await pushFieldCheckDeletes(AG);

    const { restored } = await restoreFieldChecks(AG);
    expect(restored).toBe(2);
    const back = await getAllFieldCheckEntries(AG);
    expect(back.map((e) => e.id).sort()).toEqual(["fc-1", "fc-3"]);
  });

  it("مسح أوفلاين: الشاهدة بتفضل، والاسترجاع مايرجّعش الصف قبل ما المسح يوصل", async () => {
    await saveFieldCheckEntries([mk(1), mk(2)]);
    await pushFieldChecks(AG);

    sessionUid = null;                 // مفيش جلسة = المسح مايوصلش السيرفر
    await deleteFieldCheckEntry("fc-1");
    const failed = await pushFieldCheckDeletes(AG);
    expect(failed.deleted).toBe(0);
    expect(serverRows).toHaveLength(2); // لسه على السيرفر

    // الاسترجاع لازم يتخطّاه رغم إنه لسه موجود على السيرفر
    const { restored } = await restoreFieldChecks(AG);
    expect(restored).toBe(1);
    expect((await getAllFieldCheckEntries(AG)).map((e) => e.id)).toEqual(["fc-2"]);
    expect(await getFieldCheckDeletes(AG)).toHaveLength(1); // الشاهدة لسه مستنية

    // رجعت الشبكة → المسح بيوصل
    sessionUid = AG;
    expect((await pushFieldCheckDeletes(AG)).deleted).toBe(1);
    expect(serverRows.map((r) => r.local_id)).toEqual(["fc-2"]);
  });

  it("مسح كل السجلات (تحديد الكل) بيمشي في معاملة واحدة وبيوصل السيرفر كله", async () => {
    const many = Array.from({ length: 250 }, (_, i) => mk(i));
    await saveFieldCheckEntries(many);
    await pushFieldChecks(AG);
    expect(serverRows).toHaveLength(250);

    await deleteFieldCheckEntries(many.map((e) => e.id));
    expect(await getAllFieldCheckEntries(AG)).toHaveLength(0);

    const res = await pushFieldCheckDeletes(AG);
    expect(res.deleted).toBe(250);
    expect(serverRows).toHaveLength(0);

    // وبعد كده الاسترجاع مايرجّعش حاجة
    const { restored } = await restoreFieldChecks(AG);
    expect(restored).toBe(0);
  });

  it("مايمسحش صفوف مندوب تاني بنفس الجهاز", async () => {
    const other = "other-agent-uuid";
    await saveFieldCheckEntries([mk(1, AG), mk(9, other)]);
    await deleteFieldCheckEntry("fc-9");

    // الشاهدة اتسجّلت باسم صاحبها، ومزامنة AG ماتلمسهاش
    expect((await getFieldCheckDeletes(AG)).map((t) => t.id)).toEqual([]);
    expect((await getFieldCheckDeletes(other)).map((t) => t.id)).toEqual(["fc-9"]);
    expect((await pushFieldCheckDeletes(AG)).deleted).toBe(0);
  });
});

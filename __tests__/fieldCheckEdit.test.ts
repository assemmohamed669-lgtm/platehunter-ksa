import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * تعديل لوحة في «السجلات» كان **بيرجع زي ما كان** بعد إعادة فتح الحساب.
 *
 * السبب: `savePlatesEditor` بيحفظ التعديل محلياً بـ`synced:false` بس مابيرفعوش
 * على طول. وأول ما المندوب يفتح الصفحة تاني، `restoreFieldChecks` بيسحب كل
 * صفوفه من السيرفر ويكتبها فوق المحلي (`put`) — فالقيمة **القديمة** الجاية من
 * السيرفر بتمسح تعديله، وبعدها المزامنة التدريجية مالاقيتش حاجة «معلّقة» لأن
 * الصف اتكتب فوقه بـ`synced:true`. التعديل بيضيع في صمت.
 *
 * القاعدة الصح: أي صف لسه ماترفعش (`synced:false`) = تعديل محلي أحدث من
 * السيرفر → الاسترجاع مايكتبش فوقه.
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

const { saveFieldCheckEntry, getAllFieldCheckEntries, clearFieldCheck } = await import("@/lib/idb");
const { restoreFieldChecks, pushPendingFieldChecks } = await import("@/lib/syncFieldCheck");
type FieldCheckEntry = import("@/lib/idb").FieldCheckEntry;

const AG = "7b4bc404-50e7-46ad-935f-aa65e293d6b8";
const ID = "fc-1";

function entry(plate: string, synced: boolean): FieldCheckEntry {
  return {
    id: ID, agentId: AG, plate, row: {}, method: "يدوي",
    checkedAt: "2026-09-11T10:00:00.000Z", synced,
  } as FieldCheckEntry;
}

/** الصف زي ما هو مخزّن على السيرفر (اللوحة القديمة قبل التعديل). */
function serverRow(plate: string): Row {
  return {
    local_id: ID, agent_id: AG, plate, method: "يدوي",
    lat: null, lng: null, maps_link: null, extra: {},
    checked_at: "2026-09-11T10:00:00.000Z",
  };
}

beforeEach(async () => {
  serverRows.length = 0;
  sessionUid = AG;
  await clearFieldCheck();
});

describe("تعديل سجل لسه ماترفعش", () => {
  it("الاسترجاع مايكتبش القيمة القديمة فوق تعديل محلي معلّق", async () => {
    serverRows.push(serverRow("ابح1111"));          // السيرفر: اللوحة القديمة
    await saveFieldCheckEntry(entry("ابح2222", false)); // المندوب عدّلها ولسه مترفعتش

    await restoreFieldChecks(AG);

    const rows = await getAllFieldCheckEntries(AG);
    expect(rows).toHaveLength(1);
    expect(rows[0].plate).toBe("ابح2222");   // تعديله لازم يفضل
    expect(rows[0].synced).toBe(false);       // ولسه معلّق للرفع
  });

  it("بعد الرفع، السيرفر بياخد اللوحة الجديدة والاسترجاع يبقى متطابق", async () => {
    serverRows.push(serverRow("ابح1111"));
    await saveFieldCheckEntry(entry("ابح2222", false));

    await pushPendingFieldChecks(AG);
    expect(serverRows[0].plate).toBe("ابح2222");

    await restoreFieldChecks(AG);
    const rows = await getAllFieldCheckEntries(AG);
    expect(rows[0].plate).toBe("ابح2222");
  });

  it("الصف المرفوع بالفعل (synced) بياخد قيمة السيرفر عادي", async () => {
    serverRows.push(serverRow("ابح3333"));
    await saveFieldCheckEntry(entry("ابح1111", true));  // نسخة قديمة مرفوعة

    await restoreFieldChecks(AG);

    const rows = await getAllFieldCheckEntries(AG);
    expect(rows[0].plate).toBe("ابح3333");   // السيرفر هو المرجع هنا
  });
});

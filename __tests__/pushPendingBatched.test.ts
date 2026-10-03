import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  ☁️ رفع ١٠٠٠+ سجل للسيرفر — على دفعات بدل طلب لكل لوحة
 * ══════════════════════════════════════════════════════════════════════
 *  `pushPendingFieldChecks` بيرفع كل سجل **في طلب لوحده، واحد ورا التاني**:
 *  تصدير ١٠٠٠ لوحة = ١٠٠٠ طلب نت متتالي في الخلفية (دقايق على شبكة الموبايل)،
 *  بيزاحموا صوت «الجديد» اللي رايح للسيرفر — وعلامة «اترفع» مابتتكتبش غير في
 *  **الآخر**، فلو التطبيق اتقفل في النص كله بيترفع تاني من الأول.
 *
 *  `pushPendingFieldChecksBatched` (اختيارية — القديمة زي ما هي للكل):
 *   · طلب واحد لكل ١٠٠ سجل، **بنفس شكل الصف بالحرف**
 *   · العلامة بتتكتب بعد كل دفعة ⇒ القفل في النص مايضيّعش اللي اترفع
 *   · دفعة السيرفر رفضها ⇒ تتجرّب صف صف (صف بايظ مايوقّفش الـ٩٩ التانيين)
 *   · النت وقع (status 0) ⇒ الدفعة تتنصّف (١٠٠ ⇐ ٥٠ ⇐ … ⇐ ١) عشان النت الضعيف
 *     يعدّي حاجة؛ ولو حتى صف واحد ماعدّاش ⇒ نقف ونسيب الباقي للمرة الجاية
 *   · عدّت ⇒ الدفعة **تكبر تاني** (ضعف لحد ١٠٠) — وقعة قصيرة ماتحوّلش الباقي
 *     لصف صف؛ ومحاولة كبر فشلت ⇒ اللي بعدها محتاجة نجاحات أكتر (مايزنّش)
 *   · `error` = سبب اللي **فضل** مترفعش بس — اترفع كله ⇒ مفيش خطأ
 *   · الجلسة مرفوضة (401/403) ⇒ نقف فوراً — مش ١٠٠٠ طلب مرفوض
 */

// ── Supabase موهوم: جدول field_checks في الذاكرة + سجل الطلبات ──────────────
type Row = Record<string, unknown>;
const serverRows = new Map<string, Row>();
const requests: Array<{ op: string; rows: Row[] }> = [];
let sessionUid: string | null = null;
/** بيقرّر رد أي upsert: null = نجاح. */
let upsertFails: (rows: Row[], callNo: number) => { error: Row; status: number } | null = () => null;
/** بيشتغل قبل ما السيرفر يرد — عشان نبص على الجهاز والرفع لسه في النص. */
let beforeReply: (callNo: number) => Promise<void> = async () => {};

function makeQuery() {
  let rows: Row[] = [];
  let opts: unknown;
  async function run() {
    const callNo = requests.length;
    requests.push({ op: "upsert", rows });
    await beforeReply(callNo);
    const fail = upsertFails(rows, callNo);
    if (fail) return { data: null, error: fail.error, status: fail.status };
    for (const r of rows) serverRows.set(String(r.local_id), r);
    return { data: null, error: null, status: 201, opts };
  }
  const q = {
    upsert: (r: Row | Row[], o?: unknown) => { rows = Array.isArray(r) ? r : [r]; opts = o; return q; },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (res: any, rej: any) => run().then(res, rej),
  };
  return q;
}

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => makeQuery(),
    auth: { getSession: async () => ({ data: { session: sessionUid ? { user: { id: sessionUid } } : null } }) },
  },
}));

const { saveFieldCheckEntries, getAllFieldCheckEntries, clearFieldCheck } = await import("@/lib/idb");
const { pushPendingFieldChecks, pushPendingFieldChecksBatched } = await import("@/lib/syncFieldCheck");
type FieldCheckEntry = import("@/lib/idb").FieldCheckEntry;

const AG = "7b4bc404-50e7-46ad-935f-aa65e293d6b8";
const mk = (i: number, extra: Partial<FieldCheckEntry> = {}): FieldCheckEntry => ({
  id: `${AG}:${i}`,
  agentId: AG,
  plate: `ابح${1000 + (i % 9000)}`,
  row: { "الحي": "العليا", ...(i % 4 === 0 ? { "رقم الهيكل": `VIN${i}` } : {}) },
  method: "متشيكة بالصوت",
  ...(i % 3 === 0 ? {} : { lat: 24.7 + i / 1e5, lng: 46.6, mapsLink: `https://maps.google.com/?q=${i}` }),
  checkedAt: new Date(Date.UTC(2026, 9, 3) + i * 1000).toISOString(),
  ...extra,
});
const seed = (n: number) => saveFieldCheckEntries(Array.from({ length: n }, (_, i) => mk(i)));
const pendingIds = async () => (await getAllFieldCheckEntries(AG)).filter((e) => !e.synced).map((e) => e.id).sort();
const upserts = () => requests.filter((r) => r.op === "upsert");

beforeEach(async () => {
  serverRows.clear();
  requests.length = 0;
  sessionUid = AG;
  upsertFails = () => null;
  beforeReply = async () => {};
  await clearFieldCheck();
});

describe("pushPendingFieldChecksBatched — نفس النتيجة بطلبات أقل", () => {
  it("١٥٠٠ سجل ⇒ ١٥ طلب، والسيرفر فيه نفس الصفوف بالحرف زي الرفع صف صف", async () => {
    await seed(1500);
    const oldRes = await pushPendingFieldChecks(AG);
    const viaOld = new Map(serverRows);
    expect(upserts()).toHaveLength(1500);                 // القديم: طلب لكل سجل
    expect(oldRes).toEqual({ synced: 1500, pending: 1500, error: undefined });

    serverRows.clear(); requests.length = 0;
    await clearFieldCheck();
    await seed(1500);
    const res = await pushPendingFieldChecksBatched(AG);

    expect(upserts()).toHaveLength(15);
    expect(upserts().every((r) => r.rows.length === 100)).toBe(true);
    expect(serverRows).toEqual(viaOld);
    expect(res).toEqual({ synced: 1500, pending: 1500 });
    expect(await pendingIds()).toEqual([]);
    // نفس **شكل** رد القديمة بالحرف — حتى `error: undefined` في النجاح
    expect(res).toStrictEqual({ synced: 1500, pending: 1500, error: undefined });
    expect(Object.keys(res)).toEqual(Object.keys(oldRes));
  });

  it("batchSize مخصّص", async () => {
    await seed(250);
    await pushPendingFieldChecksBatched(AG, { batchSize: 120 });
    expect(upserts().map((r) => r.rows.length)).toEqual([120, 120, 10]);
  });

  it("بيرفع اللي لسه مترفعش بس (synced=true مايترفعش تاني)", async () => {
    await saveFieldCheckEntries([mk(1, { synced: true }), mk(2), mk(3)]);
    const res = await pushPendingFieldChecksBatched(AG);
    expect(res).toEqual({ synced: 2, pending: 2 });
    expect(upserts().flatMap((r) => r.rows.map((x) => x.local_id)).sort()).toEqual([`${AG}:2`, `${AG}:3`]);
  });

  it("مفيش حاجة مستنية ⇒ مفيش ولا طلب", async () => {
    await saveFieldCheckEntries([mk(1, { synced: true })]);
    expect(await pushPendingFieldChecksBatched(AG)).toEqual({ synced: 0, pending: 0 });
    expect(requests).toHaveLength(0);
  });

  it("أوفلاين / مفيش جلسة ⇒ نفس ردود القديمة بالحرف ومفيش طلبات", async () => {
    await seed(5);
    sessionUid = null;
    expect(await pushPendingFieldChecksBatched(AG)).toEqual(await pushPendingFieldChecks(AG));
    sessionUid = AG;
    const nav = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await pushPendingFieldChecksBatched(AG)).toEqual({ synced: 0, pending: 0, error: "الجهاز أوفلاين" });
    nav.mockRestore();
    expect(requests).toHaveLength(0);
  });
});

describe("pushPendingFieldChecksBatched — الفشل", () => {
  it("السيرفر رفض دفعة بسبب صف واحد ⇒ الدفعة تتجرّب صف صف، والصف ده بس يفضل مستني", async () => {
    await seed(300);
    const bad = `${AG}:150`;
    upsertFails = (rows) => (rows.some((r) => r.local_id === bad)
      ? { error: { message: "invalid input", code: "22P02" }, status: 400 } : null);

    const res = await pushPendingFieldChecksBatched(AG);

    expect(res).toEqual({ synced: 299, pending: 300, error: "invalid input · 22P02" });
    expect(await pendingIds()).toEqual([bad]);
    expect(serverRows.size).toBe(299);
    // دفعتين سليمين + دفعة وقعت + ١٠٠ محاولة صف صف للدفعة اللي وقعت بس
    expect(upserts()).toHaveLength(3 + 100);
  });

  it("🔴 النت وقع في النص (status 0) ⇒ الدفعة تتنصّف لحد صف واحد وبعدين نقف — اللي اترفع متعلّم والباقي مستني للمرة الجاية", async () => {
    await seed(1000);
    upsertFails = (_rows, callNo) => (callNo >= 3
      ? { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 } : null);

    const res = await pushPendingFieldChecksBatched(AG);

    // ٣ نجحوا + الرابع وقع ⇒ نص · ربع · … · صف واحد وقع برضه ⇒ وقفنا (مش ٧٠٠ طلب فاشل)
    expect(upserts().slice(3).map((r) => r.rows.length)).toEqual([100, 50, 25, 12, 6, 3, 1]);
    expect(res).toStrictEqual({ synced: 300, pending: 1000, error: "TypeError: Failed to fetch" });
    expect(await pendingIds()).toHaveLength(700);
    expect(serverRows.size).toBe(300);
  });

  it("📶 نت ضعيف: الطلب الكبير بيقع (status 0) والصغير بيعدّي ⇒ الدفعة بتصغر والكل بيترفع — ومحاولات الكبر بتتباعد", async () => {
    await seed(300);
    upsertFails = (rows) => (rows.length > 10
      ? { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 } : null);

    const res = await pushPendingFieldChecksBatched(AG);

    expect(await pendingIds()).toEqual([]);
    expect(serverRows.size).toBe(300);
    // الكل اترفع في الآخر ⇒ مفيش «خطأ» (الوقعات اتعالجت)
    expect(res).toStrictEqual({ synced: 300, pending: 300, error: undefined });
    const sizes = upserts().map((r) => r.rows.length);
    // ١٠٠ ⇐ ٥٠ ⇐ ٢٥ ⇐ ١٢ وقعوا، و٦ عدّت
    expect(sizes.slice(0, 5)).toEqual([100, 50, 25, 12, 6]);
    // بيحاول يكبر تاني (١٢) — بس كل محاولة فاشلة بتضاعف عدد النجاحات قبل اللي بعدها،
    // فالمحاولات الفاشلة لوغاريتمية مش واحدة مع كل دفعة
    const regrowFails = sizes.slice(5).filter((n) => n > 10).length;
    expect(regrowFails).toBeGreaterThanOrEqual(1);
    expect(regrowFails).toBeLessThanOrEqual(6);
    expect(sizes.length).toBeLessThanOrEqual(4 + 50 + 6);   // من غير الكبر: ٥٤
  });

  it("📶 وقعة قصيرة (٦ طلبات) ⇒ الدفعة بتكبر تاني لحد ١٠٠ — مش ١٠٠٠ لوحة صف صف (كانت ٩٠٧ طلب)", async () => {
    await seed(1000);
    upsertFails = (_rows, callNo) => (callNo >= 3 && callNo <= 8
      ? { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 } : null);

    const res = await pushPendingFieldChecksBatched(AG);

    expect(res).toStrictEqual({ synced: 1000, pending: 1000, error: undefined });
    expect(await pendingIds()).toEqual([]);
    expect(serverRows.size).toBe(1000);
    const sizes = upserts().map((r) => r.rows.length);
    expect(sizes.slice(0, 9)).toEqual([100, 100, 100, 100, 50, 25, 12, 6, 3]);
    // بعد الوقعة: ١ ⇐ ٢ ⇐ ٤ … ⇐ ١٠٠ (ومابيعدّيش ١٠٠ أبداً)
    expect(sizes.slice(9, 17)).toEqual([1, 2, 4, 8, 16, 32, 64, 100]);
    expect(Math.max(...sizes)).toBe(100);
    expect(sizes.length).toBeLessThanOrEqual(25);
  });

  it("الكبر بيقف عند batchSize المخصّص", async () => {
    await seed(400);
    upsertFails = (_rows, callNo) => (callNo === 1
      ? { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 } : null);
    const res = await pushPendingFieldChecksBatched(AG, { batchSize: 120 });
    expect(res.synced).toBe(400);
    const sizes = upserts().map((r) => r.rows.length);
    expect(sizes.slice(0, 4)).toEqual([120, 120, 60, 120]);
    expect(Math.max(...sizes)).toBe(120);
  });

  it("الخطأ اللي بيرجع هو سبب اللي **فضل** مترفعش — مش وقعة نت اتعالجت قبله", async () => {
    await seed(300);
    const bad = `${AG}:250`;
    upsertFails = (rows, callNo) => {
      if (callNo === 0) return { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
      return rows.some((r) => r.local_id === bad)
        ? { error: { message: "invalid input", code: "22P02" }, status: 400 } : null;
    };
    const res = await pushPendingFieldChecksBatched(AG);
    expect(res).toStrictEqual({ synced: 299, pending: 300, error: "invalid input · 22P02" });
    expect(await pendingIds()).toEqual([bad]);
  });

  it("🔐 الجلسة مرفوضة (401) ⇒ نقف من أول طلب — مش ١٠٠٠ طلب مرفوض", async () => {
    await seed(1000);
    upsertFails = () => ({ error: { message: "JWT expired", code: "PGRST301" }, status: 401 });

    const res = await pushPendingFieldChecksBatched(AG);

    expect(upserts()).toHaveLength(1);
    expect(res).toStrictEqual({ synced: 0, pending: 1000, error: "JWT expired · PGRST301" });
    expect(await pendingIds()).toHaveLength(1000);
  });

  it("🔐 403 في النص ⇒ اللي اترفع متعلّم ونقف", async () => {
    await seed(1000);
    upsertFails = (_rows, callNo) => (callNo >= 2
      ? { error: { message: "permission denied", code: "42501" }, status: 403 } : null);

    const res = await pushPendingFieldChecksBatched(AG);

    expect(upserts()).toHaveLength(3);
    expect(res).toStrictEqual({ synced: 200, pending: 1000, error: "permission denied · 42501" });
    expect(await pendingIds()).toHaveLength(800);
  });

  it("المحاولة صف صف بتقف هي كمان لو النت وقع في النص (status 0) — اللي عدّى متعلّم", async () => {
    await seed(200);
    // بالترتيب اللي الطلبات بتطلع بيه (مش بأرقام الصفوف — IDB بيرتّب بالمفتاح كنص)
    const rejected = { error: { message: "invalid input", code: "22P02" }, status: 400 };
    upsertFails = (_rows, callNo) => {
      if (callNo >= 60) return { error: { message: "TypeError: Failed to fetch", code: "" }, status: 0 };
      return callNo === 0 || callNo === 51 ? rejected : null;
    };

    const res = await pushPendingFieldChecksBatched(AG);

    // الدفعة الأولى اترفضت ⇒ صف صف: ٥٠ عدّوا، الـ٥١ اترفض، ٨ عدّوا، اللي بعدهم النت وقع ⇒ وقفنا
    expect(upserts()).toHaveLength(61);
    expect(res).toStrictEqual({ synced: 58, pending: 200, error: "invalid input · 22P02" });
    expect(await pendingIds()).toHaveLength(142);
  });

  it("☁️ العلامة بتتكتب بعد كل دفعة — مش في الآخر بس (القفل في النص مايعيدش اللي اترفع)", async () => {
    await seed(300);
    let pendingAtSecondRequest = -1;
    beforeReply = async (callNo) => {
      if (callNo === 1) pendingAtSecondRequest = (await pendingIds()).length;
    };
    await pushPendingFieldChecksBatched(AG);
    expect(pendingAtSecondRequest).toBe(200);             // الدفعة الأولى اتعلّمت قبل التانية
  });
});

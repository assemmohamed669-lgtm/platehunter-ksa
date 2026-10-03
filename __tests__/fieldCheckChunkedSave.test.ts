import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveFieldCheckEntry, saveFieldCheckEntriesChunked, getAllFieldCheckEntries, clearFieldCheck,
  saveFieldCheckEntries, markFieldChecksSynced, markFieldChecksSyncedByIds,
  __breakDbConnectionForTest, type FieldCheckEntry,
} from "@/lib/idb";
import { savedIds, firstFailureReason } from "@/lib/trialRecords";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📤 تصدير ١٠٠٠+ لوحة مايهنّجش — كتابة على دفعات بدل ١٠٠٠ معاملة مرة واحدة
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٣ أكتوبر ٢٠٢٦): «لو عنده أكتر من ألف لوحة مش متصدّرة ويدوس تصدير
 *  مش عايزه يقفل ولا يهنّج معاه مهما كان عدد اللوحات».
 *
 *  التصدير كان بيعمل `Promise.allSettled(entries.map(saveFieldCheckEntry))` —
 *  يعني ١٠٠٠ معاملة IndexedDB بتتفتح **في نفس اللحظة**. ولو الآيفون كان قاتل
 *  الاتصال (#306) كل واحدة منهم بتفتح اتصال جديد لوحدها ⇒ ١٠٠٠ فتح للقاعدة.
 *
 *  `saveFieldCheckEntriesChunked` بتكتب دفعة ورا دفعة (معاملة لكل دفعة)، وبتسيب
 *  الصفحة تتنفّس بين الدفعات، وبترجّع نتيجة **لكل لوحة** بنفس شكل
 *  `Promise.allSettled` — فالصفحة تبدّلها من غير ما تغيّر `savedIds` ولا
 *  `firstFailureReason`. مفيش سلوك قديم اتغيّر: دالة جديدة، اختيارية.
 */

const AG = "7b4bc404-50e7-46ad-935f-aa65e293d6b8";

/** سجل شبه اللي صفحة «الجديد» بتصدّره — حقول متنوّعة عشان المقارنة تبقى حقيقية. */
const mk = (i: number): FieldCheckEntry => ({
  id: `${AG}:${1_700_000_000_000 + i}:ابح${String(1000 + (i % 9000))}`,
  agentId: AG,
  plate: `ابح${String(1000 + (i % 9000))}`,
  row: {
    "رقم اللوحة": `ابح${String(1000 + (i % 9000))}`,
    "النوع": i % 3 === 0 ? "و" : "",
    "الحي": "العليا",
    ...(i % 5 === 0 ? { "رقم الهيكل": `VIN${i}` } : {}),
  },
  method: "متشيكة بالصوت",
  ...(i % 7 === 0 ? {} : { lat: 24.7 + i / 1e5, lng: 46.6 + i / 1e5, mapsLink: `https://maps.google.com/?q=${i}` }),
  checkedAt: new Date(Date.UTC(2026, 9, 3, 10, 0, 0) + i * 1000).toISOString(),
  ...(i % 11 === 0 ? { srcId: `row-${i}` } : {}),
});

const byId = (a: FieldCheckEntry, b: FieldCheckEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const readAll = async () => (await getAllFieldCheckEntries()).sort(byId);

beforeEach(async () => {
  await clearFieldCheck();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveFieldCheckEntriesChunked — نفس النتيجة بالظبط", () => {
  it("١٥٠٠ سجل ⇒ نفس السجلات المخزّنة حرف بحرف زي الحفظ واحدة واحدة", async () => {
    const entries = Array.from({ length: 1500 }, (_, i) => mk(i));

    for (const e of entries) await saveFieldCheckEntry(e);
    const oneByOne = await readAll();
    expect(oneByOne).toHaveLength(1500);

    await clearFieldCheck();
    const outcomes = await saveFieldCheckEntriesChunked(entries);
    const chunked = await readAll();

    expect(chunked).toEqual(oneByOne);
    expect(outcomes).toHaveLength(1500);
    expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
  });

  it("النتيجة بشكل Promise.allSettled ⇒ savedIds / firstFailureReason شغّالين عليها زي ما هم", async () => {
    const entries = Array.from({ length: 250 }, (_, i) => mk(i));
    const outcomes = await saveFieldCheckEntriesChunked(entries, { chunkSize: 100 });
    expect(outcomes[0]).toEqual({ status: "fulfilled", value: undefined });
    expect(savedIds(entries.map((e) => e.id), outcomes)).toEqual(entries.map((e) => e.id));
    expect(firstFailureReason(outcomes)).toBeNull();
  });

  it("نفس المعرّف مرتين ⇒ الأخير يكسب (زي put) ومفيش تكرار", async () => {
    const a = mk(1);
    const b = { ...mk(1), plate: "دهو9999" };
    await saveFieldCheckEntriesChunked([a, mk(2), b], { chunkSize: 2 });
    const back = await readAll();
    expect(back).toHaveLength(2);
    expect(back.find((e) => e.id === a.id)!.plate).toBe("دهو9999");
  });

  it("قايمة فاضية ⇒ [] من غير ما تلمس القاعدة", async () => {
    const onProgress = vi.fn();
    await expect(saveFieldCheckEntriesChunked([], { onProgress })).resolves.toEqual([]);
    expect(onProgress).not.toHaveBeenCalled();
  });
});

describe("saveFieldCheckEntriesChunked — دفعات وتقدّم", () => {
  it("التقدّم بيوصل للإجمالي، دفعة دفعة، وبيزيد بس", async () => {
    const entries = Array.from({ length: 1500 }, (_, i) => mk(i));
    const calls: Array<[number, number]> = [];
    await saveFieldCheckEntriesChunked(entries, { onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toHaveLength(15);                       // الافتراضي ١٠٠ في الدفعة
    expect(calls[0]).toEqual([100, 1500]);
    expect(calls[calls.length - 1]).toEqual([1500, 1500]);
    for (let i = 1; i < calls.length; i++) expect(calls[i][0]).toBeGreaterThan(calls[i - 1][0]);
  });

  it("chunkSize مخصّص + آخر دفعة ناقصة", async () => {
    const calls: number[] = [];
    await saveFieldCheckEntriesChunked(Array.from({ length: 20 }, (_, i) => mk(i)), {
      chunkSize: 7, onProgress: (d) => calls.push(d),
    });
    expect(calls).toEqual([7, 14, 20]);
  });

  it("chunkSize بايظ (٠ / سالب / NaN) ⇒ الافتراضي ١٠٠", async () => {
    for (const bad of [0, -5, Number.NaN]) {
      const calls: number[] = [];
      await saveFieldCheckEntriesChunked(Array.from({ length: 250 }, (_, i) => mk(i)), {
        chunkSize: bad, onProgress: (d) => calls.push(d),
      });
      expect(calls).toEqual([100, 200, 250]);
    }
  });

  it("معاملة واحدة لكل دفعة — مش معاملة لكل لوحة", async () => {
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction");
    await saveFieldCheckEntriesChunked(Array.from({ length: 1500 }, (_, i) => mk(i)));
    expect(spy).toHaveBeenCalledTimes(15);
  });

  it("🫁 الصفحة بتتنفّس بين الدفعات — مؤقّت اتحط بعد الدفعة الأولى بيشتغل قبل الدفعة التانية", async () => {
    const spy = vi.spyOn(IDBDatabase.prototype, "transaction");
    let txWhenTimerFired = -1;
    await saveFieldCheckEntriesChunked(Array.from({ length: 300 }, (_, i) => mk(i)), {
      onProgress: (done) => {
        if (done === 100) setTimeout(() => { txWhenTimerFired = spy.mock.calls.length; }, 0);
      },
    });
    expect(txWhenTimerFired).toBe(1);                     // الدفعة التانية لسه مابدأتش
  });

  it("onProgress لو رمى غلط مايوقّفش الحفظ", async () => {
    const outcomes = await saveFieldCheckEntriesChunked(Array.from({ length: 30 }, (_, i) => mk(i)), {
      chunkSize: 10, onProgress: () => { throw new Error("UI boom"); },
    });
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(30);
    expect(await readAll()).toHaveLength(30);
  });
});

describe("saveFieldCheckEntriesChunked — لوحة بايظة ماتضيّعش الباقي", () => {
  it("سجلين بايظين في النص (بلا معرّف) ⇒ هم بس اللي فشلوا، والـ١٤٩٨ اتحفظوا", async () => {
    const entries = Array.from({ length: 1500 }, (_, i) => mk(i));
    entries[250] = { ...entries[250], id: undefined as unknown as string };
    entries[1203] = { ...entries[1203], id: undefined as unknown as string };

    const outcomes = await saveFieldCheckEntriesChunked(entries);

    expect(outcomes).toHaveLength(1500);
    const rejected = outcomes.map((o, i) => (o.status === "rejected" ? i : -1)).filter((i) => i >= 0);
    expect(rejected).toEqual([250, 1203]);
    expect(await readAll()).toHaveLength(1498);

    const ok = savedIds(entries.map((e) => e.id), outcomes);
    expect(ok).toHaveLength(1498);
    expect(firstFailureReason(outcomes)).toBe("DataError");
  });

  it("معاملة الدفعة اتلغت (abort) بسبب لوحة واحدة ⇒ الدفعة بتتجرّب لوحة لوحة واللوحة دي بس اللي بتفشل", async () => {
    // بنحاكي إن لوحة معيّنة بتلغي المعاملة اللي هي فيها (فشل مش متزامن — زي
    // حاجة الجهاز رفضها وهو بيكتب). المعاملة بتقع بكل اللي فيها.
    const origPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const req = origPut.call(this, value, key);
      if ((value as FieldCheckEntry)?.plate === "POISON") this.transaction.abort();
      return req;
    });
    const entries = Array.from({ length: 300 }, (_, i) => mk(i));
    entries[150] = { ...entries[150], plate: "POISON" };

    const outcomes = await saveFieldCheckEntriesChunked(entries, { chunkSize: 100 });

    const rejected = outcomes.map((o, i) => (o.status === "rejected" ? i : -1)).filter((i) => i >= 0);
    expect(rejected).toEqual([150]);
    const stored = await readAll();
    expect(stored).toHaveLength(299);
    expect(stored.some((e) => e.plate === "POISON")).toBe(false);
  });

  it("🔴 الاتصال ميت قبل التصدير (الآيفون قتله) ⇒ كلهم بيتحفظوا برضه (#306)", async () => {
    await saveFieldCheckEntry(mk(9999));
    __breakDbConnectionForTest();
    const entries = Array.from({ length: 450 }, (_, i) => mk(i));
    const outcomes = await saveFieldCheckEntriesChunked(entries);
    expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
    expect(await readAll()).toHaveLength(451);
  });
});

describe("markFieldChecksSyncedByIds — علامة «اترفع» من غير ما نقرا الشيت كله", () => {
  /**
   * `markFieldChecksSynced` بتقرا **كل** سجلات الجهاز (getAll) عشان تعلّم كام
   * واحد. مندوب عنده ١٠ آلاف سجل والرفع على دفعات بيعلّم بعد كل دفعة ⇒ ١٠ قرايات
   * للشيت كله. الجديدة بتجيب بالمعرّف بس — ونفس النتيجة بالحرف.
   */
  const seedMixed = () => saveFieldCheckEntries(
    Array.from({ length: 400 }, (_, i) => ({ ...mk(i), ...(i % 4 === 0 ? { synced: true } : i % 4 === 1 ? { synced: false } : {}) })),
  );
  const ids = [
    ...Array.from({ length: 400 }, (_, i) => mk(i).id).filter((_, i) => i % 3 !== 2),
    "مش-موجود-1", "مش-موجود-2",
  ];

  it("نفس السجلات المخزّنة بالظبط زي markFieldChecksSynced", async () => {
    await seedMixed();
    await markFieldChecksSynced(ids);
    const viaOld = await readAll();

    await clearFieldCheck();
    await seedMixed();
    await markFieldChecksSyncedByIds(ids);
    expect(await readAll()).toEqual(viaOld);
  });

  it("مابتقراش الشيت كله (مفيش getAll) — ومعاملة واحدة", async () => {
    await seedMixed();
    const getAll = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const tx = vi.spyOn(IDBDatabase.prototype, "transaction");
    await markFieldChecksSyncedByIds(ids);
    expect(getAll).not.toHaveBeenCalled();
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("قايمة فاضية ⇒ ولا معاملة", async () => {
    const tx = vi.spyOn(IDBDatabase.prototype, "transaction");
    await expect(markFieldChecksSyncedByIds([])).resolves.toBeUndefined();
    expect(tx).not.toHaveBeenCalled();
  });
});

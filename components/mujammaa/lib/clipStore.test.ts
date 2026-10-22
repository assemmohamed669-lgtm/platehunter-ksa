import { describe, expect, it } from "vitest";
import {
  ClipStore,
  FixCollector,
  MEM_ONLY_WARNING,
  OPEN_TIMEOUT_MS,
  PIN_PENDING,
  PLATES_ONLY_ERROR,
  ProgressiveClipWriter,
  SAVE_LOG_TAG,
  STORE_LIST_WAIT_MS,
  STORE_WRITE_TIMEOUT_MS,
  SaveErrorOnce,
  TX_TIMEOUT_MS,
  canPlay,
  clipDurationSec,
  clipJobFields,
  clipRunOutcome,
  clipStatusText,
  closeRecordedClip,
  clipForRow,
  deleteWarning,
  idbClipBackend,
  matchingChunks,
  openClipStore,
  platesOnlyEntries,
  preliminaryEntries,
  replaceTableWarning,
  retranscribeWarning,
  runFailureLog,
  runVerdict,
  saveErrorKind,
  transcribeAction,
  formatBytes,
  memoryClipBackend,
  recoverClip,
  type ClipBackend,
  type StoredClip,
} from "./clipStore";
import { NEIGHBOR_PIN, NO_PRECISE_PIN } from "./platePin";
import type { PlateEntry } from "./plateEntry";

/**
 * ==========================================================================
 *  مقاطع المجمّع — محفوظة على الجهاز لحد ما المندوب يمسحها بإيده
 * ==========================================================================
 *
 *  طلب المالك (٣ أكتوبر ٢٠٢٦): «لما المندوب يسجل كذا مقطع تظهر المقاطع دي
 *  تحت بعض وكل مقطع يبقي قدامه كلمه تفريغ … ولما يبدأ تسجيل او الصفحه تعمل
 *  تحديث او خرج او اتنقل بين الصفحات المقاطع دي متروحش».
 *
 *  قبل كده المقاطع كانت في الذاكرة بس: تحديث الصفحة أو أندرويد يقفل التبويب
 *  ⇒ الصوت يروح. والتسجيل اللي ماتفرّغش كان بيتمسح بالسكوت مع أول «بدء تسجيل».
 */

const START = 1_790_000_000_000;
const STAMP = { startedAt: START, streets: [], notes: [], types: [] };

function clock(t0 = START) {
  let t = t0;
  return { now: () => t, set: (v: number) => (t = v), add: (d: number) => (t += d) };
}

const bytes = (...xs: number[]) => new Uint8Array(xs).buffer;

async function readAll(b: Blob): Promise<number[]> {
  return Array.from(new Uint8Array(await b.arrayBuffer()));
}

function newStore() {
  const c = clock();
  const backend = memoryClipBackend();
  return { store: new ClipStore(backend, c.now), backend, c };
}

describe("ClipStore — إنشاء وحفظ تدريجي", () => {
  it("مقطع جديد بيبدأ «بيسجّل» برقم مسلسل", async () => {
    const { store } = newStore();
    const a = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const b = await store.create({ startEpoch: START + 60_000, mime: "audio/webm", source: "record", stamp: STAMP });
    expect(a.status).toBe("recording");
    expect(a.label).toBe("مقطع 1");
    expect(b.label).toBe("مقطع 2");
  });

  it("الأجزاء بتتلزق بترتيبها حتى لو اتبعتت من غير انتظار", async () => {
    const { store } = newStore();
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    void store.appendPart(c.id, bytes(1, 2));
    void store.appendPart(c.id, bytes(3));
    await store.appendPart(c.id, new Blob([new Uint8Array([4, 5])]));
    const meta = (await store.get(c.id))!;
    expect(meta.parts).toBe(3);
    expect(meta.bytes).toBe(5);
    expect(await readAll(await store.audio(c.id))).toEqual([1, 2, 3, 4, 5]);
    expect((await store.audio(c.id)).type).toBe("audio/webm");
  });

  it("الجزء الفاضي مابيتحسبش", async () => {
    const { store } = newStore();
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.appendPart(c.id, new ArrayBuffer(0));
    expect((await store.get(c.id))!.parts).toBe(0);
  });

  it("الإنهاء ⇒ «جاهز» بمدته ومسار موقعه", async () => {
    const { store } = newStore();
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const fix = { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000, recvEpoch: START + 1100 };
    const done = (await store.finish(c.id, { durationSec: 42.4, rawFixes: [fix] }))!;
    expect(done.status).toBe("ready");
    expect(done.durationSec).toBe(42.4);
    expect(done.rawFixes).toEqual([fix]);
  });

  it("القائمة الأحدث الأول", async () => {
    const { store } = newStore();
    await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.create({ startEpoch: START + 5000, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.create({ startEpoch: START + 2000, mime: "audio/webm", source: "record", stamp: STAMP });
    expect((await store.list()).map((c) => c.startEpoch)).toEqual([START + 5000, START + 2000, START]);
  });
});

describe("ClipStore — المسح بإيد المندوب بس", () => {
  it("المسح بيشيل المقطع وصوته", async () => {
    const { store, backend } = newStore();
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.appendPart(c.id, bytes(1, 2, 3));
    await store.remove(c.id);
    expect(await store.list()).toEqual([]);
    expect(await backend.getParts(c.id)).toEqual([]);
  });

  it("الرقم المسلسل مابيتكررش بعد مسح مقطع", async () => {
    const { store } = newStore();
    const a = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.create({ startEpoch: START + 1, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.remove(a.id);
    const c = await store.create({ startEpoch: START + 2, mime: "audio/webm", source: "record", stamp: STAMP });
    expect(c.label).toBe("مقطع 3");
  });

  it("تأكيد المسح بيحذّر لو المقطع لسه ماتفرّغش", () => {
    const base = { result: undefined } as unknown as StoredClip;
    expect(deleteWarning(base)).toContain("ماتفرّغش");
    const done = { result: { at: START, plates: 4, pinned: 4, entries: [] } } as unknown as StoredClip;
    expect(deleteWarning(done)).not.toContain("ماتفرّغش");
  });
});

describe("recoverClip — بعد تحديث الصفحة أو قفل التبويب", () => {
  const base: StoredClip = {
    id: "c1",
    seqNo: 1,
    label: "مقطع 1",
    createdAt: START,
    startEpoch: START,
    durationSec: 0,
    mime: "audio/webm",
    source: "record",
    status: "recording",
    parts: 30,
    bytes: 480_000,
    updatedAt: START + 31_000,
    stamp: STAMP,
    rawFixes: [],
  };

  it("مقطع كان «بيسجّل» ⇒ «اتقطع» ومدته لحد آخر جزء اتحفظ", () => {
    const r = recoverClip(base)!;
    expect(r.status).toBe("interrupted");
    expect(r.durationSec).toBe(31);
  });

  it("مقطع كان في الدور أو بيتفرّغ ⇒ يرجع «جاهز» (أو «خلص» لو نتيجته محفوظة)", () => {
    expect(recoverClip({ ...base, status: "queued" })!.status).toBe("ready");
    expect(recoverClip({ ...base, status: "working" })!.status).toBe("ready");
    const withResult = { ...base, status: "working" as const, result: { at: START, plates: 2, pinned: 1, entries: [] } };
    expect(recoverClip(withResult)!.status).toBe("done");
  });

  it("الحالات التانية مابتتغيّرش (null)", () => {
    expect(recoverClip({ ...base, status: "ready" })).toBeNull();
    expect(recoverClip({ ...base, status: "done" })).toBeNull();
    expect(recoverClip({ ...base, status: "failed" })).toBeNull();
    expect(recoverClip({ ...base, status: "interrupted" })).toBeNull();
  });

  it("store.recover بيحفظ التصحيح وبيرجّع القائمة", async () => {
    const { store, c } = newStore();
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    c.set(START + 12_000);
    await store.appendPart(clip.id, bytes(9));
    // الصفحة اتقفلت هنا — تحميل جديد على نفس التخزين
    const list = await store.recover();
    expect(list[0].status).toBe("interrupted");
    expect(list[0].durationSec).toBe(12);
    expect((await store.get(clip.id))!.status).toBe("interrupted");
    // الصوت المحفوظ لسه موجود ويتفرّغ
    expect(await readAll(await store.audio(clip.id))).toEqual([9]);
  });
});

describe("ProgressiveClipWriter — الصوت بيتحفظ وهو بيتسجّل", () => {
  it("كل flush بيكتب الأجزاء الجديدة بس كجزء واحد، والأخير بيكمّل الباقي", async () => {
    const { store } = newStore();
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [new Blob([new Uint8Array([1])]), new Blob([new Uint8Array([2])])];
    let fixes = 0;
    const w = new ProgressiveClipWriter(store, clip.id, () => chunks, () => ({ durationSec: ++fixes }));
    await w.flush();
    expect((await store.get(clip.id))!.parts).toBe(1);
    await w.flush(); // مافيش جديد
    expect((await store.get(clip.id))!.parts).toBe(1);
    chunks.push(new Blob([new Uint8Array([3])]), new Blob([new Uint8Array([4])]));
    await w.flush();
    const meta = (await store.get(clip.id))!;
    expect(meta.parts).toBe(2);
    expect(meta.durationSec).toBeGreaterThan(0);
    expect(await readAll(await store.audio(clip.id))).toEqual([1, 2, 3, 4]);
  });

  it("نداءين flush ورا بعض من غير انتظار مابيكرّروش جزء", async () => {
    const { store } = newStore();
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [new Blob([new Uint8Array([7])])];
    const w = new ProgressiveClipWriter(store, clip.id, () => chunks);
    void w.flush();
    await w.flush();
    expect(await readAll(await store.audio(clip.id))).toEqual([7]);
  });
});

describe("FixCollector — مسار موقع لكل مقطع", () => {
  it("بيسجّل وقت القراءة ووقت وصولها، ومابيكرّرش نفس القراءة", () => {
    const col = new FixCollector();
    const fix = { lat: 24.1, lng: 46.7, accuracy: 6, at: START + 1000 };
    col.add(fix, START + 1150);
    col.add(fix, START + 1400); // إشعار حالة بنفس القراءة
    col.add({ ...fix, at: START + 2000, lat: 24.2 }, START + 2100);
    expect(col.list()).toEqual([
      { lat: 24.1, lng: 46.7, acc: 6, fixEpoch: START + 1000, recvEpoch: START + 1150 },
      { lat: 24.2, lng: 46.7, acc: 6, fixEpoch: START + 2000, recvEpoch: START + 2100 },
    ]);
  });

  it("null مابيتسجّلش", () => {
    const col = new FixCollector();
    col.add(null, START);
    expect(col.list()).toEqual([]);
  });
});

describe("clipStatusText — حالة المقطع بكلام المندوب", () => {
  const c = (status: StoredClip["status"], extra: Partial<StoredClip> = {}) =>
    ({ status, ...extra }) as StoredClip;

  it("كل حالة ليها نص، و«خلص» بيقول كام لوحة وكام بموقع دقيق", () => {
    expect(clipStatusText(c("recording"))).toContain("بيسجّل");
    expect(clipStatusText(c("interrupted"))).toContain("اتقطع");
    expect(clipStatusText(c("ready"))).toContain("جاهز");
    expect(clipStatusText(c("queued"))).toContain("الدور");
    expect(clipStatusText(c("working"))).toContain("بيتفرّغ");
    expect(clipStatusText(c("failed", { error: "سيرفر واقع" }))).toContain("سيرفر واقع");
    const done = clipStatusText(
      c("done", { result: { at: START, plates: 12, pinned: 10, entries: [] } })
    );
    expect(done).toContain("12 لوحة");
    expect(done).toContain("10");
  });

  it("الزر: «تفريغ» للجاهز/المتقطع/الفاشل، «فرّغ تاني» للي خلص، ومقفول وهو بيسجّل أو في الدور", () => {
    expect(transcribeAction(c("ready"))).toEqual({ label: "تفريغ", enabled: true });
    expect(transcribeAction(c("interrupted"))).toEqual({ label: "تفريغ", enabled: true });
    expect(transcribeAction(c("failed"))).toEqual({ label: "تفريغ", enabled: true });
    expect(transcribeAction(c("done"))).toEqual({ label: "فرّغ تاني", enabled: true });
    expect(transcribeAction(c("recording")).enabled).toBe(false);
    expect(transcribeAction(c("queued")).enabled).toBe(false);
    expect(transcribeAction(c("working")).enabled).toBe(false);
  });
});

describe("clipJobFields + clipRunOutcome — التفريغ بسياق المقطع نفسه", () => {
  const clip: StoredClip = {
    id: "c9",
    seqNo: 9,
    label: "مقطع 9",
    createdAt: START,
    startEpoch: START,
    durationSec: 0,
    mime: "audio/webm",
    source: "record",
    status: "interrupted",
    parts: 3,
    bytes: 100,
    updatedAt: START + 20_400,
    stamp: STAMP,
    rawFixes: [
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 1000, recvEpoch: START + 1200 },
      { lat: 24.2, lng: 46.7, acc: 5, fixEpoch: START + 2000, recvEpoch: START + 2200 },
    ],
  };

  it("المهمة بتاخد بداية المقطع وختمه ومصدره ومساره بتوقيت نسبي — مش اللي حيّ في الصفحة", () => {
    const f = clipJobFields(clip);
    expect(f.startedAtMs).toBe(START);
    expect(f.stamp).toBe(STAMP);
    expect(f.source).toBe("record");
    expect(f.label).toBe("مقطع 9");
    expect(f.sec).toBe(20);
    expect(f.fixes.map((x) => x.tMs)).toEqual([1000, 2000]);
  });

  const entry = (plate: string, t?: number) =>
    ({
      id: plate,
      review: { plate, notes: [], timeStart: t },
      pin: null,
      match: { kind: "none" },
      capturedAt: START,
      source: "batch",
    }) as unknown as PlateEntry;

  it("نجح ⇒ الدبوس من مسار المقطع + «خلص» بالنتيجة كاملة", () => {
    const fixes = clipJobFields(clip).fixes;
    const out = clipRunOutcome({
      ok: true,
      entries: [entry("ابح1234", 1.5), entry("حطس5678", 30)],
      fixes,
      startEpoch: START,
      tookSec: 4.2,
      reportId: "r1",
      engine: "chunks",
      now: START + 99,
    });
    expect(out.entries[0].pin!.lat).toBeCloseTo(24.15, 9);
    expect(out.entries[1].pin).toBeNull();
    expect(out.patch.status).toBe("done");
    expect(out.patch.result).toMatchObject({ plates: 2, pinned: 1, tookSec: 4.2, reportId: "r1", engine: "chunks", at: START + 99 });
    expect(out.patch.result!.entries).toBe(out.entries);
    expect("error" in out.patch && out.patch.error === undefined).toBe(true);
  });

  it("فشل ⇒ «فشل» بالسبب، والصفوف زي ما هي والنتيجة القديمة مابتتلمسش", () => {
    const es = [entry("ابح1234", 1.5)];
    const out = clipRunOutcome({ ok: false, error: "السيرفر مش بيرد", entries: es, startEpoch: START, tookSec: 1, now: START });
    expect(out.entries).toBe(es);
    expect(out.patch).toEqual({ status: "failed", error: "السيرفر مش بيرد" });
  });

  it("بلا مسار (مهمة قديمة) ⇒ الصفوف بدبابيسها زي ما هي", () => {
    const es = [entry("ابح1234", 1.5)];
    const out = clipRunOutcome({ ok: true, entries: es, startEpoch: START, tookSec: 1, now: START });
    expect(out.entries).toBe(es);
    expect(out.patch.status).toBe("done");
  });
});

describe("مساعدات العرض", () => {
  it("الحجم", () => {
    expect(formatBytes(900)).toBe("900 بايت");
    expect(formatBytes(16_200)).toBe("16 ك.ب");
    expect(formatBytes(4_900_000)).toBe("4.7 م.ب");
  });

  it("مدة المقطع المتقطع من آخر حفظ لو المدة مش متسجّلة", () => {
    const c = { durationSec: 0, startEpoch: START, updatedAt: START + 61_500 } as StoredClip;
    expect(clipDurationSec(c)).toBe(61.5);
    expect(clipDurationSec({ ...c, durationSec: 40 })).toBe(40);
  });
});

/* ==================================================================
 *  🔴 مراجعة ٣ أكتوبر (عيب ١ HIGH): الحفظ فشل ⇒ الصوت ضاع أو اتقطع
 * ==================================================================
 *  الكاتب كان بيعلّم الأجزاء «اتحفظت» **قبل** ما الكتابة تنجح ⇒ فشل
 *  مؤقّت واحد = فجوة دايمة (A..E بقت "ABE"). ولما المساحة تتملي: المقطع
 *  يفضل «بيسجّل» بصفر بايت وزرّاره مقفولة، والتسجيل الكامل اللي في الذاكرة
 *  مابيتستعملش. القاعدة: **مافيش مقطع يضيع** — اللي في الذاكرة كامل.
 */

/** تخزين بيفشل بالطلب — زي مساحة الموبايل المليانة أو اتصال IndexedDB ميت */
function faultyBackend(base: ClipBackend = memoryClipBackend()) {
  const fail = { all: false, partWrites: 0, clipWrites: 0, replace: false };
  const quota = () => Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
  const backend: ClipBackend = {
    ...base,
    async putClip(c) {
      if (fail.all || fail.clipWrites > 0) {
        fail.clipWrites--;
        throw quota();
      }
      return base.putClip(c);
    },
    async putPartWithClip(c, seq, d) {
      if (fail.all || fail.partWrites > 0) {
        fail.partWrites--;
        throw quota();
      }
      return base.putPartWithClip(c, seq, d);
    },
    async replaceParts(c, d) {
      if (fail.all || fail.replace) throw quota();
      return base.replaceParts(c, d);
    },
  };
  return { fail, backend, base };
}

const chunk = (s: string) => new Blob([s]);
const text = async (b: Blob) => new TextDecoder().decode(await b.arrayBuffer());

describe("ProgressiveClipWriter — الجزء بيتعلّم «اتحفظ» بعد ما الكتابة تنجح بس", () => {
  it("فشل كتابة واحد في النص مايسيبش فجوة: A..E بتتحفظ ABCDE مش ABE", async () => {
    const { backend, fail } = faultyBackend();
    const store = new ClipStore(backend, clock().now);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [chunk("A"), chunk("B")];
    const w = new ProgressiveClipWriter(store, clip.id, () => chunks);
    await w.flush();
    chunks.push(chunk("C"), chunk("D"));
    fail.partWrites = 1; // اتصال ميت مرة
    await expect(w.flush()).rejects.toThrow();
    expect(w.flushedChunks).toBe(2);
    expect(w.failed).toBe(true);
    chunks.push(chunk("E"));
    await w.flush();
    expect(w.failed).toBe(false);
    expect(await text(await store.audio(clip.id))).toBe("ABCDE");
    expect(w.flushedChunks).toBe(5);
    expect((await store.get(clip.id))!.bytes).toBe(5);
  });

  it("فشل تحديث بيانات المقطع وقت الحفظ (المدة/المسار) مايوقّفش حفظ الصوت", async () => {
    const { backend, fail } = faultyBackend();
    const store = new ClipStore(backend, clock().now);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [chunk("A")];
    const w = new ProgressiveClipWriter(store, clip.id, () => chunks, () => ({ durationSec: 3 }));
    fail.clipWrites = 1;
    await w.flush();
    chunks.push(chunk("B"));
    await w.flush();
    expect(await text(await store.audio(clip.id))).toBe("AB");
  });
});

describe("appendPart — الجزء وبيانات المقطع في معاملة واحدة (مافيش كتابة فوق جزء)", () => {
  it("الكتابة فشلت ⇒ لا جزء ولا عدّاد اتغيّر، والجزء الجاي مابيدوسش على اللي قبله", async () => {
    const { backend, fail } = faultyBackend();
    const store = new ClipStore(backend, clock().now);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.appendPart(clip.id, bytes(1));
    fail.partWrites = 1;
    await expect(store.appendPart(clip.id, bytes(2))).rejects.toThrow();
    expect((await store.get(clip.id))!.parts).toBe(1);
    await store.appendPart(clip.id, bytes(3));
    expect(await readAll(await store.audio(clip.id))).toEqual([1, 3]);
    expect((await store.get(clip.id))!).toMatchObject({ parts: 2, bytes: 2 });
  });
});

describe("ClipStore — المساحة مليانة: المقطع يفضل في الذاكرة ويتفرّغ ويتمسح", () => {
  it("إنشاء المقطع فشل ⇒ مقطع في الذاكرة بس (memOnly) ظاهر في القائمة", async () => {
    const { backend, fail } = faultyBackend();
    const store = new ClipStore(backend, clock().now);
    fail.all = true;
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    expect(c.memOnly).toBe(true);
    const list = await store.list();
    expect(list.map((x) => x.id)).toEqual([c.id]);
    expect(list[0].memOnly).toBe(true);
  });

  it("تحديث الحالة فشل ⇒ القائمة بتعرض الحالة الجديدة برضه (مش «بيسجّل» للأبد)", async () => {
    const { backend, fail } = faultyBackend();
    const store = new ClipStore(backend, clock().now);
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    fail.clipWrites = 1;
    const next = await store.update(c.id, { status: "ready" });
    expect(next!.status).toBe("ready");
    expect((await store.list())[0].status).toBe("ready");
    expect((await store.get(c.id))!.status).toBe("ready");
  });

  it("الصوت الكامل المحجوز في الذاكرة بيغلب النسخة الناقصة المحفوظة", async () => {
    const { store } = newStore();
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.appendPart(c.id, new Blob(["AB"]));
    store.holdAudio(c.id, new Blob(["ABCDE"], { type: "audio/webm" }));
    expect(await text(await store.audio(c.id))).toBe("ABCDE");
    expect((await store.get(c.id))!.memOnly).toBe(true);
  });

  it("المسح بيشيل المقطع اللي في الذاكرة وصوته", async () => {
    const { backend, fail } = faultyBackend();
    const store = new ClipStore(backend, clock().now);
    fail.all = true;
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    store.holdAudio(c.id, new Blob(["X"]));
    await store.remove(c.id);
    expect(await store.list()).toEqual([]);
    expect((await store.audio(c.id)).size).toBe(0);
  });

  it("المسح على الجهاز فشل ⇒ النسخة اللي في الذاكرة مابتتشالش (مافيش ضياع بالغلط)", async () => {
    const { store, backend } = newStore();
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    store.holdAudio(c.id, new Blob(["ABC"]));
    const orig = backend.deleteClip;
    backend.deleteClip = async () => {
      throw new Error("dead");
    };
    await expect(store.remove(c.id)).rejects.toThrow();
    backend.deleteClip = orig;
    expect(await text(await store.audio(c.id))).toBe("ABC");
  });
});

describe("closeRecordedClip — قفل المقطع بعد ما التسجيل يقف", () => {
  async function recording(fb = faultyBackend()) {
    const store = new ClipStore(fb.backend, clock().now);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [];
    const writer = new ProgressiveClipWriter(store, clip.id, () => chunks);
    return { ...fb, store, clip, chunks, writer };
  }
  const close = (
    r: Awaited<ReturnType<typeof recording>>,
    extra: Partial<Parameters<typeof closeRecordedClip>[1]> = {}
  ) =>
    closeRecordedClip(r.store, {
      clipId: r.clip.id,
      writer: r.writer,
      blob: new Blob(r.chunks, { type: "audio/webm" }),
      chunks: r.chunks.slice(),
      durationSec: 12,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
      ...extra,
    });

  it("الحفظ التدريجي سليم ⇒ «جاهز» ومحفوظ كامل ومش في الذاكرة", async () => {
    const r = await recording();
    r.chunks.push(chunk("A"), chunk("B"));
    await r.writer.flush();
    r.chunks.push(chunk("C"));
    const out = await close(r);
    expect(out).toMatchObject({ id: r.clip.id, memOnly: false });
    const c = (await r.store.get(r.clip.id))!;
    expect(c.status).toBe("ready");
    expect(c.durationSec).toBe(12);
    expect(c.memOnly).toBeFalsy();
    expect(await text(await r.store.audio(r.clip.id))).toBe("ABC");
  });

  it("🔴 المساحة مليانة من الأول ⇒ «جاهز» في الذاكرة بصوته الكامل، يتفرّغ ويتمسح، وبتحذير", async () => {
    const fb = faultyBackend();
    fb.fail.all = true;
    const r = await recording(fb);
    r.chunks.push(chunk("A"), chunk("B"), chunk("C"), chunk("D"));
    await expect(r.writer.flush()).rejects.toThrow();
    const out = await close(r);
    expect(out.memOnly).toBe(true);
    expect(out.id).toBe(r.clip.id);
    const c = (await r.store.list())[0];
    expect(c.status).toBe("ready");
    expect(c.memOnly).toBe(true);
    expect(transcribeAction(c)).toEqual({ label: "تفريغ", enabled: true });
    expect(await text(await r.store.audio(c.id))).toBe("ABCD");
    expect(clipStatusText(c)).toContain(MEM_ONLY_WARNING);
    expect(deleteWarning(c)).toContain("الذاكرة");
    await r.store.remove(c.id);
    expect(await r.store.list()).toEqual([]);
  });

  it("اتحفظ جزء وبعدين المساحة خلصت ⇒ التفريغ بياخد الكامل اللي في الذاكرة مش الناقص", async () => {
    const fb = faultyBackend();
    const r = await recording(fb);
    r.chunks.push(chunk("A"), chunk("B"));
    await r.writer.flush();
    fb.fail.all = true;
    r.chunks.push(chunk("C"), chunk("D"), chunk("E"));
    const out = await close(r);
    expect(out.memOnly).toBe(true);
    expect(await text(await r.store.audio(r.clip.id))).toBe("ABCDE");
    expect((await r.store.get(r.clip.id))!.status).toBe("ready");
  });

  it("آخر حفظ تدريجي فشل بس الكتابة الكاملة نجحت ⇒ محفوظ كامل على الجهاز", async () => {
    const fb = faultyBackend();
    const r = await recording(fb);
    r.chunks.push(chunk("A"));
    await r.writer.flush();
    r.chunks.push(chunk("B"), chunk("C"));
    fb.fail.partWrites = 5; // الحفظ التدريجي واقع، والاستبدال الكامل شغّال
    const out = await close(r);
    expect(out.memOnly).toBe(false);
    expect(await text(await r.store.audio(r.clip.id))).toBe("ABC");
    expect((await r.store.get(r.clip.id))!.memOnly).toBeFalsy();
  });

  it("مافيش مقطع اتعمل أصلاً (المخزن ماردّش وقت البداية) ⇒ بيتعمل دلوقتي بالصوت الكامل", async () => {
    const { store } = newStore();
    const out = await closeRecordedClip(store, {
      clipId: null,
      writer: null,
      blob: new Blob(["ABC"], { type: "audio/webm" }),
      durationSec: 3,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.id).not.toBeNull();
    expect(await text(await store.audio(out.id!))).toBe("ABC");
    expect((await store.get(out.id!))!.status).toBe("ready");
  });

  it("تسجيل فاضي خالص ⇒ المقطع بيتشال", async () => {
    const r = await recording();
    const out = await close(r, { blob: new Blob([]) });
    expect(out.id).toBeNull();
    expect(await r.store.list()).toEqual([]);
  });
});

describe("runVerdict — أي فشل أو إيقاف في أي محرّك = «فشل» بالسبب، مش «خلص · ٠ لوحة»", () => {
  it("المحرّك ماوصلش لآخره ⇒ فشل بسببه، أو آخر رسالة اتسجّلت، أو سبب عام", () => {
    expect(runVerdict({ succeeded: false, error: "السيرفر مش بيرد" })).toEqual({ ok: false, error: "السيرفر مش بيرد" });
    expect(runVerdict({ succeeded: false, lastLog: "سيرفر واقع" })).toEqual({ ok: false, error: "سيرفر واقع" });
    expect(runVerdict({ succeeded: false })).toEqual({ ok: false, error: "التفريغ ماكملش" });
  });

  it("السبب الطويل بيتقصّ عشان يبان في صف المقطع", () => {
    const v = runVerdict({ succeeded: false, lastLog: "س".repeat(500) });
    expect(v.ok === false && v.error.length).toBeLessThanOrEqual(160);
  });

  it("وقّف التفريغ ⇒ فشل «اتوقف» حتى لو المحرّك كمّل", () => {
    const v = runVerdict({ succeeded: true, cancelled: true });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.error).toContain("اتوقف");
  });

  it("رمى استثناء ⇒ فشل بالاستثناء؛ ووصل لآخره بلا إيقاف ⇒ نجح (حتى بصفر لوحة)", () => {
    expect(runVerdict({ succeeded: false, threw: "boom" })).toEqual({ ok: false, error: "boom" });
    expect(runVerdict({ succeeded: true })).toEqual({ ok: true });
  });
});

describe("matchingChunks — أجزاء التسجيل تتستعمل بس لو هي نفس صوت المقطع", () => {
  it("مجموع الأجزاء = حجم الصوت ⇒ هي؛ غير كده ⇒ undefined", () => {
    const parts = [chunk("AB"), chunk("C")];
    expect(matchingChunks(new Blob(["ABC"]), parts)).toBe(parts);
    expect(matchingChunks(new Blob(["ABCD"]), parts)).toBeUndefined();
    expect(matchingChunks(new Blob(["ABC"]), [])).toBeUndefined();
    expect(matchingChunks(new Blob(["ABC"]), undefined)).toBeUndefined();
  });
});

describe("clipForRow — «بيسجّل» قديم (القفل فشل) مايقفلش زراير الصف", () => {
  const c = { id: "x", status: "recording" } as StoredClip;
  it("مش هو اللي بيتسجّل دلوقتي ⇒ يتعامل «اتقطع» (يتفرّغ ويتمسح)", () => {
    const row = clipForRow(c, null);
    expect(row.isRec).toBe(false);
    expect(row.clip.status).toBe("interrupted");
    expect(transcribeAction(row.clip).enabled).toBe(true);
  });
  it("هو اللي بيتسجّل دلوقتي ⇒ «بيسجّل»", () => {
    const row = clipForRow({ ...c, status: "ready" }, "x");
    expect(row.isRec).toBe(true);
    expect(transcribeAction(row.clip).enabled).toBe(false);
  });
  it("الحالات التانية زي ما هي", () => {
    const row = clipForRow({ ...c, status: "done" }, "y");
    expect(row).toEqual({ isRec: false, clip: { ...c, status: "done" } });
  });
});

describe("replaceTableWarning — «اعرض لوحاته في الجدول» بيسأل لو الجدول فيه لوحات", () => {
  it("جدول فاضي ⇒ مافيش سؤال؛ فيه لوحات ⇒ تحذير بعددها", () => {
    expect(replaceTableWarning(0)).toBeNull();
    const w = replaceTableWarning(7)!;
    expect(w).toContain("7");
    expect(w).toContain("هتتبدّل");
  });
});

/* ==================================================================
 *  🔴 مراجعة ٣ أكتوبر (جولة ٢ — عيب ١ HIGH): IndexedDB على الآيفون
 * ==================================================================
 *  الآيفون ساعات بيسيب فتح IndexedDB أو المعاملة **معلّقة** (مافيش نجاح
 *  ولا خطأ)، وساعات بيقتل الاتصال («Connection to Indexed Database server
 *  lost» — UnknownError). قبل كده: نداء معلّق واحد بيوقّف كل اللي وراه،
 *  فـ«بدء التسجيل» يفضل «بيحفظ المقطع…» للأبد، والقائمة تبان فاضية والصوت
 *  الكامل في الذاكرة. القاعدة: «المقاطع متروحش» — ولا الصفحة تعلّق.
 */

/** مهل قصيرة للاختبار — نفس المنطق، بس بالملّي ثانية */
const FAST = { writeTimeoutMs: 40, readTimeoutMs: 40, audioTimeoutMs: 40, listWaitMs: 40, coolDownMs: 60_000 };

/** تخزين بيعلّق (`hang`) أو اتصاله ميت (`dead`) بالطلب — زي آيفون في الخلفية */
function sickBackend(base: ClipBackend = memoryClipBackend()) {
  const state = { hang: false, dead: false, calls: 0 };
  const lost = () =>
    Object.assign(new Error("Connection to Indexed Database server lost. Refresh the page to try again"), {
      name: "UnknownError",
    });
  const wrap =
    <A extends unknown[], R>(f: (...a: A) => Promise<R>) =>
    (...a: A): Promise<R> => {
      state.calls++;
      if (state.hang) return new Promise<R>(() => {});
      if (state.dead) return Promise.reject(lost());
      return f(...a);
    };
  const backend: ClipBackend = {
    putClip: wrap(base.putClip),
    getClip: wrap(base.getClip),
    allClips: wrap(base.allClips),
    putPartWithClip: wrap(base.putPartWithClip),
    replaceParts: wrap(base.replaceParts),
    getParts: wrap(base.getParts),
    deleteClip: wrap(base.deleteClip),
  };
  return { state, backend, base };
}

/** بيقيس الوعد خلص في قد إيه — وبيرمي لو ماخلصش خالص في `ms` */
async function settlesWithin<T>(p: Promise<T>, ms: number): Promise<{ value: T; took: number }> {
  const t0 = Date.now();
  const value = await Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`ماخلصش في ${ms}ms`)), ms)),
  ]);
  return { value, took: Date.now() - t0 };
}

describe("🔴 التخزين علّق أو مات (آيفون) — مافيش نداء بيعلّق الباقي، والمقاطع متروحش", () => {
  it("التخزين علّق بعد إنشاء المقطع ⇒ القفل بيخلص في ثواني، والمقطع «جاهز» في الذاكرة بصوته الكامل", async () => {
    const sb = sickBackend();
    const store = new ClipStore(sb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [chunk("H"), chunk("q")];
    const writer = new ProgressiveClipWriter(store, clip.id, () => chunks);
    sb.state.hang = true;
    const { value: out } = await settlesWithin(
      closeRecordedClip(store, {
        clipId: clip.id,
        writer,
        blob: new Blob(chunks, { type: "audio/webm" }),
        chunks: chunks.slice(),
        durationSec: 2,
        rawFixes: [],
        stamp: STAMP,
        startEpoch: START,
        mime: "audio/webm",
      }),
      1500
    );
    expect(out).toMatchObject({ id: clip.id, memOnly: true });
    const { value: list } = await settlesWithin(store.list(), 1000);
    expect(list.map((c) => [c.id, c.status, c.memOnly])).toEqual([[clip.id, "ready", true]]);
    expect((await settlesWithin(store.get(clip.id), 1000)).value!.status).toBe("ready");
    expect(await text((await settlesWithin(store.audio(clip.id), 1000)).value)).toBe("Hq");
  });

  it("كتابة معلّقة مابتوقّفش القراية ولا التحديث — كلهم بيرجعوا، والمعلّقة بترمي TimeoutError", async () => {
    const sb = sickBackend();
    const store = new ClipStore(sb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    sb.state.hang = true;
    const stuck = store.appendPart(clip.id, bytes(1));
    const stuckErr = stuck.then(
      () => null,
      (e) => e
    );
    const [list, got, upd] = (
      await settlesWithin(
        Promise.all([store.list(), store.get(clip.id), store.update(clip.id, { durationSec: 3 })]),
        1500
      )
    ).value;
    expect(list.map((c) => c.id)).toEqual([clip.id]);
    expect(got!.id).toBe(clip.id);
    expect(upd!.durationSec).toBe(3);
    expect(await stuckErr).toMatchObject({ name: "TimeoutError" });
  });

  it("بعد ما يعلّق مرة: النداءات اللي بعده بتفشل على طول (من غير ما تلمس التخزين) لحد وقت الراحة، وبعدها بيجرّب تاني", async () => {
    const sb = sickBackend();
    const c = clock();
    const store = new ClipStore(sb.backend, c.now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    sb.state.hang = true;
    await expect(store.appendPart(clip.id, bytes(1))).rejects.toMatchObject({ name: "TimeoutError" });
    sb.state.hang = false;
    const calls = sb.state.calls;
    const t0 = Date.now();
    await expect(store.appendPart(clip.id, bytes(2))).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(30);
    expect(sb.state.calls).toBe(calls); // ماستناش التخزين أصلاً
    expect(store.down).toBe(true);
    c.add(FAST.coolDownMs + 1);
    await store.appendPart(clip.id, bytes(3));
    expect(store.down).toBe(false);
    expect(await readAll(await store.audio(clip.id))).toEqual([3]);
  });

  it("🔴 الاتصال مات (UnknownError) بعد الإنشاء ⇒ القائمة بتعرض المقطع (مش ٠ صف)، و get/update مابيرموش، والصوت الكامل من الذاكرة", async () => {
    const sb = sickBackend();
    const store = new ClipStore(sb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.appendPart(clip.id, new Blob(["A"]));
    sb.state.dead = true;
    const out = await closeRecordedClip(store, {
      clipId: clip.id,
      writer: null,
      blob: new Blob(["ABC"], { type: "audio/webm" }),
      chunks: [chunk("A"), chunk("BC")],
      durationSec: 3,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.memOnly).toBe(true);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: clip.id, status: "ready", memOnly: true });
    await expect(store.update(clip.id, { error: "x" })).resolves.toMatchObject({ error: "x" });
    // التفريغ من الذاكرة: نفس اللي `transcribeClip` بيعمله
    const got = (await store.get(clip.id))!;
    expect(clipJobFields(got).startedAtMs).toBe(START);
    expect(await text(await store.audio(clip.id))).toBe("ABC");
    expect(transcribeAction(clipForRow(got, null).clip).enabled).toBe(true);
  });

  it("التخزين علّق من أول ما الصفحة فتحت ⇒ المقطع بيتعمل في الذاكرة في ثواني، والتسجيل مايقفش", async () => {
    const sb = sickBackend();
    sb.state.hang = true;
    const store = new ClipStore(sb.backend, clock().now, FAST);
    const { value: c } = await settlesWithin(
      store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP }),
      1500
    );
    expect(c.memOnly).toBe(true);
    expect((await settlesWithin(store.list(), 500)).value.map((x) => x.id)).toEqual([c.id]);
  });

  it("recover() مابيرميش لو التخزين ميت وقت فتح الصفحة — وأول ما يرجع المقاطع القديمة بتبان متصحّحة", async () => {
    const sb = sickBackend();
    const c = clock();
    // مقطع كان بيتفرّغ لما الصفحة اتقفلت في جلسة قديمة
    await sb.base.putClip({
      id: "old",
      seqNo: 1,
      label: "مقطع 1",
      createdAt: START,
      startEpoch: START,
      durationSec: 0,
      mime: "audio/webm",
      source: "record",
      status: "working",
      parts: 1,
      bytes: 3,
      updatedAt: START + 9000,
      stamp: STAMP,
      rawFixes: [],
    });
    sb.state.dead = true;
    const store = new ClipStore(sb.backend, c.now, FAST);
    await expect(store.recover()).resolves.toEqual([]);
    sb.state.dead = false;
    const list = await store.list();
    expect(list.map((x) => [x.id, x.status])).toEqual([["old", "ready"]]);
    // والتصحيح بيتحفظ في المحاولة الجاية
    expect(store.hasPending()).toBe(true);
    await store.retryPending();
    expect((await sb.base.getClip("old"))!.status).toBe("ready");
  });

  it("القائمة مابتستناش قراية بطيئة/معلّقة أكتر من ثانية (حتى قبل ما مهلة القراية تخلص)", async () => {
    const sb = sickBackend();
    const store = new ClipStore(sb.backend, clock().now, { ...FAST, readTimeoutMs: 5000, listWaitMs: 30 });
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    sb.state.hang = true;
    const { value, took } = await settlesWithin(store.list(), 1000);
    expect(value.map((x) => x.id)).toEqual([c.id]);
    expect(took).toBeLessThan(500);
  });

  it("المهل الافتراضية: كتابة ٢.٥ث وانتظار القائمة ثانية — «بدء التسجيل» بيرجع في ثواني", () => {
    expect(STORE_WRITE_TIMEOUT_MS).toBeLessThanOrEqual(2500);
    expect(STORE_LIST_WAIT_MS).toBeLessThanOrEqual(1000);
  });

  it("القراية فشلت مرة ⇒ آخر قائمة اتقرت بتفضل ظاهرة (المقاطع مابتختفيش)", async () => {
    const sb = sickBackend();
    const a = new ClipStore(sb.backend, clock().now, FAST);
    await a.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await a.create({ startEpoch: START + 5, mime: "audio/webm", source: "record", stamp: STAMP });
    // تحميل جديد للصفحة على نفس التخزين
    const b = new ClipStore(sb.backend, clock().now, FAST);
    expect(await b.list()).toHaveLength(2);
    sb.state.dead = true;
    expect(await b.list()).toHaveLength(2);
  });

  it("openClipStore: الفتح معلّق ⇒ بيرجع مخزن في ثواني (مش بيستنى للأبد) والمقاطع بتتعمل في الذاكرة", async () => {
    const sb = sickBackend();
    sb.state.hang = true;
    const { value: o } = await settlesWithin(
      openClipStore({ backend: sb.backend, probeTimeoutMs: 40, store: FAST }),
      1500
    );
    expect(o.error).toBeTruthy();
    const { value: c } = await settlesWithin(
      o.store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP }),
      500
    );
    expect(c.memOnly).toBe(true);
  });
});

describe("💾 الصوت المحجوز في الذاكرة بيتحفظ أول ما المساحة تفضى (عيب ٧)", () => {
  it("المساحة مليانة ⇒ في الذاكرة؛ لسه مليانة ⇒ مافيش تغيير؛ فضيت ⇒ بيتحفظ كامل والتحذير بيروح", async () => {
    const fb = faultyBackend();
    const store = new ClipStore(fb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    fb.fail.all = true;
    const out = await closeRecordedClip(store, {
      clipId: clip.id,
      writer: null,
      blob: new Blob(["ABCD"], { type: "audio/webm" }),
      durationSec: 4,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.memOnly).toBe(true);
    expect(store.hasPending()).toBe(true);
    expect(await store.retryPending()).toBe(0);
    expect((await store.list())[0].memOnly).toBe(true);
    fb.fail.all = false;
    expect(await store.retryPending()).toBe(1);
    expect(store.hasPending()).toBe(false);
    const row = (await store.list())[0];
    expect(row.memOnly).toBeFalsy();
    expect(row).toMatchObject({ status: "ready", bytes: 4, durationSec: 4 });
    expect(await text(new Blob(await fb.base.getParts(clip.id)))).toBe("ABCD");
    expect((await fb.base.getClip(clip.id))!.status).toBe("ready");
  });

  it("مقطع اتعمل في الذاكرة بس (الإنشاء فشل) ⇒ بيتحفظ هو وصوته لما المساحة تفضى", async () => {
    const fb = faultyBackend();
    fb.fail.all = true;
    const store = new ClipStore(fb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await closeRecordedClip(store, {
      clipId: clip.id,
      writer: null,
      blob: new Blob(["XY"]),
      durationSec: 2,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    fb.fail.all = false;
    expect(await store.retryPending()).toBe(1);
    expect((await fb.base.getClip(clip.id))!).toMatchObject({ status: "ready", bytes: 2 });
  });

  it("تحديث بيانات فشل (الحالة) بيتحفظ في المحاولة الجاية", async () => {
    const fb = faultyBackend();
    const store = new ClipStore(fb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    await store.appendPart(clip.id, bytes(1));
    fb.fail.clipWrites = 1;
    await store.update(clip.id, { status: "done", error: undefined });
    expect((await fb.base.getClip(clip.id))!.status).toBe("recording");
    expect(store.hasPending()).toBe(true);
    expect(await store.retryPending()).toBe(1);
    expect((await fb.base.getClip(clip.id))!.status).toBe("done");
  });

  it("المقطع اللي لسه بيتسجّل مابيتلمسش (الكاتب بتاعه هو اللي بيحفظه)", async () => {
    const fb = faultyBackend();
    fb.fail.all = true;
    const store = new ClipStore(fb.backend, clock().now, FAST);
    const clip = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    fb.fail.all = false;
    expect(store.hasPending()).toBe(false);
    expect(await store.retryPending()).toBe(0);
    expect(await fb.base.getClip(clip.id)).toBeUndefined();
  });

  it("canPlay: «اسمع» شغّال لمقطع صوته في الذاكرة بس (٠ بايت على الجهاز)", () => {
    expect(canPlay({ bytes: 0, memOnly: true })).toBe(true);
    expect(canPlay({ bytes: 120 })).toBe(true);
    expect(canPlay({ bytes: 0 })).toBe(false);
  });
});

describe("closeRecordedClip — آخر جزء وصل متأخر (عيب ٥): بيتحفظ **الأطول**", () => {
  it("الكاتب حفظ جزء وصل بعد مهلة stop() ⇒ المحفوظ «HAZ» يفضل (مايتكتبش فوقه «HA» الأقصر)", async () => {
    const store = new ClipStore(memoryClipBackend(), clock().now, FAST);
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [chunk("H"), chunk("A")];
    const w = new ProgressiveClipWriter(store, c.id, () => chunks);
    const blob = new Blob(chunks); // stop() بنى الصوت قبل آخر جزء
    chunks.push(chunk("Z")); // آخر جزء بعد شبكة الأمان (٨٠٠ms)
    const out = await closeRecordedClip(store, {
      clipId: c.id,
      writer: w,
      blob,
      chunks: chunks.slice(0, 2),
      durationSec: 2,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.memOnly).toBe(false);
    expect(await text(await store.audio(c.id))).toBe("HAZ");
  });

  it("الأجزاء اللي في الذاكرة أطول من صوت stop() ⇒ بيتحفظ الأطول", async () => {
    const store = new ClipStore(memoryClipBackend(), clock().now, FAST);
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const out = await closeRecordedClip(store, {
      clipId: c.id,
      writer: null,
      blob: new Blob(["HA"]),
      chunks: [chunk("H"), chunk("A"), chunk("Z")],
      durationSec: 2,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.memOnly).toBe(false);
    expect(await text(await store.audio(c.id))).toBe("HAZ");
  });

  it("صوت stop() فاضي بس الكاتب حفظ صوت ⇒ المقطع مايتمسحش", async () => {
    const store = new ClipStore(memoryClipBackend(), clock().now, FAST);
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    const chunks: Blob[] = [chunk("Q")];
    const w = new ProgressiveClipWriter(store, c.id, () => chunks);
    await w.flush();
    const out = await closeRecordedClip(store, {
      clipId: c.id,
      writer: w,
      blob: new Blob([]),
      durationSec: 1,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.id).toBe(c.id);
    expect(await text(await store.audio(c.id))).toBe("Q");
  });
});

describe("سجل أخطاء الحفظ — مرة واحدة لكل مقطع لكل نوع خطأ (عيب ٦)", () => {
  const quota = () => Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
  const timeout = () => Object.assign(new Error("t"), { name: "TimeoutError" });

  it("نفس المقطع ونفس النوع ⇒ أول مرة بس؛ نوع تاني أو مقطع تاني ⇒ يتسجّل", () => {
    const once = new SaveErrorOnce();
    expect(once.first("c1", quota())).toBe(true);
    for (let i = 0; i < 300; i++) expect(once.first("c1", quota())).toBe(false); // ٥ دقايق كل ثانية
    expect(once.first("c1", timeout())).toBe(true);
    expect(once.first("c2", quota())).toBe(true);
  });

  it("نوع الخطأ: اسمه، أو رسالته لو اسمه Error عادي", () => {
    expect(saveErrorKind(quota())).toBe("QuotaExceededError");
    expect(saveErrorKind(new Error("boom"))).toBe(saveErrorKind(new Error("boom")));
    expect(saveErrorKind(new Error("boom"))).not.toBe(saveErrorKind(new Error("other")));
  });

  it("سبب فشل التفريغ مايتاخدش من رسالة حفظ — بياخد أحدث رسالة مش حفظ", () => {
    const log = [
      { message: `${SAVE_LOG_TAG} المساحة مليانة` },
      { message: "سيرفر المقاطع رفض الطلب" },
      { message: `${SAVE_LOG_TAG} تاني` },
    ];
    expect(runFailureLog(log)).toBe("سيرفر المقاطع رفض الطلب");
    expect(runFailureLog([{ message: `${SAVE_LOG_TAG} x` }])).toBeUndefined();
  });

  it("closeRecordedClip بيرجّع نوع كل خطأ عشان الصفحة تسجّله مرة", async () => {
    const fb = faultyBackend();
    const store = new ClipStore(fb.backend, clock().now, FAST);
    const c = await store.create({ startEpoch: START, mime: "audio/webm", source: "record", stamp: STAMP });
    fb.fail.all = true;
    const out = await closeRecordedClip(store, {
      clipId: c.id,
      writer: null,
      blob: new Blob(["AB"]),
      durationSec: 1,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
    });
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors.every((e) => e.kind === "QuotaExceededError" && !!e.where && !!e.message)).toBe(true);
  });
});

describe("runVerdict — اللوحات ظهرت بس الأنواع ماوصلتش ⇒ «الأنواع ماوصلتش — فرّغ تاني»", () => {
  it("الرد اتقطع / السيرفر رفض / وقّف التفريغ / استثناء — بعد سطر اللوحات", () => {
    for (const r of [
      { succeeded: false, platesOnly: true, error: "الرد اتقطع" },
      { succeeded: false, platesOnly: true, cancelled: true },
      { succeeded: true, platesOnly: true, cancelled: true },
      { succeeded: false, platesOnly: true, threw: "boom" },
    ]) {
      expect(runVerdict(r)).toEqual({ ok: false, error: PLATES_ONLY_ERROR });
    }
    expect(PLATES_ONLY_ERROR).toBe("الأنواع ماوصلتش — فرّغ تاني");
  });
});

describe("سطر اللوحات (أوقات مبدئية) ⇒ مافيش دبوس أبداً (عيب ٢)", () => {
  const pinned = (plate: string) =>
    ({
      id: plate,
      review: { plate, notes: [`${NO_PRECISE_PIN} — قديم`], timeStart: 3 },
      pin: { lat: 24.1, lng: 46.7, accuracy: 5, at: START, ageMs: 0, stale: false },
      match: { kind: "none" },
      capturedAt: START,
      source: "batch",
    }) as unknown as PlateEntry;

  it("preliminaryEntries: بلا دبوس حتى لو اتبعت بدبوس، وعلامة «📍 بيتحدّد…» مرة واحدة", () => {
    const out = preliminaryEntries(preliminaryEntries([pinned("ابح1234")]));
    expect(out[0].pin).toBeNull();
    expect(out[0].review.notes.filter((n) => n === PIN_PENDING)).toHaveLength(1);
    expect(out[0].review.notes.some((n) => n.startsWith(NO_PRECISE_PIN))).toBe(false);
    expect(PIN_PENDING).toBe("📍 بيتحدّد…");
  });

  it("📍 علامة «نفس موقع اللوحة اللي قبلها» بتتشال مع الدبوس (الدبوس المنسوخ مش من أوقات نهائية)", () => {
    const copied = {
      ...pinned("ابح1234"),
      review: { plate: "ابح1234", notes: [`${NEIGHBOR_PIN} قبلها (فرق 3ث)`, "مركونه"], timeStart: 3 },
    } as unknown as PlateEntry;
    const pre = preliminaryEntries([copied]);
    expect(pre[0].pin).toBeNull();
    expect(pre[0].review.notes).toEqual(["مركونه", PIN_PENDING]);
    const only = platesOnlyEntries([copied]);
    expect(only[0].review.notes.some((n) => n.startsWith(NEIGHBOR_PIN))).toBe(false);
  });

  it("platesOnlyEntries: الرد ماكملش ⇒ اللوحات تفضل بلا دبوس، ومتعلّمة «من غير موقع دقيق — الأنواع ماوصلتش»", () => {
    const out = platesOnlyEntries(preliminaryEntries([pinned("ابح1234"), pinned("حطس5678")]));
    expect(out.map((e) => e.pin)).toEqual([null, null]);
    for (const e of out) {
      expect(e.review.notes).not.toContain(PIN_PENDING);
      expect(e.review.notes.filter((n) => n.startsWith(NO_PRECISE_PIN))).toEqual([
        `${NO_PRECISE_PIN} — ${PLATES_ONLY_ERROR}`,
      ]);
    }
  });
});

/* ================================================================
 *  idbClipBackend — مهلة الفتح (١٠ث زي إصلاح التطبيق 4e01eaf) ومهلة
 *  كل معاملة، وإعادة محاولة **مرة** على **أي** فشل باتصال جديد (#306)
 * ================================================================ */

type FakePlan = {
  /** الفتح رقم n مابيردّش خالص */
  openHang?: (n: number) => boolean;
  /** الفتح رقم n بيتأخر */
  openDelay?: (n: number) => number;
  /** المعاملة رقم n بتفشل بالخطأ ده */
  txError?: (n: number) => Error | null;
  /** المعاملة رقم n مابتخلصش أبداً */
  txHang?: (n: number) => boolean;
};

/** IndexedDB مزيّفة صغيرة — بتكفي `idbClipBackend` وبتعلّق/تموت بالطلب */
function fakeIdb(plan: FakePlan = {}) {
  const stores = new Map<string, Map<string, unknown>>([
    ["clips", new Map()],
    ["parts", new Map()],
  ]);
  const stats = { opens: 0, txs: 0, closed: 0 };
  type Range = { lower: [string, number]; upper: [string, number] };
  const isRange = (q: unknown): q is Range => !!q && typeof q === "object" && "lower" in (q as object);
  const keyOf = (name: string, v: { id?: string; clipId?: string; seq?: number }) =>
    name === "clips" ? JSON.stringify(v.id) : JSON.stringify([v.clipId, v.seq]);
  const inRange = (k: string, r: Range) => {
    const [cid, seq] = JSON.parse(k) as [string, number];
    return cid === r.lower[0] && seq >= r.lower[1] && seq <= r.upper[1];
  };
  const makeDb = () => ({
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({}),
    onclose: null as null | (() => void),
    onversionchange: null as null | (() => void),
    close() {
      stats.closed++;
    },
    transaction() {
      const n = ++stats.txs;
      const ops: Array<() => void> = [];
      const t = {
        error: null as Error | null,
        oncomplete: null as null | (() => void),
        onerror: null as null | (() => void),
        onabort: null as null | (() => void),
        abort() {
          t.error = t.error ?? Object.assign(new Error("aborted"), { name: "AbortError" });
          t.onabort?.();
        },
        objectStore(name: string) {
          const s = stores.get(name)!;
          return {
            put(v: { id?: string; clipId?: string; seq?: number }) {
              ops.push(() => s.set(keyOf(name, v), v));
              return {};
            },
            get(k: unknown) {
              const r: { result?: unknown } = {};
              ops.push(() => (r.result = s.get(JSON.stringify(k))));
              return r;
            },
            getAll(q?: unknown) {
              const r: { result?: unknown[] } = {};
              ops.push(
                () => (r.result = [...s.entries()].filter(([k]) => !isRange(q) || inRange(k, q)).map((e) => e[1]))
              );
              return r;
            },
            delete(q: unknown) {
              ops.push(() => {
                for (const k of [...s.keys()]) if (isRange(q) ? inRange(k, q) : k === JSON.stringify(q)) s.delete(k);
              });
              return {};
            },
          };
        },
      };
      setTimeout(() => {
        if (plan.txHang?.(n)) return;
        const err = plan.txError?.(n);
        if (err) {
          t.error = err;
          t.onerror?.();
          t.onabort?.();
          return;
        }
        for (const f of ops) f();
        t.oncomplete?.();
      }, 0);
      return t;
    },
  });
  const factory = {
    open() {
      const n = ++stats.opens;
      const req: Record<string, unknown> & { result?: unknown } = {};
      if (plan.openHang?.(n)) return req;
      setTimeout(() => {
        req.result = makeDb();
        (req.onupgradeneeded as (() => void) | undefined)?.();
        (req.onsuccess as (() => void) | undefined)?.();
      }, plan.openDelay?.(n) ?? 0);
      return req;
    },
  } as unknown as IDBFactory;
  const keyRange = (lo: unknown, hi: unknown) => ({ lower: lo, upper: hi }) as unknown as IDBKeyRange;
  return { factory, keyRange, stats };
}

const lostConn = () =>
  Object.assign(new Error("Connection to Indexed Database server lost. Refresh the page to try again"), {
    name: "UnknownError",
  });

const clipRec = (id: string): StoredClip => ({
  id,
  seqNo: 1,
  label: "مقطع 1",
  createdAt: START,
  startEpoch: START,
  durationSec: 0,
  mime: "audio/webm",
  source: "record",
  status: "recording",
  parts: 0,
  bytes: 0,
  updatedAt: START,
  stamp: STAMP,
  rawFixes: [],
});

describe("idbClipBackend — مهلة الفتح والمعاملة، وإعادة مرة باتصال جديد على أي فشل", () => {
  it("المهل الافتراضية: فتح ١٠ث (زي التطبيق) ومعاملة ١٠ث", () => {
    expect(OPEN_TIMEOUT_MS).toBe(10_000);
    expect(TX_TIMEOUT_MS).toBe(10_000);
  });

  it("الأجزاء والمقطع رايح جاي سليم (المزيّفة نفسها شغّالة)", async () => {
    const f = fakeIdb();
    const be = idbClipBackend({ factory: f.factory, keyRange: f.keyRange });
    await be.putPartWithClip({ ...clipRec("c1"), parts: 1, bytes: 1 }, 0, bytes(1));
    await be.putPartWithClip({ ...clipRec("c1"), parts: 2, bytes: 2 }, 1, bytes(2));
    expect((await be.getParts("c1")).map((b) => new Uint8Array(b)[0])).toEqual([1, 2]);
    await be.replaceParts({ ...clipRec("c1"), parts: 1, bytes: 3 }, bytes(9, 9, 9));
    expect((await be.getParts("c1")).map((b) => b.byteLength)).toEqual([3]);
    expect((await be.getClip("c1"))!.bytes).toBe(3);
    await be.deleteClip("c1");
    expect(await be.allClips()).toEqual([]);
    expect(await be.getParts("c1")).toEqual([]);
  });

  it("🔴 الفتح معلّق للأبد (آيفون) ⇒ بيرمي TimeoutError بعد المهلة (الأولى + المحاولة باتصال جديد) — مابيعلّقش", async () => {
    const f = fakeIdb({ openHang: () => true });
    const be = idbClipBackend({ factory: f.factory, keyRange: f.keyRange, openTimeoutMs: 30, txTimeoutMs: 30 });
    const { value: err } = await settlesWithin(
      be.allClips().then(
        () => null,
        (e) => e
      ),
      1000
    );
    expect(err).toMatchObject({ name: "TimeoutError" });
    expect(f.stats.opens).toBe(2);
  });

  it("🔴 «Connection to Indexed Database server lost» ⇒ بيقفل الاتصال الميت ويفتح جديد ويعيد — وبينجح", async () => {
    const f = fakeIdb({ txError: (n) => (n === 1 ? lostConn() : null) });
    const be = idbClipBackend({ factory: f.factory, keyRange: f.keyRange, openTimeoutMs: 30, txTimeoutMs: 30 });
    await be.putClip(clipRec("c1"));
    expect((await be.getClip("c1"))!.id).toBe("c1");
    expect(f.stats.opens).toBe(2);
    expect(f.stats.closed).toBeGreaterThanOrEqual(1);
  });

  it("أي فشل (مش بس InvalidStateError) بيتعاد مرة — حتى QuotaExceeded؛ والفشل التاني بيوصل للمنادي", async () => {
    const quota = () => Object.assign(new Error("full"), { name: "QuotaExceededError" });
    const f = fakeIdb({ txError: () => quota() });
    const be = idbClipBackend({ factory: f.factory, keyRange: f.keyRange, openTimeoutMs: 30, txTimeoutMs: 30 });
    await expect(be.putClip(clipRec("c1"))).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(f.stats.txs).toBe(2);
  });

  it("معاملة مابتخلصش أبداً ⇒ مهلة، واتصال جديد، والمحاولة التانية بتنجح", async () => {
    const f = fakeIdb({ txHang: (n) => n === 1 });
    const be = idbClipBackend({ factory: f.factory, keyRange: f.keyRange, openTimeoutMs: 30, txTimeoutMs: 30 });
    await settlesWithin(be.putClip(clipRec("c1")), 1000);
    expect((await be.getClip("c1"))!.id).toBe("c1");
    expect(f.stats.opens).toBe(2);
  });

  it("فتح اتأخر بعد ما المهلة عدّت ⇒ الاتصال المتأخر بيتقفل (مايفضلش ماسك التخزين)", async () => {
    const f = fakeIdb({ openDelay: (n) => (n === 1 ? 80 : 0) });
    const be = idbClipBackend({ factory: f.factory, keyRange: f.keyRange, openTimeoutMs: 30, txTimeoutMs: 30 });
    await be.allClips();
    await new Promise((r) => setTimeout(r, 120));
    expect(f.stats.closed).toBeGreaterThanOrEqual(1);
  });
});

/**
 * 🔁 «فرّغ تاني» لمقطع متفرّغ (٢٠ أكتوبر ٢٠٢٦) — المالك: «زرار فرغ تاني لو هو مفرغ يجيبلو رساله يقولو المقطع دة
 * متفرغ». مهند فرّغ نفس المقطع لحد ٤ مرات في دقيقتين (إيطاليا ١٩ أكتوبر ١٠:٥٥–١٠:٥٧م).
 */
describe("retranscribeWarning — رسالة قبل «فرّغ تاني»", () => {
  it("لسه ماتفرّغش ⇒ مافيش رسالة", () => {
    expect(retranscribeWarning({ status: "ready" })).toBeNull();
    expect(retranscribeWarning({ status: "failed" })).toBeNull();
  });

  it("متفرّغ ⇒ «المقطع ده متفرّغ» بعدد لوحاته", () => {
    const w = retranscribeWarning({ status: "done", result: { at: 1, plates: 7, pinned: 7, entries: [] } })!;
    expect(w).toMatch(/المقطع ده متفرّغ/);
    expect(w).toMatch(/7 لوحة/);
  });

  it("اتصدّر منه ⇒ نفس رسالة التكرار في السجلات زي الأول", () => {
    const w = retranscribeWarning({
      status: "done",
      result: { at: 1, plates: 7, pinned: 7, entries: [], exportedCount: 5 },
    })!;
    expect(w).toMatch(/المقطع ده متفرّغ/);
    expect(w).toMatch(/اتصدّر منه 5 لوحة/);
    expect(w).toMatch(/هتتكرر في السجلات/);
  });
});

/**
 * ⏸️ «وقف مؤقت» في نفس التسجيل (المالك ٢٢ أكتوبر ٢٠٢٦): الوقفات بتتحفظ مع المقطع — فالتفريغ (حتى بعد تحديث الصفحة
 * أو «فرّغ تاني») بيدّي كل لوحة موقع **لحظة نطقها**، ومدة المقطع = الصوت بس (من غير الوقفات).
 */
describe("المقطع والوقفات", () => {
  const PAUSES = [{ atAudioMs: 20_000, durMs: 600_000 }];
  const clip: StoredClip = {
    id: "c7",
    seqNo: 7,
    label: "مقطع 7",
    createdAt: START,
    startEpoch: START,
    durationSec: 40,
    mime: "audio/webm",
    source: "record",
    status: "ready",
    parts: 3,
    bytes: 100,
    updatedAt: START + 640_000,
    stamp: STAMP,
    rawFixes: [
      { lat: 24.1, lng: 46.7, acc: 5, fixEpoch: START + 5000, recvEpoch: START + 5100 },
      { lat: 25.1, lng: 46.7, acc: 5, fixEpoch: START + 625_000, recvEpoch: START + 625_100 },
    ],
    pauses: PAUSES,
  };
  const entry = (plate: string, t?: number) =>
    ({
      id: plate,
      review: { plate, notes: [], timeStart: t },
      pin: null,
      match: { kind: "none" },
      capturedAt: START,
      source: "batch",
    }) as unknown as PlateEntry;

  it("المهمة بتاخد وقفات المقطع", () => {
    expect(clipJobFields(clip).pauses).toEqual(PAUSES);
    expect(clipJobFields({ ...clip, pauses: undefined }).pauses).toEqual([]);
  });

  it("بعد التفريغ: اللي قبل الوقفة بموقعه، واللي بعدها بموقع لحظة نطقها بعد ما كمّل", () => {
    const f = clipJobFields(clip);
    const out = clipRunOutcome({
      ok: true,
      entries: [entry("ابح1234", 5), entry("حطس5678", 25)],
      fixes: f.fixes,
      pauses: f.pauses,
      startEpoch: START,
      tookSec: 1,
      now: START,
    });
    expect(out.entries[0].pin!.lat).toBeCloseTo(24.1, 9);
    expect(out.entries[1].pin!.lat).toBeCloseTo(25.1, 9);
  });

  it("اتقطع وهو واقف/بعد ما كمّل ⇒ المدة = الصوت بس (من غير الوقفات)", () => {
    const rec = { ...clip, status: "recording" as const, durationSec: 0, updatedAt: START + 631_000 };
    expect(recoverClip(rec)!.durationSec).toBe(31);
    expect(clipDurationSec({ ...rec, durationSec: 0 })).toBe(31);
  });

  it("قفل المقطع بيحفظ الوقفات معاه", async () => {
    const { store } = newStore();
    const out = await closeRecordedClip(store, {
      clipId: null,
      writer: null,
      blob: new Blob(["ABC"], { type: "audio/webm" }),
      durationSec: 40,
      rawFixes: [],
      stamp: STAMP,
      startEpoch: START,
      mime: "audio/webm",
      pauses: PAUSES,
    });
    expect((await store.get(out.id!))!.pauses).toEqual(PAUSES);
  });
});

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  safeDraftsOn, rememberSafeDrafts, mergeById, mergeIds, createDraftSink,
} from "@/lib/safeDrafts";
import { pickNewestDraft } from "@/lib/checkDrafts";

/**
 * 🛡️ اللوحات قبل التصدير **ماتضيعش أبداً** — المالك (١٣ أكتوبر ٢٠٢٦): «مش عايز والمندوب بيشيك صوت او يدوي وخرج
 * من الصفحة وهو شغال يضيع منه اي لوحات كل اللوحات اللي بتتسجل تفضل محفوظه في التليفون مهما كان لحين التصدير ...
 * متتمسحش غير لو راحت للسجلات بتاعته». ٣ أماكن كانت بتضيّع:
 *   ① لوحة بتوصل من المحرّك **بعد** الخروج من الصفحة (وVoiceX في «صوتي» ماكانش بيتقفل خالص لما تخرج).
 *   ② الرجوع للصفحة: لوحة جديدة قبل ما المحفوظ يخلص قراية كانت بتاخد مكانه بدل ما تتضاف عليه.
 *   ③ تخزين الموبايل: لو كتابة IndexedDB فشلت، النسخة الأقدم كانت بتكسب الأحدث (اللي في localStorage).
 * السوبر أدمن الأول (`safeDraftsOn`).
 */
type Row = { id: string; plate: string; lat?: number };
const r = (id: string, plate = "ابح1234"): Row => ({ id, plate });

beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });

describe("🔓 للكل (المالك ١٣ أكتوبر ٢٠٢٦: «انشر للكل»)", () => {
  it("🔴 شغّال لكل المناديب — مش بس السوبر أدمن، ومهما كان المحفوظ على الموبايل", () => {
    expect(safeDraftsOn()).toBe(true);
    rememberSafeDrafts(false);
    expect(safeDraftsOn()).toBe(true);
  });
});

describe("② الرجوع للصفحة: المحفوظ بيتضاف على اللي في الشاشة — مش مكانه", () => {
  it("🔴 لوحة جديدة وصلت قبل ما المحفوظ يتقري ⇒ الاتنين", () => {
    expect(mergeById([r("new")], [r("a"), r("b")]).map((x) => x.id)).toEqual(["new", "a", "b"]);
  });
  it("نفس الصف في الاتنين ⇒ مرة واحدة (اللي في الشاشة يكسب)", () => {
    const out = mergeById([{ ...r("a"), lat: 24 }], [r("a"), r("b")]);
    expect(out).toEqual([{ ...r("a"), lat: 24 }, r("b")]);
  });
  it("الشاشة فاضية ⇒ المحفوظ زي ما هو", () => {
    expect(mergeById([], [r("a"), r("b")]).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("علامات «اتصدّر» بتتجمّع (ماتتنسيش)", () => {
    expect([...mergeIds(["x"], ["y", "x"])].sort()).toEqual(["x", "y"]);
  });
});

describe("① لوحة بتوصل بعد الخروج من الصفحة", () => {
  const mk = (initial: Row[] | null, loaded: Row[] = []) => {
    const store = { cache: initial, writes: [] as Row[][] };
    const sink = createDraftSink<Row>({
      read: () => store.cache,
      load: async () => loaded,
      write: (next) => { store.cache = next; store.writes.push(next); },
    });
    return { sink, store };
  };

  it("🔴 مافيش صفحة مفتوحة ⇒ اللوحة بتتحفظ على الموبايل فوق المحفوظ", async () => {
    const { sink, store } = mk([r("a")]);
    await sink.apply((prev) => [r("late"), ...prev]);
    expect(store.cache!.map((x) => x.id)).toEqual(["late", "a"]);
    expect(store.writes).toHaveLength(1);
  });

  it("🔴 الصفحة رجعت اتفتحت ⇒ اللوحة بتروحلها هي (مش للتخزين اللي هتدوس عليه)", async () => {
    const { sink, store } = mk([r("a")]);
    let screen: Row[] = [r("a")];
    sink.attach((fn) => { screen = fn(screen); });
    await sink.apply((prev) => [r("late"), ...prev]);
    expect(screen.map((x) => x.id)).toEqual(["late", "a"]);
    expect(store.writes).toHaveLength(0);
  });

  it("🔴 الكاش لسه فاضي ⇒ بيقرا المحفوظ الأول (مايدوسش عليه بلوحة واحدة)", async () => {
    const { sink, store } = mk(null, [r("a"), r("b")]);
    await sink.apply((prev) => [r("late"), ...prev]);
    expect(store.cache!.map((x) => x.id)).toEqual(["late", "a", "b"]);
  });

  it("🔴 الصفحة اتفتحت وإحنا بنقرا ⇒ اللوحة بتروح للصفحة", async () => {
    let release!: (v: Row[]) => void;
    const store = { cache: null as Row[] | null, writes: 0 };
    const sink = createDraftSink<Row>({
      read: () => store.cache,
      load: () => new Promise<Row[]>((res) => { release = res; }),
      write: (next) => { store.cache = next; store.writes++; },
    });
    const p = sink.apply((prev) => [r("late"), ...prev]);
    await new Promise((res) => setTimeout(res, 0));   // القراية بدأت ولسه ماخلصتش
    let screen: Row[] = [r("a")];
    sink.attach((fn) => { screen = fn(screen); });
    release([r("a")]);
    await p;
    expect(screen.map((x) => x.id)).toEqual(["late", "a"]);
    expect(store.writes).toBe(0);
  });

  it("🔴 لوحتين ورا بعض بعد الخروج ⇒ الاتنين (بالترتيب)", async () => {
    const { sink, store } = mk(null, [r("a")]);
    void sink.apply((prev) => [r("x"), ...prev]);
    await sink.apply((prev) => [r("y"), ...prev]);
    expect(store.cache!.map((x) => x.id)).toEqual(["y", "x", "a"]);
  });

  it("فكّ صفحة قديمة مايفكّش الصفحة الجديدة", async () => {
    const { sink, store } = mk([r("a")]);
    let s1: Row[] = []; let s2: Row[] = [];
    const detach1 = sink.attach((fn) => { s1 = fn(s1); });
    sink.attach((fn) => { s2 = fn(s2); });
    detach1();
    await sink.apply((prev) => [r("late"), ...prev]);
    expect(s2.map((x) => x.id)).toEqual(["late"]);
    expect(s1).toEqual([]);
    expect(store.writes).toHaveLength(0);
  });

  it("🔴 «الجديد»: الصفحة المفتوحة بتاخد التغيير زي ما هو، والتخزين بياخد نسخته (لوحات الحسابات التانية بتفضل)", async () => {
    const { sink, store } = mk([r("a"), { id: "other", plate: "حسابتاني" }]);
    const toStore = (all: Row[]) => [r("late"), ...all];
    await sink.apply((prev) => [r("late"), ...prev.filter((x) => x.id !== "other")], toStore);
    expect(store.cache!.map((x) => x.id)).toEqual(["late", "a", "other"]);
    let screen: Row[] = [r("a")];
    sink.attach((fn) => { screen = fn(screen); });
    await sink.apply((prev) => [r("late2"), ...prev], () => { throw new Error("مش المفروض"); });
    expect(screen.map((x) => x.id)).toEqual(["late2", "a"]);
  });

  it("موقع اللوحة اللي وصل بعد الخروج بيتختم على المحفوظ", async () => {
    const { sink, store } = mk([r("a"), r("b")]);
    await sink.apply((prev) => prev.map((x) => (x.id === "b" ? { ...x, lat: 24.7 } : x)));
    expect(store.cache!.find((x) => x.id === "b")!.lat).toBe(24.7);
  });
});

describe("③ أحدث نسخة تكسب", () => {
  it("🔴 IndexedDB ماتكتبتش (اتملى/قفل فجأة) و localStorage أحدث ⇒ localStorage", () => {
    expect(pickNewestDraft({ idb: [1], idbInit: true, idbRev: 5, local: [1, 2], localRev: 9 })).toEqual([1, 2]);
  });
  it("IndexedDB أحدث أو زيها ⇒ IndexedDB", () => {
    expect(pickNewestDraft({ idb: [1, 2, 3], idbInit: true, idbRev: 9, local: [1], localRev: 7 })).toEqual([1, 2, 3]);
    expect(pickNewestDraft({ idb: [1], idbInit: true, idbRev: 9, local: [7], localRev: 9 })).toEqual([1]);
  });
  it("🔴 القايمة اتفضت بعد التصدير ⇒ مابترجعش (الأحدث هو الفاضي)", () => {
    expect(pickNewestDraft({ idb: [1, 2], idbInit: true, idbRev: 3, local: [], localRev: 4 })).toEqual([]);
    expect(pickNewestDraft({ idb: [], idbInit: true, idbRev: 4, local: [1, 2], localRev: 3 })).toEqual([]);
  });
  it("نسخة قديمة من غير رقم (قبل التحديث) ⇒ زي الأول بالحرف", () => {
    expect(pickNewestDraft({ idb: [9], idbInit: true, idbRev: null, local: [1, 2], localRev: null })).toEqual([9]);
    expect(pickNewestDraft({ idb: null, idbInit: false, idbRev: null, local: [1, 2], localRev: null })).toEqual([1, 2]);
  });
  it("localStorage أحدث بس IndexedDB من غير رقم ⇒ localStorage (اتكتب بعد التحديث)", () => {
    expect(pickNewestDraft({ idb: [9], idbInit: true, idbRev: null, local: [9, 10], localRev: 2 })).toEqual([9, 10]);
  });
  it("localStorage بايظة ⇒ IndexedDB", () => {
    expect(pickNewestDraft({ idb: [9], idbInit: true, idbRev: 1, local: null, localRev: 5 })).toEqual([9]);
  });

  it("🔴 من الآخر للآخر: الكتابة في IndexedDB وقعت ⇒ التحميل بيرجّع الأحدث (مع المفتاح)", async () => {
    const { saveDraft, loadDraft, flushDrafts } = await import("@/lib/checkDrafts");
    rememberSafeDrafts(true);
    await saveDraft("ptt", "t-newest", [{ id: "a" }]);
    await flushDrafts();
    // localStorage اتكتبت بالأحدث وIndexedDB لا (زي ما تليفون مليان بيعمل)
    localStorage.setItem("t-newest", JSON.stringify([{ id: "a" }, { id: "b" }]));
    localStorage.setItem("t-newest:rev", String(Number(localStorage.getItem("t-newest:rev")) + 1));
    expect((await loadDraft<{ id: string }>("ptt", "t-newest")).map((x) => x.id)).toEqual(["a", "b"]);
    rememberSafeDrafts(false);   // 🔓 للكل — حتى لو الموبايل مش سوبر أدمن
    expect((await loadDraft<{ id: string }>("ptt", "t-newest")).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("🔴 من الآخر للآخر: بعد التصدير القايمة الفاضية بتفضل فاضية", async () => {
    const { saveDraft, loadDraft, flushDrafts } = await import("@/lib/checkDrafts");
    rememberSafeDrafts(true);
    await saveDraft("hits", "t-empty", [{ id: "a" }]);
    await saveDraft("hits", "t-empty", []);
    await flushDrafts();
    expect(await loadDraft("hits", "t-empty")).toEqual([]);
  });
});

describe("🔴 التوصيل في الصفحتين", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

  describe("صفحة التشييك («صوتي»)", () => {
    const p = read("app/(app)/instant-check/page.tsx");
    it("🔴 الخروج من الصفحة بيقفل التسجيل بنظام (آخر اللوحات بتتحفظ) — والصفحة بتفك نفسها الأول", () => {
      expect(p).toMatch(/if \(safeDraftsOn\(\)\) \{\n\s+mountedRef\.current = false;\n\s+detachPttSinkRef\.current\?\.\(\);/);
      expect(p).toMatch(/void stopPttRef\.current\(\);/);
    });
    it("🔴 كل تغيير في لوحات الصوت بيعدّي على الحفظ الآمن (حتى لو الصفحة اتقفلت)", () => {
      expect(p).toMatch(/const setPttRows = useCallback\(/);
      const add = p.slice(p.indexOf("const id = `${Date.now()}-${Math.floor(performance.now() * 1000) % 100000}-${idx}`;"));
      expect(add.slice(0, 3000)).toMatch(/setPttRows\(\(prev\) => \[row, \.\.\.prev\]\);/);
      // مافيش ولا مكان بيغيّر اللوحات من غير الحفظ الآمن غير الاسترجاع نفسه
      const direct = (p.match(/setPttResults\(/g) ?? []).length;
      expect(direct).toBeLessThanOrEqual(5);   // الاسترجاع (٢) + التسجيل في الحفظ الآمن + جسم setPttRows + تعليق قديم
    });
    it("🔴 الرجوع للصفحة بيضيف المحفوظ على الموجود", () => {
      expect(p).toMatch(/const keep = <T,>\(prev: T\[\], loaded: T\[\]\) => \(safeOn \? mergeById/);
    });
    it("🔒 المفتاح بيتحفظ من بروفايل السوبر أدمن", () => {
      expect(p).toMatch(/if \(prof\) rememberSafeDrafts\(!!prof\.is_super\);/);   // غلط النت مايشيلش العلم
    });
  });

  describe("صفحة «الجديد» (Voice PRO)", () => {
    const p = read("app/(app)/registration-v2/page.tsx");
    it("🔴 كل تغيير في الصفوف بيعدّي على الحفظ الآمن", () => {
      expect(p).toMatch(/const setRowsSafe = useCallback\(/);
      expect(p).toMatch(/setRowsSafe\(\(prev\) => \{\n[\s\S]{0,4000}return placeLiveRow\(prev, fresh, fleetDistinct\);/);
      expect(p).toMatch(/if \(fx\) setRowsSafe\(\(prev\) => stampRowGps\(prev, rowId, fx\) as LiveRow\[\]\);/);
    });
    it("🔴 الرجوع للصفحة بيضيف المحفوظ على الموجود", () => {
      expect(p).toMatch(/setRows\(\(p\) => \(safeDraftsOn\(\) \? mergeById\(p, mine\) : mine\)\);/);
      expect(p).toMatch(/setRows\(\(p\) => \(safeDraftsOn\(\) \? mergeById\(p, restored\) : restored\)\);/);
    });
    it("🔒 المفتاح بيتحفظ من بروفايل السوبر أدمن", () => {
      expect(p).toMatch(/rememberSafeDrafts\(sup\);/);
    });
  });
});

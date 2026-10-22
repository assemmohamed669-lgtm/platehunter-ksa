import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEIGHBOR_PIN, NO_PRECISE_PIN } from "./platePin";
import {
  GPS_FIXES_MAX,
  OUTBOX_KEY,
  OUTBOX_MAX,
  PLATES_MAX,
  REMOVED_MAX,
  buildRunReport,
  deviceInfo,
  issueBatch,
  loadOutbox,
  sendRunReport,
} from "./runTelemetry";

/**
 * 📋 تقرير كل تسجيل للسيرفر (١٨ أكتوبر ٢٠٢٦) — المالك: «أهم حاجه عايزين نعرف كل التقارير عن التسجيل».
 * الموبايل بيبعت اللي السيرفر مايعرفهوش: موقع كل لوحة، المطلوبة، الجهاز، الأغلاط اللي ماوصلتش، التصدير.
 */

const T0 = 1_760_000_000_000;
const entry = (plate: string, sec: number, extra: Record<string, unknown> = {}) =>
  ({
    id: `e-${plate}`,
    review: { plate },
    pin: { lat: 24.7, lng: 46.7, accuracy: 7.6, at: T0 + sec * 1000, ageMs: 300, stale: false },
    match: { kind: "none" },
    capturedAt: T0 + sec * 1000,
    source: "batch",
    vehicleType: "فان",
    ...extra,
  }) as never;

describe("buildRunReport", () => {
  it("بيلخّص اللوحات: الموقع والمطلوبة والنوع بثانية النطق", () => {
    const r = buildRunReport({
      kind: "run",
      agent: "عاصم",
      uid: "u-1",
      run: "20261018-151915-746",
      ok: true,
      clip: { id: "c1", label: "مقطع ٢", source: "record", sec: 104.04, bytes: 1_590_184, mime: "audio/webm", startedAtMs: T0 },
      entries: [
        entry("ابح1234", 3.2),
        entry("سبا7709", 9, { pin: null, match: { kind: "exact" } }),
      ],
      now: T0 + 200_000,
      dev: { platform: "ios", ua: "iPhone OS 18_7" },
    });
    expect(r).toMatchObject({ v: 1, kind: "run", uid: "u-1", agent: "عاصم", run: "20261018-151915-746", ok: true });
    expect(r.n_plates).toBe(2);
    expect(r.pinned).toBe(1);
    expect(r.wanted).toBe(1);
    expect(r.plates[0]).toEqual({ p: "ابح1234", t: 3.2, ty: "فان", acc: 8 });
    expect(r.plates[1]).toEqual({ p: "سبا7709", t: 9, ty: "فان", w: 1, acc: null });
    expect(r.clip).toMatchObject({ sec: 104.04, bytes: 1_590_184 });
    expect(new Date(r.at).getTime()).toBe(T0 + 200_000);
  });

  it("حدود: لوحات كتير وأغلاط طويلة مابتكبّرش التقرير", () => {
    const many = Array.from({ length: PLATES_MAX + 50 }, (_, i) => entry(`ابح${String(i).padStart(4, "0")}`, i));
    const r = buildRunReport({
      kind: "run",
      agent: "x",
      uid: null,
      entries: many,
      errors: Array.from({ length: 30 }, () => "غلط ".repeat(200)),
      clip: { startedAtMs: T0 },
    });
    expect(r.plates).toHaveLength(PLATES_MAX);
    expect(r.n_plates).toBe(PLATES_MAX + 50);
    expect(r.errors).toHaveLength(10);
    expect(r.errors!.every((e) => e.length <= 200)).toBe(true);
  });

  it("الفشل من غير لوحات بيتبعت بسببه", () => {
    const r = buildRunReport({ kind: "fail", agent: "x", uid: "u", ok: false, error: "السيرفر مش بيرد" });
    expect(r.kind).toBe("fail");
    expect(r.error).toBe("السيرفر مش بيرد");
    expect(r.plates).toEqual([]);
  });
});

describe("sendRunReport", () => {
  beforeEach(() => localStorage.clear());

  const rep = (n: number) => buildRunReport({ kind: "run", agent: "a", uid: "u", run: `r${n}` });

  it("بيبعت للسيرفر بالتوكن ويفضّي الصندوق", async () => {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([rep(0)]));
    const f = vi.fn(async () => new Response('{"ok":true,"saved":2}', { status: 200 }));
    const ok = await sendRunReport("https://batch.example", "tok-123", rep(1), f as never);
    expect(ok).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://batch.example/report");
    expect((init.headers as Record<string, string>)["X-Plate-Token"]).toBe("tok-123");
    const body = JSON.parse(String(init.body));
    expect(body.map((x: { run: string }) => x.run)).toEqual(["r0", "r1"]);
    expect(loadOutbox()).toEqual([]);
  });

  it("النت وقع ⇒ التقرير يستنى في الصندوق ويتبعت مع اللي بعده — ومابيرميش", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await sendRunReport("https://b", "t", rep(1), down as never)).toBe(false);
    const bad = vi.fn(async () => new Response("no", { status: 502 }));
    expect(await sendRunReport("https://b", "t", rep(2), bad as never)).toBe(false);
    expect(loadOutbox().map((x) => x.run)).toEqual(["r1", "r2"]);
    const up = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendRunReport("https://b", "t", rep(3), up as never)).toBe(true);
    expect(JSON.parse(String((up.mock.calls[0] as unknown as [string, RequestInit])[1].body)).length).toBe(3);
    expect(loadOutbox()).toEqual([]);
  });

  it("مافيش توكن ⇒ الصندوق بس", async () => {
    const f = vi.fn();
    expect(await sendRunReport("https://b", null, rep(1), f as never)).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(loadOutbox()).toHaveLength(1);
  });

  it("الصندوق ليه حد — الأقدم بيتشال", async () => {
    const down = vi.fn(async () => {
      throw new Error("x");
    });
    for (let i = 0; i < OUTBOX_MAX + 5; i++) await sendRunReport("https://b", "t", rep(i), down as never);
    const box = loadOutbox();
    expect(box).toHaveLength(OUTBOX_MAX);
    expect(box[box.length - 1].run).toBe(`r${OUTBOX_MAX + 4}`);
    expect(box[0].run).toBe("r5");
  });

  it("تخزين مقفول مابيوقّعش حاجة", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const down = vi.fn(async () => {
      throw new Error("x");
    });
    await expect(sendRunReport("https://b", "t", rep(1), down as never)).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("deviceInfo", () => {
  it("المنصّة والمتصفّح والنت", () => {
    const d = deviceInfo();
    expect(d.platform).toBe("web");
    expect(typeof d.ua).toBe("string");
    expect(d.ua!.length).toBeLessThanOrEqual(240);
    expect(typeof d.online).toBe("boolean");
  });
});

/**
 * 📍 تفاصيل الموقع في التقرير (١٩ أكتوبر ٢٠٢٦) — لوحة المالك طلعت من غير موقع والتقرير كان فيه
 * «fixes: 1» بس. دلوقتي: كل قراءة بوقتها (من بداية الصوت) ودقتها + ملخّص + لكل لوحة ثانية نطقها وسبب
 * غياب الموقع (أو إنه منسوخ من اللي جنبها) ⇒ لو اتكررت السبب يبان من التقرير.
 */
describe("buildRunReport — 📍 تفاصيل الموقع", () => {
  const fix = (tMs: number, acc: number) => ({ tMs, lat: 24.7, lng: 46.7, acc });

  it("كل قراءة بوقتها ودقتها + أول قراءة جوّه التسجيل · عمر القديمة · أكبر فجوة · الدقة", () => {
    const r = buildRunReport({
      kind: "run",
      agent: "x",
      uid: null,
      clip: { sec: 10, startedAtMs: T0 },
      entries: [],
      track: [fix(-21_000, 35), fix(4_200, 12), fix(5_200, 6), fix(9_800, 5.4)],
      now: T0,
      dev: {},
    });
    expect(r.gps).toEqual({
      n: 4,
      in_clip: 3,
      f: [[-21, 35], [4.2, 12], [5.2, 6], [9.8, 5]],
      first_s: 4.2,
      old_s: 21,
      max_gap_s: 4.6,
      acc_min: 5,
      acc_med: 9,
      acc_max: 35,
    });
  });

  it("زي لوحة المالك: قراءة قديمة بس ومافيش ولا واحدة جوّه التسجيل ⇒ الفجوة = طول المقطع", () => {
    const r = buildRunReport({
      kind: "run",
      agent: "x",
      uid: null,
      clip: { sec: 4.98, startedAtMs: T0 },
      entries: [],
      track: [fix(-40_000, 18)],
      now: T0,
      dev: {},
    });
    expect(r.gps).toMatchObject({ n: 1, in_clip: 0, old_s: 40, max_gap_s: 5 });
    expect(r.gps!.first_s).toBeUndefined();
  });

  it("مسار فاضي (الموقع مقفول) ⇒ n=0", () => {
    const r = buildRunReport({ kind: "run", agent: "x", uid: null, clip: { sec: 8 }, entries: [], track: [], now: T0, dev: {} });
    expect(r.gps).toEqual({ n: 0, in_clip: 0, f: [], max_gap_s: 8 });
  });

  it("كل لوحة: ثانية نطقها + سبب غياب الموقع أو إنه منسوخ", () => {
    const r = buildRunReport({
      kind: "run",
      agent: "x",
      uid: null,
      clip: { sec: 10, startedAtMs: T0 },
      entries: [
        entry("ابح1234", 1, {
          pin: null,
          review: { plate: "ابح1234", timeStart: 0.83, notes: [`${NO_PRECISE_PIN} — مافيش قراءة GPS في حدود 2ث من لحظة نطقها`] },
        }),
        entry("حطس5678", 6, { review: { plate: "حطس5678", timeStart: 6, notes: [`${NEIGHBOR_PIN} قبلها (فرق 5ث)`] } }),
        entry("دعو9012", 8, { review: { plate: "دعو9012", timeStart: 8.04, notes: [] } }),
      ],
      now: T0,
      dev: {},
    });
    expect(r.plates[0]).toMatchObject({ ts: 0.8, acc: null, pm: "مافيش قراءة GPS في حدود 2ث من لحظة نطقها" });
    expect(r.plates[1]).toMatchObject({ ts: 6, acc: 8, pm: "نفس اللي قبلها" });
    expect(r.plates[2]).toMatchObject({ ts: 8 });
    expect(r.plates[2].pm).toBeUndefined();
  });

  it("تسجيل طويل: القراءات ليها حد (التقرير مايكبرش)", () => {
    const track = Array.from({ length: GPS_FIXES_MAX + 300 }, (_, i) => fix(i * 1000, 5));
    const r = buildRunReport({ kind: "run", agent: "x", uid: null, clip: { sec: 2000 }, entries: [], track, now: T0, dev: {} });
    expect(r.gps!.n).toBe(GPS_FIXES_MAX + 300);
    expect(r.gps!.f.length).toBe(GPS_FIXES_MAX);
  });
});

/**
 * 🧾 التقرير الكامل لكل مندوب في التجربة المفتوحة (١٩ أكتوبر ٢٠٢٦). المالك: «تقرير مفصل كامل … قال ايه
 * وطلع ايه ومطلعش ايه وايه السبب … من غير ما نطلب من كل واحد يبعتلنا». تصحيح المندوب بإيده هو الحقيقة:
 * «طلع X وصلّحها Y» — من غير ما نسأله.
 */
describe("buildRunReport — اللي المندوب صلّحه بإيده", () => {
  it("لوحة اتعدّلت ⇒ `h` = اللي البرنامج سمعه · نوع اتغيّر ⇒ `th` = النوع اللي طلع", () => {
    const r = buildRunReport({
      kind: "export",
      agent: "x",
      uid: null,
      entries: [
        entry("ابح1234", 1, { review: { plate: "ابح1234", heardPlate: "ابج1234", manuallyEdited: true }, typeHeard: "" }),
        entry("حطس5678", 2, { review: { plate: "حطس5678", heardPlate: "حطس5678" }, vehicleType: "ونيت", typeHeard: "فان" }),
        entry("دعو9012", 3, { review: { plate: "دعو9012", heardPlate: "دعو9012", manuallyEdited: true }, vehicleType: "فان", typeHeard: "فان" }),
      ],
      export: { saved: 3, failed: 0, total: 3, no_pin: 0, edited: 3, deleted: 1, removed: [{ p: "رسس1111", t: 9.2 }] },
      now: T0,
      dev: {},
    });
    expect(r.plates[0]).toMatchObject({ p: "ابح1234", h: "ابج1234", th: "" });
    expect(r.plates[1]).toMatchObject({ p: "حطس5678", ty: "ونيت", th: "فان" });
    expect(r.plates[1].h).toBeUndefined();
    expect(r.plates[2].h).toBeUndefined();
    expect(r.plates[2].th).toBeUndefined();
    expect(r.export!.removed).toEqual([{ p: "رسس1111", t: 9.2 }]);
  });

  it("مسح كتير ⇒ القايمة ليها حد", () => {
    const removed = Array.from({ length: REMOVED_MAX + 40 }, (_, i) => ({ p: `ابح${1000 + i}`, t: i }));
    const r = buildRunReport({
      kind: "export",
      agent: "x",
      uid: null,
      export: { saved: 0, failed: 0, total: 0, no_pin: 0, removed },
      dev: {},
    });
    expect(r.export!.removed).toHaveLength(REMOVED_MAX);
  });
});

describe("buildRunReport — 🧯 مشاكل الموبايل برّه التفريغ (الميكروفون · التخزين · السيرفر)", () => {
  it("`issue` بيتبعت بأغلاطه", () => {
    const r = buildRunReport({ kind: "issue", agent: "x", uid: "u", errors: ["الميكروفون: الإذن مرفوض"], dev: {} });
    expect(r.kind).toBe("issue");
    expect(r.errors).toEqual(["الميكروفون: الإذن مرفوض"]);
  });
});

describe("deviceInfo — نسخة البرنامج اللي على الموبايل", () => {
  it("`app` = معرّف البناء (يكشف الموبايل اللي شغّال نسخة قديمة)", () => {
    expect(typeof deviceInfo().app).toBe("string");
  });
});

describe("issueBatch — مشاكل الموبايل اللي حصلت برّه أي تفريغ", () => {
  const e = (id: string, source: string, message: string) => ({ id, at: 0, source, message }) as never;

  it("الجديد بس (مرة واحدة لكل غلط) ومن غير اللي وقت التفريغ (التفريغ بيبعتها في تقريره)", () => {
    const seen = new Set<string>();
    expect(issueBatch([e("2", "الميكروفون", "الإذن مرفوض"), e("1", "السيرفر", "مش جاهز")], seen, false)).toEqual([
      "السيرفر: مش جاهز",
      "الميكروفون: الإذن مرفوض",
    ]);
    expect(issueBatch([e("3", "التخزين", "مليان"), e("2", "الميكروفون", "الإذن مرفوض")], seen, false)).toEqual([
      "التخزين: مليان",
    ]);
    expect(issueBatch([e("4", "التفريغ", "اتقطع")], seen, true)).toEqual([]);
    expect(issueBatch([e("4", "التفريغ", "اتقطع")], seen, false)).toEqual([]);
  });
});

/** ⏸️ «وقف مؤقت» (٢٢ أكتوبر ٢٠٢٦): التقرير بيقول التسجيل كان فيه وقفات فين وقد إيه، والموقع على طول الوقت الحقيقي */
describe("buildRunReport — ⏸️ الوقفات", () => {
  const fix = (tMs: number) => ({ tMs, lat: 24.7, lng: 46.7, acc: 5 });

  it("مكان كل وقفة في الصوت ومدتها + مجموعها، وقراءات الموقع بعد الوقفة محسوبة جوّه التسجيل", () => {
    const r = buildRunReport({
      kind: "run",
      agent: "x",
      uid: null,
      clip: { sec: 10, startedAtMs: T0, pauses: [{ atAudioMs: 5_000, durMs: 60_000 }] },
      entries: [],
      track: [fix(2_000), fix(64_000), fix(69_000)],
      now: T0,
      dev: {},
    });
    expect(r.clip).toMatchObject({ sec: 10, pz: [[5, 60]], paused_s: 60 });
    expect(r.gps).toMatchObject({ n: 3, in_clip: 3 });
  });

  it("من غير وقفات ⇒ مافيش حقول جديدة (التقارير القديمة زي ما هي)", () => {
    const r = buildRunReport({ kind: "run", agent: "x", uid: null, clip: { sec: 10, pauses: [] }, entries: [], now: T0, dev: {} });
    expect(r.clip).toEqual({ sec: 10 });
  });
});

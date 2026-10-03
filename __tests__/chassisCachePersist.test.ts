import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getPersistedChassis,
  setPersistedChassis,
  clearPersistedChassis,
  PERSISTED_CHASSIS_KEEP,
  PERSIST_SCHEMA,
  chassisLogicStamp,
} from "../lib/chassisCache";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  خريطة الشاص بتتحفظ على الموبايل — مش في الذاكرة بس
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٣ أكتوبر ٢٠٢٦) وافق على تحميل «رقم الهيكل» في الخلفية بحيث الصفحة
 *  ماتهنّجش. الكاش القديم كان في الذاكرة بس ⇒ كل فتحة باردة للتطبيق كانت بتعيد
 *  تحليل ملف ٦٠ ألف صف على الخيط الرئيسي (٨–١٦ ثانية تهنيج).
 *
 *  ⚠️ أي فشل في التخزين **مابيوقّفش حاجة**: القراءة بترجّع null والكتابة false
 *     — والمنادي يحسب الخريطة عادي زي الأول.
 */
describe("حفظ خريطة الشاص على الجهاز (IndexedDB)", () => {
  beforeEach(async () => {
    await clearPersistedChassis();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("اللي اتحفظ بيرجع بنفس البصمة — نفس المحتوى ونفس الترتيب", async () => {
    const m = new Map([["ابح1234", "VIN0000000000001"], ["نكد5678", "VIN0000000000002"]]);
    expect(await setPersistedChassis("fp-A", m)).toBe(true);
    const back = await getPersistedChassis("fp-A");
    expect(back).not.toBeNull();
    expect([...back!.entries()]).toEqual([...m.entries()]);
  });

  it("بصمة مش محفوظة ⇒ null", async () => {
    await setPersistedChassis("fp-A", new Map([["a", "1"]]));
    expect(await getPersistedChassis("fp-B")).toBeNull();
  });

  it("بصمة null ⇒ مابيتحفظش ومابيرجعش", async () => {
    expect(await setPersistedChassis(null, new Map([["a", "1"]]))).toBe(false);
    expect(await getPersistedChassis(null)).toBeNull();
  });

  it(`⚠️ بيحتفظ بآخر ${PERSISTED_CHASSIS_KEEP} ملفات بس — القديم بيتشال`, async () => {
    const n = PERSISTED_CHASSIS_KEEP + 2;
    for (let i = 0; i < n; i++) await setPersistedChassis(`fp-${i}`, new Map([[`k${i}`, `v${i}`]]));
    // الأقدم اتشالوا
    expect(await getPersistedChassis("fp-0")).toBeNull();
    expect(await getPersistedChassis("fp-1")).toBeNull();
    // الأحدث موجودين
    for (let i = n - PERSISTED_CHASSIS_KEEP; i < n; i++) {
      expect((await getPersistedChassis(`fp-${i}`))?.get(`k${i}`)).toBe(`v${i}`);
    }
  });

  it("نفس البصمة اتحفظت تاني ⇒ بتتبدّل (مش بتتكرر وتاكل مكان غيرها)", async () => {
    await setPersistedChassis("fp-A", new Map([["a", "1"]]));
    await setPersistedChassis("fp-B", new Map([["b", "2"]]));
    await setPersistedChassis("fp-A", new Map([["a", "3"]]));
    await setPersistedChassis("fp-C", new Map([["c", "4"]]));
    expect((await getPersistedChassis("fp-A"))?.get("a")).toBe("3");
    expect((await getPersistedChassis("fp-B"))?.get("b")).toBe("2");
    expect((await getPersistedChassis("fp-C"))?.get("c")).toBe("4");
  });

  it("🔴 التخزين مش متاح خالص ⇒ null/false من غير ما يرمي", async () => {
    vi.stubGlobal("indexedDB", undefined);
    await expect(getPersistedChassis("fp-A")).resolves.toBeNull();
    await expect(setPersistedChassis("fp-A", new Map([["a", "1"]]))).resolves.toBe(false);
  });

  it("🔴 فتح التخزين بيرمي (الآيفون قتل الاتصال) ⇒ null/false من غير ما يرمي", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("dead"); } });
    await expect(getPersistedChassis("fp-A")).resolves.toBeNull();
    await expect(setPersistedChassis("fp-A", new Map([["a", "1"]]))).resolves.toBe(false);
  });

  it("🔴 فتح التخزين بيفشل بحدث خطأ ⇒ null/false", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        const req: Record<string, unknown> = { error: new Error("blocked") };
        setTimeout(() => (req.onerror as (() => void) | undefined)?.(), 0);
        return req;
      },
    });
    await expect(getPersistedChassis("fp-A")).resolves.toBeNull();
    await expect(setPersistedChassis("fp-A", new Map([["a", "1"]]))).resolves.toBe(false);
  });

  it("سجل بايظ في التخزين ⇒ null (يتحسب من جديد بدل خريطة غلط)", async () => {
    await setPersistedChassis("fp-A", new Map([["a", "1"]]));
    // نبوّظ السجل يدوي: مفاتيح من غير قيم
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("platehunter-chassis");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("maps", "readwrite");
        const store = tx.objectStore("maps");
        const all = store.getAll();
        all.onsuccess = () => {
          for (const rec of all.result as { fp: string }[]) store.put({ ...rec, vins: undefined });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    expect(await getPersistedChassis("fp-A")).toBeNull();
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 المحفوظ مربوط **بنسخة المنطق** — مش بالبصمة بس
 * ══════════════════════════════════════════════════════════════════════
 *  الخريطة بتتبني بـ`normalizePlate` و`bankPlateToArabic` وكشف عمود الهيكل
 *  واللوحة. لو أي واحد فيهم اتغيّر في تحديث، الخريطة المحفوظة على الموبايل
 *  بقت **غلط** — والقديم في الذاكرة بس كان بيتبني من جديد مع كل فتحة. فالمفتاح
 *  فيه رقم نسخة + ناتج «عيّنات ثابتة» من المنطق نفسه: أي تغيير ⇒ مفتاح جديد.
 */
describe("مفتاح الحفظ = نسخة المنطق + البصمة", () => {
  beforeEach(async () => {
    await clearPersistedChassis();
  });
  afterEach(() => {
    vi.doUnmock("../lib/plateParser");
    vi.doUnmock("../lib/chassis");
    vi.resetModules();
  });

  it("فيه رقم النسخة وثابت بين النداءات", () => {
    expect(PERSIST_SCHEMA).toBeGreaterThanOrEqual(2);
    const s1 = chassisLogicStamp();
    expect(s1.startsWith("s" + PERSIST_SCHEMA + ":")).toBe(true);
    expect(chassisLogicStamp()).toBe(s1);
  });

  it("نفس المنطق بعد إعادة تحميل الموديول (فتحة جديدة للتطبيق) ⇒ نفس المفتاح والمحفوظ بيرجع", async () => {
    await setPersistedChassis("fp-L", new Map([["سبا7709", "VIN0000000000077"]]));
    vi.resetModules();
    const fresh = await import("../lib/chassisCache");
    expect(fresh.chassisLogicStamp()).toBe(chassisLogicStamp());
    expect((await fresh.getPersistedChassis("fp-L"))?.get("سبا7709")).toBe("VIN0000000000077");
  });

  it("🔴 تطبيع لوحات البنك اتغيّر (bankPlateToArabic) ⇒ المحفوظ القديم بيتجاهل", async () => {
    await setPersistedChassis("fp-L", new Map([["سبا7709", "VIN0000000000077"]]));
    vi.resetModules();
    vi.doMock("../lib/plateParser", async (orig) => {
      const real = await orig<typeof import("../lib/plateParser")>();
      return { ...real, bankPlateToArabic: (s: string) => real.bankPlateToArabic(s).split("").reverse().join("") };
    });
    const fresh = await import("../lib/chassisCache");
    expect(fresh.chassisLogicStamp()).not.toBe(chassisLogicStamp());
    expect(await fresh.getPersistedChassis("fp-L")).toBeNull();
  });

  it("🔴 التطبيع العادي اتغيّر (normalizePlate) ⇒ المحفوظ القديم بيتجاهل", async () => {
    await setPersistedChassis("fp-L", new Map([["ابح1234", "VIN0000000000001"]]));
    vi.resetModules();
    vi.doMock("../lib/plateParser", async (orig) => {
      const real = await orig<typeof import("../lib/plateParser")>();
      return { ...real, normalizePlate: (s: string) => real.normalizePlate(s).replace(/ا/g, "أ") };
    });
    const fresh = await import("../lib/chassisCache");
    expect(await fresh.getPersistedChassis("fp-L")).toBeNull();
  });

  it("🔴 كشف عمود الهيكل اتغيّر ⇒ المحفوظ القديم بيتجاهل", async () => {
    await setPersistedChassis("fp-L", new Map([["ابح1234", "VIN0000000000001"]]));
    vi.resetModules();
    vi.doMock("../lib/chassis", async (orig) => {
      const real = await orig<typeof import("../lib/chassis")>();
      // مثال: «بيان» بقى عنوان هيكل
      return { ...real, detectChassisColumn: (h: string[], r?: Record<string, string>[]) => (h.includes("بيان") ? "بيان" : real.detectChassisColumn(h, r)) };
    });
    const fresh = await import("../lib/chassisCache");
    expect(await fresh.getPersistedChassis("fp-L")).toBeNull();
  });

  it("🔴 كشف عمود اللوحة اتغيّر ⇒ المحفوظ القديم بيتجاهل", async () => {
    await setPersistedChassis("fp-L", new Map([["ابح1234", "VIN0000000000001"]]));
    vi.resetModules();
    vi.doMock("../lib/plateParser", async (orig) => {
      const real = await orig<typeof import("../lib/plateParser")>();
      return { ...real, detectPlateColumn: (h: string[], r?: Record<string, string>[]) => (h[0] ?? real.detectPlateColumn(h, r)) };
    });
    const fresh = await import("../lib/chassisCache");
    expect(await fresh.getPersistedChassis("fp-L")).toBeNull();
  });

  it("المحفوظ القديم بمفتاح «v1|» (قبل النسخة دي) مابيرجعش", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("platehunter-chassis", 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore("maps", { keyPath: "fp" });
        store.createIndex("savedAt", "savedAt", { unique: false });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("maps", "readwrite");
        tx.objectStore("maps").put({ fp: "v1|fp-old", keys: ["ابح1234"], vins: ["STALE00000000001"], savedAt: 1 });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    expect(await getPersistedChassis("fp-old")).toBeNull();
  });
});

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  saveFieldCheckEntry, saveFieldCheckEntries, deleteFieldCheckEntries, markFieldChecksSyncedByIds,
  getAllFieldCheckEntries, clearFieldCheck, type FieldCheckEntry, __resetFieldCheckMirrorForTest,
} from "@/lib/idb";
import { getRecordsSheet, recordsSheetStats } from "@/lib/recordsSheet";

/**
 * 🗂️ **شيت السجلات جاهز على البرنامج** — المالك (٢١ أكتوبر ٢٠٢٦): «باقصي سرعه تكون السجلات والداتا قاريه علي البرنامج
 * … ويفرز علي … كامل السجلات اللي هو مصدرها كلها» · «مش كل شوي يحمل من جديد اللي يحمل من جديد بس اللوحات الجديدة».
 *
 *  · السجلات بتتقري من الجهاز **مرة واحدة** وتفضل في الذاكرة؛ أي حفظ/تصدير/مسح/مزامنة بيعدّل النسخة دي على طول
 *    (الجديد بس — من غير ما يقرا الكل تاني).
 *  · الشيت بيتبني منها في لحظة، وبنفس القواعد بالظبط (المكرر في نفس الدقيقة سطر واحد، حي المندوب، GPS، التاريخ).
 *  · **الضمان:** أي تغيير بيغيّر «النسخة» ⇒ الشيت اللي اتبنى قبله مايتستخدمش أبداً.
 */
let n = 0;
const mk = (over: Partial<FieldCheckEntry> = {}): FieldCheckEntry => {
  n++;
  return {
    id: `fc-trial-u-${n}`, agentId: "u1", plate: `ابح${String(1000 + n)}`,
    row: { "النوع": "ج", "اسم الحي - الشارع": "شارع ٣٠ - النسيم" },
    method: "متشيكة بالصوت", lat: 24.7, lng: 46.6,
    checkedAt: new Date(Date.UTC(2026, 9, 1, 10, n)).toISOString(), synced: true,
    ...over,
  };
};

beforeEach(async () => {
  await clearFieldCheck();
  __resetFieldCheckMirrorForTest();
  localStorage.clear();
});

describe("🗂️ الشيت من السجلات", () => {
  it("كل السجلات بنفس شكل الفرز (حي المندوب ⇐ «الحي-الشارع» · GPS · التاريخ · المندوب)", async () => {
    await saveFieldCheckEntries([mk(), mk()]);
    const s = await getRecordsSheet("أحمد");
    expect(s.table?.rows).toHaveLength(2);
    const r = s.table!.rows[0];
    expect(r["الحي-الشارع"]).toBe("شارع ٣٠ - النسيم");
    expect("اسم الحي - الشارع" in r).toBe(false);
    expect(r["GPS"]).toContain("24.7");
    expect(r["التاريخ"]).toMatch(/^\d\d-10-2026 \d\d:\d\d$/);
    expect(r["المندوب"]).toBe("أحمد");
    expect(s.table!.headers.slice(0, 1)).toEqual(["رقم اللوحة"]);
  });
  it("نفس اللوحة في نفس الدقيقة = سطر واحد (زي الأول)", async () => {
    const t = new Date(Date.UTC(2026, 9, 2, 9, 0, 10)).toISOString();
    await saveFieldCheckEntries([mk({ plate: "حسن5678", checkedAt: t }), mk({ plate: "حسن5678", checkedAt: t })]);
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(1);
  });
  it("مفيش سجلات ⇒ table = null", async () => {
    expect((await getRecordsSheet("")).table).toBeNull();
  });
  it("الأرقام اللي بتظهر: كام صف وكام لوحة مختلفة", async () => {
    await saveFieldCheckEntries([mk({ plate: "ابح1234" }), mk({ plate: "ابح1234", checkedAt: new Date(Date.UTC(2026, 9, 5)).toISOString() }), mk({ plate: "دده4444" })]);
    const s = await getRecordsSheet("");
    expect(recordsSheetStats(s.table)).toEqual({ rows: 3, plates: 2 });
  });
});

describe("⚡ من الجهاز مرة واحدة — والجديد بس بعد كده", () => {
  it("الفتحة التانية من غير قراية الجهاز، ولوحة اتصدّرت ⇒ في الشيت على طول من غير قراية الكل", async () => {
    await saveFieldCheckEntries([mk(), mk(), mk()]);
    await getRecordsSheet("");
    const spy = vi.spyOn(IDBObjectStore.prototype, "getAll");
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(3);
    await saveFieldCheckEntry(mk());                 // تصدير لوحة جديدة
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(4);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("مفيش تغيير ⇒ نفس الشيت بالظبط (من غير بناء)", async () => {
    await saveFieldCheckEntries([mk()]);
    const a = await getRecordsSheet("");
    const b = await getRecordsSheet("");
    expect(b.table).toBe(a.table);
  });
  it("علامة «اترفع للسيرفر» مابتغيّرش الشيت (مش تغيير في السجلات)", async () => {
    const e = mk({ synced: false });
    await saveFieldCheckEntries([e]);
    const a = await getRecordsSheet("");
    await markFieldChecksSyncedByIds([e.id]);
    expect((await getRecordsSheet("")).table).toBe(a.table);
  });
  it("قراية صفحة التشييك للسجلات بتجهّز النسخة — الفرز بعدها من غير قراية الجهاز", async () => {
    await saveFieldCheckEntries([mk(), mk()]);
    __resetFieldCheckMirrorForTest();
    await getAllFieldCheckEntries("u1");             // صفحة التشييك (الصفحة الرئيسية) بتقرا السجلات
    const spy = vi.spyOn(IDBObjectStore.prototype, "getAll");
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("🔒 الضمان: الشيت عمره ما يبقى أقدم من السجلات", () => {
  it("تعديل (نوع/حي) ⇒ الشيت الجديد فيه التعديل", async () => {
    const e = mk();
    await saveFieldCheckEntries([e]);
    await getRecordsSheet("");
    await saveFieldCheckEntries([{ ...e, row: { ...e.row, "النوع": "ن" } }]);
    expect((await getRecordsSheet("")).table?.rows[0]["النوع"]).toBe("ن");
  });
  it("مسح ⇒ مش في الشيت", async () => {
    const a = mk(), b = mk();
    await saveFieldCheckEntries([a, b]);
    await getRecordsSheet("");
    await deleteFieldCheckEntries([a.id]);
    const rows = (await getRecordsSheet("")).table!.rows;
    expect(rows.map((r) => r["رقم اللوحة"])).toEqual([b.plate]);
  });
  it("مسح الكل ⇒ فاضي", async () => {
    await saveFieldCheckEntries([mk()]);
    await getRecordsSheet("");
    await clearFieldCheck();
    expect((await getRecordsSheet("")).table).toBeNull();
  });
  it("سجلات مجموعة مستخبية / السجلات مقفولة ⇒ الشيت بيتحسب تاني", async () => {
    await saveFieldCheckEntries([mk({ team: "t1" }), mk({ team: "t2" })]);
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(2);
    localStorage.setItem("ph:hiddenRecordTeams", JSON.stringify(["t1"]));
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(1);
  });
  it("حفظ وهي لسه بتتقري من الجهاز ⇒ مابيضيعش", async () => {
    await saveFieldCheckEntries([mk(), mk()]);
    __resetFieldCheckMirrorForTest();
    const p = getRecordsSheet("");
    await saveFieldCheckEntry(mk());
    await p;
    expect((await getRecordsSheet("")).table?.rows).toHaveLength(3);
  });
  it("الاسم بيوصل بعدين ⇒ «المندوب» بيتملي من غير ما يغيّر الصفوف التانية", async () => {
    await saveFieldCheckEntries([mk()]);
    expect((await getRecordsSheet("")).table?.rows[0]["المندوب"]).toBe("");
    expect((await getRecordsSheet("أحمد")).table?.rows[0]["المندوب"]).toBe("أحمد");
  });
});

describe("🔌 صفحة الفرز", () => {
  it("السجلات من الشيت الجاهز، و«فرز» مابيشتغلش إلا لما السجلات والملفات الإضافية يبقوا قاريين", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(app)/sorting/page.tsx", "utf8");
    expect(src).toMatch(/const \{ table \} = await getRecordsSheet\(myNameRef\.current\);/);
    expect(src).not.toMatch(/collapseDuplicateChecks\(await getAllFieldCheckEntries\(\)\)/);
    expect(src).toMatch(/const allLoaded = recordsLoaded && boxesLoaded;\s*const canSort = canSortFiles && allLoaded;/);
    expect(src).toMatch(/\}\)\(\)\.finally\(\(\) => setBoxesLoaded\(true\)\);/);
    // الملفات الإضافية برّه الشغل اللي بيستنى النت
    const boxes = src.indexOf("setBoxesLoaded(true)");
    const team = src.indexOf("const teamReady = (async () => {");
    expect(boxes).toBeGreaterThan(0);
    expect(boxes).toBeLessThan(team);
    // وقت الفرز: آخر نسخة من السجلات
    expect(src).toMatch(/const fresh = \(await getRecordsSheet\(myNameRef\.current\)\)\.table;/);
  });
});

describe("🧮 كل مصادر السجلات", () => {
  it("لوحات المجمّع والتشييك وVoice PRO كلها في الشيت", async () => {
    await saveFieldCheckEntries([
      mk({ id: "fc-mj-u-1", plate: "ررر1111", row: { "اسم الحي": "العليا" } }),
      mk({ id: "fc-cam-1", plate: "سسس2222", row: { "الحي-الشارع": "ش - ح" } }),
      mk({ plate: "صصص3333" }),
    ]);
    const rows = (await getRecordsSheet("")).table!.rows;
    expect(rows.map((r) => r["رقم اللوحة"]).sort()).toEqual(["ررر1111", "سسس2222", "صصص3333"]);
    expect(rows.find((r) => r["رقم اللوحة"] === "ررر1111")?.["الحي-الشارع"]).toBe("العليا");
  });
  it("🔒 السجلات مقفولة على العضو ⇒ مفيش شيت", async () => {
    await saveFieldCheckEntries([mk()]);
    const gl = await import("@/lib/groupLocks");
    const spy = vi.spyOn(gl, "recordsLockedNow").mockReturnValue(true);
    const { getRecordsSheet: fresh } = await import("@/lib/recordsSheet");
    expect((await fresh("")).table).toBeNull();
    spy.mockRestore();
  });
});

describe("🔔 المربع بيتحدّث لوحده", () => {
  it("حفظ/مسح ⇒ إشعار (والنسخة جاهزة وقتها)، وعلامة «اترفع» لأ", async () => {
    const { onFieldChecksChanged } = await import("@/lib/idb");
    await getRecordsSheet("");                       // النسخة في الذاكرة جاهزة
    const seen: number[] = [];
    const off = onFieldChecksChanged(() => { void getRecordsSheet("").then((s) => seen.push(s.table?.rows.length ?? 0)); });
    const e = mk({ synced: false });
    await saveFieldCheckEntry(e);
    await new Promise((r) => setTimeout(r, 0));
    await markFieldChecksSyncedByIds([e.id]);
    await deleteFieldCheckEntries([e.id]);
    await new Promise((r) => setTimeout(r, 0));
    off();
    expect(seen).toEqual([1, 0]);
  });
});

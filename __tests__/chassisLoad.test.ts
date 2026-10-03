import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizePlate, bankPlateToArabic, detectPlateColumn } from "@/lib/plateParser";
import { detectChassisColumn } from "@/lib/chassis";
import { readAllSheets, readAllSheetsRaw, parseExcelFile } from "@/lib/excel";
import { clearChassisCache, clearPersistedChassis, getCachedChassis, setCachedChassis } from "@/lib/chassisCache";
import {
  buildChassisMap,
  rawSheetsToTables,
  loadChassisMap,
  quickChassisMap,
  READER_VERSION,
  type ChassisTable,
  type RawSheet,
} from "@/lib/chassisLoad";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  رقم الهيكل (الشاص) بيتحمّل في الخلفية — والخريطة **نفسها بالظبط**
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٣ أكتوبر ٢٠٢٦): تحميل خريطة لوحة ← رقم الهيكل في الخلفية بحيث
 *  الصفحة ماتهنّجش أبداً — بشرط إن ميزة الهيكل نفسها تفضل شغّالة زي ما هي
 *  (بتظهر تحت اللوحة المطلوبة وبتتكتب في السجلات المصدّرة).
 *
 *  🔴 القديم (صفحة «الجديد»): `readAllSheets` = `XLSX.read` متزامن على الخيط
 *     الرئيسي لملف ٦٠ ألف صف في **كل** فتحة باردة ⇒ ٨–١٦ ثانية تهنيج.
 *
 *  الاختبارات هنا بتقارن الجديد بنسخة **حرفية** من الكود القديم (`oldInline`
 *  تحت) — مش بتوقّعات مكتوبة باليد.
 */

/** نسخة حرفية من الكود القديم في registration-v2/page.tsx (تأثير loadCheck). */
async function oldInline(sources: ChassisTable[], blob: Blob | null, fileName: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const addSheet = (headers: string[], rows: Record<string, string>[]) => {
    const pCol = detectPlateColumn(headers, rows);
    const cCol = detectChassisColumn(headers, rows);
    if (!pCol || !cCol) return;
    for (const row of rows) {
      const key = normalizePlate(bankPlateToArabic(String(row[pCol] ?? "")));
      const vin = String(row[cCol] ?? "").trim();
      if (key && vin && !map.has(key)) map.set(key, vin);
    }
  };
  for (const t of sources) addSheet(t.headers, t.rows);
  if (blob) {
    try {
      const f = new File([blob], fileName || "check.xlsx");
      for (const sh of await readAllSheets(f)) addSheet(sh.headers, sh.rows);
    } catch { /* blob مش مقروء — نكتفي بالورقة المحمّلة */ }
  }
  return map;
}

/** نفس الجزء المتزامن من القديم (من غير الـblob). */
function oldInlineSync(sheets: ChassisTable[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of sheets) {
    const pCol = detectPlateColumn(t.headers, t.rows);
    const cCol = detectChassisColumn(t.headers, t.rows);
    if (!pCol || !cCol) continue;
    for (const row of t.rows) {
      const key = normalizePlate(bankPlateToArabic(String(row[pCol] ?? "")));
      const vin = String(row[cCol] ?? "").trim();
      if (key && vin && !map.has(key)) map.set(key, vin);
    }
  }
  return map;
}

const AR = ["ا", "ب", "ح", "د", "ر", "س", "ص", "ط", "ع", "ق", "ك", "ل", "م", "ن", "ه", "و", "ى"];
const EN = ["A", "B", "J", "D", "R", "S", "X", "T", "E", "G", "K", "L", "Z", "N", "H", "U", "V"];
const digits = (i: number) => String(1000 + ((i * 37) % 9000));
const arPlate = (i: number) => `${AR[i % 17]} ${AR[(i * 7 + 3) % 17]} ${AR[(i * 13 + 5) % 17]} ${digits(i)}`;
const enLettersFirst = (i: number) => `${EN[i % 17]}${EN[(i * 7 + 3) % 17]}${EN[(i * 13 + 5) % 17]} ${digits(i)}`;
const enDigitsFirst = (i: number) => `${digits(i)} ${EN[i % 17]}${EN[(i * 7 + 3) % 17]}${EN[(i * 13 + 5) % 17]}`;
const vin = (i: number, salt = "AA") => `JTDKB${salt}${String(i).padStart(10, "0")}`;

function table(headers: string[], rows: string[][]): ChassisTable {
  return {
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
  };
}

const entries = (m: Map<string, string>) => [...m.entries()];

beforeEach(async () => {
  clearChassisCache();
  await clearPersistedChassis();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("buildChassisMap — نفس منطق الصفحة القديم بالحرف", () => {
  it("الهيكل في ورقة تانية غير ورقة اللوحات ⇒ بيتجاب منها", () => {
    const main = table(["رقم اللوحة", "الماركة"], [["ا ب ح 1234", "تويوتا"], ["د ر س 5678", "نيسان"]]);
    const other = table(["رقم اللوحة", "رقم الهيكل"], [["ا ب ح 1234", "JTDKBAA0000000001"], ["د ر س 5678", "JTDKBAA0000000002"]]);
    const m = buildChassisMap([main, other]);
    expect(m.get("ابح1234")).toBe("JTDKBAA0000000001");
    expect(entries(m)).toEqual(entries(oldInlineSync([main, other])));
  });

  it("🔴 اللوحة المكررة ⇒ **أول ظهور يكسب** (جوّه الورقة وبين الورقات)", () => {
    const a = table(["رقم اللوحة", "رقم الهيكل"], [["ا ب ح 1234", "FIRST000000000001"], ["ا ب ح 1234", "SECOND00000000002"]]);
    const b = table(["رقم اللوحة", "رقم الهيكل"], [["ابح1234", "THIRD000000000003"], ["ه و ى 4321", "OTHER000000000004"]]);
    const m = buildChassisMap([a, b]);
    expect(m.get("ابح1234")).toBe("FIRST000000000001");
    expect(m.get("هوي4321")).toBe("OTHER000000000004");
    expect(entries(m)).toEqual(entries(oldInlineSync([a, b])));
  });

  it("لوحات البنك الإنجليزي بالتخطيطين — NKD 5678 و 7709 ABS", () => {
    const t = table(["Plate Number", "Chassis Number"], [
      ["NKD 5678", "  JTDKBAA0000000009  "],
      ["7709 ABS", "JTDKBAA0000000010"],
      ["", "JTDKBAA0000000011"],           // لوحة فاضية ⇒ مابتدخلش
      ["HUV 1111", ""],                    // هيكل فاضي ⇒ مابيدخلش
    ]);
    const m = buildChassisMap([t]);
    expect(m.get("نكد5678")).toBe("JTDKBAA0000000009");   // متشال الفراغ
    expect(m.get("سبا7709")).toBe("JTDKBAA0000000010");   // معكوس
    expect(m.size).toBe(2);
    expect(entries(m)).toEqual(entries(oldInlineSync([t])));
  });

  it("ورقة مافيهاش عمود هيكل ⇒ بتتخطّى", () => {
    const t = table(["رقم اللوحة", "اللون"], [["ا ب ح 1234", "أبيض"]]);
    expect(buildChassisMap([t]).size).toBe(0);
  });

  it("`into` ⇒ بيكمّل على خريطة موجودة ومابيغيّرش اللي فيها", () => {
    const into = new Map([["ابح1234", "OLD00000000000001"]]);
    const t = table(["رقم اللوحة", "رقم الهيكل"], [["ا ب ح 1234", "NEW00000000000002"], ["د ر س 5678", "NEW00000000000003"]]);
    const out = buildChassisMap([t], into);
    expect(out).toBe(into);
    expect(out.get("ابح1234")).toBe("OLD00000000000001");
    expect(out.get("درس5678")).toBe("NEW00000000000003");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("rawSheetsToTables — نفس شكل readAllSheets بالظبط", () => {
  /** نفس اللي SheetJS بيطلّعه لـ readAllSheets من مصفوفة صفوف. */
  function sheetJsTable(aoa: unknown[][]) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { raw: false, defval: "" });
    return { headers: Object.keys(rows[0] ?? {}), rows };
  }

  it("عناوين: الخلية الغايبة __EMPTY، والمكرر _1، والعنوان الرقمي بيتقدّم (ترتيب Object.keys)", () => {
    const aoa: unknown[][] = [
      ["رقم اللوحة", undefined, "رقم اللوحة", "2024", "اللون", undefined, "رقم اللوحة_1"],
      ["ا ب ح 1234", "x", "د ر س 5678", "2019", "أبيض", "y", "z"],
      ["ه و ى 4321", "", "", "2020", "أسود", "", ""],
    ];
    const [t] = rawSheetsToTables([{ name: "S", aoa }]);
    const ref = sheetJsTable(aoa);
    expect(t.headers).toEqual(ref.headers);
    expect(t.rows).toEqual(ref.rows);
    expect(t.headers[0]).toBe("2024");     // العنوان الرقمي أول واحد — زي القديم
  });

  it("الصفوف الفاضية بتتشال، وصف فيه فراغات بس بيفضل (زي SheetJS)", () => {
    const aoa: unknown[][] = [
      ["رقم اللوحة", "رقم الهيكل"],
      ["ا ب ح 1234", "JTDKBAA0000000001"],
      [],
      ["", ""],
      ["  ", ""],
      ["د ر س 5678", "JTDKBAA0000000002"],
    ];
    const [t] = rawSheetsToTables([{ name: "S", aoa }]);
    expect(t.rows.map((r) => r["رقم اللوحة"])).toEqual(["ا ب ح 1234", "  ", "د ر س 5678"]);
  });

  it("🙈 الورقة المخفية مابتدخلش — إلا لو كل الورقات مخفية (زي readAllSheets)", () => {
    const aoa = [["رقم اللوحة"], ["ا ب ح 1234"]];
    const some = rawSheetsToTables([
      { name: "ظاهرة", aoa, hidden: false },
      { name: "مخفية", aoa, hidden: true },
    ]);
    expect(some.map((s) => s.sheetName)).toEqual(["ظاهرة"]);
    const allHidden = rawSheetsToTables([
      { name: "أ", aoa, hidden: true },
      { name: "ب", aoa, hidden: true },
    ]);
    expect(allHidden.map((s) => s.sheetName)).toEqual(["أ", "ب"]);
  });

  it("ورقة فاضية أو عناوين بس ⇒ بتتخطّى", () => {
    const out = rawSheetsToTables([
      { name: "فاضية", aoa: [] },
      { name: "عناوين", aoa: [["رقم اللوحة", "رقم الهيكل"]] },
      { name: "فراغ", aoa: [["", ""], [undefined, ""]] },
    ]);
    expect(out).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("loadChassisMap — في الخلفية، مرة واحدة لكل ملف", () => {
  const blob = () => new Blob(["not-really-a-workbook"]);
  const RAW: RawSheet[] = [
    { name: "بيانات", aoa: [["Plate Number", "Chassis Number"], ["NKD 5678", "JTDKBAA0000000009"], ["7709 ABS", "JTDKBAA0000000010"]] },
    { name: "قديم", hidden: true, aoa: [["رقم اللوحة", "رقم الهيكل"], ["ن ك د 5678", "ZZZZZZZ0000000001"]] },
  ];
  const SOURCES = [table(["رقم اللوحة", "الماركة"], [["ن ك د 5678", "تويوتا"]])];

  it("بيقرا الملف بالقارئ (اللي بيشتغل في الـworker) ويطلّع نفس خريطة القديم", async () => {
    const readSheets = vi.fn(async () => RAW);
    const m = await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(entries(m)).toEqual(entries(buildChassisMap([...SOURCES, ...rawSheetsToTables(RAW)])));
    expect(m.get("نكد5678")).toBe("JTDKBAA0000000009");    // المخفية مادخلتش
  });

  it("القارئ بياخد File باسم الملف (زي القديم)", async () => {
    let got: File | null = null;
    const readSheets = vi.fn(async (f: File) => { got = f; return RAW; });
    await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "تشييك.xlsx", readSheets });
    expect(got).toBeInstanceOf(File);
    expect(got!.name).toBe("تشييك.xlsx");
  });

  it("🔴 الطريق المختصر (من غير ما نبني كل الصفوف كائنات) = الطريق الكامل — واللوحات بتبدأ قبل/بعد صف ٢٠٠", async () => {
    // عمود «A» فاضي لحد صف معيّن — كشف العمود بيعتمد على عيّنة أول الصفوف
    // (أقصاها ٢٠٠). ورقتين بيحرسوا الاتجاهين:
    //   · اللوحات من صف ١٥٠: عيّنة أصغر من ٢٠٠ ⇒ عمود غلط ⇒ الاختبار يقع.
    //   · اللوحات من صف ٢٦٠: لو الكشف اتغيّر يوم وبقى يبص أبعد من ٢٠٠ ⇒ يقع.
    const bigSheet = (startAt: number, salt: string): unknown[][] => {
      const aoa: unknown[][] = [["X", "A", "رقم الهيكل", "2024", undefined, "X"]];
      for (let i = 0; i < 600; i++) {
        aoa.push([`ملاحظة ${i}`, i < startAt ? "" : arPlate(i), vin(i, salt), String(2000 + (i % 25)), i % 3 ? "" : "y", "z"]);
        if (i % 40 === 0) aoa.push([]);
      }
      return aoa;
    };
    const raw: RawSheet[] = [
      { name: "من ١٥٠", aoa: bigSheet(150, "P1") },
      { name: "من ٢٦٠", aoa: bigSheet(260, "P2") },
      ...RAW,
      { name: "لوحات بس", aoa: [["رقم اللوحة"], ["ا ب ح 1234"]] },
    ];
    const sources = [
      table(["رقم اللوحة", "رقم الشاصي"], Array.from({ length: 300 }, (_, i) => [enDigitsFirst(i), vin(i, "SR")])),
    ];
    const m = await loadChassisMap({ fingerprint: "fp-x", sources, blob: blob(), fileName: "c.xlsx", readSheets: async () => raw });
    const full = buildChassisMap([...sources, ...rawSheetsToTables(raw)]);
    expect(m.size).toBeGreaterThan(300);
    // السيناريو بيفرّق فعلاً: ورقة «من ١٥٠» اتقرت بعمود اللوحات الصح
    expect(m.get(normalizePlate(bankPlateToArabic(arPlate(170))))).toBe(vin(170, "P1"));
    expect(entries(m)).toEqual(entries(full));
    expect(entries(m)).toEqual(entries(oldInlineSync([...sources, ...rawSheetsToTables(raw)])));
  });

  it("نفس الملف تاني في نفس الجلسة ⇒ من الذاكرة، من غير قراءة", async () => {
    const readSheets = vi.fn(async () => RAW);
    const a = await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    const b = await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("🔴 **فتحة باردة** (الذاكرة اتمسحت) ⇒ من التخزين، **من غير ما يقرا الملف**", async () => {
    const first = vi.fn(async () => RAW);
    const a = await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: first });
    clearChassisCache();   // التطبيق اتقفل واتفتح
    const second = vi.fn(async () => RAW);
    const b = await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: second });
    expect(second).not.toHaveBeenCalled();
    expect(entries(b)).toEqual(entries(a));
  });

  it("🔴 نداءين في نفس الوقت لنفس الملف ⇒ **قراءة واحدة** (كان بيتحلّل مرتين وقت الرفع)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const readSheets = vi.fn(async () => { await gate; return RAW; });
    const opts = { fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets };
    const p1 = loadChassisMap(opts);
    const p2 = loadChassisMap(opts);
    const p3 = loadChassisMap(opts);
    release();
    const [a, b, c] = await Promise.all([p1, p2, p3]);
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("🔴 التخزين بايظ ⇒ بيحسب عادي ويرجّع نفس الخريطة (مايوقّفش الهيكل)", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("dead"); } });
    const readSheets = vi.fn(async () => RAW);
    const m = await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(entries(m)).toEqual(entries(buildChassisMap([...SOURCES, ...rawSheetsToTables(RAW)])));
  });

  it("الملف مش مقروء ⇒ خريطة الورقة المحمّلة بس (زي القديم)، ومابتتحفظش على الجهاز", async () => {
    const sources = [table(["رقم اللوحة", "رقم الهيكل"], [["ا ب ح 1234", "JTDKBAA0000000001"]])];
    const bad = vi.fn(async (): Promise<RawSheet[]> => { throw new Error("corrupt"); });
    const m = await loadChassisMap({ fingerprint: "fp-1", sources, blob: blob(), fileName: "c.xlsx", readSheets: bad });
    expect(entries(m)).toEqual([["ابح1234", "JTDKBAA0000000001"]]);
    // في الذاكرة زي القديم…
    const again = vi.fn(async () => RAW);
    await loadChassisMap({ fingerprint: "fp-1", sources, blob: blob(), fileName: "c.xlsx", readSheets: again });
    expect(again).not.toHaveBeenCalled();
    // …بس فتحة باردة بتحاول تاني (الفشل ممكن يكون عابر — ذاكرة الموبايل مثلاً)
    clearChassisCache();
    await loadChassisMap({ fingerprint: "fp-1", sources, blob: blob(), fileName: "c.xlsx", readSheets: again });
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("مافيش blob ⇒ من الورقات المحمّلة بس", async () => {
    const sources = [table(["رقم اللوحة", "رقم الهيكل"], [["ا ب ح 1234", "JTDKBAA0000000001"]])];
    const readSheets = vi.fn(async () => RAW);
    const m = await loadChassisMap({ fingerprint: "fp-1", sources, blob: null, fileName: null, readSheets });
    expect(readSheets).not.toHaveBeenCalled();
    expect(entries(m)).toEqual([["ابح1234", "JTDKBAA0000000001"]]);
  });

  it("🔴 نفس البصمة بس ملف إضافي (check-2) اتبدّل بنفس عدد الصفوف ⇒ يتحسب من جديد (مش خريطة قديمة)", async () => {
    const extraA = table(["رقم اللوحة", "رقم الهيكل"], [["ه و ى 4321", "EXTRAA00000000001"]]);
    const extraB = table(["رقم اللوحة", "رقم الهيكل"], [["ه و ى 4321", "EXTRAB00000000002"]]);
    const readSheets = vi.fn(async () => RAW);
    const a = await loadChassisMap({ fingerprint: "fp-1#1", sources: [...SOURCES, extraA], blob: blob(), fileName: "c.xlsx", readSheets });
    expect(a.get("هوي4321")).toBe("EXTRAA00000000001");
    clearChassisCache();
    const b = await loadChassisMap({ fingerprint: "fp-1#1", sources: [...SOURCES, extraB], blob: blob(), fileName: "c.xlsx", readSheets });
    expect(b.get("هوي4321")).toBe("EXTRAB00000000002");
  });

  it("🔴 مافيش ملف أساسي (الإضافية بس، من غير بصمة ولا blob) = لوب الصفحة القديم بالحرف", async () => {
    const extras = [
      table(["Plate Number", "Chassis Number"], [["NKD 5678", " JTDKBAA0000000009 "], ["7709 ABS", "JTDKBAA0000000010"], ["7709 ABS", "DUP00000000000001"]]),
      table(["رقم اللوحة", "اللون"], [["ا ب ح 1234", "أبيض"]]),
      table(["اللوحة", "بيان"], Array.from({ length: 30 }, (_, i) => [arPlate(i), vin(i, "NM")])),
    ];
    const readSheets = vi.fn(async () => RAW);
    const m = await loadChassisMap({ fingerprint: null, sources: extras, blob: null, fileName: null, readSheets });
    expect(readSheets).not.toHaveBeenCalled();
    expect(entries(m)).toEqual(entries(oldInlineSync(extras)));
    expect(m.size).toBeGreaterThan(30);
  });

  it("بصمة null ⇒ مفيش كاش خالص (بيحسب كل مرة)", async () => {
    const readSheets = vi.fn(async () => RAW);
    await loadChassisMap({ fingerprint: null, sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    await loadChassisMap({ fingerprint: null, sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(2);
  });

  it("كاش الذاكرة القديم (get/setCachedChassis) لسه شغّال زي ما هو للي بيستخدمه", async () => {
    await loadChassisMap({ fingerprint: "fp-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: async () => RAW });
    const mine = new Map([["ابح1234", "VIN"]]);
    setCachedChassis("legacy-fp", mine);
    expect(getCachedChassis("legacy-fp")).toBe(mine);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 **وقت التسجيل: الكاش بس** — الشارة تحت اللوحة المطلوبة لازم تظهر وهو
 * بيسجّل. الكاش (الذاكرة ثم الجهاز) مابيقراش الملف، فمسموح؛ **قراية الملف
 * بس** هي اللي بتستنى الإيقاف. `quickChassisMap` عمره ما بينده القارئ.
 */
describe("quickChassisMap — وقت التسجيل من غير قراية الملف", () => {
  const blob = () => new Blob(["not-really-a-workbook"]);
  const RAW: RawSheet[] = [
    { name: "بيانات", aoa: [["Plate Number", "Chassis Number"], ["NKD 5678", "JTDKBAA0000000009"], ["7709 ABS", "JTDKBAA0000000010"]] },
  ];
  const SOURCES = [table(["رقم اللوحة", "رقم الهيكل"], [["ا ب ح 1234", "JTDKBAA0000000001"], ["ن ك د 5678", "JTDKBAA0000000002"]])];
  const mustNotRead = () => vi.fn(async (): Promise<RawSheet[]> => { throw new Error("قراية الملف ممنوعة وقت التسجيل"); });

  it("في الذاكرة ⇒ نهائية، من غير قراية", async () => {
    const full = await loadChassisMap({ fingerprint: "q-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: async () => RAW });
    const readSheets = mustNotRead();
    const q = await quickChassisMap({ fingerprint: "q-1", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(q.final).toBe(true);
    expect(entries(q.value)).toEqual(entries(full));
    expect(readSheets).not.toHaveBeenCalled();
  });

  it("🔴 فتحة باردة (محفوظة على الجهاز) ⇒ نهائية، من غير قراية", async () => {
    const full = await loadChassisMap({ fingerprint: "q-2", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: async () => RAW });
    clearChassisCache();
    const readSheets = mustNotRead();
    const q = await quickChassisMap({ fingerprint: "q-2", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(q.final).toBe(true);
    expect(entries(q.value)).toEqual(entries(full));
    expect(readSheets).not.toHaveBeenCalled();
  });

  it("🔴 مش محفوظة ⇒ جزئية من الورقات المحمّلة بس (نفس قيمها في الكاملة)، والملف مابيتقريش", async () => {
    const readSheets = mustNotRead();
    const q = await quickChassisMap({ fingerprint: "q-3", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(q.final).toBe(false);
    expect(readSheets).not.toHaveBeenCalled();
    expect(entries(q.value)).toEqual(entries(buildChassisMap(SOURCES)));
    // الجزئية بقيمها = نفس اللي في الكاملة (الورقات المحمّلة بتكسب في الاتنين)
    const full = await loadChassisMap({ fingerprint: "q-3", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: async () => RAW });
    for (const [k, v] of q.value) expect(full.get(k)).toBe(v);
    expect(full.size).toBeGreaterThan(q.value.size);
  });

  it("🔴 الجزئية مابتتحفظش (لا ذاكرة ولا جهاز) — التحميل الكامل بعدها لازم يقرا الملف", async () => {
    await quickChassisMap({ fingerprint: "q-4", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: mustNotRead() });
    const readSheets = vi.fn(async () => RAW);
    const full = await loadChassisMap({ fingerprint: "q-4", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(full.get("نكد5678")).toBe("JTDKBAA0000000002");      // المحمّلة كسبت
    expect(full.get("سبا7709")).toBe("JTDKBAA0000000010");      // من الملف
    clearChassisCache();
    const q = await quickChassisMap({ fingerprint: "q-4", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets: mustNotRead() });
    expect(q.final).toBe(true);
    expect(entries(q.value)).toEqual(entries(full));
  });

  it("مافيش blob ⇒ نهائية من الورقات المحمّلة (مافيش ملف يتقري أصلاً)", async () => {
    const readSheets = mustNotRead();
    const q = await quickChassisMap({ fingerprint: "q-5", sources: SOURCES, blob: null, fileName: null, readSheets });
    expect(q.final).toBe(true);
    expect(entries(q.value)).toEqual(entries(buildChassisMap(SOURCES)));
    expect(readSheets).not.toHaveBeenCalled();
  });

  it("تحميل كامل شغّال لنفس الملف ⇒ بيستناه (مابيقراش تاني)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const readSheets = vi.fn(async () => { await gate; return RAW; });
    const opts = { fingerprint: "q-6", sources: SOURCES, blob: blob(), fileName: "c.xlsx", readSheets };
    const fullP = loadChassisMap(opts);
    await new Promise((r) => setTimeout(r, 0));
    const quickP = quickChassisMap(opts);
    release();
    const [full, q] = await Promise.all([fullP, quickP]);
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(q.final).toBe(true);
    expect(q.value).toBe(full);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 **بصمة المحتوى** — البصمة القديمة = الاسم + حجم الملف + عدد الصفوف. ملف
 * اترفع تاني بنفس الاسم والحجم والصفوف بس **هيكل اتصحّح** جوّاه (أو في نص
 * الورقة) كان هياخد الخريطة القديمة — ودلوقتي الخريطة محفوظة على الجهاز،
 * فالغلط كان هيفضل **للأبد**. SHA-256 للملف نفسه بيفرّق.
 */
describe("loadChassisMap — بصمة محتوى الملف (SHA-256)", () => {
  const SOURCES = [table(["رقم اللوحة", "الماركة"], [["ن ك د 5678", "تويوتا"]])];
  const rawWith = (v: string): RawSheet[] => [
    { name: "بيانات", aoa: [["Plate Number", "Chassis Number"], ["NKD 5678", v]] },
  ];
  // نفس الحجم بالظبط — المحتوى بس اللي مختلف
  const blobA = () => new Blob(["workbook-bytes-AAAA"]);
  const blobB = () => new Blob(["workbook-bytes-BBBB"]);

  it("🔴 نفس الاسم والحجم وعدد الصفوف بس المحتوى اتغيّر ⇒ يتحسب من جديد (مش الخريطة القديمة من الجهاز)", async () => {
    expect(blobA().size).toBe(blobB().size);
    const a = await loadChassisMap({
      fingerprint: "same|19|1", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", readSheets: async () => rawWith("OLDVIN00000000001"),
    });
    expect(a.get("نكد5678")).toBe("OLDVIN00000000001");
    clearChassisCache();   // فتحة باردة
    const readSheets = vi.fn(async () => rawWith("NEWVIN00000000002"));
    const b = await loadChassisMap({ fingerprint: "same|19|1", sources: SOURCES, blob: blobB(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(b.get("نكد5678")).toBe("NEWVIN00000000002");
  });

  it("🔴 ونفس الكلام في نفس الجلسة (الذاكرة) — رفع تاني بنفس الحجم", async () => {
    await loadChassisMap({
      fingerprint: "same|19|1", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", fileStamp: "t1", readSheets: async () => rawWith("OLDVIN00000000001"),
    });
    const readSheets = vi.fn(async () => rawWith("NEWVIN00000000002"));
    const b = await loadChassisMap({
      fingerprint: "same|19|1", sources: SOURCES, blob: blobB(), fileName: "c.xlsx", fileStamp: "t2", readSheets,
    });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(b.get("نكد5678")).toBe("NEWVIN00000000002");
  });

  it("نفس المحتوى (Blob تاني) ⇒ نفس المفتاح — الفتحة الباردة من الجهاز", async () => {
    const a = await loadChassisMap({ fingerprint: "fp-h", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", readSheets: async () => rawWith("VINA0000000000001") });
    clearChassisCache();
    const readSheets = vi.fn(async () => rawWith("SHOULDNOTREAD0001"));
    const b = await loadChassisMap({ fingerprint: "fp-h", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", readSheets });
    expect(readSheets).not.toHaveBeenCalled();
    expect(entries(b)).toEqual(entries(a));
  });

  it("🔴 الهاش بيتحسب **مرة واحدة لكل ملف في الجلسة** (نفس بصمة الرفع)", async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
    const opts = (b: Blob) => ({ fingerprint: "fp-once", sources: SOURCES, blob: b, fileName: "c.xlsx", fileStamp: "2026-10-03T10:00:00.000Z", readSheets: async () => rawWith("VINO0000000000001") });
    await loadChassisMap(opts(blobA()));
    clearChassisCache();
    await loadChassisMap(opts(blobA()));      // Blob جديد من IndexedDB — نفس الرفع
    clearChassisCache();
    await quickChassisMap(opts(blobA()));
    expect(digest).toHaveBeenCalledTimes(1);
  });

  it("crypto.subtle مش متاح ⇒ يرجع للبصمة القديمة ويشتغل عادي (ومن الجهاز في الفتحة الباردة)", async () => {
    vi.stubGlobal("crypto", {});
    const readSheets = vi.fn(async () => rawWith("VINC0000000000001"));
    const a = await loadChassisMap({ fingerprint: "fp-nocrypto", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", readSheets });
    expect(a.get("نكد5678")).toBe("VINC0000000000001");
    clearChassisCache();
    const b = await loadChassisMap({ fingerprint: "fp-nocrypto", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", readSheets });
    expect(readSheets).toHaveBeenCalledTimes(1);
    expect(entries(b)).toEqual(entries(a));
  });

  it("الهاش بيفشل (الملف مش مقروء) ⇒ مابيقعش — البصمة القديمة", async () => {
    vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValue(new Error("boom"));
    const readSheets = vi.fn(async () => rawWith("VIND0000000000001"));
    const m = await loadChassisMap({ fingerprint: "fp-digest-fail", sources: SOURCES, blob: blobA(), fileName: "c.xlsx", readSheets });
    expect(m.get("نكد5678")).toBe("VIND0000000000001");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 **نسخة القارئ** (`READER_VERSION`) — جزء من المفتاح. ختم المنطق
 * (`chassisLogicStamp`) بيلقط تغيير التطبيع والكشف لوحده، بس **مش** القارئ
 * الخام (`readAllSheetsRaw`) ولا إعادة بناء العناوين (`layoutOf`). أي تعديل
 * فيهم ⇒ يرفعوا الرقم ⇒ الخرايط المحفوظة على الموبايلات تتحسب من جديد بدل ما
 * تفضل غلط للأبد.
 */
describe("loadChassisMap — نسخة القارئ (READER_VERSION) جزء من المفتاح", () => {
  const SOURCES = [table(["رقم اللوحة", "الماركة"], [["ن ك د 5678", "تويوتا"]])];
  const rawWith = (v: string): RawSheet[] => [
    { name: "بيانات", aoa: [["Plate Number", "Chassis Number"], ["NKD 5678", v]] },
  ];
  const blob = () => new Blob(["workbook-bytes-RV"]);
  const opts = (readSheets: (f: File) => Promise<RawSheet[]>, readerVersion?: number) => ({
    fingerprint: "fp-rv", sources: SOURCES, blob: blob(), fileName: "c.xlsx", fileStamp: "rv-1", readSheets,
    ...(readerVersion === undefined ? {} : { readerVersion }),
  });

  it("رقم صحيح موجب ومُصدَّر", () => {
    expect(Number.isInteger(READER_VERSION)).toBe(true);
    expect(READER_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("نفس النسخة ⇒ الفتحة الباردة من الجهاز من غير قراية (زي ما هو)", async () => {
    await loadChassisMap(opts(async () => rawWith("VINR0000000000001")));
    clearChassisCache();
    const readSheets = vi.fn(async () => rawWith("SHOULDNOTREAD0001"));
    const b = await loadChassisMap(opts(readSheets, READER_VERSION));
    expect(readSheets).not.toHaveBeenCalled();
    expect(b.get("نكد5678")).toBe("VINR0000000000001");
  });

  it("🔴 النسخة اترفعت ⇒ المحفوظ على الجهاز بيتجاهل والملف بيتقري من جديد (وبيتحفظ بالمفتاح الجديد)", async () => {
    await loadChassisMap(opts(async () => rawWith("OLDREADER00000001")));
    clearChassisCache();   // تحديث التطبيق + فتحة باردة
    const bumped = vi.fn(async () => rawWith("NEWREADER00000002"));
    const b = await loadChassisMap(opts(bumped, READER_VERSION + 1));
    expect(bumped).toHaveBeenCalledTimes(1);
    expect(b.get("نكد5678")).toBe("NEWREADER00000002");
    // وبعدها بالنسخة الجديدة ⇒ من الجهاز تاني
    clearChassisCache();
    const again = vi.fn(async () => rawWith("SHOULDNOTREAD0001"));
    const c = await loadChassisMap(opts(again, READER_VERSION + 1));
    expect(again).not.toHaveBeenCalled();
    expect(c.get("نكد5678")).toBe("NEWREADER00000002");
  });

  it("🔴 ونفس الكلام في الذاكرة (نفس الجلسة)", async () => {
    const a = await loadChassisMap(opts(async () => rawWith("OLDREADER00000001")));
    const bumped = vi.fn(async () => rawWith("NEWREADER00000002"));
    const b = await loadChassisMap(opts(bumped, READER_VERSION + 1));
    expect(bumped).toHaveBeenCalledTimes(1);
    expect(b).not.toBe(a);
  });

  it("🔴 وقت التسجيل (quickChassisMap) بالنسخة الجديدة ⇒ المحفوظ القديم مش «نهائي»، والملف مابيتقريش", async () => {
    await loadChassisMap(opts(async () => rawWith("OLDREADER00000001")));
    clearChassisCache();
    const readSheets = vi.fn(async () => rawWith("SHOULDNOTREAD0001"));
    const q = await quickChassisMap(opts(readSheets, READER_VERSION + 1));
    expect(q.final).toBe(false);
    expect(readSheets).not.toHaveBeenCalled();
  });

  it("الثابت عليه تعليق للي هيعدّل: ارفعه مع أي تغيير في القارئ أو بناء العناوين", () => {
    const src = readFileSync(path.resolve(__dirname, "../lib/chassisLoad.ts"), "utf8");
    const at = src.indexOf("export const READER_VERSION = ");
    expect(at).toBeGreaterThan(0);
    const doc = src.slice(src.lastIndexOf("/**", at), at);
    for (const word of ["ارفع", "readAllSheetsRaw", "layoutOf"]) expect(doc).toContain(word);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 **الأهم**: على ملف حقيقي الشكل (آلاف الصفوف، ٤ ورقات، ورقة مخفية،
 * صفوف مخفية وفاضية، لوحات بنك إنجليزي بالتخطيطين، تكرار، تواريخ وأرقام) —
 * الخريطة من الطريق الجديد (قارئ الـworker) **= حرفياً** الخريطة من الكود
 * القديم (`readAllSheets`)، بنفس الترتيب.
 *
 * ⚠️ vitest مافيهوش `Worker` ⇒ `readAllSheetsRaw` بتنزل على نفس القارئ اللي
 * الـworker بيشغّله جوّاه (المتدفّق الأول، وبعده SheetJS بنفس الخيارات) — فده
 * نفس الكود اللي هيشتغل على الموبايل، بس على الخيط ده.
 */
describe("🔴 تطابق حرفي مع القديم على ملف حقيقي الشكل", () => {
  function realisticWorkbook(): XLSX.WorkBook {
    const wb = XLSX.utils.book_new();

    // ① تشييك — اللوحات من غير هيكل (الهيكل في ورقة تانية زي ملفات المالك)
    const main: unknown[][] = [["م", "رقم اللوحة", "الماركة", "الطراز", "2024", "تاريخ الإحالة", "الحي"]];
    const mainHidden: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const plate = i % 10 === 3 ? enLettersFirst(i) : i % 10 === 7 ? enDigitsFirst(i) : arPlate(i);
      main.push([i + 1, plate, "تويوتا", "كامري", 2010 + (i % 15), new Date(2026, i % 12, 1 + (i % 28)), "النسيم"]);
      if (i % 250 === 0) main.push([]);                       // صف فاضي
      if (i % 97 === 5) mainHidden.push(main.length - 1);       // صف مخفي (فلتر)
    }
    const wsMain = XLSX.utils.aoa_to_sheet(main);
    wsMain["!rows"] = [];
    for (const r of mainHidden) wsMain["!rows"][r] = { hidden: true };
    XLSX.utils.book_append_sheet(wb, wsMain, "تشييك");

    // ② بيانات المركبات — شيت بنك إنجليزي، فيه تكرار وفراغات حوالين الهيكل
    const data: unknown[][] = [["Plate Number", "Vehicle Name", "Chassis Number", "Year Model"]];
    const dataHidden: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const j = i % 50 === 49 ? i - 1 : i;                      // لوحة مكررة بهيكل تاني
      const plate = j % 3 === 0 ? enLettersFirst(j) : j % 3 === 1 ? enDigitsFirst(j) : arPlate(j);
      const v = i % 33 === 0 ? "" : i % 7 === 0 ? `  ${vin(i)} ` : vin(i);
      data.push([plate, "Toyota Camry", v, 2015 + (i % 10)]);
      if (i % 151 === 9) dataHidden.push(data.length - 1);
    }
    const wsData = XLSX.utils.aoa_to_sheet(data);
    wsData["!rows"] = [];
    for (const r of dataHidden) wsData["!rows"][r] = { hidden: true };
    XLSX.utils.book_append_sheet(wb, wsData, "بيانات المركبات");

    // ③ قديم (مخفية) — هياكل غلط لنفس اللوحات، ماينفعش تظهر
    const old: unknown[][] = [["رقم اللوحة", "رقم الهيكل"]];
    for (let i = 0; i < 1000; i++) old.push([arPlate(i + 5000), vin(i, "ZZ")]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(old), "قديم");

    // ④ كشف — صف عنوان فوق وبعده سطر فاضي، والهيكل بيتكشف بالمحتوى (من غير اسم)
    const kashf: unknown[][] = [["كشف المركبات"], [], ["اللوحة", "بيان", "ملاحظة"]];
    for (let i = 0; i < 800; i++) kashf.push([arPlate(i + 9000), vin(i, "KS"), i % 5 ? "" : "تم"]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kashf), "كشف");

    // ⑤ عناوين بس
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["رقم اللوحة", "رقم الهيكل"]]), "فاضية");

    wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }, { Hidden: 0 }, { Hidden: 0 }] } as XLSX.WBProps;
    return wb;
  }

  function fileOf(bookType: "xlsx" | "xls"): File {
    const out = XLSX.write(realisticWorkbook(), { bookType, type: "array" }) as ArrayBuffer;
    return new File([out], `تشييك.${bookType}`);
  }

  /** check-2 — ملف إضافي ليه هياكل لبعض نفس اللوحات (لازم يكسب، لأنه قبل الملف). */
  const extra = table(
    ["رقم اللوحة", "رقم الشاصي"],
    Array.from({ length: 300 }, (_, i) => [arPlate(i * 3), vin(i, "EX")]),
  );

  it("vitest مافيهوش Worker ⇒ بنختبر نفس قارئ الـworker على الخيط ده", () => {
    expect(typeof (globalThis as { Worker?: unknown }).Worker).toBe("undefined");
  });

  for (const bookType of ["xlsx", "xls"] as const) {
    it(`${bookType}: الخريطة الجديدة = القديمة حرفياً (نفس المفاتيح والقيم والترتيب)`, async () => {
      const file = fileOf(bookType);
      const mainTable = await parseExcelFile(file);
      const sources: ChassisTable[] = [{ headers: mainTable.headers, rows: mainTable.rows }, extra];

      const before = await oldInline(sources, file, file.name);
      const after = await loadChassisMap({ fingerprint: `real-${bookType}`, sources, blob: file, fileName: file.name });

      expect(before.size).toBeGreaterThan(3000);
      expect(entries(after)).toEqual(entries(before));

      // وفتحة باردة بعدها (من التخزين) = نفس الشيء
      clearChassisCache();
      const cold = await loadChassisMap({
        fingerprint: `real-${bookType}`, sources, blob: file, fileName: file.name,
        readSheets: async () => { throw new Error("must not read"); },
      });
      expect(entries(cold)).toEqual(entries(before));
    }, 60_000);

    it(`${bookType}: كل ورقة من قارئ الـworker = نفس اللي readAllSheets بيطلّعه`, async () => {
      const file = fileOf(bookType);
      const viaWorkerReader = rawSheetsToTables(await readAllSheetsRaw(file));
      const old = await readAllSheets(file);
      expect(viaWorkerReader.map((s) => s.sheetName)).toEqual(old.map((s) => s.sheetName));
      for (let i = 0; i < old.length; i++) {
        expect(viaWorkerReader[i].headers).toEqual(old[i].headers);
        expect(viaWorkerReader[i].rows).toEqual(old[i].rows);
      }
    }, 60_000);
  }

  it("xlsx: معقولية — الهيكل من الورقة التانية، المخفية مادخلتش، وcheck-2 بيكسب", async () => {
    const file = fileOf("xlsx");
    const mainTable = await parseExcelFile(file);
    const m = await loadChassisMap({
      fingerprint: "sanity", sources: [{ headers: mainTable.headers, rows: mainTable.rows }, extra], blob: file, fileName: file.name,
    });
    // لوحة بنك (حروف الأول) موجودة في «بيانات المركبات» بس
    expect(m.get(normalizePlate(bankPlateToArabic(enLettersFirst(3))))).toBe(vin(3));
    // check-2 قبل الملف ⇒ بيكسب على «بيانات المركبات»
    expect(m.get(normalizePlate(bankPlateToArabic(arPlate(0))))).toBe(vin(0, "EX"));
    // الورقة المخفية «قديم» مالهاش ولا هيكل في الخريطة
    expect([...m.values()].some((v) => v.includes("ZZ"))).toBe(false);
    // الهيكل بالمحتوى من «كشف»
    expect([...m.values()].some((v) => v.includes("KS"))).toBe(true);
  }, 60_000);
});

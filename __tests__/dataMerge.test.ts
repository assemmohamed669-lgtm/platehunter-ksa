import { describe, it, expect } from "vitest";
import {
  normLoc, locationBase, buildLocationIndex, suggestLocations, locationsInSheet,
  suggestColumnMapping, mapRow, mergeIntoData, verifyMerge, detectLocationColumn,
  type ColumnMapping,
} from "@/lib/dataMerge";

/**
 * «رفع للداتا» — المندوب بيسجّل صوت، حد بيفرّغه ويبعت شيت إكسيل، والصفوف
 * الجديدة لازم تتحطّ **تحت آخر موقع سجّله المندوب في نفس المنطقة** — مش في
 * آخر الملف، لأن مواقع المنطقة في نص الداتا.
 *
 * أخطر شرط: **مافيش صف قديم يتغيّر أو يتشال.** الدمج إدخال بس، والملف الأصلي
 * مايتلمسش (الناتج ملف جديد).
 */

const DATA_HEADERS = ["رقم اللوحة", "نوع السيارة", "الحى", "التاريخ", "GPS"];
const row = (plate: string, loc: string, type = "", date = "", gps = "") =>
  ({ "رقم اللوحة": plate, "نوع السيارة": type, "الحى": loc, "التاريخ": date, "GPS": gps });

/** داتا زي الحقيقية: مواقع مجمّعة، ومنطقة الصفا في النص. */
const DATA = [
  row("ا ا ا 1111", "1المروة"),
  row("ب ب ب 2222", "1المروة"),
  row("ج ج ج 3333", "79 الصفا"),
  row("د د د 4444", "80 الصفا"),
  row("ه ه ه 5555", "80 الصفا"),      // آخر صف في الصفا — الإدخال بعده
  row("و و و 6666", "1البساتين"),
  row("ز ز ز 7777", "2البساتين"),
];

describe("تطبيع أسماء المواقع", () => {
  it("بيشيل المسافات الزيادة والتطويل ويوحّد الألف", () => {
    expect(normLoc("  الصــفا   ")).toBe("الصفا");
    expect(normLoc("أ الصفا")).toBe("ا الصفا");
  });

  it("بيشيل رقم الشوط من أول الاسم", () => {
    expect(locationBase("81 الصفا")).toBe("الصفا");
    expect(locationBase("80 الصفا")).toBe("الصفا");
    expect(locationBase("2دوام المدرسه")).toBe("دوام المدرسه");
    expect(locationBase("003واحه ليلي")).toBe("واحه ليلي");
  });

  it("اسم من غير رقم بيفضل زي ما هو", () => {
    expect(locationBase("الكورنيش")).toBe("الكورنيش");
  });
});

describe("فهرس المواقع", () => {
  const idx = buildLocationIndex(DATA, "الحى");

  it("بيعدّ كل موقع وبيحدد أول وآخر صف", () => {
    const safa80 = idx.find((l) => l.name === "80 الصفا")!;
    expect(safa80.firstRow).toBe(3);
    expect(safa80.lastRow).toBe(4);
    expect(safa80.count).toBe(2);
  });

  it("بيتجاهل الخانات الفاضية", () => {
    const withEmpty = [...DATA, row("ح ح ح 8888", "")];
    expect(buildLocationIndex(withEmpty, "الحى").length).toBe(idx.length);
  });
});

describe("اقتراح مكان الإدخال", () => {
  const idx = buildLocationIndex(DATA, "الحى");

  it("«81 الصفا» بيقترح «80 الصفا» أولاً (نفس المنطقة، آخر شوط)", () => {
    const s = suggestLocations(idx, "81 الصفا");
    expect(s[0].name).toBe("80 الصفا");
    expect(s[0].lastRow).toBe(4);
  });

  it("التطابق التام بيكسب", () => {
    expect(suggestLocations(idx, "80 الصفا")[0].name).toBe("80 الصفا");
  });

  it("بيرجّع الأحدث في الملف لما النتيجة متساوية", () => {
    const s = suggestLocations(idx, "3البساتين");
    expect(s[0].name).toBe("2البساتين");     // آخر صف في البساتين
  });

  it("اسم مالوش أي علاقة → مافيش اقتراح (الأدمن يختار بنفسه)", () => {
    expect(suggestLocations(idx, "حي مالوش وجود خالص")).toEqual([]);
  });

  it("استعلام فاضي → مافيش اقتراح", () => {
    expect(suggestLocations(idx, "")).toEqual([]);
  });
});

describe("مواقع شيت التفريغ", () => {
  it("بيرجّع الأسماء بالترتيب وبدون تكرار", () => {
    const sheet = [row("x", "81 الصفا"), row("y", "81 الصفا"), row("z", "82 الصفا")];
    expect(locationsInSheet(sheet, "الحى")).toEqual(["81 الصفا", "82 الصفا"]);
  });
});

describe("ربط الأعمدة", () => {
  it("بيربط بالاسم حتى لو الترتيب مختلف", () => {
    const src = ["التاريخ", "رقم اللوحة", "الحي", "النوع"];
    const m = suggestColumnMapping(src, DATA_HEADERS);
    const by = (s: string) => m.find((x) => x.source === s)?.target;
    expect(by("رقم اللوحة")).toBe("رقم اللوحة");
    expect(by("النوع")).toBe("نوع السيارة");
    expect(by("الحي")).toBe("الحى");
    expect(by("التاريخ")).toBe("التاريخ");
  });

  it("بيربط أسماء مختلفة بنفس المعنى", () => {
    const m = suggestColumnMapping(["PLATE_NO", "type of car", "الشارع"], DATA_HEADERS);
    expect(m[0].target).toBe("رقم اللوحة");
    expect(m[1].target).toBe("نوع السيارة");
    expect(m[2].target).toBe("الحى");
  });

  it("شيت بلا عناوين → بيربط بالترتيب", () => {
    const m = suggestColumnMapping(["عمود 1", "عمود 2", "عمود 3"], DATA_HEADERS);
    expect(m.map((x) => x.target)).toEqual(["رقم اللوحة", "نوع السيارة", "الحى"]);
  });

  // الداتا الحقيقية مكتوبة «الحى» بألف مقصورة، والشيت بيقول «الحي» بياء —
  // من غير تطبيع عربي الاتنين مابيتقابلوش والعمود بيروح مكان غلط.
  it("بيقابل رغم اختلاف ى/ي و ة/ه و أ/ا", () => {
    const m = suggestColumnMapping(["الشارع", "نوع المركبه"], ["رقم اللوحة", "نوع السيارة", "الحى", "GPS"]);
    expect(m.find((x) => x.source === "الشارع")?.target).toBe("الحى");
    expect(m.find((x) => x.source === "نوع المركبه")?.target).toBe("نوع السيارة");
  });

  // ده اللي بوّظ التجربة الحقيقية: «التاريخ» اتحط في «الحى» لأن الداتا
  // مافيهاش عمود تاريخ خالص. عمود معروف ومالوش مكان → يتجاهل، مايتحشرش.
  it("عمود معروف مالوش نظير في الداتا بيتجاهل مايتحشرش في عمود تاني", () => {
    const m = suggestColumnMapping(
      ["التاريخ", "PLATE_NO", "الشارع", "type of car"],
      ["رقم اللوحة", "نوع السيارة", "الحى", "GPS"],
    );
    const by = (s: string) => m.find((x) => x.source === s)?.target;
    expect(by("التاريخ")).toBeNull();          // مافيش عمود تاريخ في الداتا
    expect(by("PLATE_NO")).toBe("رقم اللوحة");
    expect(by("الشارع")).toBe("الحى");
    expect(by("type of car")).toBe("نوع السيارة");
    expect(by("PLATE_NO")).not.toBe("GPS");
  });

  it("الأعمدة المجهولة بس هي اللي بتتربط بالترتيب", () => {
    const m = suggestColumnMapping(["رقم اللوحة", "بيانات إضافية"], ["رقم اللوحة", "نوع السيارة", "الحى"]);
    expect(m[0].target).toBe("رقم اللوحة");
    expect(m[1].target).toBe("نوع السيارة");   // مجهول → بالترتيب على أول عمود فاضي
  });

  it("مافيش عمودين بيتربطوا بنفس عمود الداتا", () => {
    const m = suggestColumnMapping(["لوحة", "رقم اللوحة", "الحي"], DATA_HEADERS);
    const targets = m.map((x) => x.target).filter(Boolean);
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("عمود الموقع", () => {
  it("بيلاقيه رغم الألف المقصورة", () => {
    expect(detectLocationColumn(["رقم اللوحة", "نوع السيارة", "الحى", "GPS"])).toBe("الحى");
  });

  it("مابيخلطش بين عمود الموقع وعمود GPS", () => {
    expect(detectLocationColumn(["رقم اللوحة", "GPS", "الحي"])).toBe("الحي");
  });

  it("بيقبل «شارع» و«منطقة» و«موقع»", () => {
    expect(detectLocationColumn(["اللوحة", "الشارع"])).toBe("الشارع");
    expect(detectLocationColumn(["اللوحة", "المنطقه"])).toBe("المنطقه");
    expect(detectLocationColumn(["اللوحة", "الموقع"])).toBe("الموقع");
  });

  it("مافيش عمود موقع → null", () => {
    expect(detectLocationColumn(["اللوحة", "اللون"])).toBeNull();
  });
});

describe("الدمج — إدخال بس، مافيش تغيير في القديم", () => {
  const SHEET = [
    { "اللوحة": "ط ط ط 9991", "النوع": "و", "الحي": "81 الصفا" },
    { "اللوحة": "ي ي ي 9992", "النوع": "ف", "الحي": "81 الصفا" },
  ];
  const MAP: ColumnMapping[] = [
    { source: "اللوحة", target: "رقم اللوحة" },
    { source: "النوع", target: "نوع السيارة" },
    { source: "الحي", target: "الحى" },
  ];

  it("بيدخّل بعد آخر صف في المنطقة", () => {
    const r = mergeIntoData(DATA, SHEET, MAP, DATA_HEADERS, 4);
    expect(r.addedCount).toBe(2);
    expect(r.insertedAt).toBe(5);
    expect(r.rows.map((x) => x["رقم اللوحة"])).toEqual([
      "ا ا ا 1111", "ب ب ب 2222", "ج ج ج 3333", "د د د 4444", "ه ه ه 5555",
      "ط ط ط 9991", "ي ي ي 9992",                      // الجديد في مكانه
      "و و و 6666", "ز ز ز 7777",
    ]);
  });

  it("كل صف قديم زي ما هو بالظبط (نفس الكائن)", () => {
    const r = mergeIntoData(DATA, SHEET, MAP, DATA_HEADERS, 4);
    expect(verifyMerge(DATA, r.rows, r.insertedAt, r.addedCount)).toEqual({ ok: true });
  });

  it("الأعمدة بتروح كل واحد في مكانه", () => {
    const r = mergeIntoData(DATA, SHEET, MAP, DATA_HEADERS, 4);
    expect(r.rows[5]).toEqual({
      "رقم اللوحة": "ط ط ط 9991", "نوع السيارة": "و", "الحى": "81 الصفا",
      "التاريخ": "", "GPS": "",
    });
  });

  it("اللوحة المكررة بتتضاف زي ما هي (شغل المندوب)", () => {
    const dup = [SHEET[0], SHEET[0], SHEET[0]];
    const r = mergeIntoData(DATA, dup, MAP, DATA_HEADERS, 4);
    expect(r.addedCount).toBe(3);
    expect(r.rows.filter((x) => x["رقم اللوحة"] === "ط ط ط 9991")).toHaveLength(3);
  });

  it("لوحة موجودة أصلاً في الداتا بتتضاف كمان (مابنمسحش القديم)", () => {
    const same = [{ "اللوحة": "د د د 4444", "النوع": "و", "الحي": "81 الصفا" }];
    const r = mergeIntoData(DATA, same, MAP, DATA_HEADERS, 4);
    expect(r.rows.filter((x) => x["رقم اللوحة"] === "د د د 4444")).toHaveLength(2);
    expect(verifyMerge(DATA, r.rows, r.insertedAt, r.addedCount).ok).toBe(true);
  });

  it("الإدخال في الأول وفي الآخر بيشتغلوا", () => {
    const first = mergeIntoData(DATA, SHEET, MAP, DATA_HEADERS, -1);
    expect(first.insertedAt).toBe(0);
    expect(verifyMerge(DATA, first.rows, 0, 2).ok).toBe(true);

    const last = mergeIntoData(DATA, SHEET, MAP, DATA_HEADERS, 999);
    expect(last.insertedAt).toBe(DATA.length);
    expect(verifyMerge(DATA, last.rows, DATA.length, 2).ok).toBe(true);
  });

  it("عمود مش مربوط بيتجاهل مايكسرش", () => {
    const m: ColumnMapping[] = [...MAP, { source: "عمود زيادة", target: null }];
    const r = mergeIntoData(DATA, [{ ...SHEET[0], "عمود زيادة": "x" }], m, DATA_HEADERS, 4);
    expect(Object.keys(r.rows[5])).toEqual(DATA_HEADERS);
  });

  it("شيت فاضي → الداتا زي ما هي", () => {
    const r = mergeIntoData(DATA, [], MAP, DATA_HEADERS, 4);
    expect(r.addedCount).toBe(0);
    expect(r.rows).toHaveLength(DATA.length);
  });

  it("mapRow بيملا كل أعمدة الداتا حتى الفاضية", () => {
    expect(Object.keys(mapRow(SHEET[0], MAP, DATA_HEADERS))).toEqual(DATA_HEADERS);
  });
});

describe("فحص الأمان بيمسك أي تلف", () => {
  it("بيمسك صف اتشال", () => {
    const bad = [...DATA.slice(0, 3), ...DATA.slice(4)];
    expect(verifyMerge(DATA, bad, 3, 0).ok).toBe(false);
  });

  it("بيمسك صف اتغيّر", () => {
    const bad = [...DATA];
    bad[1] = row("مغيّر", "1المروة");
    expect(verifyMerge(DATA, bad, 5, 0).ok).toBe(false);
  });

  it("بيعدّي الدمج السليم", () => {
    const r = mergeIntoData(DATA, [{ "اللوحة": "x", "النوع": "", "الحي": "y" }],
      [{ source: "اللوحة", target: "رقم اللوحة" }], DATA_HEADERS, 2);
    expect(verifyMerge(DATA, r.rows, r.insertedAt, r.addedCount).ok).toBe(true);
  });
});

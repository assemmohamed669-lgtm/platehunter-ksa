import { describe, it, expect } from "vitest";
import {
  resolveResultColumns,
  resolveMergedResultColumns,
  looksLikeColor,
  looksLikeYear,
  looksLikeVehicleType,
} from "@/lib/resultColumns";

describe("resultColumns — كاشفات المحتوى", () => {
  it("looksLikeColor", () => {
    expect(looksLikeColor("أبيض")).toBe(true);
    expect(looksLikeColor("فضي")).toBe(true);
    expect(looksLikeColor("White")).toBe(true);
    expect(looksLikeColor("تويوتا")).toBe(false);
    expect(looksLikeColor("2020")).toBe(false);
  });
  it("looksLikeYear", () => {
    expect(looksLikeYear("2020")).toBe(true);
    expect(looksLikeYear("٢٠١٥")).toBe(true);
    expect(looksLikeYear("1995")).toBe(true);
    expect(looksLikeYear("1234")).toBe(false); // لوحة مش سنة
    expect(looksLikeYear("أبيض")).toBe(false);
  });
  it("looksLikeVehicleType", () => {
    expect(looksLikeVehicleType("ونيت")).toBe(true);
    expect(looksLikeVehicleType("صالون")).toBe(true);
    expect(looksLikeVehicleType("تويوتا")).toBe(false);
  });
});

describe("resultColumns — تحليل بالاسم", () => {
  it("أعمدة بأسماء معروفة تتحلّل بالترتيب الثابت", () => {
    const headers = ["رقم اللوحة", "صانع المركبة", "النوع", "الحي", "GPS", "اللون", "سنة الصنع", "تاريخ التسجيل"];
    const rows = [{ "رقم اللوحة": "دحر1234", "صانع المركبة": "تويوتا", "النوع": "صالون", "الحي": "العليا", "GPS": "x", "اللون": "أبيض", "سنة الصنع": "2020", "تاريخ التسجيل": "15/05/2024" }];
    const res = resolveResultColumns(headers, rows, "رقم اللوحة");
    // الترتيب الثابت: نوع، ماركة، حي، GPS، لون، سنة، تاريخ. «الحي» بقى هدف مستقل
    // (فيه عمود «الحي» مش «العنوان»)، فبيتحل كـ district مش address.
    expect(res.map((c) => c.key)).toEqual(["type", "brand", "district", "gps", "color", "year", "date"]);
    expect(res.find((c) => c.key === "brand")?.sourceCol).toBe("صانع المركبة");
    expect(res.find((c) => c.key === "type")?.sourceCol).toBe("النوع");
    expect(res.find((c) => c.key === "year")?.sourceCol).toBe("سنة الصنع");
  });

  it("العنوان والحي يظهروا الاتنين كعمودين منفصلين (شيت المندوب)", () => {
    // شيت داتا فيه عمود «العنوان» وعمود «الحي» — قبل الإصلاح الحي كان بيضيع لأنه
    // مدموج في مرادفات «العنوان»؛ دلوقتي الاتنين يظهروا.
    const headers = ["اللوحه", "النوع", "العنوان", "الحي", "التاريخ", "الرابط", "المندوب"];
    const rows = [
      { "اللوحه": "ررط1391", "النوع": "", "العنوان": "1خلج", "الحي": "الخليج", "التاريخ": "10/25/2025", "الرابط": "", "المندوب": "نادي" },
      { "اللوحه": "سبم2586", "النوع": "امام فندق", "العنوان": "1خلج", "الحي": "الخليج", "التاريخ": "10/25/2025", "الرابط": "", "المندوب": "نادي" },
    ];
    const res = resolveResultColumns(headers, rows, "اللوحه");
    expect(res.find((c) => c.key === "address")?.sourceCol).toBe("العنوان");
    expect(res.find((c) => c.key === "district")?.sourceCol).toBe("الحي"); // الحي بيظهر
  });
});

describe("resultColumns — تحليل بالمحتوى (أسماء مختلفة/غايبة)", () => {
  it("أعمدة بأسماء مبهمة تتحلّل بمحتواها", () => {
    // أسماء غير معروفة تماماً → لازم يتحدد بالقيم
    const headers = ["عمود A", "عمود B", "عمود C", "عمود D"];
    const rows = [
      { "عمود A": "نيسان", "عمود B": "أسود", "عمود C": "2019", "عمود D": "01/02/2023" },
      { "عمود A": "هيونداي", "عمود B": "فضي", "عمود C": "2021", "عمود D": "03/04/2023" },
      { "عمود A": "كيا", "عمود B": "أبيض", "عمود C": "2018", "عمود D": "05/06/2023" },
    ];
    const res = resolveResultColumns(headers, rows, null);
    const byKey = Object.fromEntries(res.map((c) => [c.key, c.sourceCol]));
    expect(byKey["brand"]).toBe("عمود A");
    expect(byKey["color"]).toBe("عمود B");
    expect(byKey["year"]).toBe("عمود C");
    expect(byKey["date"]).toBe("عمود D");
    // الترتيب الثابت محفوظ (brand قبل color قبل year قبل date)
    expect(res.map((c) => c.key)).toEqual(["brand", "color", "year", "date"]);
  });

  it("عمود «موديل» بأسماء موديلات مايتحسبش «سنة الصنع» (مراجعة عدائية)", () => {
    // ماركة منفصلة + عمود «موديل» قيمه أسماء موديلات → «موديل» ماينفعش year
    const headers = ["رقم اللوحة", "الماركة", "موديل"];
    const rows = [
      { "رقم اللوحة": "دحر1234", "الماركة": "تويوتا", "موديل": "كامري" },
      { "رقم اللوحة": "دحر5678", "الماركة": "نيسان", "موديل": "صني" },
      { "رقم اللوحة": "دحر9012", "الماركة": "هيونداي", "موديل": "النترا" },
    ];
    const res = resolveResultColumns(headers, rows, "رقم اللوحة");
    expect(res.find((c) => c.key === "brand")?.sourceCol).toBe("الماركة");
    expect(res.find((c) => c.key === "year")).toBeUndefined(); // «موديل» مااتحسبش سنة
  });

  it("عمود «الموديل» بأرقام سنين يتحسب «سنة الصنع» (بالمحتوى)", () => {
    // الملفات الحقيقية بتكتب سنة الصنع «الموديل» (بأل) — والمحتوى بيحسمها سنة.
    const headers = ["رقم اللوحة", "الموديل"];
    const rows = [
      { "رقم اللوحة": "دحر1234", "الموديل": "2020" },
      { "رقم اللوحة": "دحر5678", "الموديل": "2019" },
      { "رقم اللوحة": "دحر9012", "الموديل": "2021" },
    ];
    const res = resolveResultColumns(headers, rows, "رقم اللوحة");
    expect(res.find((c) => c.key === "year")?.sourceCol).toBe("الموديل");
  });

  it("مايكررش عمود مصدر لهدفين", () => {
    const headers = ["A", "B"];
    const rows = [{ A: "أبيض", B: "2020" }, { A: "أسود", B: "2019" }, { A: "فضي", B: "2021" }];
    const res = resolveResultColumns(headers, rows, null);
    const srcs = res.map((c) => c.sourceCol);
    expect(new Set(srcs).size).toBe(srcs.length); // مفيش تكرار
  });
});

describe("محافظ البنوك — الطراز والماركة يظهروا الاتنين (فصل الصانع عن الطراز)", () => {
  const r = (headers: string[], rows: Record<string, string>[], plate: string) => {
    const res = resolveResultColumns(headers, rows, plate);
    return Object.fromEntries(res.map((c) => [c.key, c.sourceCol]));
  };

  it("AL_Repo: صانع المركبة + طراز المركبة → ماركة + نوع (الطراز مايختفيش)", () => {
    const by = r(
      ["رقم اللوحة", "صانع المركبة", "طراز المركبة", "سنة الصنع", "لون المركبة الأساسي"],
      [
        { "رقم اللوحة": "ح ك ب 8823", "صانع المركبة": "شيفورلية", "طراز المركبة": "ماليبو", "سنة الصنع": "2015", "لون المركبة الأساسي": "بني" },
        { "رقم اللوحة": "ح ك ب 8824", "صانع المركبة": "تويوتا", "طراز المركبة": "كامري", "سنة الصنع": "2018", "لون المركبة الأساسي": "ابيض" },
        { "رقم اللوحة": "ح ك ب 8825", "صانع المركبة": "نيسان", "طراز المركبة": "صني", "سنة الصنع": "2019", "لون المركبة الأساسي": "اسود" },
      ],
      "رقم اللوحة",
    );
    expect(by.type).toBe("طراز المركبة");   // النوع = الطراز (ماليبو) — ده اللي كان بيختفي
    expect(by.brand).toBe("صانع المركبة");   // الماركة = الصانع (شيفورلية)
    expect(by.year).toBe("سنة الصنع");
    expect(by.color).toBe("لون المركبة الأساسي");
  });

  it("عدم نقل ملكية: الماركة + الطراز (بكب غمارتين) → الاتنين يظهروا", () => {
    const by = r(
      ["رقم اللوحة", "الماركة", "الطراز", "سنة الصنع", "اللون"],
      [
        { "رقم اللوحة": "ب ح ك 9266", "الماركة": "تويوتا", "الطراز": "بكب غمارتين", "سنة الصنع": "2016", "اللون": "ابيض" },
        { "رقم اللوحة": "ب ح ك 9267", "الماركة": "نيسان", "الطراز": "باترول", "سنة الصنع": "2017", "اللون": "اسود" },
        { "رقم اللوحة": "ب ح ك 9268", "الماركة": "هيونداي", "الطراز": "سوناتا", "سنة الصنع": "2019", "اللون": "فضي" },
      ],
      "رقم اللوحة",
    );
    expect(by.type).toBe("الطراز");
    expect(by.brand).toBe("الماركة");
    expect(by.color).toBe("اللون");
    expect(by.year).toBe("سنة الصنع");
  });

  it("بنك الإمارات: Brand + Car Type + Year + COLOR", () => {
    const by = r(
      ["PLATE#", "Brand", "Car Type", "Year", "COLOR"],
      [
        { "PLATE#": "ح ه ه 9482", "Brand": "دودج", "Car Type": "شارجر سيدان", "Year": "2016", "COLOR": "ازرق" },
        { "PLATE#": "ح ك ه 5864", "Brand": "متسوبيشي", "Car Type": "باجيرو", "Year": "2015", "COLOR": "رصاصي" },
        { "PLATE#": "ح د ي 9075", "Brand": "تويوتا", "Car Type": "راف فور", "Year": "2014", "COLOR": "ابيض" },
      ],
      "PLATE#",
    );
    expect(by.type).toBe("Car Type");
    expect(by.brand).toBe("Brand");
    expect(by.year).toBe("Year");
    expect(by.color).toBe("COLOR");
  });

  it("البيت الاهلي: الشركة (ماركة) + النوع (موديل) + الموديل=سنة بالمحتوى", () => {
    const by = r(
      ["اللوحة", "الشركة", "النوع", "اللون", "الموديل"],
      [
        { "اللوحة": "ر ا ن 6253", "الشركة": "HYUNDAI", "النوع": "Sonata", "اللون": "Grey", "الموديل": "2022" },
        { "اللوحة": "ر ا ن 6254", "الشركة": "TOYOTA", "النوع": "Camry", "اللون": "White", "الموديل": "2021" },
        { "اللوحة": "ر ا ن 6255", "الشركة": "KIA", "النوع": "Cerato", "اللون": "Black", "الموديل": "2020" },
      ],
      "اللوحة",
    );
    expect(by.brand).toBe("الشركة");     // الماركة (الشركة)
    expect(by.type).toBe("النوع");        // النوع/الموديل (Sonata)
    expect(by.color).toBe("اللون");
    expect(by.year).toBe("الموديل");      // «الموديل» = سنة (بالمحتوى 2022)
  });

  it("مصرف الانماء: طراز المركبة بس (موديل بدون صانع) → يظهر كنوع", () => {
    const by = r(
      ["لوحة المركبة", "طراز المركبة", "رقم الهيكل"],
      [
        { "لوحة المركبة": "ر ل د 5745", "طراز المركبة": "SUNNY", "رقم الهيكل": "3N1CN8ADXPL824" },
        { "لوحة المركبة": "ر ل د 5746", "طراز المركبة": "COROLLA", "رقم الهيكل": "XXXXXX" },
        { "لوحة المركبة": "ر ل د 5747", "طراز المركبة": "YARIS", "رقم الهيكل": "YYYYYY" },
      ],
      "لوحة المركبة",
    );
    expect(by.type).toBe("طراز المركبة");
    expect(by.brand).toBeUndefined();
  });
});

describe("resolveMergedResultColumns — دمج مصادر متعددة (إحالة إضافية)", () => {
  it("أعمدة الإحالة الإضافية تظهر لو مش موجودة في الداتا/الأساسية", () => {
    // الداتا فيها الحي بس؛ الإحالة الإضافية فيها اللون والسنة
    const data = {
      kind: "data" as const,
      headers: ["رقم اللوحة", "الحي"],
      rows: [{ "رقم اللوحة": "دحر1234", "الحي": "العليا" }],
      plateCol: "رقم اللوحة",
    };
    const extra = {
      kind: "referral" as const,
      headers: ["رقم اللوحة", "اللون", "سنة الصنع"],
      rows: [
        { "رقم اللوحة": "دحر1234", "اللون": "أبيض", "سنة الصنع": "2022" },
        { "رقم اللوحة": "دحر5678", "اللون": "أسود", "سنة الصنع": "2020" },
        { "رقم اللوحة": "دحر9012", "اللون": "فضي", "سنة الصنع": "2019" },
      ],
      plateCol: "رقم اللوحة",
    };
    const res = resolveMergedResultColumns([data, extra]);
    const byKey = Object.fromEntries(res.map((c) => [c.key, c]));
    expect(byKey["district"]?.source).toBe("data"); // «الحي» → هدف district مستقل
    // اللون والسنة من الإحالة الإضافية — كانوا بيضيعوا قبل الإصلاح
    expect(byKey["color"]?.sourceCol).toBe("اللون");
    expect(byKey["color"]?.source).toBe("referral");
    expect(byKey["year"]?.sourceCol).toBe("سنة الصنع");
    expect(byKey["year"]?.source).toBe("referral");
  });

  it("نفس الهدف في الداتا والمحفظة → عمودين منفصلين (الداتا + المحفظة)", () => {
    // الداتا عندها «نوع السيارة» (فاضية) والمحفظة عندها Type of car — الاتنين يظهروا
    const data = {
      kind: "data" as const,
      headers: ["رقم اللوحة", "نوع السيارة"],
      rows: [{ "رقم اللوحة": "دحر1234", "نوع السيارة": "" }, { "رقم اللوحة": "دحر5", "نوع السيارة": "" }, { "رقم اللوحة": "دحر6", "نوع السيارة": "ملاكي" }],
      plateCol: "رقم اللوحة",
    };
    const bank = {
      kind: "referral" as const,
      headers: ["رقم اللوحة", "Type of car"],
      rows: [{ "رقم اللوحة": "دحر1234", "Type of car": "صالون" }, { "رقم اللوحة": "دحر5", "Type of car": "ونيت" }, { "رقم اللوحة": "دحر6", "Type of car": "صالون" }],
      plateCol: "رقم اللوحة",
    };
    const res = resolveMergedResultColumns([data, bank]);
    const typeCols = res.filter((c) => c.key === "type");
    expect(typeCols).toHaveLength(2); // عمودين مش واحد
    // الأول من الداتا بالاسم الثابت
    expect(typeCols[0].source).toBe("data");
    expect(typeCols[0].label).toBe("نوع السيارة");
    expect(typeCols[0].sourceCol).toBe("نوع السيارة");
    // التاني من المحفظة، متسمّى بوضوح
    expect(typeCols[1].source).toBe("referral");
    expect(typeCols[1].label).toBe("نوع السيارة (المحفظة)");
    expect(typeCols[1].sourceCol).toBe("Type of car");
    // مُعرّفات فريدة (للـ React key)
    expect(new Set(res.map((c) => c.id)).size).toBe(res.length);
  });

  it("عنوان المحفظة (الإحالة) مايظهرش تلقائياً — بس عنوان الداتا يظهر", () => {
    // الداتا فيها «العنوان» (موقع ميداني) والمحفظة فيها «العنوان» (مدينة البنك).
    // المتوقع: عمود عنوان واحد بس من الداتا؛ عنوان المحفظة مستبعد من النتيجة.
    const data = {
      kind: "data" as const,
      headers: ["رقم اللوحة", "العنوان"],
      rows: [{ "رقم اللوحة": "دحر1234", "العنوان": "خلج 1" }, { "رقم اللوحة": "دحر5", "العنوان": "خلج 2" }],
      plateCol: "رقم اللوحة",
    };
    const bank = {
      kind: "referral" as const,
      headers: ["رقم اللوحة", "العنوان"],
      rows: [{ "رقم اللوحة": "دحر1234", "العنوان": "RIYADH" }, { "رقم اللوحة": "دحر5", "العنوان": "JEDDAH" }],
      plateCol: "رقم اللوحة",
    };
    const res = resolveMergedResultColumns([data, bank]);
    const addrCols = res.filter((c) => c.key === "address");
    expect(addrCols).toHaveLength(1);              // عمود عنوان واحد بس
    expect(addrCols[0].source).toBe("data");       // من الداتا
    expect(addrCols[0].label).toBe("العنوان");
    // مفيش «العنوان (المحفظة)» في النتيجة
    expect(res.some((c) => c.label.includes("العنوان (المحفظة)"))).toBe(false);
  });

  it("تاريخ التسجيل (المحفظة) مايظهرش — بس تاريخ الداتا", () => {
    const data = {
      kind: "data" as const,
      headers: ["رقم اللوحة", "تاريخ التسجيل"],
      rows: [{ "رقم اللوحة": "دحر1234", "تاريخ التسجيل": "10/25/2025" }, { "رقم اللوحة": "دحر5", "تاريخ التسجيل": "10/26/2025" }],
      plateCol: "رقم اللوحة",
    };
    const bank = {
      kind: "referral" as const,
      headers: ["رقم اللوحة", "تاريخ التسجيل"],
      rows: [{ "رقم اللوحة": "دحر1234", "تاريخ التسجيل": "01/01/2020" }, { "رقم اللوحة": "دحر5", "تاريخ التسجيل": "02/02/2020" }],
      plateCol: "رقم اللوحة",
    };
    const res = resolveMergedResultColumns([data, bank]);
    const dateCols = res.filter((c) => c.key === "date");
    expect(dateCols).toHaveLength(1);              // عمود تاريخ واحد بس
    expect(dateCols[0].source).toBe("data");       // من الداتا
    expect(res.some((c) => c.label.includes("تاريخ التسجيل (المحفظة)"))).toBe(false);
  });
});

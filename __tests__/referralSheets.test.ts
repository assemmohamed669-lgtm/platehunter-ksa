import { describe, it, expect } from "vitest";
import { isPlateLike, analyzeSheet, analyzeWorkbook, totalPlates, defaultSelection, type SheetInfo } from "@/lib/referralSheets";

describe("isPlateLike — شكل اللوحة السعودية", () => {
  it("اللوحة العادية (٣ حروف + ٤ أرقام)", () => {
    expect(isPlateLike("ح ب م 2870")).toBe(true);
    expect(isPlateLike("حبم2870")).toBe(true);
  });

  it("اللوحات القديمة الأقصر (٢-٣ أرقام) — كانت بتتفوّت", () => {
    expect(isPlateLike("ه ب ق 73")).toBe(true);   // رقمين
    expect(isPlateLike("ل س ب 369")).toBe(true);  // ٣ أرقام
  });

  it("بيرفض العناوين والأرقام المجرّدة", () => {
    expect(isPlateLike("رقم اللوحة")).toBe(false);
    expect(isPlateLike("لوحة السيارة")).toBe(false);
    expect(isPlateLike("1798834")).toBe(false);          // رقم عقد مش لوحة
    expect(isPlateLike("الرقم المرجعي  1720520612300")).toBe(false);
    expect(isPlateLike("")).toBe(false);
    expect(isPlateLike(null)).toBe(false);
  });

  it("بيرفض رقم الهيكل (طويل ومخلوط)", () => {
    expect(isPlateLike("VF1LZLET9EC271750")).toBe(false);
    expect(isPlateLike("MDHBN7AD6FG701971")).toBe(false);
  });
});

describe("analyzeSheet — كشف الهيدر وعمود اللوحة", () => {
  it("هيدر في أول صف", () => {
    const aoa = [
      ["م", "رقم اللوحة", "الماركة"],
      ["1", "ح ب م 2870", "رينو"],
      ["2", "ح ط س 6465", "نيسان"],
    ];
    const s = analyzeSheet("ورقة", aoa);
    expect(s.headerRow).toBe(0);
    expect(s.plateCol).toBe(1);
    expect(s.plateColName).toBe("رقم اللوحة");
    expect(s.plateCount).toBe(2);
  });

  it("هيدر بعد صفوف عناوين (زي ملفات الشركات)", () => {
    const aoa = [
      ["بيان بالسيارات المباعة  2026/08/02", "", ""],
      ["", "", ""],
      ["م", "رقم اللوحة", "الماركة"],
      ["1", "ح ب م 2870", "رينو"],
      ["2", "ح ط س 6465", "نيسان"],
    ];
    const s = analyzeSheet("مباعة", aoa);
    expect(s.headerRow).toBe(2);
    expect(s.plateColName).toBe("رقم اللوحة");
    expect(s.plateCount).toBe(2);
  });

  it("هيدر بعيد جداً (صف ١١ زي vehicle_list)", () => {
    const aoa: unknown[][] = [
      ["الرقم المرجعي  1720520612300"], ["تاريخ الإصدار  2024-07-09"],
      ["رقم العميل  7001445977"], ["رقم العميل  شركة الفلاح"],
      [""], [""], [""], [""], [""], [""],
      ["عدد المركبات في التقرير  1380"],
      ["رقم اللوحة", "نوع التسجيل"],
      ["د أ أ 9085", "خاص"],
      ["و ح ق 819", "خاص"],
    ];
    const s = analyzeSheet("vehicle_list", aoa);
    expect(s.headerRow).toBe(11);
    expect(s.plateColName).toBe("رقم اللوحة");
    expect(s.plateCount).toBe(2);
  });

  it("اسم عمود مختلف («لوحة السيارة»)", () => {
    const aoa = [
      ["م", "السيارة", "لوحة السيارة", "الموديل"],
      ["1", "مازدا 323", "ل ر د 0884", "2004"],
    ];
    const s = analyzeSheet("مسروقة", aoa);
    expect(s.plateCol).toBe(2);
    expect(s.plateColName).toBe("لوحة السيارة");
  });

  it("عمود اللوحة بعيد في النص (عمود K)", () => {
    const head = ["م", "اسم العميل", "الأحوال", "جوال", "رقم العقد", "ع.الالكتروني", "س.تجاري", "الفرع", "نوع السيارة", "الموديل", "رقم اللوحة"];
    const row = ["1", "فهد", "1095432157", "056", "5327", "-", "-", "المطار2", "اكسنت", "2017", "ح م أ 3986"];
    const s = analyzeSheet("قبل الاستحواذ", [head, row, row]);
    expect(s.plateCol).toBe(10);
    expect(s.plateColName).toBe("رقم اللوحة");
  });

  it("ورقة بدون هيدر خالص — الداتا من أول صف", () => {
    const aoa = [
      ["1", "د ي و 5073", "خاص", "هونداي"],
      ["2", "ب د م 7438", "نقل خاص", "هونداي"],
      ["3", "د ط ق 9039", "خاص", "هونداي"],
    ];
    const s = analyzeSheet("Sheet1", aoa);
    expect(s.headerRow).toBe(-1);
    expect(s.plateCol).toBe(1);
    expect(s.plateCount).toBe(3);
    // أسماء أعمدة مولّدة عشان الصفوف تبقى كائنات صالحة
    expect(s.headers.length).toBe(4);
    expect(s.headers[1]).toBeTruthy();
  });

  it("ورقة بدون لوحات → plateCol = -1 وعدد صفر", () => {
    const s = analyzeSheet("ملخص", [["البند", "القيمة"], ["إجمالي", "1380"]]);
    expect(s.plateCol).toBe(-1);
    expect(s.plateCount).toBe(0);
  });

  it("ورقة فاضية مابتكسرش", () => {
    const s = analyzeSheet("فاضية", []);
    expect(s.plateCount).toBe(0);
    expect(s.rows.length).toBe(0);
  });

  it("العدد بيشيل التكرار جوه الورقة", () => {
    const aoa = [
      ["رقم اللوحة"],
      ["ح ب م 2870"], ["ح ب م 2870"], ["أ ب ح 1234"],
    ];
    expect(analyzeSheet("و", aoa).plateCount).toBe(2);
  });

  it("الصفوف بترجع كائنات بمفاتيح الهيدر (جاهزة للفرز)", () => {
    const aoa = [
      ["عنوان", "", ""],
      ["م", "رقم اللوحة", "الماركة"],
      ["1", "ح ب م 2870", "رينو"],
    ];
    const s = analyzeSheet("و", aoa);
    expect(s.rows.length).toBe(1);
    expect(s.rows[0]["رقم اللوحة"]).toBe("ح ب م 2870");
    expect(s.rows[0]["الماركة"]).toBe("رينو");
  });
});

describe("totalPlates — إجمالي الورقات المختارة (بدون تكرار)", () => {
  const mk = (name: string, plates: string[]): SheetInfo =>
    analyzeSheet(name, [["رقم اللوحة"], ...plates.map((p) => [p])]);

  it("بيجمع الفريد عبر الورقات", () => {
    const a = mk("أ", ["ح ب م 2870", "ح ط س 6465"]);
    const b = mk("ب", ["ل ر د 0884"]);
    expect(totalPlates([a, b])).toBe(3);
  });

  it("اللوحة المكررة بين ورقتين بتتحسب مرة", () => {
    const a = mk("أ", ["ح ب م 2870", "ح ط س 6465"]);
    const b = mk("ب", ["ح ب م 2870"]);
    expect(totalPlates([a, b])).toBe(2);
  });

  it("بيوحّد شكل الكتابة (فراغات + أ/ا)", () => {
    const a = mk("أ", ["أ ب ح 1234"]);
    const b = mk("ب", ["ابح1234"]);
    expect(totalPlates([a, b])).toBe(1);
  });

  it("قائمة فاضية = صفر", () => {
    expect(totalPlates([])).toBe(0);
  });
});

// ملفات الشركات فيها عادةً ورقة ضخمة بكل أسطول الشركة (مرجع) + ورقات صغيرة
// بالمطلوبين فعلاً + ورقات خام بلا عنوان. الاختيار الافتراضي بيعلّم على
// المطلوبين بس، والمندوب يقدر يغيّر أي حاجة.
describe("defaultSelection — الاختيار التلقائي", () => {
  const sheet = (name: string, count: number, withHeader = true): SheetInfo =>
    analyzeSheet(name, [
      ...(withHeader ? [["رقم اللوحة"]] : []),
      ...Array.from({ length: count }, (_, i) => [`ابح${1000 + i}`]),
    ]);

  it("بيستبعد الورقة المهيمنة (أسطول الشركة كله)", () => {
    const sheets = [sheet("vehicle_list", 1380), sheet("مباعة", 35), sheet("مسروقة", 28)];
    const sel = defaultSelection(sheets);
    expect(sel.has("vehicle_list")).toBe(false);
    expect(sel.has("مباعة")).toBe(true);
    expect(sel.has("مسروقة")).toBe(true);
  });

  it("بيستبعد الورقة اللي بلا عنوان (نسخة خام)", () => {
    const sheets = [sheet("مباعة", 35), sheet("Sheet1", 69, false)];
    const sel = defaultSelection(sheets);
    expect(sel.has("Sheet1")).toBe(false);
    expect(sel.has("مباعة")).toBe(true);
  });

  it("الحالة الحقيقية: ٦ ورقات → الأربعة بس", () => {
    const sheets = [
      sheet("vehicle_list", 1380), sheet("سيارات مباعة", 35), sheet("سيارات مسروقة", 28),
      sheet("سيارات قبل الاستحواذ", 43), sheet("سيارات بعد الاستحواذ", 22), sheet("Sheet1", 69, false),
    ];
    expect([...defaultSelection(sheets)].sort()).toEqual(
      ["سيارات بعد الاستحواذ", "سيارات قبل الاستحواذ", "سيارات مباعة", "سيارات مسروقة"].sort()
    );
  });

  it("ورقات متقاربة الحجم → بيعلّم عليها كلها (مفيش مهيمنة)", () => {
    const sheets = [sheet("أ", 40), sheet("ب", 35), sheet("ج", 30)];
    expect(defaultSelection(sheets).size).toBe(3);
  });

  it("ورقة واحدة بس → متعلّمة", () => {
    expect(defaultSelection([sheet("أ", 40)]).size).toBe(1);
  });

  it("لو الاستبعاد هيفضّي الاختيار → بيعلّم على الكل (مانسيبوش بلا اختيار)", () => {
    const sheets = [sheet("كبيرة", 1000), sheet("Sheet1", 5, false)];
    expect(defaultSelection(sheets).size).toBeGreaterThan(0);
  });

  it("بيتجاهل الورقات اللي مفيهاش لوحات", () => {
    const sheets = [sheet("مباعة", 35), analyzeSheet("ملخص", [["البند"], ["إجمالي"]])];
    const sel = defaultSelection(sheets);
    expect(sel.has("ملخص")).toBe(false);
    expect(sel.has("مباعة")).toBe(true);
  });
});

/**
 * محافظ بتيجي فيها **ورقة مخفية** (state="hidden" في الإكسيل) — زي «تحديث محفظة
 * التيسير ١٢-٨»: ورقة مخفية اسمها Sheet1 + ورقة ظاهرة اسمها «محفظة».
 *
 * البرنامج كان بيعلّم على الاتنين، فنتيجة الفرز بتطلع مخلوطة. المفروض يعلّم
 * تلقائياً على **الظاهرة بس** — والمخفية تفضل معروضة في الاختيار عشان المندوب
 * يعلّم عليها بإيده لو محتاج.
 */
describe("الورقات المخفية — مابتتعلّمش تلقائياً", () => {
  const sheet = (name: string, plates: string[], hidden = false) => ({
    name, hidden,
    aoa: [["رقم اللوحة"], ...plates.map((p) => [p])],
  });

  it("الورقة المخفية مابتتعلّمش والظاهرة بتتعلّم", () => {
    const infos = analyzeWorkbook([
      sheet("Sheet1", ["ابح1234", "دنر5678"], true),
      sheet("محفظة", ["رلد6202", "سسس9999"]),
    ]);
    const sel = defaultSelection(infos);
    expect(sel.has("محفظة")).toBe(true);
    expect(sel.has("Sheet1")).toBe(false);
  });

  it("المخفية بتفضل ظاهرة في قائمة الاختيار (المندوب يعلّم عليها لو حب)", () => {
    const infos = analyzeWorkbook([
      sheet("Sheet1", ["ابح1234"], true),
      sheet("محفظة", ["رلد6202"]),
    ]);
    expect(infos.map((s) => s.name)).toEqual(["Sheet1", "محفظة"]);
    expect(infos.find((s) => s.name === "Sheet1")?.hidden).toBe(true);
    expect(infos.find((s) => s.name === "محفظة")?.hidden).toBe(false);
  });

  it("كل الورقات مخفية → بنعلّم عليها برضه (مانسيبش المندوب بلا نتيجة)", () => {
    const infos = analyzeWorkbook([
      sheet("أ", ["ابح1234"], true),
      sheet("ب", ["رلد6202"], true),
    ]);
    expect(defaultSelection(infos).size).toBeGreaterThan(0);
  });

  it("مفيش ورقات مخفية → السلوك القديم زي ما هو", () => {
    const infos = analyzeWorkbook([
      sheet("أ", ["ابح1234"]),
      sheet("ب", ["رلد6202"]),
    ]);
    expect(defaultSelection(infos).size).toBe(2);
    expect(infos.every((s) => s.hidden === false)).toBe(true);
  });

  it("الملفات القديمة (بلا معلومة إخفاء) بتتعامل كأنها ظاهرة", () => {
    const infos = analyzeWorkbook([
      { name: "أ", aoa: [["رقم اللوحة"], ["ابح1234"]] },
    ]);
    expect(infos[0].hidden).toBe(false);
    expect(defaultSelection(infos).has("أ")).toBe(true);
  });
});

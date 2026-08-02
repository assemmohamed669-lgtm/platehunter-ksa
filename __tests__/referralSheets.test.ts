import { describe, it, expect } from "vitest";
import { isPlateLike, analyzeSheet, totalPlates, type SheetInfo } from "@/lib/referralSheets";

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

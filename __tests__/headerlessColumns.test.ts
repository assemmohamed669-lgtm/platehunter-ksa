import { describe, it, expect } from "vitest";
import {
  detectHeaderless,
  buildHeaderlessColumns,
  looksLikePlate,
  looksLikeDate,
  looksLikeDistrict,
  looksLikeGps,
  looksLikeHeaderKeyword,
  columnLetter,
} from "@/lib/headerlessColumns";
import { guessDefaultColumns } from "@/lib/sortingCols";

describe("headerlessColumns — كشف الشيت بدون عناوين", () => {
  // صف من شيت المندوب الحقيقي (صورة): A=لوحة، C=كود، D=حي، E=تاريخ
  it("صف داتا حقيقي (لوحة/كود/حي/تاريخ) يتكشف بدون عناوين", () => {
    expect(detectHeaderless(["دطط2804", "", "82ع", "حي العليا", "5/15/2024"])).toBe(true);
  });

  it("صف عناوين حقيقي (فيه أسماء معروفة) مايتكشفش بدون عناوين", () => {
    expect(detectHeaderless(["رقم اللوحة", "طراز المركبة", "الحي", "التاريخ"])).toBe(false);
    expect(detectHeaderless(["Plate Number", "Vehicle Name", "Year Model"])).toBe(false);
  });

  it("عناوين نصية مخصّصة (بدون كلمات مفتاحية وبدون شكل داتا) تفضل عناوين", () => {
    expect(detectHeaderless(["كود", "الوصف", "ملاحظة"])).toBe(false);
  });

  it("«حي العليا» قيمة مش عنوان — مش كلمة مفتاحية", () => {
    expect(looksLikeHeaderKeyword("حي العليا")).toBe(false);
    expect(looksLikeHeaderKeyword("الحي")).toBe(true);
  });
});

describe("headerlessColumns — كاشفات المحتوى", () => {
  it("looksLikePlate", () => {
    expect(looksLikePlate("دطط2804")).toBe(true);
    expect(looksLikePlate("حوص7941")).toBe(true);
    expect(looksLikePlate("82ع")).toBe(false);
    expect(looksLikePlate("حي العليا")).toBe(false);
  });
  it("looksLikeDate", () => {
    expect(looksLikeDate("5/15/2024")).toBe(true);
    expect(looksLikeDate("15/05/2024")).toBe(true);
    expect(looksLikeDate("2024-05-15")).toBe(true);
    expect(looksLikeDate("دطط2804")).toBe(false);
  });
  it("looksLikeDistrict", () => {
    expect(looksLikeDistrict("حي العليا")).toBe(true);
    expect(looksLikeDistrict("الحي الصناعي")).toBe(true);
    expect(looksLikeDistrict("دطط2804")).toBe(false);
  });
  it("looksLikeGps", () => {
    expect(looksLikeGps("24.7136,46.6753")).toBe(true);
    expect(looksLikeGps("https://maps.google.com/?q=24.7,46.6")).toBe(true);
    expect(looksLikeGps("حي العليا")).toBe(false);
  });
  it("columnLetter", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(2)).toBe("C");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });
});

describe("headerlessColumns — تسمية الأعمدة بالمحتوى", () => {
  it("يسمّي أعمدة شيت المندوب صح (لوحة/تاريخ/حي) ويتجاهل الفاضي", () => {
    // 6 أعمدة: A=لوحة، B=فاضي/ن، C=كود، D=حي، E=تاريخ، F=فاضي
    const sample = [
      ["دطط2804", "", "82ع", "حي العليا", "15/05/2024", ""],
      ["رقص5026", "", "82ع", "حي العليا", "15/05/2024", ""],
      ["بهل2959", "ن", "82ع", "حي العليا", "15/05/2024", ""],
      ["حوص7941", "", "83ع", "حي العليا", "15/05/2024", ""],
    ];
    const cols = buildHeaderlessColumns(sample, 6);
    const byCol = Object.fromEntries(cols.map((c) => [c.col, c.name]));
    expect(byCol[0]).toBe("رقم اللوحة");
    expect(byCol[3]).toBe("الحي");
    expect(byCol[4]).toBe("التاريخ");
    expect(byCol[2]).toBe("عمود C");   // كود غير معروف → ترتيبي
    expect(byCol[1]).toBe("عمود B");   // «ن» نادرة → عمود ترتيبي (فيه داتا)
    expect(byCol[5]).toBeUndefined();  // F فاضي تماماً → اتشال
  });

  it("أسماء مكرّرة تاخد لاحقة رقمية", () => {
    const sample = [
      ["15/05/2024", "1/1/2023"],
      ["16/05/2024", "2/1/2023"],
    ];
    const cols = buildHeaderlessColumns(sample, 2);
    expect(cols.map((c) => c.name)).toEqual(["التاريخ", "التاريخ 2"]);
  });
});

// تكامل: بعد التسمية بالمحتوى، اختيار أعمدة الفرز لازم يظهر التاريخ والحي
describe("headerlessColumns — النتيجة النهائية في الفرز", () => {
  it("التاريخ والحي بيظهروا تلقائياً في guessDefaultColumns للشيت بدون عناوين", () => {
    const names = ["رقم اللوحة", "عمود B", "عمود C", "الحي", "التاريخ"];
    // اللوحة هي عمود الاستبعاد (plate col)
    const selected = guessDefaultColumns(names, "رقم اللوحة");
    expect(selected).toContain("التاريخ");
    expect(selected).toContain("الحي");
    expect(selected).not.toContain("رقم اللوحة");
  });
});

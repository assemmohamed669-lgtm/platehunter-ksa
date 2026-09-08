import { describe, it, expect } from "vitest";
import { STREET_KEY, withStreetName } from "@/lib/streetName";

/**
 * مربع «اسم الشارع» في التشييك اليدوي والصوتي: المندوب بيكتب اسم الشارع بإيده،
 * فيتحط على كل لوحة **من لحظة كتابته**. لما يغيّره، اللوحات الجديدة بس هي اللي
 * تاخد الاسم الجديد — اللي اتسجّل قبل كده بيفضل بالاسم القديم، لأن ده اللي
 * حصل فعلاً على الأرض.
 *
 * الختم بيتم **وقت إنشاء الصف** — مش قراءة لحظية وقت العرض — وده اللي بيخلّي
 * التغيير يمشي للأمام بس. والمربع الفاضي مابيكتبش حاجة خالص (مش نص فاضي ولا
 * شرطة) عشان العمود مايتلوّثش بقيم وهمية.
 */
describe("withStreetName — ختم اسم الشارع على الصف", () => {
  it("بيكتب الاسم على الصف", () => {
    expect(withStreetName({} as Record<string, string>, "شارع الملك فهد")).toEqual({ [STREET_KEY]: "شارع الملك فهد" });
  });

  it("مايلمسش باقي أعمدة الصف", () => {
    const row = { "النوع": "ونيت", "ملاحظات": "قدام المحطة" };
    expect(withStreetName(row, "شارع عمان")).toEqual({
      "النوع": "ونيت", "ملاحظات": "قدام المحطة", [STREET_KEY]: "شارع عمان",
    });
  });

  it("🔴 المربع فاضي → مايكتبش حاجة خالص (المفتاح مايتضافش)", () => {
    expect(withStreetName({ "النوع": "فان" }, "")).toEqual({ "النوع": "فان" });
    expect(withStreetName({} as Record<string, string>, "   ")).toEqual({});
    expect(Object.keys(withStreetName({} as Record<string, string>, ""))).not.toContain(STREET_KEY);
  });

  it("بيشيل الفراغات الزيادة", () => {
    expect(withStreetName({} as Record<string, string>, "  شارع النهدة  ")[STREET_KEY]).toBe("شارع النهدة");
  });

  it("الاسم الجديد بيكتب على القديم لو الصف جاي بواحد", () => {
    expect(withStreetName({ [STREET_KEY]: "قديم" }, "جديد")[STREET_KEY]).toBe("جديد");
  });

  it("المربع فاضي مايمسحش اسم متسجّل قبل كده على نفس الصف", () => {
    // الصف اتختم وقت إنشائه؛ لو المندوب فضّى المربع بعدين، اللي اتسجّل يفضل.
    expect(withStreetName({ [STREET_KEY]: "شارع عمان" }, "")).toEqual({ [STREET_KEY]: "شارع عمان" });
  });
});

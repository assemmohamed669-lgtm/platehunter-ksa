import { describe, it, expect } from "vitest";
import { splitByAgent, isMine } from "@/lib/draftByAgent";

/**
 * 🔴 المالك (٢٤ سبتمبر): «اللوحات بتاع كل مندوب تروح لاسمه… مش عايز أي غلط حتى لو صغير».
 * مسودّة Voice PRO واحدة للموبايل كله، واللوحات مابتتمسحش حتى بعد تسجيل الخروج ⇒ مندوب
 * تاني يدخل على نفس الموبايل كان بيشوف لوحات الأول **ويصدّرها باسمه**.
 */
const r = (id: string, agentId?: string) => ({ id, plate: "حبل1234", agentId });

describe("splitByAgent — كل مندوب يشوف لوحاته بس", () => {
  it("🔴 لوحات حساب تاني ⇒ مستخبية (مش ممسوحة)", () => {
    const { mine, others } = splitByAgent([r("a", "A"), r("b", "B"), r("c", "A")], "A");
    expect(mine.map((x) => x.id)).toEqual(["a", "c"]);
    expect(others.map((x) => x.id)).toEqual(["b"]);
  });
  it("لوحات قديمة من غير ختم (قبل التعديل) ⇒ زي ما كانت (بتظهر)", () => {
    const { mine, others } = splitByAgent([r("old"), r("b", "B")], "A");
    expect(mine.map((x) => x.id)).toEqual(["old"]);
    expect(others.map((x) => x.id)).toEqual(["b"]);
  });
  it("مفيش حساب معروف ⇒ مابنخبّيش حاجة (مابنعرفش مين صاحبها)", () => {
    const rows = [r("a", "A"), r("b", "B")];
    expect(splitByAgent(rows, null).mine).toEqual(rows);
    expect(splitByAgent(rows, null).others).toEqual([]);
  });
});

describe("isMine — حارس التصدير", () => {
  it("🔴 لوحة مختومة بحساب تاني ⇒ ماتتصدّرش بالحساب ده", () => {
    expect(isMine(r("b", "B"), "A")).toBe(false);
  });
  it("لوحته هو أو من غير ختم ⇒ تتصدّر", () => {
    expect(isMine(r("a", "A"), "A")).toBe(true);
    expect(isMine(r("old"), "A")).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { matchTokensAgainstRows, type TokenMatch } from "@/lib/plateParser";

/**
 * توثيق سلوك مطابقة «اللصق النصي» بالتفصيل — الاختبارات دي اتكتبت **قبل**
 * تسريع الدالة، عشان تثبت إن التسريع مغيّرش أي نتيجة يشوفها المندوب.
 *
 * القواعد اللي لازم تفضل زي ما هي:
 *   • لوحة ملصوقة موجودة → **كل** صفوف الداتا اللي فيها اللوحة دي.
 *   • لوحة مش موجودة → أقرب صف بنسبة تشابه ≥ الحد، وصف **واحد** بس (الأحسن).
 *   • لوحة ليها تطابق تام → مافيش fuzzy لها خالص.
 *   • داتا ضخمة (فوق ٥٠ ألف لوحة مختلفة) → الـ fuzzy بيتوقف (حماية من البطء).
 */

const R = (plate: string, extra: Record<string, string> = {}) => ({ "رقم اللوحة": plate, ...extra });
const COL = "رقم اللوحة";
const byToken = (r: TokenMatch[]) => r.map((m) => `${m.converted}:${m.status}:${m.dataIdx}`);

describe("مطابقة اللصق — السلوك المطلوب", () => {
  it("تطابق تام بيرجّع كل الصفوف اللي فيها نفس اللوحة", () => {
    const rows = [R("ا ب د 1234"), R("ن ك د 5678"), R("ابد1234"), R("سسس9999")];
    const out = matchTokensAgainstRows(["ابد1234"], rows, COL);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.dataIdx)).toEqual([0, 2]);
    expect(out.every((m) => m.status === "exact")).toBe(true);
  });

  it("اللوحة اللي ليها تطابق تام مابتاخدش fuzzy", () => {
    const rows = [R("ابد1234"), R("ابد1235")];
    const out = matchTokensAgainstRows(["ابد1234"], rows, COL);
    expect(out).toHaveLength(1);
    expect(out[0].dataIdx).toBe(0);
  });

  it("اللوحة المش موجودة بتاخد أقرب صف واحد بس", () => {
    const rows = [R("ابد1234"), R("ابد1236"), R("نكد5678")];
    const out = matchTokensAgainstRows(["ابد1235"], rows, COL, 80);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("fuzzy");
    expect(out[0].similarity).toBeGreaterThanOrEqual(80);
  });

  it("أقل من الحد → مافيش نتيجة خالص", () => {
    const rows = [R("ابد1234")];
    expect(matchTokensAgainstRows(["طسق9999"], rows, COL)).toHaveLength(0);
  });

  it("اللوحة البنكية بالإنجليزي بتتحوّل وتتطابق", () => {
    const rows = [R("ا ب د 1234")];
    const out = matchTokensAgainstRows(["ABD1234"], rows, COL);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("exact");
    expect(out[0].converted).toBe("ابد1234");
  });

  it("كذا لوحة ملصوقة — كل واحدة بنتيجتها", () => {
    const rows = [R("ابد1234"), R("نكد5678"), R("سسس9999")];
    const out = matchTokensAgainstRows(["ابد1234", "نكد5678"], rows, COL);
    expect(byToken(out).sort()).toEqual(["ابد1234:exact:0", "نكد5678:exact:1"].sort());
  });

  it("نفس اللوحة ملصوقة مرتين → بتطلع مرتين (المندوب لصقها مرتين)", () => {
    const rows = [R("ابد1234")];
    const out = matchTokensAgainstRows(["ابد1234", "ابد1234"], rows, COL);
    expect(out).toHaveLength(2);
  });

  it("الصف الراجع هو صف الداتا الأصلي بكل أعمدته", () => {
    const rows = [R("ابد1234", { "الحي": "الواحة", "GPS": "x" })];
    const out = matchTokensAgainstRows(["ابد1234"], rows, COL);
    expect(out[0].row).toBe(rows[0]);
    expect(out[0].row["الحي"]).toBe("الواحة");
  });

  it("dataIdx = موقع الصف في الداتا (مهم لترتيب النتيجة)", () => {
    const rows = [R("سسس1111"), R("سسس2222"), R("ابد1234")];
    expect(matchTokensAgainstRows(["ابد1234"], rows, COL)[0].dataIdx).toBe(2);
  });

  it("خانة لوحة فاضية بتتخطّى من غير كراش", () => {
    const rows = [R(""), R("ابد1234"), { } as Record<string, string>];
    const out = matchTokensAgainstRows(["ابد1234"], rows, COL);
    expect(out).toHaveLength(1);
    expect(out[0].dataIdx).toBe(1);
  });

  it("توكن فاضي أو مالوش معنى بيتجاهل", () => {
    expect(matchTokensAgainstRows(["", "   ", "؟؟"], [R("ابد1234")], COL)).toHaveLength(0);
  });

  it("قائمة داتا فاضية → مافيش نتايج", () => {
    expect(matchTokensAgainstRows(["ابد1234"], [], COL)).toHaveLength(0);
  });

  it("أفضل تشابه هو اللي بيكسب لما فيه أكتر من مرشّح", () => {
    // ابد1235 أقرب لـ ابد1234 (فرق رقم) من ابد9999
    const rows = [R("ابد9999"), R("ابد1234")];
    const out = matchTokensAgainstRows(["ابد1235"], rows, COL, 70);
    expect(out).toHaveLength(1);
    expect(out[0].dataIdx).toBe(1);
  });

  it("الـfuzzy بيتوقف على داتا ضخمة (حماية من البطء)", () => {
    // أكتر من ٥٠ ألف لوحة مختلفة → التقريبي بيتوقف، التام بيفضل شغّال
    const rows: Record<string, string>[] = [];
    for (let i = 0; i < 50_050; i++) rows.push(R(`ابد${i}`));
    const fuzzyOnly = matchTokensAgainstRows(["زطظ12345"], rows, COL, 50);
    expect(fuzzyOnly).toHaveLength(0);
    const exact = matchTokensAgainstRows(["ابد77"], rows, COL);
    expect(exact).toHaveLength(1);
    expect(exact[0].status).toBe("exact");
  });
});

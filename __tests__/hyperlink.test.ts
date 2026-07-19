import { describe, it, expect } from "vitest";
import { hyperlinkFormulaUrl, resolveHyperlinkCells } from "@/lib/hyperlink";

describe("hyperlinkFormulaUrl — استخراج الرابط من صيغة HYPERLINK", () => {
  it("يستخرج الرابط من صيغة HYPERLINK عادية", () => {
    expect(hyperlinkFormulaUrl('HYPERLINK("https://goo.gl/maps/abc","خريطة")')).toBe("https://goo.gl/maps/abc");
  });
  it("يتعامل مع علامة = ومسافات وحروف كبيرة/صغيرة", () => {
    expect(hyperlinkFormulaUrl('=HYPERLINK( "https://maps.app.goo.gl/xyz" , "خريطة" )')).toBe("https://maps.app.goo.gl/xyz");
    expect(hyperlinkFormulaUrl('hyperlink("http://x.com","y")')).toBe("http://x.com");
  });
  it("يرجّع null لصيغة تانية أو فاضي", () => {
    expect(hyperlinkFormulaUrl("SUM(A1:A2)")).toBeNull();
    expect(hyperlinkFormulaUrl(undefined)).toBeNull();
    expect(hyperlinkFormulaUrl("")).toBeNull();
  });
});

describe("resolveHyperlinkCells — تحويل خلايا HYPERLINK لقيمة الرابط", () => {
  it("خلية صيغة HYPERLINK → قيمتها تبقى الرابط", () => {
    const ws: Record<string, unknown> = {
      "!ref": "A1:A1",
      A1: { t: "s", v: "خريطة", f: 'HYPERLINK("https://goo.gl/maps/q","خريطة")' },
    };
    resolveHyperlinkCells(ws);
    expect((ws.A1 as { v: string }).v).toBe("https://goo.gl/maps/q");
    expect((ws.A1 as { f?: string }).f).toBeUndefined();
  });
  it("خلية hyperlink حقيقي (l.Target) → قيمتها تبقى الرابط", () => {
    const ws: Record<string, unknown> = {
      "!ref": "A1:A1",
      A1: { t: "s", v: "خريطة", l: { Target: "https://maps.app.goo.gl/z" } },
    };
    resolveHyperlinkCells(ws);
    expect((ws.A1 as { v: string }).v).toBe("https://maps.app.goo.gl/z");
  });
  it("خلية عادية ماتتغيّرش", () => {
    const ws: Record<string, unknown> = { "!ref": "A1:A1", A1: { t: "s", v: "دحر1234" } };
    resolveHyperlinkCells(ws);
    expect((ws.A1 as { v: string }).v).toBe("دحر1234");
  });
});

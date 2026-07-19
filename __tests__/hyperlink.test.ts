import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
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

  it("وضع dense (!data) — ده اللي التطبيق بيقرا بيه", () => {
    const ws: Record<string, unknown> = {
      "!ref": "A1:A2",
      "!data": [
        [{ t: "s", v: "الموقع" }],
        [{ t: "s", v: "خريطة", f: 'HYPERLINK("https://goo.gl/maps/d1","خريطة")' }],
      ],
    };
    resolveHyperlinkCells(ws);
    expect(((ws["!data"] as { v: string }[][])[1][0]).v).toBe("https://goo.gl/maps/d1");
  });
});

describe("roundtrip حقيقي — كتابة HYPERLINK وقراءتها dense", () => {
  it("ملف فيه =HYPERLINK يتقري لينكه بعد resolveHyperlinkCells", () => {
    const ws = XLSX.utils.aoa_to_sheet([["رقم اللوحة", "الموقع"], ["دحر1234", "خريطة"]]);
    // اعمل خلية B2 صيغة HYPERLINK زي ما بنطلّع الملف
    ws["B2"] = { t: "s", v: "خريطة", f: 'HYPERLINK("https://maps.app.goo.gl/rt1","خريطة")' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", bookSST: true });
    // اقرا بنفس إعدادات التطبيق (dense)
    const rb = XLSX.read(buf, { type: "array", dense: true } as XLSX.ParsingOptions);
    const rws = rb.Sheets["Sheet1"];
    resolveHyperlinkCells(rws);
    const rows = XLSX.utils.sheet_to_json<string[]>(rws, { header: 1, raw: true, defval: null });
    expect(rows[1][1]).toBe("https://maps.app.goo.gl/rt1"); // القيمة بقت الرابط مش «خريطة»
  });
});

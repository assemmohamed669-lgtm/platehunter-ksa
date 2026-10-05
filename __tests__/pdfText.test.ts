// @vitest-environment node
import { describe, it, expect } from "vitest";
import { extractPdfText } from "@/lib/pdfText";
import { parseCertText } from "@/lib/certParse";

/** ملف بي دي إف صغير متكتب باليد: سطرين كلام إنجليزي (لوحة + شاص). */
function tinyPdf(lines: string[]): Uint8Array {
  const content = lines.map((l, i) => `BT /F1 12 Tf 20 ${120 - i * 20} Td (${l}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 160] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

describe("الكلام اللي جوّه ملف الشهادة", () => {
  it("🔴 بيطلع كلام الملف سطر سطر — واللوحة والشاص بيتقروا منه", async () => {
    const text = await extractPdfText(tinyPdf(["Plate 4321JGR", "VIN KMHLN41E8RU000001"]));
    expect(text).toContain("4321JGR");
    expect(text).toContain("KMHLN41E8RU000001");
    expect(text.split("\n").length).toBeGreaterThanOrEqual(2);
    expect(parseCertText(text, "x.pdf")).toMatchObject({ plate: "رقح4321", vin: "KMHLN41E8RU000001" });
  });
  it("ملف بايظ ⇒ فاضي (مايوقعش السيرفر)", async () => {
    expect(await extractPdfText(new TextEncoder().encode("not a pdf"))).toBe("");
  });
});

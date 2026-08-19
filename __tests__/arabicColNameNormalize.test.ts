import { describe, it, expect } from "vitest";
import { matchesPreferred } from "@/lib/sortingCols";
import { resolveResultColumns } from "@/lib/resultColumns";

/**
 * باج ميداني (ملف مندوب حقيقي): عناوين الأعمدة بتتكتب بصيغ عربية مختلفة —
 * «نوع السياره» (ه) بدل «نوع السيارة» (ة)، «رقم الوحه» بدل «رقم اللوحة». المطابقة
 * كانت حرفية فمابتطابقش، والنوع كان بيختفي من نتيجة الفرز. لازم نطبّع ة↔ه، أ/إ/آ→ا،
 * ى→ي قبل المطابقة.
 */
describe("تطبيع أسماء الأعمدة العربية (ة/ه، أ/ا، ى/ي)", () => {
  it("«نوع السياره» (ه) يتطابق مع المفضّلة", () => {
    expect(matchesPreferred("نوع السياره")).toBe(true);
    expect(matchesPreferred("نوع السيارة")).toBe(true); // الصيغة الأصلية برضه
  });

  it("«اللون» بصيغ الهمزة/الألف تتطابق", () => {
    expect(matchesPreferred("سنه الصنع")).toBe(true); // سنة→سنه
  });

  it("resolveResultColumns يكتشف «نوع السياره» كنوع السيارة (type)", () => {
    const headers = ["رقم الوحه", "نوع السياره", "الشارع", "الحي"];
    const rows = [{ "رقم الوحه": "دسك1234", "نوع السياره": "ونيت", "الشارع": "شارع 1", "الحي": "النهضة" }];
    const cols = resolveResultColumns(headers, rows, "رقم الوحه");
    expect(cols.some((c) => c.key === "type" && c.sourceCol === "نوع السياره")).toBe(true);
  });
});

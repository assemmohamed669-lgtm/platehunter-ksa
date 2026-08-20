import { describe, it, expect } from "vitest";
import { mergeExcelTables, type ExcelTable } from "@/lib/excel";

const t = (headers: string[], rows: Record<string, string>[], sheetName = "s"): ExcelTable =>
  ({ headers, rows, sheetName, allSheetNames: [] } as unknown as ExcelTable);

describe("mergeExcelTables — محفظة فيها أكتر من ورقة", () => {
  it("ورقة واحدة بترجع زي ما هي", () => {
    const a = t(["رقم اللوحه"], [{ "رقم اللوحه": "ب ح ط 1996" }]);
    expect(mergeExcelTables([a]).rows).toEqual(a.rows);
    expect(mergeExcelTables([a]).headers).toEqual(a.headers);
  });

  it("بيجمع صفوف الورقتين ورا بعض بترتيبهم", () => {
    const a = t(["رقم اللوحه"], [{ "رقم اللوحه": "ب ح ط 1996" }, { "رقم اللوحه": "ب ط ك 4460" }]);
    const b = t(["رقم اللوحه"], [{ "رقم اللوحه": "4846 د ص ي" }]);
    const m = mergeExcelTables([a, b]);
    expect(m.rows).toHaveLength(3);
    expect(m.rows[2]["رقم اللوحه"]).toBe("4846 د ص ي");
  });

  it("الأعمدة المشتركة مابتتكررش، والزيادة بتتضاف بترتيب ظهورها", () => {
    // الورقتين في المحفظة الحقيقية مختلفتين: «76» فيها اسم مكتب التأجير،
    // و«اليمنيه» فيها الفرع والجنسية — والاتنين فيهم «رقم اللوحه».
    const a = t(["رقم العميل", "رقم اللوحه", "اسم مكتب التأجير"], [
      { "رقم العميل": "1", "رقم اللوحه": "ب ح ط 1996", "اسم مكتب التأجير": "AL AHSAA" },
    ]);
    const b = t(["رقم اللوحه", "الفرع", "الجنسية"], [
      { "رقم اللوحه": "4846 د ص ي", "الفرع": "ALMADINA", "الجنسية": "يمني" },
    ]);
    const m = mergeExcelTables([a, b]);
    expect(m.headers).toEqual(["رقم العميل", "رقم اللوحه", "اسم مكتب التأجير", "الفرع", "الجنسية"]);
  });

  it("الصف اللي عمود مش موجود في ورقته بيبقى فاضي — مش undefined", () => {
    const a = t(["رقم اللوحه", "اسم مكتب التأجير"], [{ "رقم اللوحه": "ب ح ط 1996", "اسم مكتب التأجير": "AL AHSAA" }]);
    const b = t(["رقم اللوحه", "الفرع"], [{ "رقم اللوحه": "4846 د ص ي", "الفرع": "ALMADINA" }]);
    const m = mergeExcelTables([a, b]);
    expect(m.rows[1]["اسم مكتب التأجير"]).toBe("");
    expect(m.rows[0]["الفرع"]).toBe("");
  });

  it("بيسيب الورقة الفاضية ومايكسرش", () => {
    const a = t(["رقم اللوحه"], [{ "رقم اللوحه": "ب ح ط 1996" }]);
    const empty = t([], []);
    expect(mergeExcelTables([a, empty]).rows).toHaveLength(1);
    expect(mergeExcelTables([empty, a]).rows).toHaveLength(1);
  });

  it("ليستة فاضية بترجع جدول فاضي مش كراش", () => {
    const m = mergeExcelTables([]);
    expect(m.rows).toEqual([]);
    expect(m.headers).toEqual([]);
  });

  it("بيحافظ على اسم أول ورقة فيها بيانات — العرض بيستعمله", () => {
    const a = t(["رقم اللوحه"], [{ "رقم اللوحه": "ب ح ط 1996" }], "76");
    const b = t(["رقم اللوحه"], [{ "رقم اللوحه": "4846 د ص ي" }], "اليمنيه");
    expect(mergeExcelTables([a, b]).sheetName).toBe("76");
  });

  it("عمود بنفس الاسم بمسافات زيادة بيتعامل كعمود واحد", () => {
    // «رقم اللوحه » و«رقم اللوحه» في ورقتين = نفس العمود، وإلا اللوحات تتقسم
    // على عمودين والفرز يلاقي نص العدد بس.
    const a = t(["رقم اللوحه "], [{ "رقم اللوحه ": "ب ح ط 1996" }]);
    const b = t(["رقم اللوحه"], [{ "رقم اللوحه": "4846 د ص ي" }]);
    const m = mergeExcelTables([a, b]);
    expect(m.headers).toHaveLength(1);
    expect(m.rows.map((r) => r[m.headers[0]])).toEqual(["ب ح ط 1996", "4846 د ص ي"]);
  });
});

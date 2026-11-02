/**
 * 🧭 ملف إحالة **عناوينه مزحلقة عن بياناته** — «سحب مباشر.xlsx» (المالك ٢ نوفمبر ٢٠٢٦): «المحفظه دي لما المندوب بيفرز علي
 * البرنامج علي المحفظه دي ويحطها في خانه الاحاله مش بيطلع معاه لوحات ولما بياخدهم لصق نصي بيطلع».
 *
 * الملف الحقيقي: صف العناوين ١٧ عمود والصفوف ٢٥ قيمة ⇒ عمود «رقم اللوحة» فيه «943630120» واللوحات («ر ل ه 2478»)
 * واقعة تحت «الطراز». الإحالة بتختار العمود **بالاسم الأول** ⇒ بتفرز على أرقام عقود ⇒ صفر.
 *
 * التصليح (`pickArabicPlateColumn`): العمود اللي اسمه «لوحة» **مفيهوش ولا لوحة** وفيه عمود عربي تاني مليان لوحات ⇒ التاني.
 * غير كده بالحرف زي الأول (`detectArabicPlateColumn(h) ?? detectArabicPlateColumnByContent(h, r)`) — مفيش توسيع لكشف
 * المحتوى (ذاكرة #407: «ماتوسّعش كشف العمود بالمحتوى»).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pickArabicPlateColumn, collectReferralEntries } from "@/lib/plateParser";
import { referralBlocks } from "@/lib/sideBySideTables";

// نفس شكل الملف الحقيقي (أول ٥ صفوف منه بالمواضع)
const HEADERS = ["م", "الرقم التسلسلي", "هوية صاحب العقد", "اسم صاحب العقد", "رقم اللوحة", "الماركة", "الطراز", "موديل", "رقم الهيكل"];
const RAW: string[][] = [
  ["16839602", "128", "تم اصدار شهادات سحب ", "873820", "943630120", "LSJW74U60RZ044079", "ر ل ه 2478", "Kastle", "7/16/24 1:21:39 PM"],
  ["13375145", "128", "تم اصدار شهادات سحب ", "680841", "669084020", "KMHLN41G2RU641296", "ر ق ح 8580", "Kastle", "1/1/24 1:17:13 PM"],
  ["12830269", "128", "تم اصدار شهادات سحب ", "650190", "856253020", "MHKAB1BA9PJ067166", "ر ع ل 3672", "Kastle", "11/21/23 5:33:57 PM"],
  ["12107399", "98", "تم اصدار شهادات سحب ", "611323", "922212020", "MHKAA1BA1PJ102043", "ر ع أ 5590", "Kastle", "10/3/23 6:49:15 PM"],
  ["8651242", "128", "تم اصدار شهادات سحب ", "452097", "992417910", "KMHLN41EXPU509298", "ر س أ 1147", "Kastle", "3/2/23 5:53:20 PM"],
];
const ROWS = RAW.map((r) => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]])));

describe("🧭 العمود اللي اسمه «لوحة» ومفيهوش لوحات", () => {
  it("«سحب مباشر»: «رقم اللوحة» فيه أرقام عقود ⇒ العمود اللي فيه اللوحات فعلاً («الطراز»)", () => {
    expect(pickArabicPlateColumn(HEADERS, ROWS)).toBe("الطراز");
  });
  it("وكل لوحات الملف بتتقري (كانت صفر)", () => {
    const col = pickArabicPlateColumn(HEADERS, ROWS)!;
    const norms = collectReferralEntries([{ rows: ROWS, plateCol: col, isArabic: true }]).map((e) => e.norm);
    expect(norms).toEqual(["رله2478", "رقح8580", "رعل3672", "رعا5590", "رسا1147"]);
  });
  it("الجداول جنب بعض/الإحالات الإضافية (`referralBlocks`) بنفس القاعدة", () => {
    const [b] = referralBlocks(HEADERS, ROWS);
    expect(b.plateCol).toBe("الطراز");
    expect(b.isArabic).toBe(true);
  });
});

describe("🛡️ غير كده زي الأول بالحرف", () => {
  it("العمود اللي اسمه «لوحة» فيه لوحات ⇒ هو (حتى لو فيه عمود تاني فيه لوحات برضه)", () => {
    const rows = [
      { "رقم اللوحة": "ا ب ح 1234", "لوحة قديمة": "د ه ل 5231" },
      { "رقم اللوحة": "ر ق ح 8580", "لوحة قديمة": "س ص ع 1111" },
    ];
    expect(pickArabicPlateColumn(["لوحة قديمة", "رقم اللوحة"], rows)).toBe("لوحة قديمة");   // أول اسم «لوح» زي الأول
    expect(pickArabicPlateColumn(["رقم اللوحة", "لوحة قديمة"], rows)).toBe("رقم اللوحة");
  });
  it("لوحات أرقامها قصيرة («ي ه ل 76» — البنوك بتشيل الأصفار) وسطها عادية ⇒ العمود بتاعها مايتسابش", () => {
    // حتى لو **كلها** قصيرة (كشف المحتوى بيشترط ٣–٤ أرقام فمابيعدّهاش) ⇒ الاسم يفضل
    const plates = ["ي ه ل 76", "ر ع ل 9", "ب ط م 12", "د و م 7", "س ص ع 45", "ح ح م 71", "ه ل ب 31", "ق ن ص 8"];
    const rows = plates.map((p, i) => ({ "رقم اللوحة": p, "ملاحظات": `ر ل ه ${2470 + i}` }));
    expect(pickArabicPlateColumn(["رقم اللوحة", "ملاحظات"], rows)).toBe("رقم اللوحة");
  });
  it("العمود اللي اسمه «لوحة» مفيهوش لوحات ومفيش عمود عربي تاني ⇒ زي الأول (اسمه)", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ "رقم اللوحة": `94363012${i}`, "Plate": `NKD 567${i}` }));
    expect(pickArabicPlateColumn(["رقم اللوحة", "Plate"], rows)).toBe("رقم اللوحة");
  });
  it("صفوف قليلة/فاضية في العمود ⇒ مانحكمش عليه (زي الأول)", () => {
    const rows = [{ "رقم اللوحة": "", "الطراز": "ر ل ه 2478" }, { "رقم اللوحة": "", "الطراز": "ر ق ح 8580" }];
    expect(pickArabicPlateColumn(["رقم اللوحة", "الطراز"], rows)).toBe("رقم اللوحة");
  });
  it("مفيش عمود اسمه «لوحة» ⇒ بالمحتوى زي الأول · مفيش صفوف ⇒ بالاسم", () => {
    expect(pickArabicPlateColumn(["A", "B"], [{ A: "x", B: "ر ل ه 2478" }])).toBe("B");
    expect(pickArabicPlateColumn(["رقم اللوحة"], [])).toBe("رقم اللوحة");
  });
});

describe("🔌 صفحة الفرز بتستخدمها في كل مسارات الإحالة", () => {
  const P = readFileSync(path.join(process.cwd(), "app", "(app)", "sorting", "page.tsx"), "utf8");
  it("الإحالة الأساسية + الإضافية (أعمدة النتيجة) + الملف متعدد الورقات", () => {
    expect(P).toContain("? pickArabicPlateColumn(referralTable.headers, referralTable.rows)");
    expect(P).toContain("const erPlate = pickArabicPlateColumn(er.table.headers, er.table.rows) ?? detectPlateColumn(er.table.headers, er.table.rows);");
    expect(P).toContain("const arabicCol = pickArabicPlateColumn(s.headers, s.rows);");
  });
});

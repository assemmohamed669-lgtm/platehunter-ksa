/**
 * ختم سياق الجلسة — «مربع اسم الشارع» و«مربع الملاحظة».
 *
 * سلوك المندوب الحقيقي (مقيس من الشيتات): بيكتب/بيقول الملاحظة **مرة واحدة**
 * وبتفضل سارية على كل اللوحات اللي بعدها لحد ما يغيّرها. الشيتات بتعمل ده
 * حرفياً — نفس النص متكرر على عشرات الصفوف.
 *
 * 🔴 الحاجة الأهم: **الختم بيتحدّد بلحظة نطق اللوحة، مش بلحظة تفريغها**.
 * التفريغ بيحصل بعدين وبالتوازي، فلو ختمنا وقت التفريغ هتاخد اللوحة سياق
 * شارع تاني خالص.
 */
import { describe, it, expect } from "vitest";
import { SessionStamp } from "../sessionStamp";

describe("SessionStamp", () => {
  it("يختم اللوحة بالسياق الساري وقت نطقها", () => {
    const s = new SessionStamp();
    s.setStreet("شارع الملك فهد", 0);
    expect(s.at(5_000).street).toBe("شارع الملك فهد");
  });

  it("🔴 لوحة اتقالت قبل تغيير الشارع تفضل على الشارع القديم", () => {
    const s = new SessionStamp();
    s.setStreet("الأول", 0);
    s.setStreet("التاني", 60_000);
    // اتقالت عند الدقيقة ٠:٣٠ — يعني الشارع الأول، حتى لو اتفرّغت بعد الدقيقة ٢
    expect(s.at(30_000).street).toBe("الأول");
    expect(s.at(90_000).street).toBe("التاني");
  });

  it("الملاحظة مستقلة عن الشارع — كل واحد بيتغيّر لوحده", () => {
    const s = new SessionStamp();
    s.setStreet("شارع ١", 0);
    s.setNote("بعد أول جراج يسار", 10_000);
    s.setStreet("شارع ٢", 20_000);
    const a = s.at(15_000);
    expect(a.street).toBe("شارع ١");
    expect(a.note).toBe("بعد أول جراج يسار");
    const b = s.at(25_000);
    expect(b.street).toBe("شارع ٢");
    expect(b.note).toBe("بعد أول جراج يسار");   // الملاحظة ما اتغيرتش
  });

  it("لوحة قبل أي إدخال ترجع بلا سياق — مش بأول قيمة اتكتبت بعدها", () => {
    const s = new SessionStamp();
    s.setStreet("اتكتب متأخر", 60_000);
    expect(s.at(1_000).street).toBeNull();
  });

  it("مسح المربع بيوقف الختم من لحظتها", () => {
    const s = new SessionStamp();
    s.setNote("ملاحظة", 0);
    s.setNote("", 30_000);
    expect(s.at(10_000).note).toBe("ملاحظة");
    expect(s.at(40_000).note).toBeNull();
  });

  it("آخر إدخال في نفس اللحظة هو اللي يكسب", () => {
    const s = new SessionStamp();
    s.setStreet("أ", 5_000);
    s.setStreet("ب", 5_000);
    expect(s.at(5_000).street).toBe("ب");
  });

  it("يحوّل لحظة النطق لتاريخ ووقت حقيقي من بداية التسجيل", () => {
    const s = new SessionStamp({ startedAt: new Date("2026-09-04T08:00:00Z").getTime() });
    expect(s.spokenAt(90_000)).toBe(new Date("2026-09-04T08:01:30Z").getTime());
  });

  it("يتحفظ ويترجع زي ما هو (الجلسة بتتقفل وتترجع)", () => {
    const s = new SessionStamp();
    s.setStreet("شارع", 0);
    s.setNote("ملاحظة", 1_000);
    const back = SessionStamp.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(back.at(2_000)).toEqual({ street: "شارع", note: "ملاحظة", type: null, recorder: null, streetName: null });
  });
});

describe("SessionStamp — النوع", () => {
  it("النوع يختم كل اللوحات اللي بعده", () => {
    const s = new SessionStamp();
    s.setType("غمارتين", 0);
    expect(s.at(9_000).type).toBe("غمارتين");
  });

  it("🔴 لوحة اتقالت قبل اختيار النوع ما تاخدوش", () => {
    const s = new SessionStamp();
    s.setType("دباب", 30_000);
    expect(s.at(10_000).type).toBeNull();
  });

  it("النوع مستقل عن الشارع والملاحظة", () => {
    const s = new SessionStamp();
    s.setStreet("شارع ١", 0);
    s.setType("غمارة", 5_000);
    s.setStreet("شارع ٢", 10_000);
    const a = s.at(12_000);
    expect(a.street).toBe("شارع ٢");
    expect(a.type).toBe("غمارة");
  });

  it("تغيير النوع بيسري من لحظته بس", () => {
    const s = new SessionStamp();
    s.setType("ونيت", 0);
    s.setType("دباب", 20_000);
    expect(s.at(10_000).type).toBe("ونيت");
    expect(s.at(25_000).type).toBe("دباب");
  });
});

/**
 * 🧾 مربعات المجمّع الجديدة (١٨ أكتوبر ٢٠٢٦): «اسم الحي» · «اسم المسجّل» · «اسم أو رقم الجراج».
 * المالك: «كان مسجل 20 لوحه قبل ما يدخل الجراج … وكتب … اول جراج يمين وخد اللوحات اللي في الجراج وبعد ما
 * خرج من الجراج شال كلمه اول جراج يمين … عايز اللوحات اللي اتاخدت في الجراج بس هيا اللي يتحط قدامها … الكتابه
 * اللي يكتبها المندوب تتنفذ فقط علي اللوحات اللي قالها بعد الكتابه دي ولما يشيلها ويمسحها ميتحطش في اللوحات
 * اللي بعد كدة … وفوق كل مربع … كلمه مسح».
 */
describe("SessionStamp — اسم المسجّل + الكتابة حرف حرف", () => {
  it("اسم المسجّل بيختم اللي بعده بس، ومستقل عن الحي والجراج", () => {
    const s = new SessionStamp({ startedAt: 0 });
    s.setRecorder("عاصم", 10_000);
    s.setNote("اول جراج يمين", 30_000);
    expect(s.at(5_000)).toMatchObject({ recorder: null, note: null });
    expect(s.at(20_000)).toMatchObject({ recorder: "عاصم", note: null });
    expect(s.at(31_000)).toMatchObject({ recorder: "عاصم", note: "اول جراج يمين" });
  });

  it("🔴 الكتابة حرف حرف = كلمة واحدة من أول حرف (لوحة اتقالت وهو بيكتب تاخد الكلمة كاملة)", () => {
    const s = new SessionStamp({ startedAt: 0 });
    let t = 60_000;
    for (const v of ["ا", "او", "اول", "اول ج", "اول جر", "اول جراج", "اول جراج ي", "اول جراج يمين"]) {
      s.typeInto("note", v, t);
      t += 400;
    }
    expect(s.at(59_999).note).toBeNull();
    expect(s.at(60_500).note).toBe("اول جراج يمين");
    expect(s.at(70_000).note).toBe("اول جراج يمين");
  });

  it("وقفة أكتر من ثانيتين = تعديل جديد بوقته (اللي قبله يفضل على القديم)", () => {
    const s = new SessionStamp({ startedAt: 0 });
    s.typeInto("street", "النرجس", 10_000);
    s.typeInto("street", "الياسمين", 50_000);
    expect(s.at(30_000).street).toBe("النرجس");
    expect(s.at(51_000).street).toBe("الياسمين");
  });

  it("«مسح» بيوقف الختم من لحظته — حتى لو جه بعد الكتابة على طول", () => {
    const s = new SessionStamp({ startedAt: 0 });
    s.typeInto("note", "اول جراج يمين", 60_000);
    s.setNote("", 61_000);
    expect(s.at(60_500).note).toBe("اول جراج يمين");
    expect(s.at(62_000).note).toBeNull();
    // كتابة بعد المسح على طول = تعديل جديد (مابيرجعش يدمج مع اللي قبل المسح)
    s.typeInto("note", "تاني جراج", 61_500);
    expect(s.at(61_200).note).toBeNull();
    expect(s.at(62_000).note).toBe("تاني جراج");
  });

  it("بيتحفظ ويترجع ومعاه اسم المسجّل — والجلسات القديمة من غيره شغّالة", () => {
    const s = new SessionStamp({ startedAt: 5 });
    s.setRecorder("عاصم", 0);
    const back = SessionStamp.fromJSON(JSON.parse(JSON.stringify(s.toJSON())));
    expect(back.at(1).recorder).toBe("عاصم");
    const old = SessionStamp.fromJSON({ startedAt: 1, streets: [], notes: [] });
    expect(old.at(10).recorder).toBeNull();
  });
});

describe("🅿️ سيناريو الجراج بالظبط", () => {
  it("٢٠ لوحة في الشارع ⇒ الجراج (٥ لوحات) ⇒ مسح ⇒ الشارع تاني", () => {
    const s = new SessionStamp({ startedAt: 0 });
    // الحي والمسجّل مكتوبين من أول التسجيل
    s.setStreet("النرجس", 0);
    s.setRecorder("عاصم", 0);
    const street1 = Array.from({ length: 20 }, (_, i) => 5_000 + i * 3_000);   // ٥ث … ٦٢ث
    s.typeInto("note", "اول جراج يمين", 66_000);
    const garage = Array.from({ length: 5 }, (_, i) => 70_000 + i * 3_000);    // ٧٠ث … ٨٢ث
    s.setNote("", 86_000);                                                       // «مسح»
    const street2 = Array.from({ length: 10 }, (_, i) => 90_000 + i * 3_000);
    for (const t of street1) expect(s.at(t)).toMatchObject({ street: "النرجس", recorder: "عاصم", note: null });
    for (const t of garage) expect(s.at(t)).toMatchObject({ street: "النرجس", recorder: "عاصم", note: "اول جراج يمين" });
    for (const t of street2) expect(s.at(t)).toMatchObject({ street: "النرجس", recorder: "عاصم", note: null });
  });
});

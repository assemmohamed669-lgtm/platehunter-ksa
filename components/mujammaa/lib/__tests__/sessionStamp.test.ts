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
    expect(back.at(2_000)).toEqual({ street: "شارع", note: "ملاحظة", type: null });
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

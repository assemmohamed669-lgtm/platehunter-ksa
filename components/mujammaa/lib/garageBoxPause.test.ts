import { describe, expect, it } from "vitest";
import { SessionStamp } from "./sessionStamp";
import { spokenTimes } from "./spokenTime";
import { joinNotes } from "./stampBoxes";

/**
 * 🧾 مربع «الجراج» + «وقف مؤقت» + اللي اتقال — سيناريو المالك بالحرف (٢٣ أكتوبر ٢٠٢٦):
 * «لما المندوب يدخل مثلا برحه او جراج ويكتب في المربع مثلا جراج وبعدين يدوس بوز ويكمل … هيتضاف ل كل لوحات الجراج
 * ولما خرج ومسح المربع وكمل الشارع مش هيكون قدامه حاجه غير لو هو قال نوع او ملاحظه … ولو … قال … مركونه او مصدومه
 * يعني كله هيتسجل ؟»
 *
 * الصفحة: المربع بيتختم بوقت الساعة (`elapsedMsRef`)، واللوحة بوقت نطقها الحقيقي (ثانية الصوت + الوقفات —
 * `spokenTimes`)، وملاحظة المربع + اللي اتقال بيتجمعوا (`joinNotes`).
 */
describe("الجراج والوقفة واللي اتقال — كله بيتسجّل", () => {
  // الصوت: ٠–١٠ث الشارع · وقف ٦٠ث (الساعة ١٠⇐٧٠) · كمّل في الجراج · مسح المربع ث ٩٥ (ساعة) · كمّل الشارع
  const pauses = [{ atAudioMs: 10_000, durMs: 60_000 }];
  const stamp = new SessionStamp({ startedAt: 0 });
  stamp.typeInto("note", "جراج", 40_000); // كتب «جراج» وهو واقف مؤقت
  stamp.setNote("", 95_000); // خرج ومسح المربع

  const row = (audioS: number, spoken?: string) => {
    const when = spokenTimes({ timeStartS: audioS, baseMs: 0, lastKnownAbsMs: 0, pauses });
    return joinNotes(stamp.at(when.relMs).note, spoken);
  };

  it("لوحة في الشارع قبل الجراج ⇒ مافيش حاجة (غير اللي اتقال)", () => {
    expect(row(5)).toBeUndefined();
    expect(row(5, "مصدومه")).toBe("مصدومه");
  });

  it("لوحات الجراج بعد ما كمّل ⇒ «جراج»، واللي اتقال جنبها", () => {
    expect(row(15)).toBe("جراج");
    expect(row(15, "مركونه")).toBe("جراج · مركونه");
    expect(row(30, "مصدومه")).toBe("جراج · مصدومه");
  });

  it("بعد ما مسح المربع ⇒ الشارع من غير «جراج» — إلا اللي اتقال", () => {
    expect(row(40)).toBeUndefined();
    expect(row(40, "مركونه")).toBe("مركونه");
  });
});

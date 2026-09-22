import { describe, it } from "vitest";
import { scanTypeAndNote } from "@/lib/vehicleTypeScan";

/**
 * نطق كوهير الحقيقي من جلسة المالك (٢٠ سبتمبر ٢٠٢٦) — ٣٠ لوحة.
 * النوع مطلّعش في ٦، منهم ٣ بسبب كلمة قريبة مش في القائمة:
 *   «فام» ⟶ فان · «ون» ⟶ ونيت · «راحة صفرة» ⟶ لوحه صفرا
 * والسطور هنا **منقولة من السجل حرفياً**.
 */
const CASES: Array<[string, string, string]> = [
  ["سته اربعه تلاته اتنين جراش ب ب ميم تلاته سته خمسه اربعه فام", "ببم3654", "فان"],
  ["يعني قفص تمنية ستة خمسة أربعة ون، ده اللي هي م اتنين سبعة ون.", "بقص8654", "ونيت"],
  ["ح نون نون سبعة ستة خمسة خمسة راحة صفرة ب نون نون أربعة تسعة", "حنن7655", "لوحه صفرا"],
];

describe("صيغ النوع من نطق كوهير", () => {
  it("الثلاثة اللي ضاعوا", () => {
    for (const [text, plate, want] of CASES) {
      const r = scanTypeAndNote(text, { afterPlate: plate });
      const got = r.type ?? r.note ?? "—";
      // eslint-disable-next-line no-console
      console.log(`  ${got === want ? "✅" : "❌"} ${plate}  عايزين «${want}»  ⇒ نوع=${r.type ?? "—"} ملاحظة=${r.note ?? "—"}`);
    }
  });
});

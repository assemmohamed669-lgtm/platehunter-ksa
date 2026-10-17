/**
 * سجل تصحيحات المندوب — **مصنع التسمية الذهبية**
 * ==========================================================================
 * لما المندوب يصحّح لوحة طلعت غلط، دي **تسمية من إنسان** = شاهد مستقل تماماً
 * عن الموديل. ودي أثمن داتا تدريب موجودة، لسببين مقيسين النهاردة:
 *
 *  ١. تسميات الحصاد جاية من الموديل نفسه ⇒ ورّثت أخطاءه ⇒ وقّعت v13 و v14.
 *  ٢. ديبجرام كشاهد دانا ٩,٥٩٠ مقطع، بس كلهم **سهلين** — اتفق معانا في الواضح
 *     بس. التصحيحات بتدّي العكس: **الحالات اللي الموديل غلط فيها**.
 *
 * 🔴 الخطر: المندوب بيكتب حرف حرف. لو حفظنا كل ضغطة زر هنملا التدريب بلوحات
 * ناقصة. **مايتحفظش غير اللي شكله لوحة كاملة وصح.**
  * ⚠️⚠️ **تصحيح (٥ سبتمبر ٢٠٢٦) — الادعاء اللي فوق مش مثبت.**
 * المقارنة اللي بُني عليها ماكانتش ضابطة: الميكس بلا `live-sep` اتدرّب من
 * **`seg-model-v11`** (موديل متراكم)، والميكس بيه اتدرّب من **`openai/whisper-small`**
 * (من الصفر). يعني **الأساس كان مختلف كمان**، والفرق يفسّره الأساس لوحده.
 * ⇒ **`live-sep` متهم بلا دليل.**
 * السبب الحقيقي لرسوب v13/v14/v15 في `TRAINING_ERRORS_TO_AVOID.md` قسم ٩.
 * الشاهد المستقل يفضل **فكرة سليمة في ذاتها** (تسمية بشاهد مستقل > تخمين الموديل)
 * بس **قيمته مقابل الحصاد الخام لسه مش مقيسة** — محتاجة تدريبين من **نفس الأساس**.
 */
import { describe, it, expect } from "vitest";
import { CorrectionLog } from "../corrections";

describe("CorrectionLog", () => {
  it("يسجّل تصحيح حقيقي", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 5_000 });
    expect(c.list()).toHaveLength(1);
    expect(c.list()[0].corrected).toBe("ابح1284");
  });

  it("🔴 مايسجّلش الكتابة الوسط — لوحة ناقصة مش تصحيح", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح12", tMs: 5_000 });
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح128", tMs: 5_000 });
    expect(c.list()).toHaveLength(0);
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 5_000 });
    expect(c.list()).toHaveLength(1);
  });

  it("آخر تصحيح للصف الواحد هو اللي يتحفظ — مش كل ضغطة", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 0 });
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1285", tMs: 0 });
    expect(c.list()).toHaveLength(1);
    expect(c.list()[0].corrected).toBe("ابح1285");
  });

  it("🔴 رجّع اللوحة لأصلها ⇒ التصحيح يتشال، مايتحفظش كأنه صح", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 0 });
    expect(c.list()).toHaveLength(1);
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1234", tMs: 0 });
    expect(c.list()).toHaveLength(0);
  });

  it("يفضل محتفظ بقراءة الموديل الأصلية مهما اتعدّل الصف", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 0 });
    c.record({ id: "1", heard: "ابح1284", corrected: "ابح1289", tMs: 0 });
    expect(c.list()[0].heard).toBe("ابح1234");   // الأصل، مش القراءة المعدّلة
  });

  it("🔴 يرفض التصحيح لو لحظة النطق مش معروفة — مافيش صوت نقصّه", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 0, requireTime: true });
    expect(c.list()).toHaveLength(0);
  });

  it("صفوف مختلفة تتسجّل مستقلة", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 1_000 });
    c.record({ id: "2", heard: "دهر9090", corrected: "دهر9099", tMs: 8_000 });
    expect(c.list()).toHaveLength(2);
  });

  it("يتحفظ ويترجع زي ما هو", () => {
    const c = new CorrectionLog();
    c.record({ id: "1", heard: "ابح1234", corrected: "ابح1284", tMs: 3_000 });
    const back = CorrectionLog.fromJSON(JSON.parse(JSON.stringify(c.toJSON())));
    expect(back.list()).toEqual(c.list());
  });
});

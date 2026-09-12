/**
 * أسماء أعمدة فريدة — **مصدر واحد** يستخدمه قارئ الإكسيل العادي (`lib/excel.ts`)
 * والقارئ اللي جوّه الـWeb Worker (`lib/xlsxWorker.ts`) مع بعض.
 *
 * الصف بيتبني كـ`obj[name] = value`، فعمودين بنفس الاسم التاني بيمسح الأول
 * وداتا عمود كاملة بتضيع في صمت. بيحصل في الورقات اللي فيها **كذا جدول جنب
 * بعض** (نفس الرؤوس مكرّرة) — محفظة حقيقية فيها ٤٩ لوحة كان البرنامج يشوف
 * جزء منها بس.
 *
 * أول ظهور بيفضل باسمه زي ما هو (فالملفات العادية مابتتأثرش)، والتكرار بياخد
 * «(2)»، «(3)»… و`splitSideBySideTables` بتشيل اللاحقة دي وهي بتقسّم.
 */
export function makeHeadersUnique(cols: Array<{ name: string; col: number }>): void {
  const seen = new Map<string, number>();
  for (const hc of cols) {
    const n = (seen.get(hc.name) ?? 0) + 1;
    seen.set(hc.name, n);
    if (n > 1) hc.name = `${hc.name} (${n})`;
  }
}

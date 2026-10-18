/**
 * 💾 حفظ «بيتجمّع» — حفظة واحدة شغّالة في المرة، وأي تغييرات بتيجي وهي شغّالة بتتجمّع في حفظة واحدة
 * بآخر نسخة لما تخلص (١٨ أكتوبر ٢٠٢٦ — Voice PRO «خفيف»).
 *
 * Voice PRO كان بيكتب الجدول كله في الموبايل مع **كل** تغيير (كل لوحة/موقع/نوع) — مع ١٬٨٠٠ لوحة ده
 * بيخنق الآيفون. هنا عدد الكتابات = قد ما التخزين يلحق، وآخر نسخة **دايماً** بتتكتب (مابتضيعش).
 */
export function createCoalescedSaver<T>(save: (v: T) => Promise<unknown>): (v: T) => void {
  let running = false;
  let hasPending = false;
  let pending: T;
  const run = (v: T) => {
    running = true;
    let p: Promise<unknown>;
    try {
      p = Promise.resolve(save(v));
    } catch (e) {
      p = Promise.reject(e);
    }
    p
      .catch(() => {
        /* الحفظة دي فشلت — اللي بعدها بتكمّل */
      })
      .finally(() => {
        running = false;
        if (hasPending) {
          hasPending = false;
          run(pending);
        }
      });
  };
  return (v: T) => {
    if (running) {
      pending = v;
      hasPending = true;
      return;
    }
    run(v);
  };
}

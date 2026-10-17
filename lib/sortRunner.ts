/**
 * 📄 فرز واحد في نفس الوقت — من غير ما دوسة المندوب تضيع.
 *
 * المناديب (١٧ أكتوبر ٢٠٢٦): «لما يجيلو اشعار الشهايد ويدخل … ييجي يفرز مش بيتفرز معاه لازم يخرج من البرنامج ويفتح
 * تاني او يقعد شوي». «شهايد النهارده» بتعيد الفرز لوحدها في الخلفية لما تنزل شهايد جديدة (يعني بالظبط بعد الإشعار)،
 * والدوسة وهو شغّال كانت بترجع في صمت — لا صوت ولا لفّة. دلوقتي:
 *  · تحديث تلقائي والفرز شغّال ⇒ مابيبدأش تاني (`skipped`).
 *  · دوسة المندوب ⇒ بتستنى الشغّال؛ لو نجح لنفس اليوم نتيجته هي النتيجة (`joined`)، وإلا بتفرز بنفسها (`ran`).
 */
export type RunOutcome = "ran" | "joined" | "skipped";

export interface SortRunner<K> {
  busy(): boolean;
  /** `job` بيرجّع true لو النتيجة اتحفظت. `onJoin` = الدوسة لقت فرز شغّال وهتستناه. */
  run(key: K, manual: boolean, job: () => Promise<boolean>, onJoin?: () => void): Promise<RunOutcome>;
}

export function createSortRunner<K>(): SortRunner<K> {
  let cur: { key: K; p: Promise<boolean> } | null = null;

  async function start(key: K, job: () => Promise<boolean>): Promise<boolean> {
    const p = (async () => { try { return await job(); } catch { return false; } })();
    cur = { key, p };
    try { return await p; } finally { if (cur?.p === p) cur = null; }
  }

  return {
    busy: () => cur !== null,
    async run(key, manual, job, onJoin) {
      if (!cur) { await start(key, job); return "ran"; }
      if (!manual) return "skipped";
      onJoin?.();
      const running = cur;
      const ok = await running.p;
      if (ok && running.key === key) return "joined";
      // فرز تاني ممكن يكون بدأ وإحنا مستنيين — نستناه هو كمان قبل ما نبدأ
      while (cur) await cur.p;
      await start(key, job);
      return "ran";
    },
  };
}

export class TimeoutError extends Error {
  constructor() { super("timeout"); this.name = "TimeoutError"; }
}

/** الوعد ده لو ماخلصش في `ms` ⇒ `TimeoutError` (عشان طلب نت معلّق مايقفلش الفرز لحد ما البرنامج يتقفل). */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError()), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

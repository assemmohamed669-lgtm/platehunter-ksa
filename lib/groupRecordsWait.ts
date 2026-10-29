/**
 * ══════════════════════════════════════════════════════════════════════
 *  ⏱️ الفرز مايستناش النت من غير حد (المالك ٢٩ أكتوبر ٢٠٢٦)
 * ══════════════════════════════════════════════════════════════════════
 * «محمد عفيفي وسامي … الفرز مهنج معاهم مش بيفرز». الصندوق الأسود (سامي ١٧:٢٥–١٧:٤٥): النت «متوصّل ومابيردش» — كل
 * طلب بيفضل معلّق ١٠٠–٢٤٠ ثانية وبعدين يفشل، والبرنامج اتقفل واتفتح ٤ مرات على الفرز.
 *
 * الفرز كان بيستنى **من غير حد** حاجتين من النت قبل ما يعرض النتيجة: بيانات المجموعة (`teamReady` — مين أنا +
 * مجموعتي) ومطابقة سجلات المجموعة على السيرفر (`match_group_plates`). والاستنا الأولاني كان قبل «عندي مجموعة؟» ⇒
 * **أي** مندوب نته معلّق بيفضل على «جارٍ الفرز...» دقايق. دلوقتي ليهم حد، وبعده النتيجة بتطلع بالمحلي + رسالة.
 */

/** أقصى استنا لسجلات المجموعة في الفرز — الرحلة العادية ثانية أو اتنين. */
export const GROUP_RECORDS_WAIT_MS = 20_000;
/** المطابقة على السيرفر بتاخد على الأقل كده حتى لو بيانات المجموعة أكلت معظم الحد. */
export const GROUP_MATCH_MIN_MS = 5_000;

/** يستنى `p` لحد `ms` بالكتير. `true` = خلص (أو وقع — الفرز المحلي يكمّل زي الأول) · `false` = اتأخّر. */
export async function waitUpTo(p: Promise<unknown> | null | undefined, ms: number): Promise<boolean> {
  if (!p) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<false>((r) => { timer = setTimeout(() => r(false), ms); });
  try {
    return await Promise.race([p.then(() => true, () => true), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * صفحات من السيرفر لحد ما تخلص أو الوقت يخلص. اتأخّرت أو النت وقع ⇒ اللي وصل + `late` (والطلب الطاير بيتلغي بالـ
 * `signal`). غلط من السيرفر نفسه (فيه `code`) ⇒ يقف باللي وصل من غير رسالة — زي الأول.
 */
export async function pagesUpTo<T>(
  page: (from: number, signal: AbortSignal) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number,
  ms: number,
): Promise<{ rows: T[]; late: boolean }> {
  const rows: T[] = [];
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"late">((r) => { timer = setTimeout(() => { ctl.abort(); r("late"); }, ms); });
  try {
    for (let from = 0; ; from += pageSize) {
      const res = await Promise.race([Promise.resolve(page(from, ctl.signal)), timeout]);
      if (res === "late") return { rows, late: true };
      if (res.error) {
        const code = (res.error as { code?: unknown })?.code;
        return { rows, late: !code };
      }
      const got = res.data ?? [];
      rows.push(...got);
      if (got.length < pageSize) return { rows, late: false };
    }
  } catch {
    return { rows, late: true };
  } finally {
    clearTimeout(timer);
  }
}

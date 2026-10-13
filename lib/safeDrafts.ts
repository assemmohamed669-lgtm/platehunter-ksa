/**
 * ══════════════════════════════════════════════════════════════════════
 *  🛡️ اللوحات قبل التصدير ماتضيعش أبداً
 * ══════════════════════════════════════════════════════════════════════
 * المالك (١٣ أكتوبر ٢٠٢٦): «مش عايز والمندوب بيشيك صوت او يدوي وخرج من الصفحة وهو شغال يضيع منه اي لوحات كل
 * اللوحات اللي بتتسجل تفضل محفوظه في التليفون مهما كان لحين التصدير ... متتمسحش غير لو راحت للسجلات بتاعته».
 *
 * ٣ أماكن كانت بتضيّع (في «صوتي» و«الجديد»):
 *   ① المحرّك بيطلّع آخر اللوحات **بعد** الإيقاف بثواني (بيستنى ردود السيرفر) — ولو المندوب خرج من الصفحة
 *      في الثواني دي، اللوحة بتتكتب في صفحة اتقفلت = بتضيع. ⇒ `createDraftSink`: الصفحة المقفولة بتسلّم
 *      اللوحة للصفحة المفتوحة دلوقتي، ولو مافيش ⇒ بتتحفظ على الموبايل على طول.
 *   ② الرجوع للصفحة: لوحة جديدة قبل ما المحفوظ يخلص قراية كانت بتاخد **مكانه**. ⇒ `mergeById`.
 *   ③ أحدث نسخة تكسب — في `lib/checkDrafts.ts` (`pickNewestDraft`).
 *
 * 🔓 للكل من ١٣ أكتوبر ٢٠٢٦ (كانت للسوبر أدمن الأول بعلم محفوظ على الموبايل).
 */

const FLAG_KEY = "ph:safeDrafts";

/**
 * الحماية الجديدة شغّالة؟ — 🔓 **للكل** (المالك ١٣ أكتوبر ٢٠٢٦: «انشر للكل») بعد السوبر أدمن: حماية اللوحات قبل التصدير،
 * والاسترجاع اللي بيضيف الناقص بس، وزرار «مزامنة» الناقص بس. (العلم المحفوظ مابقاش بيقفل حاجة — `rememberSafeDrafts`
 * فاضلة عشان النداءات الموجودة.)
 */
export function safeDraftsOn(): boolean {
  return true;
}

/** بيتنده من البروفايل (`is_super`) — بيتطبّق من الفتحة الجاية للاسترجاع، وعلى طول للخروج من الصفحة. */
export function rememberSafeDrafts(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG_KEY, "1");
    else localStorage.removeItem(FLAG_KEY);
  } catch { /* التخزين مش متاح */ }
}

/**
 * ② المحفوظ **بيتضاف** على اللي في الشاشة: اللي في الشاشة الأول (هو الأحدث — اتسجّل والقراية شغّالة)، وبعده
 * المحفوظ اللي مش موجود. نفس الصف في الاتنين ⇒ نسخة الشاشة.
 */
export function mergeById<T extends { id: string }>(current: readonly T[], loaded: readonly T[]): T[] {
  if (!current.length) return [...loaded];
  if (!loaded.length) return [...current];
  const have = new Set(current.map((x) => x.id));
  return [...current, ...loaded.filter((x) => !have.has(x.id))];
}

/** علامات «اتصدّر» بتتجمّع — نسيان علامة = اللوحة تتصدّر مرتين. */
export function mergeIds(current: Iterable<string>, loaded: Iterable<string>): Set<string> {
  const out = new Set(current);
  for (const x of loaded) out.add(x);
  return out;
}

export type RowsUpdater<T> = (prev: T[]) => T[];

export interface DraftSink<T> {
  /** الصفحة المفتوحة بتسجّل نفسها؛ بيرجّع دالة الفكّ (بتفك الصفحة دي بس، مش صفحة أحدث). */
  attach(set: (fn: RowsUpdater<T>) => void): () => void;
  /**
   * تغيير جاي من صفحة **اتقفلت** — للصفحة المفتوحة دلوقتي (`fn`)، وإلا للتخزين (`toStore` لو مختلف — مثلاً
   * «الجديد» بيحفظ لوحات الحسابات التانية جنب لوحات المندوب). التغييرات بتتنفّذ بالترتيب.
   */
  apply(fn: RowsUpdater<T>, toStore?: RowsUpdater<T>): Promise<void>;
}

/**
 * ① مكان واحد يستقبل اللوحات اللي وصلت بعد ما الصفحة اتقفلت.
 *
 * `read` = آخر قايمة معروفة في الذاكرة (أو `null` لو مش معروفة) · `load` = القايمة المحفوظة على الموبايل ·
 * `write` = حفظ القايمة الجديدة. لو الكاش مش معروف بنقرا المحفوظ **الأول** — وإلا لوحة واحدة كانت هتدوس على
 * القايمة كلها.
 */
export function createDraftSink<T>(store: {
  read(): T[] | null;
  load(): Promise<T[]>;
  write(next: T[]): void;
}): DraftSink<T> {
  let live: ((fn: RowsUpdater<T>) => void) | null = null;
  let queue: Promise<void> = Promise.resolve();
  /** بنقرا الصفحة المفتوحة **وقت التنفيذ** (ممكن تتفتح وإحنا مستنيين القراية). */
  const current = () => live;

  return {
    attach(set) {
      live = set;
      return () => { if (live === set) live = null; };
    },
    apply(fn, toStore) {
      const run = async () => {
        const now = current();
        if (now) { now(fn); return; }
        let cur = store.read();
        if (cur == null) {
          let loaded: T[] = [];
          try { loaded = await store.load(); } catch { loaded = []; }
          // الصفحة اتفتحت وإحنا بنقرا ⇒ هي اللي تاخدها (المحفوظ هيتقري فيها ويتضاف عليه)
          const later = current();
          if (later) { later(fn); return; }
          cur = store.read() ?? loaded;
        }
        store.write((toStore ?? fn)(cur));
      };
      queue = queue.then(run, run);
      return queue;
    },
  };
}

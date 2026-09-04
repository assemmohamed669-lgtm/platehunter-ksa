/**
 * منطق مؤشّر الصوت — نقي وقابل للقياس.
 *
 * المؤشّر القديم كان ٥ أعمدة بتشتغل/تطفي على عتبات ثابتة: بيرفرف مع أي تغيّر
 * بسيط، وبيقول للمندوب معلومة قليلة (بيسمع ولا لأ). الجديد بيبني على تلات
 * حاجات:
 *   - **امتلاء جزئي** لكل عمود بدل شغّال/طافي ⇒ حركة سلسة وقراءة أدقّ.
 *   - **تنعيم سريع الصعود بطيء الهبوط** ⇒ الكلام يبان فوراً والمؤشّر مايهتزّش.
 *   - **علامة ذروة** بتنزل بالراحة ⇒ المندوب يشوف إن صوته وصل فعلاً.
 */

/** معامل الصعود — كل إطار بيقطع ٥٥٪ من المسافة للهدف (استجابة فورية للكلام). */
const ATTACK = 0.55;

/** معامل الهبوط — ١٢٪ بس، فالمؤشّر بينزل بهدوء بدل ما يقفل فجأة بين الكلمات. */
const RELEASE = 0.12;

/** نزول علامة الذروة في الإطار الواحد. */
const PEAK_DECAY = 0.02;

/** أقصر عمود = ٣٥٪ من أطول عمود — عشان الأطراف تفضل مرئية. */
const MIN_BAR_SCALE = 0.35;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * امتلاء كل عمود (٠..١) عند مستوى معيّن. العمود اللي عند حافة المستوى بيتملي
 * جزئياً — ده اللي بيدّي الإحساس السلس بدل القفزات.
 */
export function meterBars(level: number, count: number): number[] {
  const lit = clamp01(level) * count;
  return Array.from({ length: count }, (_, i) => clamp01(lit - i));
}

/** تنعيم المستوى: صعود سريع، هبوط بطيء. */
export function smoothLevel(prev: number, next: number): number {
  const p = clamp01(prev);
  const n = clamp01(next);
  const k = n > p ? ATTACK : RELEASE;
  return clamp01(p + (n - p) * k);
}

/**
 * طول العمود النسبي (٠٫٣٥..١) — منحنى جيبي فالأعمدة الوسط أطول والشكل يبقى
 * مرايا متماثلة زي مؤشّرات الصوت الاحترافية.
 */
export function barHeightScale(i: number, count: number): number {
  if (count <= 1) return 1;
  const t = (i + 0.5) / count;                    // منتصف العمود ٠..١
  return MIN_BAR_SCALE + (1 - MIN_BAR_SCALE) * Math.sin(Math.PI * t);
}

/** علامة الذروة: بتقفز فوراً لفوق وبتنزل بالراحة، ومابتنزلش تحت المستوى الحالي. */
export function peakHold(prevPeak: number, level: number): number {
  const l = clamp01(level);
  const p = clamp01(prevPeak);
  return l >= p ? l : Math.max(l, p - PEAK_DECAY);
}

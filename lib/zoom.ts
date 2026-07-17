// مستويات الزوم المشتركة لكل نوافذ اللوحات — مؤشّر index في المصفوفة.
// (منطق نقي في lib عشان يتشارك مع hook الزوم بإصبعين ويتّست بدون JSX.)
export const ZOOM_LEVELS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.4];

/** حجم الخط بالبكسل حسب مستوى الزوم (الأساس 12px). */
export function zoomFontPx(zoom: number): number {
  return (ZOOM_LEVELS[zoom] ?? 1) * 12;
}

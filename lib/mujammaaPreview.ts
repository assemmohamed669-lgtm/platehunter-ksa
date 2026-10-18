/**
 * 👁️ **«زي المندوب»** — السوبر أدمن بيشوف «التسجيل» (المجمّع) بالظبط زي ما المندوب هيشوفه، قبل الفتح
 * (١٨ أكتوبر ٢٠٢٦). المالك: «دلوقتي اظهر ليا انا بس اللي هيظهر للمناديب وبعدين ابقي رجع تاني التقارير
 * وكل حاجه بس علشان اشوف ايه بالظبط قبل ما ننشر».
 *
 * الصفحة بتمشي في نفس مسار المندوب (من غير مفتاح «التسجيل القديم» ولا الشروحات ولا التقارير)، وشريط
 * صغير للسوبر أدمن بس يرجّع بيه أدواته. الافتراضي «زي المندوب» لحد ما المالك يقول «رجّع» ⇒
 * `AGENT_PREVIEW_DEFAULT = false`.
 */
export const AGENT_PREVIEW_KEY = "ph:mj:previewAgent";
export const AGENT_PREVIEW_DEFAULT = true;

export function loadAgentPreview(): boolean {
  try {
    const v = localStorage.getItem(AGENT_PREVIEW_KEY);
    return v === null ? AGENT_PREVIEW_DEFAULT : v === "1";
  } catch {
    return AGENT_PREVIEW_DEFAULT;
  }
}

export function saveAgentPreview(on: boolean): void {
  try {
    localStorage.setItem(AGENT_PREVIEW_KEY, on ? "1" : "0");
  } catch {
    /* تخزين مقفول — الاختيار للجلسة دي بس */
  }
}

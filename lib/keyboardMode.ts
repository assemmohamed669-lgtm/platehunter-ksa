/**
 * keyboardMode — «الكيبورد الذكي» لخانة اللوحة في التشييك اليدوي.
 *
 * اللوحة السعودية = ٣ حروف + ٤ أرقام دايماً. المندوب بيكتب الحروف بالكيبورد
 * العادي وبعدين لازم يدوس «123» بإيده عشان يوصل للأرقام. الخيار ده بيخلّي
 * الكيبورد يقلب للأرقام لوحده بعد ما يكتب ٣ حروف — من غير ما شكل الخانة يتغيّر.
 *
 * وحدة **نقية** (بلا React/DOM) — الصفحة بتستدعيها بس. الافتراضي إن الخيار
 * مقفول، يعني `plateKeyboardMode(..., false)` بترجّع "text" دايماً = السلوك الحالي.
 */

/** عدد حروف اللوحة السعودية اللي بعدها الكيبورد يقلب أرقام. */
export const PLATE_LETTERS = 3;

const LS_KEY = "ph:check:smartKeyboard";

/** هل الكود ده حرف لوحة؟ (لاتيني A-Z/a-z أو حرف عربي — مش رقم ولا فراغ). */
function isPlateLetter(code: number): boolean {
  // لاتيني
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) return true;
  // عربي: كامل البلوك ما عدا الأرقام والعلامات اللي مش حروف
  if (code >= 0x0600 && code <= 0x06ff) {
    if (code >= 0x0660 && code <= 0x0669) return false; // أرقام عربية-هندية ٠-٩
    if (code >= 0x06f0 && code <= 0x06f9) return false; // أرقام عربية-هندية ممتدة
    if (code === 0x0640) return false;                  // تطويل ـ
    if (code >= 0x0600 && code <= 0x0605) return false; // علامات
    if (code >= 0x064b && code <= 0x065f) return false; // تشكيل
    if (code === 0x0670) return false;                  // ألف خنجرية (تشكيل)
    if (code >= 0x06d4 && code <= 0x06ed) return false; // علامات/تشكيل
    return true;
  }
  return false;
}

/** عدد الحروف بس في القيمة (الفراغات والأرقام مش محسوبة). */
export function plateLetterCount(value: string): number {
  if (!value) return 0;
  let n = 0;
  for (const ch of String(value)) {
    if (isPlateLetter(ch.codePointAt(0) ?? 0)) n++;
  }
  return n;
}

/**
 * نوع الكيبورد لخانة اللوحة.
 *  - smart=false ⇒ "text" دايماً (السلوك الحالي — أهم ضمان: مفيش تغيير).
 *  - smart=true  ⇒ "numeric" أول ما عدد الحروف يوصل ٣، وإلا "text"
 *    (يعني مسح حرف بيرجّعها "text" تلقائي).
 */
export function plateKeyboardMode(value: string, smart: boolean): "text" | "numeric" {
  if (!smart) return "text";
  return plateLetterCount(value) >= PLATE_LETTERS ? "numeric" : "text";
}

/** قراءة تفضيل الكيبورد الذكي من localStorage — الافتراضي false. */
export function readSmartKeyboard(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

/** كتابة تفضيل الكيبورد الذكي في localStorage (على جهاز المندوب). */
export function writeSmartKeyboard(on: boolean): void {
  try {
    if (on) localStorage.setItem(LS_KEY, "1");
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* تخزين معطّل — نتجاهل */
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════
 *  📥 **منقول من المعمل كما هو** — `plate-voice-lab/client/src/lib/textNormalize.ts`
 * ═════════════════════════════════════════════════════════════════════
 *
 * المنطق ده **مقيس على مقاعد المالك بحقيقة مكتوبة** — أي تعديل فيه لازم
 * يتقاس على نفس المقاعد. منقول عشان صفحة «التسجيل الجديد (تجربة)»
 * كانت بتاخد النوع **بالتوقيت وحده** فكانت بتحط نوع اللوحة الجارة
 * على لوحة المالك ماقالش لها نوع (بلاغ المالك، ٢٢ سبتمبر ٢٠٢٦).
 */

/**
 * ==========================================================================
 *  تطبيع النص العربي — الأساس اللي بيقف عليه كل المحرك
 * ==========================================================================
 *  محركات الصوت بترجّع نفس الكلمة بأشكال مختلفة:
 *  «ألف» / «الف» / «أَلْف» / «ألــف» — كلها نفس الحاجة.
 *  فبدل ما نكتب كل شكل في القاموس، بنطبّع الكلمة ونطبّع مفاتيح القاموس
 *  بنفس الدالة، فالمطابقة تحصل تلقائياً.
 */

/**
 * التشكيل + التطويل (الكشيدة) + علامات الوقف.
 * مكتوبة بأكواد يونيكود صريحة عشان الكود يفضل مقروء ومحدّد:
 *   ً-ٟ  التشكيل (فتحة/ضمة/كسرة/شدة/سكون…)
 *   ـ         التطويل ـ
 *   ٰ         الألف الخنجرية
 *   ۖ-ۭ  علامات الوقف القرآنية
 *   ࣰ-ࣿ  تشكيل موسّع
 */
const DIACRITICS = /[ً-ٟـٰۖ-ࣰۭ-ࣿ]/g;

/** علامات الترقيم العربية والإنجليزية اللي بتلزق بالكلام المفرغ */
const PUNCTUATION =
  /[.,،؛;:!؟?"'`«»“”()[\]{}\-–—_/\\|~^*+=<>@#$%&]/g;

/** الأرقام العربية-الهندية ٠-٩ والفارسية ۰-۹ */
const ARABIC_INDIC_OFFSET = 0x0660;
const EXTENDED_ARABIC_INDIC_OFFSET = 0x06f0;

/**
 * يحوّل أي أرقام هندية/فارسية لأرقام إنجليزية عادية.
 * «١٢٣٤» → «1234»
 */
export function toWesternDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= ARABIC_INDIC_OFFSET && code <= ARABIC_INDIC_OFFSET + 9) {
      out += String(code - ARABIC_INDIC_OFFSET);
    } else if (
      code >= EXTENDED_ARABIC_INDIC_OFFSET &&
      code <= EXTENDED_ARABIC_INDIC_OFFSET + 9
    ) {
      out += String(code - EXTENDED_ARABIC_INDIC_OFFSET);
    } else {
      out += ch;
    }
  }
  return out;
}

/** يشيل التشكيل والتطويل فقط، بدون أي تغيير في الحروف نفسها. */
export function stripDiacritics(input: string): string {
  return input.replace(DIACRITICS, "");
}

/**
 * مفتاح البحث في القواميس.
 * بيوحّد كل أشكال الهمزة والألف واليا والتا المربوطة عشان القاموس
 * ما يحتاجش يكتب كل شكل على حده.
 *
 *   «ألف» → «الف»    «مئة» → «ميه»    «ثلاثة» → «ثلاثه»
 */
export function lookupKey(input: string): string {
  return toWesternDigits(stripDiacritics(String(input)))
    .replace(PUNCTUATION, "")
    .replace(/[أإآٱء]/g, "ا") // أ إ آ ٱ ء → ا
    .replace(/[ىئ]/g, "ي") // ى ئ → ي
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ة/g, "ه") // ة → ه
    .trim();
}

/**
 * تطبيع لوحة للمطابقة: يشيل المسافات ويوحّد الحروف.
 * «أ ب ح 1234» → «ابح1234»
 */
export function normalizePlate(input: string): string {
  return lookupKey(input).replace(/\s+/g, "");
}

/**
 * يقسّم النص لكلمات مع الاحتفاظ بمكان كل كلمة في النص الأصلي.
 * المكان لازم عشان نربط اللوحة بتوقيتها في الصوت وقت المراجعة.
 */
export function splitWords(
  text: string
): Array<{ word: string; charStart: number; charEnd: number }> {
  const out: Array<{ word: string; charStart: number; charEnd: number }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ word: m[0], charStart: m.index, charEnd: m.index + m[0].length });
  }
  return out;
}

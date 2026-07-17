/**
 * أدوات نصية مشتركة لوحدات الـ pipeline
 * =====================================
 * منقولة سلوكياً من `plateParser.ts` (removeDiacritics / ARABIC_INDIC /
 * replaceAll) عشان الوحدات تشتغل بنفس منطق التطبيع الحالي بالظبط.
 */

/** خريطة الأرقام العربية-الهندية → غربية (منقولة من ARABIC_INDIC). */
export const ARABIC_INDIC: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** بيشيل التشكيل (نفس نطاق removeDiacritics في البارسر). */
export function removeDiacritics(text: string): string {
  return text.replace(/[ً-ٰٟ]/g, "");
}

/** بيحوّل الأرقام العربية-الهندية لغربية (نفس normalizeNumerals). */
export function normalizeNumerals(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => ARABIC_INDIC[d] ?? d);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * بيطبّق أزواج استبدال بحدود كلمة عربية — نفس منطق `replaceAll` في البارسر:
 * بيطابق بس لما المفتاح مش محاط بحروف عربية (يمنع «با» تاكل «دبا»)، وبيحيط كل
 * تطابق بمسافات. بيرجّع النص + قائمة الأزواج اللي اشتغلت فعلاً (للتتبّع).
 */
export function replacePairs(
  text: string,
  pairs: [string, string][]
): { text: string; applied: Array<{ from: string; to: string }> } {
  let result = text;
  const applied: Array<{ from: string; to: string }> = [];
  for (const [from, to] of pairs) {
    const re = new RegExp(
      `(?<![\\u0600-\\u06FF])${escapeRegExp(from)}(?![\\u0600-\\u06FF])`,
      "g"
    );
    if (re.test(result)) {
      applied.push({ from, to });
      result = result.replace(
        new RegExp(
          `(?<![\\u0600-\\u06FF])${escapeRegExp(from)}(?![\\u0600-\\u06FF])`,
          "g"
        ),
        ` ${to} `
      );
    }
  }
  return { text: result.replace(/\s+/g, " ").trim(), applied };
}

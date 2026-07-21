/**
 * منطق أعمدة شيت التشييك لصفحة «المطلوب» + استنتاج نوع السيارة.
 *
 * كتير من شيتات التشييك بتكتب «موديل/ماركة» السيارة في خانة اسمها «النوع»
 * (زي «النترا»، «بيكانتو»، «سيراتيو»). فلو خدنا العمود ده على إنه «نوع السيارة»
 * بيطلع غلط — المفروض ده الماركة. الدوال دي بتفصل صح:
 *   - الماركة     ← أفضل عمود ماركة/صانع، وإلا طراز/موديل، وإلا عمود «النوع».
 *   - نوع السيارة ← عمود «نوع» مستقل (لو مش هو نفسه اللي اتاخد كماركة)، وإلا
 *                   استنتاج من نص الماركة (ونيت/فان/دباب/نقل/باص/أجرة).
 */

function headerMatches(header: string, keywords: string[]): boolean {
  const hl = header.toLowerCase();
  return keywords.some((k) => header.includes(k) || hl.includes(k.toLowerCase()));
}

/** أول عمود اسمه بيطابق أي كلمة من الكلمات المفتاحية، وإلا null. */
export function findHeader(headers: string[], keywords: string[]): string | null {
  for (const h of headers) if (headerMatches(h, keywords)) return h;
  return null;
}

export interface CheckColumns {
  brandCol: string | null;
  typeCol: string | null;
  bankCol: string | null;
}

/**
 * بيحدد أعمدة الماركة / نوع السيارة / البنك من رؤوس شيت التشييك.
 * - عمود ماركة حقيقي (ماركة/صانع/vehicle name) له الأولوية، وإلا طراز/موديل،
 *   وإلا عمود «النوع» (لأن بعض الشيتات بتكتب الموديل هناك).
 * - عمود نوع السيارة = عمود «نوع/فئة» — بشرط ما يكونش هو نفسه اللي اتاخد كماركة.
 */
export function resolveCheckColumns(headers: string[]): CheckColumns {
  // البنك الأول — «شرك» مقصود مش موجود (بيمسك «الشركة المصنعة» ماركة بالغلط).
  const bankCol = findHeader(headers, ["البنك", "بنك", "جهة", "تمويل", "bank", "agency", "f-account"]);
  // نستبعد عمود البنك من ترشيحات الماركة/النوع — عشان «نوع البنك» مايتحسبش «نوع
  // سيارة» (بيطابق «نوع») ويتسرق من عمود البنك.
  const pool = headers.filter((h) => h !== bankCol);
  const brandReal = findHeader(pool, ["ماركة", "الماركه", "صانع", "المصنّعة", "المصنعة", "vehicle name"]);
  const modelCol = findHeader(pool, ["طراز", "موديل", "model"]);
  const typeRaw = findHeader(pool, ["نوع", "فئة"]);

  const brandCol = brandReal || modelCol || typeRaw;
  const typeCol = typeRaw && typeRaw !== brandCol ? typeRaw : null;
  return { brandCol, typeCol, bankCol };
}

// ترتيب الأولوية مهم: الأكثر تحديداً الأول.
const TYPE_KEYWORDS: Array<[string, string[]]> = [
  ["ونيت", ["ونيت", "wanit", "pickup"]],
  ["فان", ["فان", "van"]],
  ["دباب", ["دباب", "دراجة", "دراجه", "موتوسيكل", "موتور", "motorcycle"]],
  ["نقل", ["نقل", "شاحنة", "شاحنه", "تريلا", "قلاب", "truck", "trailer"]],
  ["باص", ["باص", "روزا", "كوستر", "حافلة", "حافله", "ميكروباص", "bus"]],
  ["أجرة", ["اجرة", "أجرة", "اجره", "أجره", "تكسي", "taxi"]],
];

/**
 * بيستنتج نوع السيارة (ونيت/فان/دباب/نقل/باص/أجرة) من نص الماركة/الموديل.
 * بيقارن كلمات كاملة بس — عشان «فانتج» مايتلخبطش بـ«فان». يرجّع "" لو مفيش نوع واضح.
 */
export function inferVehicleType(text: string): string {
  if (!text) return "";
  const tokens = text
    .split(/[\s،,\/\\.\-_()]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return "";
  for (const [label, kws] of TYPE_KEYWORDS) {
    if (tokens.some((tok) => kws.includes(tok))) return label;
  }
  return "";
}

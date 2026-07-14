// Preferred columns to auto-select in sort results — matched against actual
// uploaded file headers. Matching is case-insensitive (see matchesPreferred),
// so English headers like "COLOR"/"Color"/"color" all hit.
export const PREFERRED_COLS = [
  // Brand / Manufacturer / Model
  "الماركة", "ماركة", "ماركه",
  "طراز", "طراز المركبة",
  "صانع", "صانع المركبة",
  "Vehicle", "Vehicle Name", "Make", "Manufacturer", "Model", "Brand",
  // GPS / Location link
  "GPS", "جي بي اس", "الموقع",
  // Vehicle type
  "النوع", "نوع السيارة", "نوع المركبة", "TYPE OF CAR", "Type of Car", "Car Type",
  // District
  "الحي", "حي",
  // Color
  "لون السيارة", "اللون", "لون", "COLOR", "Color", "لون المركبة", "لون المركبة الأساسي",
  // Year
  "سنة الصنع", "السنة", "سنة", "موديل", "Year Model", "Year",
];

// Columns that must always appear in results — user cannot hide them (🔒).
// GPS + الحي + الشارع تظهر تلقائياً مع كل نتيجة فرز ولا يمكن إخفاؤها.
export const MANDATORY_COLS = [
  // Street / Address
  "الشارع", "شارع", "العنوان", "عنوان",
  // GPS / Location link
  "GPS", "جي بي اس", "الموقع",
  // District
  "الحي", "حي",
];

export function isMandatory(header: string): boolean {
  const h = header.trim().toLowerCase();
  return MANDATORY_COLS.some((m) => {
    const mm = m.toLowerCase();
    return h === mm || h.includes(mm) || mm.includes(h);
  });
}

export function matchesPreferred(header: string): boolean {
  const h = header.trim().toLowerCase();
  if (!h) return false;
  return PREFERRED_COLS.some((p) => {
    const pp = p.toLowerCase();
    return h === pp || h.includes(pp) || pp.includes(h);
  });
}

// ─── كشف عمود «اسم/موديل السيارة» (كورولا/يارس/أزيرا/هايلوكس...) ────────────
// العمود ده بييجي بأسماء عمود مختلفة كتير (صانع المركبة / الماركة / النوع /
// Vehicle Name / Model ...) أو باسم غير متوقع، وأحياناً القيم نفسها هي الدليل
// الوحيد. فبنكتشفه بطريقتين: (١) اسم العمود، (٢) لو فشل → محتوى القيم.

// أسماء أعمدة صريحة لاسم/صانع/موديل المركبة. «النوع» مقصود مش موجود هنا لأنه
// ملتبس (ممكن يكون نوع الهيكل: ونيت/صالون) — الكشف بالمحتوى بيحسم الحالة دي.
export const MAKE_MODEL_HEADER_ALIASES = [
  "صانع المركبة", "صانع", "الماركة", "ماركة", "ماركه",
  "طراز المركبة", "طراز", "الطراز", "موديل", "الموديل", "اسم المركبة", "اسم السيارة",
  "vehicle name", "vehicle", "make", "manufacturer", "model", "brand", "car name", "car model",
];

// قاموس أسماء السيارات الشائعة في السوق السعودي (ماركات + موديلات، عربي +
// إنجليزي). المطابقة بالاحتواء (substring)، فـ«تويوتا كورولا ٢٠٢٠» بيطابق.
// بيتقارن نسبة الخلايا اللي فيها اسم سيارة في كل عمود، وبيتاخد الأعلى.
export const CAR_NAMES = [
  // ماركات (AR)
  "تويوتا", "نيسان", "هيونداي", "هونداي", "كيا", "هوندا", "فورد", "شيفروليه", "شفروليه",
  "جمس", "جي ام سي", "لكزس", "لكسز", "مرسيدس", "بي ام", "مازدا", "ميتسوبيشي", "رينو",
  "بيجو", "سوزوكي", "دايهاتسو", "جيلي", "شانجان", "شانقان", "هافال", "ام جي", "دودج",
  "جيب", "لاند روفر", "رنج روفر", "رانج روفر", "انفنيتي", "كرايسلر", "كاديلاك",
  "فولكس", "سكودا", "ايسوزو", "ايزوزو", "دايو", "تشيري", "بروتون", "جريت وول", "بايك",
  // موديلات (AR)
  "كورولا", "كامري", "يارس", "افالون", "هايلوكس", "هيلوكس", "لاندكروزر", "لاند كروزر",
  "برادو", "فورتشنر", "راف فور", "هايس", "سيكويا", "تندرا", "تاكوما", "كرولا",
  "صني", "سنترا", "التيما", "ماكسيما", "باترول", "باثفايندر", "اكس تريل", "نافارا",
  "تيدا", "مورانو", "ارمادا", "جوك", "كيكس", "سيفيك", "اكورد", "سيتي", "بايلوت",
  "النترا", "إلنترا", "اكسنت", "اكسينت", "سوناتا", "ازيرا", "أزيرا", "توسان", "سنتافي",
  "فيلوستر", "كريتا", "باليسيد", "سيراتو", "ريو", "سبورتاج", "سورينتو", "اوبتيما",
  "كادينزا", "بيكانتو", "كارنيفال", "سيلتوس", "تاهو", "سوبربان", "سلفرادو", "ماليبو",
  "كابرس", "كابريس", "كروز", "افيو", "دورانجو", "تشارجر", "تشالنجر",
  // أنواع/هياكل بتتقال كموديل
  "بكب", "غمارة", "غمارتين", "ونيت", "دباب",
  // Makes / models (EN)
  "toyota", "nissan", "hyundai", "kia", "honda", "ford", "chevrolet", "gmc", "lexus",
  "mercedes", "bmw", "mazda", "mitsubishi", "renault", "peugeot", "suzuki", "daihatsu",
  "geely", "changan", "haval", "dodge", "jeep", "land rover", "range rover", "infiniti",
  "chrysler", "cadillac", "volkswagen", "skoda", "isuzu", "chery",
  "corolla", "camry", "yaris", "avalon", "hilux", "landcruiser", "land cruiser", "prado",
  "fortuner", "rav4", "hiace", "sequoia", "tundra", "tacoma", "sunny", "sentra", "altima",
  "maxima", "patrol", "pathfinder", "x-trail", "navara", "tiida", "murano", "armada",
  "civic", "accord", "pilot", "elantra", "accent", "sonata", "azera", "tucson", "santafe",
  "veloster", "creta", "palisade", "cerato", "rio", "sportage", "sorento", "optima",
  "cadenza", "picanto", "carnival", "seltos", "tahoe", "suburban", "silverado", "malibu",
  "caprice", "cruze", "aveo", "durango", "charger", "challenger",
];

const CAR_NAMES_LC = CAR_NAMES.map((c) => c.toLowerCase());

/** هل القيمة دي شكلها اسم/موديل سيارة؟ (مطابقة بالاحتواء ضد القاموس). */
export function looksLikeCarName(value: string): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  if (v.length < 2) return false;
  return CAR_NAMES_LC.some((c) => v.includes(c));
}

/**
 * يكتشف عمود اسم/موديل المركبة. أولاً باسم العمود (aliases)، وإلا بفحص محتوى
 * القيم — العمود اللي أعلى نسبة قيمه أسماء سيارات (>=30%) بيتختار. بيرجّع null
 * لو مفيش عمود واضح.
 */
export function detectMakeModelColumn(
  headers: string[],
  rows?: Record<string, string>[],
  exclude?: string | null,
): string | null {
  const cols = headers.filter((h) => h && h !== exclude);

  // (١) مطابقة اسم العمود.
  const byHeader = cols.find((h) => {
    const hl = h.trim().toLowerCase();
    return MAKE_MODEL_HEADER_ALIASES.some((a) => hl === a || hl.includes(a) || a.includes(hl));
  });
  if (byHeader) return byHeader;

  // (٢) فحص المحتوى — عيّنة من أول ٨٠ صف لكل عمود.
  if (!rows || rows.length === 0) return null;
  const sample = rows.slice(0, 80);
  let best: string | null = null;
  let bestRatio = 0;
  for (const h of cols) {
    let hits = 0, nonEmpty = 0;
    for (const r of sample) {
      const v = String(r[h] ?? "").trim();
      if (!v) continue;
      nonEmpty++;
      if (looksLikeCarName(v)) hits++;
    }
    if (nonEmpty >= 3) {
      const ratio = hits / nonEmpty;
      if (ratio > bestRatio) { bestRatio = ratio; best = h; }
    }
  }
  return bestRatio >= 0.3 ? best : null;
}

export function guessDefaultColumns(headers: string[], exclude?: string | null): string[] {
  const filtered = headers.filter((h) => h !== exclude);
  const preferred = filtered.filter(matchesPreferred);
  return preferred.length > 0 ? preferred : filtered;
}

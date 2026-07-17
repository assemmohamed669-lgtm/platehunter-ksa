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
  // Date — تاريخ الرصد/التفريغ. مفيد يظهر في نتيجة الفرز (المستخدم طلبه صراحةً؛
  // كان مستبعَد قبل كده). يغطّي كمان الشيتات بدون عناوين اللي بنسمّي عمودها «التاريخ».
  // ملاحظة: «Date» الإنجليزي اتشال — المطابقة بالاحتواء كانت بتطابق «Update»/«Last Update»
  // غلط. الشيتات بدون عناوين بتتسمّى بالعربي «التاريخ» فمحتاجهاش.
  "التاريخ", "تاريخ",
];

// Columns that must always appear in results — user cannot hide them (🔒).
// GPS + الحي + الشارع تظهر تلقائياً مع كل نتيجة فرز ولا يمكن إخفاؤها.
export const MANDATORY_COLS = [
  // Street / Address
  "الشارع", "شارع", "العنوان", "عنوان",
  // GPS / Location link
  "GPS", "جي بي اس", "الموقع",
  // District — أسماء أوسع عشان «الحي» يظهر تلقائياً في أي فرز مهما كان اسم العمود
  "الحي", "حي", "الحى", "حى", "المنطقة", "منطقة", "المدينة", "مدينة",
  "district", "area", "neighborhood", "neighbourhood", "city", "region",
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
  "صانع المركبة", "صانع", "الصانع", "الماركة", "ماركة", "ماركه", "الماركه",
  "طراز المركبة", "طراز", "الطراز", "طرازالمركبة", "موديل", "الموديل", "موديل السيارة",
  "موديل المركبة", "اسم المركبة", "اسم السيارة",
  "vehicle name", "make", "manufacturer", "model", "car model", "car name", "brand",
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
  // موديلات/ماركات إضافية شائعة في السوق السعودي (أسماء واضحة ≥4 حروف فقط عشان
  // نتجنّب مطابقة خاطئة داخل كلمات تانية).
  "اكسبيدشن", "اكسبلورر", "رينجر", "يوكن", "سييرا", "اكاديا", "تيرين",
  "جيتا", "باسات", "تيجوان", "توارق", "جولف",
  "هايماكس", "لوجان", "سانديرو", "ديستر", "كابتشر", "ميجان", "فيرنا",
  "ماجنتس", "امجراند", "كولراي", "بينراي", "جوليان", "لاندمارك",
  "expedition", "explorer", "ranger", "yukon", "sierra", "acadia", "terrain",
  "jetta", "passat", "tiguan", "touareg", "golf", "duster", "logan", "megane",
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
 * يكتشف عمود اسم/موديل المركبة. الأولوية **للمحتوى** — العمود اللي قيمه أسماء
 * سيارات فعلاً (أعلى نسبة، >=35%) — لأن اسم العمود بيتغير كتير وأحياناً بيبقى
 * ملتبس (زي «النوع» اللي ممكن يكون موديل أو نوع هيكل). لو المحتوى مش حاسم
 * (مفيش صفوف أو مفيش عمود واضح) بنرجع لمطابقة اسم العمود كـfallback.
 */
export function detectMakeModelColumn(
  headers: string[],
  rows?: Record<string, string>[],
  exclude?: string | null,
): string | null {
  const cols = headers.filter((h) => h && h !== exclude);

  // (١) الكشف بالمحتوى أولاً — عيّنة من أول ٨٠ صف لكل عمود.
  if (rows && rows.length > 0) {
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
    if (bestRatio >= 0.30) return best;
  }

  // (٢) fallback: مطابقة اسم العمود (لو المحتوى مش حاسم أو مفيش صفوف).
  const byHeader = cols.find((h) => {
    const hl = h.trim().toLowerCase();
    return MAKE_MODEL_HEADER_ALIASES.some((a) => hl === a || hl.includes(a) || a.includes(hl));
  });
  return byHeader ?? null;
}

export function guessDefaultColumns(headers: string[], exclude?: string | null): string[] {
  const filtered = headers.filter((h) => h !== exclude);
  const preferred = filtered.filter(matchesPreferred);
  return preferred.length > 0 ? preferred : filtered;
}

/**
 * منطق مطابقة شهادة السحب — تطبيع اللوحة/الشاص للبحث في Google Drive.
 *
 * الشهادات في درايف متسمّية باللوحة بأشكال مختلفة: «د و ا 8403.pdf»، «8403-د و م.pdf»،
 * أرقام عربي أو إنجليزي، بمسافات أو ملزوقة. عشان أي شكل يطابق، بنحوّل الكل لـ**مفتاح
 * موحّد**: الحروف العربية + الأرقام اللاتينية، بترتيب ثابت (حروف ثم أرقام)، بدون مسافات.
 */

/** يحوّل الأرقام العربية (٠-٩) للاتينية (0-9). */
export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
          .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/**
 * رقم شاص (VIN)؟ = ١١-١٧ حرف/رقم لاتيني متّصلة، فيها حروف وأرقام (مش لوحة سعودية
 * اللي حروفها عربي). بنشيل المسافات والشرطات قبل الفحص.
 */
export function looksLikeChassis(input: string): boolean {
  const t = input.replace(/[\s\-_.]/g, "");
  return /^[A-Za-z0-9]{11,17}$/.test(t) && /[A-Za-z]/.test(t) && /[0-9]/.test(t);
}

/**
 * رقم شهادة/عقد؟ زي `REPO-211-00265929` أو `CRN-...` أو رقم طويل (٦+ أرقام) بدون
 * حروف عربية. اللوحة السعودية حروفها عربي + ٤ أرقام، فمابتتلغبطش مع ده.
 */
export function looksLikeCertNumber(input: string): boolean {
  const t = input.trim();
  if (/repo|crn/i.test(t)) return true;
  if (/[؀-ۿ]/.test(t)) return false;                 // فيه حروف عربية = لوحة مش رقم شهادة
  return t.replace(/\D/g, "").length >= 6;            // رقم طويل = شهادة (مش أرقام لوحة الأربعة)
}

/** أرقام اللوحة (للبحث في درايف باسم الملف). آخر جروب أرقام في المدخل. */
export function plateDigits(input: string): string {
  const runs = toLatinDigits(input).match(/[0-9]{2,4}/g);
  return runs ? runs[runs.length - 1] : "";
}

/**
 * المفتاح الموحّد للوحة أو اسم ملف: حروف عربية + أرقام لاتينية، حروف ثم أرقام،
 * بدون مسافات/شرطات/امتداد. فـ«د و ا 8403.pdf» و«8403-د و ا» و«٨٤٠٣ دوا» كلهم
 * بيدّوا نفس المفتاح «دوا8403».
 */
export function plateCertKey(s: string): string {
  const t = toLatinDigits(s)
    .replace(/[أإآ]/g, "ا")   // أ/إ/آ → ا
    .replace(/ى/g, "ي");                 // ى → ي
  const letters = (t.match(/[؀-ۿ]+/g) || []).join("");
  const digits = (t.match(/[0-9]+/g) || []).join("");
  return letters + digits;
}

/** من قائمة أسماء ملفات درايف، رجّع اللي مفتاحها = مفتاح المدخل (لوحة). */
export function matchCertFiles<T extends { name: string }>(plateInput: string, files: T[]): T[] {
  const key = plateCertKey(plateInput);
  if (!key) return [];
  return files.filter((f) => plateCertKey(f.name) === key);
}

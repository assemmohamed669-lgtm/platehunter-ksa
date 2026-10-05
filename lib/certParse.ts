/**
 * 📄 قراية بيانات شهادة السحب من الكلام اللي جوّه الملف (منطق نقي — السيرفر بس).
 *
 * المالك (٥ أكتوبر ٢٠٢٦): «كل شهادة فيها رقم لوحه سيارة وفيها بيانات السيارة وتبع اي بنك …
 * في شهايد بيبقي اسم الملف بتاعها رقم اللوحه فقط ارقام 8377 بس من جواها رقم اللوحه هو رلي8377 …
 * وفيه شهايد ممكن تكون ب رقم الشاص … لكن جوة الملف نفسه هتلاقي رقم اللوحه».
 *
 * الشهايد اللي على درايف كلام مكتوب (مش صور). نوعين اتشافوا:
 *  · «توثيق» (TawtheeqCo): الجديدة «الخانة: القيمة» في نفس السطر؛ القديمة الخانات في حتة والقيم
 *    في حتة تانية — فبندوّر على **شكل القيمة** نفسها (لوحة/شاص/سنة) مش بس على الخانة.
 *  · «السجل السعودي لعقود الإيجار التمويلي» (sijil.sa): العربي متلخبط جوّه الملف — اللوحة
 *    بالحروف الإنجليزي (8377JGR) والشاص والتواريخ مقروءين؛ الباقي بيفضل فاضي.
 *
 * **مفيش أي بيانات شخصية بتتطلّع** (اسم المستأجر/هويته/تليفونه/عنوانه) — بيانات العربية والبنك
 * (المؤجر) والعقد بس. ومن غير «lookbehind» في أي regex (الآيفون القديم).
 */
import { bankPlateToArabic, normalizePlate } from "./plateParser";
import { plateOf } from "./certStats";

export interface CertFields {
  /** مفتاح اللوحة المطبّع (زي باقي البرنامج) — "" لو مالقيناهاش. */
  plate: string;
  /** اللوحة للعرض: «د ل س 8377». */
  plateText: string;
  vin: string;
  /** البنك/الشركة صاحبة العقد (المؤجر). */
  bank: string;
  make: string;
  model: string;
  year: string;
  color: string;
  /** حالة العقد (متعثر/نشط …). */
  status: string;
  /** تاريخ الشهادة «dd/mm/yyyy». */
  certDate: string;
  issuer: "tawtheeq" | "sijil" | "";
}

/** حروف اللوحات السعودية (بعد توحيد أ/إ/آ ⇒ ا و ى ⇒ ي). */
const AR_PLATE_LETTERS = new Set("ابحدرسصطعقكلمنهوي".split(""));

function cleanText(t: string): string {
  return String(t ?? "")
    .normalize("NFKC")                                  // أشكال الحروف المتصلة ⇒ الحرف العادي
    .replace(/ـ/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[ ‏‎‪-‮]/g, " ");
}

const normLetter = (c: string) => c.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");

interface Cand { key: string; display: string; index: number; digits: string; arabic: boolean }

/** «ا ب ح 1234» / «1234 ا ب ح» — حروف لوحدها بينها مسافات (مش كلمة). */
function arabicPlates(text: string): Cand[] {
  const out: Cand[] = [];
  const LET = "[\\u0621-\\u064A]";
  const lettersFirst = new RegExp(`(^|[^\\u0600-\\u06FF\\d])(${LET}(?:[ \\t]+${LET}){1,2})[ \\t]+(\\d{1,4})(?!\\d)`, "g");
  const digitsFirst = new RegExp(`(^|[^\\d])(\\d{1,4})[ \\t]+(${LET}(?:[ \\t]+${LET}){1,2})(?![\\u0600-\\u06FF])`, "g");
  const push = (lettersRaw: string, digits: string, index: number) => {
    const letters = lettersRaw.split(/[ \t]+/).map(normLetter);
    if (!letters.every((l) => AR_PLATE_LETTERS.has(l))) return;
    const display = `${letters.join(" ")} ${digits}`;
    out.push({ key: normalizePlate(bankPlateToArabic(letters.join("") + digits)), display, index, digits, arabic: true });
  };
  for (const m of text.matchAll(lettersFirst)) push(m[2], m[3], (m.index ?? 0) + m[1].length);
  for (const m of text.matchAll(digitsFirst)) push(m[3], m[2], (m.index ?? 0) + m[1].length);
  return out;
}

/** «8377JGR» / «JGR 8377» — حروف اللوحات الإنجليزي بس، ومش جوّه رقم (SAR 38,392). */
function latinPlates(text: string): Cand[] {
  const out: Cand[] = [];
  const L = "[ABDEGHJKLNRSTUVXZ]";
  const digitsFirst = new RegExp(`(^|[^A-Za-z0-9])(\\d{1,4})[ \\t]*(${L}{2,3})(?![A-Za-z0-9])`, "g");
  const lettersFirst = new RegExp(`(^|[^A-Za-z0-9])(${L}{2,3})[ \\t]*(\\d{1,4})(?![A-Za-z0-9,.])`, "g");
  const push = (raw: string, digits: string, index: number) => {
    const ar = bankPlateToArabic(raw);
    const key = normalizePlate(ar);
    if (!key) return;
    const letters = ar.replace(/[0-9]/g, "").split("");
    out.push({ key, display: `${letters.join(" ")} ${digits}`, index, digits, arabic: false });
  };
  for (const m of text.matchAll(digitsFirst)) push(m[2] + m[3], m[2], (m.index ?? 0) + m[1].length);
  for (const m of text.matchAll(lettersFirst)) push(`${m[2]} ${m[3]}`, m[3], (m.index ?? 0) + m[1].length);
  return out;
}

function pickPlate(text: string, fileName: string): { key: string; display: string } {
  const nameDigits = (fileName.replace(/\.[A-Za-z0-9]{2,4}$/, "").match(/\d{1,4}/) ?? [""])[0];
  const label = text.search(/رقم\s*اللوحة/);
  const cands = [...arabicPlates(text), ...latinPlates(text)];
  let best: Cand | null = null;
  let bestScore = -1;
  for (const c of cands) {
    let score = c.arabic ? 2 : 1;
    if (label >= 0 && c.index > label && c.index - label < 120) score += 3;
    if (nameDigits && c.digits === nameDigits) score += 2;
    if (score > bestScore || (score === bestScore && best && c.index < best.index)) { best = c; bestScore = score; }
  }
  if (best) return { key: best.key, display: best.display };
  // من اسم الملف لو اسمه لوحة
  const base = fileName.replace(/\.[A-Za-z0-9]{2,4}$/, "").replace(/_\d+$/, "").trim();
  if (plateOf(base)) {
    const ar = bankPlateToArabic(base);
    const key = normalizePlate(ar);
    const letters = ar.replace(/[^ء-ي]/g, "").split("").map(normLetter);
    const digits = ar.replace(/\D/g, "");
    return { key, display: letters.length ? `${letters.join(" ")} ${digits}` : digits };
  }
  return { key: "", display: "" };
}

function pickVin(text: string): string {
  for (const m of text.matchAll(/(^|[^A-Za-z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Za-z0-9])/g)) {
    const v = m[2];
    if (/[A-Z]/.test(v) && /\d/.test(v)) return v;
  }
  return "";
}

/** كلمة بتقول إنها جهة (بنك/شركة تمويل) — والأسطر الثابتة في كل شهادة مستبعدة. */
const ORG = /(مصرف|بنك|شركة|للتمويل|تمويل|التأجير|التاجير|الراجحي|الأهلي|الاهلي|البلاد|الجزيرة|الإنماء|الانماء|اليسر|الراية|جميل|أملاك|املاك)/;
const BOILER = /(توثيق|سحب|تسجيل عقود|وزارة|الوثيقة|السند|Tawtheeq|الصفة)/;

function pickBank(text: string): string {
  const trimVal = (v: string) => v.split(/رقم التواصل|الجنسية|رقم الهوية|\d{3,}/)[0].replace(/[:\s]+$/, "").trim();
  for (const m of text.matchAll(/(?:الاسم|االسم)\s*:[ \t]*([^\n]+)/g)) {
    const v = trimVal(m[1]);
    if (v && v.length <= 50 && ORG.test(v) && !BOILER.test(v)) return v;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line && line.length <= 40 && !line.includes(":") && ORG.test(line) && !BOILER.test(line)) return line;
  }
  return "";
}

const MAKES = [
  "تويوتا", "هيونداي", "هونداي", "نيسان", "كيا", "فورد", "شيفروليه", "شفروليه", "جي ام سي", "جمس", "لكزس",
  "مرسيدس", "بي ام دبليو", "رينو", "دودج", "جيب", "مازدا", "ميتسوبيشي", "متسوبيشي", "هوندا", "شانجان", "جيلي",
  "ام جي", "شيري", "سوزوكي", "ايسوزو", "إيسوزو", "فولكس واجن", "فولكس", "اودي", "أودي", "كرايسلر", "لاند روفر",
  "رنج روفر", "بورش", "كاديلاك", "لينكولن", "انفينيتي", "إنفينيتي", "هافال", "جاك", "بايك", "جريت وول", "فاو",
  "بيستون", "هونشي", "جيتور", "اكسيد", "جينيسيس", "جنسس", "سانج يونج", "بيجو", "ستروين", "فيات", "فولفو", "ميني",
  "جاكوار", "مازيراتي", "بنتلي", "داتسون", "دايهاتسو", "هينو", "بي واي دي",
];

function wordIn(text: string, word: string): boolean {
  const i = text.indexOf(word);
  if (i < 0) return false;
  const before = i > 0 ? text[i - 1] : " ";
  const after = text[i + word.length] ?? " ";
  const isAr = (c: string) => /[ء-ي]/.test(c);
  return !isAr(before) && !isAr(after);
}

/** «الخانة: القيمة» في نفس السطر (أول كلمتين/تلاتة). */
function labelValue(text: string, label: RegExp, maxWords = 3): string {
  const m = text.match(label);
  if (!m) return "";
  const v = (m[1] ?? "").trim();
  if (!v || /[:：]/.test(v)) return "";
  return v.split(/\s+/).slice(0, maxWords).join(" ");
}

const ASSET = "(?:الأصل|األصل|الاصل|االصل)";

function pickMake(text: string): string {
  const v = labelValue(text, /المصنع\s*:[ \t]*([^\n:]+)/, 2);
  if (v && !/التامين|التأمين/.test(v)) return v;
  for (const mk of MAKES) if (wordIn(text, mk)) return mk;
  return "";
}

function pickModel(text: string): string {
  const v = labelValue(text, new RegExp(`نوع\\s*${ASSET}\\s*:[ \\t]*([^\\n:]+)`), 3);
  return v && !/الملكية|وثيقة|مستند/.test(v) ? v : "";
}

function pickColor(text: string): string {
  return labelValue(text, new RegExp(`لون\\s*${ASSET}\\s*:[ \\t]*([^\\s:]+)`), 1);
}

function pickYear(text: string): string {
  const v = text.match(/سنة\s*الصنع\s*:[ \t]*(\d{4})/);
  if (v) return v[1];
  const max = new Date().getFullYear() + 1;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^\d{4}$/.test(line)) {
      const y = Number(line);
      if (y >= 1980 && y <= max) return line;
    }
  }
  return "";
}

const STATUSES = ["متعثر", "نشط", "منتهي", "مفسوخ", "ملغي", "مسدد"];

function pickStatus(text: string): string {
  const v = labelValue(text, /حالة\s*العقد\s*:[ \t]*([^\s:]+)/, 1);
  if (v && STATUSES.includes(v)) return v;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (STATUSES.includes(line)) return line;
  }
  return v;
}

const pad2 = (n: string) => n.padStart(2, "0");
const fmtDate = (d: string, m: string, y: string) => `${pad2(d)}/${pad2(m)}/${y}`;

function pickCertDate(text: string): string {
  const DATE = "(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})";
  for (const label of ["تاريخ\\s*(?:اصدار|إصدار)\\s*السند", "تاريخ\\s*طباعة\\s*الشهادة"]) {
    const m = text.match(new RegExp(`${label}\\s*:[ \\t]*(?:\\d{1,2}:\\d{2}:\\d{2}[ \\t]+)?${DATE}`));
    if (m) return fmtDate(m[1], m[2], m[3]);
  }
  // من غير خانة (السجل السعودي) ⇒ أحدث تاريخ ميلادي في الشهادة
  let best = "";
  let bestKey = "";
  for (const m of text.matchAll(new RegExp(DATE, "g"))) {
    const y = Number(m[3]);
    if (y < 2000 || y > 2100) continue;
    const key = `${m[3]}${pad2(m[2])}${pad2(m[1])}`;
    if (key > bestKey) { bestKey = key; best = fmtDate(m[1], m[2], m[3]); }
  }
  return best;
}

export function parseCertText(rawText: string, fileName = ""): CertFields {
  const text = cleanText(rawText);
  const issuer: CertFields["issuer"] = /توثيق|TawtheeqCo/i.test(text)
    ? "tawtheeq"
    : /sijil\.sa|Saudi Finance Leasing Contracts Registry/i.test(text) ? "sijil" : "";
  const plate = pickPlate(text, fileName);
  return {
    plate: plate.key,
    plateText: plate.display,
    vin: pickVin(text),
    bank: pickBank(text),
    make: pickMake(text),
    model: pickModel(text),
    year: pickYear(text),
    color: pickColor(text),
    status: pickStatus(text),
    certDate: pickCertDate(text),
    issuer,
  };
}

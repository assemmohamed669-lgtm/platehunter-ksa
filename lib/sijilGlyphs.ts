/**
 * ══════════════════════════════════════════════════════════════════════
 *  📄 فك رموز شهايد «السجل السعودي» (sijil.sa)
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (١٤ أكتوبر ٢٠٢٦): شيت الشهايد طلع فيه اللوحة والهيكل ورقم العقد
 * بس — ونوع المركبة والمصنع واللون والمؤجر والمستأجر **كلهم فاضيين** (٠ من ١٩٩).
 *
 * السبب: الشهايد دي بتخزّن العربي بخط مالوش جدول حروف حقيقي، فاللي بيطلع من
 * الملف رموز غريبة (`௛͖̻̺͙̚` بدل «المؤجر»). اللي اشتغل اشتغل لأنه إنجليزي وأرقام.
 *
 * والعربي **مش ضايع** — الرموز استبدال ثابت، ونفس الجدول في كل الشهايد (اتأكدنا
 * إن نفس السطر بنفس الرموز بالحرف في ٤ ملفات). والنص متخزّن **مقلوب**.
 *
 * `lib/sijilGlyphs.map.ts` هو الجدول (مولَّد من ٤ شهايد حقيقية + صورة محتواها).
 */
import { SIJIL_GLYPHS } from "./sijilGlyphs.map";

const ARABIC = /[ء-ي]/;

/** رمز من رموز الخط — برّه ASCII ومش حرف عربي حقيقي. */
function isGlyph(ch: string): boolean {
  return ch.codePointAt(0)! > 0x7f && !ARABIC.test(ch);
}

/**
 * الملف ده من «السجل» وعربيه مرمّز؟
 *
 * بنشوف نسبة الرموز اللي نعرفها — شهادة «توثيق» (عربيها سليم) بترجع صفر تقريباً،
 * فمابنلمسش نصها خالص.
 */
export function looksLikeSijilGlyphs(text: string): boolean {
  let known = 0;
  let all = 0;
  for (const ch of text) {
    if (!isGlyph(ch)) continue;
    all++;
    if (SIJIL_GLYPHS[ch]) known++;
  }
  // شوية رموز متفرقة (علامة ± مثلاً) مش معناها شهادة «سجل».
  return known >= 8 && known >= all * 0.6;
}

/**
 * المسافات الزيادة جوّه الكلمة — الملف بيقطّع الكلمة أحياناً («تويو تا»).
 * بنلزق أي قطعة من حرف أو حرفين باللي قبلها: «تويو تا» ⇒ «تويوتا»،
 * «الأهل ي» ⇒ «الأهلي». الكلمات العادية (٣ حروف فأكتر) مابتتلزقش.
 */
function mergeStrayFragments(s: string): string {
  const parts = s.split(" ");
  const out: string[] = [];
  for (const p of parts) {
    const isFragment = p.length > 0 && p.length <= 2 && ARABIC.test(p[0]);
    if (isFragment && out.length && ARABIC.test(out[out.length - 1].slice(-1))) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.join(" ").replace(/ {2,}/g, " ");
}

/**
 * بيفك سطر: المقاطع العربي بتتقلب وتترجم، والأرقام واللاتيني بيفضلوا زي ما هم
 * وفي ترتيبهم (زي ما المتصفّح بيعرض النص ثنائي الاتجاه).
 */
function decodeToken(tok: string): string {
  // الكلمة العربي متخزّنة مقلوبة؛ الأرقام واللاتيني جوّه نفس الكلمة بيفضلوا بترتيبهم.
  const out: string[] = [];
  let latin = "";
  for (const ch of [...tok].reverse()) {
    if (isGlyph(ch) || ARABIC.test(ch)) {
      if (latin) { out.push([...latin].reverse().join("")); latin = ""; }
      out.push(isGlyph(ch) ? SIJIL_GLYPHS[ch] ?? "" : ch);
    } else latin += ch;
  }
  if (latin) out.push([...latin].reverse().join(""));
  return out.join("");
}

function decodeLine(line: string): string {
  // كلمة كلمة، وترتيب الكلمات بيتقلب — أوضح وأأمن من قلب السطر كله لما يكون
  // فيه عربي وإنجليزي مع بعض (رقم الهيكل وسط الكلام).
  const decoded = line.split(/\s+/).filter(Boolean).map(decodeToken).reverse().join(" ");
  return mergeStrayFragments(decoded);
}

/**
 * بيفك نص الشهادة كله. لو الملف مش من «السجل» بيرجّعه **زي ما هو** من غير أي لمس.
 */
export function decodeSijilText(text: string): string {
  if (!looksLikeSijilGlyphs(text)) return text;
  return text.split("\n").map(decodeLine).join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════
 *  استخراج خانات «السجل» بالعناوين
 * ══════════════════════════════════════════════════════════════════════
 *
 * الملف بيقطّع الكلمة أحياناً ويلزق آخرها بالعنوان اللي بعدها («تويو تارقم»)،
 * فالاعتماد على المسافات بيضيّع القيمة. بندوّر على العنوان **بمسافات اختيارية
 * بين حروفه** وناخد اللي بينه وبين العنوان اللي بعده.
 *
 * القيم اللي كلمة واحدة (المصنع/النوع/اللون) بتتشال منها المسافات؛ الأسامي
 * (المؤجر/المستأجر) بتفضل بمسافاتها.
 */
function labelRe(label: string): string {
  return [...label.replace(/\s+/g, "")].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
}

/**
 * كل عناوين الشهادة — القيمة بتقف عند أول عنوان بعدها.
 * الملف بيقطّع الكلمة على سطرين («ابي» في سطر و«ض» في اللي بعده)، فمابنقفش عند
 * السطر — بنقف عند **العنوان اللي بعده** وبس.
 */
const ALL_LABELS = [
  "المصنع", "نوع المركبة", "رقم اللوحة", "رقم الهيكل", "لون المركبة",
  "اسم المؤجر", "رقم السجل", "الرقم الوطني", "اسم المستأجر", "رقم الهوية",
  "نوع الهوية", "العنوان", "رقم العقد", "تاريخ العقد", "الدفعات", "المبلغ",
  "مكان الوفاء", "مكان التحرير", "سبب التنفيذ", "بيانات",
  // بدايات الكلام الثابت في آخر الشهادة — القيمة عمرها ما توصلها
  "تعد هذه", "تؤكد", "أصدرت", "تستخدم",
];

/** أقصى طول لقيمة — حاجز أمان ضد ابتلاع فقرة كاملة. */
const MAX_VALUE = 60;

function between(text: string, label: string, stops: string[]): string {
  const start = new RegExp(labelRe(label) + "\\s*:?\\s*").exec(text);
  if (!start) return "";
  const rest = text.slice(start.index + start[0].length).replace(/\n/g, " ");
  let end = Math.min(rest.length, MAX_VALUE);
  for (const s of [...stops, ...ALL_LABELS]) {
    if (!s.replace(/\s+/g, "")) continue;   // وقف فاضي = تعبير فاضي بيطابق فوراً
    const m = new RegExp(labelRe(s)).exec(rest);
    if (m && m.index > 0 && m.index < end) end = m.index;
  }
  // «ة» لوحدها في الآخر = أول حرف «ةرقم الهوية» اللي بعدها — مش من الاسم.
  // ⚠️ **بس «ة»**: شيل أي حرف كان بيكسر «كي ا» ⇒ «كي» بدل «كيا».
  const raw = rest.slice(0, end).replace(/[:\s]+$/, "").trim().replace(/\sة$/, "");
  return glueFragments(raw);
}

/**
 * الملف بيقطّع الكلمة لقطع صغيرة («مصر» + «ف» ⇒ «مصرف»، «قر» + «ناس» ⇒ «قرناس»).
 * بنلزق أي قطعة حرف أو حرفين بجارتها. القطعة اللي في الآخر لوحدها بتتلزق باللي
 * قبلها، واللي في الأول باللي بعدها.
 *
 * ⚠️ كنت بشيل القطعة الأخيرة بدل ما ألزقها — فـ«مصرف الانماء» طلعت «مصر».
 */
function glueFragments(value: string): string {
  const parts = value.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const short = p.length <= 2 && /[ء-ي]/.test(p);
    if (short && out.length) out[out.length - 1] += p;
    else if (short && parts.length > 1) out.push(p);     // في الأول — هيتلزق باللي بعده
    else if (out.length && out[out.length - 1].length <= 2) out[out.length - 1] += p;
    else out.push(p);
  }
  return out.join(" ").trim();
}

export interface SijilFields {
  make: string; model: string; color: string; bank: string; tenant: string;
  /** اللوحة العربي من جوّه الشهادة — بتنفع لما الخانة الإنجليزية تكون فاضية. */
  plateAr: string;
}

/**
 * 🏦 المؤجرين المعروفين — الاسم بيتقسّم على سطرين **مش ورا بعض** في الملف
 * («مصر» في سطر و«ف انماء» في السطر اللي قبله)، فبنكمّله من القايمة دي.
 *
 * بلاغ المالك (١٤ أكتوبر ٢٠٢٦): «مكتوب قدامها مصر».
 * الإكمال بيحصل **بس** لو اللي طلع بداية اسم واحد معروف — وإلا بنسيبه زي ما هو.
 */
const KNOWN_LESSORS = [
  "مصرف الانماء", "مصرف الراجحي", "البنك الأهلي السعودي", "البنك الاهلي السعودي",
  "شركة عبداللطيف جميل المتحدة للتمويل", "شركة الجبر للتمويل", "تأجير للتمويل",
  "شركة السعودي للتمويل", "البنك السعودي للاستثمار", "بنك البلاد", "مصرف الجزيرة",
  "شركة اليسر للإجارة والتمويل", "شركة الراية للتمويل", "شركة أملاك العالمية",
];

/**
 * 🔢 رقم السجل التجاري ⇒ المؤجر — الحسم لما الاسم المقصوص يحتمل أكتر من واحد
 * («مصر» ممكن تكون الانماء أو الراجحي). الرقم **أرقام** فمابيتلخبطش أبداً.
 */
const LESSOR_BY_CR: Record<string, string> = {
  "1010250808": "مصرف الانماء",
  "1010000096": "مصرف الراجحي",
  "4030001588": "البنك الأهلي السعودي",
  "2050097254": "شركة الجبر للتمويل",
};

/**
 * بيكمّل اسم المؤجر: بالسجل التجاري الأول (قاطع)، وإلا لو اللي طلع بداية اسم
 * معروف **واحد** بس. وإلا بيسيبه زي ما هو — مانخترعش اسم.
 */
export function completeLessor(value: string, crNumber = ""): string {
  const byCr = LESSOR_BY_CR[crNumber.replace(/\D/g, "")];
  if (byCr) return byCr;
  const v = value.replace(/\s+/g, "");
  if (!v || v.length < 3) return value;
  const hits = KNOWN_LESSORS.filter((k) => k.replace(/\s+/g, "").startsWith(v));
  return hits.length === 1 ? hits[0] : value;
}

/** الخانات من نص شهادة «سجل» **بعد فكّها**. أي خانة مش موجودة بترجع "". */
export function extractSijilFields(decoded: string): SijilFields {
  /**
   * القيمة اللي كلمة واحدة: من غير مسافات، **وبترجع فاضية لو طلعت غريبة** —
   * الملف بيقطّع الكلمة على سطرين بعيدين أحياناً فالقيمة بتطلع ناقصة أو بتبلع
   * كلام الشهادة الثابت. **فاضي أحسن من غلط** في شيت المالك.
   */
  const one = (v: string) => {
    const s = v.replace(/\s+/g, "");
    if (!s || s.length > 20 || /تعد|الشهادة|سندا|التنفيذ/.test(s)) return "";
    return s;
  };
  const PLATE = "رقم اللوحة";
  return {
    make: one(between(decoded, "المصنع", [PLATE, "نوع المركبة"])),
    model: one(between(decoded, "نوع المركبة", [PLATE, "رقم الهيكل"])),
    color: one(between(decoded, "لون المركبة", ["رقم الهيكل", "\n"])),
    bank: completeLessor(
      between(decoded, "اسم المؤجر", ["رقم السجل", "الرقم الوطني", "\n"]),
      between(decoded, "رقم السجل التجاري", ["الرقم الوطني", "المنفذ"]),
    ),
    tenant: between(decoded, "اسم المستأجر", ["رقم الهوية", "نوع الهوية", "\n"]),
    plateAr: between(decoded, "رقم اللوحة باللغة العربية", ["رقم اللوحة", "نوع المركبة", "رقم الهيكل"]),
  };
}

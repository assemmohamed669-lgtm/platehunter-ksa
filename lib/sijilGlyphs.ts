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

function between(text: string, label: string, stops: string[]): string {
  const start = new RegExp(labelRe(label) + "\\s*:?\\s*").exec(text);
  if (!start) return "";
  // القيمة عمرها ما بتعدّي السطر — والقص عند السطر بيغني عن «وقف عند السطر الجديد».
  const rest = text.slice(start.index + start[0].length).split("\n")[0];
  let end = rest.length;
  for (const s of stops) {
    if (!s.replace(/\s+/g, "")) continue;   // وقف فاضي = تعبير فاضي بيطابق فوراً
    const m = new RegExp(labelRe(s)).exec(rest);
    if (m && m.index < end) end = m.index;
  }
  return rest.slice(0, end).replace(/[:\s]+$/, "").trim();
}

export interface SijilFields {
  make: string; model: string; color: string; bank: string; tenant: string;
}

/** الخانات من نص شهادة «سجل» **بعد فكّها**. أي خانة مش موجودة بترجع "". */
export function extractSijilFields(decoded: string): SijilFields {
  const one = (v: string) => v.replace(/\s+/g, "");         // كلمة واحدة ⇒ من غير مسافات
  const PLATE = "رقم اللوحة";
  return {
    make: one(between(decoded, "المصنع", [PLATE, "نوع المركبة"])),
    model: one(between(decoded, "نوع المركبة", [PLATE, "رقم الهيكل"])),
    color: one(between(decoded, "لون المركبة", ["رقم الهيكل", "\n"])),
    bank: between(decoded, "اسم المؤجر", ["رقم السجل", "الرقم الوطني", "\n"]),
    tenant: between(decoded, "اسم المستأجر", ["رقم الهوية", "نوع الهوية", "\n"]),
  };
}

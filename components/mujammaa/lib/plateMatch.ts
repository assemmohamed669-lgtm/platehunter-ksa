/**
 * ==========================================================================
 *  المطابقة والتشابه بين اللوحات
 * ==========================================================================
 *  محتاجينها في تلات أماكن:
 *   ١. مطابقة اللوحة المنطوقة على شيت البنك (مطلوبة ولا لأ)
 *   ٢. توجيه المراجعة بالمفردات: لو اللوحة تفرق حرف واحد عن لوحة في الشيت
 *      وما فيش غيرها قريبة → غالباً هي، فنصحّحها
 *   ٣. المقارنة بين رأي محرك صوت ورأي المحرك التاني
 */

import { normalizePlate } from "./textNormalize";
import { LATIN_TO_LETTER, isPlateLetter } from "./plateAlphabet";

/* ==========================================================================
 *  ليفنشتاين بصفّين (Two-Row Levenshtein)
 * ==========================================================================
 *  المصفوفة الكاملة بتاخد O(n×m) ذاكرة. إحنا بنقارن مليون مرة على
 *  شيت فيه آلاف اللوحات، فالصفّين بيوفّروا ذاكرة وسرعة ملموسة.
 *  الـ buffers على مستوى الموديول عشان ما نخصّصش ذاكرة كل نداء.
 */
const ROW_A: number[] = [];
const ROW_B: number[] = [];

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const n = b.length;
  for (let j = 0; j <= n; j++) ROW_A[j] = j;

  for (let i = 1; i <= a.length; i++) {
    ROW_B[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = ROW_A[j] + 1;
      const ins = ROW_B[j - 1] + 1;
      const sub = ROW_A[j - 1] + cost;
      ROW_B[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    for (let j = 0; j <= n; j++) ROW_A[j] = ROW_B[j];
  }

  return ROW_A[n];
}

/**
 * ليفنشتاين بحد أقصى — بيوقف بدري لما يتأكد إن المسافة عدّت الحد.
 *
 * ليه محتاجينها؟ لأن شيت البنك ممكن يكون ٥٠ ألف لوحة، والبحث التقريبي
 * بيلف عليه كله. في البث المباشر ده بيحصل مع كل نتيجة مؤقتة (كذا مرة
 * في الثانية) — فحساب المسافة الكاملة لكل لوحة كان بيعلّق الواجهة.
 *
 * وإحنا أصلاً مش محتاجين المسافة الحقيقية لو هي أكبر من الحد: كل اللي
 * يهمنا «قريبة ولا لأ». فبنحسب شريط ضيّق حوالين القطر وبنوقف لو أقل
 * قيمة في الصف عدّت الحد.
 */
export function levenshteinWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return Infinity;
  if (a.length === 0) return b.length <= max ? b.length : Infinity;
  if (b.length === 0) return a.length <= max ? a.length : Infinity;

  const n = b.length;
  for (let j = 0; j <= n; j++) ROW_A[j] = j;

  for (let i = 1; i <= a.length; i++) {
    ROW_B[0] = i;
    const ca = a.charCodeAt(i - 1);
    let rowMin = ROW_B[0];

    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const del = ROW_A[j] + 1;
      const ins = ROW_B[j - 1] + 1;
      const sub = ROW_A[j - 1] + cost;
      const best = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
      ROW_B[j] = best;
      if (best < rowMin) rowMin = best;
    }

    // أقل قيمة في الصف كله عدّت الحد → مستحيل النتيجة النهائية تنزل تحته
    if (rowMin > max) return Infinity;

    for (let j = 0; j <= n; j++) ROW_A[j] = ROW_B[j];
  }

  return ROW_A[n] <= max ? ROW_A[n] : Infinity;
}

/** نسبة التشابه ٠-١٠٠ */
export function similarityPercent(a: string, b: string): number {
  const x = normalizePlate(a);
  const y = normalizePlate(b);
  if (!x && !y) return 100;
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 100;
  return Math.round(((longest - levenshtein(x, y)) / longest) * 100);
}

/* ==========================================================================
 *  لوحات البنوك الإنجليزية — وفيها فخّ حقيقي
 * ==========================================================================
 *  اللوحة السعودية مكتوبة بسطرين: عربي (يُقرأ يمين→شمال) ولاتيني
 *  (يُقرأ شمال→يمين). فالسطرين **مرآة لبعض**.
 *
 *  فلو المحفظة منقولة من السطر العربي بتنزل: NKD 5678  (حروف ثم أرقام)
 *  ولو منقولة من السطر اللاتيني بتنزل:      7709 ABS  (أرقام ثم حروف)
 *
 *  والتانية لازم **تتعكس حروفها** — «7709 ABS» هي فعلياً «س ب ا 7709».
 *  لو قرأناها حرف بحرف هتطلع «ابس» والمطابقة تفشل تماماً.
 *
 *  المُشغِّل هو ترتيب اللوحة نفسها، مش اسم البنك:
 *     أرقام قبل الحروف = تخطيط لاتيني = اعكس.
 */
export function bankPlateToArabic(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";

  // لو فيها حروف عربية أصلاً فهي عربية — بس نطبّعها
  if (/[ء-ي]/.test(raw)) return normalizePlate(raw);

  const letters = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  const digits = raw.replace(/\D/g, "");
  if (!letters && !digits) return "";

  // مين جه الأول في النص الأصلي؟
  const firstLetterAt = raw.search(/[A-Za-z]/);
  const firstDigitAt = raw.search(/\d/);
  const digitsFirst =
    firstDigitAt !== -1 && (firstLetterAt === -1 || firstDigitAt < firstLetterAt);

  const ordered = digitsFirst ? [...letters].reverse().join("") : letters;

  const arabicLetters = [...ordered]
    .map((ch) => LATIN_TO_LETTER[ch] ?? "")
    .join("");

  return normalizePlate(arabicLetters + digits);
}

/**
 * يطبّع أي لوحة جاية من أي مصدر (عربي أو بنكي إنجليزي).
 * دي الدالة اللي بتستخدمها كل مسارات المطابقة.
 */
export function anyPlateToNormalized(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/[A-Za-z]/.test(raw) && !/[ء-ي]/.test(raw)) {
    return bankPlateToArabic(raw);
  }
  return normalizePlate(raw);
}

/* ==========================================================================
 *  البحث في مفردات مقفولة (Closed Vocabulary Search)
 * ==========================================================================
 *  ده أقوى مصحّح عندنا. شيت البنك عمليّاً «قائمة اللوحات الممكنة»،
 *  فلو التفريغ طلّع لوحة تفرق حرف واحد بس عن لوحة واحدة في الشيت
 *  ومافيش غيرها قريبة → الاحتمال الغالب إنها هي.
 *
 *  الشرط «واحدة بس» مهم: لو فيه اتنين على نفس المسافة نسيبها زي ما هي
 *  ونعلّمها للمراجعة، لأن التخمين هنا ممكن يبوّظ بدل ما يصلّح.
 */
export interface NearestMatch {
  plate: string;
  distance: number;
  similarity: number;
  /** فيه أكتر من مرشّح على نفس المسافة؟ */
  ambiguous: boolean;
}

export function findNearestInVocabulary(
  plate: string,
  vocabulary: Iterable<string>,
  maxDistance = 1
): NearestMatch | null {
  const target = normalizePlate(plate);
  if (!target) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  let tieCount = 0;

  for (const candidate of vocabulary) {
    if (candidate === target) {
      return { plate: candidate, distance: 0, similarity: 100, ambiguous: false };
    }

    // حساب محدود بالحد الأقصى — بيوقف بدري لكل لوحة بعيدة
    const d = levenshteinWithin(target, candidate, maxDistance);
    if (d === Infinity) continue;

    if (d < bestDist) {
      bestDist = d;
      best = candidate;
      tieCount = 1;
    } else if (d === bestDist) {
      tieCount++;
    }
  }

  if (!best || bestDist > maxDistance) return null;

  return {
    plate: best,
    distance: bestDist,
    similarity: similarityPercent(target, best),
    ambiguous: tieCount > 1,
  };
}

/* ==========================================================================
 *  فحص معقولية الرأي التاني — حارس النافذة الغلط
 * ==========================================================================
 *  المشكلة اللي بيحلّها (مقيسة على ٢٥ لوحة حقيقية)
 *  ────────────────────────────────────────────────
 *  لما نافذة الصوت اللي بنبعتها للموديل تكون غلط، هو بيقرأ **صوت لوحة
 *  تانية** ويرجّع إجابة سليمة الشكل — فبوابة الثقة بتقبلها، وقاعدة الدمج
 *  بتقول «عند الاختلاف موديلنا يكسب» ⇒ **إجابة Deepgram الصح بتتشال
 *  وتتحط مكانها إجابة غلط**.
 *
 *  حصل فعلاً في التشييك الفوري:
 *      Deepgram: ادس6238  ·  موديلنا: رحل20006   ⇒ الغلط كسب
 *      Deepgram: نوي3456  ·  موديلنا: حبم2222    ⇒ الغلط كسب
 *      Deepgram: سطر5678  ·  موديلنا: بعه234     ⇒ الغلط كسب
 *  النتيجة: الفوري نزل لـ٤٤٪ بينما Deepgram لوحده كان هيدّي ٧٦٪.
 *
 *  الفكرة
 *  ───────
 *  المحركان بيسمعوا **نفس المقطع**. لو اختلفوا في حرف أو رقم، ده خلاف
 *  طبيعي على السمع. لكن لو اختلفوا في **كل حاجة**، يبقى مش خلاف — يبقى
 *  واحد فيهم بيسمع صوت تاني خالص، وأضعفهم إثباتاً هو صاحب النافذة.
 *
 *  فبنعتبر رأي الموديل «غير معقول» ونتجاهله لو مشاركش Deepgram ولا حرف.
 */

export interface SecondOpinionCheck {
  plausible: boolean;
  /** سبب الرفض بالعربي — بيتسجّل عشان القرار يفضل مرئي */
  reason: string;
}

/**
 * هل رأي الموديل معقول كخلاف على **نفس** المقطع؟
 *
 * محافظ بالقصد: بنرفض بس في الحالة الصارخة (ولا حرف مشترك)، عشان
 * ما نمنعش تصحيح حقيقي. التصحيحات الحقيقية اللي شفناها كانت كلها
 * بتشارك حرفين على الأقل (`دعق7989`→`دعق7890`).
 */
export function checkSecondOpinion(
  deepgramPlate: string,
  ourPlate: string
): SecondOpinionCheck {
  const dg = normalizePlate(deepgramPlate);
  const ours = normalizePlate(ourPlate);

  if (!ours) return { plausible: false, reason: "الموديل ما رجّعش لوحة" };
  if (!dg) return { plausible: true, reason: "" };
  if (dg === ours) return { plausible: true, reason: "" };

  const lettersOf = (p: string) => new Set([...p].filter((c) => /[ء-ي]/.test(c)));
  const dgLetters = lettersOf(dg);
  const ourLetters = lettersOf(ours);

  let shared = 0;
  for (const ch of ourLetters) if (dgLetters.has(ch)) shared++;

  if (dgLetters.size > 0 && ourLetters.size > 0 && shared === 0) {
    return {
      plausible: false,
      reason: `«${ours}» ما بتشاركش «${dg}» ولا حرف — الأغلب إن نافذة الصوت كانت على لوحة تانية`,
    };
  }

  return { plausible: true, reason: "" };
}

/** هل شكل اللوحة سليم تماماً؟ (٣ حروف معتمدة + ٤ أرقام) */
export function isWellFormedPlate(plate: string): boolean {
  const p = normalizePlate(plate);
  const m = p.match(/^([ء-ي]{3})(\d{4})$/);
  if (!m) return false;
  return [...m[1]].every(isPlateLetter);
}

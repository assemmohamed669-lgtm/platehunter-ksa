/**
 * حارس التوأم — قرار «هل القراءتين دول نفس العربية؟» في التشييك الصوتي.
 * =============================================================================
 * الموديل بيقرا نفس النطق في نوافذ متداخلة، وساعات بيغلط في خانة واحدة، فتظهر
 * لوحتين لعربية واحدة (رقو8651/رقو8652 · رمد9488/رمد9483). الحارس ده بيقرّر
 * أنهي قراءة تفضل — **بقواعد آمنة، مش تخمين**.
 *
 * 🔒 **القاعدة الحاكمة: عمره ما يرمي قراءة مؤكّدة (mult≥2) من غير بديل مؤكّد.**
 * قرار المالك: التكرار مزعج، لكن ضياع لوحة حقيقية أسوأ بكتير.
 *
 * القواعد بالترتيب:
 *   ١) وارد **مفرد** + توأم **مؤكّد**            → ارمِ الوارد (الغلط الأرجح).
 *   ٢) وارد **مؤكّد** + توأم **مفرد**            → ارمِ التوأم (الوارد أقوى).
 *   ٣) الاتنين **مفردين** + **من نفس النطق**     → سيب الأعلى ثقة.
 *   ٤) أي حاجة تانية (الاتنين مؤكّدين · نطقين
 *      مختلفين · مصدر مش VoiceX)                → **ماتلمسش حاجة**.
 *
 * ⚠️ «من نفس النطق» = فرق **زمن النطق** (`tMs`, مركز نافذة الصوت) ≤ ٢ث — نفس
 * `windowMs` بتاعة الإجماع. ليه ده آمن:
 *   • ترفرف نفس النطق  = نوافذ كل ١.٥ث   ⇒ جوّه العتبة.
 *   • لوحتين حقيقيتين  = إيقاع نطق ~٣.٤ث ⇒ **برّه العتبة، مايتلمسوش**.
 * بنقيس بزمن النطق **مش زمن وصول الرد** عشان تذبذب الشبكة/الطابور مايأثرش
 * (بقى محسوس بعد نقل الموديل لسيرفر بعيد).
 */

/** فرق **خانة واحدة بالظبط** بين نصّين بنفس الطول (حروف أو أرقام). */
export function oneLetterApart(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return d === 1;
}

/** قراءة واحدة كما يراها الحارس. الحقول الاختيارية غايبة للمصادر غير VoiceX. */
export interface TwinReading {
  /** حروف اللوحة المطبّعة (بلا أرقام). */
  letters: string;
  /** أرقام اللوحة (بلا حروف). */
  digits: string;
  /** عدد النوافذ المتّفقة: ≥٢ = مؤكّدة · ١ = مفردة · undefined = مش VoiceX. */
  mult?: number;
  /** ثقة القراءة ٠..١. */
  conf?: number;
  /** زمن النطق بالملّي (مركز نافذة الصوت) — **مش** زمن الوصول. */
  tMs?: number;
  /**
   * القراءة دي جت من **النطق الكامل** ولا من **نافذة ثابتة**؟
   *
   * 🔴 المحرك بيقرا بطريقتين: نافذة ٥ث كل ١.٥ث (بتقطع اللوحة البطيئة في نصها
   * فتطلع قراءة جزئية)، والنطق كامل بعد ما السكوت يجي (اللوحة كلها مرة واحدة).
   * بلاغ المالك «ردي7365 وبعدها ردي7265 والأخيرة هي الصح» سببه ده بالظبط:
   * النافذة بتوصل الأول والنطق الكامل بعدها.
   *
   * `undefined` = مش معروف (مصادر قديمة) ⇒ القاعدة دي مابتشتغلش.
   */
  fromUtterance?: boolean;
}

export type TwinDecision =
  | "none"           // مش توأم أصلاً، أو القواعد بتقول سيبهم
  | "drop-incoming"  // ارمِ الوارد (ماتضفهوش)
  | "drop-twin";     // امسح صف التوأم الموجود وسيب الوارد

/** أقصى فرق في زمن النطق يعتبر «نفس النطق» (نفس windowMs بتاعة الإجماع). */
export const SAME_UTTERANCE_MS = 2000;

/** هل القراءتين توأم؟ نفس الأرقام وفرق حرف، أو نفس الحروف وفرق رقم. */
export function areTwins(a: TwinReading, b: TwinReading): boolean {
  const letterTwin = a.digits === b.digits && oneLetterApart(a.letters, b.letters);
  const digitTwin = a.letters === b.letters && oneLetterApart(a.digits, b.digits);
  return letterTwin || digitTwin;
}

/**
 * قرار الحارس لقراءة واردة مقابل توأم موجود على الشاشة.
 * `"none"` = ماتعملش حاجة (الافتراضي الآمن في كل حالة ملتبسة).
 */
export function twinGuardDecision(
  incoming: TwinReading,
  twin: TwinReading,
  sameUtteranceMs: number = SAME_UTTERANCE_MS,
): TwinDecision {
  // مصدر مش VoiceX (مافيش mult) ⇒ الحارس يتخطّاه تماماً.
  if (incoming.mult === undefined || twin.mult === undefined) return "none";
  if (!areTwins(incoming, twin)) return "none";

  const incomingConfirmed = incoming.mult >= 2;
  const twinConfirmed = twin.mult >= 2;

  if (!incomingConfirmed && twinConfirmed) return "drop-incoming";  // (١)
  if (incomingConfirmed && !twinConfirmed) return "drop-twin";      // (٢)
  if (incomingConfirmed && twinConfirmed) {
    // (٤) الاتنين مؤكّدين — الأصل ماتلمسش. **الاستثناء الوحيد**: واحدة منهم
    // جاية من **النطق الكامل** والتانية من **نافذة مقطوعة**، ومن **نفس النطق**.
    // ساعتها الكامل أدق بحكم إنه شاف اللوحة كلها، مش تخمين على التوقيت.
    // أي حالة تانية (الاتنين كامل · الاتنين نافذة · مش عارفين) ⇒ ماتلمسش.
    const decided = preferFullUtterance(incoming, twin, sameUtteranceMs);
    return decided ?? "none";
  }

  // (٣) الاتنين مفردين — بس لو من **نفس النطق**.
  // النطق الكامل له الأولوية هنا كمان قبل مقارنة الثقة.
  const byUtterance = preferFullUtterance(incoming, twin, sameUtteranceMs);
  if (byUtterance) return byUtterance;
  if (incoming.tMs === undefined || twin.tMs === undefined) return "none";
  if (Math.abs(incoming.tMs - twin.tMs) > sameUtteranceMs) return "none";
  // التعادل بيروح للموجود على الشاشة (استقرار العرض).
  return (incoming.conf ?? 0) > (twin.conf ?? 0) ? "drop-twin" : "drop-incoming";
}


/**
 * لو واحدة من القراءتين جاية من **النطق الكامل** والتانية من **نافذة مقطوعة**،
 * ومن **نفس النطق** ⇒ الكامل يكسب. غير كده `null` (يعني القاعدة مش منطبقة).
 *
 * 🔒 شرط «نفس النطق» (≤٢ث) **مايتشالش**: من غيره ممكن نرمي لوحة عربية تانية
 * اتقالت بعدها بشوية — وده أسوأ حاجة ممكن تحصل.
 */
function preferFullUtterance(
  incoming: TwinReading,
  twin: TwinReading,
  sameUtteranceMs: number,
): TwinDecision | null {
  if (incoming.fromUtterance === undefined || twin.fromUtterance === undefined) return null;
  if (incoming.fromUtterance === twin.fromUtterance) return null;   // نفس المصدر ⇒ مافيش مرجّح
  if (incoming.tMs === undefined || twin.tMs === undefined) return null;
  if (Math.abs(incoming.tMs - twin.tMs) > sameUtteranceMs) return null;
  return incoming.fromUtterance ? "drop-twin" : "drop-incoming";
}

/**
 * تصحيح اللوحات على قاعدة لوحات معروفة (داتا المناديب) — الحل الأقوى لمشكلة الحروف.
 * الفكرة: الأرقام بتطلع من التفريغ دقيقة، فبنفهرس اللوحات المعروفة **بالأرقام**؛ لما
 * التفريغ يطلّع لوحة، بندوّر على اللوحات الحقيقية بنفس الـ٤ أرقام ونثبّت الحروف على
 * أقرب لوحة **موجودة فعلاً** (فرق حرف واحد بالظبط + مرشّح وحيد؛ وإلا يُعلَّم غموض ولا
 * يُصحَّح). عمره ما يخترع لوحة مش في القاعدة. دوال نقية قابلة للاختبار.
 */
import { normalizePlate } from "./plateParser";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const DIGIT_RE = /[0-9٠-٩]/;

/** يحوّل الأرقام العربية-الهندية لغربية (للفهرسة الموحّدة). */
function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** يفصل اللوحة المطبّعة لحروف + أرقام (غربية). */
function splitLettersDigits(plate: string): { letters: string; digits: string } {
  const chars = [...normalizePlate(plate)];
  const letters = chars.filter((c) => !DIGIT_RE.test(c)).join("");
  const digits = toWesternDigits(chars.filter((c) => DIGIT_RE.test(c)).join(""));
  return { letters, digits };
}

/** مسافة تعديل (Levenshtein) بين نصّين قصيرين. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** فهرس اللوحات المعروفة: أرقام (٤) → قائمة سلاسل الحروف اللي ليها نفس الأرقام. */
export function buildPlateIndex(plates: string[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const p of plates) {
    const { letters, digits } = splitLettersDigits(p);
    if (digits.length !== 4 || letters.length < 2) continue;
    let arr = idx.get(digits);
    if (!arr) { arr = []; idx.set(digits, arr); }
    if (!arr.includes(letters)) arr.push(letters);
  }
  return idx;
}

export interface CorrectionResult {
  plate: string;      // اللوحة بعد التصحيح (أو زي ما هي)
  corrected: boolean; // اتثبّتت على لوحة حقيقية مختلفة عن التفريغ
  ambiguous: boolean; // كذا مرشّح قريب بالتساوي → مفيش تصحيح تلقائي (يستاهل مراجعة)
  inDb: boolean;      // فيه لوحات بنفس الأرقام في القاعدة
}

/**
 * يصحّح لوحة تفريغ على الفهرس. exact يسبق؛ التصحيح مشروط بفرق حرف واحد بالظبط +
 * مرشّح وحيد؛ الغموض (كذا مرشّح على بُعد حرف) يُعلَّم ولا يُصحَّح.
 */
export function correctPlate(asrPlate: string, index: Map<string, string[]>): CorrectionResult {
  const { letters, digits } = splitLettersDigits(asrPlate);
  const norm = letters + digits;
  if (digits.length !== 4) return { plate: norm, corrected: false, ambiguous: false, inDb: false };

  const cands = index.get(digits);
  if (!cands || cands.length === 0) return { plate: norm, corrected: false, ambiguous: false, inDb: false };

  // تطابق تام للحروف → موجودة، مفيش تصحيح.
  if (cands.includes(letters)) return { plate: letters + digits, corrected: false, ambiguous: false, inDb: true };

  // المرشّحون على بُعد حرف واحد بالظبط.
  const close = cands.filter((c) => levenshtein(letters, c) <= 1);
  if (close.length === 1) return { plate: close[0] + digits, corrected: true, ambiguous: false, inDb: true };
  if (close.length > 1) return { plate: norm, corrected: false, ambiguous: true, inDb: true };
  return { plate: norm, corrected: false, ambiguous: false, inDb: true };
}

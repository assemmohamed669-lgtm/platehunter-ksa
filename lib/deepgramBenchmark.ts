/**
 * أداة قياس (Benchmark) لاختيار أفضل موديل تفريغ للوحات السعودية.
 * منطق نقي قابل للاختبار فقط — بيقارن تنبؤات الموديلات باللوحة الصح (ground truth)
 * ويحسب الدقة ويرتّبهم. جمع التسجيلات ونداء الموديلات نفسه في الـ runner
 * (scripts/deepgram-benchmark) — الملف ده مالوش أي أثر على الـ architecture.
 *
 * ليه اللوحة بتتقسّم حروف/أرقام قبل المقارنة: أخطاء الـ ASR الحقيقية في الحروف
 * (ح↔ه، س↔ص…) مش الأرقام، فبنقيس دقة الحروف والأرقام منفصلين عشان القرار يكون
 * مبني على المكان الحقيقي للخطأ.
 */
import { normalizePlate, levenshtein } from "./plateParser";

export interface Prediction {
  file: string;
  predicted: string; // اللوحة المستخرجة من الموديل (ممكن تكون "")
  truth?: string;    // اللوحة الصح المؤكّدة (اختيارية)
}

export interface PlateComparison {
  exact: boolean;         // بعد التطبيع: التنبؤ === الصح
  digitsCorrect: boolean; // الأرقام الـ4 مطابقة
  lettersCorrect: boolean;// الحروف مطابقة
  letterErrors: number;   // مسافة تعديل بين حروف التنبؤ وحروف الصح
  hasTruth: boolean;      // فيه لوحة صح للمقارنة
}

/** يفصل اللوحة المطبّعة (حروف ثم أرقام) لجزأين. */
export function splitLettersDigits(normalized: string): { letters: string; digits: string } {
  let i = 0;
  while (i < normalized.length) {
    const c = normalized.charCodeAt(i);
    if (c >= 48 && c <= 57) break; // أول رقم
    i++;
  }
  return { letters: normalized.slice(0, i), digits: normalized.slice(i) };
}

/** يقارن تنبؤ الموديل باللوحة الصح بعد تطبيع الاتنين. */
export function comparePlate(predicted: string, truth: string): PlateComparison {
  const np = normalizePlate(predicted || "");
  const nt = normalizePlate(truth || "");
  const hasTruth = nt.length > 0;
  if (!hasTruth) {
    return { exact: false, digitsCorrect: false, lettersCorrect: false, letterErrors: 0, hasTruth: false };
  }
  const p = splitLettersDigits(np);
  const t = splitLettersDigits(nt);
  return {
    exact: np === nt,
    digitsCorrect: p.digits === t.digits,
    lettersCorrect: p.letters === t.letters,
    letterErrors: levenshtein(p.letters, t.letters),
    hasTruth: true,
  };
}

export interface ModelScore {
  model: string;
  total: number;           // عدد الملفات اللي فيها truth
  exact: number;           // تطابق تام
  exactPct: number;        // 0..100
  digitsCorrect: number;
  lettersCorrect: number;
  avgLetterErrors: number; // متوسط أخطاء الحروف على الملفات المُعلّمة
  emptyPredictions: number;// عدد التنبؤات الفاضية (على كل الملفات)
}

/** يحسب دقة موديل واحد على مجموعة تنبؤات. */
export function scoreModel(model: string, preds: Prediction[]): ModelScore {
  let total = 0, exact = 0, digitsCorrect = 0, lettersCorrect = 0, letterErrorSum = 0, empty = 0;
  for (const pr of preds) {
    if (!pr.predicted || !pr.predicted.trim()) empty++;
    const c = comparePlate(pr.predicted, pr.truth ?? "");
    if (!c.hasTruth) continue;
    total++;
    if (c.exact) exact++;
    if (c.digitsCorrect) digitsCorrect++;
    if (c.lettersCorrect) lettersCorrect++;
    letterErrorSum += c.letterErrors;
  }
  return {
    model,
    total,
    exact,
    exactPct: total > 0 ? Math.round((exact / total) * 100) : 0,
    digitsCorrect,
    lettersCorrect,
    avgLetterErrors: total > 0 ? letterErrorSum / total : 0,
    emptyPredictions: empty,
  };
}

export interface BenchmarkSummary {
  scores: ModelScore[]; // مرتّبة الأدق أولاً
  best: string | null;  // اسم الموديل الأدق (null لو مفيش truth)
  labeled: number;      // عدد الملفات المُعلّمة
  unlabeled: number;    // عدد الملفات غير المُعلّمة (على أكبر موديل)
}

/** يقيس كل الموديلات ويرتّبهم ويختار الأدق (الأعلى exactPct ثم الأقل أخطاء حروف). */
export function summarizeBenchmark(byModel: Record<string, Prediction[]>): BenchmarkSummary {
  const scores = Object.entries(byModel).map(([m, preds]) => scoreModel(m, preds));
  scores.sort((a, b) => (b.exactPct - a.exactPct) || (a.avgLetterErrors - b.avgLetterErrors));

  // عدد الملفات المُعلّمة = أقصى عدد truth عبر الموديلات (المفروض متساوٍ).
  let labeled = 0, maxFiles = 0;
  for (const preds of Object.values(byModel)) {
    const withTruth = preds.filter((p) => (p.truth ?? "").trim()).length;
    if (withTruth > labeled) labeled = withTruth;
    if (preds.length > maxFiles) maxFiles = preds.length;
  }

  return {
    scores,
    best: labeled > 0 && scores.length > 0 ? scores[0].model : null,
    labeled,
    unlabeled: Math.max(0, maxFiles - labeled),
  };
}

export interface AgreementPair {
  a: string;
  b: string;
  agreePct: number;  // 0..100 نسبة الملفات اللي الموديلين اتفقوا فيها (بعد التطبيع)
  comparable: number;// عدد الملفات المشتركة اللي الاتنين طلّعوا فيها تنبؤ
}

/**
 * اتفاق كل زوج موديلات على نفس الملفات — مقياس بديل لما مفيش ground truth.
 * (اتفاق عالي = ثقة أعلى؛ اختلاف = الملفات اللي محتاجة ليبل يدوي).
 */
export function pairwiseAgreement(byModel: Record<string, Prediction[]>): AgreementPair[] {
  const models = Object.keys(byModel);
  const out: AgreementPair[] = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const a = models[i], b = models[j];
      const mapA = new Map(byModel[a].map((p) => [p.file, normalizePlate(p.predicted || "")]));
      const mapB = new Map(byModel[b].map((p) => [p.file, normalizePlate(p.predicted || "")]));
      let comparable = 0, agree = 0;
      for (const [file, pa] of mapA) {
        const pb = mapB.get(file);
        if (pb === undefined) continue;
        if (!pa || !pb) continue; // أحدهم فاضي → مش قابل للمقارنة
        comparable++;
        if (pa === pb) agree++;
      }
      out.push({ a, b, comparable, agreePct: comparable > 0 ? Math.round((agree / comparable) * 100) : 0 });
    }
  }
  return out;
}

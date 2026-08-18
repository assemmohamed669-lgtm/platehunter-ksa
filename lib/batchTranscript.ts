/**
 * batchTranscript — يحوّل **تفريغ تسجيل كامل** لليستة لوحات، كل واحدة
 * بتوقيتها.
 *
 * المندوب بيسجّل كلامه كله متصل (عشرين لوحة ورا بعض) وبعدين يدوس «تفريغ» مرة
 * واحدة — مايقولش لوحة ويستنى. فالمطلوب: ناخد النص الكامل بمقاطعه الزمنية
 * ونطلّع كل لوحة لوحدها **ومعاها الثانية اللي اتقالت فيها**.
 *
 * التوقيت مش رفاهية:
 *   • بيدّي كل لوحة **موقعها الصح** من مسار المندوب وقت التسجيل.
 *   • وبيحدد نقطة القص لو حبينا نعيد قراءة اللوحة بموديل أدق.
 *
 * منطق نقي — الصفحة بتعرض بس.
 */

import { parsePlateFromTranscript, plateNeedsReview, normalizePlate } from "@/lib/plateParser";

/** مقطع من تفريغ المحرك: نص + بداية ونهاية بالثواني. */
export interface TimedSegment {
  text: string;
  start: number;
  end: number;
}

export interface BatchPlate {
  /** اللوحة زي ما اتقالت. */
  plate: string;
  /** مطبّعة للمطابقة. */
  normalized: string;
  vehicleType?: string;
  notes: string;
  /** الثانية اللي اتقالت فيها — منها بييجي الموقع. */
  startSec: number;
  /** محتاجة مراجعة (شكلها مش مكتمل) — بنعلّمها ومابنشيلهاش. */
  needsReview: boolean;
}

/**
 * بيفصل المقطع الواحد لجُمل لوحات: كل ما نلاقي ٤ أرقام متتالية، دي نهاية
 * لوحة والكلام اللي بعدها لوحة جديدة.
 *
 * ليه كده: المندوب بيقول «الف باء تاء واحد اتنين تلاتة اربعة دال هاء واو…»
 * من غير أي فاصل، فالمحرك بيرجّعها جملة واحدة طويلة.
 */
function splitRunOn(text: string): string[] {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out: string[] = [];
  let cur: string[] = [];
  let digits = 0;
  // بعد ما نكمّل ٤ أرقام مابنقصّش على طول: نوع السيارة بييجي **بعد** الأرقام
  // («… اربعة ونيت»)، فلو قصّينا فوراً النوع يروح للوحة اللي بعدها.
  let pendingCut = false;
  for (const w of words) {
    if (pendingCut) {
      if (VEHICLE_WORDS.has(w)) { cur.push(w); continue; }   // النوع تبع اللوحة اللي فاتت
      out.push(cur.join(" ")); cur = []; digits = 0; pendingCut = false;
    }
    cur.push(w);
    // كلمة رقم؟ (رقم عربي/إنجليزي أو اسم رقم بيتحول جوّه المحلّل)
    if (/^[0-9٠-٩]+$/.test(w) || DIGIT_WORDS.has(w)) digits++;
    else if (digits > 0 && digits < 4) {
      // حرف بعد أرقام ناقصة — لسه في نفس اللوحة
    }
    if (digits >= 4) {
      pendingCut = true;
      continue;
    }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

/** كلمات نوع السيارة اللي بتيجي بعد الأرقام — بتفضل مع لوحتها. */
const VEHICLE_WORDS = new Set([
  "ونيت","فان","دباب","شاحنة","باص","صالون","بيكاب","تاكسي","كروزر","باترول",
  "نقليات","مفحوطة","مصدومة","مصدومه","مركونة","مركونه","معطلة","معطله",
  "غمارة","غماره","موتوسيكل","شاص","نقل","ملاكي","دينه",
]);

const DIGIT_WORDS = new Set([
  "صفر","زيرو","واحد","اتنين","اثنين","تلاتة","ثلاثة","تلاته","اربعة","أربعة","اربعه",
  "خمسة","خمسه","ستة","سته","سبعة","سبعه","تمانية","ثمانية","تمانيه","تسعة","تسعه","عشرة",
]);

/**
 * التفريغ الكامل → ليستة لوحات مرتّبة بالتوقيت.
 * الكلام اللي مافيهوش لوحة بيتتجاهل — **مابنخترعش لوحة من العدم**.
 */
export function splitTranscriptIntoPlates(segments: TimedSegment[]): BatchPlate[] {
  const out: BatchPlate[] = [];
  for (const s of segments ?? []) {
    const text = String(s?.text ?? "").trim();
    if (!text) continue;
    const parts = splitRunOn(text);
    const span = Math.max(0, (s.end ?? s.start ?? 0) - (s.start ?? 0));
    parts.forEach((part, i) => {
      const r = parsePlateFromTranscript(part);
      // **مابنخترعش**: لازم تطلع لوحة فيها حروف وأرقام فعلاً، مش أي نص.
      const norm = normalizePlate(r?.plate ?? "");
      if (!norm || !/[؀-ۿ]/.test(norm) || !/[0-9]/.test(norm)) return;
      // توقيت تقريبي: بنوزّع اللوحات على مدة المقطع بالتساوي
      const at = (s.start ?? 0) + (parts.length > 1 ? (span * i) / parts.length : 0);
      out.push({
        plate: r.plate,
        normalized: norm,
        vehicleType: r.vehicleType,
        notes: r.notes ?? "",
        startSec: Math.round(at * 100) / 100,
        needsReview: plateNeedsReview(norm) || !!r.uncertain,
      });
    });
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

/** قراءة الموديل المدرّب لمقطع لوحة واحدة (رد `/transcribe`). */
export interface ModelReading {
  normalized: string;
  accepted: boolean;
  meanLogprob?: number | null;
}

export interface MergedPlate extends BatchPlate {
  /** مين اللي النتيجة النهائية جت منه. */
  source: "agreed" | "model" | "engine";
}

/** شكل اللوحة السعودية: ٢-٣ حروف + ٤ أرقام. */
function looksLikePlate(norm: string): boolean {
  return /^[\u0600-\u06FF]{2,3}[0-9]{4}$/.test(String(norm ?? "").trim());
}

/**
 * بيدمج قراءة المحرك العام مع قراءة الموديل المدرّب لنفس اللوحة.
 *
 * القاعدة: **اللي مش متأكدين منه يتعلّم، مايتخترعش.** شفنا بعينينا منتج
 * منافس بيطلّع لوحة كاملة وشكلها سليم من ١٨ ثانية صمت — والمندوب مايقدرش
 * يكتشفها. فلوحة مكتوب عليها «راجعها» أنفع بمراحل من لوحة مخترعة.
 *
 * الترتيب: اتفقوا → مؤكدة. اختلفوا والموديل واثق وشكله سليم → بتاع الموديل
 * **متعلّمة**. غير كده → بتاع المحرك، ومتعلّمة لو الموديل مااتأكدش.
 */
export function mergePlateReadings(
  engine: BatchPlate[],
  model: (ModelReading | null | undefined)[],
): MergedPlate[] {
  return (engine ?? []).map((e, i) => {
    const mr = model?.[i];
    const modelOk = !!mr && mr.accepted && looksLikePlate(mr.normalized);

    if (modelOk && mr!.normalized === e.normalized) {
      return { ...e, source: "agreed" as const };
    }
    if (modelOk) {
      return { ...e, normalized: mr!.normalized, needsReview: true, source: "model" as const };
    }
    // الموديل رفض أو مارَدّش أو شكله غلط → بتاع المحرك.
    // بنعلّمها بس لو الموديل **رد ورفض** — لو مارَدّش خالص (سيرفر مقفول)
    // مانعاقبش المندوب على حاجة مالهاش علاقة بيه.
    const modelAnswered = mr !== null && mr !== undefined;
    return {
      ...e,
      needsReview: e.needsReview || modelAnswered,
      source: "engine" as const,
    };
  });
}

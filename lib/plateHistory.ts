/**
 * plateHistory — سجل السيارات اللي طلعت في الفرز عبر الشهور (منطق نقي، بلا I/O).
 *
 * الغرض: لما لوحة تطلع في الفرز تاني بعد شهور، المندوب يشوف إنها «مطلوبة من ٥
 * شهور · طلعت ٣ مرات» + إجراءه السابق (سحبها / ملقاهاش) — فيقرّر أولوياته.
 *
 * قاعدة العدّ (مهمة): «ظهور» = اللوحة كانت مطلوبة في **دفعة إحالة جديدة**، مش
 * إن المندوب دوس فرز. فالفرز المتكرر بنفس الشيت (نفس اليوم أو بعد يومين)
 * **مايزوّدش العدد** — وإلا الرقم يبقى ضجيج. التمييز ببصمة الشيت + فترة سماح.
 *
 * الحجم: الملخص (أول رصد / العدد / الحالة) بيتحفظ **للأبد** لأنه تافه الحجم،
 * والتفاصيل (التواريخ بالظبط) محدودة بآخر ٥ — فالسجل مايتضخّمش مع السنين.
 *
 * كل الدوال نقية وبتاخد `today` كوسيط (مفيش Date.now) — قابلة للاختبار تماماً.
 */

export type PlateStatus =
  | "none"       // مفيش إجراء لسه
  | "taken"      // سحبها
  | "notFound"   // مش في الموقع
  | "otherTook"  // حد تاني سحبها
  | "paid"       // العميل سدّد
  | "excluded";  // استبعدها من الفرز

export interface PlateAction { date: string; status: PlateStatus }

export interface PlateHistoryEntry {
  plate: string;            // اللوحة المطبّعة
  firstSeen: string;        // أول رصد — YYYY-MM-DD (دائم، مايتمسحش)
  lastSeen: string;         // آخر مرة طلعت في فرز
  count: number;            // عدد الظهورات المعتبرة (دفعات مختلفة)
  dates: string[];          // تفاصيل: تواريخ الظهور، الأحدث الأول (محدودة)
  status: PlateStatus;
  statusAt?: string;
  notFoundCount?: number;   // كم مرة روحلها وملقاهاش
  actions?: PlateAction[];  // آخر الإجراءات (للعرض في نافذة السجل)
  lastFp?: string;          // بصمة الشيت اللي احتُسب بها آخر ظهور
}

export type HistoryMap = Map<string, PlateHistoryEntry>;

/** حد تفاصيل التواريخ/الإجراءات المحفوظة لكل لوحة (الملخص مالوش حد). */
export const DETAIL_CAP = 5;
/** فترة السماح الافتراضية: فرز متكرر جواها بنفس الشيت مايزوّدش العدد. */
export const DEFAULT_COOLDOWN_DAYS = 7;
/** التفاصيل المحفوظة بالشهور (الأقدم يتقصّ، والملخص يفضل). */
export const DETAIL_KEEP_MONTHS = 5;

export function newHistoryMap(): HistoryMap {
  return new Map<string, PlateHistoryEntry>();
}

// ── مساعدات تواريخ (YYYY-MM-DD، بدون Date.now) ─────────────────────────────

function parts(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  return { y: y || 0, m: m || 0, day: day || 0 };
}

/** فرق الأيام بين تاريخين (b - a). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a), pb = parts(b);
  const ta = Date.UTC(pa.y, pa.m - 1, pa.day);
  const tb = Date.UTC(pb.y, pb.m - 1, pb.day);
  return Math.round((tb - ta) / 86400000);
}

/** فرق الشهور الكاملة بين تاريخين (b - a). */
export function monthsBetween(a: string, b: string): number {
  const pa = parts(a), pb = parts(b);
  let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (pb.day < pa.day) months -= 1;
  return months;
}

// ── بصمة شيت الإحالة ────────────────────────────────────────────────────────

/**
 * بصمة ثابتة لمجموعة لوحات (مستقلة عن الترتيب) — بنعرف بيها إن الفرز ده على
 * **نفس الدفعة** ولا دفعة جديدة. hash بسيط وسريع (مش تشفير).
 */
export function sheetFingerprint(plateNorms: string[]): string {
  let sum = 0;      // مجموع تبادلي (مستقل عن الترتيب)
  let xor = 0;
  let n = 0;
  for (const raw of plateNorms) {
    const p = (raw ?? "").trim();
    if (!p) continue;
    let h = 2166136261;
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h = h >>> 0;
    sum = (sum + h) >>> 0;
    xor = (xor ^ h) >>> 0;
    n++;
  }
  return `${n}-${sum.toString(36)}-${xor.toString(36)}`;
}

// ── تسجيل الظهورات ──────────────────────────────────────────────────────────

/**
 * يسجّل ظهور اللوحات في فرز. بيرجّع خريطة جديدة (مابيعدّلش المدخلة) + إحصائية.
 * ظهور جديد يُحتسب لو: بصمة الشيت اتغيّرت **أو** عدّت فترة السماح.
 */
export function recordAppearances(
  map: HistoryMap,
  plateNorms: string[],
  opts: { today: string; fingerprint: string; cooldownDays?: number }
): { map: HistoryMap; added: number; incremented: number } {
  const cooldown = opts.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
  const out: HistoryMap = new Map(map);
  let added = 0, incremented = 0;
  const seen = new Set<string>();

  for (const raw of plateNorms) {
    const plate = (raw ?? "").trim();
    if (!plate || seen.has(plate)) continue;   // نفس اللوحة مرتين في نفس الفرز = ظهور واحد
    seen.add(plate);

    const prev = out.get(plate);
    if (!prev) {
      out.set(plate, {
        plate,
        firstSeen: opts.today,
        lastSeen: opts.today,
        count: 1,
        dates: [opts.today],
        status: "none",
        lastFp: opts.fingerprint,
      });
      added++;
      continue;
    }

    const isNewBatch = prev.lastFp !== opts.fingerprint;
    const cooledDown = daysBetween(prev.lastSeen, opts.today) >= cooldown;
    if (isNewBatch || cooledDown) {
      out.set(plate, {
        ...prev,
        lastSeen: opts.today,
        count: prev.count + 1,
        dates: [opts.today, ...prev.dates].slice(0, DETAIL_CAP),
        lastFp: opts.fingerprint,
      });
      incremented++;
    } else {
      // نفس الدفعة جوه فترة السماح → مجرد تحديث «آخر مرة»، بدون زيادة.
      out.set(plate, { ...prev, lastSeen: opts.today });
    }
  }
  return { map: out, added, incremented };
}

// ── الحالة (إجراء المندوب) ──────────────────────────────────────────────────

/** الحالات اللي معناها «خلصت» — السيارة مش محتاجة مجهود تاني. */
export function isClosedStatus(s: PlateStatus): boolean {
  return s === "taken" || s === "otherTook" || s === "paid" || s === "excluded";
}

/** يسجّل إجراء المندوب على لوحة (بينشئ سجل لو مش موجود). */
export function setPlateStatus(
  map: HistoryMap,
  plateNorm: string,
  status: PlateStatus,
  date: string
): HistoryMap {
  const plate = (plateNorm ?? "").trim();
  if (!plate) return map;
  const out: HistoryMap = new Map(map);
  const prev = out.get(plate);
  const base: PlateHistoryEntry = prev ?? {
    plate, firstSeen: date, lastSeen: date, count: 0, dates: [], status: "none",
  };
  out.set(plate, {
    ...base,
    status,
    statusAt: date,
    notFoundCount: (base.notFoundCount ?? 0) + (status === "notFound" ? 1 : 0),
    actions: [{ date, status }, ...(base.actions ?? [])].slice(0, DETAIL_CAP),
  });
  return out;
}

// ── العرض ───────────────────────────────────────────────────────────────────

export interface HistoryDescription {
  count: number;
  months: number;                        // مدة كونها مطلوبة (من أول رصد)
  tone: "new" | "warn" | "danger";
  text: string;                          // نص جاهز للعرض
}

/** وصف مختصر للعرض في عمود «السجل». */
export function describeHistory(entry: PlateHistoryEntry, today: string): HistoryDescription {
  const months = Math.max(0, monthsBetween(entry.firstSeen, today));
  const count = entry.count;
  const tone: HistoryDescription["tone"] =
    count >= 3 ? "danger" : count === 2 ? "warn" : months >= 2 ? "warn" : "new";
  const dur = months >= 1 ? ` · ${months} شهر` : "";
  const text = count <= 1 && months < 2 ? "جديدة" : `${count} مرات${dur}`;
  return { count, months, tone, text };
}

// ── تقليم التفاصيل (الملخص يفضل للأبد) ──────────────────────────────────────

/**
 * يقصّ التواريخ/الإجراءات الأقدم من keepMonths، **بدون** ما يمسح أي سجل —
 * الملخص (أول رصد / العدد / الحالة) بيفضل كامل عشان «مطلوبة من سنة» تظل دقيقة.
 */
export function pruneDetail(map: HistoryMap, today: string, keepMonths = DETAIL_KEEP_MONTHS): HistoryMap {
  const out: HistoryMap = new Map();
  for (const [plate, e] of map) {
    out.set(plate, {
      ...e,
      dates: e.dates.filter((d) => monthsBetween(d, today) < keepMonths),
      actions: (e.actions ?? []).filter((a) => monthsBetween(a.date, today) < keepMonths),
    });
  }
  return out;
}

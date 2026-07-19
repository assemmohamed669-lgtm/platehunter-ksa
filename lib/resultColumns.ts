/**
 * resultColumns — يحلّ أعمدة نتيجة الفرز/المطلوب لـ **٨ أعمدة بترتيب ثابت**:
 *   رقم اللوحة › نوع السيارة › الماركة › العنوان › GPS › اللون › سنة الصنع › تاريخ التسجيل
 *
 * كل عمود بيتكتشف **بالاسم** (مرادفات) الأول، وإلا **بالمحتوى** (عيّنة من قيم العمود)
 * — عشان يشتغل حتى لو اسم العمود مختلف، أو الشيت بدون أسماء أعمدة خالص. عمود
 * اللوحة بيتحدّد برّه (detectPlateColumn) وبيتمرّر كـ excludeCol عشان مايتكررش.
 *
 * الدوال نقية وقابلة للاختبار.
 */
import { looksLikeGps, looksLikeDate, looksLikeDistrict } from "./headerlessColumns";
import { looksLikeCarName } from "./sortingCols";
import { inferVehicleType } from "./wantedColumns";

// ── كاشفات محتوى إضافية ──────────────────────────────────────────────────────
const COLOR_WORDS = [
  "ابيض", "أبيض", "اسود", "أسود", "فضي", "فضّي", "رمادي", "رصاصي", "سكني",
  "احمر", "أحمر", "ازرق", "أزرق", "اخضر", "أخضر", "اصفر", "أصفر", "بني",
  "ذهبي", "بيج", "برتقالي", "بترولي", "نحاسي", "سماوي", "لبني", "موف", "بنفسجي",
  "زيتي", "خمري", "تيتانيوم", "شمبانى", "شمباني", "كحلي", "عنابي", "وردي", "زهري",
  "white", "black", "silver", "grey", "gray", "red", "blue", "green", "yellow",
  "brown", "gold", "beige", "orange", "maroon", "navy",
];

/** قيمة لون سيارة (كلمة كاملة أو ضمن «لون السيارة»). */
export function looksLikeColor(v: string): boolean {
  const s = v.trim().toLowerCase();
  if (!s || s.length > 25) return false;
  return COLOR_WORDS.some((c) => s === c || s.includes(c));
}

/** سنة صنع: رقم من ٤ خانات في المدى المعقول (١٩٦٠–٢٠٩٩). */
export function looksLikeYear(v: string): boolean {
  const s = v.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const m = s.match(/^(\d{4})(?:\s*م)?$/);
  if (!m) return false;
  const y = parseInt(m[1], 10);
  return y >= 1960 && y <= 2099;
}

// أنواع الهياكل الشائعة (أوسع من inferVehicleType اللي بيركّز على ونيت/نقل).
const VEHICLE_TYPE_WORDS = [
  "صالون", "ملاكي", "ونيت", "فان", "دباب", "شاحنة", "شاحنه", "باص", "بيكاب",
  "تاكسي", "أجرة", "اجرة", "كروزر", "باترول", "نقليات", "نقل", "جيب", "ربع نقل",
  "دبل", "هاف لوري", "لوري", "مقطورة", "مقطوره", "ستيشن",
];

/** قيمة نوع سيارة (صالون/ملاكي/ونيت/فان/دباب/نقل...). */
export function looksLikeVehicleType(v: string): boolean {
  const s = v.trim().toLowerCase();
  if (!s || s.length > 20) return false;
  if (VEHICLE_TYPE_WORDS.some((t) => s === t || s.includes(t))) return true;
  return !!inferVehicleType(v);
}

// ── الأعمدة المستهدفة (بالترتيب الثابت) ───────────────────────────────────────
export interface TargetColumn {
  key: string;
  label: string;           // الاسم اللي هيظهر في نتيجة الفرز
  aliases: string[];       // مرادفات اسم العمود (lowercase، مطابقة بالاحتواء)
  content?: (v: string) => boolean; // كاشف المحتوى (لو الاسم مامطابقش)
}

// ملاحظة: «رقم اللوحة» مش هنا — بيتحدّد برّه (detectPlateColumn) وهو أول عمود دايماً.
export const RESULT_TARGETS: TargetColumn[] = [
  {
    key: "type", label: "نوع السيارة",
    // «النوع» عند المستخدم = الطراز/الموديل (كورولا/يارس/بكب غمارتين/شارجر سيدان) —
    // مش نوع الهيكل بس. فبنجمّع هنا أعمدة الطراز/الموديل + نوع الهيكل. «الماركة»
    // (الصانع) بقت هدف منفصل تحت عشان الاتنين يظهروا مش يتلغبطوا في عمود واحد.
    // ملاحظة: «موديل/موديل السيارة» مقصود مش هنا — «الموديل» في محافظ كتير = سنة
    // الصنع (٢٠٢٢) مش اسم موديل، والمطابقة العكسية بتخلطها. الطراز الحقيقي بيتلقط
    // بـ«طراز/الطراز/طراز المركبة/Car Type/Car model/النوع/Original Description».
    aliases: ["نوع السيارة", "نوع المركبة", "النوع", "طراز المركبة", "طراز", "الطراز", "طرازالمركبة",
      "اسم المركبة", "اسم السيارة",
      "type of car", "car type", "vehicle type", "vehicle name", "car model", "car",
      "original description"],
    content: looksLikeVehicleType,
  },
  {
    key: "brand", label: "الماركة",
    // الماركة = الصانع بس (تويوتا/دودج/شيفورلية) — منفصلة عن الطراز فوق.
    aliases: ["الماركة", "ماركة", "ماركه", "الماركه", "صانع المركبة", "صانع", "الصانع",
      "الشركة", "شركة", "make", "manufacturer", "brand"],
    content: looksLikeCarName,
  },
  {
    key: "address", label: "العنوان",
    aliases: ["العنوان", "عنوان", "الشارع", "شارع", "الحي", "حي", "الحى", "المنطقة", "منطقة",
      "المدينة", "مدينة", "address", "street", "district", "area", "city"],
    content: looksLikeDistrict,
  },
  {
    key: "gps", label: "GPS",
    aliases: ["gps", "الموقع", "موقع", "جي بي اس", "رابط", "خريطة", "location", "maps"],
    content: looksLikeGps,
  },
  {
    key: "color", label: "اللون",
    aliases: ["اللون", "لون", "لون السيارة", "لون المركبة", "لون المركبة الأساسي", "color", "colour"],
    content: looksLikeColor,
  },
  {
    key: "year", label: "سنة الصنع",
    // «موديل/الموديل» مقصودة الغياب — ملتبسة (ممكن تكون اسم موديل مش سنة). المحتوى
    // بيفرّق: عمود أرقام سنين → year؛ عمود أسماء موديلات → brand (looksLikeCarName).
    aliases: ["سنة الصنع", "السنة", "سنة", "سنه", "year model", "model year", "year"],
    content: looksLikeYear,
  },
  {
    key: "date", label: "تاريخ التسجيل",
    aliases: ["تاريخ التسجيل", "تاريخ الرصد", "التاريخ", "تاريخ", "date", "التاريخ والوقت"],
    content: looksLikeDate,
  },
];

function nameMatches(header: string, aliases: string[]): boolean {
  const h = header.trim().toLowerCase();
  if (!h) return false;
  // المطابقة العكسية (اسم العمود جوه المرادف) بس للأسماء ٣ حروف فأكتر — عشان أعمدة
  // قصيرة زي «م» و«#» و«##» و«*» ماتطابقش «ماركة»/«اسم المركبة» بالغلط.
  return aliases.some((a) => h === a || h.includes(a) || (h.length >= 3 && a.includes(h)));
}

function contentMatches(rows: Record<string, string>[], header: string, pred: (v: string) => boolean): number {
  const sample = rows.slice(0, 80);
  let hits = 0, nonEmpty = 0;
  for (const r of sample) {
    const v = String(r[header] ?? "").trim();
    if (!v) continue;
    nonEmpty++;
    if (pred(v)) hits++;
  }
  return nonEmpty >= 3 ? hits / nonEmpty : 0;
}

export interface ResolvedColumn {
  key: string;
  label: string;
  sourceCol: string; // اسم العمود الأصلي في الملف
}

// مصدر أعمدة لدمج نتيجة الفرز: الداتا أو أي شيت إحالة (أساسي/إضافي).
export interface ResultColumnSource {
  kind: "data" | "referral";
  headers: string[];
  rows: Record<string, string>[];
  plateCol?: string | null; // عمود اللوحة (يُستبعد من الأعمدة الناتجة)
}

export interface MergedResultColumn {
  id: string;                  // مُعرّف فريد للعمود (للـ React key) — الهدف ممكن يتكرر
  key: string;                 // مفتاح الهدف (type/brand/color...) — ممكن يتكرر عبر المصادر
  label: string;               // الاسم المعروض (متسمّى بوضوح لو اتكرر: «... (المحفظة)»)
  source: "data" | "referral"; // منين تُقرأ القيمة (صف الداتا ولا صف الإحالة)
  sourceCol: string;           // اسم العمود الأصلي في المصدر
}

/**
 * يدمج أعمدة النتيجة من عدة مصادر (الداتا + كل شيتات الإحالة الأساسية والإضافية)
 * في القائمة الثابتة بالترتيب. **مابيدمجش المصادر في عمود واحد** — لو نفس الهدف
 * (مثلاً «نوع السيارة») موجود في الداتا وفي المحفظة، بيطلّع **عمودين منفصلين**:
 * واحد من الداتا (حتى لو فاضي) وواحد من المحفظة جنبه. الأول بياخد الاسم الثابت،
 * والباقي بيتسمّى «... (المحفظة)» عشان يتميّزوا. الترتيب: أعمدة كل هدف مع بعض،
 * والداتا الأول جوه الهدف الواحد.
 */
export function resolveMergedResultColumns(
  sources: ResultColumnSource[],
  contentThreshold = 0.4,
): MergedResultColumn[] {
  const perTarget = new Map<string, Array<{ label: string; source: "data" | "referral"; sourceCol: string }>>();
  for (const src of sources) {
    for (const c of resolveResultColumns(src.headers, src.rows, src.plateCol, contentThreshold)) {
      const arr = perTarget.get(c.key) ?? [];
      const label = arr.length === 0 ? c.label : `${c.label} (${src.kind === "referral" ? "المحفظة" : "الداتا"})`;
      arr.push({ label, source: src.kind, sourceCol: c.sourceCol });
      perTarget.set(c.key, arr);
    }
  }
  const out: MergedResultColumn[] = [];
  for (const t of RESULT_TARGETS) {
    const arr = perTarget.get(t.key);
    if (!arr) continue;
    arr.forEach((a, i) => out.push({ id: `${t.key}-${i}`, key: t.key, label: a.label, source: a.source, sourceCol: a.sourceCol }));
  }
  return out;
}

/**
 * يحلّ الأعمدة المستهدفة (غير اللوحة) لأعمدة المصدر في الملف، **بالترتيب الثابت**.
 * لكل هدف: مطابقة بالاسم أولاً، وإلا بالمحتوى (نسبة ≥ contentThreshold). كل عمود
 * مصدر يُستخدم لهدف واحد بس. بيرجّع بس الأهداف اللي لقت عمود مصدر.
 */
export function resolveResultColumns(
  headers: string[],
  rows: Record<string, string>[],
  excludeCol?: string | null,
  contentThreshold = 0.4,
): ResolvedColumn[] {
  const available = headers.filter((h) => h && h !== excludeCol);
  const used = new Set<string>();
  const resolved = new Map<string, string>(); // key الهدف → اسم عمود المصدر

  // مرحلتين عشان الاسم الصريح يكسب دايماً على تخمين المحتوى: مثلاً «صانع المركبة»
  // (اسم صريح للماركة) مايتسرقش لهدف «الطراز» بالمحتوى قبل ما الماركة تاخده.
  // (١) كل الأهداف بالاسم الأول
  for (const target of RESULT_TARGETS) {
    const src = available.find((h) => !used.has(h) && nameMatches(h, target.aliases));
    if (src) { used.add(src); resolved.set(target.key, src); }
  }
  // (٢) الأهداف اللي لسه مالهاش عمود → بالمحتوى
  for (const target of RESULT_TARGETS) {
    if (resolved.has(target.key) || !target.content || rows.length === 0) continue;
    let best: string | null = null;
    let bestRatio = 0;
    for (const h of available) {
      if (used.has(h)) continue;
      const ratio = contentMatches(rows, h, target.content);
      if (ratio > bestRatio) { bestRatio = ratio; best = h; }
    }
    if (bestRatio >= contentThreshold) { used.add(best!); resolved.set(target.key, best!); }
  }

  const out: ResolvedColumn[] = [];
  for (const target of RESULT_TARGETS) {
    const src = resolved.get(target.key);
    if (src) out.push({ key: target.key, label: target.label, sourceCol: src });
  }
  return out;
}

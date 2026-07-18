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
    aliases: ["نوع السيارة", "نوع المركبة", "النوع", "نوع", "type of car", "car type", "vehicle type"],
    content: looksLikeVehicleType,
  },
  {
    key: "brand", label: "الماركة",
    aliases: ["الماركة", "ماركة", "ماركه", "الماركه", "طراز المركبة", "طراز", "الطراز",
      "صانع المركبة", "صانع", "الصانع", "اسم المركبة", "اسم السيارة",
      "vehicle name", "make", "manufacturer", "brand", "model", "car model"],
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
  return aliases.some((a) => h === a || h.includes(a) || a.includes(h));
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
  key: string;
  label: string;
  // مصادر العمود مرتّبة بالأولوية (الداتا الأول عادةً ثم الإحالات). القيمة تُقرأ
  // من **أول مصدر قيمته غير فاضية** — فلو عمود الداتا فاضي (مثلاً «نوع السيارة»
  // مش متعبّى) نرجع لعمود الإحالة (Type of car) اللي فيه قيمة.
  sources: Array<{ source: "data" | "referral"; sourceCol: string }>;
}

/**
 * يدمج أعمدة النتيجة من عدة مصادر (الداتا + كل شيتات الإحالة الأساسية والإضافية)
 * في القائمة الثابتة بالترتيب. لكل هدف: بنجمّع **كل** الأعمدة اللي حلّته من كل
 * المصادر (مرتّبة بأولوية المصادر) عشان القراءة تقدر ترجع لمصدر تاني لو الأول فاضي.
 * كده أعمدة الإحالة الإضافية (لون/سنة/ماركة) تظهر، ولو عمود الداتا فاضي القيمة
 * بتتاخد من الإحالة.
 */
export function resolveMergedResultColumns(
  sources: ResultColumnSource[],
  contentThreshold = 0.4,
): MergedResultColumn[] {
  const byKey = new Map<string, MergedResultColumn>();
  for (const src of sources) {
    for (const c of resolveResultColumns(src.headers, src.rows, src.plateCol, contentThreshold)) {
      const existing = byKey.get(c.key);
      if (existing) existing.sources.push({ source: src.kind, sourceCol: c.sourceCol });
      else byKey.set(c.key, { key: c.key, label: c.label, sources: [{ source: src.kind, sourceCol: c.sourceCol }] });
    }
  }
  return RESULT_TARGETS.map((t) => byKey.get(t.key)).filter((c): c is MergedResultColumn => !!c);
}

/**
 * قيمة خلية نتيجة الفرز لعمود مدموج: أول قيمة **غير فاضية** عبر مصادر العمود
 * (الداتا ثم الإحالات). لو كلهم فاضيين بترجّع "".
 */
export function resultCellValue(
  col: { sources: Array<{ source: "data" | "referral"; sourceCol: string }> },
  dataRow: Record<string, string> | undefined | null,
  referralRow: Record<string, string> | undefined | null,
): string {
  for (const s of col.sources) {
    const v = (s.source === "data" ? dataRow?.[s.sourceCol] : referralRow?.[s.sourceCol]) ?? "";
    if (String(v).trim() !== "") return String(v);
  }
  return "";
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
  const out: ResolvedColumn[] = [];

  for (const target of RESULT_TARGETS) {
    // (١) مطابقة بالاسم
    let src = available.find((h) => !used.has(h) && nameMatches(h, target.aliases));
    // (٢) مطابقة بالمحتوى (لو مفيش اسم مطابق وفيه كاشف محتوى)
    if (!src && target.content && rows.length > 0) {
      let best: string | null = null;
      let bestRatio = 0;
      for (const h of available) {
        if (used.has(h)) continue;
        const ratio = contentMatches(rows, h, target.content);
        if (ratio > bestRatio) { bestRatio = ratio; best = h; }
      }
      if (bestRatio >= contentThreshold) src = best!;
    }
    if (src) {
      used.add(src);
      out.push({ key: target.key, label: target.label, sourceCol: src });
    }
  }
  return out;
}

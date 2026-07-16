/**
 * ترتيب ذكي لنص الجلسة المفرّغ لخانات (لوحة / نوع / ملاحظات) — الحل اللي بيخلّي
 * الفرز يطلع نضيف زي المنافس. الفكرة: بدل تقسيم توكن-بـ-توكن وإحنا بنتكلم، نبعت
 * **النص الكامل** لـ LLM يشوف السياق كله مرة واحدة ويطلّع صفوف منظّمة. الدوال
 * دي نقية (سحب JSON + تطبيع/تحقّق) — استدعاء الـ LLM نفسه في route السيرفر.
 */
import { normalizePlate } from "./plateParser";

// قائمة أنواع السيارات الشائعة (تلميح للـ LLM؛ مش قيد صارم).
export const VEHICLE_TYPES = ["ملاكي", "نقل", "خاص", "شاصي", "سيارة", "دباب", "باص", "نصف نقل"];

// حروف اللوحات السعودية الصالحة.
const VALID_PLATE_LETTERS = "ابحدرسصطعقكلمنهوي";
const DIGIT_RE = /[0-9٠-٩]/; // غربي + عربي-هندي

/**
 * تحقّق صارم: اللوحة **بالظبط ٣ حروف صالحة + ٤ أرقام** (شكل اللوحة السعودية
 * الثابت). في مرحلة إعادة التحليل بنكون صارمين — أي حاجة غير كده تتعلّم مراجعة.
 */
export function isStrictPlate(normalized: string): boolean {
  const chars = [...String(normalized || "")];
  const letters = chars.filter((c) => !DIGIT_RE.test(c));
  const digits = chars.filter((c) => DIGIT_RE.test(c));
  if (letters.length !== 3 || digits.length !== 4) return false;
  return letters.every((c) => VALID_PLATE_LETTERS.includes(c));
}

export interface StructuredRow {
  plate: string;        // اللوحة مطبّعة (حروف + أرقام بدون فراغات)
  vehicleType: string;
  notes: string;
  needsReview: boolean; // اللوحة مش بصيغة سليمة → محتاجة مراجعة
}

/** برومبت الترتيب — يوجّه الـ LLM يرجّع JSON صفوف بالسياق الكامل. */
export function buildStructurePrompt(transcript: string): string {
  return [
    "أنت بترتّب تفريغ صوتي لمأمور ميداني بيعدّ لوحات سيارات في شارع.",
    "لوحة السيارة السعودية = ٣ حروف عربية بالظبط + ٤ أرقام بالظبط.",
    "الحروف الصالحة للّوحات: ا ب ح د ر س ص ط ع ق ك ل م ن ه و ي.",
    "المأمور بيقول العربيات ورا بعض؛ ممكن يقول نوع العربية (" + VEHICLE_TYPES.join("، ") + ") وممكن يقول ملاحظة مكان.",
    "قاعدة مهمة: الملاحظة اللي بيقولها تفضل سارية على كل العربيات اللي بعدها لحد ما يقول ملاحظة جديدة.",
    "رجّع **JSON فقط** بالشكل ده بدون أي كلام تاني:",
    '{"rows":[{"plate":"<الحروف والأرقام بدون فراغات>","vehicleType":"<النوع أو فاضي>","notes":"<الملاحظة أو فاضي>"}]}',
    "لو لوحة مش واضحة اكتب أقرب تخمين — هتتعلّم عليها علامة مراجعة تلقائياً. ماتخترعش عربيات مش موجودة في الكلام.",
    "",
    "النص:",
    transcript,
  ].join("\n");
}

/** يسحب أول كائن JSON من رد الـ LLM (بيتحمّل code fences وكلام حواليه). */
export function extractJsonObject(text: string): unknown | null {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

/** يطبّع صفوف الـ LLM ويحسب needsReview لكل لوحة. دالة نقية. */
export function normalizeStructuredRows(parsed: unknown): StructuredRow[] {
  const p = parsed as { rows?: unknown } | unknown[];
  const rawRows: unknown[] = Array.isArray(p) ? p : Array.isArray((p as { rows?: unknown })?.rows) ? (p as { rows: unknown[] }).rows : [];
  const out: StructuredRow[] = [];
  for (const r of rawRows) {
    const row = r as Record<string, unknown>;
    const rawPlate = typeof row?.plate === "string" ? row.plate : "";
    const plate = normalizePlate(rawPlate);
    if (!plate) continue; // صف بلا لوحة → تجاهل
    const vt = typeof row?.vehicleType === "string" ? row.vehicleType : typeof row?.type === "string" ? row.type : "";
    const notes = typeof row?.notes === "string" ? row.notes : "";
    out.push({ plate, vehicleType: vt.trim(), notes: notes.trim(), needsReview: !isStrictPlate(plate) });
  }
  return out;
}

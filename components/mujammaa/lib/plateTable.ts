/**
 * ══════════════════════════════════════════════════════════════════════
 *  plateTable — موديل عرض اللوحات في جدول بأعمدة بيانات السيارة
 * ══════════════════════════════════════════════════════════════════════
 *
 *  🗣️ **طلب المالك:** اللوحات اللي بتطلع بالصوت تظهر في **شيت بأعمدة**، وكل
 *  عمود فيه بيانات السيارة (النوع · البنك · الشاص · تاريخ المحفظة...).
 *
 *  الأعمدة **مش ثابتة** — بتتحسب من الشيت المرفوع: كل ترويسة ما عدا عمود
 *  اللوحة. فأي شيت بأعمدته. وبيانات السيارة موجودة **بس للّوحة المطابقة**
 *  للشيت (المطلوبة)؛ العادية أعمدتها فاضية — وده مقصود، المندوب بيشوف
 *  المطلوبة مليانة والعادية فاضية فيفرّق بينهم بنظرة.
 *
 *  ⚠️ منطق نقي هنا (بلا React) عشان يتختبر — الرسم في `PlateTable.tsx`.
 */
import type { BankSheet } from "./bankSheet";
import type { PlateEntry } from "./plateEntry";

/** أعمدة بيانات السيارة = ترويسات الشيت بلا عمود اللوحة */
export function plateDetailHeaders(sheet: BankSheet | null | undefined): string[] {
  if (!sheet || !Array.isArray(sheet.headers)) return [];
  return sheet.headers.filter((h) => h && h !== sheet.plateColumn);
}

/**
 * حالة اللوحة للتلوين: مطلوبة (في الشيت) · عادية.
 * ⚠️ المطابقة هنا **تام أو لا** بس (`matchInBankSheet` مافيهاش تقريبي)،
 * فمافيش «قريبة».
 */
export function plateStatusKind(entry: PlateEntry): "wanted" | "normal" {
  return entry?.match?.kind === "exact" ? "wanted" : "normal";
}

/**
 * قيم خلايا صف واحد — قيمة لكل عمود بيانات.
 *
 * بتيجي من صف الشيت المطابق (`match.row`). لو مافيش تطابق أو الخانة فاضية،
 * الخلية "" — فالصف العادي بيبان فاضي جنب المطلوب المليان.
 */
export function plateRowCells(entry: PlateEntry, headers: readonly string[]): string[] {
  const row = entry?.match?.row;
  return headers.map((h) => {
    if (!row) return "";
    return String(row[h] ?? "").trim();
  });
}

export interface PlateRowModel {
  id: string;
  letters: string[];
  digits: string;
  plate: string;
  status: "wanted" | "normal";
  similarity: number | null;
  cells: string[];
  capturedAt: number;
  hasCarData: boolean;
}

/** يبني موديل صف كامل للجدول */
export function buildPlateRow(entry: PlateEntry, headers: readonly string[]): PlateRowModel {
  const cells = plateRowCells(entry, headers);
  const isMatch = entry?.match?.kind === "exact";
  return {
    id: entry.id,
    letters: entry.review?.letters ?? [],
    digits: entry.review?.digits ?? "",
    plate: entry.review?.plate ?? "",
    status: plateStatusKind(entry),
    similarity: isMatch ? (entry.match.similarity ?? null) : null,
    cells,
    capturedAt: entry.capturedAt ?? 0,
    hasCarData: cells.some((c) => c !== ""),
  };
}

/**
 * درجة الثقة — تصنيف هادي بدل ما «راجعها» تبان غلط.
 *
 * 🗣️ **سبب (٢٣ أغسطس):** المالك شاف ٤٠ «راجعها» في تقرير وافتكرها غلطات.
 * الحقيقة أغلبها **صح** (الموديل أخد الأقوى). فبنجمّعهم في تلات درجات
 * واضحة عشان الملخّص يقول «أغلبها مؤكّدة» بدل بحر من «راجعها».
 *
 *  - **مؤكّدة**: المحرّكان اتفقوا، أو المندوب عدّلها بإيده.
 *  - **محتاجة نظرة**: اختلفوا وأخدنا الأقوى / فيها حشو — غالباً صح، بصّة سريعة.
 *  - **شكلها ناقص**: شكل غلط / بلا مراجعة / لسه بتتراجع — دي المشكوك فيها فعلاً.
 */
export type ConfidenceTier = "high" | "check" | "weak";

export function confidenceTier(stage: import("./plateEntry").PlateStage | undefined): ConfidenceTier {
  if (stage === "agreed" || stage === "edited") return "high";
  if (stage === "conflict" || stage === "padded") return "check";
  // shaky · unreviewed · heard · undefined (بطاقة مجمّع بلا مرحلة تعتبر مؤكّدة)
  if (stage === undefined) return "high";
  return "weak";
}

export interface TierCounts {
  high: number;
  check: number;
  weak: number;
}

/** عدّ اللوحات في كل درجة — للملخّص */
export function tierCounts(entries: readonly PlateEntry[]): TierCounts {
  const c: TierCounts = { high: 0, check: 0, weak: 0 };
  for (const e of entries) c[confidenceTier(e.stage)]++;
  return c;
}

/**
 * 🔴 **الدرجات زي ما اتقالت على البطاقة نفسها.**
 *
 * `confidenceTier` بيقرا `stage` — و`stage` معناه «المحرّكان اتفقوا».
 * لكن محرّك المقاطع لوحده (بلا ديبجرام) **مافيش عنده محرّك تاني**، فبيسيب
 * `stage` فاضية، و`stage === undefined` بتترجم «مؤكّدة».
 *
 * النتيجة في جلسة المالك (٨ سبتمبر، ١٠ لوحات بسرعة): ٤ بطاقات مكتوب
 * عليها **🟡 للمراجعة — قراءة مفردة**، و٣ منهم كانوا **غلط فعلاً**
 * (حند٩١٣٣ · درر٩٢٩١ · حبك٥٢٧٤) — والملخّص فوق قال
 * «مؤكّدة ١٠ · محتاجة نظرة ٠ · محتاجة مراجعة ٠ من ١٠».
 *
 * يعني المعلومة اللي كانت هتخلّيه يمسك التلات غلطات كانت **موجودة على
 * البطاقة** والملخّص هو اللي خباها. الملخّص اللي بيقول «كله تمام» وجوّاه
 * تلات غلطات أوحش من ملخّص مافيش.
 *
 * فلو البطاقات عليها شارات 🟢/🟡 بناخد منها؛ وإلا بنرجع لـ`stage`.
 */
export function sessionTierCounts(entries: readonly PlateEntry[]): TierCounts {
  const hasBadge = (e: PlateEntry, mark: string) =>
    (e.review?.notes ?? []).some((n) => n.startsWith(mark));
  const anyBadge = entries.some((e) => hasBadge(e, "🟢") || hasBadge(e, "🟡"));
  if (!anyBadge) return tierCounts(entries);
  const c: TierCounts = { high: 0, check: 0, weak: 0 };
  for (const e of entries) {
    // 🟡 الأول: بطاقة اتعادت وعليها الاتنين تفضل «محتاجة نظرة»
    if (hasBadge(e, "🟡")) c.check++;
    else if (hasBadge(e, "🟢")) c.high++;
    else c[confidenceTier(e.stage)]++;
  }
  return c;
}

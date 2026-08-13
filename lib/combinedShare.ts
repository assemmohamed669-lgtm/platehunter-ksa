/**
 * combinedShare — مشاركة واحدة فيها سيارات **الداتا** وسيارات **السجلات**.
 *
 * الفرز بيطلّع نافذتين منفصلتين (نتيجة الداتا، ونتيجة السجلات من شيت التشييك).
 * المندوب عايز لما يشارك تطلع رسالة/شيت واحد فيه الاتنين، وسيارات السجلات
 * يتكتب قدامها «سجلات» عشان يفرّق بينهم.
 *
 * عمود «المصدر» بيتزاد **بس** لما يبقى فيه صفوف سجلات — فلو مفيش سجلات الشيت
 * بيطلع بنفس أعمدته وترتيبه القديم بالظبط.
 */

/** صف مشاركة موحّد — نفس الحقول للداتا وللسجلات. */
export interface ShareDataRow {
  /** «سجلات» لسيارات شيت التشييك، وفاضي لسيارات الداتا. */
  src: string;
  plate: string;
  type: string;
  model: string;
  bank: string;
  dist: string;
  addr: string;
  date: string;
  gps: string;
  color: string;
  notes: string;
}

export interface CombinedShare {
  rows: ShareDataRow[];
  /** أعمدة الصورة بالترتيب المطلوب. */
  columns: string[];
  /** صفوف الصورة — نفس ترتيب `columns`. */
  imageRows: string[][];
  hasSrc: boolean;
  hasBank: boolean;
  hasDate: boolean;
}

export function buildCombinedShareRows(
  dataRows: ShareDataRow[],
  tashyeekRows: ShareDataRow[],
): CombinedShare {
  const rows = [...dataRows, ...tashyeekRows];
  const hasSrc = rows.some((r) => r.src);
  const hasBank = rows.some((r) => r.bank);
  const hasDate = rows.some((r) => r.date);

  // الترتيب اللي طلبه المندوب: المطلوب › نوع السيارة › اسم الموقع › باقي البيانات
  const columns = [
    ...(hasSrc ? ["المصدر"] : []),
    "المطلوب", "نوع السيارة", "العنوان", "الحي", "الماركة",
    ...(hasBank ? ["البنك"] : []),
    ...(hasDate ? ["تاريخ التسجيل"] : []),
    "اللون", "الملاحظات",
  ];
  const imageRows = rows.map((x) => [
    ...(hasSrc ? [x.src] : []),
    x.plate, x.type, x.addr, x.dist, x.model,
    ...(hasBank ? [x.bank] : []),
    ...(hasDate ? [x.date] : []),
    x.color, x.notes,
  ]);

  return { rows, columns, imageRows, hasSrc, hasBank, hasDate };
}

/**
 * بيبني صف مشاركة من **صف نافذة السجلات زي ما المندوب شايفه** (اسم العمود →
 * قيمته). بنقرا بالاسم مش بمفاتيح محلولة، عشان كل تفاصيل السيارة تطلع في
 * المشاركة زي ما هي في النافذة بالظبط.
 *
 * قبل كده كان بيتعاد حلّه بمفاتيح ناقصة: «الماركة» كانت بتاخد نوع السيارة بدل
 * موديل المحفظة (الموديل بيتحل تحت مفتاح type مش brand)، وباقي الأعمدة كانت
 * بتطلع فاضية لو أسماؤها مختلفة شوية.
 */
export function tashyeekShareRow(
  obj: Record<string, unknown>,
  gps = "",
): ShareDataRow {
  const pick = (...labels: (string | RegExp)[]): string => {
    for (const want of labels) {
      for (const [k, v] of Object.entries(obj)) {
        const hit = typeof want === "string" ? k === want : want.test(k);
        if (!hit) continue;
        const val = String(v ?? "").trim();
        if (val) return val;
      }
    }
    return "";
  };

  const type = pick("نوع السيارة", /^النوع$/);
  // الماركة/الموديل من المحفظة — بتتحل تحت «نوع السيارة (المحفظة)» أو «الماركة»
  const model = [pick("الماركة", /\(المحفظة\)/, /ماركة|صانع|طراز|model/i), type]
    .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" ");

  return {
    src: "سجلات",
    plate: String(obj["رقم اللوحة"] ?? "").trim(),
    type,
    model,
    bank: pick(/بنك/),
    dist: pick("الحي", /^الحي/),
    addr: pick("العنوان", "الحي-الشارع", /شارع|عنوان|موقع/),
    date: pick("تاريخ التسجيل", /تاريخ/),
    gps: gps || pick("GPS", /gps|خريطة|رابط/i),
    color: pick("اللون", /لون/),
    notes: pick(/ملاح/),
  };
}

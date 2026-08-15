/**
 * dataMerge — دمج شيت التفريغ (اللي المفرّغ بيبعته) جوّه ملف الداتا الكبير،
 * في **المكان الصح**: تحت آخر صف للموقع اللي المندوب كان واقف عنده.
 *
 * ليه المنطق كله هنا: الصفحة بتعرض وتأكّد بس — كل القرارات (مطابقة الأعمدة،
 * مكان الإدخال، الدمج) دوال نقية متغطّاة باختبارات، عشان **مانبوّظش داتا
 * المندوب**. الملف الأصلي مابيتلمسش أبداً؛ الناتج ملف جديد.
 *
 * أهم قاعدة: **مافيش صف قديم بيتغيّر أو يتشال.** الدمج إدخال بس.
 */

/** ربط عمود في شيت التفريغ بعمود في الداتا. `target: null` = يتجاهل. */
export interface ColumnMapping {
  source: string;
  target: string | null;
}

/** معلومات موقع موجود في الداتا. */
export interface LocationInfo {
  name: string;
  firstRow: number;
  lastRow: number;
  count: number;
}

/** تطبيع للمقارنة: شيل المسافات الزيادة والتطويل ووحّد الألف. */
export function normLoc(v: unknown): string {
  return String(v ?? "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** يشيل رقم الشوط اللي في أول الاسم: «81 الصفا» → «الصفا»، «2دوام كذا» → «دوام كذا». */
export function locationBase(v: unknown): string {
  return normLoc(String(v ?? "").replace(/^\s*0*\d+\s*/, ""));
}

/**
 * فهرس المواقع في الداتا: كل موقع بأول وآخر صف وعدد صفوفه.
 * الترتيب زي ما ظهروا في الملف (أول ظهور).
 */
export function buildLocationIndex(
  rows: Record<string, string>[],
  locCol: string,
): LocationInfo[] {
  const map = new Map<string, LocationInfo>();
  for (let i = 0; i < rows.length; i++) {
    const name = String(rows[i]?.[locCol] ?? "").trim();
    if (!name) continue;
    const hit = map.get(name);
    if (hit) { hit.lastRow = i; hit.count++; }
    else map.set(name, { name, firstRow: i, lastRow: i, count: 1 });
  }
  return [...map.values()];
}

/**
 * أقرب المواقع في الداتا لاسم موقع جديد — مرتّبة بالأقرب.
 *
 * الترتيب: تطابق تام بعد التطبيع، بعدين نفس الاسم بعد شيل رقم الشوط (ده
 * الحالة العادية: «81 الصفا» جاي بعد «80 الصفا»)، بعدين احتواء نصّي.
 * **مابنختارش لوحدنا** — دي مجرد اقتراحات والأدمن هو اللي يأكّد.
 */
export function suggestLocations(
  index: LocationInfo[],
  query: string,
  limit = 8,
): LocationInfo[] {
  const q = normLoc(query);
  const qBase = locationBase(query);
  if (!q) return [];

  const scored = index.map((loc) => {
    const n = normLoc(loc.name);
    const b = locationBase(loc.name);
    let score = 0;
    if (n === q) score = 100;
    else if (qBase && b === qBase) score = 80;          // نفس المكان، شوط تاني
    else if (qBase && (b.includes(qBase) || qBase.includes(b))) score = 60;
    else if (n.includes(q) || q.includes(n)) score = 40;
    return { loc, score };
  }).filter((x) => x.score > 0);

  // الأعلى نتيجة، وبعدين الأحدث في الملف (آخر صف) — المندوب بيكمّل من آخر حاجة
  scored.sort((a, b) => b.score - a.score || b.loc.lastRow - a.loc.lastRow);
  return scored.slice(0, limit).map((x) => x.loc);
}

/** أسماء المواقع الموجودة في شيت التفريغ، بالترتيب وبدون تكرار. */
export function locationsInSheet(
  rows: Record<string, string>[],
  locCol: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const v = String(r?.[locCol] ?? "").trim();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

/**
 * تطبيع اسم عمود قبل المقارنة. الداتا الحقيقية مكتوبة «الحى» بألف مقصورة
 * والشيت بيقول «الحي» بياء — من غير التطبيع ده العمود بيروح مكان غلط.
 */
function normHeader(h: string): string {
  return String(h ?? "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

/**
 * أنواع الأعمدة اللي بنعرفها. الترتيب مهم: الأخص الأول — «GPS» و«رابط الخريطة»
 * لازم يتمسكوا قبل قاعدة الموقع عشان مايتخلطوش بـ«الحي».
 */
const COL_KINDS: { kind: string; re: RegExp }[] = [
  { kind: "gps",     re: /gps|خريطه|احداث|latitude|longitude|رابط/ },
  { kind: "plate",   re: /لوح|plate/ },
  { kind: "chassis", re: /شاص|هيكل|chassis|vin/ },
  { kind: "type",    re: /^(ال)?نوع|نوع ?(ال)?(سياره|مركبه)|type/ },
  { kind: "loc",     re: /حي|منطقه|شارع|عنوان|موقع|district|area|street/ },
  { kind: "date",    re: /تاريخ|date/ },
  { kind: "color",   re: /لون|color/ },
  { kind: "model",   re: /ماركه|طراز|صانع|موديل|model|make|brand/ },
  { kind: "notes",   re: /ملاحظ|note/ },
  { kind: "bank",    re: /بنك|bank/ },
];

/** نوع العمود من اسمه — أو null لو الاسم مش معروف (شيت بلا عناوين مثلاً). */
function headerKind(h: string): string | null {
  const n = normHeader(h);
  if (!n) return null;
  return COL_KINDS.find((k) => k.re.test(n))?.kind ?? null;
}

/** عمود الحي/الموقع في مجموعة أعمدة — بتطبيع عربي، وبدون ما يخلط مع GPS. */
export function detectLocationColumn(headers: string[]): string | null {
  return headers.find((h) => headerKind(h) === "loc") ?? null;
}

/**
 * يقترح ربط أعمدة شيت التفريغ بأعمدة الداتا.
 *
 * ١) بالنوع (لوحة ← لوحة، حي ← حي…) بتطبيع عربي.
 * ٢) عمود **معروف** مالوش نظير في الداتا **بيتجاهل** — مايتحشرش في عمود
 *    تاني. ده اللي منع «التاريخ» إنه يقع جوّه «الحى» في التجربة الحقيقية.
 * ٣) الأعمدة **المجهولة** بس (شيت بلا عناوين) هي اللي بتتربط بالترتيب على
 *    الأعمدة اللي لسه فاضية.
 *
 * النتيجة **اقتراح** والأدمن بيعدّله قبل التنفيذ.
 */
export function suggestColumnMapping(
  sourceHeaders: string[],
  targetHeaders: string[],
): ColumnMapping[] {
  const usedTargets = new Set<string>();
  const out: ColumnMapping[] = sourceHeaders.map((s) => ({ source: s, target: null }));
  const targetKinds = targetHeaders.map((t) => ({ name: t, kind: headerKind(t) }));

  // ١) بالنوع
  sourceHeaders.forEach((s, i) => {
    const kind = headerKind(s);
    if (!kind) return;
    const hit = targetKinds.find((t) => t.kind === kind && !usedTargets.has(t.name));
    if (hit) { out[i].target = hit.name; usedTargets.add(hit.name); }
  });

  // ٢+٣) المجهول بس بالترتيب — المعروف اللي مالقاش نظير بيفضل متجاهَل
  const freeTargets = targetHeaders.filter((t) => !usedTargets.has(t));
  let fi = 0;
  out.forEach((m) => {
    if (m.target || headerKind(m.source)) return;
    if (fi < freeTargets.length) { m.target = freeTargets[fi]; usedTargets.add(freeTargets[fi]); fi++; }
  });

  return out;
}

/** يحوّل صف من شيت التفريغ لصف بأعمدة الداتا حسب الربط. */
export function mapRow(
  row: Record<string, string>,
  mapping: ColumnMapping[],
  targetHeaders: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of targetHeaders) out[h] = "";
  for (const m of mapping) {
    if (!m.target) continue;
    const v = String(row?.[m.source] ?? "").trim();
    if (v) out[m.target] = v;
  }
  return out;
}

export interface MergeResult {
  rows: Record<string, string>[];
  /** موضع أول صف مضاف (0-based في الناتج). */
  insertedAt: number;
  addedCount: number;
}

/**
 * بيدخّل صفوف التفريغ بعد الصف المحدد. **مافيش صف قديم بيتغيّر أو يتشال** —
 * ولا حتى المكرر: كل صف في الشيت بيتضاف زي ما هو (بطلب المندوب: «حتى لو
 * مكررة ١٠٠ مرة ده شغله وهو أدرى بيه»).
 *
 * `insertAfterIndex = -1` معناها في أول الملف. أكبر من عدد الصفوف = في الآخر.
 */
export function mergeIntoData(
  dataRows: Record<string, string>[],
  sheetRows: Record<string, string>[],
  mapping: ColumnMapping[],
  targetHeaders: string[],
  insertAfterIndex: number,
): MergeResult {
  const at = Math.max(0, Math.min(dataRows.length, insertAfterIndex + 1));
  const mapped = sheetRows.map((r) => mapRow(r, mapping, targetHeaders));
  return {
    rows: [...dataRows.slice(0, at), ...mapped, ...dataRows.slice(at)],
    insertedAt: at,
    addedCount: mapped.length,
  };
}

/** فحص أمان بعد الدمج — بيتأكد إن مافيش صف قديم ضاع أو اتغيّر. */
export function verifyMerge(
  before: Record<string, string>[],
  after: Record<string, string>[],
  insertedAt: number,
  addedCount: number,
): { ok: boolean; problem?: string } {
  if (after.length !== before.length + addedCount) {
    return { ok: false, problem: `عدد الصفوف غلط: متوقّع ${before.length + addedCount} وطلع ${after.length}` };
  }
  for (let i = 0; i < insertedAt; i++) {
    if (after[i] !== before[i]) return { ok: false, problem: `صف قديم اتغيّر قبل مكان الإدخال (صف ${i + 1})` };
  }
  for (let i = insertedAt; i < before.length; i++) {
    if (after[i + addedCount] !== before[i]) {
      return { ok: false, problem: `صف قديم اتغيّر بعد مكان الإدخال (صف ${i + 1})` };
    }
  }
  return { ok: true };
}

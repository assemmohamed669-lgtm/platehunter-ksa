/**
 * ==========================================================================
 *  📊 تقرير واحد للجلسة كلها — مقطع واحد أو أكتر (٤ أكتوبر ٢٠٢٦)
 * ==========================================================================
 *
 *  المالك: «يلا ضيفها انها تطلع كله في تقرير واحد سواء سجلت مقطع صوتي واحد
 *  او اكتر». بيقرا ورقة ١٢٥ لوحة على ٤ تسجيلات، ويفرّغ كل واحد من قايمة
 *  المقاطع — وكان بيطلع ٤ تقارير، كل واحد قدّام الورقة **كلها** (فكل تقرير
 *  بيقول ~٩٠ لوحة «ماطلعتش» وهي في تسجيل تاني).
 *
 *  الحل: كل تفريغ بيتحفظ **مدخله الخام** (`ReportPart`) جوّه تقرير الجلسة،
 *  والتقرير بيتبني من جديد على كل التسجيلات كأنها **شريط واحد متوصّل**
 *  بالترتيب (`combineParts`). الجدول نفسه لسه بيعرض لوحات المقطع الحالي بس
 *  (قرار المالك ١٠ سبتمبر) — ده التقرير بس.
 *
 *  الجلسة = نفس ورقة القراية (`sheetKey`) + ماتقفلتش («ابدأ تقرير جديد») +
 *  آخر تحديث من أقل من ٦ ساعات (`pickSessionReport`).
 *
 *  🔎 مراجعة ٤ أكتوبر — `planSessionSave` هو اللي بيقرّر التفريغ يدخل فين:
 *   · «فرّغ تاني» لمقطع ⇒ تقريره **هو** حتى لو اتقفل أو قدم (عيب ٢)، ونسخة
 *     مقفولة من النتيجة القديمة بتتحفظ جنبه — مافيش حاجة بتتمسح (عيب ٩).
 *   · الورقة اتقرت تاني (التسجيل الجديد جاب صح نفس لوحات اتجابت قبل كده) ⇒
 *     تقرير لوحده، والقديم بيتقفل بأرقامه (عيب ٨) — وإلا غلطات القراية الأولى
 *     كانت بتختفي في اتحاد القرايتين.
 *   · التسجيلات بترتيب مكانها في الورقة (عيب ٤) · «شيل التسجيل ده» (عيب ٣) ·
 *     التقرير المحفوظ مابيشيلش التشخيص مرتين (عيب ٦/١١).
 *
 *  منطق خالص (من غير واجهة ولا IndexedDB) عشان يتغطّى باختبارات.
 */
import {
  DIAG_MAX,
  buildBatchReport,
  capTexts,
  diagOf,
  hasDiag,
  normPlate,
  normWord,
  partChunkCount,
  partLayout,
  recordingsAr,
  type BatchReport,
  type ChunkRow,
  type ChunkText,
  type CohereFix,
  type CohereRescue,
  type DroppedItem,
  type ReportInput,
  type ReportPart,
  type SheetRow,
} from "./batchReport";

export type { ReportPart } from "./batchReport";

/** تقرير مفتوح بيستقبل تسجيلات لحد ٦ ساعات من آخر تفريغ دخله. */
export const SESSION_WINDOW_MS = 6 * 60 * 60 * 1000;

/* ------------------------------------------------------------ مفتاح الورقة */

/**
 * مفتاح ثابت لورقة القراية **بعد التحليل** (اللوحة + النوع + الملاحظة بالترتيب).
 * التحليل نفسه بيشيل المسافات الزيادة والسطور الفاضية، فتعديل مسافات بس مابيغيّرش
 * المفتاح — أما لوحة/نوع/ملاحظة/ترتيب مختلف ⇒ ورقة تانية ⇒ تقرير تاني.
 * ورقة فاضية ⇒ "" (التسجيلات من غير ورقة بتتجمع برضه).
 */
export function sheetKey(sheet: readonly SheetRow[]): string {
  if (!sheet?.length) return "";
  const text = sheet
    .map((s) => [normPlate(s.plate), normWord(s.type ?? ""), normWord(s.note ?? "").replace(/\s+/g, " ")].join("|"))
    .join("\n");
  // FNV-1a ‏٣٢ بت — قصير يتحفظ مع كل تقرير، والعدد جنبه بيقلّل أي تصادم
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${sheet.length}:${h.toString(36)}`;
}

/* ------------------------------------------------------------ التسجيلات */

/**
 * تسجيل جديد بيتضاف، ونفس المقطع («فرّغ تاني») **بيتبدّل مكانه** — مابيتعدّش
 * مرتين. الترتيب بلحظة بداية التسجيل (لو كلهم ليهم)، وإلا ترتيب الإضافة.
 */
export function upsertPart(parts: readonly ReportPart[], part: ReportPart): ReportPart[] {
  const i = parts.findIndex((p) => p.clipId === part.clipId);
  const out = i >= 0 ? parts.map((p, k) => (k === i ? part : p)) : [...parts, part];
  const timed = out.every((p) => typeof p.startedAtMs === "number" && Number.isFinite(p.startedAtMs));
  // `sort` ثابت (ES2019) ⇒ اللي ليهم نفس اللحظة بيفضلوا بترتيب الإضافة
  return timed ? out.sort((a, b) => a.startedAtMs! - b.startedAtMs!) : out;
}

/**
 * 🔎 (عيب ٤ · مراجعة ٤ أكتوبر) ترتيب التسجيلات **بمكانها في الورقة** (وسيط
 * أماكن اللوحات اللي طلعت صح من كل تسجيل)، ولحظة التسجيل بتفصل التعادل.
 *
 * ليه: ملف مرفوع (واتساب/درايف) لحظته = لحظة التنزيل مش التسجيل، فالترتيب
 * كان ممكن يتقلب ⇒ وقت اللوحة الضايعة على حدود تسجيلين (بيتقدّر بين جيرانها
 * في الورقة) بيقع جوّه التسجيل الغلط ودليلها يشاور على مقاطعه. لو تسجيل مالوش
 * ولا لوحة صح من الورقة (أو مافيش ورقة) ⇒ لحظة التسجيل زي الأول.
 */
export function orderParts(parts: readonly ReportPart[], sheet: readonly SheetRow[]): ReportPart[] {
  if (parts.length < 2 || !sheet?.length) return [...parts];
  const at = new Map<string, number>();
  sheet.forEach((s, i) => {
    const k = normPlate(s.plate);
    if (!at.has(k)) at.set(k, i);
  });
  const mid = parts.map((p) => {
    const xs = (Array.isArray(p.input.rows) ? p.input.rows : [])
      .map((r) => at.get(normPlate(String(r?.plate ?? ""))))
      .filter((x): x is number => x !== undefined)
      .sort((a, b) => a - b);
    return xs.length ? xs[(xs.length - 1) >> 1] : undefined;
  });
  if (mid.some((m) => m === undefined)) return [...parts];
  return parts
    .map((p, i) => ({ p, m: mid[i]!, i }))
    .sort((a, b) => a.m - b.m || a.i - b.i)
    .map((x) => x.p);
}

/**
 * 🔎 (عيب ١١ · مراجعة ٤ أكتوبر) نص المقاطع ونص كوهير في التسجيل المحفوظ
 * مقفولين على نفس حد التشخيص (~١٥٠ كيلو للتسجيل، الأطول بيتقص الأول). كان
 * التسجيل بيتحفظ بنصه كله من غير حد — تسجيل نصه ضخم كان بيعمل تقرير ٦٤٠ كيلو.
 * تسجيل عادي ⇒ نفس الكائن بالظبط (مابيتلمسش).
 */
export function capPart(part: ReportPart): ReportPart {
  const chunks = Array.isArray(part.input.chunks) ? part.input.chunks : [];
  const coh = Array.isArray(part.input.cohereTexts) ? part.input.cohereTexts : [];
  const texts = [
    ...chunks.map((c) => (typeof c?.text === "string" ? c.text : undefined)),
    ...coh.map((t) => (typeof t === "string" ? t : undefined)),
  ];
  const { texts: capped } = capTexts(texts, DIAG_MAX);
  if (capped.every((t, i) => t === texts[i])) return part;
  return {
    ...part,
    input: {
      ...part.input,
      ...(part.input.chunks ? { chunks: chunks.map((c, i) => (capped[i] === texts[i] ? c : { ...c, text: capped[i] })) } : {}),
      ...(part.input.cohereTexts ? { cohereTexts: coh.map((t, i) => capped[chunks.length + i] ?? t) } : {}),
    },
  };
}

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** وقت مزاح بالإزاحة — `null`/مش رقم بيفضل زي ما هو (لوحة مالهاش وقت تفضل مالهاش). */
function shiftT<T>(x: T, off: number): T {
  return off && finite(x) ? (r3(x + off) as unknown as T) : x;
}

/** مجموع قيمة اختيارية — `undefined` لو ولا تسجيل فيه القيمة. */
function sumOf(parts: readonly ReportPart[], pick: (i: ReportPart["input"]) => number | undefined): number | undefined {
  let any = false;
  let s = 0;
  for (const p of parts) {
    const v = pick(p.input);
    if (finite(v)) { any = true; s += v; }
  }
  return any ? s : undefined;
}

/**
 * التسجيلات ⇒ مدخل تقرير واحد، كأنها **شريط واحد متوصّل** بالترتيب:
 *
 *  · كل وقت في التسجيل k بيتزاح بمجموع مدد اللي قبله: `rows[].t_s/t_slot`
 *    · `dropped[].t_s` · `chunks[].start/end` · `cuts`.
 *  · كل رقم مقطع بيتزاح بعدد مقاطع اللي قبله (`dropped[].chunks`)، والقوايم
 *    الأربعة (`seqs` · `chunks` · `cuts` · `cohereTexts`) بتتوصّل بنفس الترتيب.
 *    🔴 تسجيل قايمة فيه أقصر من مقاطعه (مثلاً من غير نص كوهير) بيتسند بخانات
 *    فاضية — وإلا نص كوهير التسجيل اللي بعده كان هيتلزق على مقاطعه هو.
 *  · `cohereFixed[].row` بيتزاح بعدد صفوف اللي قبله (رقم الصف في الشريط).
 *  · المدد والنداءات بتتجمع، والسرعة = الصوت كله ÷ وقت السيرفر كله، والتشغيلات
 *    بـ« + »، والموديل والوصفة من آخر تسجيل.
 *  · `partBounds` = مكان كل تسجيل + أرقام الشاهد فيه هو — عشان دليل لوحة طلعت
 *    مايعدّيش لتسجيل تاني، وحكمها يبقى زي تقرير تسجيلها لوحده (عيب ٥).
 *
 *  تسجيل واحد ⇒ المدخل بتاعه **زي ما هو** (التقرير نفس `buildBatchReport` بالظبط).
 */
export function combineParts(parts: readonly ReportPart[]): Omit<ReportInput, "sheet"> {
  if (!parts.length) return { rows: [], audioSec: 0, elapsedMs: 0 };
  if (parts.length === 1) return { ...parts[0].input };

  const lay = partLayout(parts);
  const has = (pick: (i: ReportPart["input"]) => unknown) =>
    parts.some((p) => { const v = pick(p.input); return Array.isArray(v) && v.length > 0; });
  const hasChunks = has((i) => i.chunks);
  const hasCuts = has((i) => i.cuts);
  const hasSeqs = has((i) => i.seqs);
  const hasCohere = has((i) => i.cohereTexts);

  const rows: ChunkRow[] = [];
  const dropped: DroppedItem[] = [];
  const cohereFixed: CohereFix[] = [];
  const cohereRescued: CohereRescue[] = [];
  const seqs: string[][] = [];
  const chunks: ChunkText[] = [];
  const cuts: number[][] = [];
  const cohereTexts: string[] = [];
  const digits = new Set<string>();

  parts.forEach((p, k) => {
    const inp = p.input;
    const { t0: off, c0, r0 } = lay[k];
    const last = k === parts.length - 1;
    // آخر تسجيل مش محتاج سند — مافيش حاجة بعده تتلزق على مقاطعه
    const n = last ? 0 : partChunkCount(inp);
    /** القايمة بتاعة التسجيل ده، مسنودة لعدد مقاطعه بخانة فاضية */
    const fill = <T, U>(xs: readonly T[] | undefined, map: (x: T) => U, blank: () => U): U[] => {
      const src = Array.isArray(xs) ? xs : [];
      const out = src.map(map);
      while (out.length < n) out.push(blank());
      return out;
    };

    for (const r of Array.isArray(inp.rows) ? inp.rows : []) {
      const o: ChunkRow = { ...r };
      if ("t_s" in o) o.t_s = shiftT(o.t_s, off);
      if ("t_slot" in o) o.t_slot = shiftT(o.t_slot, off);
      rows.push(o);
    }
    for (const d of inp.dropped ?? []) {
      const o: DroppedItem = { ...d };
      if ("t_s" in o) o.t_s = shiftT(o.t_s, off);
      if (Array.isArray(o.chunks)) o.chunks = o.chunks.map((c) => (finite(c) ? c + c0 : c));
      dropped.push(o);
    }
    for (const f of inp.cohereFixed ?? []) {
      cohereFixed.push(finite(f.row) ? { ...f, row: f.row + r0 } : { ...f });
    }
    for (const x of inp.cohereRescued ?? []) {
      cohereRescued.push(finite(x.row) ? { ...x, row: x.row + r0 } : { ...x });
    }
    if (hasSeqs) seqs.push(...fill(inp.seqs, (q) => (Array.isArray(q) ? [...q] : []), () => []));
    if (hasChunks) {
      chunks.push(...fill(inp.chunks, (c) => {
        const o: ChunkText = { ...c };
        if ("start" in o) o.start = shiftT(o.start, off);
        if ("end" in o) o.end = shiftT(o.end, off);
        return o;
      }, () => ({})));
    }
    if (hasCuts) cuts.push(...fill(inp.cuts, (c) => (Array.isArray(c) ? c.map((x) => shiftT(x, off)) : []), () => []));
    if (hasCohere) cohereTexts.push(...fill(inp.cohereTexts, (t) => t, () => ""));
    for (const g of inp.cohereDigits ?? []) digits.add(g);
  });

  const audioSec = parts.reduce((s, p) => s + (finite(p.input.audioSec) ? p.input.audioSec : 0), 0);
  const serverMs = sumOf(parts, (i) => i.serverMs);
  const allTimed = parts.every((p) => finite(p.input.serverMs) && p.input.serverMs > 0);
  const lastIn = parts[parts.length - 1].input;
  const run = parts.map((p) => p.input.run).filter(Boolean).join(" + ");

  return {
    rows,
    ...(dropped.length ? { dropped } : {}),
    ...(cohereFixed.length ? { cohereFixed } : {}),
    ...(cohereRescued.length ? { cohereRescued } : {}),
    ...(hasSeqs ? { seqs } : {}),
    ...(hasChunks ? { chunks } : {}),
    ...(hasCuts ? { cuts } : {}),
    ...(hasCohere ? { cohereTexts } : {}),
    ...(run ? { run } : {}),
    cohereDigits: [...digits],
    audioSec: r3(audioSec),
    elapsedMs: sumOf(parts, (i) => i.elapsedMs) ?? 0,
    serverMs,
    realtimeX: allTimed && serverMs ? audioSec / (serverMs / 1000) : undefined,
    calls: sumOf(parts, (i) => i.calls),
    model: lastIn.model,
    recipe: lastIn.recipe,
    fieldsFrom: lastIn.fieldsFrom,
    // أرقام الشاهد لكل تسجيل لوحده (عيب ٥) — المتجمّعة فوق للوحات اللي مالهاش تسجيل
    partBounds: lay.map((b, k) => ({ ...b, digits: [...(parts[k].input.cohereDigits ?? [])] })),
  };
}

/* ------------------------------------------------------------ الجلسة */

const touchedAt = (r: BatchReport) => (finite(r.updatedAt) ? r.updatedAt : r.createdAt);

/** الأحدث (بآخر تحديث) المفتوح: فيه تسجيلات، ماتقفلش، واتحدّث من أقل من ٦ ساعات — بالورقة دي لو اتحددت. */
function newestOpen(reports: readonly BatchReport[], now: number, key?: string): BatchReport | undefined {
  let best: BatchReport | undefined;
  for (const r of reports ?? []) {
    if (!r?.parts?.length || r.closed === true) continue;
    if (key !== undefined && r.sheetKey !== key) continue;
    const at = touchedAt(r);
    if (!finite(at) || Math.abs(now - at) > SESSION_WINDOW_MS) continue;
    if (!best || at > touchedAt(best)) best = r;
  }
  return best;
}

/**
 * التقرير المفتوح اللي التفريغ الجاي يدخله: الأحدث (بآخر تحديث) اللي فيه
 * تسجيلات، بنفس الورقة، ماتقفلش، واتحدّث من أقل من ٦ ساعات. غير كده ⇒
 * `undefined` = تقرير جديد. التقارير القديمة (قبل ٤ أكتوبر) مافيهاش تسجيلات
 * فمابتتختارش أبداً — بتفضل زي ما هي.
 */
export function pickSessionReport(
  reports: readonly BatchReport[],
  key: string,
  now: number
): BatchReport | undefined {
  return newestOpen(reports, now, key);
}

/**
 * 🔎 (عيب ١٢ · مراجعة ٤ أكتوبر) التقرير المفتوح **بأي ورقة** — لو ورقته غير
 * الورقة الحالية، الكارت بيقول «ورقة القراية اتغيّرت — التفريغ الجاي هيبدأ
 * تقرير جديد» (كان التقرير بيتقسم من غير ما حد يقول).
 */
export function newestOpenSession(reports: readonly BatchReport[], now: number): BatchReport | undefined {
  return newestOpen(reports, now);
}

/** ورقة القراية + المفتاح + الحالة ⇒ تقرير مبني على التسجيلات دي. */
function assemble(prev: BatchReport | undefined, parts: ReportPart[], sheet: SheetRow[], now: number): BatchReport {
  const createdAt = prev?.createdAt ?? now;
  const label =
    new Date(createdAt).toLocaleString("ar-EG") + (parts.length > 1 ? ` · ${recordingsAr(parts.length)}` : "");
  const report = buildBatchReport({ sheet, ...combineParts(parts), label, now });
  return {
    ...report,
    id: prev?.id ?? report.id,
    createdAt,
    updatedAt: now,
    parts,
    sheetKey: sheetKey(sheet),
    // 🔎 (عيب ٣) الورقة نفسها محفوظة — «شيل التسجيل ده» بيعيد البنا عليها هي
    sheet: sheet.map((s) => ({ ...s })),
    // تقرير مقفول بيفضل مقفول لو «فرّغ تاني» حدّثه (عيب ٢)
    ...(prev?.closed ? { closed: true } : {}),
    ...(prev?.rereadOf ? { rereadOf: prev.rereadOf } : {}),
  };
}

/**
 * التفريغ ده ⇒ تقرير الجلسة بعده: التسجيل بيدخل (أو بيتبدّل) والتقرير
 * بيتبني من جديد على كل التسجيلات. نفس المعرّف ولحظة الإنشاء لو مكمّل على
 * تقرير مفتوح — فكل مقاطع الجلسة بتشاور على نفس التقرير.
 */
export function buildSessionReport(
  prev: BatchReport | undefined,
  part: ReportPart,
  sheet: SheetRow[],
  now: number
): BatchReport {
  return assemble(prev, orderParts(upsertPart(prev?.parts ?? [], capPart(part)), sheet), sheet, now);
}

/* ------------------------------------------- القراية التانية لنفس الورقة (عيب ٨) */

/** أقل عدد لوحات صح متكررة عشان التسجيل يتحسب «قراية تانية للورقة». */
export const REREAD_MIN = 3;
/** … ونسبتها من اللوحات اللي التسجيل الجديد جابها صح. */
export const REREAD_SHARE = 0.2;

/** لوحات التسجيل اللي في الورقة (أو كل لوحاته لو مافيش ورقة). */
function hitsOf(p: ReportPart, inSheet: Set<string> | undefined): Set<string> {
  const out = new Set<string>();
  for (const r of Array.isArray(p.input.rows) ? p.input.rows : []) {
    const k = normPlate(String(r?.plate ?? ""));
    if (k && (!inSheet || inSheet.has(k))) out.add(k);
  }
  return out;
}

/**
 * 🔎 (عيب ٨ · مراجعة ٤ أكتوبر) التسجيل الجديد قراية **تانية** لنفس الورقة؟
 * = جاب صح ≥ ٣ لوحات اتجابت صح قبل كده في تسجيلات التقرير، وده ≥ خُمس اللي
 * جابه صح. المالك بيقرا نفس الورقة كذا مرة في القعدة (١٠ سبتمبر: ٣ مرات)،
 * والاتحاد كان بيعدّ أي لوحة طلعت في أي قراية «صح» ⇒ غلطات القراية الأولى
 * بتختفي والدقة بتطلع أعلى من الحقيقة. لوحة أو اتنين على حدود تسجيلين (بيعيد
 * آخر لوحة) ⇒ لسه نفس التقرير.
 */
export function isReRead(parts: readonly ReportPart[], part: ReportPart, sheet: readonly SheetRow[]): boolean {
  const inSheet = sheet?.length ? new Set(sheet.map((s) => normPlate(s.plate))) : undefined;
  const mine = hitsOf(part, inSheet);
  if (!mine.size) return false;
  const seen = new Set<string>();
  for (const p of parts) if (p.clipId !== part.clipId) for (const x of hitsOf(p, inSheet)) seen.add(x);
  let n = 0;
  for (const x of mine) if (seen.has(x)) n++;
  return n >= REREAD_MIN && n >= REREAD_SHARE * mine.size;
}

/* ------------------------------------------------- التفريغ ده يتحفظ فين */

/** تقرير المقطع ده (مش نسخة «قبل فرّغ تاني») بنفس الورقة — الأحدث لو أكتر من واحد. */
function clipHome(reports: readonly BatchReport[], clipId: string, key: string): BatchReport | undefined {
  let best: BatchReport | undefined;
  for (const r of reports ?? []) {
    if (!r?.parts?.length || r.snapshotOf || r.sheetKey !== key) continue;
    if (!r.parts.some((p) => p.clipId === clipId)) continue;
    if (!best || touchedAt(r) > touchedAt(best)) best = r;
  }
  return best;
}

/** نفس نتيجة التفريغ؟ (نفس التشغيلة على السيرفر، أو نفس اللوحات لو مافيش اسم تشغيلة) */
function sameRun(a: ReportPart, b: ReportPart): boolean {
  if (a.input.run && b.input.run) return a.input.run === b.input.run;
  return JSON.stringify(a.input.rows ?? []) === JSON.stringify(b.input.rows ?? []);
}

/** نسخة مقفولة من التقرير زي ما هو دلوقتي — بمعرّف جديد، ومابيرجعلهاش تفريغ. */
function snapshotReport(r: BatchReport, now: number): BatchReport {
  return {
    ...r,
    id: `r${now}-${Math.random().toString(36).slice(2, 7)}`,
    closed: true,
    snapshotOf: r.id,
    label: `${r.label} · قبل «فرّغ تاني»`,
  };
}

export interface SessionSave {
  /** التقرير اللي التفريغ ده دخله — المقطع بيشاور عليه (`reportId`) */
  report: BatchReport;
  /** تقارير تانية تتحفظ في نفس المعاملة: نسخة قبل «فرّغ تاني» · تقرير اتقفل لأن الورقة اتقرت تاني */
  also: BatchReport[];
}

/**
 * التفريغ ده يدخل أنهي تقرير — وإيه اللي يتحفظ معاه:
 *
 *  ١. المقطع جوّه تقرير بنفس الورقة («فرّغ تاني») ⇒ **تقريره هو**، حتى لو
 *     اتقفل أو عدّى عليه ٦ ساعات (عيب ٢ — كان بيروح للجلسة المفتوحة ويفضل
 *     نسخة قديمة منه في تقريره). ولو النتيجة اتغيّرت ⇒ نسخة مقفولة من التقرير
 *     قبل التبديل (عيب ٩ — المالك: «ميتمسحش غير بإيدي»، وكان بيقارن تفريغين
 *     لنفس الصوت ككارتين).
 *  ٢. غير كده ⇒ التقرير المفتوح (`pickSessionReport`) — إلا لو التسجيل ده قراية
 *     تانية للورقة (`isReRead`) ⇒ تقرير جديد، والمفتوح بيتقفل (عيب ٨).
 */
export function planSessionSave(
  reports: readonly BatchReport[],
  part: ReportPart,
  sheet: SheetRow[],
  now: number
): SessionSave {
  const key = sheetKey(sheet);
  const home = clipHome(reports, part.clipId, key);
  if (home) {
    const old = home.parts!.find((p) => p.clipId === part.clipId)!;
    return {
      report: buildSessionReport(home, part, sheet, now),
      also: sameRun(old, part) ? [] : [snapshotReport(home, now)],
    };
  }
  const open = pickSessionReport(reports, key, now);
  if (open && isReRead(open.parts ?? [], part, sheet)) {
    return {
      report: { ...buildSessionReport(undefined, part, sheet, now), rereadOf: open.id },
      also: [{ ...open, closed: true }],
    };
  }
  return { report: buildSessionReport(open, part, sheet, now), also: [] };
}

/* ------------------------------------------------- «شيل التسجيل ده» (عيب ٣) */

/**
 * 🔎 (عيب ٣ · مراجعة ٤ أكتوبر) المالك بيشيل تسجيل من التقرير **بإيده** (أخد
 * غلط، دوشة، بداية اتعادت) ⇒ التقرير بيتبني من جديد على الباقي بالورقة
 * المحفوظة فيه، بنفس المعرّف. مسح المقطع نفسه **مابيلمسش** التقارير (كان كده
 * من الأول — المالك بيمسح المقاطع عشان المساحة والتقارير لازم تفضل).
 * `undefined` = مينفعش: آخر تسجيل (امسح التقرير بدل كده) · المقطع مش فيه ·
 * نسخة «قبل فرّغ تاني» (متجمّدة) · تقرير من غير ورقة محفوظة.
 */
export function removePart(r: BatchReport, clipId: string, now: number): BatchReport | undefined {
  if (r.snapshotOf || !Array.isArray(r.sheet) || !r.parts || r.parts.length < 2) return undefined;
  const parts = r.parts.filter((p) => p.clipId !== clipId);
  if (parts.length === r.parts.length) return undefined;
  return assemble(r, orderParts(parts, r.sheet), r.sheet, now);
}

/* -------------------------------------------- الحجم المحفوظ (عيب ٦/١١) */

/**
 * 🔎 (عيب ٦/١١ · مراجعة ٤ أكتوبر) التقرير زي ما بيتحفظ: تقرير فيه تسجيلات
 * مابيشيلش قسم المقاطع الخام (`diag`) — نصوصه موجودة في التسجيلات نفسها،
 * وكانت بتتحفظ مرتين (التقرير ضعف حجمه). بيتبني منها وقت العرض (`withDiag`).
 * التقارير القديمة بتتحفظ زي ما هي.
 */
export function storedReport(r: BatchReport): BatchReport {
  if (!r.parts?.length || (r.diag === undefined && r.diagCut === undefined)) return r;
  const { diag: _d, diagCut: _c, ...rest } = r;
  return rest;
}

/** التقرير بقسم المقاطع الخام — من التسجيلات لو اتحفظ من غيره. نفس النص بالظبط. */
export function withDiag(r: BatchReport): BatchReport {
  if (r.diag || !r.parts?.length) return r;
  const { diag, cut } = diagOf(combineParts(r.parts));
  return diag ? { ...r, diag, ...(cut ? { diagCut: cut } : {}) } : r;
}

/** فيه تشخيص يتعرض؟ (محفوظ، أو يتبني من التسجيلات) */
export function hasReportDiag(r: BatchReport): boolean {
  return hasDiag(r) || Boolean(r.parts?.some((p) => partChunkCount(p.input) > 0));
}

/**
 * «📄 ابدأ تقرير جديد»: كل تقرير مفتوح (فيه تسجيلات وماتقفلش) ⇒ نسخة
 * مقفولة تتحفظ مكانه. مافيش مسح — التقارير زي ما هي، بس التسجيل الجاي
 * بيبدأ تقرير لوحده.
 */
export function closeSessions(reports: readonly BatchReport[]): BatchReport[] {
  return (reports ?? []).filter((r) => r?.parts?.length && r.closed !== true).map((r) => ({ ...r, closed: true }));
}

/**
 * 📐 الكلام اللي جوّه ملف بي دي إف **من أوامر الرسم نفسها** (السيرفر بس) — لشهايد «السجل» (`lib/pdfText.ts`).
 *
 * المالك (١٩ نوفمبر ٢٠٢٦): «صلح كل حاجه عايز كل البيانات صح 100%».
 *
 * شهايد «السجل» بترسم كل قيمة **مرة واحدة كاملة** في مكانها («اسود» أمر واحد عند ارتفاع ٣٧٣). قارئ الكلام
 * العادي في PDF.js (extractText) عرض حروف الخط بتاعها بايظ، فبيقطّع: أول حرف من القيمة بيروح للسطر اللي قبله
 * («اسو» + «دنوع المركبة»، «الهز» + «اعالمنفذ ضده»، «الر» بدل «الرياض»). هنا بناخد **كل أمر رسم بمكانه** من
 * قايمة الأوامر (`getOperatorList`)، ونرصّ السطور بالارتفاع (فوق ⇒ تحت) والقطع في السطر بالمكان (شمال ⇒ يمين)
 * — نفس شكل النص اللي فك الرموز (`lib/sijilGlyphs.ts`) متعوّد عليه، بس من غير تقطيع.
 */

/** أمر رسم بالاسم (أسماء `OPS` في PDF.js). */
export interface PdfOp { fn: string; args: unknown[] | null }
/**
 * قطعة كلام = أمر رسم واحد: مكان أوله + عرضها (من عرض الحروف في الخط) + الحروف بالترتيب اللي اترسمت بيه
 * (شمال ⇒ يمين). `size` = حجم الخط (لحساب «فيه فراغ بين القطعتين ولا لازقين»).
 */
export interface PdfRun {
  x: number; y: number; w: number; size: number; text: string;
  /** الأشكال لوحدها بنفس الترتيب — شكل واحد ممكن يبقى حرفين (رباط «لا»/«لأ»/«لى»). */
  units: string[];
}

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
/** m1 × m2 (مصفوفات PDF). */
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

const SHOW = new Set(["showText", "showSpacedText", "nextLineShowText", "nextLineSetSpacingShowText"]);

export function runsFromOps(ops: readonly PdfOp[]): PdfRun[] {
  const runs: PdfRun[] = [];
  let ctm: M = ID;
  const stack: M[] = [];
  let tm: M = ID, tlm: M = ID;
  let leading = 0, size = 0;
  const moveText = (tx: number, ty: number) => { tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; };
  for (const { fn, args } of ops) {
    const a = args ?? [];
    switch (fn) {
      case "save": stack.push(ctm); break;
      case "restore": ctm = stack.pop() ?? ID; break;
      case "transform": ctm = mul(a.map((v) => num(v)) as M, ctm); break;
      case "beginText": tm = ID; tlm = ID; break;
      case "setFont": size = num(a[1], size); break;
      case "setLeading": leading = num(a[0], leading); break;
      case "moveText": moveText(num(a[0]), num(a[1])); break;
      case "setLeadingMoveText": leading = -num(a[1]); moveText(num(a[0]), num(a[1])); break;
      case "setTextMatrix": tlm = a.map((v) => num(v)) as M; tm = tlm; break;
      case "nextLine": moveText(0, -leading); break;
    }
    if (!SHOW.has(fn)) continue;
    if (fn === "nextLineShowText" || fn === "nextLineSetSpacingShowText") moveText(0, -leading);
    const items = (fn === "nextLineSetSpacingShowText" ? a[2] : a[0]) as unknown[] | undefined;
    if (!Array.isArray(items)) continue;
    const at = mul(tm, ctm);
    let text = "", advance = 0;
    const units: string[] = [];
    for (const it of items) {
      if (typeof it === "number") { advance -= (it / 1000) * size; continue; }
      const glyph = it as { unicode?: unknown; width?: unknown } | null;
      if (!glyph) continue;
      const u = typeof glyph.unicode === "string" ? glyph.unicode : "";
      if (u) { text += u; units.push(u); }
      advance += (num(glyph.width) / 1000) * size;
    }
    tm = mul([1, 0, 0, 1, advance, 0], tm);
    const end = mul(tm, ctm);
    if (text) runs.push({ x: at[4], y: at[5], w: end[4] - at[4], size: Math.abs(size * ctm[0]) || size, text, units });
  }
  return runs;
}

/** فرق الارتفاع اللي جوّه نفس السطر (أجزاء مرفوعة شوية ٢٨٤٫٢ جنب ٢٨٢٫٧) — والسطور بينها ٩ على الأقل. */
const SAME_LINE = 2.5;

/**
 * فراغ أكبر من كده (نسبة من حجم الخط) بين آخر قطعة وأول اللي بعدها = مسافة. أقل = القطعتين **لازقين** في الرسم
 * («CRN-» + «301-01081765» مرسومين قطعتين ورا بعض = رقم واحد). نص عرض المسافة تقريباً (المسافة ≈ ٠٫٢٧).
 */
const GAP = 0.12;

/** السطور فوق ⇒ تحت، والقطع جوّه السطر شمال ⇒ يمين — بمسافة بينها بس لو فيه فراغ فعلاً في الرسم. */
export function runsToText(runs: readonly PdfRun[]): string {
  const sorted = [...runs].sort((p, q) => q.y - p.y || p.x - q.x);
  const lines: PdfRun[][] = [];
  for (const r of sorted) {
    const cur = lines[lines.length - 1];
    if (cur && Math.abs(cur[0].y - r.y) <= SAME_LINE) cur.push(r);
    else lines.push([r]);
  }
  return lines.map((l) => {
    let out = "", end = -Infinity;
    for (const r of [...l].sort((p, q) => p.x - q.x)) {
      if (out && r.x - end > GAP * r.size) out += " ";
      out += r.text;
      end = Math.max(end, r.x + r.w);
    }
    return out;
  }).join("\n");
}

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔗 الرباطات في «توثيق» (المالك ١٩ نوفمبر ٢٠٢٦ — `9439.pdf`/`5172.pdf`)
 * ══════════════════════════════════════════════════════════════════════
 * خط «توثيق» بيرسم «لا»/«لأ»/«لى» **شكل واحد بحرفين**، والكلمة مرسومة معكوسة (شمال ⇒ يمين). قارئ الكلام العادي
 * بيقلبها **حرف حرف** فبيقلب الحرفين جوّه الشكل: «توكيلات» ⇒ «توكيالت»، «على» ⇒ «عىل»، «الاولى» ⇒ «االوىل».
 * من أوامر الرسم بنعرف حدود كل شكل ⇒ لكل كلمة فيها شكل بحرفين: الشكل اللي القارئ العادي بيطلّعه ⇒ الكلمة الصح
 * (الأشكال بترتيبها المعكوس). بنبدّل **الكلمات دي بس** في النص العادي — الباقي بيفضل بالحرف.
 */
const AR_LETTER = /[ء-ي]/;

export function ligatureWordFixes(runs: readonly PdfRun[]): Map<string, string> {
  const out = new Map<string, string>();
  const bad = new Set<string>();
  const flush = (word: string[]) => {
    if (!word.some((u) => [...u].length > 1)) return;
    const fixed = [...word].reverse().join("");
    const broken = [...word.join("")].reverse().join("");
    if (fixed === broken || bad.has(broken)) return;
    const had = out.get(broken);
    if (had && had !== fixed) { out.delete(broken); bad.add(broken); return; }   // نفس الشكل الغلط لكلمتين ⇒ مانبدّلش
    out.set(broken, fixed);
  };
  for (const r of runs) {
    let word: string[] = [];
    for (const u of r.units) {
      if (u && [...u].every((c) => AR_LETTER.test(c))) word.push(u);
      else { flush(word); word = []; }
    }
    flush(word);
  }
  return out;
}

/** بيبدّل الكلمات الغلط بالصح — الكلمة كاملة بس (مش جزء من كلمة أطول). */
export function applyWordFixes(text: string, fixes: ReadonlyMap<string, string>): string {
  if (!fixes.size) return text;
  const keys = [...fixes.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(^|[^\\u0621-\\u064A])(${keys.join("|")})(?![\\u0621-\\u064A])`, "g");
  return text.replace(re, (_m, pre: string, w: string) => pre + (fixes.get(w) ?? w));
}

/** القطع من أوامر الرسم لكل صفحة في ملف مفتوح (`PDFDocumentProxy` من unpdf). */
export async function pdfRuns(pdf: { numPages: number; getPage(n: number): Promise<unknown> }): Promise<PdfRun[][]> {
  const { getResolvedPDFJS } = await import("unpdf");
  const { OPS } = await getResolvedPDFJS();
  const names: Record<number, string> = {};
  for (const [k, v] of Object.entries(OPS as Record<string, number>)) names[v] = k;
  const pages: PdfRun[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = (await pdf.getPage(p)) as { getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }> };
    const ol = await page.getOperatorList();
    const ops: PdfOp[] = ol.fnArray.map((f, i) => ({ fn: names[f] ?? "", args: (ol.argsArray[i] ?? null) as unknown[] | null }));
    pages.push(runsFromOps(ops));
  }
  return pages;
}

/**
 * الكلام من أوامر الرسم لكل صفحات ملف مفتوح. أي غلط ⇒ "" (اللي بينده يرجع لقارئ الكلام العادي).
 */
export async function extractRunsText(pdf: { numPages: number; getPage(n: number): Promise<unknown> }): Promise<string> {
  try {
    return (await pdfRuns(pdf)).map((runs) => runsToText(runs)).join("\n");
  } catch {
    return "";
  }
}

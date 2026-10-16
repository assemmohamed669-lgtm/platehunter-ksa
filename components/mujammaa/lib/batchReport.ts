/**
 * ==========================================================================
 *  📊 تقرير التفريغ الشامل — صفحة المجمّع (٣٠ سبتمبر ٢٠٢٦)
 * ==========================================================================
 *
 *  المالك: «عايز تقرير لكل حاجة بقولها — نوع أو لوحة، وكم واحدة قلتها وهو
 *  طلّع كم، وكم نوع وكم ملاحظة، والمدة اللي خدها للتفريغ، وكم الهلوسة، وطلع
 *  كم لوحة متقالتش، ومطلعش لوحات إيه وإيه السبب … تقرير شامل ميسيبش حاجة،
 *  والأهم إنه ميتمسحش حتى لو خرجت من الصفحة».
 *
 *  «قلت كام» مش معروفة للصفحة لوحدها ⇒ **ورقة القراية** (اللي المندوب
 *  بيقرا منها): كل سطر = لوحة وبعدها النوع و/أو الملاحظة. لو مافيش ورقة،
 *  التقرير بيطلّع اللي طلع + تقدير من الشاهد (كوهير) — ومكتوب إنه تقدير.
 *
 *  منطق خالص (من غير واجهة) عشان يتغطّى باختبارات.
 */
import {
  VEHICLE_CONDITION_KINDS,
  VEHICLE_PLACE_KINDS,
  VEHICLE_TYPE_KINDS,
} from "./plateEntry";
import { VARIANTS } from "./ph/vehicleTypeScan";

/* ------------------------------------------------------------ التطبيع */

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** نص عربي للمقارنة: أ/إ/آ⇒ا · ة⇒ه · ى⇒ي · من غير تطويل · أرقام لاتيني. */
export function normWord(s: string): string {
  return String(s ?? "")
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d] ?? d)
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .trim();
}

/** لوحة للمقارنة: من غير مسافات + نفس تطبيع الحروف. */
export function normPlate(s: string): string {
  return normWord(s).replace(/\s+/g, "");
}

const PLATE_RE = /([ء-ي]{3})(\d{4})/;
const PLATE_RE_REV = /(\d{4})([ء-ي]{3})/;

/** لو فيه لوحة في النص ⇒ «٣ حروف + ٤ أرقام» (الأرقام قبل الحروف مقبولة كمان). */
export function findPlate(text: string): string | null {
  const c = normPlate(text);
  const m = c.match(PLATE_RE);
  if (m) return m[1] + m[2];
  const r = c.match(PLATE_RE_REV);
  if (r) return r[2] + r[1];
  return null;
}

/* ------------------------------------------------------ ورقة القراية */

export interface SheetRow {
  plate: string;
  type?: string;
  /** الملاحظة = الحالة + المكان + أي كلام تاني قاله بعد اللوحة */
  note?: string;
  raw: string;
}

const byLen = (xs: readonly string[]) =>
  [...xs].map((x) => ({ raw: x, n: normWord(x) })).sort((a, b) => b.n.length - a.n.length);
const TYPES = byLen(VEHICLE_TYPE_KINDS);
const NOTE_KINDS = byLen([...VEHICLE_CONDITION_KINDS, ...VEHICLE_PLACE_KINDS]);
/** أعضاء القايمة اللي فيها رقم («اتش١») — مابيتشالوش مع توكنات الأرقام. */
const DIGIT_MEMBERS = new Set([...TYPES, ...NOTE_KINDS].map((k) => k.n).filter((n) => /\d/.test(n)));
const SEP = "[\\s,،؛;|\\t]";
/** «اتش1» · «اتش 1» · «اتش١» (بعد normWord: ١⇒1) ⇒ توكن واحد «اتش1». */
const ATSH_RE = new RegExp(`(^|${SEP})اتش${SEP}*1(?=${SEP}|$)`, "g");
/**
 * كلمات في الورقة بتتكتب بعضو تاني من القايمة — نفس نطقات الماسح (`VARIANTS`):
 * «متحرك» في الورقة = «متحركة» اللي بتطلع، فماتتعدّش غلط. بس النطقات اللي
 * **كلمة ⇒ كلمة**، ومش كلمة جوّه عضو من كلمتين («صفرا» ⇒ «لوحه صفرا» كانت
 * هتكرّر «لوحه» في الملاحظة). و«ديانا»/«ديانة» = «دينه» — قرار المالك
 * (٣ أكتوبر ٢٠٢٦): نفس العربية، والإملاء الصح «دينه».
 */
const SHEET_ALIASES: Record<string, string> = (() => {
  const members = [...TYPES, ...NOTE_KINDS];
  const single = new Set(members.filter((k) => !k.n.includes(" ")).map((k) => k.n));
  const inPhrase = new Set(members.filter((k) => k.n.includes(" ")).flatMap((k) => k.n.split(" ")));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(VARIANTS)) {
    const nk = normWord(k);
    const nv = normWord(v);
    if (nk.includes(" ") || !single.has(nv) || single.has(nk) || inPhrase.has(nk)) continue;
    out[nk] = nv;
  }
  return { ...out, ديانا: "دينه", ديانه: "دينه" };
})();
/** قيمة طالعة من السيرفر (ممكن قديمة زي «ديانا») ⇒ نفس شكل الورقة للمقارنة. */
const canonField = (x: string) => SHEET_ALIASES[x] ?? x;

/**
 * كل سطر فيه لوحة ⇒ صف. الحروف ممكن تبقى مفصولة («ح ب ك 1234»)، والأرقام
 * عربي أو لاتيني. اللي بعد اللوحة: أول نوع من القايمة ⇒ النوع، والحالات/الأماكن
 * ⇒ الملاحظة، وأي كلام تاني بيتحط في الملاحظة زي ما هو.
 */
export function parseReadingSheet(text: string): SheetRow[] {
  const out: SheetRow[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    // «اتش1» يتلمّ توكن واحد الأول — وبيتشال من دوّارة اللوحة («اتش1 3016 اول»
    // كانت هتبقى «اتش1301»)
    let clean = normWord(line).replace(ATSH_RE, "$1اتش1");
    let plate = findPlate(clean.replace(ATSH_RE, "$1 "));
    // «اتش 1 2 3 4» = لوحة حروفها اتش وأرقامها مفصولة — مش نوع
    if (!plate) plate = findPlate((clean = normWord(line)));
    if (!plate) continue;
    // الكلام من غير اللوحة: نشيل كل توكن فيه رقم (إلا عضو زي «اتش1») وكل حرف مفرد
    let rest = " " + clean
      .split(new RegExp(`${SEP}+`))
      .map((t) => SHEET_ALIASES[t] ?? t)
      // حروف اللوحة نفسها لو مكتوبة ملزوقة («1234 حبك») مش جزء من الملاحظة
      .filter((t) => t && (DIGIT_MEMBERS.has(t) || (!/\d/.test(t) && t.length > 1 && t !== plate.slice(0, 3))))
      .join(" ") + " ";
    let type: string | undefined;
    for (const t of TYPES) {
      if (rest.includes(" " + t.n + " ")) {
        type = t.raw;
        rest = rest.replace(" " + t.n + " ", " ");
        break;
      }
    }
    const notes: string[] = [];
    for (const k of NOTE_KINDS) {
      if (rest.includes(" " + k.n + " ")) {
        notes.push(k.raw);
        rest = rest.replace(" " + k.n + " ", " ");
      }
    }
    const free = rest.trim();
    if (free) notes.push(free);
    out.push({ plate, type, note: notes.length ? notes.join(" · ") : undefined, raw: line.trim() });
  }
  return out;
}

/* ------------------------------------------------------------ التقرير */

export interface ChunkRow {
  plate: string;
  support?: number;
  type?: string | null;
  condition?: string | null;
  place?: string | null;
  /** وقت اللوحة التقريبي في التسجيل (ث) — من السيرفر */
  t_s?: number | null;
  /**
   * التقدير الخشن القديم لوقت اللوحة (للمراجعة بس — التقرير مابيقراهوش). متسجّل
   * هنا عشان التقرير المجمّع (٤ أكتوبر) يزيحه مع `t_s` لما التسجيلات تتوصّل.
   */
  t_slot?: number | null;
}

/** نص الموديل الخام لكل مقطع (`/api/seg-chunks` ⇒ `chunks[]`). */
export interface ChunkText {
  start?: number;
  end?: number;
  text?: string;
}

/**
 * لوحة السيرفر شالها. القديم كان `{plate, support}` بس، والجديد ممكن يقول ليه:
 * `why:"edge"` = قاعدة الشهود (`?edge=`): مقطع واحد بس سمعها مع إن ٣ مقاطع
 * أو أكتر غطّت وقتها (`coverage`) — الاسم من النسخة الأولى للقاعدة، مش «طرف
 * المقطع» · `why:"lone"` = مقطع واحد بس سمعها وجيرانها اتسمعوا كتير.
 */
export interface DroppedItem {
  plate: string;
  support: number;
  why?: "edge" | "lone" | string;
  /** شهود الجيران (رقم أو [قبل، بعد]) */
  nbr?: number | number[];
  /** أرقام المقاطع اللي سمعتها */
  chunks?: number[];
  t_s?: number;
  coverage?: number;
  /** `why: "cohere_dup"` — اللوحة اللي اتحسبت نفس نطقها (٤ أكتوبر · `cohere_fix.py`) */
  same_as?: string;
}

/** 🔢 لوحة صلّحها السيرفر من كوهير (٤ أكتوبر · `cohere_fix.py`) — `dup` = اتشالت لأنها نفس النطق. */
export interface CohereFix {
  from: string;
  to: string;
  action: "fix" | "dup" | string;
  row?: number;
  /** كام مقطع كوهير سمع الرقم الجديد فيه … */
  heard?: number;
  /** … من كام مقطع فيه نص كوهير غطّى اللوحة */
  of?: number;
}

/** 🛟 لوحة الموديل سكت عنها وكوهير سمعها فاتنقذت (٤ أكتوبر · `cohere_rescue.py`). */
export interface CohereRescue {
  plate: string;
  row?: number;
  /** اللوحة اللي قبلها/بعدها في الشريط */
  after?: string;
  before?: string;
  /** كام مقطع كوهير سمعها فيه */
  heard?: number;
  full?: number;
  chunks?: number[];
  cells?: number;
}

export interface ReportInput {
  sheet: SheetRow[];
  rows: ChunkRow[];
  dropped?: DroppedItem[];
  cohereFixed?: CohereFix[];
  cohereRescued?: CohereRescue[];
  seqs?: string[][];
  /** نص الموديل الخام لكل مقطع + حدوده — نفس ترتيب `seqs` */
  chunks?: ChunkText[];
  /** حدود كل مقطع [بداية، نهاية] بالثانية — احتياطي لو `chunks` مافيهاش وقت */
  cuts?: number[][];
  /** نص كوهير الخام لكل مقطع — نفس الترتيب */
  cohereTexts?: string[];
  /** اسم فولدر الأرشيف على السيرفر (عشان نرجع للصوت نفسه) */
  run?: string;
  cohereDigits?: string[];
  audioSec: number;
  elapsedMs: number;
  serverMs?: number;
  realtimeX?: number;
  calls?: number;
  model?: string;
  recipe?: Record<string, unknown>;
  fieldsFrom?: string;
  label?: string;
  now?: number;
  /**
   * 📊 حدود كل تسجيل في الشريط المتوصّل (`combineParts` · ٤ أكتوبر) — موجودة
   * بس لو التقرير بيجمع أكتر من تسجيل. لوحة **طلعت** في تسجيل معروف دليلها
   * بيتاخد من مقاطع تسجيلها هو بس (شوف `PartBound`).
   */
  partBounds?: PartBound[];
}

/**
 * 🎙️ تسجيل واحد جوّه تقرير الجلسة (٤ أكتوبر ٢٠٢٦) — المدخل الخام لتفريغه.
 *
 * المالك: «تطلع كله في تقرير واحد سواء سجلت مقطع صوتي واحد او اكتر». فبدل
 * ما التقرير يتحفظ **نتيجة** بس، كل تفريغ بيتحفظ **مدخله** هنا، والتقرير
 * بيتبني من جديد على كل التسجيلات مع بعض (`sessionReport.ts`) — كده «فرّغ
 * تاني» بيبدّل تسجيله بدل ما يتعدّ مرتين.
 */
export interface ReportPart {
  /** المقطع المحفوظ (`clipStore`) — مفتاح «فرّغ تاني» */
  clipId: string;
  /** اسمه في قايمة المقاطع («مقطع ٣») */
  label?: string;
  /** لحظة بداية التسجيل (توقيت مطلق) — ترتيب التسجيلات في الشريط */
  startedAtMs?: number;
  input: Omit<ReportInput, "sheet" | "label" | "now">;
}

/**
 * مكان تسجيل في الشريط المتوصّل: الوقت [t0، t1] بالثانية · أرقام مقاطعه
 * [c0، c1) · صفوف لوحاته [r0، r1).
 *
 * 🔴 ليه: الإزاحة لوحدها مش كفاية. لوحة من غير وقت (`t_s = null`) كانت
 * بتاخد أي مقطع فيه قراية قريبة **في أي تسجيل**، وتسجيل قصير (<١٠ث) في
 * النص كان بيخلّي سماحية الوقت (±١٠ث) تعدّي لمقطع التسجيل اللي قبله.
 */
export interface PartBound {
  t0: number;
  t1: number;
  c0: number;
  c1: number;
  r0: number;
  r1: number;
  /**
   * أرقام الشاهد (كوهير) **في التسجيل ده بس** — من `combineParts` (عيب ٥ ·
   * مراجعة ٤ أكتوبر). اختراع في تسجيل أرقامه الشاهد سمعها في تسجيل تاني للوحة
   * تانية كان بيتحسب «ممكن اتقالت». مش موجودة ⇒ أرقام التقرير كله زي الأول.
   */
  digits?: string[];
}

/** قراية مقطع واحد غطّى وقت اللوحة: اللي الموديل كتبه جنبها، أو `null` = سكت. */
export interface ChunkRead {
  /** رقم المقطع (من صفر — زي أرشيف السيرفر) */
  i: number;
  s?: number;
  e?: number;
  read: string | null;
}

/** الدليل: ليه اللوحة طلعت كده — من نص الموديل وكوهير الخام. */
export interface Evidence {
  /** وقت اللوحة التقريبي (ث) — من السيرفر أو بين جيرانها في الورقة */
  t?: number;
  reads: ChunkRead[];
  dropped?: DroppedItem[];
  /** حتة من نص كوهير الخام حوالين اللوحة */
  cohere?: string;
  /** المقطع اللي الحتة دي منه */
  cohereAt?: number;
}

export interface Issue {
  plate: string;
  reason: string;
  heardAs?: string;
  /** «قراية تانية غلط» — اللوحة اللي اتقالت فعلاً */
  secondOf?: string;
  evidence?: Evidence;
  /**
   * ⏳ (عيب ١٠ · ٤ أكتوبر) لوحة ضايعة محدّش سمعها **بعد آخر** (أو قبل أول)
   * لوحة اتسمعت من الورقة — غالباً في تسجيل لسه ماتفرّغش، مش غلط موديل.
   */
  notYet?: boolean;
}

export interface FieldStat {
  said: number;
  got: number;
  correct: number;
  wrong: Array<{ plate: string; said: string; got: string; cohere?: string }>;
  missing: Array<{ plate: string; said: string; cohere?: string }>;
  extra: Array<{ plate: string; got: string }>;
}

/** مقطع في قسم التشخيص: بداية · نهاية · نص الموديل · نص كوهير (مختصر عشان الحجم). */
export interface DiagChunk {
  s?: number;
  e?: number;
  m: string;
  c?: string;
}

export interface BatchReport {
  id: string;
  createdAt: number;
  label: string;
  hasSheet: boolean;
  audioSec: number;
  elapsedMs: number;
  serverMs?: number;
  realtimeX?: number;
  calls?: number;
  model?: string;
  recipe?: Record<string, unknown>;
  fieldsFrom?: string;
  /** اسم فولدر الأرشيف على السيرفر */
  run?: string;
  /** 🔢 اللي اتصلّح من كوهير (لو فيه) */
  cohereFixed?: CohereFix[];
  /** 🛟 اللي اتنقذ من كوهير (لو فيه) */
  cohereRescued?: CohereRescue[];
  /** نص الموديل + كوهير الخام لكل مقطع (مقفول على ~١٥٠ كيلو) */
  diag?: DiagChunk[];
  /** كام نص اتقص عشان الحد */
  diagCut?: number;
  said: number;
  got: number;
  correct: number;
  missed: Issue[];
  misread: Array<{ said: string; got: string; evidence?: Evidence }>;
  extras: Issue[];
  inventions: number;
  types: FieldStat;
  notes: FieldStat;
  out: Array<{
    plate: string;
    support?: number;
    type?: string;
    note?: string;
    status: string;
    /** رقم التسجيل اللي طلعت فيه (من ١) — بس في تقرير بيجمع أكتر من تسجيل */
    rec?: number;
    /** طلعت قبل كده في الشريط — سطر زيادة في القايمة، بس اتعدّت مرة واحدة في «طلع» */
    again?: boolean;
  }>;
  /** ⏳ كام لوحة من الضايعة في حتة من الورقة مافيش تسجيل متفرّغ غطّاها (`Issue.notYet`) */
  notYet?: number;
  /** 🔁 كام لوحة طلعت في أكتر من تسجيل (اتعدّت مرة واحدة) */
  repeats?: number;
  /*
   * 📊 تقرير الجلسة (٤ أكتوبر ٢٠٢٦) — كلهم اختياريين: التقارير القديمة المحفوظة
   * مافيهاش أي واحد منهم وبتتعرض زي ما هي.
   */
  /** التسجيلات اللي التقرير بيجمعها (مدخل كل تفريغ خام) */
  parts?: ReportPart[];
  /** مفتاح ورقة القراية (`sheetKey`) — التسجيل الجاي بنفس الورقة يدخل هنا */
  sheetKey?: string;
  /** آخر مرة اتضاف/اتبدّل فيه تسجيل */
  updatedAt?: number;
  /** «ابدأ تقرير جديد» قفله — مابيستقبلش تسجيلات تاني */
  closed?: boolean;
  /*
   * 🔎 مراجعة ٤ أكتوبر — برضه اختياريين.
   */
  /** ورقة القراية اللي اتبنى عليها — عشان «شيل التسجيل ده» يعيد البنا من غير الورقة الحالية */
  sheet?: SheetRow[];
  /** نسخة مقفولة من التقرير ده قبل «فرّغ تاني» بدّل تسجيل فيه (المعرّف بتاع الأصلي) */
  snapshotOf?: string;
  /** الورقة دي اتقرت تاني ⇒ التقرير ده بدأ لوحده، واللي قبله (المعرّف ده) اتقفل */
  rereadOf?: string;
}

const digitsOf = (p: string) => p.replace(/\D/g, "");

/** فرق خانة واحدة بالظبط (حرف أو رقم). */
function oneOff(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return d === 1;
}

/** نفس الحروف والأرقام متبدّلة في خانتين متجاورتين (٥٤⇐٤٥ — نطق مركّب). */
function swapped(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  return diff.length === 2 && diff[1] === diff[0] + 1 &&
    a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
}

function near(a: string, b: string) {
  return oneOff(a, b) || swapped(a, b);
}

function kindOfMiss(a: string, b: string): string {
  if (swapped(a, b)) return "رقمين اتبدّلوا (غالباً نطق مركّب)";
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return i < 3 ? `الحرف رقم ${i + 1} اتسمع غلط` : `الرقم رقم ${i - 2} اتسمع غلط`;
  }
  return "قراءة مختلفة";
}

/** عدد المقاطع بالعربي: مقطع واحد · مقطعين · ٣-١٠ مقاطع · ١١+ مقطع. */
export function chunksAr(n: number): string {
  if (n === 1) return "مقطع واحد";
  if (n === 2) return "مقطعين";
  return `${n} ${n >= 3 && n <= 10 ? "مقاطع" : "مقطع"}`;
}

/** عدد التسجيلات بالعربي — نفس قاعدة `chunksAr`: تسجيل واحد · تسجيلين · ٣-١٠ تسجيلات · ١١+ تسجيل. */
export function recordingsAr(n: number): string {
  if (n === 1) return "تسجيل واحد";
  if (n === 2) return "تسجيلين";
  return `${n} ${n >= 3 && n <= 10 ? "تسجيلات" : "تسجيل"}`;
}

/* ------------------------------------- التسجيلات في شريط واحد (٤ أكتوبر) */

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** تقريب ٣ خانات — جمع الأوقات العشرية مايطلّعش 214.99999999999997 */
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** عدد مقاطع تفريغ واحد — نفس `n` في `chunkCtx` (أطول قايمة من الأربعة). */
export function partChunkCount(inp: Pick<ReportInput, "chunks" | "cuts" | "seqs" | "cohereTexts">): number {
  const len = (x: unknown) => (Array.isArray(x) ? x.length : 0);
  return Math.max(len(inp.chunks), len(inp.cuts), len(inp.seqs), len(inp.cohereTexts));
}

/**
 * طول التسجيل في الشريط = مدته (`audioSec`)، إلا لو فيه وقت جوّاه أكبر منها
 * (مدة ناقصة أو صفر من سيرفر قديم) — وإلا التسجيل اللي بعده كان هيركب عليه.
 */
export function partSpanSec(inp: Omit<ReportInput, "sheet">): number {
  let m = finite(inp.audioSec) ? inp.audioSec : 0;
  const see = (x: unknown) => { if (finite(x) && x > m) m = x; };
  for (const r of inp.rows ?? []) { see(r?.t_s); see(r?.t_slot); }
  for (const d of inp.dropped ?? []) see(d?.t_s);
  for (const c of inp.chunks ?? []) { see(c?.start); see(c?.end); }
  for (const c of inp.cuts ?? []) if (Array.isArray(c)) c.forEach(see);
  return m;
}

/** مكان كل تسجيل في الشريط المتوصّل بالترتيب (الوقت · المقاطع · الصفوف). */
export function partLayout(parts: readonly ReportPart[]): PartBound[] {
  const out: PartBound[] = [];
  let t = 0;
  let c = 0;
  let r = 0;
  for (const p of parts) {
    const t1 = r3(t + partSpanSec(p.input));
    const n = partChunkCount(p.input);
    const rows = Array.isArray(p.input.rows) ? p.input.rows.length : 0;
    out.push({ t0: t, t1, c0: c, c1: c + n, r0: r, r1: r + rows });
    t = t1;
    c += n;
    r += rows;
  }
  return out;
}

const noteOfRow = (r: ChunkRow) =>
  [r.condition, r.place].filter((x): x is string => Boolean(x && String(x).trim())).join(" · ") || undefined;

function fieldStat(
  sheetMap: Map<string, SheetRow>,
  outMap: Map<string, ChunkRow>,
  pick: (s: SheetRow) => string | undefined,
  pickOut: (r: ChunkRow) => string | undefined,
  /** حتة من نص كوهير حوالين اللوحة — عشان نشوف هو سمع إيه مكان النوع/الملاحظة */
  excerpt: (plate: string) => string | undefined = () => undefined
): FieldStat {
  const st: FieldStat = { said: 0, got: 0, correct: 0, wrong: [], missing: [], extra: [] };
  const withCohere = <T extends object>(p: string, o: T): T => {
    const c = excerpt(p);
    return c ? { ...o, cohere: c } : o;
  };
  for (const [p, s] of sheetMap) {
    const sv = pick(s);
    if (sv) st.said++;
    const r = outMap.get(p);
    const gv = r ? pickOut(r) : undefined;
    if (!sv && gv) st.extra.push({ plate: p, got: gv });
    if (sv && !r) continue; // اللوحة نفسها ضايعة — بتتعدّ في الضايع مش هنا
    if (sv && !gv) st.missing.push(withCohere(p, { plate: p, said: sv }));
    if (sv && gv) {
      const a = normWord(sv).split(" · ").map((x) => canonField(x.trim())).sort().join("·");
      const b = normWord(gv).split(" · ").map((x) => canonField(x.trim())).sort().join("·");
      if (a === b) st.correct++;
      else st.wrong.push(withCohere(p, { plate: p, said: sv, got: gv }));
    }
  }
  for (const r of outMap.values()) if (pickOut(r)) st.got++;
  return st;
}

/* ---------------------------------------------- الدليل (التشخيص · ٣ أكتوبر) */
/*
 * المالك: «التقرير لازم يقول **ليه** اللوحة طلعت غلط أو ماطلعتش — وضيف نص
 * كوهير الخام». السيرفر بيبعت كل حاجة (نص كل مقطع، لوحاته، حدوده، نص كوهير)
 * والتقرير القديم كان بيرميها. هنا بنمسك المقاطع اللي **غطّت وقت اللوحة**
 * ونقول كل مقطع كتب إيه جنبها — أو سكت.
 *
 * 🔴 مافيش فكّ لأرقام كوهير المنطوقة هنا (ده محرّك كامل في بايثون). الحتة
 * بتتاخد **بالوقت**: مكان اللوحة جوّه المقطع × عدد الكلمات، ±١٤ كلمة.
 */

const lettersOf = (p: string) => p.slice(0, 3);

/** عدد الأرقام المختلفة خانة بخانة (لو الطول مختلف ⇒ ∞). */
function digitDiff(a: string, b: string): number {
  const x = digitsOf(a);
  const y = digitsOf(b);
  if (x.length !== y.length) return Infinity;
  let d = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++;
  return d;
}

/**
 * قراية «قريبة» من اللوحة: نفس الحروف و≤٢ أرقام مختلفين، أو نفس الأرقام
 * وحرف واحد مختلف، أو `near` (خانة/رقمين متبدّلين). **لوحة تانية في الورقة
 * مش قراية ليها** — «اول3031» مش قراية لـ«اول3016» حتى لو الفرق رقمين.
 */
function variantOf(p: string, x: string, sheet: Map<string, SheetRow>): boolean {
  if (x === p) return true;
  if (sheet.has(x)) return false;
  if (near(p, x)) return true;
  return lettersOf(p) === lettersOf(x) && digitDiff(p, x) <= 2;
}

/** مقطع لقى قراية قريبة بس وقته بعيد عن اللوحة بأكتر من كده ⇒ مش بتاعها. */
const VARIANT_SLACK_S = 10;
/** «قراية تانية غلط» لازم تبقى قريبة في الوقت من الغلطة الأولى. */
const SECOND_MAX_S = 8;
const EXCERPT_WORDS = 14;
const DIAG_MAX_BYTES = 150_000;
const CUT_MARK = " …[اتقص]";

interface ChunkCtx {
  n: number;
  span: (i: number) => { s?: number; e?: number };
  seqs: string[][];
  texts: string[];
  cohere: string[];
  sheet: Map<string, SheetRow>;
}

const num = (x: unknown): number | undefined =>
  typeof x === "number" && Number.isFinite(x) ? x : undefined;

function chunkCtx(inp: ReportInput, sheet: Map<string, SheetRow>): ChunkCtx {
  const chunks = Array.isArray(inp.chunks) ? inp.chunks : [];
  const cuts = Array.isArray(inp.cuts) ? inp.cuts : [];
  const seqs = (Array.isArray(inp.seqs) ? inp.seqs : []).map((q) => (Array.isArray(q) ? q.map(normPlate) : []));
  const cohere = Array.isArray(inp.cohereTexts) ? inp.cohereTexts : [];
  return {
    n: Math.max(chunks.length, cuts.length, seqs.length, cohere.length),
    span: (i) => ({
      s: num(chunks[i]?.start) ?? num(cuts[i]?.[0]),
      e: num(chunks[i]?.end) ?? num(cuts[i]?.[1]),
    }),
    seqs,
    texts: chunks.map((c) => String(c?.text ?? "")),
    cohere: cohere.map((c) => String(c ?? "")),
    sheet,
  };
}

/**
 * المقاطع اللي غطّت اللوحة: اللي وقتها جوّه حدود المقطع، + أي مقطع سلسلته
 * فيها قراية قريبة (لو وقته مش بعيد). كده «انا7675» اللي الموديل ماطلّعهاش
 * صح ولا مرة لسه ليها دليل: المقاطع اللي غطّت ~٥٠-٦٠ث وسكتت.
 *
 * `only` (تقرير الجلسة · ٤ أكتوبر): لوحة معروف هي من أنهي تسجيل ⇒ مقاطع
 * التسجيل ده بس — مايعدّيش على مقطع في تسجيل تاني.
 */
function coveringChunks(cx: ChunkCtx, p: string, t: number | undefined, only?: PartBound): number[] {
  const out: number[] = [];
  for (let i = 0; i < cx.n; i++) {
    if (only && (i < only.c0 || i >= only.c1)) continue;
    const { s, e } = cx.span(i);
    const timed = s !== undefined && e !== undefined;
    if (t !== undefined && timed && s! <= t && t <= e!) { out.push(i); continue; }
    if (!(cx.seqs[i] ?? []).some((x) => variantOf(p, x, cx.sheet))) continue;
    if (t === undefined || !timed || (s! - VARIANT_SLACK_S <= t && t <= e! + VARIANT_SLACK_S)) out.push(i);
  }
  return out;
}

/** الموديل كتب إيه جنب اللوحة في المقطع ده — أو `null` لو سكت. */
function readIn(cx: ChunkCtx, p: string, i: number): string | null {
  const seq = cx.seqs[i] ?? [];
  const pick = (f: (x: string) => boolean) => seq.find(f);
  const found =
    pick((x) => x === p) ??
    pick((x) => !cx.sheet.has(x) && near(p, x)) ??
    pick((x) => variantOf(p, x, cx.sheet)) ??
    // جوّه وقتها: نفس الحروف بأرقام بعيدة (حوص6146 لـ«حوص4168») لسه قرايتها
    pick((x) => !cx.sheet.has(x) && lettersOf(x) === lettersOf(p));
  if (found) return found;
  // لوحة مقطوعة في النص الخام («اول30» على طرف المقطع) — مش في السلسلة
  for (const tok of normWord(cx.texts[i] ?? "").split(/\s+/)) {
    const m = tok.match(/^([ء-ي]{3})(\d{1,3})$/);
    if (m && m[1] === lettersOf(p)) return tok;
  }
  return null;
}

/**
 * حتة من نص كوهير الخام حوالين اللوحة: أحسن مقطع = اللي وقت اللوحة في نصّه
 * (أبعد حاجة عن الطرفين)، ومكانها التقريبي = (t−بداية)/(نهاية−بداية) × عدد الكلمات.
 */
function cohereExcerpt(
  cx: ChunkCtx,
  p: string,
  t: number | undefined,
  cover: number[]
): { text: string; at: number } | undefined {
  let best = -1;
  let bestScore = -Infinity;
  let frac = 0.5;
  for (const i of cover) {
    if (!cx.cohere[i]?.trim()) continue;
    const { s, e } = cx.span(i);
    let f: number;
    let score: number;
    if (t !== undefined && s !== undefined && e !== undefined && e > s && s <= t && t <= e) {
      f = (t - s) / (e - s);
      score = Math.min(t - s, e - t);
    } else {
      // من غير وقت: مكان القراية في سلسلة المقطع
      const seq = cx.seqs[i] ?? [];
      const k = seq.findIndex((x) => variantOf(p, x, cx.sheet));
      f = k >= 0 && seq.length ? (k + 0.5) / seq.length : 0.5;
      score = -1e9 + (k >= 0 ? 1 : 0);
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
      frac = f;
    }
  }
  if (best < 0) return undefined;
  const words = cx.cohere[best].trim().split(/\s+/);
  const pos = Math.round(frac * words.length);
  const a = Math.max(0, pos - EXCERPT_WORDS);
  const b = Math.min(words.length, pos + EXCERPT_WORDS + 1);
  return {
    text: (a > 0 ? "… " : "") + words.slice(a, b).join(" ") + (b < words.length ? " …" : ""),
    at: best,
  };
}

/** حجم UTF-8 بالبايت (العربي ٢ بايت للحرف). */
function utf8Len(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdfff ? 2 : 3;
  }
  return n;
}

/** أول جزء من النص اللي حجمه ≤ max بايت (من غير ما نقسم حرف مزدوج). */
function cutToBytes(s: string, max: number): string {
  let n = 0;
  let i = 0;
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const w = c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c <= 0xdfff ? 2 : 3;
    if (n + w > max) break;
    n += w;
  }
  if (i > 0 && i < s.length) {
    const c = s.charCodeAt(i - 1);
    if (c >= 0xd800 && c <= 0xdbff) i--;
  }
  return s.slice(0, i);
}

/**
 * نصوص مقفولة على `max` بايت كلها: لو أكبر، **الأطول بيتقص الأول** (سقف واحد
 * لكل النصوص — اللي تحته مابيتلمسش). `undefined` بيفضل زي ما هو.
 *
 * 🔎 (مراجعة ٤ أكتوبر · عيب ١١) نفس القاعدة بتتطبّق على نص كل تسجيل محفوظ في
 * تقرير الجلسة، فنص اتقص قبل كده ممكن يتقص تاني في التشخيص ⇒ العلامة القديمة
 * بتتشال الأول (مايبقاش «…[اتق …[اتقص]»)، والنص اللي فيه العلامة بيتعدّ مقصوص.
 */
export function capTexts<T extends string | undefined>(texts: readonly T[], max: number): { texts: T[]; cut: number } {
  const lens = texts.map((t) => (t === undefined ? 0 : utf8Len(t)));
  const out = [...texts];
  const marked = (t: T) => t !== undefined && t.endsWith(CUT_MARK);
  const total = lens.reduce((a, b) => a + b, 0);
  if (total <= max) return { texts: out, cut: out.filter(marked).length };
  // أكبر سقف L بحيث مجموع min(طول، L) ≤ الحد
  let lo = 0;
  let hi = Math.max(...lens);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (lens.reduce((a, b) => a + Math.min(b, mid), 0) <= max) lo = mid;
    else hi = mid - 1;
  }
  const keep = Math.max(0, lo - utf8Len(CUT_MARK));
  out.forEach((t, k) => {
    if (t === undefined || lens[k] <= lo) return;
    const base = t.endsWith(CUT_MARK) ? t.slice(0, -CUT_MARK.length) : t;
    out[k] = (cutToBytes(base, keep) + CUT_MARK) as T;
  });
  return { texts: out, cut: out.filter(marked).length };
}

/**
 * قسم المقاطع الخام، مقفول على ~١٥٠ كيلو: لو أكبر، **الأطول بيتقص الأول**
 * (سقف واحد لكل النصوص — اللي تحته مابيتلمسش)، وعدد اللي اتقص بيترجع.
 */
function buildDiag(inp: Omit<ReportInput, "sheet">, cx: ChunkCtx): { diag?: DiagChunk[]; cut: number } {
  if (!cx.n) return { cut: 0 };
  const diag: DiagChunk[] = [];
  for (let i = 0; i < cx.n; i++) {
    const { s, e } = cx.span(i);
    const raw = inp.chunks?.[i]?.text;
    const d: DiagChunk = { s, e, m: typeof raw === "string" ? raw : (cx.seqs[i] ?? []).join(" ") };
    if (inp.cohereTexts && i < inp.cohereTexts.length) d.c = String(inp.cohereTexts[i] ?? "");
    diag.push(d);
  }
  const flat: Array<string | undefined> = [];
  for (const d of diag) flat.push(d.m, d.c);
  const { texts, cut } = capTexts(flat, DIAG_MAX_BYTES);
  diag.forEach((d, k) => {
    d.m = texts[2 * k] as string;
    if (d.c !== undefined) d.c = texts[2 * k + 1];
  });
  return { diag, cut };
}

/**
 * قسم المقاطع الخام من المدخل لوحده (من غير ورقة) — 🔎 (مراجعة ٤ أكتوبر · عيب
 * ٦/١١) تقرير الجلسة المحفوظ مابيشيلش التشخيص (نصوصه موجودة في التسجيلات)،
 * فبيتبني منها وقت العرض بنفس الدالة ⇒ نفس النص بالظبط.
 */
export function diagOf(inp: Omit<ReportInput, "sheet">): { diag?: DiagChunk[]; cut: number } {
  const full = { ...inp, sheet: [] } as ReportInput;
  return buildDiag(full, chunkCtx(full, new Map()));
}

/** حد نص التشخيص (بايت) — نفس الحد بيتطبّق على نصوص كل تسجيل محفوظ. */
export const DIAG_MAX = DIAG_MAX_BYTES;

export function buildBatchReport(inp: ReportInput): BatchReport {
  const now = inp.now ?? Date.now();
  const outRows = inp.rows.map((r) => ({ ...r, plate: normPlate(r.plate) }));
  const outMap = new Map<string, ChunkRow>();
  for (const r of outRows) if (!outMap.has(r.plate)) outMap.set(r.plate, r);
  const sheetMap = new Map<string, SheetRow>();
  for (const s of inp.sheet) {
    const k = normPlate(s.plate);
    if (!sheetMap.has(k)) sheetMap.set(k, s);
  }
  const hasSheet = sheetMap.size > 0;
  const cdig = new Set(inp.cohereDigits ?? []);
  const droppedList = (inp.dropped ?? []).map((d) => ({ ...d, plate: normPlate(d.plate) }));
  const seqPlates = (inp.seqs ?? []).flat().map(normPlate);
  const cx = chunkCtx(inp, sheetMap);

  // وقت كل لوحة طلعت (أول ظهور) + ترتيبها — للدليل و«القراية التانية»
  const tOut = new Map<string, number>();
  const outIndex = new Map<string, number>();
  outRows.forEach((r, i) => {
    const t = num(r.t_s);
    if (t !== undefined && !tOut.has(r.plate)) tOut.set(r.plate, t);
    if (!outIndex.has(r.plate)) outIndex.set(r.plate, i);
  });

  /**
   * 🎙️ تقرير بيجمع أكتر من تسجيل (٤ أكتوبر): لوحة **طلعت** ⇒ تسجيلها معروف
   * من صفّها، فدليلها من مقاطعه بس. اللوحة الضايعة مالهاش صف ⇒ بالوقت زي
   * الأول (وقتها متقدّر بين جيرانها في الورقة، فممكن تبقى على حدود تسجيلين).
   */
  const bounds = Array.isArray(inp.partBounds) && inp.partBounds.length > 1 ? inp.partBounds : undefined;
  const partAt = (row: number) => (bounds ? bounds.findIndex((b) => b.r0 <= row && row < b.r1) : -1);
  const partOfPlate = (g: string | undefined): PartBound | undefined => {
    if (!bounds || g === undefined) return undefined;
    const row = outIndex.get(g);
    return row === undefined ? undefined : bounds[partAt(row)];
  };
  /**
   * 🔎 (مراجعة ٤ أكتوبر) لكل تسجيل: لوحاته هو (عيب ١) وأرقام الشاهد فيه هو
   * (عيب ٥) — عشان حكم لوحة طلعت في تسجيل يبقى زي حكم تقرير التسجيل ده لوحده.
   */
  const partOut = bounds?.map((b) => new Set(outRows.slice(b.r0, b.r1).map((r) => r.plate)));
  const partDigits = new Map<PartBound, Set<string>>();
  const digitsFor = (b: PartBound | undefined): Set<string> => {
    if (!b?.digits) return cdig;
    let d = partDigits.get(b);
    if (!d) partDigits.set(b, (d = new Set(b.digits)));
    return d;
  };

  const missed: Issue[] = [];
  const misread: Array<{ said: string; got: string; evidence?: Evidence }> = [];
  const usedAsMisread = new Set<string>();
  const misreadGot = new Map<string, string>();
  let correct = 0;

  // ١. الصح والقراية الغلط الأول — عشان وقت كل لوحة في الورقة يبقى معروف
  if (hasSheet) {
    for (const p of sheetMap.keys()) {
      if (outMap.has(p)) { correct++; continue; }
      const alt = [...outMap.keys()].find((g) => !sheetMap.has(g) && !usedAsMisread.has(g) && near(p, g));
      if (alt) { usedAsMisread.add(alt); misreadGot.set(p, alt); }
    }
  }

  // ٢. وقت كل لوحة في الورقة: من المخرج، وإلا بين جيرانها في الورقة
  const sheetKeys = [...sheetMap.keys()];
  const known = sheetKeys.map((p) => tOut.get(p) ?? tOut.get(misreadGot.get(p) ?? ""));
  const tSheet = new Map<string, number | undefined>();
  sheetKeys.forEach((p, k) => {
    if (known[k] !== undefined) { tSheet.set(p, known[k]); return; }
    let a = k - 1;
    while (a >= 0 && known[a] === undefined) a--;
    let b = k + 1;
    while (b < known.length && known[b] === undefined) b++;
    const ta = a >= 0 ? known[a] : undefined;
    const tb = b < known.length ? known[b] : undefined;
    tSheet.set(p,
      ta !== undefined && tb !== undefined ? ta + ((tb - ta) * (k - a)) / (b - a)
      : ta !== undefined ? ta + 3 * (k - a)
      : tb !== undefined ? Math.max(0, tb - 3 * (b - k))
      : undefined);
  });

  /**
   * المتشال اللي يخصّ اللوحة: نفسها، أو قراية قريبة منها **بوقت معروف** قريب
   * من وقتها. متشال من غير وقت (السيرفر القديم) مايتنسبش غير للوحة نفسها —
   * وإلا قراية قريبة في أي حتة من التسجيل كانت بتتنسب لها.
   *
   * `only` (٤ أكتوبر): القراية القريبة لازم تبقى في نفس التسجيل كمان. اللوحة
   * نفسها بالحرف بتتنسب من أي تسجيل — ده دليل حقيقي إنها اتسمعت هناك.
   */
  const inPart = (b: PartBound, d: DroppedItem) =>
    d.chunks?.length
      ? d.chunks.some((c) => b.c0 <= c && c < b.c1)
      : d.t_s !== undefined && b.t0 <= d.t_s && d.t_s <= b.t1;
  const droppedFor = (p: string, t: number | undefined, only?: PartBound) =>
    droppedList
      .filter((d) => d.plate === p || (
        t !== undefined && d.t_s !== undefined &&
        Math.abs(d.t_s - t) <= VARIANT_SLACK_S * 2 && variantOf(p, d.plate, sheetMap) &&
        (!only || inPart(only, d))
      ))
      .sort((x, y) => Number(y.plate === p) - Number(x.plate === p));

  /**
   * ⏳ (عيب ١٠ · مراجعة ٤ أكتوبر) مكان كل لوحة في الورقة **ليها أثر** (طلعت،
   * طلعت غلط، اتشالت، مقطع سمعها، الشاهد سمع أرقامها) + تسجيلها لو معروف.
   * لوحة محدّش سمعها **بعد آخر** واحدة فيهم (أو قبل أولها)، أو **بين** آخر
   * لوحة في تسجيل وأول لوحة في تسجيل تاني ⇒ غالباً في تسجيل لسه ماتفرّغش (أو
   * تفريغه وقع «لوحات بس» فماوصلش التقرير) — بعد أول تسجيل من ٤ كانت ~٩٠
   * لوحة بتقول «الصوت مش واضح» وهي لسه ماتفرّغتش. جوّه تسجيل واحد ⇒ زي الأول.
   */
  const traced: Array<{ k: number; part: number }> = [];
  const tracePart = (d: DroppedItem): number => {
    if (!bounds) return -1;
    const c = d.chunks?.find((x) => typeof x === "number");
    if (c !== undefined) return bounds.findIndex((b) => b.c0 <= c && c < b.c1);
    return d.t_s === undefined ? -1 : bounds.findIndex((b) => b.t0 <= d.t_s! && d.t_s! <= b.t1);
  };
  const silent: Array<{ k: number; issue: Issue }> = [];
  if (hasSheet) {
    for (const [k, p] of sheetKeys.entries()) {
      if (outMap.has(p)) { traced.push({ k, part: partAt(outIndex.get(p)!) }); continue; }
      const alt = misreadGot.get(p);
      if (alt) {
        traced.push({ k, part: partAt(outIndex.get(alt)!) });
        misread.push({ said: p, got: alt });
        // القراية الصح نفسها اتشالت (رصد1205 · جلسة ٣ أكتوبر: الوحيدة الصح شالتها «لوحدها»)
        const ex = droppedList.find((d) => d.plate === p);
        const exTail = ex
          ? ` — والقراية الصح «${p}» اتسمعت في ${ex.support > 1 ? chunksAr(ex.support) : "مقطع واحد"} بس واتشالت`
          : "";
        missed.push({ plate: p, heardAs: alt, reason: `طلعت غلط «${alt}» — ${kindOfMiss(p, alt)}${exTail}` });
        continue;
      }
      const dm = droppedFor(p, tSheet.get(p))[0];
      if (dm) {
        traced.push({ k, part: tracePart(dm) });
        const heard = dm.plate !== p ? ` (اتسمعت «${dm.plate}»)` : "";
        missed.push({
          plate: p,
          ...(dm.plate !== p ? { heardAs: dm.plate } : {}),
          reason: dm.why === "cohere_dup"
            ? `طلعت واتشالت بقاعدة كوهير — اتحسبت نفس نطق «${dm.same_as ?? "؟"}» اللي جنبها${heard}`
            : dm.why === "lone"
            ? `اتسمعت في مقطع واحد بس واتشالت لأن اللي حواليها اتسمعوا كتير${heard}`
            : `مقطع واحد بس سمعها فاتشالت بقاعدة الشهود (عشان مانكتبش حاجة مش متأكدين منها)${heard}`,
        });
        continue;
      }
      const inChunk = seqPlates.find((x) => x === p || near(p, x));
      if (inChunk) {
        traced.push({ k, part: -1 });
        missed.push({ plate: p, heardAs: inChunk, reason: `مقطع سمعها «${inChunk}» والمقاطع التانية لأ — مااتأكدتش` });
        continue;
      }
      if (cdig.has(digitsOf(p))) {
        traced.push({ k, part: -1 });
        missed.push({ plate: p, reason: "الشاهد سمع أرقامها بس الموديل ماسمعهاش خالص" });
        continue;
      }
      const issue: Issue = { plate: p, reason: "ولا الموديل ولا الشاهد سمعوها — غالباً الصوت مش واضح أو اتقالت بسرعة جداً" };
      missed.push(issue);
      silent.push({ k, issue });
    }
  }
  let notYet = 0;
  if (traced.length) {
    const first = traced[0].k;
    const last = traced[traced.length - 1].k;
    for (const { k, issue } of silent) {
      if (k > last) {
        issue.reason = "ولا الموديل ولا الشاهد سمعوها — وهي بعد آخر لوحة اتسمعت من الورقة: غالباً في تسجيل لسه ماتفرّغش، أو التسجيل وقف قبلها";
      } else if (k < first) {
        issue.reason = "ولا الموديل ولا الشاهد سمعوها — وهي قبل أول لوحة اتسمعت من الورقة: غالباً في تسجيل لسه ماتفرّغش، أو التسجيل بدأ بعدها";
      } else {
        // أقرب لوحة ليها أثر قبلها وبعدها في الورقة — من تسجيلين مختلفين؟
        let a: { k: number; part: number } | undefined;
        let b: { k: number; part: number } | undefined;
        for (const t of traced) {
          if (t.k < k) a = t;
          else if (t.k > k) { b = t; break; }
        }
        if (!bounds || !a || !b || a.part < 0 || b.part < 0 || a.part === b.part) continue;
        issue.reason = "ولا الموديل ولا الشاهد سمعوها — وهي بين تسجيلين (بعد آخر لوحة اتسمعت في تسجيل وقبل أول لوحة في التاني): غالباً في تسجيل لسه ماتفرّغش، أو التسجيل اتقطع عندها";
      }
      issue.notYet = true;
      notYet++;
    }
  }

  /**
   * «قراية تانية غلط لنفس اللوحة»: لوحة اتقالت فطلعت غلط **مرتين** (حوص4168
   * ⇐ حوص6168 و حوص6146). التانية مش اختراع — نفس الحروف، أرقامها ≤٢ فرق
   * عن اللي اتقالت أو عن الغلطة الأولى، وقريبة منها في الوقت (أو في الترتيب
   * لو مافيش وقت).
   */
  const closeInTime = (a: string, b: string) => {
    const ta = tOut.get(a);
    const tb = tOut.get(b);
    if (ta !== undefined && tb !== undefined) return Math.abs(ta - tb) <= SECOND_MAX_S;
    const ia = outIndex.get(a);
    const ib = outIndex.get(b);
    return ia !== undefined && ib !== undefined && Math.abs(ia - ib) <= 2;
  };
  const secondOf = (g: string) =>
    misread.find((m) =>
      lettersOf(g) === lettersOf(m.said) &&
      (digitDiff(g, m.said) <= 2 || digitDiff(g, m.got) <= 2) &&
      closeInTime(g, m.got)
    );
  const usedAsSecond = new Set<string>();

  /**
   * 🔎 (عيب ١ · مراجعة ٤ أكتوبر) قراية غلط في تسجيل للوحة من الورقة **ماطلعتش
   * في التسجيل ده** بس طلعت (صح أو غلط) في تسجيل تاني. المالك بيقفل تسجيل على
   * لوحة اتقرت غلط ويبدأ اللي بعده بيها تاني فتطلع صح — تقرير التسجيل الأول
   * لوحده كان بيقول «طلعت غلط»، والمجمّع كان بيقول «🔴 اختراع» (أرقامها غلط
   * فالشاهد ماسمعهاش) ويكبّر عدّاد الاختراع. نفس معيار القراية الغلط (`near`).
   */
  const elsewhereOf = (g: string): { said: string; first?: string } | undefined => {
    if (!partOut) return undefined;
    const row = outIndex.get(g);
    const k = row === undefined ? -1 : partAt(row);
    if (k < 0) return undefined;
    for (const p of sheetKeys) {
      if (partOut[k].has(p) || !near(p, g)) continue;
      if (outMap.has(p)) return { said: p };
      // الغلطة الأولى لازم تبقى في تسجيل تاني — جوّه نفس التسجيل الحكم زي تقريره لوحده
      const first = misreadGot.get(p);
      const fr = first === undefined ? undefined : outIndex.get(first);
      if (first && first !== g && fr !== undefined && partAt(fr) !== k) return { said: p, first };
    }
    return undefined;
  };

  const extras: Issue[] = [];
  let inventions = 0;
  for (const g of outMap.keys()) {
    if (hasSheet && (sheetMap.has(g) || usedAsMisread.has(g))) continue;
    // أرقام الشاهد في تسجيل اللوحة نفسه (عيب ٥) — تسجيل واحد ⇒ أرقام التقرير كله
    const dig = digitsFor(partOfPlate(g));
    const heard = dig.has(digitsOf(g));
    if (hasSheet) {
      const sec2 = secondOf(g);
      const other = sec2 ? undefined : elsewhereOf(g);
      if (sec2) {
        usedAsSecond.add(g);
        extras.push({ plate: g, secondOf: sec2.said, reason: `قراية تانية غلط لنفس اللوحة «${sec2.said}» (الأولى «${sec2.got}») — مش اختراع` });
      } else if (other) {
        usedAsSecond.add(g);
        extras.push({
          plate: g,
          secondOf: other.said,
          reason: other.first
            ? `قراية تانية غلط لنفس اللوحة «${other.said}» في تسجيل تاني (الأولى «${other.first}») — مش اختراع`
            : `قراية غلط لـ«${other.said}» — نفس اللوحة اتقرت صح في تسجيل تاني (اتقالت مرتين) — مش اختراع`,
        });
      } else if (heard) extras.push({ plate: g, reason: "الشاهد سمع أرقامها — ممكن اتقالت ومش مكتوبة في الورقة" });
      else { inventions++; extras.push({ plate: g, reason: "🔴 اختراع — مااتقالتش (ولا في الورقة ولا الشاهد سمع أرقامها)" }); }
    } else if (!heard && dig.size) {
      inventions++;
      extras.push({ plate: g, reason: "تقديري: الشاهد ماسمعش أرقامها — ممكن تكون اختراع" });
    }
  }

  // ٣. الدليل لكل مشكلة: كل مقطع غطّاها كتب إيه · المتشال · حتة كوهير
  const evidenceFor = (p: string, t: number | undefined, only?: PartBound): Evidence | undefined => {
    const cover = coveringChunks(cx, p, t, only);
    const reads: ChunkRead[] = cover.map((i) => ({ i, ...cx.span(i), read: readIn(cx, p, i) }));
    const dropped = droppedFor(p, t, only);
    const coh = cohereExcerpt(cx, p, t, cover);
    if (!reads.length && !dropped.length && !coh) return undefined;
    return {
      ...(t !== undefined ? { t: Math.round(t * 100) / 100 } : {}),
      reads,
      ...(dropped.length ? { dropped } : {}),
      ...(coh ? { cohere: coh.text, cohereAt: coh.at } : {}),
    };
  };
  for (const m of missed) {
    // القراية الغلط طلعت في تسجيل معروف ⇒ اللوحة اتقالت فيه
    const ev = evidenceFor(m.plate, tSheet.get(m.plate), partOfPlate(misreadGot.get(m.plate)));
    if (ev) m.evidence = ev;
  }
  for (const m of misread) {
    const ev = missed.find((x) => x.plate === m.said)?.evidence;
    if (ev) m.evidence = ev;
  }
  for (const x of extras) {
    const ev = evidenceFor(x.plate, tOut.get(x.plate), partOfPlate(x.plate));
    if (ev) x.evidence = ev;
  }

  /** حتة كوهير للوحة طلعت ونوعها/ملاحظتها لأ — «قمارة» مكان «غمارة» مثلاً. */
  const excerptOf = (p: string) => {
    if (!cx.n) return undefined;
    const t = tOut.get(p);
    return cohereExcerpt(cx, p, t, coveringChunks(cx, p, t, partOfPlate(p)))?.text;
  };
  const types = fieldStat(sheetMap, outMap, (s) => s.type, (r) => r.type || undefined, excerptOf);
  const notes = fieldStat(sheetMap, outMap, (s) => s.note, noteOfRow, excerptOf);
  if (!hasSheet) {
    types.got = outRows.filter((r) => r.type).length;
    notes.got = outRows.filter((r) => noteOfRow(r)).length;
  }

  /**
   * 🔁 (عيب ١ · مراجعة ٤ أكتوبر) في تقرير بيجمع أكتر من تسجيل، القايمة فيها
   * سطر لكل تسجيل طلعت فيه اللوحة و«طلع» بيعدّها مرة واحدة ⇒ كل سطر بتسجيله،
   * والمكرر متعلّم. تسجيل واحد ⇒ القايمة زي الأول بالظبط.
   */
  const seenOut = new Set<string>();
  const repeated = new Set<string>();
  const out = outRows.map((r, i) => {
    const o: BatchReport["out"][number] = {
      plate: r.plate,
      support: r.support,
      type: r.type || undefined,
      note: noteOfRow(r),
      status: !hasSheet ? "" : sheetMap.has(r.plate) ? "✓"
        : usedAsMisread.has(r.plate) || usedAsSecond.has(r.plate) ? "≈" : "✗",
    };
    if (bounds) {
      const k = partAt(i);
      if (k >= 0) o.rec = k + 1;
      if (seenOut.has(r.plate)) { o.again = true; repeated.add(r.plate); }
      seenOut.add(r.plate);
    }
    return o;
  });

  const { diag, cut } = buildDiag(inp, cx);

  return {
    id: `r${now}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    label: inp.label || new Date(now).toLocaleString("ar-EG"),
    hasSheet,
    audioSec: inp.audioSec,
    elapsedMs: inp.elapsedMs,
    serverMs: inp.serverMs,
    realtimeX: inp.realtimeX,
    calls: inp.calls,
    model: inp.model,
    recipe: inp.recipe,
    fieldsFrom: inp.fieldsFrom,
    ...(inp.run ? { run: inp.run } : {}),
    ...(inp.cohereFixed?.length ? { cohereFixed: inp.cohereFixed } : {}),
    ...(inp.cohereRescued?.length ? { cohereRescued: inp.cohereRescued } : {}),
    ...(diag ? { diag } : {}),
    ...(cut ? { diagCut: cut } : {}),
    said: sheetMap.size,
    got: outMap.size,
    correct,
    missed,
    misread,
    extras,
    inventions,
    types,
    notes,
    out,
    ...(notYet ? { notYet } : {}),
    ...(repeated.size ? { repeats: repeated.size } : {}),
  };
}

/* ------------------------------------------------------------ النص */

const sec = (ms: number) => (ms / 1000).toFixed(1);
/** وقت م:ث — بيقرّب الثواني الأول (119.6 ⇐ 2:00 مش 1:60). */
export const mmss = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** «N مقاطع غطّت وقتها» (مقطع واحد غطّى · مقطعين غطّوا). */
const coveredBy = (n: number) =>
  `${chunksAr(n)} ${n === 1 ? "غطّى" : n === 2 ? "غطّوا" : "غطّت"} وقتها`;

/**
 * سطر واحد قصير من الدليل (لرسالة الواتساب — بتتقص عند ٤٠٩٦ بايت):
 * «4 مقاطع غطّت وقتها: ساكت 3 · «اصا7675» 1».
 */
function readsTag(ev?: Evidence): string {
  const reads = ev?.reads ?? [];
  if (!reads.length) return "";
  const silent = reads.filter((x) => x.read === null).length;
  const groups = new Map<string, number>();
  for (const x of reads) if (x.read !== null) groups.set(x.read, (groups.get(x.read) ?? 0) + 1);
  const parts = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `«${k}» ${n}`);
  if (groups.size > 3) parts.push("…");
  if (silent) parts.unshift(`ساكت ${silent}`);
  return `${coveredBy(reads.length)}: ${parts.join(" · ")}`;
}

/**
 * «زيادة ممكن اتقالت» = الزيادة من غير الاختراع ومن غير «القراية التانية الغلط
 * لنفس اللوحة» (`secondOf`) — دي لوحة اتقالت وطلعت غلط مرتين، مش زيادة.
 */
export function extrasMaybeSaid(r: BatchReport): number {
  return (r.extras ?? []).filter((x) => !x.secondOf).length - (r.inventions ?? 0);
}

/** التقرير فيه تشخيص؟ (التقارير القديمة المحفوظة مافيهاش) */
export function hasDiag(r: BatchReport): boolean {
  return Boolean(
    r.diag?.length ||
    r.missed?.some((m) => m.evidence) ||
    r.extras?.some((x) => x.evidence)
  );
}

/** وقت م:ث للتشخيص — نفس `mmss`. */
const clock = mmss;

const span = (s?: number, e?: number) =>
  s !== undefined && e !== undefined ? `${clock(s)}–${clock(e)}` : "؟";

/** ليه السيرفر شالها — بالعربي. «edge» = قاعدة الشهود (شوف `DroppedItem`). */
function whyAr(d: DroppedItem): string | undefined {
  if (!d.why) return undefined;
  if (d.why === "lone") return "لوحدها — مقطع واحد سمعها وجيرانها اتسمعوا كتير";
  if (d.why === "cohere_dup") return `نفس نطق «${d.same_as ?? "؟"}» — كوهير سمع أرقام دي بس فاتشالت كتكرار`;
  if (d.why === "edge") {
    const heard = d.support > 1 ? chunksAr(d.support) : "مقطع واحد";
    const cov = typeof d.coverage === "number" && d.coverage > 0 ? coveredBy(d.coverage) : "مقاطع كتير غطّت وقتها";
    return `اتسمعت في ${heard} بس مع إن ${cov}`;
  }
  return d.why;
}

/**
 * تقرير بيجمع أكتر من تسجيل: الوقت على الشريط المتوصّل ⇒ «تسجيل k · م:ث جوّاه»
 * عشان المالك يلاقي الحتة في المقطع نفسه. تسجيل واحد ⇒ `undefined`.
 */
function partLocator(r: BatchReport): ((t: number) => string) | undefined {
  if ((r.parts?.length ?? 0) < 2) return undefined;
  const lay = partLayout(r.parts!);
  return (t) => {
    let k = lay.findIndex((b) => t < b.t1);
    if (k < 0) k = lay.length - 1;
    return `تسجيل ${k + 1} · ${clock(Math.max(0, t - lay[k].t0))}`;
  };
}

function evidenceLines(ev: Evidence | undefined, L: string[], where?: (t: number) => string) {
  if (!ev) return;
  if (ev.t !== undefined) L.push(`   ⏱️ حوالي ${clock(ev.t)}${where ? ` (${where(ev.t)})` : ""}`);
  for (const x of ev.reads) {
    L.push(`   #${x.i} ${span(x.s, x.e)} ⇐ ${x.read === null ? "ساكت (ماكتبش حاجة جنبها)" : `«${x.read}»`}`);
  }
  for (const d of ev.dropped ?? []) {
    const nbr = Array.isArray(d.nbr) ? d.nbr.join("/") : d.nbr;
    L.push(
      `   ↩︎ اتشالت «${d.plate}» · شهود ${d.support}` +
        (d.why ? ` · ${whyAr(d)}` : "") +
        (nbr !== undefined ? ` · شهود الجيران ${nbr}` : "") +
        (d.chunks?.length ? ` · ${d.chunks.map((c) => "#" + c).join("، ")}` : "") +
        (d.t_s !== undefined ? ` · ${clock(d.t_s)}` : "")
    );
  }
  if (ev.cohere) L.push(`   🗣️ كوهير${ev.cohereAt !== undefined ? ` (#${ev.cohereAt})` : ""}: «${ev.cohere}»`);
}

/**
 * 🔍 التشخيص الكامل — **مش** للواتساب (طويل): كل مشكلة بدليلها (كل مقطع غطّاها
 * كتب إيه أو سكت · المتشال وليه · حتة من نص كوهير)، وبعدين نص الموديل
 * وكوهير **الخام** لكل مقطع. المالك (٣/١٠): «ضيف نص كوهير الخام».
 */
export function diagText(r: BatchReport): string {
  const L: string[] = [];
  L.push(`🔍 التشخيص — ${r.label}`);
  if (r.run) L.push(`🗂️ التشغيلة على السيرفر: ${r.run}`);
  if (!hasDiag(r)) {
    L.push("التقرير ده اتعمل قبل التشخيص — مافيهوش نص الموديل ولا كوهير.");
    return L.join("\n");
  }
  const where = partLocator(r);
  if (where) {
    L.push(`🎙️ ${recordingsAr(r.parts!.length)} متوصّلين كأنهم شريط واحد: أرقام المقاطع والأوقات متسلسلة على التسجيلات كلها`);
  }
  if (r.missed?.length) {
    L.push("", "── ليه اللوحة ماطلعتش أو طلعت غلط ──");
    for (const m of r.missed) {
      L.push(`• ${m.plate} — ${m.reason}`);
      evidenceLines(m.evidence, L, where);
    }
  }
  if (r.extras?.length) {
    L.push("", "── لوحات طلعت ومااتقالتش ──");
    for (const x of r.extras) {
      L.push(`• ${x.plate} — ${x.reason}`);
      evidenceLines(x.evidence, L, where);
    }
  }
  const fieldLines: string[] = [];
  const fld = (name: string, st?: FieldStat) => {
    for (const w of st?.missing ?? []) {
      fieldLines.push(`• ${w.plate} ${name}: قلت «${w.said}» وماطلعش` + (w.cohere ? `\n   🗣️ كوهير: «${w.cohere}»` : ""));
    }
    for (const w of st?.wrong ?? []) {
      fieldLines.push(`• ${w.plate} ${name}: قلت «${w.said}» وطلع «${w.got}»` + (w.cohere ? `\n   🗣️ كوهير: «${w.cohere}»` : ""));
    }
  };
  fld("نوع", r.types);
  fld("ملاحظة", r.notes);
  if (fieldLines.length) L.push("", "── النوع/الملاحظة اللي ماطلعتش أو طلعت غلط (كوهير سمع إيه) ──", ...fieldLines);
  if (r.diag?.length) {
    L.push("", `── نص كل مقطع خام (الموديل + كوهير) · ${r.diag.length} مقطع ──`);
    if (r.diagCut) L.push(`⚠️ اتقص ${r.diagCut} نص طويل عشان التقرير مايتقلش (الحد ~١٥٠ كيلو) — الأطول اتقص الأول`);
    const chunkLines = (d: DiagChunk, i: number) => {
      L.push(`#${i} ${span(d.s, d.e)}`);
      L.push(`  الموديل: ${d.m || "—"}`);
      if (d.c !== undefined) L.push(`  كوهير: ${d.c.trim() || "—"}`);
    };
    if (!where) {
      r.diag.forEach(chunkLines);
    } else {
      /**
       * 🎙️ تقرير الجلسة (٤ أكتوبر): المقاطع متقسّمة على التسجيلات — كل تسجيل
       * بعنوانه ومدته وتشغيلته على السيرفر. الرقم متسلسل على الشريط كله (زي
       * الدليل فوق)، وفي أرشيف التشغيلة نفسها بيبدأ من #0.
       */
      const lay = partLayout(r.parts!);
      lay.forEach((b, k) => {
        const p = r.parts![k];
        const c1 = k === lay.length - 1 ? Math.max(b.c1, r.diag!.length) : Math.min(b.c1, r.diag!.length);
        L.push(
          "",
          `── تسجيل ${k + 1} (${mmss(p.input.audioSec)})` +
            (p.input.run ? ` · التشغيلة ${p.input.run}` : "") +
            (p.label ? ` · ${p.label}` : "") +
            (c1 > b.c0 ? ` · المقاطع #${b.c0}–#${c1 - 1} (في أرشيفها من #0) · من ${clock(b.t0)}` : " · مافيهوش مقاطع") +
            " ──"
        );
        for (let i = b.c0; i < c1; i++) if (r.diag![i]) chunkLines(r.diag![i], i);
      });
    }
  }
  return L.join("\n");
}

/** التقرير كله كنص عربي — للنسخ والمشاركة. */
export function reportText(r: BatchReport): string {
  const L: string[] = [];
  L.push(`📊 تقرير التفريغ — ${r.label}`);
  L.push(`الموديل: ${r.model ?? "؟"} · النوع من: ${r.fieldsFrom === "cohere" ? "الشاهد (كوهير)" : "موديل اللوحات"}`);
  L.push(`⏱️ مدة التسجيل ${mmss(r.audioSec)} · التفريغ خد ${sec(r.elapsedMs)}ث` +
    (r.realtimeX ? ` (أسرع من الحقيقي ${Math.round(r.realtimeX)} مرة)` : "") +
    (r.calls ? ` · ${r.calls} مقطع` : ""));
  // 🎙️ تقرير الجلسة (٤ أكتوبر): المدة فوق مجموع التسجيلات — وده طول كل واحد
  if ((r.parts?.length ?? 0) > 1) {
    L.push(`🎙️ ${recordingsAr(r.parts!.length)}: ${r.parts!.map((p) => mmss(p.input.audioSec)).join(" + ")}`);
  }
  L.push("");
  // 🔁 (عيب ٨ · مراجعة ٤ أكتوبر) الورقة اتقرت تاني ⇒ التقرير ده لوحده
  if (r.rereadOf) L.push("🔁 الورقة دي اتقرت تاني ⇒ ده تقرير لوحده (التقرير اللي قبله اتقفل بأرقامه زي ما هي)");
  if (r.hasSheet) {
    L.push(`🚗 اللوحات: قلت ${r.said} · طلع ${r.got} · صح ${r.correct} · ضايعة ${r.missed.length} · زيادة ${r.extras.length} (منها اختراع ${r.inventions})`);
    if (r.notYet) L.push(`⏳ ${r.notYet} من الضايعة في حتة من الورقة مافيش تسجيل متفرّغ سمع حاجة فيها (بعد آخر لوحة اتسمعت، قبل أولها، أو بين تسجيلين) — غالباً في تسجيل لسه ماتفرّغش`);
    L.push(`🏷️ النوع: قلت ${r.types.said} · طلع ${r.types.got} · صح ${r.types.correct} · غلط ${r.types.wrong.length} · ماطلعش ${r.types.missing.length} · زيادة ${r.types.extra.length}`);
    L.push(`📝 الملاحظة: قلت ${r.notes.said} · طلع ${r.notes.got} · صح ${r.notes.correct} · غلط ${r.notes.wrong.length} · ماطلعتش ${r.notes.missing.length} · زيادة ${r.notes.extra.length}`);
  } else {
    L.push("⚠️ مافيش ورقة قراية ⇒ «قلت كام» مش معروف. الأرقام دي اللي طلع بس + تقدير الشاهد.");
    L.push(`🚗 طلع ${r.got} لوحة · 🏷️ ${r.types.got} نوع · 📝 ${r.notes.got} ملاحظة · مشكوك إنها اختراع ${r.inventions}`);
  }
  if (r.cohereFixed?.length) {
    L.push("", "── 🔢 اتصلّحت من كوهير (موديل اللوحات كتب الرقم غلط وكوهير سامع الصح) ──");
    for (const f of r.cohereFixed) {
      const heard = f.heard !== undefined && f.of !== undefined ? ` · كوهير سمعها في ${f.heard} من ${f.of} مقطع` : "";
      L.push(
        f.action === "dup"
          ? `• ${f.from} اتشالت — نفس نطق ${f.to} اتقسم صفين${heard}`
          : `• ${f.from} بقت ${f.to}${heard}`
      );
    }
  }
  if (r.cohereRescued?.length) {
    L.push("", "── 🛟 رجعت من كوهير (موديل اللوحات سكت عليها وكوهير سمعها واضح) ──");
    for (const x of r.cohereRescued) {
      const where = x.after && x.before ? ` · بين ${x.after} و${x.before}` : "";
      const heard = x.heard !== undefined ? ` · كوهير سمعها في ${x.heard} مقطع` : "";
      L.push(`• ${x.plate} — الموديل سكت عليها${where}${heard}`);
    }
  }
  if (r.missed.length) {
    L.push("", "── اللوحات اللي ماطلعتش وسببها ──");
    for (const m of r.missed) {
      L.push(`• ${m.plate}: ${m.reason}`);
      const tag = readsTag(m.evidence);
      if (tag) L.push(`   ↳ ${tag}`);
    }
  }
  if (r.extras.length) {
    L.push("", "── لوحات طلعت ومااتقالتش ──");
    for (const x of r.extras) {
      L.push(`• ${x.plate}: ${x.reason}`);
      const tag = readsTag(x.evidence);
      if (tag) L.push(`   ↳ ${tag}`);
    }
  }
  if (r.types.wrong.length || r.types.missing.length || r.types.extra.length) {
    L.push("", "── النوع ──");
    for (const w of r.types.wrong) L.push(`• ${w.plate}: قلت «${w.said}» وطلع «${w.got}»`);
    for (const w of r.types.missing) L.push(`• ${w.plate}: قلت «${w.said}» وماطلعش`);
    for (const w of r.types.extra) L.push(`• ${w.plate}: طلع «${w.got}» وإنت ماقلتش نوع`);
  }
  if (r.notes.wrong.length || r.notes.missing.length || r.notes.extra.length) {
    L.push("", "── الملاحظة ──");
    for (const w of r.notes.wrong) L.push(`• ${w.plate}: قلت «${w.said}» وطلع «${w.got}»`);
    for (const w of r.notes.missing) L.push(`• ${w.plate}: قلت «${w.said}» وماطلعتش`);
    for (const w of r.notes.extra) L.push(`• ${w.plate}: طلع «${w.got}» وإنت ماقلتش ملاحظة`);
  }
  L.push("", "── كل اللي طلع بالترتيب ──");
  if (r.repeats) L.push(`🔁 ${r.repeats} لوحة طلعت في أكتر من تسجيل — في «طلع» اتعدّت مرة واحدة`);
  r.out.forEach((o, i) =>
    L.push(`${i + 1}. ${o.status} ${o.plate}` +
      (o.rec ? ` · تسجيل ${o.rec}` : "") + (o.again ? " · طلعت قبل كده (اتعدّت مرة واحدة)" : "") +
      (o.type ? ` · نوع: ${o.type}` : "") + (o.note ? ` · ملاحظة: ${o.note}` : "") +
      (o.support ? ` · سمعها ${o.support} مقطع` : ""))
  );
  return L.join("\n");
}

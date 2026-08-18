/**
 * resultColumns — يحلّ أعمدة نتيجة الفرز/المطلوب لأعمدة بترتيب ثابت:
 *   رقم اللوحة › نوع السيارة › الماركة › العنوان › الحي › GPS › اللون › سنة الصنع › تاريخ التسجيل
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
      "موديل السيارة", "موديل المركبة", "اسم المركبة", "اسم السيارة",
      "type of car", "car type", "vehicle type", "vehicle name", "car model", "car name",
      "model en", "variant", "original description"],
    content: looksLikeVehicleType,
  },
  // ── اسم الموقع بييجي بعد نوع السيارة على طول (بطلب المندوب) ──────────────
  // الترتيب المطلوب في النتيجة: رقم اللوحة › نوع السيارة › اسم الموقع › الباقي.
  {
    key: "address", label: "العنوان",
    // العنوان/الشارع بس — «الحي» هدف منفصل تحت عشان العنوان والحي يظهروا
    // الاتنين كعمودين مستقلين، مش عمود واحد ياخد أول مطابقة ويرمي التاني.
    aliases: ["العنوان", "عنوان", "الشارع", "شارع", "address", "street"],
    content: looksLikeDistrict,
  },
  {
    key: "district", label: "الحي",
    aliases: ["الحي", "حي", "الحى", "حى", "المنطقة", "منطقة", "المدينة", "مدينة",
      "district", "area", "neighborhood", "neighbourhood", "city", "region"],
    content: looksLikeDistrict,
  },
  {
    key: "brand", label: "الماركة",
    // الماركة = الصانع بس (تويوتا/دودج/شيفورلية) — منفصلة عن الطراز فوق.
    aliases: ["الماركة", "ماركة", "ماركه", "الماركه", "صانع المركبة", "صانع", "الصانع",
      "الشركة", "شركة", "make", "manufacturer", "brand"],
    content: looksLikeCarName,
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
  /**
   * أعمدة **مكررة الاسم** في نفس الشيت (زي «نوع المركبة» و«نوع المركبة_1»).
   * قيمها بتتدمج مع قيمة sourceCol في خانة واحدة — شوف joinDupValues.
   */
  dupCols?: string[];
}

/**
 * الاسم الأساسي للعمود بعد شيل لاحقة التكرار اللي بيحطها قارئ الإكسل
 * («نوع المركبة_1» → «نوع المركبة»). بيستخدم عشان نعرف الأعمدة اللي أصلها
 * اسم واحد اتكرر في نفس الشيت.
 */
export function dupBaseName(header: string): string {
  return String(header ?? "").replace(/_\d+$/, "").trim();
}

/**
 * يدمج قيمة العمود مع قيم توائمه المكررة في نص واحد: «تويوتا لاندكروزر».
 * الفاضي بيتشال، والقيمة المتكررة بتتكتب مرة واحدة.
 */
export function joinDupValues(
  row: Record<string, string> | undefined,
  col: { sourceCol: string; dupCols?: string[] },
): string {
  const parts: string[] = [];
  for (const c of [col.sourceCol, ...(col.dupCols ?? [])]) {
    const v = String(row?.[c] ?? "").trim();
    if (v && !parts.includes(v)) parts.push(v);
  }
  return parts.join(" ");
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
  sourceCol: string;           // اسم العمود الأساسي (أول مرشّح) — للتوافق/التصدير
  sourceCols: string[];        // كل الأعمدة المرشّحة عبر المحافظ — تُقرأ بالتتابع لأول قيمة
  /** أعمدة مكررة الاسم في نفس الشيت — قيمها بتتدمج مع القيمة الأساسية. */
  dupCols?: string[];
}

/**
 * يدمج أعمدة النتيجة من عدة مصادر (الداتا + كل شيتات الإحالة الأساسية والإضافية)
 * في القائمة الثابتة بالترتيب. الداتا والإحالة **مايتدمجوش في عمود واحد** — لو نفس
 * الهدف (مثلاً «نوع السيارة») موجود في الداتا وفي المحفظة، بيطلّع **عمودين منفصلين**:
 * واحد من الداتا (حتى لو فاضي) وواحد من المحفظة جنبه.
 *
 * لكن **كل شيتات الإحالة (الأساسية + الإضافية) بتتدمج في عمود إحالة واحد** لكل هدف —
 * حتى لو المحافظ بأسماء أعمدة مختلفة (عربي/إنجليزي). العمود بيقرا من كل أعمدة
 * المحافظ بالتتابع لأول قيمة موجودة (sourceCols)، فاللوحة الجاية من أي محفظة
 * بتطلّع نوعها/ماركتها في نفس العمود — بدل ما كل محفظة تعمل عمود منفصل ويفضل
 * فاضي للوحات المحافظ التانية.
 *
 * الأول بياخد الاسم الثابت، والباقي بيتسمّى «... (المحفظة)» عشان يتميّزوا. الترتيب:
 * أعمدة كل هدف مع بعض، والداتا الأول جوه الهدف الواحد.
 */
export function resolveMergedResultColumns(
  sources: ResultColumnSource[],
  contentThreshold = 0.4,
): MergedResultColumn[] {
  const dataCols = new Map<string, string[]>(); // key الهدف → أعمدة الداتا (كل واحد عمود مستقل)
  const refCols = new Map<string, string[]>();  // key الهدف → أعمدة كل المحافظ (تتدمج في عمود واحد)
  const dupOf = new Map<string, string[]>();    // عمود مصدر → توائمه المكررة الاسم
  for (const src of sources) {
    for (const c of resolveResultColumns(src.headers, src.rows, src.plateCol, contentThreshold)) {
      if (c.dupCols?.length) dupOf.set(c.sourceCol, c.dupCols);
      if (src.kind === "referral") {
        // «عنوان/حي/تاريخ المحفظة» = بيانات سجلّ البنك (مدينة/منطقة/تاريخ
        // التسجيل عنده) مش موقع ولا تاريخ تفريغ المندوب — فمالهمش لازمة في
        // النتيجة ومايظهروش خالص. اسم الموقع بييجي من ملف الداتا بس.
        if (c.key === "address" || c.key === "district" || c.key === "date") continue;
        const arr = refCols.get(c.key) ?? [];
        if (!arr.includes(c.sourceCol)) arr.push(c.sourceCol);
        refCols.set(c.key, arr);
      } else {
        const arr = dataCols.get(c.key) ?? [];
        if (!arr.includes(c.sourceCol)) arr.push(c.sourceCol);
        dataCols.set(c.key, arr);
      }
    }
  }
  const out: MergedResultColumn[] = [];
  for (const t of RESULT_TARGETS) {
    let idx = 0;
    for (const col of dataCols.get(t.key) ?? []) {
      const label = idx === 0 ? t.label : `${t.label} (الداتا)`;
      const d = dupOf.get(col);
      out.push({ id: `${t.key}-${idx}`, key: t.key, label, source: "data", sourceCol: col, sourceCols: [col], ...(d?.length ? { dupCols: d } : {}) });
      idx++;
    }
    const rCols = refCols.get(t.key) ?? [];
    if (rCols.length > 0) {
      const label = idx === 0 ? t.label : `${t.label} (المحفظة)`;
      // توائم كل الأعمدة المرشّحة — عشان الدمج يشتغل مهما كانت المحفظة المطابِقة
      const d = rCols.flatMap((c) => dupOf.get(c) ?? []);
      out.push({ id: `${t.key}-${idx}`, key: t.key, label, source: "referral", sourceCol: rCols[0], sourceCols: rCols, ...(d.length ? { dupCols: d } : {}) });
      idx++;
    }
  }

  // بطلب المندوب: بعد رقم اللوحة على طول **نوع السيارة**، وبعده على طول **اسم
  // الموقع من الداتا** (العنوان و/أو الحي — لو الاتنين موجودين الاتنين يظهروا)،
  // وبعدهم باقي الأعمدة.
  // ملاحظة (باج ميداني): نوع السيارة لازم يتقدّم مهما كان مصدره — لو كان في
  // **المحفظة** (الإحالة) بس والداتا مفيهاش عمود نوع، كان بيتأخّر لآخر الأعمدة
  // لأن الفلتر كان بيشمل أعمدة الداتا بس. العنوان/الحي يفضلوا من الداتا (بيانات
  // المحفظة دي سجلّ البنك مش موقع التفريغ، ومتشالة أصلاً فوق).
  const HEAD_KEYS = ["type", "address", "district"];
  // نوع الداتا له الأولوية (بيظهر أول، وبعده الموقع). لو الداتا مفيهاش نوع خالص،
  // نقدّم نوع **المحفظة** بدله عشان «نوع السيارة» يفضل بعد اللوحة على طول.
  const hasDataType = out.some((c) => c.key === "type" && c.source === "data");
  const head = out.filter((c) =>
    HEAD_KEYS.includes(c.key) && (c.source === "data" || (c.key === "type" && !hasDataType))
  );
  if (head.length === 0) return out;
  const headSet = new Set(head);
  return [...head, ...out.filter((c) => !headSet.has(c))];
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
  // (١.٥) توائم الأعمدة المكررة الاسم تتحجز **قبل** مطابقة المحتوى — وإلا
  // «نوع المركبة_1» (لاندكروزر) ممكن يتسرق لهدف «الماركة» بالمحتوى.
  const dups = new Map<string, string[]>();   // العمود المحلول → توائمه
  for (const src of resolved.values()) {
    const base = dupBaseName(src);
    const twins = available.filter((h) => h !== src && !used.has(h) && dupBaseName(h) === base);
    if (twins.length) { dups.set(src, twins); for (const t of twins) used.add(t); }
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

  // أعمدة اتحلّت بالمحتوى ممكن يكون ليها توائم مكررة برضه
  for (const src of resolved.values()) {
    if (dups.has(src)) continue;
    const base = dupBaseName(src);
    const twins = available.filter((h) => h !== src && !used.has(h) && dupBaseName(h) === base);
    if (twins.length) { dups.set(src, twins); for (const t of twins) used.add(t); }
  }

  const out: ResolvedColumn[] = [];
  for (const target of RESULT_TARGETS) {
    const src = resolved.get(target.key);
    if (!src) continue;
    const dupCols = dups.get(src);
    out.push({ key: target.key, label: target.label, sourceCol: src, ...(dupCols?.length ? { dupCols } : {}) });
  }
  return out;
}

/**
 * أعمدة بتتخفي من نافذة نتيجة **السجلات** (سيارات شيت التشييك اللي طلعت
 * مطلوبة) — بطلب المندوب: البنك، الشاص/الهيكل، وأعمدة «اللوحة» المكررة اللي
 * شيت التشييك بيلحقها آخر النافذة.
 *
 * حاجتين مابيتخفوش عن قصد:
 *   • **«رقم اللوحة» الأساسي** — القاعدة بتمسك بس الأعمدة اللي اسمها
 *     «لوحة/اللوحه/Plate» لوحدها (أو بلاحقة تكرار)، مش اللي فيها «رقم».
 *   • **«الملاحظات»** — المندوب محتاجها في الميدان.
 */
const HIDDEN_TASHYEEK_COL =
  /بنك|شاص|هيكل|chassis|^(ال)?لوح[ةه](_\d+)?$|^plate(_\d+)?$/i;

export function isHiddenTashyeekCol(label: string): boolean {
  const s = String(label ?? "").trim();
  if (!s) return false;
  return HIDDEN_TASHYEEK_COL.test(s);
}

/**
 * ==========================================================================
 *  ربط حقول محرك «كامل» (`/api/seg-chunks`) على اللوحات المراجَعة
 * ==========================================================================
 *
 *  السيرفر بيرجّع صف لكل لوحة: `{plate, support, type, condition, place,
 *  place_effective}`. والصفحة بتمرّر اللوحات على **مراجعة اللوحات** بتاعة
 *  باقي المحركات (حصر الـ١٧ حرف + الثقة + الأعلام)، فالمراجعة ممكن
 *  **تصحّح** نص اللوحة أو تدمج صفّين.
 *
 *  ⇒ الربط لازم يبقى **بنص اللوحة** مش بالترتيب. والدالة دي منفصلة عن
 *  الصفحة عشان تتختبر لوحدها — الربط ده هو الحتة اللي لو غلطت، النوع
 *  بيظهر **على اللوحة الغلط**، وهي بالظبط الغلطة اللي المالك شافها في
 *  الفوري قبل كده.
 *
 *  🔴 وعمودين مش عمود (طلب المالك، ٩ سبتمبر): «نوع العربية في عمود النوع،
 *  وحالتها ومكانها في الملاحظات».
 */

/** صف لوحة زي ما السيرفر بيرجّعه. */
export interface ChunkPlateRow {
  plate: string;
  support?: number;
  type?: string | null;
  condition?: string | null;
  /** المكان **اللي اتسمع** عند اللوحة دي */
  place?: string | null;
  /**
   * المكان **الساري** — آخر مكان اتسمع وبيمشي على اللي بعده.
   *
   * المندوب بيقول المكان مرة وهو داخل البرحة ثم يقرا اللوحات (مقيس:
   * ٩٢.٣٪ من قيم المكان في الشيتات تكرار للي قبلها). فالعرض بياخد
   * الساري، والأصلي موجود جنبه لو حد عايز يراجع.
   */
  place_effective?: string | null;
  /**
   * لحظة نطق اللوحة بالثواني جوّه الشريط — **تقديرية** من السيرفر
   * (`_t_of` في `seg_server.py`: المقطع اللي سمعها + ترتيبها جوّه لوحاته).
   *
   * مقيس على ٧٦٧ لوحة في ٣ أشرطة GOLD: **وسيط الخطأ ١.٢ث** · ٩٠٪ تحت
   * ٣.٩ث · ٩٢٪ جوّه ٥ث. وتوقيتات GOLD نفسها ±١.٥ث، فالتقدير على حدّ
   * دقة المسطرة.
   *
   * 🔴 للدبوس والختم **بس** — ممنوع يدخل في قرار هوية/دمج. «توزيع
   * اللوحات بالتساوي جوّه المقطع» سقط قبل كده في التعنقد (شوف `stitch`).
   */
  t_s?: number | null;
}

export interface ChunkFields {
  vehicleType?: string;
  note?: string;
  /** لحظة النطق بالثواني — `undefined` يعني السيرفر مابعتهاش */
  timeStart?: number;
}

/**
 * الملاحظة = حالة + مكان، مفصولين بـ«·» — حقيقتين مختلفتين.
 *
 * 🔴 **المكان المسموع عند اللوحة بس** (`place`) — مش الساري (`place_effective`).
 * المالك (٢٩ سبتمبر ٢٠٢٦): «لما يتقال مرة يبقى قصاد اللوحة — أنا بقول الأول
 * حبك١٢٣٤ وبعدها أقول فان، تبقى قدام حبك١٢٣٤ فقط». الساري كان بينسخ «جراج»
 * على كل اللي بعدها (١٩ مرة اتقالت ⇒ ٩٥ لوحة). السيرفر لسه بيبعته — مابنعرضهوش.
 */
export function noteOf(row: ChunkPlateRow | undefined): string | undefined {
  if (!row) return undefined;
  const parts = [row.condition, row.place].filter(
    (x): x is string => Boolean(x && String(x).trim())
  );
  return parts.length ? parts.join(" · ") : undefined;
}

/**
 * بيرجّع حقول كل لوحة مراجَعة، بالترتيب اللي وصل.
 *
 * `plates` = اللوحات بعد المراجعة (`review.plate`)، و`heard` = اللي
 * اتسمعت قبل التصحيح (`review.heardPlate`) — المراجعة ممكن تكون صحّحت
 * الحروف، وساعتها مفتاح السيرفر هو **المسموع**.
 *
 * 🔴 **المسموع الأول** (مراجعة ٣ أكتوبر · عيب ٧ · «ممنوع نوع قدام عربية غير
 * عربيتها»): كان `take(plate) ?? take(heardPlate)` — فلو المراجعة صحّحت لوحة
 * **لنص صف تاني بالظبط**، اللوحة المصحّحة كانت بتاخد حقول العربية التانية.
 * والمسموع لو كان مفتاح عند السيرفر وصفّه **اتاخد خلاص** ⇒ فاضية، مانرجعش
 * لنص التصحيح (ده بالظبط اللي بيسرق صف عربية تانية). بنرجع لنص اللوحة بس لو
 * المسموع مش مفتاح خالص (مافيش مسموع · تطبيع مختلف).
 *
 * ولوحة اتكرّرت: أول صف بياخد أول حقول، والتاني بياخد التاني — عشان
 * لوحتين بنفس النص مايشيلوش نفس الحقول لو السيرفر رجّع صفّين مختلفين.
 */
export function mapChunkFields(
  rows: ChunkPlateRow[],
  plates: Array<{ plate: string; heardPlate?: string }>
): ChunkFields[] {
  const pool = new Map<string, ChunkPlateRow[]>();
  for (const r of rows) {
    const k = String(r.plate || "");
    if (!k) continue;
    const arr = pool.get(k);
    if (arr) arr.push(r);
    else pool.set(k, [r]);
  }
  const take = (k?: string): ChunkPlateRow | undefined => {
    if (!k) return undefined;
    const arr = pool.get(k);
    if (!arr || !arr.length) return undefined;
    return arr.shift();
  };
  return plates.map((p) => {
    // `pool.has` بيفضل صح بعد ما الصفوف تتاخد ⇒ «مفتاح اتاخد» ≠ «مش مفتاح»
    const heard = p.heardPlate && pool.has(p.heardPlate) ? p.heardPlate : undefined;
    const row = heard ? take(heard) : take(p.plate);
    const t = Number(row?.t_s);
    return {
      vehicleType: row?.type ? String(row.type) : undefined,
      note: noteOf(row),
      // 🔴 صفر وقت صحيح (أول الشريط) — فبنفحص التمام مش الصدق
      timeStart: row?.t_s !== null && row?.t_s !== undefined && Number.isFinite(t)
        ? t
        : undefined,
    };
  });
}

/**
 * ==========================================================================
 *  توقيت التفريغ لمحرك «كامل ⚡»
 * ==========================================================================
 *
 *  🔴 **الشكل ده مش تفصيلة — الغلط فيه كان بيبيّض الصفحة.**
 *
 *  بطاقة الوقت في الصفحة بتقرا **تلات** مفاتيح بالاسم:
 *      `scanTiming.ms` · `scanTiming.audioSec` · `scanTiming.segments`
 *  وبتعمل `.toFixed()` على الأولين و**قسمة** على التالت. ومحرك «كامل ⚡»
 *  كان بيكتب `{totalMs, calls, windows} as any` — تلات أسماء مختلفة.
 *  النتيجة: `undefined.toFixed(1)` وقت الرسم، ومافيش `ErrorBoundary` في
 *  المشروع، فالجذر بيتفكّ والمندوب يشوف **صفحة بيضا** بدل لوحاته —
 *  واللوحات نفسها بتضيع لأن الرسم مابيثبتش فالحفظ التلقائي مابيشتغلش.
 *
 *  و`as any` هو اللي خرّس `tsc`. فالتحويل بقى **دالة نقية باسم واضح**
 *  ومعاها اختبارات، بدل كائن حرفي بـ`as any` جوّه الصفحة.
 */
export interface ScanTiming {
  /** زمن التفريغ بالمللي — المقيس عند العميل (بيشمل الشبكة) */
  ms: number;
  /** عدد نداءات الموديل — العرض **بيقسم عليه** فلازم ≥ ١ */
  segments: number;
  /** طول الصوت بالثواني */
  audioSec: number;
}

/** رقم موجب منطقي، وإلا الاحتياطي. */
function pos(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * بيحوّل رد `/api/seg-chunks` لتوقيت العرض بيقراه.
 *
 * `elapsedMs` = الزمن المقيس عند العميل. بيغلب زمن السيرفر لأنه هو اللي
 * المندوب **استناه فعلاً** (فيه الشبكة والنفق). ولو مش منطقي (صفر/سالب/
 * NaN) بنرجع لزمن السيرفر.
 */
export function chunkScanTiming(
  data: { calls?: unknown; ms?: unknown; dur_s?: unknown } | null | undefined,
  elapsedMs: number
): ScanTiming {
  const d = data || {};
  return {
    ms: pos(elapsedMs, pos(d.ms, 0)),
    // 🔴 الأقل واحد: العرض بيقسم على ده، وصفر بيطلّع Infinity في الشاشة
    segments: Math.max(1, Math.round(pos(d.calls, 1))),
    audioSec: pos(d.dur_s, 0),
  };
}

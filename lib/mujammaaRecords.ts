/**
 * 🧮➡️📋 «داتا التسجيلات» — لوحات المجمّع بتتصدّر لسجلات قناص (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «هنعمل تاب جديد في صفحه السجلات هنسميه داتا التسجيلات هيتحفظ هناك لما المندوب
 * يصدر اللوحات اللي اتفرغت واول ما تتصدر وتتحفظ تلقائي تتمسح واهم حاجه يقدر يعمل تعديل او
 * يمسح لوحات منهم قبل ما يصدر». والتاب التاني (التشييك اللي بيتصدّر من Voice PRO) اسمه
 * «سجل التشييك» — «كل واحد يظهر في التاب بتاعه».
 *
 * 🔑 نفس شيت السجلات (`field_check` ⇐ `field_checks` على السيرفر) — فالسجل بيترفع على طول،
 *    وبيتطابق في الفرز، وبيرجع بعد مسح البرنامج، زي أي سجل تاني (التسجيل القديم كان بيصدّر
 *    لنفس الشيت). اللي بيفرّقه **بادئة المعرّف** `fc-mj-` (= `local_id` على السيرفر)، والطريقة
 *    «متشيكة بالصوت» زي باقي الصوت عشان عدّادات الصوت والخريطة والنسخة الاحتياطية مايتلخبطوش.
 *    ⇒ مافيش SQL ولا عمود جديد.
 *
 * ⚠️ الملف ده برّه `components/mujammaa` عن قصد: حارس المجمّع (`appPortGuards`) بيمنع أي
 *    تخزين/سيرفر جوّاه — صفحة التسجيل بتدّيله الدالة دي جاهزة.
 */
import type { FieldCheckEntry } from "@/lib/idb";
import { toMapsLink } from "@/lib/gps";
import type { PlateEntry } from "@/components/mujammaa/lib/plateEntry";
import type { BankSheet } from "@/components/mujammaa/lib/bankSheet";

export const MUJAMMAA_RECORD_PREFIX = "fc-mj-";
/** نفس طريقة سجلات الصوت (`TRIAL_EXPORT_METHOD` · «صوتي» في التشييك) */
export const MUJAMMAA_RECORD_METHOD = "متشيكة بالصوت";

/** السجل جاي من المجمّع؟ (البادئة بتتحفظ على السيرفر في `local_id` ⇒ بترجع زي ما هي) */
export function isMujammaaRecord(e: { id?: string | null } | null | undefined): boolean {
  return typeof e?.id === "string" && e.id.startsWith(MUJAMMAA_RECORD_PREFIX);
}

export interface MujammaaRecordCtx {
  /** صاحب السجل (`auth.uid`) */
  uid: string;
  /** المقطع اللي اللوحات جاية منه (للتتبّع — المعرّف من اللوحة نفسها) */
  clipKey: string;
  /** ملف التشييك وقت المطابقة — أعمدته بتتنسخ جنب اللوحة المطلوبة */
  sheet?: BankSheet | null;
  recorder?: string | null;
}

export function mujammaaRecordOf(entry: PlateEntry, ctx: MujammaaRecordCtx): FieldCheckEntry {
  const plate = entry.review.plate;
  const row: Record<string, string> = {};
  const put = (k: string, v: string | number | null | undefined) => {
    const s = String(v ?? "").trim();
    if (s) row[k] = s;
  };
  // ⚠️ اللوحة في `plate` بس — نسخة منها في الصف كانت بتفضل قديمة بعد ما المندوب يصحّحها في
  //    السجلات، والفرز بيقرا الصف بعد اللوحة فيطابق على الغلط (مراجعة ١٨ أكتوبر).
  // حقول المندوب **الأول**: السجلات بتقرا أول عمود «ملاح…» كملاحظة المندوب.
  put("النوع", entry.vehicleType);
  put("ملاحظة المندوب", entry.note);
  put("اسم الحي - الشارع", entry.neighborhood);
  if (entry.match?.kind === "exact") row["مطلوبة"] = "نعم";
  row["الحالة"] = entry.review.status === "solid" ? "مؤكّدة" : "محتاجة نظرة";
  const pin = entry.pin;
  if (pin) put("دقة الموقع (م)", Math.round(pin.accuracy));
  put("اسم المسجّل", ctx.recorder);
  // أعمدة ملف التشييك للوحة المطلوبة — زي سجلات التشييك (الجدول بيعرضها كأعمدة). من غير ملاحظات
  // الشيت ولا نوعه: كانوا بيتعرضوا كأنهم كلام المندوب (أول «ملاح…» / عمود «النوع»).
  const sheetRow = entry.match?.kind === "exact" ? entry.match.row : undefined;
  if (ctx.sheet && sheetRow) {
    for (const h of ctx.sheet.headers) {
      if (h === ctx.sheet.plateColumn || h in row || /ملاح/.test(h) || h === "النوع") continue;
      put(h, sheetRow[h]);
    }
  }

  const at = Number.isFinite(entry.capturedAt) ? entry.capturedAt : Date.now();
  return {
    // معرّف اللوحة نفسها (فريد: بادئة التحميل + عدّاد) — مش المقطع: نفس اللوحات من جدول مسترجَع أو
    // من «اعرض لوحاته» = نفس السجل، فالتصدير مرتين بيستبدل بدل ما يكرّر (مراجعة ١٨ أكتوبر).
    id: `${MUJAMMAA_RECORD_PREFIX}${ctx.uid}-${entry.id}`,
    agentId: ctx.uid,
    plate,
    row,
    method: MUJAMMAA_RECORD_METHOD,
    ...(pin ? { lat: pin.lat, lng: pin.lng, mapsLink: toMapsLink(pin.lat, pin.lng) } : {}),
    checkedAt: new Date(at).toISOString(),
  };
}

export interface SaveDeps {
  save: (e: FieldCheckEntry) => Promise<unknown>;
  upload: () => void;
}

/**
 * يحفظ لوحات المجمّع في السجلات — كل لوحة لوحدها: اللي اتحفظ بس بيتشال من
 * المجمّع، والفاشل بيفضل قدام المندوب (قاعدة «المندوب يخسر شغله دي مفيهاش تسامح»).
 * وبعدها رفع للسيرفر على طول (المالك ١٣ أكتوبر: «ترفع للسيرفر علي طول اي حاجه تتصدر»).
 */
export async function saveMujammaaRecords(
  entries: PlateEntry[],
  ctx: MujammaaRecordCtx,
  deps?: SaveDeps
): Promise<{ savedEntryIds: string[]; failed: number }> {
  if (!ctx.uid) throw new Error("لازم تكون مسجّل دخول عشان اللوحات تتحفظ باسمك");
  if (entries.length === 0) return { savedEntryIds: [], failed: 0 };
  const d = deps ?? (await defaultDeps());
  // واحدة واحدة — معاملات IndexedDB كتير مع بعض بتقع كلها على الآيفون لما الاتصال يموت (#306)
  const savedEntryIds: string[] = [];
  for (const e of entries) {
    try {
      await d.save(mujammaaRecordOf(e, ctx));
      savedEntryIds.push(e.id);
    } catch {
      /* بتفضل في الجدول — المندوب يجرّب تاني */
    }
  }
  if (savedEntryIds.length > 0) d.upload();
  return { savedEntryIds, failed: entries.length - savedEntryIds.length };
}

async function defaultDeps(): Promise<SaveDeps> {
  const { saveFieldCheckEntry } = await import("@/lib/idb");
  return {
    save: (e) => saveFieldCheckEntry(e),
    upload: () => {
      void import("@/lib/syncFieldCheck").then((m) => m.scheduleFieldChecksUpload()).catch(() => {});
    },
  };
}

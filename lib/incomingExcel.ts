/**
 * وجهات ملف الإكسيل اللي المندوب بيفتحه من واتساب/الملفات.
 *
 * المشترك **صوت-فقط** كان بيتعرضله نفس خيارات صفحة الفرز — وهي مقفولة عنده.
 * فيختار «إحالة» فالملف يتحفظ في سلوت صفحة الفرز، وتبويب «فرز» بتاعه بيقرا من
 * سلوت تاني خالص ⇒ **الخانة تفضل فاضية** وهو مش فاهم ليه. ويختار «تشييك»
 * فيتوديه للصفحة من غير ما حاجة تتغيّر.
 *
 * دلوقتي: صوت-فقط = **خيارين بس** (تشييك · إحالة)، والإحالة بتروح للسلوت الصح.
 * وباقي المشتركين زي ما هم بالظبط.
 *
 * و«ملف داتا إضافي» (المالك ٥ أكتوبر ٢٠٢٦: «لما يحب يرفع داتا اضافيه مفيش خيار ملف داتا
 * اضافيه … يتحط الملف في مربع داتا اضافي تحت مربع الداتا الاساسي») — بيروح لأول مربع داتا
 * إضافي فاضي (`data-N`) بنفس طريقة صفحة الفرز (`saveIncomingExtraData`).
 */
import type { CheckTab } from "./checkTab";
import type { UploadedFileRecord } from "./idb";
import type { DataMeta, DataRow } from "./dataStore";
import type { ExcelTable } from "./excel";

/** سلوت إحالة المشترك صوت-فقط — نفس اللي تبويب «فرز» بتاعه بيقرا منه. */
export const VOICE_REFERRAL_SLOT = "voice-referral";

export interface IncomingOption {
  slot: string;
  label: string;
  hint: string;
  /** لأي تبويب يروح بعد الحفظ (المشترك صوت-فقط بيفضل جوّه صفحة التشييك). */
  goTab?: CheckTab;
}

// ترتيب مؤنث للعرض («ثانية/ثالثة/...») — رقم اللي أكبر من ١٠ يظهر رقمياً.
const ORDINAL_FEM = ["", "الأولى", "ثانية", "ثالثة", "رابعة", "خامسة", "سادسة", "سابعة", "ثامنة", "تاسعة", "عاشرة"];
const ordinalFem = (n: number): string => ORDINAL_FEM[n] ?? `رقم ${n}`;

/** «ملف داتا إضافي» من نافذة «افتح الملف في» — اتفتح لكل المناديب (المالك ٥ أكتوبر: «انشر للكل»). */
export const EXTRA_DATA_FROM_SHARE_FOR_ALL = true;

export function incomingExcelOptions(
  opts: { voiceOnly: boolean; nextReferralNum: number | null; nextDataNum?: number | null },
): IncomingOption[] {
  if (opts.voiceOnly) {
    // صفحة الفرز مقفولة عنده ⇒ مافيش «داتا» ولا إحالات إضافية، والوجهتين
    // الاتنين جوّه صفحة التشييك.
    // الوجهتين الاتنين في تبويب **«فرز»** عنده — مربع التشييك ومربع الإحالة
    // فوق بعض هناك. توديته لتبويب تاني معناها يدوّر على المربع بنفسه.
    return [
      { slot: "check", label: "أضف لخانة التشييك", hint: "القائمة المرجعية للبحث", goTab: "sort" },
      { slot: VOICE_REFERRAL_SLOT, label: "أضف لخانة الإحالة", hint: "تتفرز على سجلاتك", goTab: "sort" },
    ];
  }
  return [
    { slot: "data", label: "ملف الداتا", hint: "بيانات التفريغ الميداني" },
    // مربع داتا إضافي تحت الأساسي (بس لو فيه داتا أساسية — زي الإحالة الإضافية)
    ...(opts.nextDataNum != null
      ? [{
          slot: `data-${opts.nextDataNum}`,
          label: "ملف داتا إضافي",
          hint: `يتحط في مربع «ملف الداتا ${opts.nextDataNum}» تحت الداتا الأساسية ويتدمج معاها في الفرز`,
        }]
      : []),
    { slot: "referral", label: "ملف الإحالة", hint: "قائمة البنك/الشركة" },
    ...(opts.nextReferralNum !== null
      ? [{
          slot: `referral-${opts.nextReferralNum}`,
          label: `إحالة ${ordinalFem(opts.nextReferralNum)}`,
          hint: "تتدمج مع الإحالة الأساسية في نفس الفرز",
        }]
      : []),
    { slot: "check", label: "ملف التشييك", hint: "القائمة المرجعية للبحث" },
  ];
}

/**
 * 🎨 لون مربع الوجهة (المالك ٦ أكتوبر ٢٠٢٦): الداتا والداتا الإضافي **أخضر** («علشان يبان عند المندوب ان
 * الاخضر ل ملفات الداتا»)، الإحالة والإحالة الإضافية **أحمر فاتح**، التشييك **تركوازي**.
 */
export type IncomingTone = "data" | "referral" | "check";
export function incomingOptionTone(slot: string): IncomingTone {
  if (slot === "check") return "check";
  if (slot === "data" || slot.startsWith("data-")) return "data";
  return "referral";   // referral / referral-N / خانة إحالة «صوت فقط»
}

/** أول رقم مربع إضافي فاضي (من ٢) — المربعات متتالية (صفحة الفرز بترقّمها). */
export async function firstFreeSlotNum(exists: (n: number) => Promise<boolean>, start = 2, max = 100): Promise<number> {
  let n = start;
  while (n < max && (await exists(n))) n++;
  return n;
}

/** أكبر من كده ⇒ بيتقرا على دفعات (نفس حد مربع الداتا في صفحة الفرز) — للأساسي والإضافي. */
export const EXTRA_DATA_STREAM_BYTES = 3 * 1024 * 1024;

export interface ExtraDataDeps {
  readSheetNames(file: File): Promise<string[]>;
  importMultiSheetData(file: File, o: { slot: string; onProgress?: (rows: number) => void }): Promise<DataMeta>;
  importLargeDataFile(file: File, o: { slot: string; onProgress?: (rows: number) => void }): Promise<DataMeta>;
  getSampleRows(n: number, slot: string): Promise<DataRow[]>;
  parseExcelFile(file: File, password?: string): Promise<ExcelTable>;
  saveUploadedFile(rec: UploadedFileRecord): Promise<void>;
  nextStreamSlot(): string;
  /** عدد الصفوف اللي اتقرت (للعدّاد في النافذة). */
  onProgress?: (rows: number) => void;
}

/**
 * ملف جاي من «افتح الملف في» ⇒ مربع الداتا الإضافي `slot` (data-N) — **بنفس شكل** اللي صفحة
 * الفرز بتحفظه، فالمربع بيظهر لوحده تحت الداتا الأساسية:
 *  · أكتر من ورقة، أو أكبر من الحد ⇒ بيتقرا على دفعات في مكان خاص بيه (`nextStreamSlot`)،
 *    والمربع فيه مؤشّر + عيّنة صغيرة (مايتحملش في الذاكرة — الآيفون).
 *  · غير كده (أو معاه كلمة مرور) ⇒ صفوفه + الملف نفسه. الملف المحمي بيرمي خطأ كلمة المرور زي
 *    القارئ العادي، والنافذة بتطلبها.
 */
export async function saveIncomingExtraData(
  slot: string, file: File, blob: Blob, password: string | undefined, d: ExtraDataDeps, now = new Date(),
): Promise<void> {
  const base = { key: `local:${slot}`, agentId: "local", slot, fileName: file.name, uploadedAt: now.toISOString() };
  if (!password) {
    const names = await d.readSheetNames(file).catch(() => [] as string[]);
    if (names.length > 1 || file.size > EXTRA_DATA_STREAM_BYTES) {
      const streamSlot = d.nextStreamSlot();
      try {
        const meta = names.length > 1
          ? await d.importMultiSheetData(file, { slot: streamSlot, onProgress: d.onProgress })
          : await d.importLargeDataFile(file, { slot: streamSlot, onProgress: d.onProgress });
        const sample = await d.getSampleRows(50, streamSlot);
        await d.saveUploadedFile({ ...base, headers: meta.headers, rows: sample, streamed: true, streamSlot });
        return;
      } catch (e) {
        if (names.length > 1) throw e;
        // ملف كبير مااتقراش على دفعات (محمي مثلاً) ⇒ القارئ العادي تحت
      }
    }
  }
  const table = await d.parseExcelFile(file, password);
  await d.saveUploadedFile({ ...base, headers: table.headers, rows: table.rows, fileBlob: blob });
}

export interface MainDataDeps {
  readSheetNames(file: File): Promise<string[]>;
  importMultiSheetData(file: File, o: { slot: string; onProgress?: (rows: number) => void }): Promise<DataMeta>;
  importLargeDataFile(file: File, o: { slot: string; onProgress?: (rows: number) => void }): Promise<DataMeta>;
  parseExcelFile(file: File, password?: string): Promise<ExcelTable>;
  saveUploadedFile(rec: UploadedFileRecord): Promise<void>;
  deleteUploadedFile(agentId: string, slot: string): Promise<void>;
}

/**
 * ملف جاي من «افتح الملف في» ⇒ **مربع الداتا الأساسي** — بنفس طريقة مربع صفحة الفرز
 * (المالك ٥ أكتوبر: «بيأخر وياخد وقت علي مايحمل الملف»):
 *  · أكتر من ورقة ⇒ كل الورقات على دفعات (زي ما كان).
 *  · ورقة واحدة وأكبر من الحد ⇒ على دفعات (`importLargeDataFile`) — كان بيتقرا كله مرة واحدة
 *    ويتحفظ كله، وصفحة الفرز بتحمّله كله تاني لما تفتح.
 *  · غير كده (أو معاه كلمة مرور، أو الدفعات مانفعتش) ⇒ صفوفه + الملف (زي ما كان بالظبط).
 * الصفحة بتفضّل الملف الصغير لو موجود ⇒ بعد الدفعات بنشيله.
 */
export async function saveIncomingMainData(
  file: File, blob: Blob, password: string | undefined, d: MainDataDeps,
  opts: { onProgress?: (rows: number) => void } = {}, now = new Date(),
): Promise<{ rowCount: number; streamed: boolean }> {
  if (!password) {
    const names = await d.readSheetNames(file).catch(() => [] as string[]);
    if (names.length > 1) {
      const meta = await d.importMultiSheetData(file, { slot: "data", onProgress: opts.onProgress });
      await d.deleteUploadedFile("local", "data");
      return { rowCount: meta.rowCount, streamed: true };
    }
    if (file.size > EXTRA_DATA_STREAM_BYTES) {
      try {
        const meta = await d.importLargeDataFile(file, { slot: "data", onProgress: opts.onProgress });
        await d.deleteUploadedFile("local", "data");
        return { rowCount: meta.rowCount, streamed: true };
      } catch { /* القارئ العادي تحت (محمي بكلمة مرور مثلاً) */ }
    }
  }
  const table = await d.parseExcelFile(file, password);
  await d.saveUploadedFile({
    key: "local:data", agentId: "local", slot: "data", fileName: file.name,
    headers: table.headers, rows: table.rows, uploadedAt: now.toISOString(), fileBlob: blob,
  });
  return { rowCount: table.rows.length, streamed: false };
}

/**
 * ==========================================================================
 *  سجل الأخطاء — صندوق مستقل في كل صفحة
 * ==========================================================================
 *  المطلوب: لو أي أداة غلطت، نعرف **إيه** الغلط و **ليه** — مش رسالة
 *  «حصل خطأ» ومش فاهمين حاجة.
 *
 *  فكل خطأ بنسجّل معاه:
 *    - المصدر (ميك / Whisper / Deepgram / الموقع / الشيت)
 *    - رسالة بالعربي
 *    - كود الحالة (٤٠١ = مفتاح غلط، ٤٢٩ = تعدّيت الحد، …)
 *    - التفاصيل الخام من الأداة نفسها (بتفتح بضغطة)
 *
 *  والسيرفر بيرجّع نفس الشكل ده بالظبط، فرسالة Deepgram أو OpenAI
 *  الحقيقية توصل للمندوب كما هي بلا ترجمة تضيّع المعنى.
 */

export type ErrorSource =
  | "الميكروفون"
  | "OpenAI Whisper"
  | "Deepgram"
  | "الموديل المحلي"
  | "موديل المقاطع"
  | "البث المباشر"
  | "الموقع"
  | "شيت البنك"
  | "المفتاح"
  | "التفريغ"
  /** 📊 التقرير الشامل لصفحة المجمّع — فشله مابيوقفش التفريغ */
  | "التقرير"
  | "المراجعة الصوتية"
  /** محرّك كروم المدمج شغّال جنب موديلنا كشاهد — فشله مايوقفش الجلسة */
  | "شاهد المتصفح"
  /** شريط PCM الموازي — لو ما اشتغلش الجلسة ترجع للبادئة القديمة */
  | "شريط الصوت"
  | "السيرفر"
  | "التصدير";

export interface LoggedError {
  id: string;
  at: number;
  source: ErrorSource;
  message: string;
  status?: number;
  /** التفاصيل الخام — JSON أو نص */
  detail?: unknown;
}

let counter = 0;

export class ErrorLog {
  private items: LoggedError[] = [];
  private listeners = new Set<() => void>();
  private max: number;

  constructor(max = 60) {
    this.max = max;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): LoggedError[] => this.items;

  private notify() {
    for (const fn of this.listeners) fn();
  }

  add(
    source: ErrorSource,
    message: string,
    extra?: { status?: number; detail?: unknown }
  ): void {
    counter += 1;
    const entry: LoggedError = {
      id: `err-${counter}`,
      at: Date.now(),
      source,
      message: String(message || "خطأ بلا رسالة"),
      status: extra?.status,
      detail: extra?.detail,
    };
    // الأحدث فوق
    this.items = [entry, ...this.items].slice(0, this.max);
    this.notify();
    // برضه في الكونسول عشان التشخيص العميق
    console.error(`[${source}]`, message, extra?.detail ?? "");
  }

  /** يستقبل شكل الخطأ الموحّد الجاي من السيرفر */
  addFromServer(fallbackSource: ErrorSource, error: unknown): void {
    const e = error as
      | { where?: string; message?: string; status?: number; detail?: unknown }
      | undefined;
    this.add((e?.where as ErrorSource) ?? fallbackSource, e?.message ?? "خطأ غير معروف", {
      status: e?.status,
      detail: e?.detail,
    });
  }

  clear(): void {
    this.items = [];
    this.notify();
  }

  get count(): number {
    return this.items.length;
  }

  /** نص جاهز للنسخ — بيسهّل إنك تبعت المشكلة لحد يشوفها */
  toText(): string {
    return this.items
      .map((e) => {
        const time = new Date(e.at).toLocaleTimeString("ar-EG");
        const status = e.status ? ` (${e.status})` : "";
        const detail =
          e.detail === undefined
            ? ""
            : `\n    التفاصيل: ${
                typeof e.detail === "string"
                  ? e.detail
                  : JSON.stringify(e.detail, null, 2)
              }`;
        return `[${time}] ${e.source}${status}: ${e.message}${detail}`;
      })
      .join("\n\n");
  }
}

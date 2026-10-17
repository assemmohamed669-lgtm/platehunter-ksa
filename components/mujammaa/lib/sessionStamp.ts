/**
 * ==========================================================================
 *  ختم سياق الجلسة — مربع اسم الشارع + مربع الملاحظة
 * ==========================================================================
 *
 *  المندوب بيكتب اسم الشارع مرة واحدة، وكل اللوحات اللي بعدها بتاخده تلقائياً
 *  لحد ما يغيّره. ده سلوكه الحقيقي **مقيس من شيتاته** — نفس النص متكرر على
 *  عشرات الصفوف المتتالية.
 *
 *  🔴 **الختم بلحظة النطق مش بلحظة التفريغ.**
 *  في المجمّع التسجيل بيكمّل والتفريغ ماشي بالتوازي وراه. لو ختمنا وقت
 *  التفريغ، اللوحة اللي اتقالت في شارع ١ ممكن تتختم بشارع ٢ لأن المندوب غيّر
 *  المربع في الوقت ده. فبنسجّل **كل تغيير بتوقيته**، وكل لوحة بتسأل:
 *  «إيه اللي كان مكتوب لحظة ما اتقلت؟»
 *
 *  ولوحة اتقالت **قبل** أي إدخال بترجع بلا سياق — ما بنمدّش القيمة للخلف،
 *  لأن المندوب ماكانش لسه في الشارع ده.
 */

export interface StampEdit {
  /** التوقيت النسبي من بداية التسجيل بالملي ثانية */
  tMs: number;
  /** نص فاضي = مسح المربع من اللحظة دي */
  value: string;
}

export interface Stamp {
  street: string | null;
  note: string | null;
  /** نوع السيارة — قيمة من القاموس المقفول `VEHICLE_TYPES` */
  type: string | null;
}

export interface SessionStampJSON {
  startedAt: number;
  streets: StampEdit[];
  notes: StampEdit[];
  types?: StampEdit[];
}

export interface SessionStampOptions {
  /** توقيت بداية التسجيل (Date.now) — عشان نطلّع تاريخ ووقت حقيقي لكل لوحة */
  startedAt?: number;
}

export class SessionStamp {
  private streets: StampEdit[] = [];
  private notes: StampEdit[] = [];
  private types: StampEdit[] = [];
  private startedAt: number;

  constructor(options: SessionStampOptions = {}) {
    this.startedAt = options.startedAt ?? Date.now();
  }

  setStreet(value: string, tMs: number): void {
    this.streets.push({ tMs, value });
  }

  setNote(value: string, tMs: number): void {
    this.notes.push({ tMs, value });
  }

  /**
   * نوع السيارة. المندوب بيختاره مرة وبيفضل ساري على اللوحات اللي بعده —
   * نفس سلوكه في الشيتات بالظبط (غمارتين اتكررت ٥٤ مرة على صفوف متتالية).
   */
  setType(value: string, tMs: number): void {
    this.types.push({ tMs, value });
  }

  /** السياق الساري عند لحظة نطق معيّنة */
  at(tMs: number): Stamp {
    return {
      street: pick(this.streets, tMs),
      note: pick(this.notes, tMs),
      type: pick(this.types, tMs),
    };
  }

  /** التاريخ والوقت الحقيقي للحظة النطق (عمود «التاريخ والوقت») */
  spokenAt(tMs: number): number {
    return this.startedAt + tMs;
  }

  toJSON(): SessionStampJSON {
    return {
      startedAt: this.startedAt,
      streets: this.streets.slice(),
      notes: this.notes.slice(),
      types: this.types.slice(),
    };
  }

  static fromJSON(j: SessionStampJSON): SessionStamp {
    const s = new SessionStamp({ startedAt: j.startedAt });
    s.streets = (j.streets ?? []).slice();
    s.notes = (j.notes ?? []).slice();
    s.types = (j.types ?? []).slice();   // ?? عشان الجلسات المحفوظة قبل النوع
    return s;
  }
}

/**
 * آخر إدخال حصل **عند أو قبل** اللحظة المطلوبة.
 * بنلف من الآخر عشان آخر إدخال في نفس اللحظة يكسب (المندوب صحّح كتابته).
 */
function pick(edits: StampEdit[], tMs: number): string | null {
  for (let i = edits.length - 1; i >= 0; i--) {
    if (edits[i].tMs <= tMs) {
      const v = edits[i].value.trim();
      return v === "" ? null : v;      // مسح المربع = وقف الختم، مش رجوع للأقدم
    }
  }
  return null;                          // قبل أي إدخال ⇒ بلا سياق (ما نمدّش للخلف)
}

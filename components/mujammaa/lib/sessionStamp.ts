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
  /** «اسم الحي» (كان «اسم الشارع») */
  street: string | null;
  /** «اسم أو رقم الجراج» ⇒ عمود الملاحظات */
  note: string | null;
  /** نوع السيارة — قيمة من القاموس المقفول `VEHICLE_TYPES` */
  type: string | null;
  /** «اسم المسجّل» (١٨ أكتوبر ٢٠٢٦) */
  recorder: string | null;
  /** 🛣️ «اسم الشارع» — عمود لوحده (المالك ٣١ أكتوبر ٢٠٢٦) */
  streetName: string | null;
}

/** المربعات اللي بتتكتب حرف حرف (`typeInto`) */
export type StampField = "street" | "note" | "recorder" | "streetName";

/** كتابة متتالية في نفس المربع بفواصل أقل من كده = تعديل واحد من أول حرف */
export const STAMP_TYPING_BURST_MS = 2000;

export interface SessionStampJSON {
  startedAt: number;
  streets: StampEdit[];
  notes: StampEdit[];
  types?: StampEdit[];
  recorders?: StampEdit[];
  streetNames?: StampEdit[];
}

export interface SessionStampOptions {
  /** توقيت بداية التسجيل (Date.now) — عشان نطلّع تاريخ ووقت حقيقي لكل لوحة */
  startedAt?: number;
}

export class SessionStamp {
  private streets: StampEdit[] = [];
  private notes: StampEdit[] = [];
  private types: StampEdit[] = [];
  private recorders: StampEdit[] = [];
  private streetNames: StampEdit[] = [];
  /** آخر حرف اتكتب في كل مربع (للدمج — مابيتحفظش) */
  private lastKey: Partial<Record<StampField, number>> = {};
  private startedAt: number;

  constructor(options: SessionStampOptions = {}) {
    this.startedAt = options.startedAt ?? Date.now();
  }

  setStreet(value: string, tMs: number): void {
    this.streets.push({ tMs, value });
    delete this.lastKey.street;
  }

  setNote(value: string, tMs: number): void {
    this.notes.push({ tMs, value });
    delete this.lastKey.note;
  }

  /** «اسم المسجّل» — ساري على اللوحات اللي بعده لحد ما يتغيّر أو يتمسح */
  setRecorder(value: string, tMs: number): void {
    this.recorders.push({ tMs, value });
    delete this.lastKey.recorder;
  }

  /** 🛣️ «اسم الشارع» — ساري على اللوحات اللي بعده لحد ما يتغيّر أو يتمسح */
  setStreetName(value: string, tMs: number): void {
    this.streetNames.push({ tMs, value });
    delete this.lastKey.streetName;
  }

  /**
   * ⌨️ المندوب بيكتب **حرف حرف** — كل حرف كان بيبقى تعديل لوحده، فاللوحة اللي اتقالت وهو بيكتب كانت بتاخد
   * «اول جر». دلوقتي: حروف ورا بعض (أقل من `STAMP_TYPING_BURST_MS` بين كل حرف والتاني) = **تعديل واحد
   * من أول حرف** بآخر قيمة. وقفة أطول ⇒ تعديل جديد بوقته. «مسح» (`setX("")`) بيقفل الدمج.
   */
  typeInto(field: StampField, value: string, tMs: number): void {
    const list = this.listOf(field);
    const last = this.lastKey[field];
    if (last !== undefined && tMs - last <= STAMP_TYPING_BURST_MS && list.length > 0) {
      list[list.length - 1] = { tMs: list[list.length - 1].tMs, value };
    } else {
      list.push({ tMs, value });
    }
    this.lastKey[field] = tMs;
  }

  private listOf(field: StampField): StampEdit[] {
    return field === "street" ? this.streets : field === "note" ? this.notes
      : field === "streetName" ? this.streetNames : this.recorders;
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
      recorder: pick(this.recorders, tMs),
      streetName: pick(this.streetNames, tMs),
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
      recorders: this.recorders.slice(),
      streetNames: this.streetNames.slice(),
    };
  }

  static fromJSON(j: SessionStampJSON): SessionStamp {
    const s = new SessionStamp({ startedAt: j.startedAt });
    s.streets = (j.streets ?? []).slice();
    s.notes = (j.notes ?? []).slice();
    s.types = (j.types ?? []).slice();   // ?? عشان الجلسات المحفوظة قبل النوع
    s.recorders = (j.recorders ?? []).slice();   // الجلسات المحفوظة قبل ١٨ أكتوبر
    s.streetNames = (j.streetNames ?? []).slice();   // المقاطع المحفوظة قبل «اسم الشارع» (٣١ أكتوبر)
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

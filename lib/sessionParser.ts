/**
 * sessionParser — محلّل جلسة التسجيل الصوتي كـ State Machine حدثي.
 *
 * المشكلة اللي بيحلها: الجلسة الميدانية stream مستمر — المندوب بيقول لوحات
 * ورا بعض، وفي أي لحظة يقول ملاحظة موقع («جراج يمين»...) المفروض تنطبق على
 * كل اللوحات *اللي بعدها* لحد ملاحظة جديدة. المحلّل القديم (batch) كان بيلزق
 * الملاحظة في آخر لوحة *قبلها* — معكوس.
 *
 * التصميم:
 *   نص chunk ──▶ splitByNotePhrases (أجزاء مرتّبة: نص/ملاحظة)
 *              ──▶ لكل جزء ملاحظة: NoteDetected → تحديث currentNote
 *              ──▶ لكل جزء نص: plateAtoms → platesFromAtoms (نفس منطق
 *                  الاستخراج المجرَّب) → PlateCompleted لكل لوحة، بترث
 *                  currentNote لحظتها.
 *   carry-over: ذيل ناقص في آخر chunk (لوحة/عبارة اتقطعت على الحدود)
 *   يترحّل نصياً في الـ state ويتقدّم للـ chunk الجاي — صفر فقد على الحدود.
 *
 * السجلات append-only: المحلّل عمره ما يعدّل سجل سبق إصداره.
 */

import {
  splitByNotePhrases,
  plateAtoms,
  platesFromAtoms,
  wawTensWord,
  parsePlateFromTranscript,
  extractMultiplePlates,
  type PlateAtom,
  type MultiPlateResult,
} from "./plateParser";

export interface SessionState {
  /** الملاحظة السارية — كل لوحة جديدة بترثها لحد ملاحظة جديدة. */
  currentNote: string;
  /** ذيل نصي مرحَّل من chunk سابق (لوحة/عبارة ناقصة على الحدود). */
  carryText: string;
  /** عدّاد تسلسلي للأحداث والسجلات عبر الجلسة كلها. */
  seq: number;
}

export interface SessionEvent {
  type: "NoteDetected" | "PlateCompleted";
  value: string;
  seq: number;
}

export interface SessionRecord {
  plate: string;
  vehicleType?: string;
  /** الملاحظات النهائية للسجل — السياق الساري + أي ملاحظات محلية للّوحة. */
  notes: string;
  normalized: string;
  uncertain?: boolean;
  rawLetterSource?: string;
  /** السياق الساري وقت اكتمال اللوحة (للاختبار/العرض — متضمَّن في notes). */
  contextNote: string;
  seq: number;
  /**
   * نصّ السجل ده اتلمّ من **رسالتين** (فيه مادة من `state.carryText`)؟
   *
   * ليه العلَم ده موجود؟ طيّار الرأي التاني بيقصّ نافذة صوت من **الرسالة
   * الحالية** بس. لو اللوحة اتلمّت من رسالتين فنص صوتها في نبضة سابقة، والنافذة
   * مايمكنها تحتويه ⇒ الطيّار لازم يسكت بسبب مسمّى (`carried_over`) بدل ما يبعت
   * طلب على نص لوحة. المقيس في جلسة المالك: ٦ لوحات من ٣٠ كانت كده (Deepgram
   * نهّى الأرقام لوحدها والحروف جات من الرسالة اللي قبلها).
   *
   * ⚠️ محافظ عن قصد: بيتعلّم على السجل **الأول** من أي chunk دخل وفيه
   * `carryText` مش فاضي. مادة الترحيل دايماً **بادئة** النص المدمَج
   * (`${carryText} ${text}`) و`splitCarryAtoms` عمرها ما ترحّل لوحة كاملة (حروف
   * بلا أرقام، أو مجموعة أرقام ناقصة + حروفها) — فمستحيل تغذّي غير أول لوحة.
   * لو الترحيل اتساقط ومادخلش السجل الأول فالعلَم بيبقى إيجابية زايدة = سكوت
   * زيادة، وده الاتجاه الآمن.
   *
   * ملاحظة: الترحيل **جوّه** نفس الـchunk (`pendingLetterText` — لوحة قطعتها
   * ملاحظة) **مش** بيعلّم: صوته في نفس الرسالة، فالنافذة بتلمّه.
   */
  fromCarry: boolean;
}

export function newSessionState(): SessionState {
  return { currentNote: "", carryText: "", seq: 0 };
}

// إعادة إصدار ذرّة كنص يعيد تطبيعه لنفس الذرّة في الـ chunk الجاي.
// حرف الواو الاسمي بيرجع «واو» عشان يفضل محمي من دمج حرف العطف (Step 2.5).
function atomToText(a: PlateAtom): string {
  if (a.t === "L") return a.fromName ? "واو" : a.v;
  return a.v;
}

/**
 * يسلسل ذرّات للنص المرحَّل — و**بيفكّ مركّب الواو لأصله المنطوق**.
 *
 * مركّب الواو («واحد وعشرين» = ٢١) بيتخزّن في الذرّة كناتج جمع + الأصل
 * (`cFrom`/`cTens`). الأصل ده هو دليل خطوة ٢.٦ في `plateParser`: لو سلسلة
 * الأرقام طلعت ٣ خانات واللزق كان بيكمّلها ٤، بترجع لزق (Deepgram بيلخّص
 * «سبعة صفر» المنطوقة في كلمة «وسبعين»، فالكلمة مش دايماً مركّب).
 *
 * `atomToText` بتطلّع الخانة المحسوبة بس، فالدليل كان بيموت على حدّ الرسالة
 * وخطوة ٢.٦ تبقى مش قادرة تتراجع أبداً بعد كده: «دال سين كاف واحد وعشرين» ثم
 * «تلاتة» كانت بتدّي دسك0213 بدل دسك1203. القياس على التسجيلات الميدانية:
 * ٤٨ لوحة حقيقية من قايمة المطلوبين كانت بتضيع.
 *
 * الحل مش قاعدة جديدة — النص المرحَّل بيرجّع الكلام زي ما اتقال («1 وعشرين»)،
 * فالمركّب يتقرّر من الأول في الرسالة الجاية وهو شايف السلسلة كاملة. النتيجة:
 * البث والدفعة بيدّوا نفس اللوحة **بالبناء**، مش بالصدفة.
 *
 * الذرّتين لازم يبقوا مع بعض (الجمع بيطلّع خانتين متجاورتين). لو القصّ فصلهم
 * بنرجع للسلسلة العادية بدل ما نلفّق نص مش مطابق للمنطوق.
 */
function atomsToCarryText(atoms: PlateAtom[]): string {
  const out: string[] = [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const next = atoms[i + 1];
    if (a.t === "D" && a.cFrom !== undefined && a.cTens !== undefined
        && next && next.t === "D") {
      const word = wawTensWord(a.cTens);
      if (word) { out.push(a.cFrom, word); i++; continue; }
    }
    out.push(atomToText(a));
  }
  return out.join(" ");
}

/**
 * يفصل ذيل «لوحة ناقصة» من آخر الذرّات:
 *   • حروف في الآخر من غير أرقام → حروف اللوحة الجاية، تترحّل.
 *   • أرقام أقل من 4 في الآخر (+ حروفها اللي قبلها) → لوحة لسه بتتقال، تترحّل.
 *   • مجموعة 4 كاملة (أو نوع/ملاحظة في الآخر) → مفيش ترحيل.
 */
function splitCarryAtoms(atoms: PlateAtom[]): { head: PlateAtom[]; carry: string } {
  let cut = atoms.length;
  let i = atoms.length - 1;

  if (i >= 0 && atoms[i].t === "L") {
    while (i >= 0 && atoms[i].t === "L") i--;
    cut = i + 1;
    // الحروف المرحَّلة ممكن تكون واو عطف اتقطع بعده («…د 1 2 3 و») — لو
    // مجموعة الأرقام اللي قبل الحروف ناقصة، رحّلها هي كمان وحروفها، وإلا
    // الرأس هيطلّع لوحة وهمية ناقصة والواو هيبقى لوحة وهمية تانية.
    if (i >= 0 && atoms[i].t === "D") {
      const dEnd = i;
      while (i >= 0 && atoms[i].t === "D") i--;
      const dLen = dEnd - i;
      if (dLen < 4) {
        let j = i;
        while (j >= 0 && atoms[j].t === "L") j--;
        cut = j + 1;
      } else if (dLen % 4 !== 0) {
        cut = dEnd - (dLen % 4) + 1;
      }
    }
  } else if (i >= 0 && atoms[i].t === "D") {
    const dEnd = i;
    while (i >= 0 && atoms[i].t === "D") i--;
    const dLen = dEnd - i;
    if (dLen < 4) {
      // المجموعة كلها ناقصة → رحّلها هي وحروفها
      let j = i;
      while (j >= 0 && atoms[j].t === "L") j--;
      cut = j + 1;
    } else if (dLen % 4 !== 0) {
      // مجموعات 4 كاملة + باقي ناقص → رحّل الباقي بس
      cut = dEnd - (dLen % 4) + 1;
    }
  }

  return {
    head: atoms.slice(0, cut),
    carry: atomsToCarryText(atoms.slice(cut)),
  };
}

/**
 * يحلّل chunk نص (من التفريغ) في سياق الجلسة الجارية.
 * final=true (وقفة التسجيل / batch): مفيش ترحيل — كل حاجة بتتفرّغ.
 */
export function parseSessionChunk(
  text: string,
  state: SessionState,
  opts?: { final?: boolean }
): { records: SessionRecord[]; events: SessionEvent[]; state: SessionState } {
  const final = !!opts?.final;
  // مادة مرحَّلة من رسالة سابقة؟ لازم تتقرا **قبل** ما نبني `combined` — أول لوحة
  // بتخرج هي الوحيدة اللي تقدر تكون مبنية عليها (شوف `SessionRecord.fromCarry`).
  const hadCarry = state.carryText.trim().length > 0;
  const combined = `${state.carryText} ${text}`.trim();
  const records: SessionRecord[] = [];
  const events: SessionEvent[] = [];
  let seq = state.seq;
  let currentNote = state.currentNote;
  let carryText = "";

  if (!combined) {
    return { records, events, state: { currentNote, carryText, seq } };
  }

  const { parts, pendingTail } = splitByNotePhrases(combined, { holdPending: !final });

  const emitPlates = (plates: MultiPlateResult[]) => {
    for (const p of plates) {
      // مجموعة أرقام بلا حروف اتعزلت عن لوحتها بملاحظة (المندوب عمره ما
      // يملي رقم لوحده) → ضمّها لملاحظات آخر سجل في نفس النداء — نفس دلالة
      // Step 6 في المحلّل الدفعي — بدل ما تتحفظ كسجل وهمي بلا حروف.
      if (/^\d+$/.test(p.plate) && records.length > 0) {
        const last = records[records.length - 1];
        last.notes = [last.notes, p.plate].filter(Boolean).join(" ");
        continue;
      }
      const notes = [currentNote, p.notes].filter(Boolean).join(" ، ");
      records.push({
        plate: p.plate,
        vehicleType: p.vehicleType,
        notes,
        normalized: p.normalized,
        uncertain: p.uncertain,
        rawLetterSource: p.rawLetterSource,
        contextNote: currentNote,
        seq,
        fromCarry: hadCarry && records.length === 0,
      });
      events.push({ type: "PlateCompleted", value: p.plate, seq: seq++ });
    }
  };

  // حروف/أرقام ناقصة من جزء سابق (ملاحظة قطعت اللوحة في نصها) — بتتقدّم
  // لأول جزء نصي جاي عشان تتوحّد مع باقي اللوحة («د ب ر [جراج يمين] 1234»).
  let pendingLetterText = "";

  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];

    if (part.kind === "note") {
      currentNote = part.note;
      events.push({ type: "NoteDetected", value: part.note, seq: seq++ });
      continue;
    }

    const isLastPart = pi === parts.length - 1;
    const effective = [pendingLetterText, part.text].filter(Boolean).join(" ");
    pendingLetterText = "";

    // الجزء الأخير في flush نهائي بيتفرد بالكامل (مفيش ترحيل بعده).
    const noCarve = final && isLastPart;

    if (noCarve) {
      let plates = extractMultiplePlates(effective);
      if (plates.length === 0) {
        // مركّبات زي «ألف وخمسمية» بيجمعها محلّل اللوحة الواحدة صح.
        const parsed = parsePlateFromTranscript(effective);
        if (parsed.plate) {
          plates = [{
            plate: parsed.plate,
            vehicleType: parsed.vehicleType,
            notes: parsed.notes ?? "",
            normalized: parsed.normalized ?? "",
            uncertain: parsed.uncertain,
          }];
        }
      }
      emitPlates(plates);
      continue;
    }

    // جزء متبوع بملاحظة (أو آخر جزء في chunk غير نهائي): افصل الذيل الناقص —
    // يترحّل عبر الملاحظة (pendingLetters) أو عبر حدود الـ chunk (carryText).
    const atoms = plateAtoms(effective);
    const { head, carry } = splitCarryAtoms(atoms);
    let plates = platesFromAtoms(head);
    let carryOut = carry;

    if (plates.length === 0 && head.length > 0) {
      if (head.length <= 10) {
        // مفيش لوحة مكتملة — رحّل الجزء كله (محدود الحجم) بدل ما يضيع.
        carryOut = [atomsToCarryText(head), carry].filter(Boolean).join(" ");
        plates = [];
      } else if (!carry) {
        const parsed = parsePlateFromTranscript(effective);
        if (parsed.plate) {
          plates = [{
            plate: parsed.plate,
            vehicleType: parsed.vehicleType,
            notes: parsed.notes ?? "",
            normalized: parsed.normalized ?? "",
            uncertain: parsed.uncertain,
          }];
        }
      }
    }
    emitPlates(plates);

    if (carryOut) {
      if (isLastPart && !final) carryText = carryOut;   // حدود chunk
      else pendingLetterText = carryOut;                 // عبور ملاحظة
    }
  }

  // حروف اتبقّت بعد آخر ملاحظة من غير جزء نصي بعدها:
  if (pendingLetterText) {
    if (final) {
      // فرصة أخيرة — افردها (حروف بلا أرقام مش لوحة وهتسقط طبيعياً).
      emitPlates(extractMultiplePlates(pendingLetterText));
    } else {
      carryText = [pendingLetterText, carryText].filter(Boolean).join(" ");
    }
  }

  if (!final && pendingTail) {
    carryText = [carryText, pendingTail].filter(Boolean).join(" ");
  }

  return { records, events, state: { currentNote, carryText, seq } };
}

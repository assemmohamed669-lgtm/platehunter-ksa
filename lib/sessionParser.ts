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
    carry: atoms.slice(cut).map(atomToText).join(" "),
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
        carryOut = [head.map(atomToText).join(" "), carry].filter(Boolean).join(" ");
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

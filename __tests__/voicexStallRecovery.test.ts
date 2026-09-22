import { describe, it, expect } from "vitest";
import { planVoicexAdmission } from "@/lib/voicexAdmission";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔇 «يشتغل شوي وبعدين يقف» — إثبات إن الوقفة بتفكّ
 * ══════════════════════════════════════════════════════════════════════
 *
 * بلاغ المالك (٢٢ سبتمبر ٢٠٢٦): «فويس اكس بيقف مع المندوب، بيشتغل معاه
 * شوي وبعدها ميطلعش لوحات والمندوب يكون بيقول ومتتكتبش».
 *
 * الشكل ده **مش عشوائي** — هو التوقيع الحرفي للسقف بلا طابور:
 * أول الجلسة `inflight = 0` فالنوافذ بتعدّي؛ أول ما الرحلة لكوريا تتقل،
 * `inflight` بيثبت على السقف و**كل** نطق بعد كده بيترمى. ومافيش حاجة
 * بترجّعه، فهو مابيرجعش لوحده.
 *
 * الاختبار ده بيحاكي **سياسة** المسارين على نفس التتابع:
 *   · القديم: `if (inflight < cap) send; else drop;`   (voicexEngine.ts:222)
 *   · الجديد: `planVoicexAdmission` + طابور + تصريف عند فضى سلوت
 *
 * ⚠️ **حدّ الاختبار**: بيغطّي السياسة مش الأسلاك. `drainPending` نفسها
 *   (٨ سطور) بتنده `planVoicexAdmission` وبتتنده من `pr.finally` — وده
 *   اللي إثباته الحقيقي هو جلسة جهاز حقيقي (تقرير المالك ٤٣/٤٣ بـ«ولا
 *   نافذة اتخطّت ✓»).
 */

const CAP = 2;

/** المسار القديم بالحرف: مشغول ⇒ النطق يترمى وخلاص. */
function legacy(utterances: number, busyUntil: number): number {
  let inflight = 0;
  let sent = 0;
  for (let i = 0; i < utterances; i++) {
    // الشبكة بطيئة: السلوتات مقفولة لحد `busyUntil`
    inflight = i < busyUntil ? CAP : 0;
    if (inflight < CAP) sent += 1;
  }
  return sent;
}

/** المسار الجديد: يستنى دوره، والسلوت لما يفضى بيصرّف الطابور. */
function fixed(utterances: number, busyUntil: number): number {
  let inflight = 0;
  let sent = 0;
  const pending: number[] = [];

  /**
   * `drainPending` بتبعت لحد ما السقف يتقفل، وكل نافذة بتخلص بتنقّص
   * `inflight` وتنده التصريف تاني (`pr.finally` في `sliceAndSend`).
   * بنمثّل الدورتين دول — من غير دورة الإنهاء الطابور بيقف عند السقف.
   */
  const drain = () => {
    let guard = 0;
    while (pending.length > 0 && guard++ < 1000) {
      const plan = planVoicexAdmission({
        source: "utterance", inflight, maxInflight: CAP, utteranceQueued: true,
      });
      if (plan === "send") {
        pending.shift();
        inflight += 1;   // `sliceAndSend` بتزوّده متزامن
        sent += 1;
      } else {
        inflight -= 1;   // نافذة خلصت ⇒ سلوت فضي ⇒ التصريف بيكمّل
      }
    }
  };

  for (let i = 0; i < utterances; i++) {
    inflight = i < busyUntil ? CAP : 0;
    const plan = planVoicexAdmission({
      source: "utterance", inflight, maxInflight: CAP, utteranceQueued: pending.length > 0,
    });
    if (plan === "send") { inflight += 1; sent += 1; }
    else pending.push(i);
  }
  // الشبكة فكّت ⇒ السلوتات فضيت ⇒ التصريف
  inflight = 0;
  drain();
  return sent;
}

describe("وقفة فويس اكس — السقف بلا طابور", () => {
  it("🔴 القديم: أول ما الشبكة تتقل بيضيّع **كل** نطق بعدها", () => {
    // ٢٠ نطق، الشبكة اتقلت من الأول لحد النطق ١٥
    expect(legacy(20, 15)).toBe(5);   // ١٥ لوحة ضاعت في صمت
  });

  it("✅ الجديد: ولا نطق بيضيع — بيستنى دوره", () => {
    expect(fixed(20, 15)).toBe(20);
  });

  it("🔴 الشبكة تقيلة الجلسة كلها ⇒ القديم = **صفر لوحة**", () => {
    expect(legacy(30, 30)).toBe(0);
  });

  it("✅ ونفس الحالة في الجديد = ٣٠ لوحة", () => {
    expect(fixed(30, 30)).toBe(30);
  });

  it("الجلسة السهلة (شبكة سريعة) الاتنين متساويين — مافيش تراجع", () => {
    expect(legacy(20, 0)).toBe(20);
    expect(fixed(20, 0)).toBe(20);
  });

  it("🔴 والنافذة الزاحفة بتتنازل للنطق المستني — مابتاكلش السلوت", () => {
    expect(planVoicexAdmission({
      source: "window", inflight: 0, maxInflight: CAP, utteranceQueued: true,
    })).toBe("skip");
  });
});

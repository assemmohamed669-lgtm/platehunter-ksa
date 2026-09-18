/**
 * ذيل الإيقاف — إصلاح باج «آخر لوحة بيقولها المندوب قبل ما يقفل مش بتتكتب».
 * =============================================================================
 * اللوحة بتوصل الموديل بطريقتين بس:
 *   أ) VAD يكتشف نهاية النطق — محتاج ٩٠٠ مللي **سكوت** بعد الكلام.
 *   ب) مؤقّت دوري كل ١.٥ث — أثناء الكلام بس.
 *
 * لما المندوب يقول آخر لوحة ويدوس «إيقاف» بسرعة: مافيش سكوت فـ(أ) ماحصلتش،
 * والمؤقّت ماجاش دوره فـ(ب) ماحصلتش ⇒ **الصوت ده عمره ما اتبعت للموديل**.
 *
 * 🔴 الإصلاح القديم كان **بيعيد قراءة آخر ٥ث** فكان بيعمل صفوف مكررة، فاتشال —
 * واتبدّلت مشكلة بمشكلة. الإصلاح ده بيبعت **اللي ماتبعتش بس**: من آخر ثانية
 * اتبعتت لآخر الصوت. فآخر لوحة تتكتب **ومن غير تكرار**.
 */
import { describe, it, expect } from "vitest";
import { tailToSend } from "@/lib/voicexTail";

describe("tailToSend — الجزء اللي ماتبعتش وقت الإيقاف", () => {
  it("يبعت الذيل لو فيه صوت اتقال وماتبعتش", () => {
    // اتبعت لحد 10ث، والتسجيل وصل 12.4ث، وآخر كلام كان عند 12.2ث
    expect(tailToSend({ lastSentToSec: 10, elapsedSec: 12.4, lastSpokeSec: 12.2 }))
      .toEqual({ fromSec: 10, toSec: 12.4 });
  });

  it("🔴 مايبعتش حاجة لو كله اتبعت خلاص — ده اللي كان بيعمل التكرار", () => {
    expect(tailToSend({ lastSentToSec: 12.4, elapsedSec: 12.4, lastSpokeSec: 12.2 }))
      .toBeNull();
  });

  it("🔴 مايبعتش سكوت — لو آخر كلام قديم، الذيل صمت", () => {
    // آخر كلام عند 5ث والتسجيل وصل 20ث ⇒ الـ15ث دول سكوت
    expect(tailToSend({ lastSentToSec: 10, elapsedSec: 20, lastSpokeSec: 5 }))
      .toBeNull();
  });

  it("مايبعتش ذيل أقصر من اللزوم (مش هيكون فيه لوحة)", () => {
    expect(tailToSend({ lastSentToSec: 12.2, elapsedSec: 12.4, lastSpokeSec: 12.3 }))
      .toBeNull();
  });

  it("بيحدّ طول الذيل — مايبعتش مقطع ضخم للموديل", () => {
    const t = tailToSend({ lastSentToSec: 0, elapsedSec: 40, lastSpokeSec: 39.5 })!;
    expect(t.toSec - t.fromSec).toBeLessThanOrEqual(6);
    expect(t.toSec).toBe(40);            // بيقصّ من الأول مش من الآخر
  });

  it("جلسة مافيهاش كلام خالص ⇒ مافيش ذيل", () => {
    expect(tailToSend({ lastSentToSec: 0, elapsedSec: 8, lastSpokeSec: 0 })).toBeNull();
  });

  it("🔴 مايرجّعش مدى بالسالب لو العدادات اتلخبطت", () => {
    expect(tailToSend({ lastSentToSec: 15, elapsedSec: 12, lastSpokeSec: 11.9 })).toBeNull();
  });

  it("المندوب لسه بيتكلم وقت الإيقاف ⇒ يبعت لآخر لحظة", () => {
    // lastSpokeSec = 0 معناها VAD ما سجّلش نهاية نطق، بس speaking كانت شغالة
    expect(tailToSend({ lastSentToSec: 9, elapsedSec: 11.5, lastSpokeSec: 0, speaking: true }))
      .toEqual({ fromSec: 9, toSec: 11.5 });
  });
});

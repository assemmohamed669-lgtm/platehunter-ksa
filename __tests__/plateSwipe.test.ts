import { describe, it, expect } from "vitest";
import { isHorizontalDrag, clampReveal, settleReveal, REVEAL_MAX_RATIO } from "@/lib/plateSwipe";

/**
 * بطاقة اللوحة في التشييك الصوتي بتعرض **رقم اللوحة بس** بخط كبير، وباقي
 * البيانات بتتخبّى ورا سحبة لليسار. المنطق هنا نقي عشان يتقاس: إمتى السحبة
 * أفقية (مش تمرير رأسي للقائمة)، وقد إيه البطاقة تتزحزح، وتقفل ولا تفتح لما
 * الصباع يسيب.
 */
describe("isHorizontalDrag — سحب أفقي مقابل تمرير رأسي", () => {
  it("الحركة الرأسية = تمرير القائمة، مش سحب", () => {
    expect(isHorizontalDrag(6, 40)).toBe(false);
    expect(isHorizontalDrag(-10, 30)).toBe(false);
  });

  it("الحركة الأفقية الواضحة = سحب", () => {
    expect(isHorizontalDrag(-40, 6)).toBe(true);
    expect(isHorizontalDrag(35, 4)).toBe(true);
  });

  it("الحركة الصغيرة جداً لسه مش سحب (عشان الضغطة العادية ماتفتحش)", () => {
    expect(isHorizontalDrag(-4, 1)).toBe(false);
    expect(isHorizontalDrag(0, 0)).toBe(false);
  });
});

describe("clampReveal — الإزاحة محدودة ومافيش سحب لليمين على المقفول", () => {
  const W = 300;
  const MAX = W * REVEAL_MAX_RATIO;

  it("السحب لليسار بيزحزح البطاقة بالسالب", () => {
    expect(clampReveal(-50, false, W)).toBeCloseTo(-50);
  });

  it("مايزيدش عن الحد الأقصى مهما سحب", () => {
    expect(clampReveal(-9999, false, W)).toBeCloseTo(-MAX);
  });

  it("البطاقة المقفولة ماتتسحبش لليمين (مافيش حاجة هناك)", () => {
    expect(clampReveal(80, false, W)).toBe(0);
  });

  it("البطاقة المفتوحة بتتقفل بالسحب لليمين", () => {
    expect(clampReveal(60, true, W)).toBeCloseTo(-MAX + 60);
  });

  it("المفتوحة ماتتسحبش أبعد من الحد لو كمّل يسار", () => {
    expect(clampReveal(-100, true, W)).toBeCloseTo(-MAX);
  });
});

describe("settleReveal — تفتح ولا تقفل لما يسيب الصباع", () => {
  const W = 300;
  const MAX = W * REVEAL_MAX_RATIO;

  it("عدّى نص المسافة → تفتح", () => {
    expect(settleReveal(-MAX * 0.6, W, 0, false)).toBe(true);
  });

  it("ماعدّاش نص المسافة → ترجع تقفل", () => {
    expect(settleReveal(-MAX * 0.2, W, 0, false)).toBe(false);
  });

  it("سحبة سريعة لليسار بتفتح حتى لو المسافة قصيرة (flick)", () => {
    expect(settleReveal(-MAX * 0.15, W, -1.2, false)).toBe(true);
  });

  it("سحبة سريعة لليمين بتقفل حتى لو لسه مفتوحة معظمها", () => {
    expect(settleReveal(-MAX * 0.8, W, 1.2, true)).toBe(false);
  });

  it("مفتوحة وسابها من غير حركة تُذكر → تفضل مفتوحة", () => {
    expect(settleReveal(-MAX, W, 0, true)).toBe(true);
  });
});

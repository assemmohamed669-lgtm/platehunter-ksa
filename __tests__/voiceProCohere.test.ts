/**
 * 🏷️ كوهير في «Voice PRO» تاني (المالك ٢٢ أكتوبر ٢٠٢٦): «ينفع كوهير مدام احنا حطيناه علي السيرفر نشغله مع صفحه فويس
 * برو … زي صفحه التسجيل المندوب لما يقول نوع سيارة زي نقل ونيت شاص دباب او ملاحظه زي مركونه مصدومه … تظهر».
 *
 * الكود موجود من أيام ماليزيا، والطريق (`type.qannas-ksa.com`) كان واقع. قبل ما يرجع:
 *  · 🔒 **السوبر أدمن بس** يسأل كوهير — من غير القفل، أول ما الطريق يرجع كل المناديب كانوا هيبعتوا صوت كل لوحة
 *    (نت الموبايل + حمل على نفس الكارت اللي بيطلّع لوحاتهم).
 *  · كلمات صفحة التسجيل اللي المالك قرّرها: «دكر»=دوكر · «تكس»=تاكسي · «ناقل»=نقل · «فاو» نوع · «باكيه» ملاحظة.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canAskTypeServer, VOICEPRO_TYPE_FOR_DELEGATES } from "@/lib/trialModelGate";
import { scanTypeAndNote } from "@/lib/vehicleTypeScan";

const PAGE = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8");

describe("🔒 مين يسأل كوهير من Voice PRO", () => {
  it("السوبر أدمن بس دلوقتي", () => {
    expect(VOICEPRO_TYPE_FOR_DELEGATES).toBe(false);
    expect(canAskTypeServer(true)).toBe(true);
    expect(canAskTypeServer(false)).toBe(false);
  });

  it("النداء نفسه مقفول على غيره (حتى لو الطريق شغّال) — والفحص كمان", () => {
    expect(PAGE).toMatch(/const askType = useCallback\(async \(wav: Blob, tMs: number[^)]*\) => \{[\s\S]{0,900}?if \(!canAskTypeServer\(isSuperRef\.current\)\) return;/);
    expect(PAGE).toMatch(/if \(canAskTypeServer\(isSuperRef\.current\)\) try \{\s*const r2 = await fetch\(TRIAL_TYPE_BASE/);
  });
});

/** نصوص كوهير الحقيقية (زي ما المجمّع سمعها) — اللوحة وبعدها الكلمة */
const say = (word: string) => scanTypeAndNote(`ا ط ق سته تلاته اتنين سته ${word}`, { afterPlate: "اطق6326" });

describe("🗣️ كلمات صفحة التسجيل في Voice PRO", () => {
  it("«دكر» = دوكر", () => expect(say("دكر").type).toBe("دوكر"));
  it("«تكس» = تاكسي", () => expect(say("تكس").type).toBe("تاكسي"));
  it("«ناقل» = نقل", () => expect(say("ناقل").type).toBe("نقل"));
  it("«مركون» = مركونه (ملاحظة)", () => expect(say("مركون").note).toBe("مركونه"));
  it("«فاو» نوع لوحده (مش فان)", () => expect(say("فاو").type).toBe("فاو"));
  it("«فان» لسه فان", () => expect(say("فان").type).toBe("فان"));
  it("«باكيه» ملاحظة", () => expect(say("باكيه").note).toBe("باكيه"));

  it("جملة حقيقية: «فاو مركون» على اللوحة التانية", () => {
    const r = scanTypeAndNote(" ح سين طاه واحد سبعة تمانية تسعة به راه راه أربعين سبعة واحد فاو مركون.", {
      afterPlate: "برر4071",
    });
    expect(r.type).toBe("فاو");
    expect(r.note).toBe("مركونه");
  });

  it("🔴 «الباقية» (كلام عادي) مابتطلعش «باكيه» — اتمسكت في المجمّع", () => {
    expect(say("الباقيه").note).not.toBe("باكيه");
    expect(say("باقيه").note).not.toBe("باكيه");
  });
});

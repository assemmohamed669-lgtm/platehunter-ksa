import { describe, it, expect } from "vitest";
import { createBusyHold } from "@/lib/busyHold";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  التحديث التلقائي مايقطعش التسجيل — «الميك مشغول» لحد آخر خطوة
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٢٣ سبتمبر ٢٠٢٦): «لما بنزّل تحديث بيتعمل تحديث تلقائي معايا وأنا
 *  مشغّل المايك وبقول لوحات، فبيفصل مني التسجيل. خلّي التحديث يتعمل بعد ما
 *  أقفل المسجّل».
 *
 *  «بعد ما أقفل» = بعد **آخر خطوة**، مش لحظة الضغط: المحرك بيستنى آخر نوافذ
 *  من السيرفر (آخر لوحات)، وبعدين سؤال التصدير، وبعدين التصدير نفسه. تحديث
 *  في النص = آخر لوحات أو تصدير نصّه اتعمل. فكل خطوة «بتمسك» لحد ما تخلص.
 */
describe("createBusyHold", () => {
  const track = () => {
    const seen: boolean[] = [];
    return { seen, hold: createBusyHold((b) => seen.push(b)) };
  };

  it("مسكة واحدة ⇒ مشغول، وسيبها ⇒ فاضي", () => {
    const { seen, hold } = track();
    const release = hold.hold();
    expect(seen.at(-1)).toBe(true);
    release();
    expect(seen.at(-1)).toBe(false);
  });

  it("🔴 التسجيل خلص بس التصدير لسه شغّال ⇒ لسه مشغول", () => {
    const { seen, hold } = track();
    const rec = hold.hold();
    const exp = hold.hold();
    rec();
    expect(seen.at(-1)).toBe(true);
    expect(hold.busy).toBe(true);
    exp();
    expect(seen.at(-1)).toBe(false);
    expect(hold.busy).toBe(false);
  });

  it("السيب مرتين مابيفكّش مسكة حد تاني", () => {
    const { hold } = track();
    const a = hold.hold();
    const b = hold.hold();
    a(); a();
    expect(hold.busy).toBe(true);
    b();
    expect(hold.busy).toBe(false);
  });

  it("المسح الكامل (الصفحة اتقفلت) ⇒ فاضي، والمسكات القديمة مابتأثرش بعده", () => {
    const { seen, hold } = track();
    const a = hold.hold();
    hold.reset();
    expect(seen.at(-1)).toBe(false);
    const b = hold.hold();
    a();                       // مسكة من قبل المسح
    expect(hold.busy).toBe(true);
    b();
    expect(hold.busy).toBe(false);
  });
});

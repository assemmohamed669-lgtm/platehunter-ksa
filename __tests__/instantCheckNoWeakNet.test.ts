import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 🔒 «صوتي» (`instant-check`) مابيبعتش وضع النت الضعيف أبداً.
 *
 * المالك (٣ أكتوبر ٢٠٢٦): «خلي ده مايحصلش غير في حالة النت الضعيف أوي فقط…
 * فدي تبقى في الضرورة القصوى فقط» — والوضع ده لـ«الجديد» للسوبر أدمن بس لحد ما
 * يجرّب. «صوتي» لازم يفضل على السلوك القديم بالحرف: الفشل الـ٨ ⇒ `onFatal` ⇒
 * رجوع لديبجرام. لو حد بعت `netResilience` هنا، المحرّك مابيقعش خالص
 * والرجوع لديبجرام مابيحصلش — فالحارس ده بيقفل الباب.
 */
const src = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8");

describe("🔒 «صوتي» مابيبعتش netResilience / onWeakNet", () => {
  it("الحارس بيقيس المكان الصح — الصفحة بتشغّل المحرّك وبتسمع لـonFatal", () => {
    expect(src).toMatch(/startVoicexEngine\(\{/);
    expect(src).toMatch(/onFatal: \(\) => \{/);
  });
  it("ولا netResilience ولا onWeakNet في أي مكان في الصفحة", () => {
    expect(src).not.toMatch(/netResilience/);
    expect(src).not.toMatch(/onWeakNet/);
  });
});

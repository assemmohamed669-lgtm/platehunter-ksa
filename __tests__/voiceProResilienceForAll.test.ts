/**
 * 📶🔌 «ليه كل شوي يجيب مع المناديب كدة (السيرفر فصل وسط التسجيل) ويبقي تقيل وماياخدش اللوحات» (المالك ١ نوفمبر ٢٠٢٦).
 *
 * الدليل (مراقبة احمد بهاء انيس ١٠:٤٦–١٠:٤٨): الموبايل «4g ومتوصّل» بس الطلبات بترجع timeout/network ⇒ النوافذ بتتشال
 * (busy_window — «تقيل وماياخدش اللوحات») ⇒ ٨ فشل ورا بعض ⇒ `tunnel_down` ⇒ «السيرفر فصل» والتسجيل بيقف. السيرفر سليم
 * (فحص كل دقيقة ٣٦٠/٣٦٠). ولما داس «ابدأ» تاني: فشل متأخر من الجلسة اللي فاتت قفل الجديدة بعد ١٫٧ث (حارس الجلسة كان
 * للسوبر أدمن بس).
 *
 * ⇒ اللي السوبر أدمن شغّال بيه من ٣ أكتوبر (`netResilience`) و١٥ أكتوبر (`outageResilience`) **للكل**: التسجيل بيكمّل
 * ويستنى، الشريط بيقول «النت ضعيف»/«السيرفر مش بيرد»، والفايت بيرجع لما النت يرجع؛ ٣ دقايق متواصلة بس ⇒ وقف بالسبب
 * الحقيقي. + حارس الجلسة للكل. «صوتي» (التشييك) مالمسناهاش.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VOICEPRO_RESILIENCE_FOR_ALL, fatalText } from "@/lib/voiceProSmooth";

const src = readFileSync(join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8").replace(/\r\n/g, "\n");
const instant = readFileSync(join(process.cwd(), "app/(app)/instant-check/page.tsx"), "utf8");
const startFn = src.slice(src.indexOf("async function start()"), src.indexOf("function stopTimer()"));

describe("للكل", () => {
  it("العلم مفتوح (الرجوع = false)", () => {
    expect(VOICEPRO_RESILIENCE_FOR_ALL).toBe(true);
  });

  it("الجلسة بتقرّر مرة واحدة: السوبر أدمن أو العلم", () => {
    expect(startFn).toMatch(/const resil = sup \|\| VOICEPRO_RESILIENCE_FOR_ALL;/);
    expect(startFn).toMatch(/const live = \(\) => !resil \|\| sessionRef\.current\.isCurrent\(sid\);/);
    expect(startFn).toMatch(/const outage = resil \? createOutageClock\(\) : null;/);
    expect(startFn).toMatch(/\.\.\.\(resil \? \{\s*netResilience: true,/);
    expect(startFn).toMatch(/\.\.\.\(resil \? \{\s*outageResilience: true,/);
    expect(startFn).toMatch(/setError\(fatalText\(reason, resil, code\)\);/);
  });

  it("شريط «النت ضعيف / السيرفر مش بيرد» بيظهر للمناديب كمان", () => {
    expect(src).toMatch(/const weakBanner = \(isSuper \|\| VOICEPRO_RESILIENCE_FOR_ALL\) \? weakNetBanner\(weakSince, Date\.now\(\), waitKind\) : null;/);
  });

  it("الوقف (بعد ٣ دقايق) بالسبب الحقيقي — مش «دوس أعِد الفحص» (زرار مش ظاهر للمناديب)", () => {
    expect(fatalText("net_lost", true)).toMatch(/النت مقطوع/);
    expect(fatalText("net_lost", true)).not.toMatch(/أعِد الفحص/);
  });

  it("«صوتي» (التشييك) زي ما هي", () => {
    expect(instant).not.toMatch(/netResilience|outageResilience|VOICEPRO_RESILIENCE_FOR_ALL/);
  });
});

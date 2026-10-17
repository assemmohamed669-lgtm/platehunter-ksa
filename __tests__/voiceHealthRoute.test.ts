import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 حارس الدقيقة في `/api/cron/voice-health` كان مابيشتغلش على Vercel (٣ أكتوبر
 * ٢٠٢٦): نداءين ورا بعض اتكتبوا الاتنين. Next 14 بيخزّن `fetch` بتاع GET في
 * Route Handler، فسؤال «آخر نبضة إمتى» كان بيرجع نفس الرد القديم (الجدول فاضي)
 * دايماً. `dynamic` لوحده ماكفاش — لازم `fetchCache` و`revalidate` صريحين.
 */
const src = readFileSync(join(__dirname, "..", "app", "api", "cron", "voice-health", "route.ts"), "utf8");

describe("🩺 /api/cron/voice-health — مابيتخزّنش", () => {
  it("كل fetch في المسار من غير كاش", () => {
    expect(src).toMatch(/export const fetchCache = "force-no-store";/);
    expect(src).toMatch(/export const revalidate = 0;/);
    expect(src).toMatch(/export const dynamic = "force-dynamic";/);
  });
});

/**
 * 🎙️ الفحص الحقيقي (٤ أكتوبر): بعد `/health`، مقطع اختبار على `/transcribe` بتوكن المناديب
 * (من `app_settings` بصلاحية الخدمة — مش مكتوب في الكود)، والنتيجة في نفس صف `voice_health`.
 */
describe("🎙️ /api/cron/voice-health — التفريغ الحقيقي", () => {
  it("بيجرّب التفريغ بالمقطع المعروف وتوكن المناديب، ويدمج النتيجة في الصف", () => {
    expect(src).toMatch(/probeVoiceTranscribe\(/);
    expect(src).toMatch(/voiceProbeClip\(\)/);
    expect(src).toMatch(/VOICE_PROBE_PLATE/);
    expect(src).toMatch(/TRIAL_MODEL_BASE \+ "\/transcribe"/);
    expect(src).toMatch(/from\("app_settings"\)\.select\("trial_token"\)/);
    expect(src).toMatch(/mergeHealth\(/);
    // التفريغ بس لو السيرفر صاحي (مافيش لازمة نبعت صوت لسيرفر واقع)
    expect(src.indexOf("probeVoiceTranscribe(")).toBeGreaterThan(src.indexOf("if (health.ok"));
  });

  it("مهلة الدالة كفاية للفحصين (Vercel Pro)", () => {
    expect(src).toMatch(/export const maxDuration = \d+;/);
  });

  it("التوكن عمره ما يتكتب في الرد ولا في الصف", () => {
    expect(src).not.toMatch(/token: token[,}]/);
    expect(src).not.toMatch(/json\([^)]*trial_token/);
  });
});

/**
 * 🗃️ «الصندوق الأسود» (١٧ أكتوبر): آخر سطر حالة إيطاليا بيتحفظ مع الفحص — **بالتوازي**
 * (مابيطوّلش النبضة) وبمهلة قصيرة، وأي فشل فيه مايلمسش نتيجة الفحص نفسه.
 */
describe("🗃️ /api/cron/voice-health — حالة الجهاز مع كل نبضة", () => {
  it("بتتجاب بالتوازي مع الفحص وبتتحط في detail.vitals", () => {
    expect(src).toMatch(/import \{ fetchServerVitals \} from "@\/lib\/serverVitals";/);
    expect(src).toMatch(/Promise\.all\(\[/);
    expect(src).toMatch(/fetchServerVitals\(\{ token, timeoutMs: 3000 \}\)/);
    expect(src).toMatch(/detail: \{ \.\.\.\(merged\.detail \?\? \{\}\), vitals \}/);
  });

  it("الفحص الأصلي زي ما هو: التفريغ بس لو السيرفر صاحي", () => {
    const chain = src.slice(src.indexOf("const probe = (async"), src.indexOf("})();", src.indexOf("const probe = (async")));
    expect(chain).toMatch(/if \(health\.ok\)/);
    expect(chain.indexOf("probeVoiceTranscribe(")).toBeGreaterThan(chain.indexOf("if (health.ok"));
  });
});

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

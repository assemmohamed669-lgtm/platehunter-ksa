import { describe, it, expect } from "vitest";
import { BANNER_POLL_MS, dailyPollRequests } from "@/lib/pollRate";

// درس حادثة ٢٠٢٦-٠٩-٠٦: البق اللي وقّع الداتابيز كان اختباره ناجح، لأن الاختبار
// كان بيقيس **قرار واحد معزول** والمشكلة مكانتش موجودة إلا في **المعدّل التراكمي**.
// فأي حاجة بتتكرر لوحدها في التطبيق لازم يكون عليها اختبار بيحسب حملها اليومي.
describe("dailyPollRequests — حمل أي حلقة تكرار على الداتابيز", () => {
  it("بيحسب الطلبات اليومية صح", () => {
    // كل دقيقة، مندوب واحد، ساعة واحدة، طلب واحد = ٦٠ طلب
    expect(dailyPollRequests(60_000, 1, 1, 1)).toBe(60);
    // كل ٥ دقايق نفس الشروط = ١٢ طلب
    expect(dailyPollRequests(300_000, 1, 1, 1)).toBe(12);
  });

  it("بيتعامل مع مدخلات فاضية من غير ما يرمي", () => {
    expect(dailyPollRequests(0, 25, 10, 2)).toBe(0);
    expect(dailyPollRequests(60_000, 0, 10, 2)).toBe(0);
  });

  // 🐞 بانر رسالة الأدمن وبانر الاستطلاع كانوا بيسألوا **كل دقيقة في كل صفحة**:
  // ٢ × ٦٠ × ٢٥ مندوب × ١٠ ساعات = ٣٠ ألف طلب/يوم من غير أي فايدة تُذكر —
  // تاني أكبر مصدر حمل بعد تحديث الموقع.
  it("🐞 البانرين مع بعض تحت ميزانية ١٠ آلاف طلب/يوم", () => {
    const AGENTS = 25, HOURS_OPEN = 10, BANNERS = 2;
    const perDay = dailyPollRequests(BANNER_POLL_MS, AGENTS, HOURS_OPEN, BANNERS);
    expect(perDay).toBeLessThanOrEqual(10_000);        // على دقيقة كان ٣٠ ألف
  });

  it("فاصل البانر ٥ دقايق على الأقل", () => {
    expect(BANNER_POLL_MS).toBeGreaterThanOrEqual(300_000);
  });
});

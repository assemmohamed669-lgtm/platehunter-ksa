import { describe, it, expect, beforeEach } from "vitest";
import { loadTrialAutoExport, saveTrialAutoExport, TRIAL_AUTO_EXPORT_KEY } from "@/lib/trialAutoExport";

/**
 * التصدير التلقائي في Voice PRO كان **مقفول افتراضياً** و**مش بيتحفظ** أصلاً
 * (`useState(false)` وخلاص) — يعني حتى المندوب اللي فعّله، بيرجع مقفول أول ما
 * يفتح الصفحة تاني. فعملياً كان مقفول عند الكل طول الوقت.
 *
 * ونتيجته ظهرت يوم ١٢ أكتوبر: مندوب قفل التسجيل من غير تصدير وضاعت لوحاته
 * بالكامل (مفيش نسخة لا على الجهاز ولا السيرفر ولا في الصوت).
 *
 * فبقى: **مفتوح افتراضياً**، و**بيتحفظ** لما المندوب يقفله بإيده.
 */
describe("تصدير Voice PRO التلقائي", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

  it("🔴 مندوب جديد (مافيش قيمة محفوظة) → **مفتوح**", () => {
    expect(loadTrialAutoExport()).toBe(true);
  });

  it("قفله المندوب بإيده → بيفضل مقفول بعد إعادة الفتح", () => {
    saveTrialAutoExport(false);
    expect(loadTrialAutoExport()).toBe(false);
  });

  it("فتحه تاني → بيفضل مفتوح", () => {
    saveTrialAutoExport(false);
    saveTrialAutoExport(true);
    expect(loadTrialAutoExport()).toBe(true);
  });

  it("قيمة بايظة في التخزين → بيرجع للافتراضي (مفتوح) مش بيقع", () => {
    localStorage.setItem(TRIAL_AUTO_EXPORT_KEY, "مش قيمة صح");
    expect(loadTrialAutoExport()).toBe(true);
  });

  it("مفتاحه منفصل عن تصدير صفحة التشييك — الصفحتان مستقلتان", () => {
    expect(TRIAL_AUTO_EXPORT_KEY).not.toBe("ic-auto-export");
    expect(TRIAL_AUTO_EXPORT_KEY).toContain("rv2");
  });
});

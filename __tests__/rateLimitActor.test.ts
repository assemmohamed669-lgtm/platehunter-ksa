import { describe, it, expect } from "vitest";
import { agentIdFromKey } from "@/lib/rateLimitKey";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  🪪 «تعدّى حد الاستهلاك» — مين المندوب؟
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٧ أكتوبر ٢٠٢٦) وهو بيقرا سجل الأمان: «تعدّى حد الاستهلاك — الفاعل:
 *  —». السطر كان بيسجّل الـIP بس، فمفيش طريقة تعرف مين المندوب اللي اتوقف ولا
 *  تكلّمه.
 *
 *  مفتاح الحد أصلاً شكله `<الخدمة>:<رقم المندوب>` في كل المسارات، فبنستخرج
 *  الرقم منه بدل ما نغيّر ١٦ مكان — وصفحة الأمان بتحوّله لاسم لوحدها.
 *
 *  ⚠️ مسار واحد بيستعمل الـIP مفتاح (`/c/[token]` — لينك عام بلا تسجيل دخول).
 *     لازم يفضل بلا فاعل بدل ما نسجّل IP في خانة المندوب.
 */
const UUID = "3f2a9c41-5b7d-4e8a-9c10-2d6f8b4a1e73";

describe("استخراج المندوب من مفتاح الحد", () => {
  it("مفتاح فيه رقم مندوب ⇒ بيرجّعه", () => {
    expect(agentIdFromKey(`certb:${UUID}`)).toBe(UUID);
    expect(agentIdFromKey(`transcribe:${UUID}`)).toBe(UUID);
    expect(agentIdFromKey(`cert-dl:${UUID}`)).toBe(UUID);
  });

  it("حروف كبيرة ⇒ مقبولة", () => {
    expect(agentIdFromKey(`certb:${UUID.toUpperCase()}`)).toBe(UUID.toUpperCase());
  });

  it("🔒 مفتاح بـIP (اللينك العام) ⇒ مافيش فاعل — مانحطّش IP مكان المندوب", () => {
    expect(agentIdFromKey("cert-link:176.19.70.183")).toBeNull();
    expect(agentIdFromKey("cert-link:?")).toBeNull();
  });

  it("أشكال غريبة ⇒ null من غير ما ترمي", () => {
    expect(agentIdFromKey("بلا-نقطتين")).toBeNull();
    expect(agentIdFromKey("")).toBeNull();
    expect(agentIdFromKey("certb:")).toBeNull();
    expect(agentIdFromKey("certb:not-a-uuid")).toBeNull();
    expect(agentIdFromKey(`certb:${UUID}:extra`)).toBeNull();
  });

  it("الخدمة نفسها فيها شرطة ⇒ لسه بيشتغل (أول نقطتين بس)", () => {
    expect(agentIdFromKey(`cert-daily:${UUID}`)).toBe(UUID);
    expect(agentIdFromKey(`drivehealth:${UUID}`)).toBe(UUID);
  });
});

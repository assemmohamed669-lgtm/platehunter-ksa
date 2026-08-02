// @vitest-environment jsdom
/**
 * الباج الميداني: «متوصّل» ظاهرة والخدمة مستلمة **صفر** طلبات.
 * =============================================================================
 * دفتر التشغيل بيقول للمالك يتأكّد من النفق كده (docs/pilot-runbook.md:166):
 *     افتح في متصفّح التليفون  https://random-1234.trycloudflare.com/ping
 * فلمّا يلزق العنوان في مربّع الإعداد، أقرب حاجة للصقها هي **اللي في شريط
 * العنوان** — يعني الأساس بيتحفظ وفيه `/ping`. النتيجة:
 *
 *   transcribeUrl = "https://…/ping/transcribe"
 *   والخدمة: `do_POST` بيقارن المسار بـ"/transcribe" بالحرف
 *   (serving/plate_server.py:745-747) ⇒ **٤٠٤**، و٤٠٤ بيرجع **قبل** أي تسجيل:
 *   مافيش `_audit` (بيتنادى للـ٥٠٣/٤٠٠/٥٠٠ بس)، مافيش `bump("n_total")`
 *   (بيحصل بعد التوثيق في :753)، و`log_message` مسكّتة (:555-557).
 *   ⇒ لا سطر في JSONL، لا مقطع محفوظ، لا سطر في الكونسول، ولا عدّاد في /health.
 *   ودي بالظبط الأعراض: «الخدمة مستلمة صفر طلبات».
 *
 * والعنوان **بيعدّي** التحقّق الحالي (https · بلا استعلام · بلا fragment) فالمربّع
 * بيكتب «متوصّل» بثقة كاملة. العلاج: نشيل نقطة النهاية المعروفة من الأساس وقت
 * التطبيع — الحاجة الوحيدة اللي المالك ممكن يلزقها من غلط، ومافيش أي أساس شرعي
 * ينتهي بـ`/ping` أو `/health` أو `/transcribe`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { normalizeJudgeBase, readJudgeEndpoint, saveJudgeEndpoint, LS_JUDGE_URL, LS_JUDGE_TOKEN } from "@/lib/plateJudgeGate";

const GOOD_TOKEN = "s3cr3t-token-xyz";

describe("normalizeJudgeBase — لزق العنوان اللي اختبرته في المتصفّح مايوقعش الطيّار", () => {
  it("بيشيل /ping (اللي دفتر التشغيل نفسه بيطلب تفتحه)", () => {
    expect(normalizeJudgeBase("https://random-1234.trycloudflare.com/ping"))
      .toBe("https://random-1234.trycloudflare.com");
  });

  it("بيشيل /ping بشرطة أخيرة، وبحروف كبيرة", () => {
    expect(normalizeJudgeBase("https://x.trycloudflare.com/ping/")).toBe("https://x.trycloudflare.com");
    expect(normalizeJudgeBase("https://x.trycloudflare.com/PING")).toBe("https://x.trycloudflare.com");
  });

  it("بيشيل /health و/transcribe كمان (نفس الغلطة)", () => {
    expect(normalizeJudgeBase("https://x.trycloudflare.com/health")).toBe("https://x.trycloudflare.com");
    expect(normalizeJudgeBase("https://x.trycloudflare.com/transcribe")).toBe("https://x.trycloudflare.com");
  });

  it("بيشيلها كمان لو تحت مسار فرعي شرعي", () => {
    expect(normalizeJudgeBase("https://tunnel.example.com/judge/ping"))
      .toBe("https://tunnel.example.com/judge");
  });

  it("مايلمسش أي مسار تاني — التضييق على النقاط المعروفة بس", () => {
    expect(normalizeJudgeBase("https://tunnel.example.com/judge")).toBe("https://tunnel.example.com/judge");
    expect(normalizeJudgeBase("https://tunnel.example.com/pingpong")).toBe("https://tunnel.example.com/pingpong");
    expect(normalizeJudgeBase("https://tunnel.example.com/ping/deep")).toBe("https://tunnel.example.com/ping/deep");
    expect(normalizeJudgeBase("https://ping.example.com")).toBe("https://ping.example.com");
  });

  it("باقي قواعد التحقّق زي ما هي (https · بلا استعلام · بلا fragment)", () => {
    expect(normalizeJudgeBase("http://x.trycloudflare.com/ping")).toBeNull();
    expect(normalizeJudgeBase("https://x.trycloudflare.com/ping?a=1")).toBeNull();
    expect(normalizeJudgeBase("https://x.trycloudflare.com/ping#f")).toBeNull();
    expect(normalizeJudgeBase("http://localhost:8756/ping")).toBe("http://localhost:8756");
  });
});

describe("المسار الكامل بعد العلاج", () => {
  beforeEach(() => localStorage.clear());

  it("لزق عنوان الـ/ping بيوصّل الطلب لـ/transcribe الصح", () => {
    expect(saveJudgeEndpoint("https://random-1234.trycloudflare.com/ping", GOOD_TOKEN)).toBe(true);
    expect(localStorage.getItem(LS_JUDGE_URL)).toBe("https://random-1234.trycloudflare.com");
    expect(readJudgeEndpoint()?.transcribeUrl).toBe("https://random-1234.trycloudflare.com/transcribe");
  });

  it("إعداد قديم متسمّم في التخزين بيتصلّح وقت القراءة كمان", () => {
    localStorage.setItem(LS_JUDGE_URL, "https://old-tunnel.trycloudflare.com/ping");
    localStorage.setItem(LS_JUDGE_TOKEN, GOOD_TOKEN);
    expect(readJudgeEndpoint()?.transcribeUrl).toBe("https://old-tunnel.trycloudflare.com/transcribe");
  });
});

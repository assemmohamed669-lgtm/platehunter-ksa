import { describe, it, expect } from "vitest";
import { planVoicexAdmission } from "../lib/voicexAdmission";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  قبول نوافذ VoiceX — «بيقف ومش بياخد لوحات»
 * ══════════════════════════════════════════════════════════════════════
 *  شكوى المناديب (٢٢ سبتمبر ٢٠٢٦): «بيقف ومش بيستجيب ولا بياخد لوحات،
 *  وأوقات يشتغل تمام». السبب في `lib/voicexEngine.ts`:
 *
 *      if (inflight >= MAX_INFLIGHT) return;        // :169 — النافذة الزاحفة
 *      … && inflight < MAX_INFLIGHT) sliceAndSend() // :109 — **قراءة النطق**
 *
 *  الاتنين **رمي صامت**: مافيش طابور ولا إعادة محاولة ولا أثر في الواجهة.
 *
 *  🔴 والفرق بين القراءتين جوهري:
 *    · **النافذة الزاحفة** (كل ١.٥ث على آخر ٥ث) — **فايضة بالتصميم**، النوافذ
 *      متداخلة فرميها بيأخّر مش بيضيّع.
 *    · **قراءة النطق الكامل** (`onUtterance`) — **مش فايضة**. التعليق في الكود
 *      نفسه بيقول إنها «بتدّي اللوحة كلها مرة واحدة مهما كان الإيقاع».
 *      رميها = **لوحة ضايعة**.
 *
 *  فالقاعدة: قراءة النطق **ماتترميش أبداً** — تستنى دورها. والنافذة الزاحفة
 *  هي اللي تتنازل.
 *
 *  ⚠️ **وممنوع نرفع السقف كحل.** مقيس في الكود: أي رد مش ٢٠٠ بيرجّع `null`
 *  (`plateJudgeClient.ts:993`) والمحرّك بيحسبه فشل نفق (`voicexEngine.ts:126`)،
 *  وبعد ٨ متتالية بيرجع لديبجرام **في صمت**. وسيرفر الموديل افتراضيه
 *  `--max-inflight 2` (`serving/seg_server.py:891`) و**مابيعلنش السقف في
 *  `/health`** — فرفع رقم العميل فوق سقف السيرفر بيولّد ٥٠٣ ⇒ رجوع كاذب.
 *  ⇒ الإصلاح لازم يبقى **بصفر حمل زيادة**: نفس السقف، ترتيب أولويات مختلف.
 */

describe("planVoicexAdmission — قراءة النطق ماتترميش", () => {
  const base = { inflight: 0, maxInflight: 2, utteranceQueued: false };

  describe("قراءة النطق الكامل", () => {
    it("تمشي فوراً لو فيه مكان", () => {
      expect(planVoicexAdmission({ ...base, source: "utterance", inflight: 0 })).toBe("send");
      expect(planVoicexAdmission({ ...base, source: "utterance", inflight: 1 })).toBe("send");
    });

    it("🔴 **تستنى** لما السقف يتقفل — عمرها ما تترمى", () => {
      expect(planVoicexAdmission({ ...base, source: "utterance", inflight: 2 })).toBe("queue");
      expect(planVoicexAdmission({ ...base, source: "utterance", inflight: 9 })).toBe("queue");
    });

    it("مافيش أي مدخل بيرجّع skip لقراءة نطق", () => {
      for (const inflight of [0, 1, 2, 3, 8]) {
        for (const utteranceQueued of [false, true]) {
          for (const maxInflight of [1, 2, 4, 8]) {
            expect(
              planVoicexAdmission({ source: "utterance", inflight, maxInflight, utteranceQueued })
            ).not.toBe("skip");
          }
        }
      }
    });
  });

  describe("النافذة الزاحفة", () => {
    it("تمشي لو فيه مكان ومافيش نطق مستني", () => {
      expect(planVoicexAdmission({ ...base, source: "window", inflight: 0 })).toBe("send");
      expect(planVoicexAdmission({ ...base, source: "window", inflight: 1 })).toBe("send");
    });

    it("تتخطّى لما السقف يتقفل (فايضة بالتصميم)", () => {
      expect(planVoicexAdmission({ ...base, source: "window", inflight: 2 })).toBe("skip");
    });

    it("🔴 **تتنازل** لو فيه قراءة نطق مستنية — حتى لو فيه مكان", () => {
      expect(
        planVoicexAdmission({ ...base, source: "window", inflight: 0, utteranceQueued: true })
      ).toBe("skip");
      expect(
        planVoicexAdmission({ ...base, source: "window", inflight: 1, utteranceQueued: true })
      ).toBe("skip");
    });

    it("عمرها ما تترجّع queue — الطابور لقراءة النطق بس", () => {
      for (const inflight of [0, 1, 2, 3, 8]) {
        expect(
          planVoicexAdmission({ ...base, source: "window", inflight })
        ).not.toBe("queue");
      }
    });
  });

  describe("السقف نفسه", () => {
    it("بيحترم سقف أعلى لو السيرفر سمح بيه", () => {
      expect(planVoicexAdmission({ ...base, source: "window", inflight: 3, maxInflight: 4 })).toBe("send");
      expect(planVoicexAdmission({ ...base, source: "window", inflight: 4, maxInflight: 4 })).toBe("skip");
    });

    it("سقف بايظ (صفر/سالب/NaN) بيتعامل كـ١ — مش كـ‏صفر يقفل كل حاجة", () => {
      for (const bad of [0, -3, NaN, Infinity]) {
        expect(
          planVoicexAdmission({ ...base, source: "window", inflight: 0, maxInflight: bad })
        ).toBe("send");
        expect(
          planVoicexAdmission({ ...base, source: "window", inflight: 1, maxInflight: bad })
        ).toBe("skip");
      }
    });

    it("مدخلات بايظة في inflight ماتقفلش قراءة النطق", () => {
      for (const bad of [NaN, -1, Infinity]) {
        expect(
          planVoicexAdmission({ ...base, source: "utterance", inflight: bad })
        ).not.toBe("skip");
      }
    });
  });
});

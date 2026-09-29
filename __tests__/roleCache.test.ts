import { describe, it, expect } from "vitest";
import {
  encodeRoleCache, decodeRoleCache, ROLE_CACHE_MAX_AGE_MS,
} from "@/lib/roleCache";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  زرار «الأدمن» كان بياخد وقت يظهر
 * ══════════════════════════════════════════════════════════════════════
 *  بلاغ المالك (٢٩ سبتمبر ٢٠٢٦): «فيه لاج في ظهور كلمة أدمن اللي بدخل من
 *  خلالها على صفحة المشتركين».
 *
 *  السبب: الشريط العلوي كان مستني **نداءين للسيرفر ورا بعض** — واحد يسأل مين
 *  الداخل (بيروح للنت مع إن الجواب على الجهاز)، وبعده واحد يسأل هو أدمن ولا
 *  لأ. وكل ده بيتعاد من أول وجديد كل مرة يفتح البرنامج.
 *
 *  الحل: نفتكر الدور على الجهاز فيظهر الزرار من أول لحظة، والسيرفر يأكّد بعدها.
 *
 *  🔒 شرط الأمان: الذاكرة دي **مربوطة بصاحبها**. جهاز عليه مندوبين، أو أدمن
 *  خرج ومندوب دخل مكانه — لازم الزرار **مايظهرش** للتاني. والزرار اختصار بس؛
 *  الدخول الفعلي محميّ بحارس صفحة الأدمن وقواعد الداتابيز.
 */
const NOW = 1_700_000_000_000;

describe("ذاكرة الدور — بتسرّع الزرار من غير ما تكسر الأمان", () => {
  it("نفس المستخدم ⇒ بترجّع دوره", () => {
    const raw = encodeRoleCache("user-a", "admin", NOW);
    expect(decodeRoleCache(raw, "user-a", NOW)).toBe("admin");
  });

  it("🔒 مستخدم تاني على نفس الجهاز ⇒ مابترجّعش حاجة", () => {
    const raw = encodeRoleCache("user-a", "admin", NOW);
    expect(decodeRoleCache(raw, "user-b", NOW)).toBeNull();
  });

  it("مفيش ذاكرة ⇒ null (أول مرة يفتح)", () => {
    expect(decodeRoleCache(null, "user-a", NOW)).toBeNull();
  });

  it("ذاكرة بايظة/مش JSON ⇒ null من غير ما ترمي", () => {
    expect(decodeRoleCache("{ مش json", "user-a", NOW)).toBeNull();
    expect(decodeRoleCache("[]", "user-a", NOW)).toBeNull();
    expect(decodeRoleCache('{"userId":"user-a"}', "user-a", NOW)).toBeNull();
  });

  it("قديمة أوي ⇒ null (مانعتمدش على دور عمره أسابيع)", () => {
    const raw = encodeRoleCache("user-a", "admin", NOW);
    expect(decodeRoleCache(raw, "user-a", NOW + ROLE_CACHE_MAX_AGE_MS + 1)).toBeNull();
    expect(decodeRoleCache(raw, "user-a", NOW + ROLE_CACHE_MAX_AGE_MS - 1)).toBe("admin");
  });

  it("ساعة الجهاز رجعت لورا ⇒ لسه صالحة (مش بنعاقب المندوب على ساعته)", () => {
    const raw = encodeRoleCache("user-a", "admin", NOW);
    expect(decodeRoleCache(raw, "user-a", NOW - 60_000)).toBe("admin");
  });

  it("مندوب عادي ⇒ بترجّع agent، فالزرار يفضل مخفي", () => {
    const raw = encodeRoleCache("user-a", "agent", NOW);
    expect(decodeRoleCache(raw, "user-a", NOW)).toBe("agent");
  });
});

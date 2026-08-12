import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveNotice, noticeKey, isNoticeDismissed, dismissNotice, clearNoticeDismissals,
  NOTICE_DURATIONS, DISMISS_KEY, adminWhatsappLink,
} from "@/lib/appNotice";

/**
 * رسالة الأدمن المؤقتة — بتظهر في شريط البرنامج لكل المناديب في أي صفحة.
 * الأدمن بيحدد مدتها (يوم/يومين/…)، وبتختفي لوحدها لما المدة تخلص أو لما
 * يشيلها بنفسه. المندوب يقفلها بـ✕ وترجع تظهرله **في أول تسجيل دخول جديد**
 * طول ما هي لسه سارية.
 */

const NOW = new Date("2026-08-10T12:00:00.000Z").getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3600_000;

beforeEach(() => { localStorage.clear(); });

describe("resolveNotice — إمتى الرسالة تعتبر سارية", () => {
  it("رسالة جوّه مدتها بترجع", () => {
    const n = resolveNotice({ notice_text: "اجتماع الساعة ٥", notice_at: iso(NOW), notice_until: iso(NOW + 24 * HOUR) }, NOW);
    expect(n?.text).toBe("اجتماع الساعة ٥");
  });

  it("رسالة خلصت مدتها مابترجعش", () => {
    expect(resolveNotice({ notice_text: "قديمة", notice_at: iso(NOW - 48 * HOUR), notice_until: iso(NOW - HOUR) }, NOW)).toBeNull();
  });

  it("رسالة من غير مدة بتفضل سارية (لحد ما الأدمن يشيلها)", () => {
    const n = resolveNotice({ notice_text: "تنبيه دائم", notice_at: iso(NOW - 100 * HOUR), notice_until: null }, NOW);
    expect(n?.text).toBe("تنبيه دائم");
  });

  it("مفيش رسالة → null", () => {
    expect(resolveNotice(null, NOW)).toBeNull();
    expect(resolveNotice({ notice_text: "", notice_at: null, notice_until: null }, NOW)).toBeNull();
    expect(resolveNotice({ notice_text: "   ", notice_at: null, notice_until: null }, NOW)).toBeNull();
  });

  it("بيقبل صف جاي كمصفوفة (شكل رد Supabase)", () => {
    const n = resolveNotice([{ notice_text: "من مصفوفة", notice_at: iso(NOW), notice_until: null }], NOW);
    expect(n?.text).toBe("من مصفوفة");
  });

  it("المسافات الزيادة بتتشال من النص", () => {
    expect(resolveNotice({ notice_text: "  رسالة  ", notice_at: null, notice_until: null }, NOW)?.text).toBe("رسالة");
  });
});

describe("الإغلاق بـ✕ — يخفيها للجلسة دي بس", () => {
  const notice = { text: "اجتماع", at: iso(NOW), until: null, wa: false };

  it("قبل الإغلاق بتظهر", () => {
    expect(isNoticeDismissed(noticeKey(notice))).toBe(false);
  });

  it("بعد الإغلاق مابتظهرش", () => {
    dismissNotice(noticeKey(notice));
    expect(isNoticeDismissed(noticeKey(notice))).toBe(true);
  });

  it("تسجيل دخول جديد بيرجّعها تظهر", () => {
    dismissNotice(noticeKey(notice));
    clearNoticeDismissals();                       // بتتنده وقت تسجيل الدخول
    expect(isNoticeDismissed(noticeKey(notice))).toBe(false);
  });

  it("رسالة **جديدة** بتظهر حتى لو المندوب قفل اللي قبلها", () => {
    dismissNotice(noticeKey(notice));
    const newer = { text: "تنبيه تاني", at: iso(NOW + HOUR), until: null, wa: false };
    expect(isNoticeDismissed(noticeKey(newer))).toBe(false);
  });

  it("تعديل نص نفس الرسالة بيخليها تظهر تاني", () => {
    dismissNotice(noticeKey(notice));
    expect(isNoticeDismissed(noticeKey({ ...notice, text: "اجتماع الساعة ٦" }))).toBe(false);
  });

  it("التخزين المعطّل مايكسرش حاجة", () => {
    const orig = localStorage.setItem;
    localStorage.setItem = () => { throw new Error("denied"); };   // محاكاة تخزين ممنوع
    expect(() => dismissNotice("k")).not.toThrow();
    localStorage.setItem = orig;
  });

  it("المفتاح المستخدم في التخزين ثابت ومعروف", () => {
    dismissNotice("abc");
    expect(localStorage.getItem(DISMISS_KEY)).toContain("abc");
  });
});

describe("مدد الظهور المتاحة للأدمن", () => {
  it("فيها يوم ويومين وخيار بلا مدة", () => {
    const hours = NOTICE_DURATIONS.map((d) => d.hours);
    expect(hours).toContain(24);
    expect(hours).toContain(48);
    expect(hours).toContain(0);          // 0 = من غير مدة
  });

  it("كل خيار ليه اسم عربي واضح", () => {
    for (const d of NOTICE_DURATIONS) expect(d.label.trim().length).toBeGreaterThan(0);
  });
});

describe("زر الواتساب مع الرسالة", () => {
  it("الرسالة اللي الأدمن علّم عليها بيبقى معاها زر واتساب", () => {
    const n = resolveNotice({ notice_text: "عرض جديد", notice_at: null, notice_until: null, notice_wa: true }, NOW);
    expect(n?.wa).toBe(true);
  });

  it("الرسالة العادية من غير زر", () => {
    const n = resolveNotice({ notice_text: "تنبيه", notice_at: null, notice_until: null, notice_wa: false }, NOW);
    expect(n?.wa).toBe(false);
  });

  it("الرسائل القديمة (قبل الميزة) بتتعامل كأنها من غير زر", () => {
    const n = resolveNotice({ notice_text: "قديمة", notice_at: null, notice_until: null }, NOW);
    expect(n?.wa).toBe(false);
  });

  it("رابط الواتساب بيتبنى من الرقم صح", () => {
    expect(adminWhatsappLink("عرض جديد")).toContain("wa.me/971542482545");
    expect(adminWhatsappLink("عرض جديد")).toContain(encodeURIComponent("عرض جديد"));
  });

  it("رابط الواتساب من غير نص بيشتغل برضه", () => {
    expect(adminWhatsappLink("")).toBe("https://wa.me/971542482545");
  });

  it("تغيير زر الواتساب لوحده بيخلي الرسالة تظهر تاني", () => {
    const off = { text: "عرض", at: iso(NOW), until: null, wa: false };
    dismissNotice(noticeKey(off));
    expect(isNoticeDismissed(noticeKey({ ...off, wa: true }))).toBe(false);
  });
});

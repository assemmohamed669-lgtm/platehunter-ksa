/**
 * 📍 **الموقع جاهز ولا لأ — قبل ما يسجّل** (١٩ أكتوبر ٢٠٢٦).
 *
 * لوحة المالك اتفرّغت من غير موقع: داس «بدء التسجيل» على طول بعد ما فتح، وفي الـ٥ث بتوع المقطع
 * مافيش ولا قراءة جديدة وصلت — بس القراءة القديمة اللي كانت مخزّنة. والتحذير الصغير كان بيطلع
 * **بعد** ما بدأ. دلوقتي: علامة جنب الزرار طول الوقت — حمرا «📍 بيجيب الموقع…» لحد ما قراءة **حيّة**
 * دقيقة توصل، وبعدين خضرا «📍 الموقع جاهز ±Xم» — وتحذير كبير لو داس تسجيل وهي لسه حمرا.
 */
import { describe, expect, it } from "vitest";
import { GPS_READY_FRESH_MS, gpsReadiness, gpsStartWarning } from "../gps";

const NOW = 1_790_000_000_000;
const fix = (accuracy = 8, at = NOW - 500) => ({ lat: 24.7, lng: 46.7, accuracy, at });

describe("gpsReadiness — العلامة اللي جنب زرار التسجيل", () => {
  it("قراءة حيّة دقيقة وصلت دلوقتي ⇒ أخضر «الموقع جاهز ±Xم»", () => {
    const r = gpsReadiness(fix(7.6), NOW - 400, NOW, "active");
    expect(r.state).toBe("ready");
    expect(r.label).toBe("📍 الموقع جاهز ±8م");
  });

  it("لحد ١٠٠م جاهز برضه (نفس حد دبوس اللوحة)", () => {
    expect(gpsReadiness(fix(95), NOW - 400, NOW, "active").state).toBe("ready");
  });

  it("مافيش قراءة خالص ⇒ أحمر «بيجيب الموقع…»", () => {
    const r = gpsReadiness(null, null, NOW, "requesting");
    expect(r.state).toBe("waiting");
    expect(r.label).toBe("📍 بيجيب الموقع…");
  });

  it("🔴 زي لوحة المالك: القراءة القديمة المخزّنة بس (وقت وصولها مش معروف) ⇒ لسه مش جاهز", () => {
    expect(gpsReadiness(fix(8, NOW - 40_000), null, NOW, "active").state).toBe("waiting");
  });

  it(`آخر قراءة حيّة من أكتر من ${GPS_READY_FRESH_MS / 1000}ث ⇒ مش جاهز (الموقع وقف)`, () => {
    expect(gpsReadiness(fix(), NOW - GPS_READY_FRESH_MS, NOW, "active").state).toBe("ready");
    expect(gpsReadiness(fix(), NOW - GPS_READY_FRESH_MS - 1, NOW, "active").state).toBe("waiting");
  });

  it("دقة أوحش من ١٠٠م ⇒ «ضعيف» بالأمتار", () => {
    const r = gpsReadiness(fix(240), NOW - 400, NOW, "active");
    expect(r.state).toBe("weak");
    expect(r.label).toBe("📍 الموقع ضعيف ±240م — اطلع لمكان مكشوف");
  });

  it("الإذن مرفوض / الموقع مقفول من الموبايل ⇒ «مقفول»", () => {
    expect(gpsReadiness(null, null, NOW, "denied")).toMatchObject({ state: "off", label: "📍 الموقع مقفول — افتح إذن الموقع للتطبيق" });
    expect(gpsReadiness(null, null, NOW, "unavailable").state).toBe("off");
  });
});

describe("gpsStartWarning — التحذير الكبير لو داس تسجيل والموقع مش جاهز", () => {
  it("جاهز ⇒ مافيش تحذير", () => {
    expect(gpsStartWarning(gpsReadiness(fix(), NOW - 400, NOW, "active"))).toBeNull();
  });

  it("مش جاهز ⇒ تحذير بيقوله يستنى العلامة الخضرا قبل ما يقول اللوحات", () => {
    const w = gpsStartWarning(gpsReadiness(null, null, NOW, "requesting"))!;
    expect(w).toMatch(/الموقع لسه مش جاهز/);
    expect(w).toMatch(/من غير موقع/);
    expect(w).toMatch(/الموقع جاهز/);
  });

  it("ضعيف ⇒ يطلع لمكان مكشوف", () => {
    expect(gpsStartWarning(gpsReadiness(fix(240), NOW - 400, NOW, "active"))).toMatch(/240م.*مكان مكشوف/);
  });

  it("مقفول ⇒ يفتح الإذن", () => {
    expect(gpsStartWarning(gpsReadiness(null, null, NOW, "denied"))).toMatch(/إذن الموقع/);
  });
});

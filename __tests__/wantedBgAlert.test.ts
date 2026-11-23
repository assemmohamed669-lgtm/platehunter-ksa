/**
 * 🚨 العربية المطلوبة والمندوب **برّه البرنامج** (واتساب/الخريطة) — Voice PRO، أندرويد 1.8 + آيفون 1.4 (المالك ٢٣ نوفمبر ٢٠٢٦):
 * «لما بيبقي فيها لوحه مطلوبه مش بيظهر معاه وهو خارج البرنامج صوت التنبيه … عايز يظهر معاه اشعار برقم اللوحه وبيانات
 * السيارة ويدي تنبيه صوت عالي حسب ماهو مختار نغمه التنبيه».
 * السبب: «مطلوبة» ⇒ `stop("wanted")` ⇒ `stopBackgroundRecording()` ⇒ الموبايل بينيّم البرنامج والصفّارة بتسكت (الآيفون:
 * `siren-2s ctx=interrupted`)، ومفيش إشعار خالص.
 */
import { describe, expect, it, vi } from "vitest";
import {
  WANTED_BG_ALERT_FOR_ALL,
  WANTED_BG_HOLD_MAX_MS,
  WANTED_SELF_PUSH_URL,
  WantedBgHold,
  postWantedSelfPush,
  spacedPlate,
  wantedBgAlertFor,
  wantedBgPlan,
  wantedPushPayload,
} from "@/lib/wantedBgAlert";

describe("مين يشوفها — للكل (المالك: «ادمج … وانشر للكل»)", () => {
  it("مفتوحة للمناديب والسوبر أدمن", () => {
    expect(WANTED_BG_ALERT_FOR_ALL).toBe(true);
    expect(wantedBgAlertFor(false)).toBe(true);
    expect(wantedBgAlertFor(true)).toBe(true);
  });
});

describe("wantedBgPlan — قدام الشاشة زي الأول بالحرف", () => {
  const base = { enabled: true, bgActive: true };

  it("قدام الشاشة ⇒ ولا حاجة بتتغيّر (المايك يقف والصفّارة جوّه البرنامج)", () => {
    for (const platform of ["android", "ios", "web"]) {
      expect(wantedBgPlan({ ...base, platform, inBackground: false })).toEqual({ holdService: false, keepMic: false, push: false });
    }
  });

  it("أندرويد برّه ⇒ الخدمة تفضل شغّالة لحد «تم» + إشعار", () => {
    expect(wantedBgPlan({ ...base, platform: "android", inBackground: true })).toEqual({ holdService: true, keepMic: false, push: true });
  });

  it("آيفون برّه ⇒ المايك يفضل شغّال لحد ما يرجع (البرنامج يفضل صاحي) + إشعار", () => {
    expect(wantedBgPlan({ ...base, platform: "ios", inBackground: true })).toEqual({ holdService: false, keepMic: true, push: true });
  });

  it("من غير خدمة الخلفية (نسخة قديمة) ⇒ الإشعار بس، من غير ما نمسك حاجة", () => {
    expect(wantedBgPlan({ enabled: true, bgActive: false, platform: "android", inBackground: true })).toEqual({ holdService: false, keepMic: false, push: true });
    expect(wantedBgPlan({ enabled: true, bgActive: false, platform: "ios", inBackground: true })).toEqual({ holdService: false, keepMic: false, push: true });
  });

  it("مش مفتوحة للحساب ⇒ زي الأول بالحرف حتى وهو برّه", () => {
    for (const platform of ["android", "ios"]) {
      expect(wantedBgPlan({ enabled: false, bgActive: true, platform, inBackground: true })).toEqual({ holdService: false, keepMic: false, push: false });
    }
  });

  it("المتصفح ⇒ مفيش خدمة ولا إشعار هاتف", () => {
    expect(wantedBgPlan({ ...base, platform: "web-android", inBackground: true })).toEqual({ holdService: false, keepMic: false, push: false });
  });

  it("الخدمة مابتتمسكش للأبد — حد أقصى", () => {
    expect(WANTED_BG_HOLD_MAX_MS).toBeGreaterThanOrEqual(5 * 60_000);
    expect(WANTED_BG_HOLD_MAX_MS).toBeLessThanOrEqual(30 * 60_000);
  });
});

describe("wantedPushPayload — رقم اللوحة وبيانات العربية", () => {
  it("العنوان: اللوحة مفصّلة حروف ثم أرقام", () => {
    expect(spacedPlate("رلع7528")).toBe("ر ل ع 7528");
    expect(spacedPlate("ر ل ع 7528")).toBe("ر ل ع 7528");
    const p = wantedPushPayload("رلع7528", []);
    expect(p.title).toBe("🚨 عربية مطلوبة: ر ل ع 7528");
  });

  it("الجسم: بيانات العربية «المفتاح: القيمة» من غير الفاضي ولا عمود اللوحة", () => {
    const p = wantedPushPayload("رلع7528", [
      ["رقم اللوحة", "ر ل ع 7528"],
      ["الماركة", "تويوتا"],
      ["الطراز", "كامري"],
      ["اللون", " "],
      ["سنة الصنع", "2020"],
      ["Plate Number", "7528 ALR"],
      ["البنك", "الراجحي"],
    ]);
    expect(p.body).toBe("الماركة: تويوتا\nالطراز: كامري\nسنة الصنع: 2020\nالبنك: الراجحي");
  });

  it("مفيش بيانات ⇒ جملة تفهّمه يعمل إيه", () => {
    expect(wantedPushPayload("رلع7528", []).body).toBe("افتح البرنامج ودوس «تم»");
  });

  it("حد للطول — الإشعار مايتقصّش في النص", () => {
    const many = Array.from({ length: 30 }, (_, i) => [`عمود ${i}`, "ق".repeat(200)] as [string, string]);
    const p = wantedPushPayload("رلع7528", many);
    expect(p.body.split("\n").length).toBeLessThanOrEqual(8);
    expect(p.body.length).toBeLessThanOrEqual(600);
  });

  it("بيانات للتطبيق: النوع واللوحة (قيم نصية — شرط FCM)", () => {
    expect(wantedPushPayload("رلع7528", []).data).toEqual({ kind: "self-wanted", plate: "رلع7528" });
  });
});

describe("WantedBgHold — 🤖 الخدمة متسابة لحد «تم» وبس", () => {
  it("hold ⇒ release بيقفل الخدمة مرة واحدة", () => {
    const stop = vi.fn();
    const hold = new WantedBgHold(stop, 1000);
    expect(hold.release()).toBe(false);   // مكانتش ممسوكة ⇒ مابيقفلش حاجة
    hold.hold();
    expect(hold.isHeld).toBe(true);
    expect(hold.release()).toBe(true);
    expect(hold.release()).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("المندوب مارجعش ⇒ بتتقفل لوحدها بعد الحد الأقصى", () => {
    vi.useFakeTimers();
    try {
      const stop = vi.fn();
      const hold = new WantedBgHold(stop, 1000);
      hold.hold();
      vi.advanceTimersByTime(999);
      expect(stop).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(hold.isHeld).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("رجع وداس «تم» قبل الحد ⇒ المؤقت مايقفلش خدمة التسجيل الجديد", () => {
    vi.useFakeTimers();
    try {
      const stop = vi.fn();
      const hold = new WantedBgHold(stop, 1000);
      hold.hold();
      hold.release();
      vi.advanceTimersByTime(5000);
      expect(stop).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("postWantedSelfPush — بيتبعت لموبايله هو بس", () => {
  it("بيبعت اللوحة والبيانات بتوكن الجلسة", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, sent: 1 }), { status: 200 }));
    const r = await postWantedSelfPush("رلع7528", [["الماركة", "تويوتا"]], "TOKEN", fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, sent: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WANTED_SELF_PUSH_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(String(init.body))).toEqual({ plate: "رلع7528", info: [["الماركة", "تويوتا"]] });
  });

  it("مفيش جلسة ⇒ مابيبعتش", async () => {
    const fetchImpl = vi.fn();
    expect(await postWantedSelfPush("رلع7528", [], null, fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, sent: 0, why: "no-session" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("النت وقع ⇒ مايرميش (التنبيه جوّه البرنامج شغّال)", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("Load failed"); });
    expect(await postWantedSelfPush("رلع7528", [], "T", fetchImpl as unknown as typeof fetch)).toEqual({ ok: false, sent: 0, why: "network" });
  });
});

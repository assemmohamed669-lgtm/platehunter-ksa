import { describe, it, expect } from "vitest";
import { describeUserAgent } from "@/lib/securityDescribe";

/**
 * ══════════════════════════════════════════════════════════════════════
 *  📱 نوع الجهاز في سجل الأمان
 * ══════════════════════════════════════════════════════════════════════
 *  المالك (٧ أكتوبر ٢٠٢٦): «كل النداءات اللي بدون تصريح عايز أعرف فين مصدرها».
 *
 *  نوع الجهاز **متسجّل** مع كل سطر من زمان، بس الصفحة ماكانتش بتعرضه. وهو
 *  اللي كشف إن ٥ نداءات جُم من **`curl`** — أداة سطر أوامر، مش تطبيقنا.
 *  من غيره كان السطر «الفاعل: —» ومفيش أي خيط.
 *
 *  فالمطلوب حاجتين: اسم مفهوم بالعربي، و**علامة** على اللي مش متصفّح.
 */
const ANDROID = "Mozilla/5.0 (Linux; Android 16; SM-S928B Build/BP4A.251205.006; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/153.0.8010.36 Mobile Safari/537.36";
const HONOR = "Mozilla/5.0 (Linux; Android 16; MTN-NX1 Build/HONORMTN-N21; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/153.0.8010.36 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

describe("وصف الجهاز", () => {
  it("أندرويد ⇒ بيطلّع الموديل", () => {
    const d = describeUserAgent(ANDROID);
    expect(d.label).toContain("أندرويد");
    expect(d.label).toContain("SM-S928B");
    expect(d.suspicious).toBe(false);
  });

  it("موديل تاني (هونر) ⇒ بيطلّعه هو كمان", () => {
    expect(describeUserAgent(HONOR).label).toContain("MTN-NX1");
  });

  it("آيفون وويندوز", () => {
    expect(describeUserAgent(IPHONE).label).toContain("آيفون");
    expect(describeUserAgent(WINDOWS).label).toContain("ويندوز");
    expect(describeUserAgent(IPHONE).suspicious).toBe(false);
    expect(describeUserAgent(WINDOWS).suspicious).toBe(false);
  });
});

describe("🔴 اللي مش متصفّح — ده اللي يستاهل علامة", () => {
  it("curl ⇒ متعلّم (ده اللي كشف حادثة ٤ أكتوبر)", () => {
    const d = describeUserAgent("curl/8.19.0");
    expect(d.suspicious).toBe(true);
    expect(d.label).toContain("curl");
  });

  it("أدوات تانية بتتكتب بالإيد ⇒ متعلّمة", () => {
    for (const ua of ["python-requests/2.32", "Wget/1.21", "PostmanRuntime/7.39", "Go-http-client/2.0", "HTTPie/3.2"]) {
      expect(describeUserAgent(ua).suspicious).toBe(true);
    }
  });

  it("مافيش جهاز متسجّل ⇒ «—» ومش متعلّم (نقص مش شك)", () => {
    expect(describeUserAgent(null)).toEqual({ label: "—", suspicious: false });
    expect(describeUserAgent("")).toEqual({ label: "—", suspicious: false });
    expect(describeUserAgent("   ")).toEqual({ label: "—", suspicious: false });
  });

  it("جهاز غريب مش معروف ⇒ بيعرضه مقصوص من غير ما يتّهمه", () => {
    const d = describeUserAgent("SomeBrowser/1.0 (حاجة طويلة اوي اوي اوي اوي اوي اوي اوي اوي)");
    expect(d.suspicious).toBe(false);
    expect(d.label.length).toBeLessThanOrEqual(44);
  });
});

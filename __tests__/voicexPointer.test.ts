import { describe, it, expect } from "vitest";
import { buildVoicexEndpoint, resolvePointerRow } from "@/lib/voicexPointer";

// مؤشّر VoiceX: العنوان بييجي من Supabase (مش localStorage زي الطيّار). العقد
// **فشل-مغلق**: أي التباس (نفق واقع/عنوان غلط/توكن قصير) = null ⇒ رجوع لديبجرام.
describe("buildVoicexEndpoint", () => {
  const TOK = "voicex-prod-secret-123"; // ٢٢ محرف ASCII — سليم

  it("عنوان https سليم + توكن سليم + النفق شغّال ⇒ endpoint كامل", () => {
    const ep = buildVoicexEndpoint("https://abc.trycloudflare.com", TOK, true);
    expect(ep).not.toBeNull();
    expect(ep!.base).toBe("https://abc.trycloudflare.com");
    expect(ep!.transcribeUrl).toBe("https://abc.trycloudflare.com/transcribe");
    expect(ep!.token).toBe(TOK);
  });

  it("بيشيل لاحقة /transcribe من العنوان (نفس normalizeJudgeBase)", () => {
    const ep = buildVoicexEndpoint("https://abc.trycloudflare.com/transcribe", TOK, true);
    expect(ep!.base).toBe("https://abc.trycloudflare.com");
    expect(ep!.transcribeUrl).toBe("https://abc.trycloudflare.com/transcribe");
  });

  it("النفق واقع (is_up=false) ⇒ null (رجوع لديبجرام)", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", TOK, false)).toBeNull();
  });

  it("عنوان http غير محلي ⇒ null (mixed-content على WebView)", () => {
    expect(buildVoicexEndpoint("http://abc.trycloudflare.com", TOK, true)).toBeNull();
  });

  it("عنوان فاضي/null ⇒ null", () => {
    expect(buildVoicexEndpoint("", TOK, true)).toBeNull();
    expect(buildVoicexEndpoint(null, TOK, true)).toBeNull();
  });

  it("توكن قصير جداً ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", "short", true)).toBeNull();
  });

  it("توكن null/فاضي ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", null, true)).toBeNull();
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", "", true)).toBeNull();
  });

  it("توكن فيه سطر جديد (حقن ترويسات) ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com", "tok\nInjected: 1", true)).toBeNull();
  });

  it("عنوان فيه توكن في الاستعلام (تسريب) ⇒ null", () => {
    expect(buildVoicexEndpoint("https://abc.trycloudflare.com?token=x", TOK, true)).toBeNull();
  });
});

// resolvePointerRow: يحسم صف المؤشّر الخام (من select) لـ{url, isUp} — فشل-مغلق.
describe("resolvePointerRow", () => {
  it("صف سليم ⇒ {url, isUp}", () => {
    expect(resolvePointerRow({ url: "https://x.dev", is_up: true }, null))
      .toEqual({ url: "https://x.dev", isUp: true });
  });

  it("is_up مش false ⇒ يعتبر شغّال (الافتراضي true)", () => {
    expect(resolvePointerRow({ url: "https://x.dev" }, null)?.isUp).toBe(true);
  });

  it("is_up=false ⇒ isUp=false", () => {
    expect(resolvePointerRow({ url: "https://x.dev", is_up: false }, null)?.isUp).toBe(false);
  });

  it("خطأ RPC ⇒ null", () => {
    expect(resolvePointerRow({ url: "https://x.dev" }, { message: "boom" })).toBeNull();
  });

  it("صف null/غير كائن ⇒ null", () => {
    expect(resolvePointerRow(null, null)).toBeNull();
    expect(resolvePointerRow("nope", null)).toBeNull();
  });

  it("url مش سترنج ⇒ null", () => {
    expect(resolvePointerRow({ url: 123, is_up: true }, null)).toBeNull();
  });
});

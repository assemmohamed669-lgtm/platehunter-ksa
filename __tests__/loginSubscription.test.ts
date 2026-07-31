// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Supabase موهوم: تحكّم كامل في نتيجة الدخول والبروفايل ──────────────────
const state = {
  signInError: null as null | { message: string },
  rpcError: null as null | { message: string },
  profile: null as null | Record<string, unknown>,
  signedOut: false,
};

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithPassword: async () => ({ error: state.signInError }),
      signOut: async () => { state.signedOut = true; return { error: null }; },
      getUser: async () => ({ data: { user: { id: "u1" } } }),
    },
    rpc: async () => ({ data: "token-123", error: state.rpcError }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profile, error: null }),
          single: async () => ({ data: state.profile, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/lib/device", () => ({
  getDeviceFingerprint: () => "fp-1",
  setStoredSessionToken: () => {},
  clearStoredSessionToken: () => {},
}));

const { loginAgent } = await import("@/lib/auth");

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

describe("loginAgent — منع دخول المشترك المفصول", () => {
  beforeEach(() => {
    state.signInError = null;
    state.rpcError = null;
    state.signedOut = false;
    localStorage.clear();
  });

  it("اشتراك نشط → الدخول بينجح", async () => {
    state.profile = { role: "agent", is_active: true, is_trial: false, subscription_end: day(20) };
    const r = await loginAgent("ali", "pw");
    expect(r.ok).toBe(true);
  });

  it("آخر يوم في الاشتراك → الدخول بينجح", async () => {
    state.profile = { role: "agent", is_active: true, is_trial: false, subscription_end: day(0) };
    expect((await loginAgent("ali", "pw")).ok).toBe(true);
  });

  it("اليوم اللي بعد الانتهاء → الدخول بيترفض فوراً (مفيش سماح)", async () => {
    state.profile = { role: "agent", is_active: true, is_trial: false, subscription_end: day(-1) };
    const r = await loginAgent("ali", "pw");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("SUBSCRIPTION_EXPIRED");
  });

  it("بعد السماح → الدخول بيترفض برسالة الاشتراك", async () => {
    state.profile = { role: "agent", is_active: true, is_trial: false, subscription_end: day(-5) };
    const r = await loginAgent("ali", "pw");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("SUBSCRIPTION_EXPIRED");
    expect(r.errorMessage).toContain("الاشتراك");
  });

  it("الرفض بيسجّل خروج فمايفضلش جلسة مفتوحة", async () => {
    state.profile = { role: "agent", is_active: true, is_trial: false, subscription_end: day(-5) };
    await loginAgent("ali", "pw");
    expect(state.signedOut).toBe(true);
  });

  it("الأدمن مايتمنعش (مفيش تاريخ اشتراك)", async () => {
    state.profile = { role: "admin", is_active: true, is_trial: false, subscription_end: null };
    expect((await loginAgent("admin", "pw")).ok).toBe(true);
  });

  it("لو تعذّر قراءة البروفايل → مايمنعش الدخول (متسامح عند الشك)", async () => {
    state.profile = null;
    expect((await loginAgent("ali", "pw")).ok).toBe(true);
  });

  it("بيانات دخول غلط → نفس الرسالة القديمة", async () => {
    state.signInError = { message: "bad" };
    const r = await loginAgent("ali", "wrong");
    expect(r.errorCode).toBe("INVALID_CREDENTIALS");
  });
});

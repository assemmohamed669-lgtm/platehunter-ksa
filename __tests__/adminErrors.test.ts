import { describe, it, expect } from "vitest";
import { classifyAgentCreateError } from "@/lib/adminErrors";

describe("classifyAgentCreateError", () => {
  it("maps Supabase email_exists code to the email-taken message", () => {
    expect(classifyAgentCreateError("Some auth error", "email_exists"))
      .toBe("الإيميل ده مستخدم بالفعل.");
  });

  it("maps 'already been registered' text to the email-taken message", () => {
    expect(classifyAgentCreateError("A user with this email address has already been registered"))
      .toBe("الإيميل ده مستخدم بالفعل.");
  });

  it("blames the PHONE, not the email, when the duplicate is on phone", () => {
    // The core bug: a new email + a reused phone must NOT say 'email already used'.
    expect(classifyAgentCreateError('duplicate key value violates unique constraint "profiles_phone_key"'))
      .toBe("رقم التليفون ده مستخدم بالفعل.");
  });

  it("blames the email when the duplicate is explicitly on email/username", () => {
    expect(classifyAgentCreateError('duplicate key value violates unique constraint "profiles_email_key"'))
      .toBe("الإيميل ده مستخدم بالفعل.");
  });

  it("gives a neutral message for a duplicate on an unknown field", () => {
    expect(classifyAgentCreateError("duplicate key value violates unique constraint"))
      .toBe("في بيانات مكررة بالفعل (إيميل أو رقم تليفون).");
  });

  it("surfaces the real error message for non-duplicate failures", () => {
    expect(classifyAgentCreateError("Password should be at least 6 characters"))
      .toBe("Password should be at least 6 characters");
  });

  it("falls back to a generic message when there is no message at all", () => {
    expect(classifyAgentCreateError("")).toBe("فشل إنشاء الحساب.");
  });
});

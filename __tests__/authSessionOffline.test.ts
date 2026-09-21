/**
 * **قاعدة المالك: البرنامج مايخرجش المندوب إلا لو هو سجّل خروج بنفسه.**
 *
 * السبب اللي كان بيكسرها: `supabase.auth.getUser()` بيعمل **نداء شبكة** كل
 * مرة، ولما النداء يفشل (نت ضعيف · التطبيق رجع من الخلفية · واي فاي بوابة)
 * المكتبة بترجّع `user: null` **مش خطأ** — لأن خطأ الشبكة عندها نوعه
 * `AuthRetryableFetchError` وهو `AuthError`، فبيتبلع في نفس المسار.
 * والبرنامج في ١٠ أماكن بيعمل `if (!data.user) router.replace("/login")`.
 *
 * فالمندوب كان بيتحط على شاشة الدخول وجلسته **لسه سليمة** — عشان كده كان
 * بيدخل تاني عادي.
 */
import { describe, it, expect } from "vitest";
import { resolveSession, type SessionProbe } from "@/lib/authSession";

const ok = (id: string): SessionProbe => ({ session: { user: { id } }, error: null });
const none: SessionProbe = { session: null, error: null };
const failed: SessionProbe = { session: null, error: { message: "Failed to fetch" } };

describe("resolveSession", () => {
  it("جلسة موجودة → المعرّف", () => {
    expect(resolveSession(ok("u1"))).toEqual({ userId: "u1", signedOut: false });
  });

  it("**فشل شبكة → مايتعتبرش خروج**", () => {
    expect(resolveSession(failed)).toEqual({ userId: null, signedOut: false });
  });

  it("مافيش جلسة ومفيش خطأ → خروج حقيقي", () => {
    expect(resolveSession(none)).toEqual({ userId: null, signedOut: true });
  });

  it("جلسة بلا مستخدم = مش خروج (حالة غريبة، مانرميهوش بره)", () => {
    expect(resolveSession({ session: {}, error: null })).toEqual({ userId: null, signedOut: false });
  });

  it("خطأ **ومعاه** جلسة → الجلسة تكسب", () => {
    expect(resolveSession({ session: { user: { id: "u2" } }, error: { message: "x" } }))
      .toEqual({ userId: "u2", signedOut: false });
  });

  it("رد فاضي/بايظ مايطلعش المندوب بره", () => {
    expect(resolveSession(undefined as unknown as SessionProbe)).toEqual({ userId: null, signedOut: false });
    expect(resolveSession({} as SessionProbe)).toEqual({ userId: null, signedOut: false });
  });
});

// ── حارس على الملفات: مفيش بوابة دخول بتعتمد على getUser ──
import { readFileSync } from "node:fs";

const GATES = [
  "components/SessionGuard.tsx",
  "app/(app)/data-upload/page.tsx",
  "app/(app)/group-sort/page.tsx",
  "app/admin/layout.tsx",
  "app/admin/page.tsx",
  "app/admin/accounts/page.tsx",
  "app/admin/groups/page.tsx",
  "app/admin/locations/page.tsx",
  "app/admin/[id]/page.tsx",
  "components/GroupRecordsView.tsx",
];

describe("مفيش بوابة بتوديه لشاشة الدخول على نداء شبكة", () => {
  for (const f of GATES) {
    it(`${f} بيستعمل currentSession مش getUser`, () => {
      const src = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      expect(src).toContain("currentSession()");
      // البوابة لازم تكون مشروطة بـsignedOut، مش بغياب المستخدم
      const gate = src.match(/if \(!userId\) \{[^}]*\}/);
      expect(gate, `مالقيتش البوابة في ${f}`).not.toBeNull();
      expect(gate![0]).toContain("signedOut");
    });
  }

  it("مفيش أي router.replace(\"/login\") معلّق على getUser", () => {
    for (const f of GATES) {
      const src = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      expect(src, f).not.toMatch(/getUser\(\);\s*\n\s*if \(![^)]*\.user\)/);
    }
  });
});

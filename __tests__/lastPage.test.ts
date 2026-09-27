import { describe, it, expect, beforeEach } from "vitest";
import { rememberPage, lastPage, LAST_PAGE_KEY } from "@/lib/lastPage";

/**
 * 🔴 **يرجع لآخر صفحة كان واقف عليها.**
 *
 * بلاغ المالك (٢٧ سبتمبر ٢٠٢٦): المندوب بيتنقل لتطبيق تاني ويرجع، فيلاقي
 * البرنامج فتح على صفحة **غير** اللي كان فيها.
 *
 * السبب: لما نظام التليفون يعيد تحميل الـWebView (ضغط ذاكرة / رجوع من
 * الخلفية) التطبيق بيبدأ من `/`، وشاشة البداية بتعمل
 * `router.replace("/sorting")` **ثابتة** مهما كان واقف فين.
 */
describe("lastPage — آخر صفحة", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch { /* تخزين مقفول */ }
  });

  it("بترجّع null لو مافيش حاجة محفوظة", () => {
    expect(lastPage()).toBeNull();
  });

  it("بتحفظ وبترجّع صفحة التطبيق", () => {
    rememberPage("/instant-check");
    expect(lastPage()).toBe("/instant-check");
  });

  it("بتحفظ المسار بمعاملات البحث زي ما هو", () => {
    rememberPage("/list?type=wanted");
    expect(lastPage()).toBe("/list?type=wanted");
  });

  it("🔴 مابتحفظش صفحات الدخول — وإلا المندوب يرجع لشاشة تسجيل الدخول", () => {
    rememberPage("/instant-check");
    rememberPage("/login");
    rememberPage("/auth/reset-password");
    expect(lastPage()).toBe("/instant-check");
  });

  it("🔴 مابتحفظش شاشة البداية نفسها — وإلا بنلفّ في حلقة", () => {
    rememberPage("/instant-check");
    rememberPage("/");
    expect(lastPage()).toBe("/instant-check");
  });

  it("🔴 بترجّع null لأي مسار مش من صفحات التطبيق (حماية من تحويل مفتوح)", () => {
    // القيمة جاية من التخزين، وأي حاجة في التخزين ممكن تتعدّل.
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "not-a-path"]) {
      localStorage.setItem(LAST_PAGE_KEY, bad);
      expect(lastPage()).toBeNull();
    }
  });

  it("🔴 بترجّع null لصفحة مش موجودة في التطبيق", () => {
    localStorage.setItem(LAST_PAGE_KEY, "/page-that-does-not-exist");
    expect(lastPage()).toBeNull();
  });

  it("بتقبل كل صفحات التطبيق الحقيقية", () => {
    for (const p of ["/sorting", "/instant-check", "/registration-v2", "/wanted", "/maps", "/list", "/data-upload"]) {
      rememberPage(p);
      expect(lastPage()).toBe(p);
    }
  });

  it("مابترميش لو التخزين مقفول", () => {
    expect(() => rememberPage("/sorting")).not.toThrow();
    expect(() => lastPage()).not.toThrow();
  });
});

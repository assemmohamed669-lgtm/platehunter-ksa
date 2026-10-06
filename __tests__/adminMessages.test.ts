import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveAllAgentsNotice } from "@/lib/agentNotice";

/**
 * 📣 المالك (٦ أكتوبر ٢٠٢٦): «خلي الادمن يقدر يبعت رساله خاصه للمندوب او يحطها ل كل المناديب» —
 * والاختيار «الاتنين»:
 *  ١) أي أدمن يقدر يبعت «رسالة للمناديب» (كانت للسوبر أدمن بس) — الاستطلاع وإشعار الهاتف زي ما هم.
 *  ٢) مربع «رسالة خاصة» في صفحة المندوب فيه «ابعتها لكل المناديب»: بتظهر عند كل مندوب بالأحمر من
 *     غير زر إخفاء (زي الخاصة بالظبط) لحد ما الأدمن يشيلها — ومن غير ما تمسح الرسايل الخاصة اللي عندهم.
 */
const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

describe("🔴 الرسالة اللي لكل المناديب", () => {
  it("🔴 النص والوقت · الفاضي = مفيش · بتتقصّ عند ٥٠٠ حرف", () => {
    expect(resolveAllAgentsNotice([{ notice_text: "  بكرة إجازة  ", notice_at: "2026-10-06T10:00:00Z" }]))
      .toEqual({ text: "بكرة إجازة", at: "2026-10-06T10:00:00Z" });
    expect(resolveAllAgentsNotice([])).toBeNull();
    expect(resolveAllAgentsNotice([{ notice_text: "   ", notice_at: null }])).toBeNull();
    expect(resolveAllAgentsNotice(null)).toBeNull();
    expect(resolveAllAgentsNotice({ notice_text: "x".repeat(600), notice_at: null })?.text).toHaveLength(500);
  });
});

describe("🔴 التوصيل", () => {
  it("🔴 أي أدمن: «رسالة للمناديب» — الاستطلاع وإشعار الهاتف للسوبر أدمن بس", () => {
    const p = read("app/admin/page.tsx");
    const box = p.slice(p.indexOf("{/* بث للمناديب"), p.indexOf("{/* List */}"));
    expect(box).not.toMatch(/^\s*\{isSuper && \(\s*<div className="rounded-xl border border-primary\/40 bg-primary\/5 p-3">/m);
    expect(box).toMatch(/\{isSuper && broadcastTab === "push" && \(/);
    expect(box).toMatch(/\{isSuper && broadcastTab === "poll" && \(/);
    // الرسالة الشغّالة بتتقري لأي أدمن (مش جوّه شرط السوبر)
    const eff = p.slice(p.indexOf('if (prof?.role !== "admin")'), p.indexOf("setAuthorized(true);"));
    expect(eff.indexOf("fetchAppNotice().then(setNoticeActive)")).toBeLessThan(eff.indexOf("if (prof?.is_super)"));
  });
  it("🔴 صفحة المندوب: «ابعتها لكل المناديب» + «شيلها من عند الكل»", () => {
    const p = read("app/admin/[id]/page.tsx");
    expect(p).toMatch(/ابعتها لكل المناديب/);
    expect(p).toMatch(/شيلها من عند الكل/);
    expect(p).toMatch(/setAllAgentsNotice\(/);
  });
  it("🔴 الشريط عند المندوب: الخاصة واللي لكل المناديب — بالأحمر ومن غير زر إخفاء", () => {
    const b = read("components/AgentNoticeBanner.tsx");
    expect(b).toMatch(/fetchAllAgentsNotice\(\)/);
    expect(b).toMatch(/fetchAgentNotice\(\)/);
    expect(b).not.toMatch(/aria-label="إغلاق"|onClick=/);
  });
  it("🔴 الداتابيز: الأدمن بس يكتب · أي حد داخل يقرا · مفيش زوّار · الرسايل الخاصة مابتتلمسش", () => {
    const sql = read("docs/sql/all-agents-notice.sql");
    expect(sql).toMatch(/create or replace function public\.set_all_agents_notice\(p_text text\)/);
    expect(sql).toMatch(/role = 'admin'/);
    expect(sql).toMatch(/raise exception 'NOT_ADMIN'/);
    expect(sql).toMatch(/create or replace function public\.get_all_agents_notice\(\)/);
    expect(sql).toMatch(/revoke all on function public\.set_all_agents_notice\(text\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.set_all_agents_notice\(text\) to authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.get_all_agents_notice\(\) to authenticated;/);
    expect(sql).not.toMatch(/update public\.profiles/);
  });
});

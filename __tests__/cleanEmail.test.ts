import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanEmail } from "@/lib/cleanEmail";

/**
 * 📧 المالك (١٣ أكتوبر ٢٠٢٦): «الايميل دة مش عايز يتضاف معايا … مع ان الايميل شغال» — Supabase رجّع «Unable to
 * validate email address: invalid format» لـ`fayezmohmad0303@gmail.com`. السبب: كيبورد أندرويد في خانة جنبها عربي
 * بيحط **علامات اتجاه مخفية** (LRM/RLM…) أو أرقام عربية، والكود كان بيشيل المسافات بس.
 */
const E = "fayezmohmad0303@gmail.com";

describe("📧 الإيميل بيتنضّف من أي حاجة مخفية", () => {
  it("🔴 علامات الاتجاه المخفية (LRM / RLM / ALM)", () => {
    expect(cleanEmail(`‎${E}‎`)).toBe(E);
    expect(cleanEmail(`‏fayezmohmad0303@‏gmail.com`)).toBe(E);
    expect(cleanEmail(`؜${E}`)).toBe(E);
    expect(cleanEmail(`‪${E}‬`)).toBe(E);
    expect(cleanEmail(`⁦${E}⁩`)).toBe(E);
  });
  it("🔴 مسافات مخفية جوّه الإيميل (zero-width / non-breaking)", () => {
    expect(cleanEmail(`fayez​mohmad0303@gmail.com`)).toBe(E);
    expect(cleanEmail(`fayezmohmad0303@gmail.com `)).toBe(E);
    expect(cleanEmail(`﻿${E}`)).toBe(E);
  });
  it("🔴 الأرقام العربية بتتحوّل", () => {
    expect(cleanEmail("fayezmohmad٠٣٠٣@gmail.com")).toBe(E);
    expect(cleanEmail("fayezmohmad۰۳۰۳@gmail.com")).toBe(E);
  });
  it("حروف عريضة (full-width) وكابيتال", () => {
    expect(cleanEmail("ＦＡＹＥＺmohmad0303＠Gmail.COM")).toBe(E);
  });
  it("الإيميل السليم زي ما هو", () => {
    expect(cleanEmail(`  ${E}  `)).toBe(E);
    expect(cleanEmail("a.b+c_d-1@sub.example.co")).toBe("a.b+c_d-1@sub.example.co");
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 إنشاء حساب وتغيير الإيميل الاتنين بيستخدموا التنضيف", () => {
    expect(read("app/api/admin/create-agent/route.ts")).toMatch(/const v = cleanEmail\(raw\);/);
    expect(read("app/api/admin/manage-agent/route.ts")).toMatch(/const email = cleanEmail\(body\.email\);/);
  });
  it("🔴 خانة الإيميل بتفتح كيبورد الإيميل الإنجليزي", () => {
    expect(read("app/admin/page.tsx")).toMatch(/<input value=\{cEmail\} onChange=\{\(e\) => setCEmail\(e\.target\.value\)\} placeholder="الإيميل ✱ إجباري" dir="ltr"\n\s+inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck=\{false\}/);
  });
});

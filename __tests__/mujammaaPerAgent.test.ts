// @vitest-environment node
/**
 * 🔘 زرار «التسجيل» قدام كل مندوب في قايمة الأدمن (١٩ أكتوبر ٢٠٢٦). المالك: «عايز زر قدام كل اسم لما ادوس عليه
 * افتح صفحه التسجيل عند المشترك». حرّاس على الربط:
 *  · العمود `mujammaa_enabled` بيتقري في كل مكان بيقرّر «التسجيل» — **بـ`selectWithOptional`** (أو سلسلة رجوع في
 *    اللياوت) عشان نشر الكود قبل الـSQL مايوقّعش قراية الصلاحيات على المناديب.
 *  · مشترك «صوت فقط» اتفتحله ⇒ «التسجيل» في الشريط بتاعه + الحارس مايرجّعوش للتشييك.
 *  · الزرار والإجراء **للسوبر أدمن بس** (القاعدة: السوبر أدمن الأول).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describeSecurityEvent } from "@/lib/securityDescribe";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");

describe("🔘 «التسجيل» لمندوب بعينه — الربط", () => {
  it("SQL: عمود boolean فاضي افتراضياً (الفاضي = القاعدة) — آمن للتكرار", () => {
    const p = join(process.cwd(), "docs", "sql", "mujammaa-per-agent.sql");
    expect(existsSync(p)).toBe(true);
    const sql = read("docs", "sql", "mujammaa-per-agent.sql");
    expect(sql).toMatch(/alter table public\.profiles\s+add column if not exists mujammaa_enabled boolean;/);
    expect(sql).not.toMatch(/mujammaa_enabled boolean (not null|default)/);
  });

  it("الشريط اللي تحت: بيقرا العمود من غير ما يوقّع، و«صوت فقط» اللي اتفتحله بيشوف «التسجيل»", () => {
    const s = read("components", "BottomNav.tsx");
    expect(s).toMatch(/selectWithOptional\(/);
    expect(s).toMatch(/MJ_FLAG_COL/);
    // شريط «صوت فقط»: زرار التسجيل لما hasAll
    const voice = s.slice(s.indexOf("{!restPages ? ("), s.indexOf("tabs.map(({ href, label, icon: Icon })"));
    expect(voice).toMatch(/hasAll && \(/);
    expect(voice).toMatch(/router\.push\("\/registration"\)/);
  });

  it("صفحة «التسجيل» والتشييك بيقروا العمود بنفس الطريقة", () => {
    for (const f of [["app", "(app)", "registration", "page.tsx"], ["app", "(app)", "instant-check", "page.tsx"]]) {
      const s = read(...f);
      expect(s, f.join("/")).toMatch(/selectWithOptional\(/);
      expect(s, f.join("/")).toMatch(/MJ_FLAG_COL/);
    }
  });

  it("اللياوت: سلسلة رجوع لو العمود مش موجود + «صوت فقط» اللي اتفتحله مايترجّعش من «التسجيل»", () => {
    const s = read("app", "(app)", "layout.tsx");
    expect(s).toMatch(/select\(`\$\{BASE_COLS\}, wheel_spin_at, \$\{MJ_FLAG_COL\}`\)/);
    expect(s).toMatch(/select\(`\$\{BASE_COLS\}, wheel_spin_at`\)/);
    expect(s).toMatch(/!isAllowedForVoiceOnly\(pathname\) && !\(mjGpsWarm && isTabActive\(pathname, "\/registration"\)\)/);
  });

  it("قايمة الأدمن: زرار قدام المندوب للسوبر أدمن بس، بلونه الحقيقي (ظاهر/مخفي)", () => {
    const s = read("app", "admin", "page.tsx");
    expect(s).toMatch(/mujammaa_enabled\?: boolean \| null/);
    expect(s).toMatch(/isSuper && a\.role === "agent" && \(\(\) => \{\s*const mj = canUseMujammaa\(a\)/);
    expect(s).toMatch(/toggleAgentFlag\(a, "setMujammaa", !mj, e\)/);
  });

  it("الـAPI: إجراء setMujammaa للسوبر أدمن بس وبيكتب العمود", () => {
    const s = read("app", "api", "admin", "manage-agent", "route.ts");
    expect(s).toMatch(/const SUPER_ONLY = new Set\(\[[^\]]*"setMujammaa"/);
    expect(s).toMatch(/case "setMujammaa": \{[\s\S]*?\.update\(\{ mujammaa_enabled: !!body\.enabled \}\)/);
  });

  it("سجل الأمان بيقول اتفتح ولا اتقفل", () => {
    expect(describeSecurityEvent("admin_action", "setMujammaa=on").action).toMatch(/فتح «التسجيل»/);
    expect(describeSecurityEvent("admin_action", "setMujammaa=off").action).toMatch(/قفل «التسجيل»/);
  });
});

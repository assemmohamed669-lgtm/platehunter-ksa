import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teamCheckShareMessage } from "@/lib/teamCheck";
import { describeTeamFile } from "@/lib/teamData";

/**
 * 👥 **ملفات المجموعة لازم توصل — ولو ماوصلتش، حد يعرف.**
 *
 * بلاغ المالك (٢٩ سبتمبر ٢٠٢٦): المجموعة مفتوح لها الداتا والتشييك، والمسئول
 * رافع الاتنين — بس مش ظاهرين عند عضو في نفس المجموعة. التلات ثغرات:
 *   ١) رفع شيت التشييك للمجموعة كان `void` — لو فشل محدش بيعرف.
 *   ٢) الأدمن مالوش أي طريقة يشوف بيها الملف وصل السيرفر ولا لأ.
 *   ٣) صفحة الفرز مابتسحبش شيت تشييك المجموعة — العضو اللي بيفتح على الفرز
 *      بيفرز على شيته القديم.
 */
describe("رسالة رفع شيت التشييك للمجموعة", () => {
  it("مش مسئول / الميزة مقفولة ⇒ مفيش رسالة", () => {
    expect(teamCheckShareMessage(null)).toBeNull();
  });
  it("🔴 نجح ⇒ رسالة نجاح واضحة", () => {
    expect(teamCheckShareMessage({ ok: true })).toMatch(/✅.*مجموعة/);
  });
  it("🔴 فشل ⇒ رسالة فشل فيها السبب (كان بيفشل في صمت)", () => {
    const m = teamCheckShareMessage({ ok: false, error: "The resource already exists" }) ?? "";
    expect(m).toMatch(/❌/);
    expect(m).toContain("The resource already exists");
  });
});

describe("حالة ملف المجموعة في صفحة الأدمن", () => {
  it("🔴 مفيش ملف ⇒ بيقولها صريحة", () => {
    expect(describeTeamFile(null)).toBe("لسه مفيش ملف مرفوع للمجموعة");
  });
  it("🔴 فيه ملف ⇒ اسمه وعدد صفوفه وإمتى اترفع", () => {
    const s = describeTeamFile({
      file_name: "داتا الرياض.xlsx", row_count: 395085, plate_count: 120000,
      updated_at: "2026-09-29T09:30:00.000Z",
    });
    expect(s).toContain("داتا الرياض.xlsx");
    expect(s).toContain("395,085");
    expect(s).toMatch(/2026/);
  });
  it("تاريخ باظ مابيرميش", () => {
    expect(() => describeTeamFile({ file_name: "x.xlsx", row_count: null, plate_count: null, updated_at: "bad" })).not.toThrow();
  });
});

describe("توصيل الإصلاحات", () => {
  const code = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");
  const ic = code("app", "(app)", "instant-check", "page.tsx");
  const reg = code("app", "(app)", "registration-v2", "page.tsx");
  const sort = code("app", "(app)", "sorting", "page.tsx");
  const route = code("app", "api", "admin", "group-settings", "route.ts");
  const admin = code("app", "admin", "groups", "page.tsx");

  it("🔴 التشييك والتسجيل الجديد: مفيش رفع للمجموعة في صمت", () => {
    for (const c of [ic, reg]) {
      expect(c).not.toMatch(/void uploadTeamCheck\(/);
      expect(c).toMatch(/shareCheckToTeamIfLeader\(/);
      expect(c).toMatch(/teamCheckShareMessage\(/);
    }
  });

  it("🔴 الفرز: بيسحب شيت تشييك المجموعة وبيعيد قراءته لما يتحدّث", () => {
    expect(sort).toMatch(/syncTeamCheckToLocal\(\)/);
    expect(sort).toMatch(/slot === "check"/);
  });

  it("🔴 الفرز: رفع الداتا للمجموعة بيقول «اترفعت» لما ينجح", () => {
    expect(sort).toMatch(/setTeamOkMsg\(/);
  });

  it("🔴 الأدمن: السيرفر بيرجّع ملفات المجموعات والصفحة بتعرضها", () => {
    expect(route).toMatch(/from\("team_data_files"\)/);
    expect(route).toMatch(/from\("team_check_files"\)/);
    expect(admin).toMatch(/describeTeamFile\(/);
  });
});

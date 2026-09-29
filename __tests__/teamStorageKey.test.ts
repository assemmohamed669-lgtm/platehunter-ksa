import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teamStorageKey, teamDataPath } from "@/lib/teamData";
import { teamCheckPath } from "@/lib/teamCheck";

/**
 * 🔴 **ملفات المجموعة عمرها ما اترفعت لأي مجموعة اسمها عربي.**
 *
 * بلاغ المالك (٢٩ سبتمبر ٢٠٢٦): «مجموعه بوحه» — الداتا والتشييك مفتوحين والمسئول
 * رفع، وصفحة الأدمن بتقول «لسه مفيش ملف». السبب اتقاس على السيرفر نفسه:
 *   POST storage/team-data/مجموعه بوحه/…  → 400 InvalidKey
 *   POST storage/team-data/probe-ascii/…   → 403 (الصلاحيات — يعني المفتاح اتقبل)
 * تخزين Supabase بيرفض أي حرف برّه ASCII في مسار الملف، والمسار كان اسم المجموعة.
 *
 * الحل: المسار = «t-» + UTF-8 hex لاسم المجموعة، ونفس الكود بيتحسب في الـSQL
 * (`my_team_key()`) عشان سياسات التخزين تفضل تتحقق من المجموعة.
 */
// نفس فحص مفاتيح التخزين في Supabase Storage
const SUPABASE_KEY_RE = /^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/;

describe("teamStorageKey", () => {
  it("🔴 «مجموعه بوحه» ⇒ كود إنجليزي ثابت (نفس اللي الـSQL بيحسبه)", () => {
    expect(teamStorageKey("مجموعه بوحه")).toBe("t-d985d8acd985d988d8b9d98720d8a8d988d8add987");
  });

  it("🔴 مسارات الداتا والتشييك بيعدّوا فحص مفاتيح التخزين", () => {
    for (const team of ["مجموعه بوحه", "احمد حسين صالح", "مجموعة سلام", "فريق-الرياض ٢", "Team A"]) {
      expect(teamDataPath(team)).toMatch(SUPABASE_KEY_RE);
      expect(teamCheckPath(team)).toMatch(SUPABASE_KEY_RE);
    }
    // والمسار العربي القديم فعلاً مابيعدّيش (ده اللي كان بيحصل)
    expect("مجموعه بوحه/data.xlsx").not.toMatch(SUPABASE_KEY_RE);
  });

  it("كل مجموعة ليها كود مختلف، ونفس المجموعة نفس الكود دايماً", () => {
    expect(teamStorageKey("مجموعة سلام")).not.toBe(teamStorageKey("مجموعة سلامه"));
    expect(teamStorageKey("مجموعة سلام")).toBe(teamStorageKey("مجموعة سلام"));
  });

  it("المسارات: <الكود>/data.xlsx و<الكود>/check.xlsx", () => {
    const k = teamStorageKey("مجموعه بوحه");
    expect(teamDataPath("مجموعه بوحه")).toBe(`${k}/data.xlsx`);
    expect(teamCheckPath("مجموعه بوحه")).toBe(`${k}/check.xlsx`);
  });
});

describe("SQL — سياسات التخزين بتتحقق بنفس الكود", () => {
  const sql = readFileSync(join(process.cwd(), "docs", "sql", "team-files-ascii-path.sql"), "utf8");

  it("🔴 my_team_key() = 't-' || hex(UTF-8(اسم مجموعتي)) — ومسموح للمناديب", () => {
    expect(sql).toMatch(/create or replace function public\.my_team_key\(\)/);
    expect(sql).toMatch(/'t-' \|\| encode\(convert_to\(p\.team, 'UTF8'\), 'hex'\)/);
    expect(sql).toMatch(/grant execute on function public\.my_team_key\(\) to authenticated/);
  });

  it("🔴 الـ٨ سياسات (داتا + تشييك: قراءة/رفع/استبدال/مسح) بتقارن بالكود", () => {
    for (const p of [
      "team members read team data", "leader uploads team data", "leader replaces team data", "leader deletes team data",
      "team members read team check", "leader uploads team check", "leader replaces team check", "leader deletes team check",
    ]) {
      expect(sql).toContain(`create policy "${p}"`);
    }
    expect(sql.match(/\(storage\.foldername\(name\)\)\[1\] = public\.my_team_key\(\)/g)?.length).toBe(10);
    expect(sql).not.toMatch(/\(storage\.foldername\(name\)\)\[1\] = public\.my_team\(\)/);
  });
});

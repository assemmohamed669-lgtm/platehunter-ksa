import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 👥 **سجلات الكل تظهر للكل لما «مشاركة السجلات» مفتوحة** (بلاغ المالك ١ أكتوبر ٢٠٢٦:
 * «بتظهر فقط لمسئول المجموعة»).
 *
 * السبب (مكتوب أصلاً في group-fix.sql): نسخة سياسة قراءة سجلات الزمايل الأولى كانت
 * بتجيب أعضاء المجموعة باستعلام على `profiles` — وRLS بتاع profiles بيقصّه على صف
 * المندوب نفسه، فالعضو مابيلاقيش غير نفسه. المسئول (أدمن) بيشوف كله بسياسة الأدمن.
 * ملفات group-records.sql / group-chassis.sql لو اتشغّلت بعد الإصلاح بترجّع الغلط.
 */
const sql = readFileSync(join(process.cwd(), "docs", "sql", "group-share-records.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("group-share-records.sql", () => {
  it("🔴 أعضاء المجموعة من دالة security definer مربوطة بزرار «مشاركة السجلات»", () => {
    expect(code).toMatch(/create or replace function public\.my_team_member_ids\(\)/);
    expect(code).toMatch(/security definer/);
    expect(code).toMatch(/share_records_enabled/);
    expect(code).toMatch(/grant execute on function public\.my_team_member_ids\(\) to authenticated/);
  });

  it("🔴 السجلات وسجلات الشاص بتتقري بالدالة — مش باستعلام profiles اللي RLS بيقصّه", () => {
    for (const [tbl, pol] of [["field_checks", "read team field_checks"], ["chassis_records", "read team chassis"]]) {
      expect(code).toContain(`drop policy if exists "${pol}" on public.${tbl};`);
      // المسافات بتتوحّد عشان نقارن النص بالحرف من غير تعبير منتظم
      const flat = code.replace(/\s+/g, " ");
      expect(flat).toContain(`create policy "${pol}" on public.${tbl} for select to authenticated using (agent_id in (select public.my_team_member_ids()));`);
    }
    expect(code).not.toMatch(/agent_id in \(\s*select p\.id from public\.profiles/);
  });

  it("أسامي الأعضاء للعرض متاحة كمان", () => {
    expect(code).toMatch(/grant execute on function public\.my_team_members\(\) to authenticated/);
  });
});

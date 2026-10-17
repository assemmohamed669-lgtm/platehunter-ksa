/**
 * 📋 تابين في «السجلات» — «سجل التشييك» و«داتا التسجيلات» (١٨ أكتوبر ٢٠٢٦).
 *
 * المالك: «تاب جديد في صفحه السجلات هنسميه داتا التسجيلات … والتاب التاني الخاص بالتشييك الفوري
 * اللي بيتصدر من فويس برو دة هتسميه سجل التشييك يعني كل واحد فيهم كدة هيبقي في تاب خاص بيه وكل
 * واحد يظهر في التاب بتاعه».
 *  · «داتا التسجيلات» = اللي اتصدّر من المجمّع (معرّف `fc-mj-`) — الباقي في «سجل التشييك».
 *  · الشيت والعدّادات والمحرّر (تعديل/مسح) والفتح/المشاركة على التاب المفتوح بس.
 *  · مافيش تابين (مندوب مايقدرش يستخدم المجمّع ومالوش لوحات منه) ⇒ الشكل القديم بالحرف ونفس القايمة.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMujammaaRecord } from "@/lib/mujammaaRecords";

const SRC = readFileSync(join(__dirname, "..", "app", "(app)", "instant-check", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("تابات السجلات", () => {
  it("التابين بيظهروا بس لو فيه لوحات من المجمّع أو المندوب يقدر يستخدمه", () => {
    expect(SRC).toMatch(/const showRecordsTabs = mjRecordsCount > 0 \|\| mjAllowed;/);
    expect(SRC).toMatch(/const recTab: "check" \| "mjdata" = showRecordsTabs \? recordsTab : "check";/);
    expect(SRC).toMatch(/setMjAllowed\(canUseMujammaa\(row\)\);/);
    expect(SRC).toMatch(/\{mode === "sheet" && showRecordsTabs && \(/);
    expect(SRC).toMatch(/\[\["check", "سجل التشييك"\], \["mjdata", "داتا التسجيلات"\]\]/);
  });

  it("كل تاب لوحاته بس — ومن غير تابات نفس القايمة (مافيش نسخة زيادة)", () => {
    expect(SRC).toMatch(
      /showRecordsTabs \? fieldEntries\.filter\(\(e\) => isMujammaaRecord\(e\) === \(recTab === "mjdata"\)\) : fieldEntries/
    );
    expect(isMujammaaRecord({ id: "fc-mj-u-c-plate-1" })).toBe(true);
    expect(isMujammaaRecord({ id: "fc-trial-u-1-2" })).toBe(false);
  });

  it("العدّادات والقايمة والمكرر والمحرّر والتصدير على التاب المفتوح", () => {
    expect(SRC).toMatch(/fieldCategoryCounts\(tabEntries, isWantedEntry\)/);
    expect(SRC).toMatch(/fieldCategoryList\(tabEntries, fieldFilter as FieldFilter, isWantedEntry\)/);
    expect(SRC).toMatch(/duplicateCheckIds\(tabEntries\)/);
    expect(SRC).toMatch(/setDraftFieldEntries\(tabEntries\.map\(/);
    expect(SRC).toMatch(/peBaseIdsRef\.current = new Set\(tabEntries\.map\(\(e\) => e\.id\)\);/);
    const rows = SRC.slice(SRC.indexOf("function buildFieldRows()"), SRC.indexOf("async function exportFieldExcel"));
    expect(rows).toMatch(/return tabEntries\.map\(/);
  });

  it("المجموعة والشاص في «سجل التشييك» بس", () => {
    expect(SRC).toMatch(/\{mode === "sheet" && hasTeam && recTab === "check" && \(/);
    expect(SRC).toMatch(/\{mode === "sheet" && recTab === "check" && recordsScope === "group" && \(/);
    expect(SRC).toMatch(/\{mode === "sheet" && recTab === "check" && recordsScope === "mine" && chassisRecords\.length > 0 && \(/);
  });

  it("الاسم القديم لما مافيش تابات، والجديد معاهم", () => {
    expect(SRC).toMatch(
      /\{showRecordsTabs \? \(recTab === "mjdata" \? "داتا التسجيلات" : "سجل التشييك"\) : "شيت التسجيلات \(صوتي\+يدوي\)"\}/
    );
  });
});

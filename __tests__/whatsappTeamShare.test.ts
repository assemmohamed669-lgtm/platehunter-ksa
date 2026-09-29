import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { teamDataShareMessage } from "@/lib/teamData";

/**
 * 👥 **الملف اللي المسئول يفتحه من واتساب يوصل للمجموعة كمان.**
 *
 * طلب المالك (٢٩ سبتمبر ٢٠٢٦): «لو رفعهم عن طريق الواتس اب هينفع عادي» — ماكانش:
 * `IncomingExcelHandler` بيحفظ في مربعات المسئول على جهازه بس ويودّيه للصفحة،
 * ومابيعدّيش على الرفع للمجموعة خالص (ولا رسالة).
 */
describe("رسالة رفع الداتا للمجموعة", () => {
  it("مش مسئول ⇒ مفيش رسالة", () => expect(teamDataShareMessage(null)).toBeNull());
  it("نجح ⇒ ✅", () => expect(teamDataShareMessage({ ok: true })).toMatch(/✅/));
  it("فشل ⇒ ❌ بالسبب", () => {
    const m = teamDataShareMessage({ ok: false, error: "Payload too large" }) ?? "";
    expect(m).toMatch(/❌/);
    expect(m).toContain("Payload too large");
  });
});

describe("توصيل الفتح من واتساب", () => {
  const code = readFileSync(join(process.cwd(), "components", "IncomingExcelHandler.tsx"), "utf8")
    .replace(/\r\n/g, "\n").split("\n")
    .filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
    .join("\n");

  it("🔴 الداتا (الورقة الواحدة والمتعددة) والتشييك بيتبعتوا للمجموعة لو المسئول", () => {
    expect(code).toMatch(/shareDataFileToTeamIfLeader\(/);
    expect(code).toMatch(/shareCheckToTeamIfLeader\(/);
    // مسار الداتا متعدد الورقات بيرجع بدري — لازم يبعت هو كمان
    const multi = code.slice(code.indexOf("importMultiSheetData(file"), code.indexOf("router.push(\"/sorting\");"));
    expect(multi).toMatch(/notifyTeamShare\(/);
  });

  it("🔴 الرسالة بتبان للمسئول بعد ما النافذة تتقفل", () => {
    expect(code).toMatch(/teamNote/);
    // النافذة بترجّع null من غير ملف — الرسالة لازم تتعرض قبلها
    expect(code.indexOf("teamNote &&")).toBeGreaterThan(-1);
    expect(code).toContain("if (!pending) return teamToast || null;");
    expect(code.indexOf("teamNote &&")).toBeLessThan(code.indexOf("if (!pending) return teamToast"));
  });
});

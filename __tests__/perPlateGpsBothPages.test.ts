import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 🔴 **كل لوحة تاخد مكانها هي — في الصفحتين، مش في واحدة بس.**
 *
 * بلاغ المندوب «الصوت بياخد نفس الموقع لكل اللوحات» اتصلّح في **Voice PRO**
 * يوم ٢٦ سبتمبر (`ca0f3b9`) — والإصلاح اتحط **هناك بس**. فلما مندوب آيفون
 * اشتكى نفس الشكوى يوم ٢٧ سبتمبر، كانت في **صفحة التشييك** اللي فضلت على
 * القديم.
 *
 * الفرق اللي بيصنع الباج:
 *   · `getFreshFix`    → بترجّع المخزّن لو عمره < ٤ث  ⇒ لوحات ٣ث = نفس النقطة
 *   · `getFreshReading` → قراءة جديدة لكل نداء (بلمّ ٩٠٠ مللي بس)
 */
function codeOf(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("ختم الموقع لكل لوحة — الصفحتين", () => {
  const voicePro = codeOf("app", "(app)", "registration-v2", "page.tsx");
  const check = codeOf("app", "(app)", "instant-check", "page.tsx");

  it("الحارس بيقرا الصفحتين فعلاً", () => {
    expect(voicePro.length).toBeGreaterThan(1000);
    expect(check.length).toBeGreaterThan(1000);
  });

  it("🔴 Voice PRO بتستعمل القراءة الطازة لكل لوحة", () => {
    expect(voicePro).toContain("getFreshReading");
  });

  it("🔴 وصفحة التشييك كمان", () => {
    expect(check).toContain("getFreshReading");
    expect(check).toContain("getPlateGps");
  });

  it("🔴 ختم مسوّدة اللوحة بياخد `getPlateGps` مش المخزّن", () => {
    // `attachGpsToDraft` هي اللي بتختم كل صف تشييك بموقعه.
    const i = check.indexOf("async function attachGpsToDraft");
    expect(i).toBeGreaterThan(-1);
    const body = check.slice(i, i + 1200);
    expect(body).toContain("getPlateGps()");
    expect(body).not.toContain("getCurrentGps()");
  });

  it("🔴 والتصدير لشيت السجلات كمان", () => {
    const i = check.indexOf("async function exportToFieldCheck");
    expect(i).toBeGreaterThan(-1);
    const body = check.slice(i, i + 900);
    expect(body).toContain("getPlateGps()");
  });

  it("«الأقرب» فاضلة على المخزّن — ودي صح (موقع المندوب مش موقع لوحة)", () => {
    const i = check.indexOf("async function handleNearestIC");
    expect(i).toBeGreaterThan(-1);
    const body = check.slice(i, i + 600);
    expect(body).toContain("getCurrentGps()");
  });
});

/**
 * 🧾 «داتا التسجيلات» — عمود «اسم الحي» وعمود «اسم المسجّل» (١٨ أكتوبر ٢٠٢٦).
 * المالك: «اسم الحي … يظهر في عمود لوحده … واسم المسجل يتعملو عمود … يظهر العمود دة فقط لما المربع دة يتكتب
 * فيه اسم الشخص اللي بيسجل».
 * ⛔ «سجل التشييك» (اللي المناديب شغّالين عليه) مايتغيّرش ولا حرف — كله ورا `recTab === "mjdata"`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "..", "app", "(app)", "instant-check", "page.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("داتا التسجيلات — الأعمدة", () => {
  it("عمود الحي اسمه «اسم الحي» في داتا التسجيلات و«الحي-الشارع» زي ما هو في سجل التشييك", () => {
    expect(SRC).toMatch(/\{recTab === "mjdata" \? "اسم الحي" : "الحي-الشارع"\}<\/th>/);
  });

  it("«اسم المسجّل» بيظهر بس في داتا التسجيلات ولو فيه سجل ليه اسم مسجّل", () => {
    expect(SRC).toMatch(/const showRecorderCol = recTab === "mjdata" && tabEntries\.some\(\(e\) => !!String\(e\.row\?\.\[RECORDER_KEY\] \?\? ""\)\.trim\(\)\);/);
    expect(SRC).toMatch(/\{showRecorderCol && <th[^>]*>اسم المسجّل<\/th>\}/);
    expect(SRC).toMatch(/\{showRecorderCol && <td[^>]*>\{String\(e\.row\?\.\[RECORDER_KEY\] \?\? ""\) \|\| "—"\}<\/td>\}/);
  });

  it("التصدير والمشاركة بنفس الأعمدة — وسجل التشييك زي ما هو", () => {
    const i = SRC.indexOf("function buildFieldRows()");
    const body = SRC.slice(i, i + 1600);
    expect(body).toMatch(/obj\[recTab === "mjdata" \? "اسم الحي" : "الحي-الشارع"\] = areaOf\(e\.row\);/);
    expect(body).toMatch(/if \(showRecorderCol\) obj\[RECORDER_KEY\] = String\(e\.row\?\.\[RECORDER_KEY\] \?\? ""\);/);
  });
});

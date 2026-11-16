/**
 * 📍 «مافيش لوحة من غير موقع» (١٦ نوفمبر ٢٠٢٦) — التوصيل في الصفحة. المالك: «مش عايز اي لوحه تطلع بدون موقع في اسوء
 * الحالات لو الشبكه او النت كان ضعيف … ياخد اقرب موقع ل اللوحه دي». السلوك نفسه متقاس في `platePin.test.ts` و`clipStore.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const SRC = read("components/mujammaa/pages/BatchPage.tsx");
const STORE = read("components/mujammaa/lib/clipStore.ts");

describe("«أقرب موقع» متوصّل", () => {
  it("بعد التفريغ: الدقيق الأول وبعده أقرب موقع (`clipRunOutcome`)", () => {
    expect(STORE).toMatch(/fillMissingPins\(\s*stampEntriesWithTrack\(input\.entries, input\.fixes, input\.startEpoch, input\.pauses\),\s*input\.fixes,\s*input\.startEpoch,\s*input\.pauses,\s*\)/);
  });

  it("التفريغ اتقطع (النت) ⇒ الحالتين بيبعتوا مسار المقطع", () => {
    expect(SRC.match(/platesOnlyEntries\([^)]*, platesOnlyCtx\(\)\)/g)?.length).toBe(2);
    expect(SRC).not.toMatch(/platesOnlyEntries\((early|prelimRef\.current)\)/);
  });

  it("ملف مرفوع مالوش مسار ⇒ من غير موقع زي الأول (مابنخترعش)", () => {
    expect(SRC).toMatch(/return c && c\.source !== "upload" \? \{ track: c\.fixes, startEpoch: c\.startedAtMs, pauses: c\.pauses \} : null;/);
  });
});

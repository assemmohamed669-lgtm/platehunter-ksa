import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import PlateTable from "./PlateTable";
import type { PlateEntry } from "../lib/plateEntry";

/**
 * 🚨 المالك (١٨ أكتوبر ٢٠٢٦): «في المربع نفسه اللي بيظهر فيه اللوحات اللي بيصدرها يظهرو الصف بتاع
 * اللوحه دي كله متظلل ومكتوب ان اللوحه دي مطلوبه». + الربط في `BatchPage`: المربع بيظهر بعد التفريغ.
 */
const mk = (plate: string, kind: "exact" | "none") =>
  ({
    id: `e-${plate}`,
    review: { plate, heardPlate: plate, letters: [...plate.slice(0, 3)], digits: plate.slice(3), confidence: 90, status: "solid", corrections: [], notes: [], raw: plate, order: 1, needsAudioReview: false },
    pin: null,
    match: kind === "exact" ? { kind, row: { البنك: "الراجحي" }, similarity: 100 } : { kind, similarity: 0 },
    capturedAt: 1,
    source: "batch",
  }) as unknown as PlateEntry;

describe("PlateTable — صف اللوحة المطلوبة", () => {
  it("الصف كله متظلل بالأحمر ومكتوب «اللوحة دي مطلوبة» — والعادي لأ", () => {
    render(<PlateTable entries={[mk("بسن8921", "exact"), mk("حقل5830", "none")]} sheet={null} onAnnotate={() => {}} />);
    const wanted = document.getElementById("mj-row-e-بسن8921")!;
    const normal = document.getElementById("mj-row-e-حقل5830")!;
    expect(wanted.className).toMatch(/bg-red-500\/25/);
    expect(normal.className).not.toMatch(/bg-red-500/);
    expect(wanted.textContent).toMatch(/اللوحة دي مطلوبة/);
    expect(normal.textContent).not.toMatch(/اللوحة دي مطلوبة/);
    expect(screen.getAllByText(/اللوحة دي مطلوبة/)).toHaveLength(1);
  });
});

describe("BatchPage — المربع بعد التفريغ", () => {
  const SRC = readFileSync(join(__dirname, "..", "pages", "BatchPage.tsx"), "utf8").replace(/\r\n/g, "\n");
  const runQueue = SRC.slice(SRC.indexOf("const runQueue = async"), SRC.indexOf("const runTranscription = async"));

  it("بعد الموقع النهائي (clipRunOutcome) — المطلوبة من المقطع ده بتتضاف للمربع", () => {
    const i = runQueue.indexOf("const outcome = clipRunOutcome(");
    const j = runQueue.indexOf("setWantedBatch((prev) => mergeWanted(prev, w))");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(runQueue).toMatch(/const w = wantedOf\(ok \? outcome\.entries : platesOnlyRef\.current \? entriesRef\.current : \[\]\);/);
  });

  it("المربع بيظهر والمجمّع ظاهر بس (الصوت مايطلعش وهو مستخبي)، و«تم» بتفضّيه", () => {
    expect(SRC).toMatch(/\{visible && wantedBatch\.length > 0 && \(\s*<WantedBatchModal/);
    expect(SRC).toMatch(/onClose=\{\(\) => setWantedBatch\(\[\]\)\}/);
    expect(SRC).toMatch(/onShowRow=\{showWantedRow\}/);
  });
});

// @vitest-environment node
/**
 * قياس مكسب التصحيح الآمن على تفريغات nova-3 الحقيقية (من benchmark-report.json).
 * opt-in: RUN_CORR_EVAL=1 BENCH_DIR=<فولدر التقرير> npx vitest run correctionImpact
 */
import { describe, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePlateFromTranscript, normalizePlate } from "@/lib/plateParser";
import { scoreWithWantedCorrection, type Prediction } from "@/lib/deepgramBenchmark";

const BENCH_DIR = process.env.BENCH_DIR || "./bench";
const reportPath = join(BENCH_DIR, "benchmark-report.json");
const RUN = process.env.RUN_CORR_EVAL === "1" && existsSync(reportPath);

describe("Correction impact eval", () => {
  it.skipIf(!RUN)("exact% قبل/بعد التصحيح الآمن على تفريغات nova-3", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as { detail: Array<Record<string, string>> };
    const preds: Prediction[] = [];
    for (const row of report.detail) {
      const raw = row["dg-nova-3__raw"] || "";
      if (!raw || raw.includes("__ERROR__")) continue;
      const predicted = normalizePlate(parsePlateFromTranscript(raw).plate || "");
      preds.push({ file: row.file, predicted, truth: row.truth });
    }
    const wanted = preds.map((p) => p.truth ?? "").filter(Boolean);
    const im = scoreWithWantedCorrection(preds, wanted);
    const pct = (n: number) => (im.total ? Math.round((n / im.total) * 100) : 0);
    process.stdout.write(
      `\n===CORR=== total=${im.total} before=${im.before}(${pct(im.before)}%) ` +
      `after=${im.after}(${pct(im.after)}%) corrected=${im.corrected}\n`
    );
  });
});

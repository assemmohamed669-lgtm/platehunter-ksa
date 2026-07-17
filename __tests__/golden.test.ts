import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { extractMultiplePlates } from "@/lib/plateParser";

/**
 * هارنس الـ golden dataset (بذرة) — بيقرا كل ملفات tests/golden/*.json ويشغّلها
 * على مستخرِج اللوحات الحالي. المرحلة ١-ب هتوسّعه ليقيس الدقة على تسجيلات ميدانية
 * حقيقية (append فقط — نفس الشكل). بيشتغل على الـ public API فبيفضل صالح بعد الإنجن.
 */
interface GoldenCase { rawTranscript: string; expectedPlates: string[]; note?: string }
interface GoldenFile { description?: string; cases: GoldenCase[] }

const GOLDEN_DIR = path.join(process.cwd(), "tests", "golden");

describe("golden dataset", () => {
  const files = existsSync(GOLDEN_DIR) ? readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(path.join(GOLDEN_DIR, f), "utf8")) as GoldenFile;
    describe(f, () => {
      for (const c of data.cases) {
        it(`«${c.rawTranscript}» → [${c.expectedPlates.join(" ، ")}]`, () => {
          const got = extractMultiplePlates(c.rawTranscript).map((p) => p.plate);
          expect(got).toEqual(c.expectedPlates);
        });
      }
    });
  }
});

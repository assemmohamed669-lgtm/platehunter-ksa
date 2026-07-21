// @vitest-environment node
/**
 * يقيّم تأثير صيغة الصوت (m4a الأصلي / Opus مضغوط / PCM نضيف) على دقة Deepgram،
 * باستخدام محلّل الإنتاج الحقيقي. opt-in:
 *   RUN_FMT_EVAL=1 BENCH_DIR=<فولدر> npx vitest run formatCompare
 */
import { describe, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parsePlateFromTranscript, normalizePlate } from "@/lib/plateParser";
import { comparePlate, scoreWithWantedCorrection, type Prediction } from "@/lib/deepgramBenchmark";

const BENCH_DIR = process.env.BENCH_DIR || "./bench";
const P = join(BENCH_DIR, "format_transcripts.json");
const RUN = process.env.RUN_FMT_EVAL === "1" && existsSync(P);

describe("Audio format comparison (m4a / opus / pcm)", () => {
  it.skipIf(!RUN)("letters/digits/exact لكل صيغة", () => {
    const data = JSON.parse(readFileSync(P, "utf8")) as Record<string, Record<string, string>>;
    const formats = ["m4a", "opus", "pcm", "kw", "kw2", "kw3"];
    const score: Record<string, { L: number; D: number; X: number; n: number; err: number }> = {};
    for (const f of formats) score[f] = { L: 0, D: 0, X: 0, n: 0, err: 0 };

    for (const row of Object.values(data)) {
      const truth = row.truth;
      for (const f of formats) {
        const raw = row[f] ?? "";
        if (raw.startsWith("__ERR__")) { score[f].err++; continue; }
        score[f].n++;
        const pred = normalizePlate(parsePlateFromTranscript(raw).plate || "");
        const c = comparePlate(pred, truth);
        if (c.lettersCorrect) score[f].L++;
        if (c.digitsCorrect) score[f].D++;
        if (c.exact) score[f].X++;
      }
    }

    let out = "\n=== FORMAT COMPARISON (real parser) ===\n";
    for (const f of formats) {
      const s = score[f];
      const pct = (x: number) => (s.n ? Math.round((x / s.n) * 100) : 0);
      out += `${f.padEnd(5)} letters=${pct(s.L)}%  digits=${pct(s.D)}%  exact=${pct(s.X)}%  (n=${s.n}, errors=${s.err})\n`;
    }
    // التركيبة الكاملة لمسار التشييك: kw2 + تصحيح آمن بقائمة المطلوبين (كل الصح كقائمة)
    const preds: Prediction[] = [];
    const wanted: string[] = [];
    for (const row of Object.values(data)) {
      wanted.push(row.truth);
      const raw = row.kw2 ?? "";
      const pred = raw.startsWith("__ERR__") ? "" : normalizePlate(parsePlateFromTranscript(raw).plate || "");
      preds.push({ file: "", predicted: pred, truth: row.truth });
    }
    const im = scoreWithWantedCorrection(preds, wanted);
    const p = (x: number) => (im.total ? Math.round((x / im.total) * 100) : 0);
    out += `\n=== kw2 + تصحيح آمن بقائمة المطلوبين (مسار التشييك) ===\n`;
    out += `exact قبل التصحيح: ${p(im.before)}%   بعد التصحيح: ${p(im.after)}%   (اتصحّح ${im.corrected})\n`;
    process.stdout.write(out);
  });
});

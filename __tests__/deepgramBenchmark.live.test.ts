// @vitest-environment node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Deepgram Model Benchmark — Live Runner  (الخطوة ١)
 * ═══════════════════════════════════════════════════════════════════════════
 *  بيقارن دقة استخراج اللوحة بين موديلات التفريغ على تسجيلاتك الحقيقية:
 *    • dg-nova-3   (Deepgram nova-3, language=ar)
 *    • dg-nova-2   (Deepgram nova-2, language=ar)
 *    • groq-whisper (Groq whisper-large-v3 — الأساس الحالي عندك)
 *    • dg-whisper  (Deepgram-hosted whisper-large — اختياري: BENCH_DG_WHISPER=1)
 *
 *  ⚠️ ده مش اختبار عادي — بيتّصل بالإنترنت وبيقرا ملفات. متجاهَل تلقائياً في
 *     `npx vitest run` العادي (skipIf) عشان مايكسرش الـ CI. بيشتغل بس لما تدّيه
 *     RUN_DG_BENCHMARK=1.
 *
 *  ── إزاي تشغّله (من جذر المشروع) ─────────────────────────────────────────
 *    1) حطّ تسجيلاتك (٣٠–٥٠ ملف .m4a/.webm/.wav/.aac) في مجلد، مثلاً ./bench
 *    2) (مستحسن) حطّ ملف الحقيقة الأرضية ./bench/labels.json بالشكل:
 *         { "rec1.m4a": "دحق1234", "rec2.m4a": "سصط5678", ... }
 *       من غيره الأداة هتقيس **اتفاق الموديلات** بس (مش الدقة المطلقة).
 *    3) شغّل:
 *
 *    Bash / macOS / Linux:
 *      RUN_DG_BENCHMARK=1 BENCH_DIR=./bench \
 *      DEEPGRAM_KEY=xxxx GROQ_KEY=yyyy \
 *      npx vitest run deepgramBenchmark.live
 *
 *    PowerShell (Windows):
 *      $env:RUN_DG_BENCHMARK=1; $env:BENCH_DIR="./bench";
 *      $env:DEEPGRAM_KEY="xxxx"; $env:GROQ_KEY="yyyy";
 *      npx vitest run deepgramBenchmark.live
 *
 *  ── المخرجات ─────────────────────────────────────────────────────────────
 *    • جدول في الـ console: exactPct / digits / letters / avg letter-errors لكل موديل
 *    • ترتيب الموديلات + الأدق (best) لو فيه labels
 *    • اتفاق الموديلات (لو مفيش labels)
 *    • تقرير كامل JSON في: <BENCH_DIR>/benchmark-report.json (فيه كل تنبؤ + النص الخام)
 *
 *  استخراج اللوحة بيستخدم نفس محلّل الإنتاج (parsePlateFromTranscript) عشان
 *  القياس يعكس ما بيوصل للمستخدم فعلاً — مش تفريغ خام.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { parsePlateFromTranscript, normalizePlate } from "@/lib/plateParser";
import {
  summarizeBenchmark,
  pairwiseAgreement,
  type Prediction,
} from "@/lib/deepgramBenchmark";

const RUN = process.env.RUN_DG_BENCHMARK === "1";
const BENCH_DIR = process.env.BENCH_DIR || "./bench";
const DEEPGRAM_KEY = process.env.DEEPGRAM_KEY || "";
const GROQ_KEY = process.env.GROQ_KEY || "";
const WANT_DG_WHISPER = process.env.BENCH_DG_WHISPER === "1";

const AUDIO_EXT = new Set([".m4a", ".webm", ".wav", ".aac", ".mp3", ".ogg", ".mp4", ".flac", ".opus"]);
const CONTENT_TYPE: Record<string, string> = {
  ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".webm": "audio/webm", ".wav": "audio/wav",
  ".aac": "audio/aac", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".flac": "audio/flac", ".opus": "audio/opus",
};

// نفس معاملات الـ streaming بتاعتك (بلا endpointing — ده pre-recorded) عشان
// القياس يكون عادل ومطابق لإعداداتك: smart_format OFF، أرقام رقمية، بلا ترقيم.
function dgUrl(model: string): string {
  const p = new URLSearchParams({
    model, language: "ar", smart_format: "false", punctuate: "false", numerals: "true",
  });
  return `https://api.deepgram.com/v1/listen?${p.toString()}`;
}

async function transcribeDeepgram(model: string, buf: Buffer, contentType: string): Promise<string> {
  const r = await fetch(dgUrl(model), {
    method: "POST",
    headers: { Authorization: `Token ${DEEPGRAM_KEY}`, "Content-Type": contentType },
    body: buf,
  });
  if (!r.ok) throw new Error(`deepgram ${model} ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
  const j: any = await r.json();
  return (j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function transcribeGroqWhisper(buf: Buffer, contentType: string, ext: string): Promise<string> {
  // الباقة المجانية بترجّع 429 (حد طلبات/دقيقة). نعيد المحاولة مع backoff عشان
  // القياس يكون عادل (كل الملفات تتفرّغ فعلاً مش تسقط بالـ rate-limit).
  for (let attempt = 0; attempt < 6; attempt++) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: contentType }), `audio${ext}`);
    form.append("model", "whisper-large-v3");
    form.append("language", "ar");
    form.append("temperature", "0");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: form,
    });
    if (r.status === 429) {
      const body = await r.text().catch(() => "");
      const m = body.match(/try again in ([\d.]+)s/i);
      const waitMs = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 8000;
      await sleep(Math.min(waitMs, 30000));
      continue;
    }
    if (!r.ok) throw new Error(`groq ${r.status}: ${(await r.text().catch(() => "")).slice(0, 160)}`);
    const j: any = await r.json();
    return (j?.text ?? "").trim();
  }
  throw new Error("groq 429: rate-limited after retries");
}

function extractPlate(transcript: string): string {
  return normalizePlate(parsePlateFromTranscript(transcript).plate || "");
}

describe("Deepgram model benchmark (live)", () => {
  it.skipIf(!RUN)(
    "يقارن dg-nova-3 vs dg-nova-2 vs whisper على تسجيلاتك",
    { timeout: 30 * 60_000 }, // 30 دقيقة — تفريغ عشرات الملفات على كذا موديل
    async () => {
      if (!existsSync(BENCH_DIR)) throw new Error(`مجلد التسجيلات مش موجود: ${BENCH_DIR}`);
      const files = readdirSync(BENCH_DIR).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase())).sort();
      expect(files.length, `مفيش ملفات صوت في ${BENCH_DIR}`).toBeGreaterThan(0);

      // ground truth اختياري
      const labelsPath = process.env.BENCH_LABELS || join(BENCH_DIR, "labels.json");
      let labels: Record<string, string> = {};
      if (existsSync(labelsPath)) {
        try { labels = JSON.parse(readFileSync(labelsPath, "utf8")); } catch { labels = {}; }
      }
      const labeled = Object.keys(labels).length;

      // أي محركات نقدر نشغّلها حسب المفاتيح المتاحة
      const engines: string[] = [];
      // مؤكّد بالاختبار: Deepgram بيدعم العربي على nova-3 فقط (nova-2/general/enhanced
      // كلهم بيرجّعوا "No such model/language/tier ... try Nova-3 tier"). فموديل
      // Deepgram الوحيد للعربي = nova-3، ونقارنه بـ Groq whisper-large-v3.
      if (DEEPGRAM_KEY) { engines.push("dg-nova-3"); if (WANT_DG_WHISPER) engines.push("dg-whisper"); }
      if (GROQ_KEY) engines.push("groq-whisper");
      expect(engines.length, "محتاج DEEPGRAM_KEY و/أو GROQ_KEY").toBeGreaterThan(0);

      // eslint-disable-next-line no-console
      console.log(`\n🎧 ${files.length} تسجيل · ${labeled} مُعلّم · محركات: ${engines.join(", ")}\n`);

      const byModel: Record<string, Prediction[]> = {};
      for (const e of engines) byModel[e] = [];
      const detail: Array<Record<string, string>> = [];

      for (const file of files) {
        const ext = extname(file).toLowerCase();
        const ct = CONTENT_TYPE[ext] || "audio/mp4";
        const buf = readFileSync(join(BENCH_DIR, file));
        const truth = labels[file] || "";
        const row: Record<string, string> = { file, truth };

        for (const e of engines) {
          let transcript = "", predicted = "";
          try {
            if (e === "dg-nova-3") transcript = await transcribeDeepgram("nova-3", buf, ct);
            else if (e === "dg-general") transcript = await transcribeDeepgram("general", buf, ct);
            else if (e === "dg-whisper") transcript = await transcribeDeepgram("whisper-large", buf, ct);
            else if (e === "groq-whisper") transcript = await transcribeGroqWhisper(buf, ct, ext);
            predicted = extractPlate(transcript);
          } catch (err) {
            transcript = `__ERROR__ ${err instanceof Error ? err.message : String(err)}`;
          }
          byModel[e].push({ file, predicted, truth });
          row[`${e}__plate`] = predicted;
          row[`${e}__raw`] = transcript;
        }
        detail.push(row);
        // eslint-disable-next-line no-console
        console.log(`  ${file}  ${truth ? `[صح: ${truth}]` : ""}  ` +
          engines.map((e) => `${e}=${row[`${e}__plate`] || "∅"}`).join("  "));
      }

      const summary = summarizeBenchmark(byModel);
      const agreement = pairwiseAgreement(byModel);

      // eslint-disable-next-line no-console
      console.log("\n📊 النتيجة (مرتّبة الأدق أولاً):");
      for (const s of summary.scores) {
        // eslint-disable-next-line no-console
        console.log(
          `  ${s.model.padEnd(13)}  exact=${String(s.exactPct).padStart(3)}%  ` +
          `digits=${s.digitsCorrect}/${s.total}  letters=${s.lettersCorrect}/${s.total}  ` +
          `avgLetterErr=${s.avgLetterErrors.toFixed(2)}  empty=${s.emptyPredictions}`
        );
      }
      if (summary.best) {
        // eslint-disable-next-line no-console
        console.log(`\n🏆 الأدق: ${summary.best}  (${summary.labeled} تسجيل مُعلّم)`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`\n⚠️  مفيش labels — الدقة المطلقة مش متقاسة. اتفاق الموديلات:`);
        for (const a of agreement) {
          // eslint-disable-next-line no-console
          console.log(`     ${a.a} ↔ ${a.b}: ${a.agreePct}% (${a.comparable} ملف)`);
        }
        // eslint-disable-next-line no-console
        console.log(`     ➜ اعمل labels.json للملفات اللي الموديلات اختلفت فيها عشان تقيس الدقة الحقيقية.`);
      }

      const reportPath = join(BENCH_DIR, "benchmark-report.json");
      writeFileSync(reportPath, JSON.stringify({ summary, agreement, detail }, null, 2), "utf8");
      // eslint-disable-next-line no-console
      console.log(`\n📄 تقرير كامل: ${reportPath}\n`);

      expect(summary.scores.length).toBe(engines.length);
    }
  );
});

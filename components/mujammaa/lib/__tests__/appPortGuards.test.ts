// @vitest-environment node
/**
 * 🧮 حرّاس نقل المجمّع لقناص (١٦ أكتوبر ٢٠٢٦) — حاجات بتكسر التطبيق نفسه مش الصفحة بس.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BATCH_MIME_CANDIDATES } from "../batchRecorder";

const ROOT = join(__dirname, "..", "..");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe("🍏 آيفون", () => {
  it("مافيش lookbehind `(?<=` / `(?<!` في كود المجمّع — آيفون قبل 16.4 بيدّي شاشة بيضا للتطبيق كله", () => {
    const bad = sources(ROOT)
      .filter((p) => /\(\?<[=!]/.test(readFileSync(p, "utf8")))
      .map((p) => relative(ROOT, p));
    expect(bad).toEqual([]);
  });

  it("المسجّل: Opus/WebM الأول (أندرويد زي المعمل بالظبط) و`audio/mp4` آخر احتياطي للآيفون", () => {
    expect(BATCH_MIME_CANDIDATES[0]).toBe("audio/webm;codecs=opus");
    expect(BATCH_MIME_CANDIDATES.slice(0, 3)).toEqual(["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]);
    expect(BATCH_MIME_CANDIDATES[BATCH_MIME_CANDIDATES.length - 1]).toBe("audio/mp4");
  });
});

describe("🎨 الستايل محبوس جوّه .mj-root", () => {
  /** كل محدّدات القواعد (من غير @keyframes/@media/@layer نفسهم ولا أجزاء الـkeyframes) */
  function selectors(css: string): string[] {
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const noKeyframes = noComments.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
    const out: string[] = [];
    for (const m of noKeyframes.matchAll(/([^{}@;]+)\{[^{}]*\}/g)) {
      for (const s of m[1].split(",")) if (s.trim()) out.push(s.trim());
    }
    return out;
  }

  it("mujammaa.css: كل قاعدة تبدأ بـ.mj-root", () => {
    const sels = selectors(readFileSync(join(ROOT, "mujammaa.css"), "utf8"));
    expect(sels.length).toBeGreaterThan(5);
    expect(sels.filter((s) => !s.startsWith(".mj-root"))).toEqual([]);
  });

  it("globals.css: بلوك المجمّع كله `.mj-root :where(…)` جوّه @layer components", () => {
    const g = readFileSync(join(ROOT, "..", "..", "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");
    const i = g.indexOf("🧮 المجمّع (`components/mujammaa`)");
    expect(i).toBeGreaterThan(0);
    const block = g.slice(g.indexOf("@layer components {", i));
    const sels = selectors(block.slice("@layer components {".length));
    expect(sels.length).toBeGreaterThan(10);
    expect(sels.filter((s) => !s.startsWith(".mj-root :where("))).toEqual([]);
  });
});

describe("حدود الصفحة", () => {
  it("كود المجمّع مابيلمسش سوبابيز ولا تخزين التطبيق بالكتابة (قراية ملف التشييك بس)", () => {
    for (const p of sources(ROOT)) {
      const s = readFileSync(p, "utf8");
      const rel = relative(ROOT, p);
      expect(s, rel).not.toMatch(/supabase/i);
      expect(s, rel).not.toMatch(/\b(saveUploadedFile|deleteUploadedFile|saveRecording|deleteRecording)\b/);
    }
  });
});

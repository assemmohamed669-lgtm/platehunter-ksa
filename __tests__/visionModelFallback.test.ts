import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * حارس — **موديل الرؤية مايتدفنش في نص الطلب تاني.**
 *
 * Groq شالت موديل الرؤية **مرتين** والكاميرا والشاص وقفوا عند كل المناديب:
 *   ٢٠٢٦/٦/١٧  `meta-llama/llama-4-scout-17b-16e-instruct`
 *   ٢٠٢٦/٩/٢٦  `qwen/qwen3.6-27b`  ← بلاغ المالك بصورة الشاشة
 *
 * في المرتين السبب واحد: اسم الموديل مكتوب حرفياً جوّه جسم الطلب، فأي شيل عند
 * المزوّد = تعطّل كامل ومحتاج نشر كود. دلوقتي بقى قايمة + متغيّر بيئة.
 */
describe("موديل الرؤية — قايمة وبديل مش اسم مدفون", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "read-plate", "route.ts"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  const code = src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("الحارس بيقرا الملف فعلاً", () => {
    expect(code.length).toBeGreaterThan(500);
    expect(code).toContain("api.groq.com");
  });

  it("🔴 فيه قايمة موديلات مش موديل واحد", () => {
    expect(code).toContain("VISION_MODELS");
  });

  it("🔴 القايمة بتتقرا من متغيّر بيئة — يتصلّح من Vercel بلا نشر", () => {
    expect(code).toContain("process.env.GROQ_VISION_MODEL");
  });

  it("🔴 الموديل اللي بيتبعت جاي من القايمة مش نص مكتوب", () => {
    // `model: "qwen/..."` حرفياً = رجوع الباج.
    expect(code).not.toMatch(/model:\s*"[^"]*qwen/);
    expect(code).not.toMatch(/model:\s*"[^"]*llama/);
  });

  it("🔴 الموديلات المشالة مش موجودة في الكود", () => {
    expect(code).not.toContain("qwen3.6-27b");
    expect(code).not.toContain("llama-4-scout");
  });

  it("🔴 بيفرّق بين «الموديل اتشال» وأي خطأ تاني", () => {
    // من غير التفرقة دي، أول خطأ شبكة هيخلّيه يلفّ على كل الموديلات بلا داعي.
    expect(code).toContain("isModelGone");
    expect(code).toContain("does not exist");
  });

  it("🔴 لما كله يتشال بيرجّع رسالة عربية للمندوب مش JSON خام", () => {
    expect(code).toContain("vision_model_gone");
    expect(code).toMatch(/hint:\s*"[^"]*يدوياً/);
  });
});

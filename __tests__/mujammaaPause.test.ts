/**
 * ⏸️ «وقف مؤقت» / «كمّل التسجيل» في المجمّع (المالك ٢٢ أكتوبر ٢٠٢٦): «زر … يوقف التسجيل دة مؤقت الي حين ما يطلع من
 * مكان مفيهوش لوحات … ويرجع بعدين يدوس استئناف التسجيل يشتغل معاه ويكمل ويقول لوحات علي نفس الملف» + «كل لوحه
 * … يتاخدل ليها الموقع وقت ماقالها المندوب».
 *
 * المنطق نفسه متغطّي في `recPauses` · `batchRecorder` · `spokenTime` · `platePin` · `clipStore` · `runTelemetry`.
 * هنا الربط في الصفحة (مكوّن React من غير اختبار تشغيل): الوقفات بتمشي مع المقطع لحد الدبوس ووقت النطق والتقرير،
 * والزرار للسوبر أدمن الأول («السوبر أدمن الأول، وبموافقة»).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MJ_PAUSE_FOR_DELEGATES } from "@/lib/mujammaaAccess";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const PAGE = read("components/mujammaa/pages/BatchPage.tsx");
const SECTION = read("components/mujammaa/MujammaaSection.tsx");
const REG = read("app/(app)/registration/page.tsx");

describe("⏸️ وقف مؤقت — مين يشوفه", () => {
  it("للسوبر أدمن بس دلوقتي (المفتاح للمناديب مقفول لحد ما المالك يجرّب)", () => {
    expect(MJ_PAUSE_FOR_DELEGATES).toBe(false);
    expect(REG).toMatch(/canPause=\{superOk \|\| MJ_PAUSE_FOR_DELEGATES\}/);
    expect(SECTION).toMatch(/canPause=\{canPause\}/);
  });

  it("الزرار بيظهر وهو بيسجّل بس، ولمين مسموحله", () => {
    expect(PAGE).toMatch(/canPause = false,/);
    expect(PAGE).toMatch(/phase === "recording" && canPause && \(/);
    expect(PAGE).toMatch(/وقف مؤقت/);
    expect(PAGE).toMatch(/كمّل التسجيل/);
  });
});

describe("⏸️ الوقفات بتمشي مع المقطع لحد كل لوحة", () => {
  it("بتتحفظ مع المقطع وهو بيسجّل (كل ثانية) وفي قفله", () => {
    expect(PAGE).toMatch(/rawFixes: s\.col\.list\(\),\s*stamp: s\.stamp\.toJSON\(\),\s*pauses: s\.rec\.pauses,/);
    expect(PAGE).toMatch(/startEpoch: s\.startEpoch,\s*mime: blob\?\.type \|\| s\.rec\.mime \|\| "audio\/webm",\s*pauses: s\.rec\.pauses,/);
  });

  it("سياق التفريغ بياخد وقفات المقطع ⇒ وقت النطق (الموقع/الوقت/الحي/الجراج)", () => {
    expect(PAGE).toMatch(/fixes: next\.fixes,\s*pauses: next\.pauses,\s*source: next\.source,/);
    expect(PAGE).toMatch(/lastKnownAbsMs: lastKnownSpokenAtRef\.current,\s*pauses: jobCtxRef\.current\?\.pauses,/);
  });

  it("الدبوس بعد التفريغ والتقرير بالوقفات", () => {
    expect(PAGE).toMatch(/fixes: next\.fixes,\s*pauses: next\.pauses,\s*startEpoch: next\.startedAtMs,/);
    expect(PAGE).toMatch(/startedAtMs: next\.startedAtMs,\s*pauses: next\.pauses,/);
  });
});

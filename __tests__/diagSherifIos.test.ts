/**
 * 🩺 شريف فرج ايفون (آيفون 1.4) — المالك (٢٣ نوفمبر ٢٠٢٦): «الايفون اللي هيجرب ل مستخدم اسمه شريف فرج ف عايزك بردو تعمل
 * صندوق اسود عنده علشان نعرف ايه اللي بيحصل».
 *
 * بيجرّب #553 على الآيفون: العربية المطلوبة وهو برّه البرنامج ⇒ إشعار + النغمة (المايك بيفضل لحد ما يرجع). الصندوق الكامل
 * بيورّي: `rv2-bg-plan` (القرار) · `rv2-bg-wanted` (الإشعار اتبعت؟ لكام موبايل؟) · `siren` / `siren-2s` (حالة الصوت —
 * `ctx=interrupted` = الآيفون قطعه) · `app` / `vis` (برّه ولا جوّه) · `rv2-rec` · `rv2-mic`. شيله أول ما النتيجة تبان.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAG_AGENT_IDS, diagEnabledFor } from "@/lib/deviceDiag";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const VP = read("app/(app)/registration-v2/page.tsx");
const SHERIF = "f958b3d0-85bf-4f0e-8ed6-53556df69250";

describe("شريف فرج ايفون على الصندوق الكامل", () => {
  it("في القايمة", () => {
    expect(DIAG_AGENT_IDS).toContain(SHERIF);
    expect(diagEnabledFor(SHERIF)).toBe(true);
  });

  it("سطور تجربة الإشعار والنغمة برّه البرنامج موجودة في Voice PRO", () => {
    expect(VP).toMatch(/diagNote\("rv2-bg-plan", \{ hold: bgPlan\.holdService, mic: bgPlan\.keepMic \}\)/);
    expect(VP).toMatch(/diagNote\("rv2-bg-wanted", \{ \.\.\.r \}\)/);
  });

  it("مكرّرش (كل حساب مرة واحدة)", () => {
    expect(new Set(DIAG_AGENT_IDS).size).toBe(DIAG_AGENT_IDS.length);
  });
});

/**
 * 🩺 حامد محمد 1 (أندرويد 1.8) — المالك (١٢ نوفمبر ٢٠٢٦): «بيقولي ان البرنامج بيفصل معاه والصوت اوقات كتير مش بيستجيب …
 * عايز اعرف هل دة فعلا اللي بيحصل معاه ولا حاجه تاني» ⇒ «اعمل 1 و 2».
 *
 * الصندوق الخفيف ورّانا الوقفات (٤ مكالمات · ٢١ «وقف» بإيده)، بس **مش** إذا كانت كل لوحة بيقولها بتوصل ويترد عليها:
 * مراقبة Voice PRO (كل طلب بكوده ووقته) شغّالة للسوبر أدمن واللي في `DIAG_AGENT_IDS` بس، وسطور النت في الخفيف حدها ٣٠
 * لكل فتحة صفحة وصفحته مفتوحة من ٣ أيام. ⇒ يتحط في القايمة (هو بس) — شيله أول ما السبب يبان.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAG_AGENT_IDS, diagEnabledFor } from "@/lib/deviceDiag";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const VP = read("app/(app)/registration-v2/page.tsx");
const HAMED = "7009368e-6052-4011-a12c-83bd17ad44ee";

describe("حامد محمد 1 على الصندوق الكامل + مراقبة Voice PRO", () => {
  it("في القايمة", () => {
    expect(DIAG_AGENT_IDS).toContain(HAMED);
    expect(diagEnabledFor(HAMED)).toBe(true);
  });

  it("القايمة هي اللي بتشغّل مراقبة كل طلب في Voice PRO (مش حاجة تانية لازم تتفتح)", () => {
    expect(VP).toMatch(/telRef\.current = !\(isSuper \|\| diagEnabledFor\(telAgentId\)\) \? null : startTelemetrySession\(\{/);
  });

  it("مكرّرش (كل حساب مرة واحدة)", () => {
    expect(new Set(DIAG_AGENT_IDS).size).toBe(DIAG_AGENT_IDS.length);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ALERT_TONES } from "@/lib/alertTones";
import { APPEARANCE_COLLAPSE_FOR_ALL } from "@/lib/appSettings";

/**
 * المالك (١٤ أكتوبر ٢٠٢٦): «غير اسمائهم سميهم بالترتيب قناص 1 قناص 2 وهكذا · وحط سهم للقوالب تبقي مقفوله لما المندوب
 * يدوس عليها تنسدل ل تحت وتظهر لانها واخده مساحه كبيرة ودايما مفتوحه وايضا ل نغمه التحصيل لما المندوب يدوس عليها
 * ينسدلو ويختار».
 */
const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

describe("🔴 أسامي النغمات بالترتيب", () => {
  it("قناص 1 … قناص 12 — والافتراضي زي ما هو", () => {
    expect(ALERT_TONES[0].name).toBe("صفّارة البرنامج (الافتراضي)");
    expect(ALERT_TONES.filter((t) => t.file).map((t) => t.name))
      .toEqual(Array.from({ length: 12 }, (_, i) => `قناص ${i + 1}`));
  });
});

describe("🔴 القوالب ونغمة التحصيل بيتقفلوا بسهم", () => {
  const page = read("app/(app)/appearance/page.tsx");
  it("🛑 السوبر أدمن الأول — المناديب الصفحة عندهم زي ما هي لحد «انشر للكل»", () => {
    expect(APPEARANCE_COLLAPSE_FOR_ALL).toBe(false);
    expect(page).toMatch(/const collapsible = APPEARANCE_COLLAPSE_FOR_ALL \|\| isSuper;/);
  });
  it("القوالب مقفولة في الأول، والدوسة على السهم بتفتحها", () => {
    expect(page).toMatch(/const \[tplOpen, setTplOpen\] = useState\(false\);/);
    expect(page).toMatch(/aria-expanded=\{tplOpen\}/);
    expect(page).toMatch(/\{\(!collapsible \|\| tplOpen\) && \(/);
  });
  it("نغمة التحصيل مقفولة في الأول، والدوسة بتنزّل النغمات", () => {
    expect(page).toMatch(/const \[toneOpen, setToneOpen\] = useState\(false\);/);
    expect(page).toMatch(/aria-expanded=\{toneOpen\}/);
    expect(page).toMatch(/\{toneOpen && \(/);
  });
});

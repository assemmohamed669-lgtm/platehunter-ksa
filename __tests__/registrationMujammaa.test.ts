/**
 * 🧮 المجمّع جوّه صفحة «التسجيل» — للسوبر أدمن بس (١٦ أكتوبر ٢٠٢٦).
 *
 * المالك: «تنقل شغل المجمع زي ماهو في صفحه التسجيل اللي علي قناص اللي هيا مخفيه
 * عن المناديب وظاهرة للسوبر ادمن فقط». الحرّاس دول بيتأكدوا إن:
 *   · المجمّع مابيتعرضش غير بعد تأكيد `is_super === true` (الحارس القديم بيعدّي
 *     الصفحة لو الفحص فشل — فالمجمّع ليه تأكيده هو، ويقفل لو مافيش تأكيد)
 *   · التسجيل القديم زي ما هو (مالمسناش ولا سطر جوّاه) — بس بقى ورا مفتاح
 *   · المفتاح مقفول وفيه تسجيل/تفريغ شغّال في القديم (عشان الميك مايفضلش مفتوح)
 *   · كود المجمّع بيتحمّل لما يتفتح بس (`next/dynamic`, ssr:false) — مش على كل فتحة
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "..", "app", "(app)", "registration", "page.tsx"), "utf8");

describe("🧮 المجمّع في «التسجيل»", () => {
  it("بيتحمّل بـnext/dynamic من غير SSR", () => {
    expect(SRC).toMatch(/import dynamic from "next\/dynamic";/);
    expect(SRC).toMatch(/dynamic\(\s*\(\) => import\("@\/components\/mujammaa\/MujammaaSection"\)/);
    expect(SRC).toMatch(/ssr: false/);
  });

  it("🔴 superOk بيتعلّم true بس لما is_super === true (يقفل لو الفحص فشل)", () => {
    expect(SRC).toMatch(/const \[superOk, setSuperOk\] = useState\(false\);/);
    expect(SRC).toMatch(/if \(prof\?\.is_super === true\) setSuperOk\(true\);/);
    expect((SRC.match(/setSuperOk\(true\)/g) ?? []).length).toBe(1);
    // الحارس القديم زي ما هو
    expect(SRC).toMatch(/if \(!prof\?\.is_super\) router\.replace\("\/instant-check"\);/);
  });

  it("المجمّع ورا superOk — وبعد أول فتحة بيفضل متحمّل ومخفي (التسجيل والتفريغ مايقفوش لما تبدّل)", () => {
    expect(SRC).toMatch(/\{superOk && mjOpened && \(\s*<div hidden=\{regMode !== "mujammaa"\}>/);
    expect(SRC).toMatch(/if \(superOk && regMode === "mujammaa"\) setMjOpened\(true\);/);
    expect((SRC.match(/<MujammaaSection /g) ?? []).length).toBe(1);
    expect(SRC).toMatch(/onBusyChange=\{setMjBusy\}/);
  });

  it("🔴 مافيش محتوى قبل ما فحص الحساب يخلص (تسجيل قديم يبدأ ويستخبى) — وبحد أقصى ٤ث", () => {
    expect(SRC).toMatch(/const \[superChecked, setSuperChecked\] = useState\(false\);/);
    expect(SRC).toMatch(/finally \{ setSuperChecked\(true\); \}/);
    expect(SRC).toMatch(/setTimeout\(\(\) => setSuperChecked\(true\), 4000\)/);
    expect(SRC).toMatch(/\{superChecked && !\(superOk && regMode === "mujammaa"\) && \(/);
  });

  it("التسجيل القديم ورا المفتاح — ومكوّناته لسه موجودة زي ما هي", () => {
    expect(SRC).toMatch(/\{superChecked && !\(superOk && regMode === "mujammaa"\) && \(/);
    expect(SRC).toMatch(/<RecordingsTable/);
    expect(SRC).toMatch(/handleTranscribeAndSave/);
    expect(SRC).toMatch(/scheduleFieldChecksUpload\(/);
  });

  it("المفتاح ظاهر للسوبر بس، ومقفول وفيه تسجيل/تفريغ شغّال في القديم", () => {
    expect(SRC).toMatch(/\{superOk && \(\s*<div[^>]*data-testid="reg-mode-switch"/);
    // وكمان وهو بيسجّل في المجمّع (الميك واحد)
    expect(SRC).toMatch(/disabled=\{isRecording \|\| isTranscribing \|\| reAnalyzing \|\| mjBusy\}/);
  });

  it("الوضع بيتحفظ على الجهاز (try/catch) — والافتراضي المجمّع", () => {
    expect(SRC).toMatch(/const LS_REG_MODE = "ph:registration:mode";/);
    expect(SRC).toMatch(/useState<"classic" \| "mujammaa">\("mujammaa"\)/);
    expect(SRC).toMatch(/localStorage\.setItem\(LS_REG_MODE, m\)/);
  });
});

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
 *
 * 🧮➡️ ١٨ أكتوبر: المجمّع بقى للمشترك في **كل** الخدمات كمان (`canUseMujammaa`) — المالك:
 * «متاح مبدأيا ل اللي مشترك في كل خدمات البرنامج … اللي مشترك صوت بس واللي مشترك فرز بس ميظهرش
 * معاهم». المندوب بياخد المجمّع **بس** (من غير التسجيل القديم ولا المفتاح) و`advanced` مقفول
 * («الشروحات … تظهر بس للسوبر ادمن فقط»)، والسوبر أدمن زي ما هو بالحرف.
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
    // الحارس: مش سوبر **ومش** مشترك في كل الخدمات ⇒ برّه الصفحة
    expect(SRC).toMatch(/const mjAllowed = canUseMujammaa\(prof\);/);
    expect(SRC).toMatch(/if \(!prof\?\.is_super && !mjAllowed\) router\.replace\("\/instant-check"\);/);
  });

  it("🧮➡️ المندوب: المجمّع بس بإذن «كل الخدمات» — وأدوات السوبر أدمن (advanced) مقفولة عليه", () => {
    expect(SRC).toMatch(/const \[mjAgentOk, setMjAgentOk\] = useState\(false\);/);
    expect(SRC).toMatch(/else if \(mjAllowed\) setMjAgentOk\(true\);/);
    expect((SRC.match(/setMjAgentOk\(true\)/g) ?? []).length).toBe(1);
    // الاشتراك من نفس أعمدة الشريط والتشييك
    expect(SRC).toMatch(/\.select\("is_super, voicex_enabled, voicex_until, rest_pages_enabled, rest_until"\)/);
    expect(SRC).toMatch(/advanced=\{superOk\}/);
    expect(SRC).toMatch(/const mjShown = superOk \? regMode === "mujammaa" : mjAgentOk;/);
    // التصدير للسجلات من صفحة التسجيل (الحفظ برّه المجمّع)
    expect(SRC).toMatch(/onExportToRecords=\{exportMujammaa\}/);
    expect(SRC).toMatch(/return saveMujammaaRecords\(entries, \{/);
  });

  it("المجمّع ورا superOk (أو كل الخدمات) — وبعد أول فتحة بيفضل متحمّل ومخفي (التسجيل والتفريغ مايقفوش لما تبدّل)", () => {
    expect(SRC).toMatch(/\{\(superOk \|\| mjAgentOk\) && mjOpened && \(\s*<div hidden=\{!mjShown\}>/);
    expect(SRC).toMatch(/if \(\(superOk && regMode === "mujammaa"\) \|\| mjAgentOk\) setMjOpened\(true\);/);
    expect((SRC.match(/<MujammaaSection[\s>]/g) ?? []).length).toBe(1);
    expect(SRC).toMatch(/onBusyChange=\{setMjBusy\}/);
  });

  it("📍 الموقع كل ثانية (أندرويد) شغّال والمجمّع **ظاهر** بس — مستخبي ورا «التسجيل القديم» بيتقفل (بطارية)", () => {
    expect(SRC).toMatch(/<MujammaaSection[\s\S]*?visible=\{mjShown\}/);
    const section = readFileSync(join(__dirname, "..", "components", "mujammaa", "MujammaaSection.tsx"), "utf8");
    expect(section).toMatch(/visible = true,/);
    expect(section).toMatch(/visible=\{visible\}/);
    const batch = readFileSync(join(__dirname, "..", "components", "mujammaa", "pages", "BatchPage.tsx"), "utf8");
    expect(batch).toMatch(/const gps = useGps\(visible\);/);
  });

  it("🔴 مافيش محتوى قبل ما فحص الحساب يخلص (تسجيل قديم يبدأ ويستخبى) — وبحد أقصى ٤ث", () => {
    expect(SRC).toMatch(/const \[superChecked, setSuperChecked\] = useState\(false\);/);
    expect(SRC).toMatch(/finally \{ setSuperChecked\(true\); \}/);
    expect(SRC).toMatch(/setTimeout\(\(\) => setSuperChecked\(true\), 4000\)/);
    expect(SRC).toMatch(/\{superChecked && !mjShown && !mjAgentOk && \(/);
  });

  it("التسجيل القديم ورا المفتاح (للسوبر أدمن) — والمندوب مابيشوفوش — ومكوّناته لسه موجودة زي ما هي", () => {
    expect(SRC).toMatch(/\{superChecked && !mjShown && !mjAgentOk && \(/);
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

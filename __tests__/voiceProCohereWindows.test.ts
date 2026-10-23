/**
 * 🏷️ Voice PRO + كوهير — النوع اللي بيتقال **بعد** اللوحة (المالك ٢٣ أكتوبر ٢٠٢٦: «مش بيطلع كل الانواع والملاحظات اللي
 * بقولها»).
 *
 * كان بيسأل كوهير **بالنافذة اللي اللوحة اتقرت فيها أول مرة** بس — وهي بتخلص بعد آخر رقم بشوية، فالنوع اللي بيتقال
 * بعدها بيقع برّه. قياس على ٤٠٠ لوحة من صوت المجمّع الحقيقي (٢٤٠ بنوع · ١٦٠ من غير) بنفس قصّ Voice PRO:
 *   النافذة الأولى بس:                                النوع ٦٣٪ · الملاحظة ٨/١٥ · سؤال ١ للوحة
 *   الأولى + اللي بعدها (+١.٥ث) + التالتة (+٣ث) لو لسه مافيش نوع: النوع ٨٨٪ · الملاحظة ١٣/١٥ · ٢.٥ سؤال
 *   وفي الاتنين: ٠ نوع غلط و٠ نوع على لوحة ماتقالش بعدها حاجة (القصّ عند أرقام اللوحة هو الحارس).
 * + النوع والملاحظة كل واحد بيتملي لوحده (كان الصف اللي خد ملاحظة مابياخدش نوع بعدها) · «ديانا» = «دينه» (قرار المالك
 *   ٣ أكتوبر — زي المجمّع).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fillTypeNote, followUpAsks, TYPE_FOLLOW_GIVEUP_MS, type TypeFollow } from "@/lib/typeForPlate";
import { scanTypeAndNote } from "@/lib/vehicleTypeScan";

const PAGE = readFileSync(path.join(process.cwd(), "app/(app)/registration-v2/page.tsx"), "utf8");

describe("⏩ followUpAsks — إمتى نسأل بالنوافذ اللي بعد اللوحة", () => {
  const P: TypeFollow[] = [{ plate: "ابح1234", tMs: 10_000, step: 0 }];
  const none = () => false;

  it("قبل +١.٥ث ⇒ لسه مستنية", () => {
    const r = followUpAsks(P, 10_900, none);
    expect(r.plates).toEqual([]);
    expect(r.pending).toEqual(P);
  });

  it("النافذة اللي بعدها (+١.٥ث) ⇒ نسأل دايماً حتى لو اللوحة خدت نوع", () => {
    const r = followUpAsks(P, 11_500, () => true);
    expect(r.plates).toEqual(["ابح1234"]);
    expect(r.pending).toEqual([{ plate: "ابح1234", tMs: 10_000, step: 1 }]);
  });

  it("التالتة (+٣ث) ⇒ بس لو لسه مافيش نوع، وبعدها اللوحة بتخلص", () => {
    const after = [{ plate: "ابح1234", tMs: 10_000, step: 1 }];
    expect(followUpAsks(after, 13_000, none)).toEqual({ plates: ["ابح1234"], pending: [] });
    expect(followUpAsks(after, 13_000, () => true)).toEqual({ plates: [], pending: [] });
  });

  it("نافذة بعيدة أوي (فات وقتها) ⇒ تتشال من غير سؤال", () => {
    expect(followUpAsks(P, 10_000 + TYPE_FOLLOW_GIVEUP_MS + 1, none)).toEqual({ plates: [], pending: [] });
  });

  it("لوحتين في نفس الوقت ⇒ الاتنين بيتسألوا بنفس النافذة", () => {
    const two: TypeFollow[] = [
      { plate: "ابح1234", tMs: 10_000, step: 0 },
      { plate: "حطس5678", tMs: 10_200, step: 0 },
    ];
    expect(followUpAsks(two, 11_500, none).plates).toEqual(["ابح1234", "حطس5678"]);
  });
});

describe("✍️ fillTypeNote — الناقص بس، واللي المندوب اختاره بإيده مايتلمسش", () => {
  it("الصف اللي خد ملاحظة ياخد النوع بعدها", () => {
    expect(fillTypeNote({ type: null, note: "مركونه" }, { type: "ونيت", note: null })).toEqual({ type: "ونيت", note: "مركونه" });
  });
  it("الصف اللي خد نوع ياخد الملاحظة بعدها — والنوع مايتغيّرش", () => {
    expect(fillTypeNote({ type: "ونيت", note: null }, { type: "فان", note: "تنده" })).toEqual({ type: "ونيت", note: "تنده" });
  });
  it("المندوب مسح النوع بإيده ⇒ كوهير مايرجّعهوش", () => {
    expect(fillTypeNote({ type: null, note: null, edited: { type: true } }, { type: "ونيت", note: null })).toBeNull();
  });
  it("مافيش جديد ⇒ null (الصف مايتعادش رسمه)", () => {
    expect(fillTypeNote({ type: "ونيت", note: "تنده" }, { type: "فان", note: "مركونه" })).toBeNull();
    expect(fillTypeNote({ type: null, note: null }, null)).toBeNull();
  });
});

describe("«ديانا» = «دينه» زي المجمّع (قرار المالك ٣ أكتوبر)", () => {
  const say = (w: string) => scanTypeAndNote(`ا ط ق سته تلاته اتنين سته ${w}`, { afterPlate: "اطق6326" }).type;
  it("ديانا / ديانة / دينا ⇒ دينه", () => {
    expect(say("ديانا")).toBe("دينه");
    expect(say("ديانة")).toBe("دينه");
    expect(say("دينا")).toBe("دينه");
  });
});

describe("ربط الصفحة", () => {
  it("كوهير بيرد ⇒ اللوحات المطلوبة بالاسم بتتقصّ عند أرقامها هي + الناقص بس بيتملي", () => {
    expect(PAGE).toMatch(/const askType = useCallback\(async \(wav: Blob, tMs: number, forPlates: readonly string\[\] = \[\]\) => \{/);
    expect(PAGE).toMatch(/const f = fillTypeNote\(r, pick\);/);
    expect(PAGE).not.toMatch(/if \(r\.type \|\| r\.note\) return r;/);
  });

  it("اللوحة لما تتأكّد بتستنى النوافذ اللي بعدها (واللي وصلت قبل التأكيد بتتسأل على طول)", () => {
    expect(PAGE).toMatch(/typeFollowRef\.current = \[\.\.\.typeFollowRef\.current, \{ plate, tMs: meta\.tMs, step: 0 \}\];/);
    expect(PAGE).toMatch(/for \(const bw of winBufRef\.current\.filter\(\(x\) => x\.tMs > meta\.tMs\)\.sort\(\(a, b\) => a\.tMs - b\.tMs\)\) followWindow\(bw\.wav, bw\.tMs\);/);
  });

  it("كل نافذة جديدة بتتعدّى على الطابور (`followUpAsks`) — والطابور بيتصفّر مع كل تشغيل", () => {
    expect(PAGE).toMatch(/onAudioWindow: \(wav, tMs\) => \{\s*winBufRef\.current = pruneWindows\(\[\.\.\.winBufRef\.current, \{ tMs, wav \}\], tMs\);\s*followWindow\(wav, tMs\);/);
    expect(PAGE).toMatch(/typeQueueRef\.current = \[\]; winBufRef\.current = \[\]; askedWinRef\.current = new Set\(\); typeFollowRef\.current = \[\];/);
  });
});

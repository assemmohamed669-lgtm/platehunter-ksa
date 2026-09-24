import { describe, it, expect } from "vitest";
import { sawtiHiddenFor, sawtiTabVisible } from "@/lib/sawtiHidden";

/**
 * 🙈 المالك (٢٤ سبتمبر): «ابدأ اخفي صفحة صوتي» — Voice PRO بقت البديل.
 * 🔒 السوبر أدمن الأول (قاعدته). ومفيش شغل يضيع: لو فيه لوحات في «صوتي» لسه ماتصدّرتش،
 * التاب بيفضل ظاهر لحد ما المندوب يخلّصها (بتتشال من «صوتي» بعد التصدير).
 */
describe("sawtiHiddenFor", () => {
  it("🔒 السوبر أدمن ⇒ مستخبية · الباقي ⇒ ظاهرة زي ما هي", () => {
    expect(sawtiHiddenFor(true)).toBe(true);
    expect(sawtiHiddenFor(false)).toBe(false);
  });
});

describe("sawtiTabVisible", () => {
  it("مش مستخبية ⇒ ظاهرة", () => {
    expect(sawtiTabVisible({ hidden: false, leftover: 0 })).toBe(true);
  });
  it("🔴 مستخبية ومفيش لوحات فيها ⇒ مستخبية", () => {
    expect(sawtiTabVisible({ hidden: true, leftover: 0 })).toBe(false);
  });
  it("🔴 مستخبية بس فيها لوحات لسه ماتصدّرتش ⇒ تفضل ظاهرة (الشغل مايتحبسش)", () => {
    expect(sawtiTabVisible({ hidden: true, leftover: 3 })).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";

describe("🙈 الأماكن اللي «صوتي» بتظهر فيها — الحارس", () => {
  const check = readFileSync(path.resolve(__dirname, "../app/(app)/instant-check/page.tsx"), "utf8");
  const nav = readFileSync(path.resolve(__dirname, "../components/BottomNav.tsx"), "utf8");
  it("🔴 تاب «صوتي» في صفحة التشييك بيتفلتر بالقاعدة، والمندوب بيطلع منه لو مستخبي", () => {
    expect(check).toMatch(/t\.key !== "ptt" \|\| \(voiceAllowed !== false && sawtiShown\)/);
    expect(check).toMatch(/if \(!sawtiShown && mode === "ptt"\) setMode/);
    expect(check).toMatch(/sawtiTabVisible\(\{ hidden: sawtiHiddenFor\(isSuper\), leftover: pttResults\.length \}\)/);
  });
  it("🔴 زرار «صوتي» في الشريط التحتي بيتفلتر، وVoice PRO بتاخد أول مكان", () => {
    expect(nav).toMatch(/VOICE_TABS\.filter\(\(t\) => t\.tab !== "ptt" \|\| sawtiShown\)/);
    expect(nav).toMatch(/return sawtiShown \? \[btn, pro\] : \[pro, btn\];/);
    expect(nav).toMatch(/loadDraft<unknown>\("ptt", "ic-ptt-results"\)/);
  });
});

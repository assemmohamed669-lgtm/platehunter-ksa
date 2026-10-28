/**
 * 🩺 «المايك بيقفل بعد ٣ ثواني» (مندوب `050c0795…`، أندرويد، ٢٥ أكتوبر ٢٠٢٦) — «(السبب: الصوت اتعلّق)»، والمالك أكّد: لا
 * بلوتوث ولا سماعة ولا مكالمة. مافيش صندوق عليه فمانعرفش ليه الموبايل بيعلّق الصوت. ⇒ الصندوق عليه + سطر `rv2-mic` لكل
 * تغيير في حالة الصوت (سياق الصوت / تراك المايك): الحالة، بعد كام ثانية من «ابدأ»، الصفحة ظاهرة؟، المايك (نوعه بس).
 * تسجيل بس — مفيش تغيير في السلوك. بيكتب للحسابات اللي عليها الصندوق بس (`diagActive`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAG_AGENT_IDS, lightKeepsNote } from "@/lib/deviceDiag";
import { micKind } from "@/lib/micDiag";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const ENGINE = read("lib/voicexEngine.ts");
const VP = read("app/(app)/registration-v2/page.tsx");

describe("الصندوق على المندوب ده", () => {
  it("في القايمة", () => {
    expect(DIAG_AGENT_IDS).toContain("050c0795-c21d-4ce5-8ee7-b2d2deb4d644");
  });
  it("رامي عابد (٢٨ أكتوبر): «بيقول لوحات يظهر لوحات ولوحات لا» ⇒ الصندوق الكامل + مراقبة Voice PRO عليه", () => {
    expect(DIAG_AGENT_IDS).toContain("1a4cafa0-34d6-40c9-bc70-d9954d83c403");
  });
  it("السطر بيتكتب في الخفيف كمان", () => {
    expect(lightKeepsNote("rv2-mic")).toBe(true);
  });
});

describe("micKind — نوع المايك من اسمه (من غير الاسم نفسه)", () => {
  it("بلوتوث · سلك/USB · الموبايل · مش معروف", () => {
    expect(micKind("Galaxy Buds2 Pro (Bluetooth)")).toBe("bluetooth");
    expect(micKind("Headset earpiece")).toBe("wired");
    expect(micKind("USB audio")).toBe("wired");
    expect(micKind("Default")).toBe("builtin");
    expect(micKind("")).toBe("unknown");
    expect(micKind(undefined)).toBe("unknown");
  });
});

describe("التوصيل", () => {
  it("المحرّك بيبلّغ أي تغيير في حالة الصوت (`onAudioState`) — قبل قرار الوقف", () => {
    expect(ENGINE).toMatch(/onAudioState\?: \(st: string\) => void;/);
    expect(ENGINE).toMatch(/onTrackState: \(st: "ended" \| "muted" \| "unmuted"\) => \{\n\s*try \{ opts\.onAudioState\?\.\("track-" \+ st\); \} catch \{ \/\* ignore \*\/ \}/);
    expect(ENGINE).toMatch(/onContextState: \(st: string\) => \{\n\s*try \{ opts\.onAudioState\?\.\(st\); \} catch \{ \/\* ignore \*\/ \}/);
  });

  it("Voice PRO بيكتبه في الصندوق بس (`diagActive`)", () => {
    expect(VP).toMatch(/onAudioState: \(st: string\) => \{ if \(diagActive\(\)\) diagNote\("rv2-mic", micDiag\(st, startedAtRef\.current\)\); \},/);
  });
});

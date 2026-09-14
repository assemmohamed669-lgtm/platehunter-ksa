import { describe, it, expect } from "vitest";
import { buildReferralIndex, matchChunkAgainstIndex } from "@/lib/plateParser";

/**
 * 🔴 باج حقيقي من الميدان (٢٠٢٦-٠٩-١٤):
 * محفظة فيها «رسا2244»، وسجل المندوب فيه «اسر2244» — سيارتين مختلفتين.
 * البرنامج طلّعها «مطلوبة» لأن `buildReferralIndex` كانت بتسجّل **كل** لوحة
 * إحالة مرتين: بترتيبها وبحروفها معكوسة. فأي لوحة معكوسة كانت بتطابق بالغلط.
 *
 * القلب الحقيقي (السطر اللاتيني للوحة السعودية) بيتعامل معاه `bankPlateToArabic`
 * من شكل الخانة نفسها (أرقام بعدين حروف)، فالتخمين ده بقى ضرر بلا فايدة.
 */
const REF = [{ "رقم اللوحة": "رسا2244", "البنك": "اهلي" }];

describe("تخمين الحروف المعكوسة", () => {
  it("🔴 لوحة معكوسة مابتطابقش (سيارة تانية)", () => {
    const idx = buildReferralIndex(REF, "رقم اللوحة");
    const hits = matchChunkAgainstIndex([{ "اللوحة": "اسر2244" }], "اللوحة", idx);
    expect(hits.filter((h) => h.status === "exact")).toHaveLength(0);
  });

  it("نفس اللوحة بالظبط بتطابق عادي", () => {
    const idx = buildReferralIndex(REF, "رقم اللوحة");
    const hits = matchChunkAgainstIndex([{ "اللوحة": "رسا2244" }], "اللوحة", idx);
    expect(hits).toHaveLength(1);
    expect(hits[0].status).toBe("exact");
  });

  it("اللوحة البنكية بصيغة «أرقام بعدين حروف» لسه بتتقلب صح", () => {
    // 2244 RSA = السطر اللاتيني ⇒ العربي بالمقلوب: ا س ر — ودي بيعملها
    // bankPlateToArabic من شكل الخانة، مش بالتخمين.
    const idx = buildReferralIndex([{ "رقم اللوحة": "2244 RSA" }], "رقم اللوحة");
    const hits = matchChunkAgainstIndex([{ "اللوحة": "اسر2244" }], "اللوحة", idx);
    expect(hits[0]?.status).toBe("exact");
  });
});

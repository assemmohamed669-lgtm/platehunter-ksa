import { describe, it, expect } from "vitest";
import { localRecordStats, pickAreaProbeIds, areaProbeRow } from "@/lib/recordsSyncDiag";

/**
 * 🩺 «الحي اتكتب على السيرفر ومانزلش على الموبايل» — المالك (١٩ أكتوبر ٢٠٢٦، مندوب 7b4bc404…): ١٨٬٢٨٠ من ١٨٬٣٥٧
 * لوحة عليها الحي على السيرفر و٢٬٤٠٧ اتعدّلت، والمندوب خرج ودخل ولسه مش ظاهرين. الكود بيقول المفروض ينزلوا ⇒
 * الصندوق الأسود (حسابه بس) بيسجّل الموبايل عمل إيه، وبيقارن كام لوحة ناقصة حي على الموبايل بنسختها على السيرفر.
 * **من غير لوحات ولا أماكن** — أرقام وعلامات بس.
 */
type E = { id: string; lat?: number; lng?: number; row: Record<string, string>; synced?: boolean };
const e = (id: string, row: Record<string, string> = {}, extra: Partial<E> = {}): E => ({ id, lat: 24.7, lng: 46.6, row, synced: true, ...extra });

describe("📊 أرقام الموبايل", () => {
  it("كل السجلات / المعلّق / اللي ناقصها حي (ومعاها موقع)", () => {
    const s = localRecordStats([
      e("fc-trial-1"),
      e("fc-trial-2", { "اسم الحي - الشارع": "النسيم" }),
      e("fc-trial-3", {}, { synced: false }),
      e("fc-cam-4", {}, { lat: undefined, lng: undefined }),
      e("fc-mj-5", { "اسم الحي": "العليا" }),
    ]);
    expect(s).toEqual({ total: 5, pending: 1, missingArea: 2, missingAreaPending: 1 });
  });
});

describe("🎯 اللوحات اللي هنقارنها", () => {
  it("الناقص حي بس، لحد العدد المطلوب، والمعلّق الأول (هو المشتبه)", () => {
    const ids = pickAreaProbeIds([
      e("fc-trial-1"), e("fc-trial-2", { "اسم الحي - الشارع": "النسيم" }),
      e("fc-trial-3", {}, { synced: false }), e("fc-trial-4"), e("fc-trial-5"),
    ], 3);
    expect(ids).toEqual(["fc-trial-3", "fc-trial-1", "fc-trial-4"]);
  });
});

describe("🔎 المقارنة بالسيرفر", () => {
  const since = "2026-10-19T17:00:00+00:00";
  it("السيرفر عليه الحي وأحدث من آخر تنزيل والموبايل مش معلّق ⇒ «كان المفروض ينزل»", () => {
    expect(areaProbeRow({ id: "fc-trial-1234567890", synced: true },
      { local_id: "fc-trial-1234567890", updated_at: "2026-10-19T18:40:00+00:00", extra: { "اسم الحي - الشارع": "ش - ح" } }, since))
      .toEqual({ src: "fc-trial-", pending: false, onServer: true, serverHasArea: true, serverNewerThanSince: true });
  });
  it("معلّق على الموبايل ⇒ pending=true", () => {
    expect(areaProbeRow({ id: "fc-trial-9", synced: false },
      { local_id: "fc-trial-9", updated_at: "2026-10-19T18:40:00+00:00", extra: { "اسم الحي - الشارع": "ش - ح" } }, since).pending).toBe(true);
  });
  it("مش على السيرفر خالص ⇒ onServer=false", () => {
    expect(areaProbeRow({ id: "fc-trial-9", synced: true }, undefined, since))
      .toEqual({ src: "fc-trial-", pending: false, onServer: false, serverHasArea: false, serverNewerThanSince: null });
  });
  it("مفيش آخر تنزيل محفوظ ⇒ serverNewerThanSince=null", () => {
    expect(areaProbeRow({ id: "fc-trial-9", synced: true },
      { local_id: "fc-trial-9", updated_at: "2026-10-19T18:40:00+00:00", extra: {} }, null).serverNewerThanSince).toBeNull();
  });
});

describe("🔒 الحساب ده بس", () => {
  it("في قايمة الصندوق، وباقي المناديب لأ", async () => {
    const { DIAG_AGENT_IDS, diagEnabledFor } = await import("@/lib/deviceDiag");
    expect(DIAG_AGENT_IDS).toContain("7b4bc404-50e7-46ad-935f-aa65e293d6b8");
    expect(diagEnabledFor("22222222-2222-4222-8222-222222222222")).toBe(false);
  });
  it("صفحة التشييك: الحساب والمقارنة جوّه diagOn بس", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/(app)/instant-check/page.tsx", "utf8");
    expect(src).toMatch(/const diagOn = diagEnabledFor\(uid\);/);
    expect(src).toMatch(/if \(diagOn\) \{\s*\/\/ 🩺[^\n]*\n\s*void \(async \(\) => \{/);
  });
});

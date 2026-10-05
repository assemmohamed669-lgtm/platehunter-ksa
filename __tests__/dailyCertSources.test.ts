import { describe, it, expect, vi } from "vitest";
import { collectCertDataSources, type CertSourceDeps } from "@/lib/dailyCertSources";
import { TEAM_DATA_SLOT } from "@/lib/teamData";

/**
 * 📄 «شهايد النهارده» بيفرز على أنهي داتا:
 *  · صفحة المطلوب = داتا صفحة الفرز: الأساسي (كبير على الجهاز أو صغير) + داتا المجموعة (للعضو؛
 *    المسئول الملف عنده في المربع الأساسي أصلاً) + كل الإضافي — والإضافي الكبير/متعدد الورقات
 *    بيتقري من الجهاز **كله**، مش العيّنة اللي في سجله (المالك: «مش بيفرز عليها»).
 *  · مشتركين الصوت فقط = داتا المجموعة (مالهمش صفحة الفرز).
 */
type Rec = { headers: string[]; rows: Record<string, string>[]; streamed?: boolean; streamSlot?: string; uploadedAt?: string };
const small = (tag: string): Rec => ({ headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": tag }] });

function deps(o: {
  files?: Record<string, Rec>;
  metas?: Record<string, { headers: string[]; plateCol: string }>;
  role?: "off" | "leader" | "member";
  teamFile?: { path: string; fileName: string; updatedAt: string } | null;
  refresh?: CertSourceDeps["refreshTeamData"];
}): CertSourceDeps {
  return {
    getUploadedFile: async (_a, slot) => o.files?.[slot] ?? null,
    getDataMeta: async (slot) => o.metas?.[slot] ?? null,
    getSampleRows: async (_n, slot) => [{ "رقم اللوحة": `عيّنة ${slot}` }],
    teamState: async () => ({ role: o.role ?? "off", file: o.teamFile === undefined ? null : o.teamFile }),
    refreshTeamData: o.refresh,
  };
}

describe("🔴 صفحة المطلوب — كل داتا صفحة الفرز", () => {
  it("🔴 الإضافي اللي على الجهاز بيتقري من مكانه (مش العيّنة)", async () => {
    const out = await collectCertDataSources("sorting", deps({
      files: { data: small("أساسي"), "data-2": small("إضافي ٢"), "data-3": { ...small("عيّنة"), streamed: true, streamSlot: "xdata-a" }, "data-4": small("إضافي ٤") },
      metas: { "xdata-a": { headers: ["اللوحه"], plateCol: "اللوحه" } },
    }));
    expect(out.map((s) => (s.kind === "mem" ? `ذاكرة:${s.rows[0]["رقم اللوحة"]}` : `جهاز:${s.slot}`)))
      .toEqual(["ذاكرة:أساسي", "ذاكرة:إضافي ٢", "جهاز:xdata-a", "ذاكرة:إضافي ٤"]);
    const big = out[2];
    expect(big.kind === "stream" && big.plateCol).toBe("اللوحه");
  });
  it("🔴 الأساسي الكبير من الجهاز · والإضافي اللي قاعدته اتمسحت بيتخطّى · وبيقف عند أول مربع فاضي", async () => {
    const out = await collectCertDataSources("sorting", deps({
      files: { data: small("سجل"), "data-2": { ...small("عيّنة"), streamed: true, streamSlot: "xdata-gone" }, "data-3": small("٣"), "data-5": small("٥") },
      metas: { data: { headers: ["رقم اللوحة"], plateCol: "رقم اللوحة" } },
    }));
    expect(out.map((s) => (s.kind === "mem" ? `ذاكرة:${s.rows[0]["رقم اللوحة"]}` : `جهاز:${s.slot}`))).toEqual(["جهاز:data", "ذاكرة:٣"]);
  });
  it("🔴 داتا المجموعة للعضو بس (المسئول عنده الملف في المربع الأساسي)", async () => {
    const files = { data: small("أساسي"), [TEAM_DATA_SLOT]: small("مجموعة") };
    const file = { path: "t/x.xlsx", fileName: "x.xlsx", updatedAt: "2026-10-05T00:00:00Z" };
    const tags = async (role: "off" | "leader" | "member") =>
      (await collectCertDataSources("sorting", deps({ files, role, teamFile: file }))).map((s) => (s.kind === "mem" ? s.rows[0]["رقم اللوحة"] : s.slot));
    expect(await tags("member")).toEqual(["أساسي", "مجموعة"]);
    expect(await tags("leader")).toEqual(["أساسي"]);
    expect(await tags("off")).toEqual(["أساسي"]);
  });
});

describe("🔴 مشتركين الصوت فقط — داتا المجموعة", () => {
  const file = { path: "t/x.xlsx", fileName: "x.xlsx", updatedAt: "2026-10-05T10:00:00Z" };
  it("🔴 النسخة اللي على الجهاز محدّثة ⇒ هي (ومفيش تنزيل)", async () => {
    const refresh = vi.fn(async () => null);
    const out = await collectCertDataSources("team", deps({
      files: { [TEAM_DATA_SLOT]: { ...small("مجموعة"), uploadedAt: "2026-10-05T10:00:00Z" }, data: small("مش بتاعه") }, role: "member", teamFile: file, refresh,
    }));
    expect(out.map((s) => (s.kind === "mem" ? s.rows[0]["رقم اللوحة"] : s.slot))).toEqual(["مجموعة"]);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("🔴 فيه أحدث ⇒ بتنزل زي تبويب «فرز» بتاعهم", async () => {
    const out = await collectCertDataSources("team", deps({
      files: { [TEAM_DATA_SLOT]: { ...small("قديمة"), uploadedAt: "2026-10-01T00:00:00Z" } }, role: "member", teamFile: file,
      refresh: async () => ({ headers: ["رقم اللوحة"], rows: [{ "رقم اللوحة": "جديدة" }] }),
    }));
    expect(out.map((s) => (s.kind === "mem" ? s.rows[0]["رقم اللوحة"] : s.slot))).toEqual(["جديدة"]);
  });
  it("التنزيل فشل ⇒ القديمة أحسن من مفيش · مفيش مجموعة ⇒ مفيش داتا", async () => {
    const stale = await collectCertDataSources("team", deps({
      files: { [TEAM_DATA_SLOT]: { ...small("قديمة"), uploadedAt: "2026-10-01T00:00:00Z" } }, role: "leader", teamFile: file, refresh: async () => null,
    }));
    expect(stale.map((s) => (s.kind === "mem" ? s.rows[0]["رقم اللوحة"] : s.slot))).toEqual(["قديمة"]);
    expect(await collectCertDataSources("team", deps({ files: { data: small("x") }, role: "off" }))).toEqual([]);
  });
});

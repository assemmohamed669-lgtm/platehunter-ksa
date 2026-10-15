import { describe, it, expect } from "vitest";
import { memberDataPath, leaderAccess, planMemberAction, MEMBER_DATA_SLOT } from "@/lib/memberData";
import { teamStorageKey } from "@/lib/teamData";

/**
 * 🗂️ داتا لكل عضو — المالك (١٥ أكتوبر ٢٠٢٦): «مسئول المجموعه يقدر يحدد او يختار لكل شخص في المجموعه ويرفعلو داتا معينه
 * … محمد داتا ل منطقه مكه ومحمود داتا ل منطقه الطايف … الشخص التاني ميقدرش يفتح الداتا دي ولا يحملها … مسئول المجموعه
 * ميظهرلوش … غير اعضاء المجموعه دي فقط». قراراته: ملف واحد لكل عضو · العضو بيفرز على المخصوصة بس.
 * كل الصلاحيات على السيرفر (الملف في مخزن خاص مالوش أي وصول مباشر).
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const L = "99999999-9999-4999-8999-999999999999";
const group = { team: "مكة", leader_id: L, leader_page_enabled: true };

describe("🔴 مسار الملف", () => {
  it("فولدر المجموعة (بالكود الإنجليزي) + رقم العضو + امتداد الملف", () => {
    expect(memberDataPath("مكة", A, "داتا مكة.xlsx")).toBe(`${teamStorageKey("مكة")}/${A}.xlsx`);
    expect(memberDataPath("مكة", A, "file.XLSB")).toBe(`${teamStorageKey("مكة")}/${A}.xlsb`);
    expect(memberDataPath("مكة", A, "بدون امتداد")).toBe(`${teamStorageKey("مكة")}/${A}.xlsx`);
    expect(memberDataPath("مكة", A, "x.exe")).toBe(`${teamStorageKey("مكة")}/${A}.xlsx`);
  });
  it("🔒 رقم عضو مش سليم ⇒ مرفوض (مايتعملش مسار برّه الفولدر)", () => {
    expect(() => memberDataPath("مكة", "../x", "a.xlsx")).toThrow();
  });
  it("سلوت على الموبايل لوحده (مش سلوت داتا المجموعة)", () => {
    expect(MEMBER_DATA_SLOT).toBe("member-data");
  });
});

describe("🔴 مين يرفع", () => {
  it("مسئول المجموعة (والصفحة مفتوحة له) أو السوبر أدمن بس", () => {
    expect(leaderAccess(group, L, false)).toBe(true);
    expect(leaderAccess({ ...group, leader_page_enabled: false }, L, false)).toBe(false);
    expect(leaderAccess(group, A, false)).toBe(false);
    expect(leaderAccess(group, A, true)).toBe(true);
    expect(leaderAccess(null, L, true)).toBe(false);
  });
});

describe("🔴 العمليات (رفع/تثبيت/مسح)", () => {
  const members = [A, L];
  it("🔒 العضو لازم يكون من المجموعة دي", () => {
    expect(planMemberAction({ action: "upload-url", team: "مكة", agentId: B, fileName: "a.xlsx" }, members))
      .toEqual({ ok: false, error: "العضو ده مش في المجموعة." });
  });
  it("رفع ⇒ المسار المحسوب على السيرفر", () => {
    expect(planMemberAction({ action: "upload-url", team: "مكة", agentId: A, fileName: "مكة.xlsx" }, members))
      .toEqual({ ok: true, action: "upload-url", agentId: A, path: memberDataPath("مكة", A, "مكة.xlsx") });
  });
  it("🔒 التثبيت بمسار تاني (مش بتاع العضو ده) ⇒ مرفوض", () => {
    const r = planMemberAction({ action: "commit", team: "مكة", agentId: A, fileName: "a.xlsx", path: `${teamStorageKey("مكة")}/${L}.xlsx` }, members);
    expect(r.ok).toBe(false);
  });
  it("التثبيت بالمسار الصح + العدد", () => {
    const path = memberDataPath("مكة", A, "a.xlsx");
    expect(planMemberAction({ action: "commit", team: "مكة", agentId: A, fileName: "a.xlsx", path, rowCount: 120, plateCount: 118 }, members))
      .toEqual({ ok: true, action: "commit", agentId: A, path, fileName: "a.xlsx", rowCount: 120, plateCount: 118 });
  });
  it("مسح", () => {
    expect(planMemberAction({ action: "clear", team: "مكة", agentId: A }, members)).toEqual({ ok: true, action: "clear", agentId: A });
  });
  it("عملية مش معروفة / ناقص بيانات ⇒ مرفوض", () => {
    expect(planMemberAction({ action: "x", team: "مكة", agentId: A }, members).ok).toBe(false);
    expect(planMemberAction({ action: "upload-url", team: "مكة", agentId: A }, members).ok).toBe(false);
  });
});

describe("🔴 العضو من غير نت", () => {
  it("مافيش نت / السيرفر وقع ⇒ offline (عشان النسخة اللي على الموبايل ماتتمسحش)", async () => {
    const { fetchMyMemberData } = await import("@/lib/memberData");
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
      expect(await fetchMyMemberData()).toMatchObject({ file: null, offline: true });
      globalThis.fetch = (async () => new Response("{}", { status: 502 })) as typeof fetch;
      expect(await fetchMyMemberData()).toMatchObject({ file: null, offline: true });
      globalThis.fetch = (async () => new Response(JSON.stringify({ file: null }), { status: 200 })) as typeof fetch;
      expect((await fetchMyMemberData()).offline).toBeFalsy();
    } finally { globalThis.fetch = realFetch; }
  });
});

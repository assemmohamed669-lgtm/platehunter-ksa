import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }) } } }));
import { leaderView, leaderSettingsPatch } from "@/lib/leaderSettings";
import { findAlertRecipients, shouldShowFind } from "@/lib/groupLocks";

/**
 * 🧭 «إدارة مجموعتي» — المالك (١١ أكتوبر ٢٠٢٦): المسئول يتحكّم في الإشعارات (لمين من الأعضاء / للكل / مقفولة)، مشاركة
 * السجلات، رفع ملف التشييك للمجموعة، «إشعار المطلوب للمسئول بس»، «السجلات للمسئول بس»، والأعضاء مايفرزوش /
 * مايحمّلوش / مايعدّلوش — «المسئول ميقدرش يشيل او يضيف حد للمجموعه الا عن طريق السوبر ادمن».
 */
const MEMBERS = ["L", "m1", "m2", "m3"];

describe("🔴 اللي المسئول يقدر يغيّره بس (قايمة بيضا)", () => {
  it("🔴 الأعضاء والمسئول وداتا المجموعة وتقرير النشاط والصفحة نفسها والأعمدة الغريبة — بتتجاهَل", () => {
    const p = leaderSettingsPatch({
      leader_id: "x", leaderId: "x", team: "ب", lock_member_records: true, lockRecords: true,
      shared_data_enabled: true, sharedData: true, activity_report_enabled: true, leader_page_enabled: true,
      members: ["z"], addMember: "z",
    }, MEMBERS);
    expect(p).toEqual({});
  });
  it("🔴 الإشعارات: للكل / مقفولة / لأعضاء يختارهم", () => {
    expect(leaderSettingsPatch({ notifyMode: "all" }, MEMBERS)).toEqual({ notify_enabled: true, notify_member_ids: null });
    expect(leaderSettingsPatch({ notifyMode: "off" }, MEMBERS)).toEqual({ notify_enabled: false, notify_member_ids: null });
    expect(leaderSettingsPatch({ notifyMode: "chosen", notifyMemberIds: ["m1", "m3"] }, MEMBERS))
      .toEqual({ notify_enabled: true, notify_member_ids: ["m1", "m3"] });
  });
  it("🔴 «أختارهم»: حد مش من المجموعة بيتشال، ومن غير ولا حد = مقفولة", () => {
    expect(leaderSettingsPatch({ notifyMode: "chosen", notifyMemberIds: ["m1", "برّه", "m1"] }, MEMBERS))
      .toEqual({ notify_enabled: true, notify_member_ids: ["m1"] });
    expect(leaderSettingsPatch({ notifyMode: "chosen", notifyMemberIds: ["برّه"] }, MEMBERS))
      .toEqual({ notify_enabled: false, notify_member_ids: null });
  });
  it("🔴 مشاركة السجلات: مفتوحة = للكل، مقفولة = للمسئول بس", () => {
    expect(leaderSettingsPatch({ shareRecords: true }, MEMBERS)).toEqual({ share_records_enabled: true, records_leader_only: false });
    expect(leaderSettingsPatch({ shareRecords: false }, MEMBERS)).toEqual({ records_leader_only: true });
  });
  it("الباقي مفتاح بمفتاح", () => {
    expect(leaderSettingsPatch({ findsLeaderOnly: true, sharedCheck: false, lockSort: true, lockDownload: false, lockEdit: true }, MEMBERS))
      .toEqual({ finds_leader_only: true, shared_check_enabled: false, lock_member_sort: true, lock_member_download: false, lock_member_edit: true });
  });
});

describe("🔴 اللي بيظهر في صفحة المسئول", () => {
  it("🔴 من صف الإعدادات", () => {
    expect(leaderView({ notify_enabled: true, notify_member_ids: null, share_records_enabled: true }).notifyMode).toBe("all");
    expect(leaderView({ notify_enabled: false }).notifyMode).toBe("off");
    expect(leaderView({ notify_member_ids: ["m1"] })).toMatchObject({ notifyMode: "chosen", notifyMemberIds: ["m1"] });
    expect(leaderView({ records_leader_only: true }).shareRecords).toBe(false);
    expect(leaderView({ share_records_enabled: true, records_leader_only: false }).shareRecords).toBe(true);
    expect(leaderView(null)).toMatchObject({ notifyMode: "all", shareRecords: true, findsLeaderOnly: false, activityReport: false });
  });
});

describe("🔴 الإشعار للأعضاء اللي المسئول اختارهم بس", () => {
  it("🔴 الموبايل: المختارين بس (من غير اللي لقاها)", () => {
    expect(findAlertRecipients({ finderId: "m2", mateIds: ["L", "m1", "m3"], leaderId: "L", notifyEnabled: true, findsLeaderOnly: false, notifyMemberIds: ["L", "m1"] }))
      .toEqual(["L", "m1"]);
  });
  it("مش مختارين حد (null) ⇒ زي الأول: الكل", () => {
    expect(findAlertRecipients({ finderId: "m2", mateIds: ["L", "m1"], leaderId: "L", notifyEnabled: true, findsLeaderOnly: false, notifyMemberIds: null }))
      .toEqual(["L", "m1"]);
  });
  it("🔴 جوّه البرنامج: اللي مش مختار مابتظهرلوش", () => {
    expect(shouldShowFind({ notify_member_ids: ["m1"] }, "m1")).toBe(true);
    expect(shouldShowFind({ notify_member_ids: ["m1"] }, "m3")).toBe(false);
    expect(shouldShowFind({ notify_member_ids: null }, "m3")).toBe(true);
    expect(shouldShowFind({ finds_leader_only: true, leader_id: "L", notify_member_ids: ["m1"] }, "m1")).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { wantedDetails, riyadhDayOf } from "@/components/GroupActivityView";

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 السيرفر: لازم يكون المسئول والصفحة مفتوحة، واللي يتغيّر القايمة البيضا بس", () => {
    const r = read("app/api/group/leader-settings/route.ts");
    expect(r).toMatch(/if \(!r \|\| r\.leader_id !== uid \|\| r\.leader_page_enabled !== true\)/);
    expect(r).toMatch(/const patch = leaderSettingsPatch\(b, members\);/);
    expect(r).not.toMatch(/team_members"\)\.insert|team_members"\)\.delete|move_agent_team|add_agent_to_team/);
  });
  it("🔴 السوبر أدمن بيفتح الصفحة لكل مجموعة (محتاجة مسئول)", () => {
    expect(read("app/admin/groups/page.tsx")).toMatch(/leaderPage: !groupSet\(t\)\.leaderPage/);
    expect(read("app/api/admin/group-settings/route.ts")).toMatch(/: \(\(lpCur as \{ leader_page_enabled\?: boolean \} \| null\)\?\.leader_page_enabled \?\? false\)\) && !!leaderNow,/);
  });
  it("🔴 القايمة الجانبية: بس للمسئول اللي صفحته مفتوحة", () => {
    const m = read("components/AppMenu.tsx");
    expect(m).toMatch(/\.some\(\(g\) => g\.leader_page_enabled === true\)/);
    expect(m).toMatch(/\{leadsGroup && \(\n\s+<Link href="\/my-group"/);
  });
  it("🔴 الصفحة: تاب «تقرير النشاط» بس لو السوبر أدمن فاتحه", () => {
    const p = read("app/(app)/my-group/page.tsx");
    // ١٥ أكتوبر: بقوا ٣ تابات («شغل الأعضاء» للكل) — «تقرير النشاط» لسه بس لو السوبر أدمن فاتحه
    expect(p).toMatch(/\{g\.settings\.activityReport && \(\n\s+<button onClick=\{\(\) => setTab\("activity"\)\}/);
    expect(p).toMatch(/\{tab === "activity" && g\.settings\.activityReport && \(/);
    expect(p).not.toMatch(/lockRecords|leaderId|sharedData/);
  });
  it("🔴 تقرير النشاط: المطلوب بتفاصيله + مطلوب كل مندوب في يومه", () => {
    expect(wantedDetails({ extra: { "الماركة": "تويوتا", "فاضي": "", "اللون": "أبيض" } })).toEqual([["الماركة", "تويوتا"], ["اللون", "أبيض"]]);
    expect(wantedDetails({ extra: null })).toEqual([]);
    expect(riyadhDayOf("2026-10-11T22:30:00.000Z")).toBe("2026-10-12");   // ١:٣٠ص بتوقيت الرياض = اليوم اللي بعده
    const v = read("components/GroupActivityView.tsx");
    expect(v).toMatch(/supabase\.rpc\("my_team_wanted_found_v2", \{ p_days: 30 \}\)/);
    expect(v).toMatch(/const wf = wf2\.error \? await supabase\.rpc\("my_team_wanted_found", \{ p_days: 30 \}\) : wf2;/);
  });
});

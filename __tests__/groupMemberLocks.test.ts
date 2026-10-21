import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  memberLocks, NO_LOCKS, isRouteLockedForMember, lockedCheckTabs,
  findAlertRecipients, shouldSendFind, shouldShowFind,
  loadCachedLocks, saveCachedLocks, recordsLockedNow,
} from "@/lib/groupLocks";

/**
 * 🔒 صلاحيات أعضاء المجموعة — المالك (١١ أكتوبر ٢٠٢٦): «السجلات تتشارك من المجموعه ل مسئول المجموعه فقط ... ميشوفوش
 * الشغل اللي في صفحه السجلات ... وميقدروش يفرزو عليها او يحملوها او يعدلو عليها ... كل حاجه من دي يبقي ليها زرار
 * خاص بيها ... هو فقط يشيك ويصدر بس» + «الاشعار ... يظهر ل مسئول المجموعه حتي لو مصدرش اللوحه».
 * قراراته: الإشعار للمسئول بس · «مايشوفش سجلاته» = كل السجلات · الأندرويد دلوقتي.
 */
const LEADER = "leader-1";
const ME = "member-1";
const all = {
  leader_id: LEADER, lock_member_records: true, lock_member_sort: true,
  lock_member_download: true, lock_member_edit: true,
};

describe("🔴 مين بيتقفل عليه", () => {
  it("🔴 العضو بياخد كل مفتاح لوحده", () => {
    expect(memberLocks({ leader_id: LEADER, lock_member_sort: true }, { id: ME, team: "أ" }))
      .toEqual({ records: false, sort: true, download: false, edit: false });
    expect(memberLocks({ leader_id: LEADER, lock_member_edit: true }, { id: ME, team: "أ" }))
      .toEqual({ records: false, sort: false, download: false, edit: true });
    expect(memberLocks(all, { id: ME, team: "أ" })).toEqual({ records: true, sort: true, download: true, edit: true });
  });
  it("🔴 المسئول نفسه مابيتقفلش عليه حاجة", () => {
    expect(memberLocks(all, { id: LEADER, team: "أ" })).toEqual(NO_LOCKS);
  });
  it("الأدمن والسوبر أدمن ومندوب من غير مجموعة: مفيش قفل", () => {
    expect(memberLocks(all, { id: ME, team: "أ", role: "admin" })).toEqual(NO_LOCKS);
    expect(memberLocks(all, { id: ME, team: "أ", isSuper: true })).toEqual(NO_LOCKS);
    expect(memberLocks(all, { id: ME, team: null })).toEqual(NO_LOCKS);
  });
  it("مجموعة من غير مسئول أو من غير إعدادات (الافتراضي) ⇒ زي ما هي", () => {
    expect(memberLocks({ ...all, leader_id: null }, { id: ME, team: "أ" })).toEqual(NO_LOCKS);
    expect(memberLocks(null, { id: ME, team: "أ" })).toEqual(NO_LOCKS);
    expect(memberLocks({ leader_id: LEADER }, { id: ME, team: "أ" })).toEqual(NO_LOCKS);
  });
});

describe("🔴 الصفحات المقفولة على العضو", () => {
  const L = (p: Partial<typeof NO_LOCKS>) => ({ ...NO_LOCKS, ...p });
  it("🔴 قفل الفرز: الفرز وفرز المجموعة والمطلوب", () => {
    for (const p of ["/sorting", "/group-sort", "/wanted"]) expect(isRouteLockedForMember(p, L({ sort: true })), p).toBe(true);
    expect(isRouteLockedForMember("/instant-check", L({ sort: true }))).toBe(false);
    expect(isRouteLockedForMember("/maps", L({ sort: true }))).toBe(false);
  });
  it("🔴 قفل السجلات: القوايم والخرايط وسجلات المجموعة والنسخة الاحتياطية وفرز المجموعة", () => {
    for (const p of ["/list", "/list?type=wanted", "/maps", "/group-records", "/backup", "/group-sort"]) {
      expect(isRouteLockedForMember(p, L({ records: true })), p).toBe(true);
    }
    expect(isRouteLockedForMember("/instant-check", L({ records: true }))).toBe(false);
    expect(isRouteLockedForMember("/registration-v2", L({ records: true }))).toBe(false);
  });
  it("قفل التحميل: النسخة الاحتياطية (تحميل السجلات كلها)", () => {
    expect(isRouteLockedForMember("/backup", L({ download: true }))).toBe(true);
    expect(isRouteLockedForMember("/maps", L({ download: true }))).toBe(false);
  });
  it("حدود المسار: «/listing» مش «/list»", () => {
    expect(isRouteLockedForMember("/listing", L({ records: true }))).toBe(false);
  });
  it("مفيش قفل ⇒ ولا صفحة", () => {
    for (const p of ["/sorting", "/list", "/backup", "/group-records"]) expect(isRouteLockedForMember(p, NO_LOCKS)).toBe(false);
  });
  it("🔴 تبويبات التشييك: «السجلات» مع قفل السجلات، و«فرز» مع قفل الفرز أو السجلات", () => {
    expect([...lockedCheckTabs(L({ records: true }))].sort()).toEqual(["sheet", "sort"]);
    expect([...lockedCheckTabs(L({ sort: true }))]).toEqual(["sort"]);
    expect(lockedCheckTabs(NO_LOCKS).size).toBe(0);
  });
});

describe("🔴 إشعار المطلوب للمسئول بس", () => {
  const mates = ["leader-1", "m2", "m3"];
  it("🔴 مفتوح ⇒ المسئول بس، حتى لو إشعارات المجموعة العادية مقفولة", () => {
    expect(findAlertRecipients({ finderId: "m2", mateIds: mates, leaderId: LEADER, notifyEnabled: false, findsLeaderOnly: true })).toEqual([LEADER]);
    expect(findAlertRecipients({ finderId: "m2", mateIds: mates, leaderId: LEADER, notifyEnabled: true, findsLeaderOnly: true })).toEqual([LEADER]);
  });
  it("🔴 المسئول اتنقل لمجموعة تانية (مش من الأعضاء) ⇒ لقطات مجموعته القديمة مابتوصلوش", () => {
    expect(findAlertRecipients({ finderId: "m2", mateIds: ["m3"], leaderId: LEADER, notifyEnabled: true, findsLeaderOnly: true })).toEqual([]);
  });
  it("المسئول هو اللي لقاها ⇒ مفيش حد يتبعتله", () => {
    expect(findAlertRecipients({ finderId: LEADER, mateIds: ["m2"], leaderId: LEADER, notifyEnabled: true, findsLeaderOnly: true })).toEqual([]);
  });
  it("مقفول ⇒ زي الأول بالحرف (كل الزمايل، أو ولا حد لو الإشعارات مقفولة)", () => {
    expect(findAlertRecipients({ finderId: "m2", mateIds: ["leader-1", "m3"], leaderId: LEADER, notifyEnabled: true, findsLeaderOnly: false })).toEqual(["leader-1", "m3"]);
    expect(findAlertRecipients({ finderId: "m2", mateIds: ["leader-1", "m3"], leaderId: LEADER, notifyEnabled: false, findsLeaderOnly: false })).toEqual([]);
  });
  it("🔴 اللقطة بتتسجّل لو الإشعار العادي مفتوح أو «للمسئول بس» مفتوح", () => {
    expect(shouldSendFind(null)).toBe(true);
    expect(shouldSendFind({ notify_enabled: false })).toBe(false);
    expect(shouldSendFind({ notify_enabled: false, finds_leader_only: true, leader_id: LEADER })).toBe(true);
  });
  it("🔴 جوّه التطبيق: العضو مابيشوفش لقطة زميله لما «للمسئول بس» مفتوح", () => {
    const s = { finds_leader_only: true, leader_id: LEADER };
    expect(shouldShowFind(s, LEADER)).toBe(true);
    expect(shouldShowFind(s, "m3")).toBe(false);
    expect(shouldShowFind({ finds_leader_only: false, leader_id: LEADER }, "m3")).toBe(true);
    expect(shouldShowFind(null, "m3")).toBe(true);
  });
});

describe("الأقفال بتتحفظ على الجهاز (تشتغل من غير نت)", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });
  it("الافتراضي مفيش قفل، والمحفوظ بيرجع", () => {
    expect(loadCachedLocks()).toEqual(NO_LOCKS);
    expect(recordsLockedNow()).toBe(false);
    saveCachedLocks({ records: true, sort: false, download: true, edit: false });
    expect(loadCachedLocks()).toEqual({ records: true, sort: false, download: true, edit: false });
    expect(recordsLockedNow()).toBe(true);
  });
});

describe("🔴 التوصيل", () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
  it("🔴 SQL: المفاتيح الستة مقفولة افتراضياً + المسئول يشوف الكل والعضو صفوفه بس + لقطات المطلوب للمسئول", () => {
    const sql = read("docs/sql/group-member-locks.sql");
    for (const c of ["records_leader_only", "lock_member_records", "lock_member_sort", "lock_member_download", "lock_member_edit", "finds_leader_only"]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${c}\\s+boolean not null default false`));
    }
    // المفتاح مقفول ⇒ نفس group-share-records.sql بالحرف (الافتراضي مشاركة)
    expect(sql).toMatch(/coalesce\(g\.share_records_enabled, true\)/);
    expect(sql).toMatch(/or \(not gs\.leader_only and gs\.shared\)/);
    expect(sql).toMatch(/or \(gs\.leader_only and \(gs\.leader_id = me\.id or me\.role = 'admin'\)\)/);
    expect(sql).toMatch(/create policy "read own team finds" on public\.group_finds/);
    expect(sql).toMatch(/or finder_id = \(select auth\.uid\(\)\)/);
  });
  it("🔴 إشعار الهاتف: السيرفر بيختار المستلمين بـfindAlertRecipients", () => {
    const r = read("app/api/group-push/route.ts");
    expect(r).toMatch(/const ids = findAlertRecipients\(/);
    expect(r).toMatch(/if \(!shouldSendFind\(s\)\)/);
    expect(r).toMatch(/select\("\*"\)/);
  });
  it("🔴 الإشعار جوّه التطبيق: الإرسال والاستقبال", () => {
    const n = read("components/GroupFindNotifier.tsx");
    expect(n).toMatch(/!shouldSendFind\(gs as GroupLockSettings \| null\)/);
    expect(n).toMatch(/if \(!shouldShowFind\(gs as GroupLockSettings \| null, uid\)\) return;/);
  });
  it("🔴 الحارس والقايمة والشريط التحتي", () => {
    expect(read("app/(app)/layout.tsx")).toMatch(/isRouteLockedForMember\(pathname, memberLocks\)\) router\.replace\("\/instant-check"\)/);
    expect(read("components/AppMenu.tsx")).toMatch(/!isRouteLockedForMember\(href, locks\)/);
    const nav = read("components/BottomNav.tsx");
    expect(nav).toMatch(/\.filter\(\(t\) => !isRouteLockedForMember\(t\.href, memberLocks\)\)/);
    expect(nav).toMatch(/!lockedTabs\.has\(t\.tab as "sheet" \| "sort"\)/);
  });
  it("🔴 صفحة التشييك: التبويبات + التعديل + التحميل", () => {
    const ic = read("app/(app)/instant-check/page.tsx");
    expect(ic).toMatch(/\.filter\(\(t\) => !lockedTabs\.has\(t\.key as "sheet" \| "sort"\)\)/);
    expect(ic).toMatch(/lockedCheckTabs\(memberLocks\)\.has\(mode\)\) setMode\("manual"\)/);
    expect(ic).toMatch(/voiceOnly && mode === "sort" && !lockedTabs\.has\("sort"\)/);
    expect((ic.match(/readOnly=\{memberLocks\.edit\}/g) ?? []).length).toBe(4);
    expect(ic).toMatch(/memberLocks\.download \? "hidden" : ""/);
    expect(ic).toMatch(/\{!memberLocks\.edit && <button onClick=\{\(\) => peDeleteEntry/);
  });
  it("🔴 القوايم والخرايط: المسح والمشاركة", () => {
    expect(read("app/(app)/list/page.tsx")).toMatch(/canDelete=\{!locks\.edit\}\n\s+canShare=\{!locks\.download\}/);
    const maps = read("app/(app)/maps/page.tsx");
    expect(maps).toMatch(/\{!locks\.edit && <button onClick=\{deleteSelected\}/);
    expect(maps).toMatch(/\{!locks\.download && <button onClick=\{excelSelected\}/);
  });
  it("🔴 الفرز والمطلوب مابيقروش السجلات لما تكون مقفولة", () => {
    const s = read("app/(app)/sorting/page.tsx");
    // سجلاتي في الفرز بقت من شيت السجلات الجاهز (`lib/recordsSheet.ts`) — والقفل هناك
    expect(read("lib/recordsSheet.ts")).toMatch(/if \(recordsLockedNow\(\)\) return \{ table: null \};/);
    expect(s).toMatch(/await getRecordsSheet\(myNameRef\.current\)/);
    expect(s).toMatch(/if \(!hasTeamRef\.current \|\| recordsLockedNow\(\)\) return \[\];/);
    expect(s).toMatch(/if \(hasTeamRef\.current && !recordsLockedNow\(\)\)/);
    expect(read("app/(app)/wanted/page.tsx")).toMatch(/recordsLockedNow\(\) \? Promise\.resolve\(\[\] as FieldCheckEntry\[\]\)/);
  });
  it("🔴 صفحة المجموعات: ٦ مفاتيح + الـAPI بيحفظهم ومحتاجين مسئول", () => {
    const pg = read("app/admin/groups/page.tsx");
    for (const k of ["findsLeaderOnly", "recordsLeaderOnly", "lockRecords", "lockSort", "lockDownload", "lockEdit"]) {
      expect(pg).toContain(`["${k}", "`);
    }
    const api = read("app/api/admin/group-settings/route.ts");
    for (const c of ["records_leader_only", "lock_member_records", "lock_member_sort", "lock_member_download", "lock_member_edit", "finds_leader_only"]) {
      expect(api).toMatch(new RegExp(`"${c}"`));
    }
    expect(api).toMatch(/return \[c, want === true && !!leader\];/);
  });
});

describe("🔴 قبل تشغيل SQL: حفظ مفاتيح المجموعة القديمة مايتوقفش", () => {
  it("🔴 الرسالة بتظهر بس لو حد بيفتح مفتاح جديد (true) — مش لما تتبعت false مع كل حفظ", () => {
    const api = readFileSync(path.resolve(__dirname, "../app/api/admin/group-settings/route.ts"), "utf8");
    expect(api).toMatch(/const lockReq = MEMBER_LOCK_KEYS\.filter\(\(\[k\]\) => b\[k\] === true\);/);
    expect(api).toMatch(/if \(lockErr && lockReq\.length\)/);
    expect(api).toMatch(/\.\.\.\(lockErr \? \{\} :/);
  });
});

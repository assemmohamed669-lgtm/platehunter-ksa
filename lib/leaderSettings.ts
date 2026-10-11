/**
 * 🧭 «إدارة مجموعتي» — اللي مسئول المجموعة يقدر يغيّره بنفسه (المالك ١١ أكتوبر ٢٠٢٦). **قايمة بيضا**: أي حاجة تانية
 * (الأعضاء، المسئول، داتا المجموعة، «الأعضاء مايشوفوش سجلاتهم»، تقرير النشاط، الصفحة نفسها) للسوبر أدمن بس.
 *
 *  • إشعارات السيارات المطلوبة: للكل / لأعضاء يختارهم / مقفولة   (notify_enabled + notify_member_ids)
 *  • «إشعار المطلوب للمسئول بس»                                  (finds_leader_only)
 *  • مشاركة السجلات ⇄ «السجلات للمسئول بس» — نفس المعنى بالعكس:  مفتوحة = للكل، مقفولة = للمسئول بس
 *  • رفع ملف التشييك للمجموعة                                     (shared_check_enabled)
 *  • الأعضاء مايفرزوش / مايحمّلوش / مايعدّلوش                     (lock_member_sort/download/edit)
 */

export type NotifyMode = "all" | "chosen" | "off";

export interface LeaderView {
  notifyMode: NotifyMode;
  notifyMemberIds: string[];
  findsLeaderOnly: boolean;
  shareRecords: boolean;
  sharedCheck: boolean;
  lockSort: boolean;
  lockDownload: boolean;
  lockEdit: boolean;
  activityReport: boolean;
}

type Row = Record<string, unknown> | null | undefined;
const on = (v: unknown) => v === true;

/** صف group_settings ⇒ اللي بيظهر في صفحة المسئول. */
export function leaderView(row: Row): LeaderView {
  const list = Array.isArray(row?.notify_member_ids) ? (row!.notify_member_ids as string[]) : null;
  const notifyOn = row?.notify_enabled !== false;
  return {
    notifyMode: !notifyOn ? "off" : list ? "chosen" : "all",
    notifyMemberIds: list ?? [],
    findsLeaderOnly: on(row?.finds_leader_only),
    shareRecords: row?.share_records_enabled !== false && !on(row?.records_leader_only),
    sharedCheck: on(row?.shared_check_enabled),
    lockSort: on(row?.lock_member_sort),
    lockDownload: on(row?.lock_member_download),
    lockEdit: on(row?.lock_member_edit),
    activityReport: on(row?.activity_report_enabled),
  };
}

/**
 * طلب المسئول ⇒ الأعمدة اللي تتحدّث بس. اللي مش في القايمة بيتجاهَل. الأعضاء المختارين لازم يكونوا من أعضاء
 * المجموعة فعلاً، و«أختارهم» من غير ولا حد = مقفولة.
 */
export function leaderSettingsPatch(body: unknown, memberIds: readonly string[]): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const bool = (k: string) => typeof b[k] === "boolean";

  if (b.notifyMode === "all") { out.notify_enabled = true; out.notify_member_ids = null; }
  else if (b.notifyMode === "off") { out.notify_enabled = false; out.notify_member_ids = null; }
  else if (b.notifyMode === "chosen") {
    const members = new Set(memberIds);
    const ids = Array.isArray(b.notifyMemberIds)
      ? [...new Set((b.notifyMemberIds as unknown[]).filter((x): x is string => typeof x === "string" && members.has(x)))]
      : [];
    if (ids.length) { out.notify_enabled = true; out.notify_member_ids = ids; }
    else { out.notify_enabled = false; out.notify_member_ids = null; }
  }
  if (bool("findsLeaderOnly")) out.finds_leader_only = b.findsLeaderOnly;
  if (bool("shareRecords")) {
    if (b.shareRecords) { out.share_records_enabled = true; out.records_leader_only = false; }
    else out.records_leader_only = true;
  }
  if (bool("sharedCheck")) out.shared_check_enabled = b.sharedCheck;
  if (bool("lockSort")) out.lock_member_sort = b.lockSort;
  if (bool("lockDownload")) out.lock_member_download = b.lockDownload;
  if (bool("lockEdit")) out.lock_member_edit = b.lockEdit;
  return out;
}

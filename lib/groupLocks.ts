/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔒 صلاحيات أعضاء المجموعة + إشعار المطلوب للمسئول بس
 * ══════════════════════════════════════════════════════════════════════
 * المالك (١١ أكتوبر ٢٠٢٦): «السجلات تتشارك من المجموعه ل مسئول المجموعه فقط ... ميشوفوش الشغل اللي في صفحه
 * السجلات ... وميقدروش يفرزو عليها او يحملوها او يعدلو عليها ... كل حاجه من دي يبقي ليها زرار خاص بيها ... هو فقط
 * يشيك ويصدر بس» + «الاشعار ... يظهر ل مسئول المجموعه حتي لو مصدرش اللوحه ... علي التليفون في شريط الاشعارات».
 *
 * مفاتيح لكل مجموعة في `group_settings` (docs/sql/group-member-locks.sql) — **كلها مقفولة افتراضياً** ومحتاجة
 * مسئول، فمجموعة ماتفتحلهاش حاجة شغّالة زي ما هي بالحرف:
 *  - `records_leader_only`  سجلات الأعضاء للمسئول بس (من السيرفر: `my_team_member_ids`).
 *  - `lock_member_records`  العضو مايشوفش أي سجلات (ولا سجلاته هو) — بيشيّك ويصدّر بس.
 *  - `lock_member_sort`     العضو مايفرزش.
 *  - `lock_member_download` العضو مايحمّلش/يشاركش السجلات.
 *  - `lock_member_edit`     العضو مايعدّلش/يمسحش السجلات.
 *  - `finds_leader_only`    لقطة المطلوب بتوصل للمسئول بس (من السيرفر: سياسة `group_finds` + `/api/group-push`).
 * المسئول والأدمن والسوبر أدمن مابيتقفلش عليهم حاجة. سجلات العضو **مابتتمسحش** — بتستخبى بس وبتوصل للمسئول.
 */
export interface GroupLockSettings {
  leader_id?: string | null;
  notify_enabled?: boolean | null;
  records_leader_only?: boolean | null;
  lock_member_records?: boolean | null;
  lock_member_sort?: boolean | null;
  lock_member_download?: boolean | null;
  lock_member_edit?: boolean | null;
  finds_leader_only?: boolean | null;
  /** 🧭 «إدارة مجموعتي»: إشعارات المطلوب لأعضاء المسئول اختارهم (فاضي/null = كل الأعضاء). */
  notify_member_ids?: string[] | null;
}

export interface MemberLocks { records: boolean; sort: boolean; download: boolean; edit: boolean }
export const NO_LOCKS: MemberLocks = Object.freeze({ records: false, sort: false, download: false, edit: false }) as MemberLocks;

/** الأقفال اللي على المندوب ده. المسئول/الأدمن/السوبر/من غير مجموعة/مجموعة من غير مسئول ⇒ مفيش. */
export function memberLocks(
  s: GroupLockSettings | null | undefined,
  me: { id: string; team: string | null; role?: string | null; isSuper?: boolean },
): MemberLocks {
  if (!s || !me.team || me.isSuper || me.role === "admin") return NO_LOCKS;
  if (!s.leader_id || s.leader_id === me.id) return NO_LOCKS;
  return {
    records: s.lock_member_records === true,
    sort: s.lock_member_sort === true,
    download: s.lock_member_download === true,
    edit: s.lock_member_edit === true,
  };
}

const SORT_ROUTES = ["/sorting", "/group-sort", "/wanted", "/data-edit"];
/** صفحات بتعرض سجلات (أو فرز عليها). */
const RECORDS_ROUTES = ["/list", "/maps", "/group-records", "/backup", "/group-sort"];
/** تحميل السجلات كلها. */
const DOWNLOAD_ROUTES = ["/backup"];

const under = (path: string, roots: string[]) => roots.some((r) => path === r || path.startsWith(`${r}/`));

/** الصفحة دي مقفولة على العضو؟ (حارس `app/(app)/layout.tsx` + القايمة الجانبية) */
export function isRouteLockedForMember(pathname: string, locks: MemberLocks): boolean {
  const path = String(pathname ?? "").split(/[?#]/)[0];
  if (!path) return false;
  return (locks.sort && under(path, SORT_ROUTES))
    || (locks.records && under(path, RECORDS_ROUTES))
    || (locks.download && under(path, DOWNLOAD_ROUTES));
}

/** تبويبات صفحة التشييك المقفولة: «السجلات» مع قفل السجلات، و«فرز» (فرز على السجلات) مع قفل الفرز أو السجلات. */
export function lockedCheckTabs(locks: MemberLocks): Set<"sheet" | "sort"> {
  const out = new Set<"sheet" | "sort">();
  if (locks.records) out.add("sheet");
  if (locks.sort || locks.records) out.add("sort");
  return out;
}

// ── إشعار المطلوب ─────────────────────────────────────────────────────────

/** مين يوصله إشعار الهاتف. «للمسئول بس» ⇒ المسئول (لو مش هو اللي لقاها)، وإلا زي الأول بالحرف. */
export function findAlertRecipients(o: {
  finderId: string; mateIds: string[]; leaderId: string | null | undefined;
  notifyEnabled: boolean; findsLeaderOnly: boolean;
  /** 🧭 أعضاء المسئول اختارهم من «إدارة مجموعتي» — null/مش مبعوت = كل الأعضاء زي الأول. */
  notifyMemberIds?: string[] | null;
}): string[] {
  // المسئول لازم يكون لسه من أعضاء المجموعة — لو اتنقل لمجموعة تانية لقطات القديمة ماتوصلوش.
  if (o.findsLeaderOnly) {
    return o.leaderId && o.leaderId !== o.finderId && o.mateIds.includes(o.leaderId) ? [o.leaderId] : [];
  }
  if (!o.notifyEnabled) return [];
  const chosen = o.notifyMemberIds ? new Set(o.notifyMemberIds) : null;
  return o.mateIds.filter((id) => id !== o.finderId && (!chosen || chosen.has(id)));
}

/** اللقطة تتسجّل وتتبعت؟ — الإشعار العادي مفتوح (الافتراضي) أو «للمسئول بس» مفتوح. */
export function shouldSendFind(s: GroupLockSettings | null | undefined): boolean {
  if (s?.finds_leader_only === true && s.leader_id) return true;
  return s?.notify_enabled !== false;
}

/** لقطة زميل وصلت جوّه التطبيق — تظهر لي؟ («للمسئول بس» ⇒ للمسئول بس؛ السيرفر بيمنعها كمان.) */
export function shouldShowFind(s: GroupLockSettings | null | undefined, myId: string): boolean {
  if (s?.finds_leader_only === true && s.leader_id) return s.leader_id === myId;
  if (Array.isArray(s?.notify_member_ids)) return s.notify_member_ids.includes(myId);
  return true;
}

// ── الحفظ على الجهاز (القفل يفضل شغّال من غير نت) ───────────────────────────

const KEY = "ph:groupLocks";
/** حدث بيتبعت لما الأقفال تتحدّث من السيرفر (`lib/groupLocksClient.ts`). */
export const GROUP_LOCKS_EVENT = "ph:groupLocks";

export function loadCachedLocks(): MemberLocks {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<MemberLocks> | null;
    if (!v) return NO_LOCKS;
    return { records: v.records === true, sort: v.sort === true, download: v.download === true, edit: v.edit === true };
  } catch { return NO_LOCKS; }
}

export function saveCachedLocks(l: MemberLocks): void {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* التخزين مش متاح */ }
}

/** للأماكن اللي بتقرا السجلات من غير React (الفرز/المطلوب): العضو مقفول عليه السجلات دلوقتي؟ */
export function recordsLockedNow(): boolean {
  return loadCachedLocks().records;
}


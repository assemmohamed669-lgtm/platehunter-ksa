/**
 * 🔔 إشعار «لقى سيارة مطلوبة» بالتفاصيل — المالك (١١ أكتوبر ٢٠٢٦): «في شريط الاشعارات من قناص اللوحات بيقوله ان
 * المندوب كذا ... حصل سيارة كذا ... وبالتاريخ والوقت وكل حاجه ولما المسئول يفتح الاشعار يتفتحلو علي البرنامج ويشوف
 * كل البيانات بتاع السيارة بالموقع بتاعها ... ومين حصلها».
 *
 * السيرفر (`/api/group-push`) بيبني الإشعار من صف اللقطة نفسه (`group_finds`)، والضغط عليه بيفتح
 * `/group-find?id=…` (`components/PushRegistrar.tsx`).
 */

export interface FindRow {
  id: string;
  team: string | null;
  finder_name: string | null;
  plate: string;
  info: [string, string][] | null;
  maps_link: string | null;
  created_at: string | null;
}

/** وقت اللقطة بتوقيت السعودية: «١١/١٠ ٣:٤٥ م». */
export function formatFindTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Asia/Riyadh", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit",
  }).format(d);
}

/** صفحة تفاصيل اللقطة جوّه البرنامج. */
export function findDetailsHref(id: string): string {
  return `/group-find?id=${encodeURIComponent(id)}`;
}

/** الإشعار نفسه: العنوان + النص + بيانات الضغط (قيم نصّية بس — شرط FCM). */
export function buildFindPush(r: FindRow): { title: string; body: string; data: Record<string, string> } {
  const finder = (r.finder_name ?? "").trim() || "زميلك";
  const when = formatFindTime(r.created_at);
  const line1 = [r.plate, r.team ? `مجموعة ${r.team}` : "", when].filter(Boolean).join(" · ");
  const details = (r.info ?? [])
    .filter(([k, v]) => String(k ?? "").trim() && String(v ?? "").trim())
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  return {
    title: `🚗 ${finder} لقى سيارة مطلوبة`,
    body: details ? `${line1}\n${details}` : line1,
    data: {
      findId: r.id,
      url: r.id ? findDetailsHref(r.id) : "",
      plate: r.plate,
      finder,
      team: r.team ?? "",
      mapsLink: r.maps_link ?? "",
    },
  };
}

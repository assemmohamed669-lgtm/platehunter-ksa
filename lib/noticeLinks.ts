/**
 * 🔗 اللينكات في رسايل الأدمن للمناديب (رسالة البث + الرسالة الحمرا) — المالك (١٤ أكتوبر ٢٠٢٦): «لو فيه اي لينك انا
 * حاطه في الرساله عايزه يتضغط مثلا اضغط هنا وكمان يبقي مفعل لما تدوس عليه يوديه علي مكان الرابط».
 *
 * - لينك عادي (`https://…`) ⇒ بيتدس وبيظهر هو نفسه.
 * - `[اضغط هنا](https://…)` ⇒ «اضغط هنا» بس اللي بيظهر ويودّي على اللينك (زرار «حط لينك» في لوحة الأدمن بيكتبها).
 * - http/https بس — أي حاجة تانية (javascript: …) بتفضل نص عادي.
 */
export type NoticePart = { type: "text"; value: string } | { type: "link"; label: string; url: string };

const LINK_RE = /\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()[\]]+)/g;
/** علامات آخر الجملة — مش جزء من اللينك. */
const TRAILING = /[.,،؛;:!?؟]+$/;

export function parseNoticeText(text: string): NoticePart[] {
  const s = String(text ?? "");
  const parts: NoticePart[] = [];
  let last = 0;
  const pushText = (v: string) => {
    if (!v) return;
    const prev = parts[parts.length - 1];
    if (prev?.type === "text") prev.value += v;
    else parts.push({ type: "text", value: v });
  };
  for (const m of s.matchAll(LINK_RE)) {
    const at = m.index ?? 0;
    pushText(s.slice(last, at));
    if (m[2]) {
      parts.push({ type: "link", label: m[1].trim() || m[2], url: m[2] });
      last = at + m[0].length;
    } else {
      const raw = m[3];
      const url = raw.replace(TRAILING, "");
      parts.push({ type: "link", label: url, url });
      last = at + url.length;            // العلامة اللي في الآخر ترجع نص
    }
  }
  pushText(s.slice(last));
  return parts.length ? parts : [{ type: "text", value: "" }];
}

/** نفس الرسالة كنص عادي («اضغط هنا (لينك)») — لرسالة واتساب «تواصل معانا». */
export function noticePlainText(text: string): string {
  return parseNoticeText(text)
    .map((p) => (p.type === "text" ? p.value : p.label === p.url ? p.url : `${p.label} (${p.url})`))
    .join("");
}

/** اللي الأدمن كتبه في خانة اللينك ⇒ لينك سليم (بيكمّل https لو ناقص) أو null. */
export function normalizeLinkInput(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s || /\s/.test(s)) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[a-z][a-z0-9+.-]*:/i.test(s) ? null : `https://${s}`;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

/** بيضيف اللينك في آخر الرسالة بمسافة قبله. */
export function appendLink(text: string, markup: string): string {
  const t = String(text ?? "");
  return t && !/\s$/.test(t) ? `${t} ${markup}` : `${t}${markup}`;
}

/** فيها لينك؟ (عشان المعاينة تحت الخانة تظهر بس لما يبقى فيه). */
export function hasNoticeLink(text: string): boolean {
  return parseNoticeText(text).some((p) => p.type === "link");
}

/** اللي بيتحط في الرسالة: `[الكلام](اللينك)` — الكلام فاضي ⇒ «اضغط هنا». */
export function linkMarkup(label: string, url: string): string {
  const l = String(label ?? "").replace(/[[\]\n]/g, " ").trim() || "اضغط هنا";
  return `[${l}](${url})`;
}

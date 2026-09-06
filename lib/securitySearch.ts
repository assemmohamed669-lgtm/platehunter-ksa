/**
 * بحث سجل الأمان — بالاسم أو الإيميل أو رقم التليفون.
 *
 * السجل بيعرض «الفاعل» و«الهدف» بالاسم بس، لكن الأدمن بيدوّر باللي في إيده:
 * غالباً إيميل أو رقم تليفون جايله من شكوى مندوب. فالمطابقة بتغطّي التلاتة
 * للطرفين، وكمان النص الخام المحفوظ في `actor_label`/`target_label` — ده أحياناً
 * الأثر الوحيد الباقي لحساب اتمسح بعد الحدث.
 *
 * منفصل عن الصفحة عشان يتقاس: التطبيع (أرقام عربية · همزات · رموز التليفون)
 * هو أكتر حتة فيها زلل.
 */

export interface SecurityPerson {
  username?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface SecurityRowLike {
  agent_id: string | null;
  target_id: string | null;
  actor_label: string | null;
  target_label: string | null;
}

/** أرقام عربية-هندية (٠١٢…) لأرقام عادية — المندوب بيكتب بالاتنين. */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeSearch(s: string): string {
  return String(s ?? "")
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** أرقام بس — عشان «+966 55 987 6543» و«0559876543» يتطابقوا. */
function digits(s: string): string {
  return normalizeSearch(s).replace(/\D/g, "");
}

/**
 * الرقم المحلي بلا مقدّمة الدولة/الصفر — «+966559876543» و«0559876543»
 * و«559876543» كلهم بيرجّعوا نفس الذيل، فأي صيغة بيكتبها الأدمن بتلاقي.
 */
function phoneTail(s: string): string {
  const d = digits(s);
  return d.length > 9 ? d.slice(-9) : d;
}

export function securityRowMatches(
  row: SecurityRowLike,
  people: Record<string, SecurityPerson>,
  query: string,
): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;

  const sides = [row.agent_id, row.target_id]
    .map((id) => (id ? people[id] : undefined))
    .filter(Boolean) as SecurityPerson[];

  // النصوص: الأسماء والإيميلات + الـlabels الخام.
  const haystack = [
    ...sides.flatMap((p) => [p.username, p.email]),
    row.actor_label,
    row.target_label,
  ]
    .filter(Boolean)
    .map((v) => normalizeSearch(String(v)));

  if (haystack.some((h) => h.includes(q))) return true;

  // التليفون: مقارنة بالأرقام بس، وبس لو المكتوب فيه أرقام أصلاً — عشان بحث
  // بكلمة عربية مايتحوّلش لسلسلة فاضية وتطابق كل حاجة.
  const qTail = phoneTail(q);
  if (qTail.length >= 4) {
    const phones = sides.map((p) => phoneTail(String(p.phone ?? ""))).filter((t) => t.length >= 4);
    if (phones.some((t) => t.includes(qTail))) return true;
  }

  return false;
}

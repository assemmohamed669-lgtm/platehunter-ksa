/**
 * 👥 «المجموعة اللي شغّال لها» محفوظة على الجهاز — عشان السجل يتختم بيها **وقت التشييك** حتى من غير نت
 * (المالك ١١ أكتوبر ٢٠٢٦: كل مجموعة شغلها ليها لوحدها). بتتحدّث من السيرفر مع أقفال المجموعة
 * (`lib/groupLocksClient.ts`) ولما المندوب يقلب من «شغّال لـ».
 */
const KEY = "ph:activeTeam";

export function loadActiveTeam(): string | null {
  try { return localStorage.getItem(KEY) || null; } catch { return null; }
}

export function saveActiveTeam(team: string | null): void {
  try { if (team) localStorage.setItem(KEY, team); else localStorage.removeItem(KEY); } catch { /* التخزين مش متاح */ }
}

/**
 * 🙈 مجموعات سجلاتها مستخبية عن المندوب ده — قرار المالك (١١ أكتوبر ٢٠٢٦): «لو مقفوله عنه السجلات دي متروحش معاه
 * ابدا». مجموعة سابها وهي قافلة عليه السجلات (`agent_hidden_record_teams` على السيرفر)، أو مجموعة لسه فيها وقافلة
 * عليه السجلات وهو شغّال لمجموعة تانية. بتتحدّث مع أقفال المجموعة (`lib/groupLocksClient.ts`).
 */
const HIDDEN_KEY = "ph:hiddenRecordTeams";

export function loadHiddenRecordTeams(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);
  } catch { return new Set(); }
}

export function saveHiddenRecordTeams(teams: readonly string[]): void {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set(teams)])); } catch { /* التخزين مش متاح */ }
}

/**
 * سجلاتي **القديمة** (من غير ختم) تبع مجموعة مستخبية؟ — السيرفر بيسجّل سطر واحد «سجلاتك القديمة تبع مجموعة كذا»
 * (`agent_legacy_team`) بدل ما يختم كل سجل (multi-group-6-legacy-pin.sql).
 */
const HIDE_LEGACY_KEY = "ph:hideLegacyRecords";
export function loadHideLegacyRecords(): boolean {
  try { return localStorage.getItem(HIDE_LEGACY_KEY) === "1"; } catch { return false; }
}
export function saveHideLegacyRecords(on: boolean): void {
  try { if (on) localStorage.setItem(HIDE_LEGACY_KEY, "1"); else localStorage.removeItem(HIDE_LEGACY_KEY); } catch { /* */ }
}

/** السجلات من غير اللي مختومة بمجموعة مستخبية (للعرض — السجل نفسه بيفضل على الجهاز والسيرفر). */
export function withoutHiddenTeams<T extends { team?: string }>(
  rows: T[], hidden: Set<string> = loadHiddenRecordTeams(), hideLegacy: boolean = loadHideLegacyRecords(),
): T[] {
  if (hidden.size === 0 && !hideLegacy) return rows;
  return rows.filter((r) => (r.team ? !hidden.has(r.team) : !hideLegacy));
}

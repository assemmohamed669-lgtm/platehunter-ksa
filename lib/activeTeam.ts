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

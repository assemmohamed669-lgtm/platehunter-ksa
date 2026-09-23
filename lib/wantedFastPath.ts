/**
 * ══════════════════════════════════════════════════════════════════════
 *  🔴 الصفّارة من **أول قراية** — «السيارة المطلوبة بتأخر ٦ ثواني»
 * ══════════════════════════════════════════════════════════════════════
 *
 * المالك (٢٣ سبتمبر ٢٠٢٦): «السيارة المطلوبة بتأخر في ظهورها جداً، بتقعد
 * ٦ ثواني على ما تظهر. عايزك تخلّي عملية التشييك على السيارة في الشيت، ولما
 * تكون متطابقة تطابق تام تظهر بسرعة، الصفّارة متأخرش أبداً».
 *
 * 🔴 **السبب**: أول سطر في معالجة القراية كان `if (!showProvisional(r))
 * return;` — القراية لازم ثقتها ≥٩٠٪ ومش محجوبة عشان الصفّارة تضرب. لو أول
 * قراية للعربية المطلوبة أقل من كده، الصفّارة كانت بتستنى **الإجماع**
 * (٢.٥ث استقرار + نوافذ) ⇒ الـ٦ ثواني.
 *
 * ⇒ الشيت بيتفحص على **كل قراية قبل أي بوابة**. تطابق تام ⇒ صفّارة فوراً.
 *
 * ⚠️ **ليه ده مش هيطلّع صفّارات غلط**: القراية الغلط لازم تطابق **بالحرف**
 *    لوحة من الـ٤٩ ألف اللي في الشيت — من ~٢٢٠ مليون لوحة ممكنة (٢٨³×١٠⁴)
 *    ≈ **٠.٠٢٪**. وصفّارة زيادة أرخص بكتير من عربية مطلوبة تعدّي.
 */

import { ALL_FLAGGED_MIN_CONF } from "./liveConsensus";

const WELL = /^[ء-ي]{3}\d{4}$/;

export interface FastRead {
  plate: string;
  accepted: boolean;
  blocked: boolean;
  /** ٠–١ */
  conf: number;
}

export interface WantedHit {
  plate: string;
  row: Record<string, string>;
}

/**
 * القراية دي تستاهل تتفحص على الشيت؟
 *
 * · **المقبولة بأي ثقة** — التطابق التام نفسه هو الدليل، مش الثقة
 * · **المحجوبة بثقة ≥ `ALL_FLAGGED_MIN_CONF`** (٠.٨٦ — نفس ثابت الإجماع،
 *   مقيس: «صح ومحجوبة ٩٣·٩١·٨٨ / مخترعة من ضجيج ٦٨·٦٠·٤٦»). `اوه1552` في
 *   جلسة المالك ضاعت كده بالظبط — محجوبة بـ٩١٪
 * · اللي السيرفر رفضها (مش مقبولة ومش محجوبة) ⇒ لأ
 */
function eligible(r: FastRead): boolean {
  if (!r) return false;
  if (r.accepted && !r.blocked) return true;
  return r.blocked === true && Number.isFinite(r.conf) && r.conf >= ALL_FLAGGED_MIN_CONF;
}

/**
 * اللوحات المطلوبة في القراية دي — **تطابق تام بس** (قاعدة المالك).
 * `keyOf` لازم يكون **نفس تطبيع الفهرس** — وإلا «أ» و«ا» مايتطابقوش.
 */
export function wantedHits(
  r: FastRead,
  index: ReadonlyMap<string, Record<string, string>>,
  keyOf: (plate: string) => string,
): WantedHit[] {
  if (!eligible(r)) return [];
  const out: WantedHit[] = [];
  for (const raw of String(r.plate ?? "").trim().split(/\s+/)) {
    const p = raw.replace(/\s+/g, "");
    if (!WELL.test(p)) continue;
    const row = index.get(keyOf(p));
    if (row) out.push({ plate: p, row });
  }
  return out;
}

/**
 * **دقيقة** — نفس اللي `GroupFindNotifier` بيستعمله لمنع تكرار إشعار المجموعة.
 * العربية الواحدة بتتقرا في ٢-٤ نوافذ + تأكيد الإجماع، فمن غير الحد ده كانت
 * هتصفّر ٣-٤ مرات. وبعد الدقيقة، لو المندوب مرّ عليها تاني، تصفّر تاني.
 */
export const WANTED_REALERT_MS = 60_000;

/**
 * 🔴 **الصفّارة مرة واحدة لكل عربية.** طابور التنبيه بيمنع التكرار **طول ما
 * اللوحة في الطابور بس** — لو المندوب داس «تم» والإجماع أكّد العربية بعدها،
 * الصفّارة كانت بتضرب تاني لنفس العربية.
 */
export function shouldAlertNow(
  alerted: ReadonlyMap<string, number>,
  key: string,
  nowMs: number,
  windowMs: number = WANTED_REALERT_MS,
): boolean {
  if (!key) return false;
  const last = alerted.get(key);
  return last == null || nowMs - last >= windowMs;
}

/**
 * الصف ده يفضل ولا يتكنس؟ (بدل الشرط اللي كان جوّه الصفحة)
 *
 * المبدئي اللي ماحدش أكّده خلال المهلة بيتشال (كان اختراع). 🔴 **بس المطلوب
 * لأ**: لو اتشال والمندوب واقف قدام العربية = الصفّارة ضربت والصف اختفى،
 * ومش هيتصدّر. وصف مطلوب زيادة أرخص بكتير من عربية مطلوبة ضاعت.
 */
export function keepProvisional(
  r: { provisional: boolean; shownAt: number; match: Record<string, string> | null },
  cutMs: number,
): boolean {
  if (!r.provisional) return true;
  if (r.match) return true;
  return r.shownAt >= cutMs;
}

/**
 * الكنس على **الجلسة الحالية بس** — اللوحة من جلسة فاتت عمرها ما تتكنس.
 *
 * 🔴 المالك (٢٣ سبتمبر ٢٠٢٦): «اللوحات اللي اتقالت متتمسحش أبداً وتفضل
 * محفوظة حتى لو المكالمة فصلت المايك… اللوحة متتمسحش غير لو المندوب مسحها
 * بإيده أو صدّرها».
 *
 * المكالمة بتقطع التسجيل ⇒ اللوحة المبدئية اللي لسه ماجالهاش تأكيد بتفضل
 * مبدئية. أول ما المندوب يبدأ تسجيل تاني، الكنس كان بيشوفها «قديمة» (أكتر
 * من ١٢ث) ويمسحها في أول ثانيتين. فأي حاجة اتعرضت **قبل** بداية الجلسة
 * الحالية بتفضل — والكنس جوّه الجلسة (ضد الاختراع) زي ما هو.
 */
export function sweepKeeps(
  r: { provisional: boolean; shownAt: number; match: Record<string, string> | null },
  cutMs: number,
  sessionStartMs: number,
): boolean {
  if (r.shownAt < sessionStartMs) return true;
  return keepProvisional(r, cutMs);
}

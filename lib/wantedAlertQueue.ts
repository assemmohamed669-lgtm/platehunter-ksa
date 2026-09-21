/**
 * wantedAlertQueue — طابور تنبيهات «سيارة مطلوبة».
 *
 * **ليه:** الإنذار كان سلوت واحد — كل لوحة مطلوبة جديدة بتدوس على اللي قبلها،
 * فالمندوب اللي قال ٥٠ لوحة مطلوبة ورا بعض شاف كارت واحد (الأخيرة) وسمع
 * صفّارة واحدة متصلة، و٤٩ عربية مطلوبة عدّت من غير ما يعرف عنها حاجة.
 *
 * القاعدة اللي المالك حطّها: «كل واحدة فيهم يطلع ليها صوت وبيانات اللوحة».
 * فبنلمّهم في طابور: المعروض هو الأول، و«تم» بتشيله وتوري اللي بعده بصفّارة
 * جديدة — لحد ما الطابور يفضى.
 */

import { normalizePlate, bankPlateToArabic } from "./plateParser";
import type { WantedAlertDetail } from "./wantedAlert";

export type QueuedAlert = WantedAlertDetail;

function key(plate: string): string {
  return normalizePlate(bankPlateToArabic(String(plate ?? "")));
}

/**
 * بيضيف تنبيه لآخر الطابور. **مابيدوسش على المعروض حالياً.**
 * اللوحة اللي لسه في الطابور مابتتكررش (نفس العربية اتشيّكت مرتين في ثانية).
 */
export function pushAlert(queue: QueuedAlert[], next: QueuedAlert): QueuedAlert[] {
  const k = key(next.plate);
  if (!k) return queue;
  if (queue.some((q) => key(q.plate) === k)) return queue;
  return [...queue, next];
}

/** «تم» — بتشيل المعروض وتوري اللي بعده. */
export function dropCurrent(queue: QueuedAlert[]): QueuedAlert[] {
  return queue.slice(1);
}

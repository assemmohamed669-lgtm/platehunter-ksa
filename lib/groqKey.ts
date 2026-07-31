/**
 * يحل مفتاح Groq لطلب واحد: مفتاح المندوب لو باعته، وإلا مفتاح الشركة اللي
 * على السيرفر (`GROQ_API_KEY`).
 *
 * ليه الترتيب ده: المناديب اللي عندهم مفاتيح بيستخدموها، فحدود الاستهلاك
 * تفضل موزّعة على حسابات كتير. واللي مالوش مفتاح (وهُم الأغلبية) يشتغل فوراً
 * على مفتاح الشركة بدل ما يقف — التجهيز بقى اختياري مش إجباري.
 *
 * ملاحظة أمنية: مفتاح Groq **مايوصلش جهاز المندوب** خالص — كل نداءات Groq
 * بتتم من السيرفر (`/api/*`). عكس Deepgram، اللي المتصفح بيفتح عليه WebSocket
 * بنفسه فالمفتاح لازم ينزل على الجهاز (وده اللي خلّى المفتاح المشترك بتاعه
 * ينكشف قبل كده).
 *
 * @param clientKey اللي جاي في جسم الطلب — أي نوع، مش موثوق.
 * @param serverKey `process.env.GROQ_API_KEY` (ممكن يكون undefined).
 * @returns المفتاح المستخدم، أو `""` لو مافيش ولا واحد (الراوت يرد بخطأ).
 */
export function resolveGroqKey(clientKey: unknown, serverKey: string | undefined): string {
  if (typeof clientKey === "string" && clientKey.trim()) return clientKey.trim();
  return (serverKey ?? "").trim();
}

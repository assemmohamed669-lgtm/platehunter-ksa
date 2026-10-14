/**
 * 🔗 نص رسالة الأدمن للمناديب، واللينكات اللي فيها أزرق وتتدس (`lib/noticeLinks.ts`). اللينك بيفتح بره البرنامج —
 * لينك البلاي ستور بيفتح تطبيق Google Play ولينك الآب ستور بيفتح App Store (زي زرار «تواصل معانا»).
 */
import { parseNoticeText } from "@/lib/noticeLinks";

export default function NoticeText({ text }: { text: string }) {
  return (
    <>
      {parseNoticeText(text).map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <a
            key={i}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            dir="auto"
            className="break-all font-bold text-blue-600 underline underline-offset-2 dark:text-blue-400"
          >
            {p.label}
          </a>
        ),
      )}
    </>
  );
}

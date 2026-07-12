"use client";

import GroqKeyEditor from "@/components/GroqKeyEditor";

export default function KeysGroqPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">مفتاح Groq</h1>
        <p className="text-xs text-muted">لزيادة دقة التفريغ الصوتي وقراءة الكاميرا — الاستخدام على حسابك أنت.</p>
      </div>
      <GroqKeyEditor />
      <p className="px-1 text-[11px] text-muted" dir="rtl">
        المفتاح <b>بيتعمل لمرة واحدة فقط</b> من موقع Groq، وبعدها بيتحفظ على جهازك.
      </p>
    </div>
  );
}

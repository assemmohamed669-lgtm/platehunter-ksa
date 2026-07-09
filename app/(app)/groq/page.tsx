"use client";

import GroqKeyEditor from "@/components/GroqKeyEditor";

export default function GroqPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">مفتاح Groq</h1>
        <p className="text-xs text-muted">لزيادة دقة التفريغ الصوتي — الاستخدام على حسابك أنت.</p>
      </div>
      <GroqKeyEditor />
    </div>
  );
}

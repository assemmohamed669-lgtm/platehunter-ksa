"use client";

import DeepgramKeyEditor from "@/components/DeepgramKeyEditor";

export default function KeysDeepgramPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">مفتاح Deepgram</h1>
        <p className="text-xs text-muted">تفريغ صوتي لحظي دقيق (nova-3، لهجة مصرية) في تبويب صوت بتشييك — الاستخدام على حسابك أنت.</p>
      </div>
      <DeepgramKeyEditor />
    </div>
  );
}

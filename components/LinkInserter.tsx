"use client";

/**
 * 🔗 «حط لينك» تحت خانة رسالة الأدمن — المالك (١٤ أكتوبر ٢٠٢٦): «مثلا اضغط هنا … لما تدوس عليه يوديه علي مكان الرابط».
 * الكلام اللي يظهر + اللينك ⇒ بيضيف `[الكلام](اللينك)` للرسالة، والمندوب بيشوف الكلام بس أزرق ويتدس (`NoticeText`).
 */
import { useState } from "react";
import { Link2 } from "lucide-react";
import { normalizeLinkInput, linkMarkup } from "@/lib/noticeLinks";

export default function LinkInserter({ onInsert }: { onInsert: (markup: string) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-400">
        <Link2 size={12} /> حط لينك
      </button>
    );
  }

  function add() {
    const u = normalizeLinkInput(url);
    if (!u) { setBad(true); return; }
    onInsert(linkMarkup(label, u));
    setLabel(""); setUrl(""); setBad(false); setOpen(false);
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={100}
        placeholder="الكلام اللي يظهر (مثلاً: اضغط هنا)"
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-primary" />
      <input value={url} onChange={(e) => { setUrl(e.target.value); setBad(false); }} dir="ltr" inputMode="url"
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="https://…"
        className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-primary" />
      {bad && <p className="text-[10px] font-bold text-danger">اللينك مش مظبوط — انسخه كامل من المتصفح.</p>}
      <div className="flex gap-1.5">
        <button type="button" onClick={add} disabled={!url.trim()}
          className="flex-1 rounded-lg bg-blue-600 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">
          حط اللينك في الرسالة
        </button>
        <button type="button" onClick={() => { setOpen(false); setBad(false); }}
          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted">
          إلغاء
        </button>
      </div>
    </div>
  );
}

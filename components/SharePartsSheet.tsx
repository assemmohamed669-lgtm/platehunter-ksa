"use client";

/**
 * 📤 شاشة «الرسالة طويلة على واتساب» — بتبعت القايمة الطويلة على أجزاء.
 *
 * المالك (٢ أكتوبر ٢٠٢٦، أندرويد): «علّمت على الكل (٨٨) ودوست واتساب — وصل ٢٤ بس
 * ومقصوصين… وحتى نسخ الكل والصقهم في واتساب بردو ناقصين». اتقاس: واتساب بيقص أي
 * رسالة عند **٤٠٩٦ بايت** بالظبط، والبرنامج كان بيسلّمه النص كامل.
 *
 * كل أزرار المشاركة النصية بتعدّي على `shareTextViaChooser` (و«نسخ الكل» على
 * `copyForWhatsApp`)، فلما النص أطول من رسالة واتساب بيفتحوا الشاشة دي بدل ما
 * يبعتوا رسالة هتتقص: جزء جزء بالترتيب، وكل جزء بزرار «ابعت» و«نسخ».
 *
 * 🔑 مفعّلة للسوبر أدمن بس لحد `SHARE_PARTS_FOR_ALL` — غير المفعّلة مابتسجّلش،
 * فالمشاركة عنده زي الحي بالحرف.
 */

import { useEffect, useState } from "react";
import { MessageCircle, Copy, X } from "lucide-react";
import {
  registerSharePartsSheet, shareOneText, copyShareText, partPlateRange, arabicDigits,
  SHARE_PARTS_FOR_ALL, type SharePartsRequest,
} from "@/lib/share";
import { supabase } from "@/lib/supabaseClient";
import { pushBackHandler } from "@/lib/backStack";

export default function SharePartsSheet({ enabled }: { enabled?: boolean }) {
  const [allowed, setAllowed] = useState<boolean>(enabled ?? SHARE_PARTS_FOR_ALL);
  useEffect(() => {
    if (enabled !== undefined) { setAllowed(enabled); return; }
    if (SHARE_PARTS_FOR_ALL) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles").select("is_super").eq("id", data.user.id).single();
        if (alive) setAllowed(!!(prof as { is_super?: boolean } | null)?.is_super);
      } catch { /* أوفلاين — المشاركة القديمة شغّالة */ }
    })();
    return () => { alive = false; };
  }, [enabled]);

  const [req, setReq] = useState<SharePartsRequest | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    return registerSharePartsSheet((r) => { setReq(r); setDone(new Set()); });
  }, [allowed]);

  function close() {
    if (!req) return;
    const left = req.parts.length - done.size;
    // قفل وفيه أجزاء ماتبعتتش = لوحات هتضيع — نسأل الأول.
    if (left > 0 && !window.confirm(`لسه ${arabicDigits(left)} من ${arabicDigits(req.parts.length)} أجزاء ماتبعتوش — تقفل؟`)) return;
    req.done(done.size > 0 ? "shared" : "cancelled");
    setReq(null);
  }
  useEffect(() => { if (req) return pushBackHandler(close); });

  async function sendPart(i: number) {
    if (!req || busy) return;
    setBusy(true);
    try {
      const out = await shareOneText(req.parts[i], req.title);
      if (out !== "cancelled") setDone((s) => new Set(s).add(i));
    } finally { setBusy(false); }
  }
  async function copyPart(i: number) {
    if (!req) return;
    if (await copyShareText(req.parts[i])) setDone((s) => new Set(s).add(i));
  }

  if (!req) return null;
  const n = req.parts.length;
  const next = req.parts.findIndex((_, i) => !done.has(i));
  const copyFirst = req.mode === "copy";
  const primary = "flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-night disabled:opacity-50";
  const secondary = "flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-ink disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 pb-[env(safe-area-inset-bottom)] sm:items-center" onClick={close}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-surface p-4 sm:rounded-2xl"
        dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">الرسالة طويلة على واتساب — {arabicDigits(n)} أجزاء</h3>
          <button onClick={close} aria-label="قفل" className="text-muted hover:text-ink"><X size={18} /></button>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted">
          واتساب بيقص أي رسالة أطول من كده، فاللوحات هتتبعت على {arabicDigits(n)} رسايل بالترتيب.
          {copyFirst ? " انسخ كل جزء والزقه في المحادثة، وارجع هنا للي بعده." : " ابعت كل جزء وارجع هنا للي بعده."}
        </p>
        <div className="flex flex-col gap-2 overflow-auto">
          {req.parts.map((p, i) => {
            const range = partPlateRange(p);
            const isDone = done.has(i);
            const isNext = i === next;
            return (
              <div key={i} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                isDone ? "border-primary/40 bg-primary/5" : isNext ? "border-brand bg-brand/5" : "border-border bg-surface-2"}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">الجزء {arabicDigits(i + 1)} من {arabicDigits(n)}</p>
                  {range && <p className="text-[11px] text-muted">اللوحات {arabicDigits(range.from)}–{arabicDigits(range.to)}</p>}
                </div>
                {isDone && <span className="text-[11px] font-bold text-primary">✓ {copyFirst ? "اتنسخ" : "اتبعت"}</span>}
                <button onClick={() => void sendPart(i)} disabled={busy} className={copyFirst ? secondary : primary}>
                  <MessageCircle size={13} /> ابعت
                </button>
                <button onClick={() => void copyPart(i)} className={copyFirst ? primary : secondary}>
                  <Copy size={13} /> نسخ
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

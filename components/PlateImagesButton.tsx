"use client";

/**
 * زر «صورة» + نافذة معاينة — يحوّل قائمة لوحات لصورة (أو كذا صورة لو كتير)
 * ويعرضها مع أزرار تنزيل ومشاركة واتساب. بيستخدمه أي قائمة لوحات في البرنامج
 * (فرز/تشييك/تسجيل/خرايط) بنفس الشكل.
 */

import { useState, useEffect } from "react";
import { ImageDown, X, Download, Share2, Loader2 } from "lucide-react";
import { renderPlateImages, downloadDataUrl, type PlateImageRow } from "@/lib/plateImage";
import { shareImageWithText } from "@/lib/share";
import { pushBackHandler } from "@/lib/backStack";

interface Props {
  title: string;
  /** يُستدعى وقت الضغط فقط (كسول) — يرجّع صفوف اللوحات. */
  build: () => PlateImageRow[];
  label?: string;
  className?: string;
}

export default function PlateImagesButton({ title, build, label = "صورة", className }: Props) {
  const [images, setImages] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  // زر الرجوع (الهاتف) يقفل معاينة الصور بدل ما يطلّع من التطبيق.
  useEffect(() => { if (images) return pushBackHandler(() => setImages(null)); }, [images]);

  async function generate() {
    setBusy(true);
    try {
      // إفساح لحظة للريندر يبدأ (spinner) قبل الرسم المتزامن الثقيل.
      await new Promise((r) => setTimeout(r, 0));
      const rows = build();
      if (rows.length === 0) { alert("مفيش لوحات لعمل صورة."); return; }
      setImages(renderPlateImages({ title, rows }));
    } catch {
      alert("تعذّر إنشاء الصورة.");
    } finally {
      setBusy(false);
    }
  }

  function close() { setImages(null); }

  function fileName(i: number, total: number): string {
    const base = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "plates";
    return total > 1 ? `${base}-${i + 1}.png` : `${base}.png`;
  }

  async function shareOne(dataUrl: string, i: number, total: number) {
    const caption = total > 1 ? `${title} — صورة ${i + 1}/${total}` : title;
    await shareImageWithText(dataUrl, caption, fileName(i, total), title);
  }

  return (
    <>
      <button
        onClick={generate}
        disabled={busy}
        title="تحويل اللوحات لصورة"
        className={className ?? "flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted transition hover:text-primary disabled:opacity-50"}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ImageDown size={13} />} {label}
      </button>

      {images && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center" onClick={close}>
          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border-t border-border bg-surface sm:rounded-2xl"
            style={{ direction: "rtl" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-ink">
                {images.length > 1 ? `${images.length} صور` : "صورة اللوحات"}
              </h3>
              <button onClick={close} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>

            <div className="flex flex-1 flex-col gap-4 overflow-auto p-3">
              {images.map((src, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`لوحات ${i + 1}`} className="w-full rounded-lg" />
                  <div className="flex gap-2">
                    <button onClick={() => shareOne(src, i, images.length)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-night transition active:scale-95">
                      <Share2 size={13} /> مشاركة واتساب
                    </button>
                    <button onClick={() => downloadDataUrl(src, fileName(i, images.length))}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted transition hover:text-primary active:scale-95">
                      <Download size={13} /> تنزيل
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {images.length > 1 && (
              <div className="border-t border-border p-3">
                <button
                  onClick={() => images.forEach((src, i) => downloadDataUrl(src, fileName(i, images.length)))}
                  className="w-full rounded-xl border border-border py-2.5 text-sm text-muted transition hover:text-primary">
                  <Download size={14} className="ml-1 inline" /> تنزيل كل الصور ({images.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

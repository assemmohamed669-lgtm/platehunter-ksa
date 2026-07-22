"use client";

/**
 * زر «مشاركة الفرز» موحّد لكل نوافذ نتائج الفرز — يفتح قائمة بـ٣ خيارات:
 *   • فتح          → يفتح النتائج كملف إكسيل (موبايل: FileOpener، ويب: تنزيل)
 *   • واتساب       → يشارك النتائج كشيت إكسيل على واتساب/أي تطبيق
 *   • إرسال كصورة  → يحوّل النتائج لصورة (أو كذا صورة لو كتير) ويشاركها
 *
 * كل زر مربوط ببيانات الويندو بتاعه فقط (عبر rows()). بيجمع كل التصدير/المشاركة
 * اللي كانت متفرّقة (فتح إكسيل + واتساب + صورة) في مكان واحد.
 */

import { useState, useEffect, useMemo } from "react";
import { Share2, ExternalLink, MessageCircle, ImageDown, X, Download, Loader2, CheckSquare, Square } from "lucide-react";
import { buildSpreadsheetBlob, openExcelBlob, shareExcelBlob } from "@/lib/excel";
import { renderPlateImages, objToPlateRow, downloadDataUrl } from "@/lib/plateImage";
import { shareImageWithText } from "@/lib/share";
import { pushBackHandler } from "@/lib/backStack";

// الحقول المستبعَدة من صورة المشاركة — مخزّنة عشان تفضل عبر النوافذ والجلسات.
const IMG_EXCLUDED_KEY = "ph:shareImageExcludedFields";
function loadExcludedFields(): Set<string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(IMG_EXCLUDED_KEY) : null;
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

interface Props {
  /** اسم الشيت + عنوان الصورة + أساس اسم الملف. */
  title: string;
  /** يُستدعى وقت الضغط فقط — يرجّع صفوف النتائج (فيها «رقم اللوحة» + الأعمدة). */
  rows: () => Record<string, unknown>[];
  /** بنّاء ملف إكسيل مخصّص (اختياري) — عشان نحافظ على تلوين المكرّرات في نتائج
   *  الفرز الرئيسية. لو مش موجود بنبني شيت عادي من rows(). */
  excelBlob?: () => Promise<{ blob: Blob; ext: string }> | { blob: Blob; ext: string };
  className?: string;
}

function safeName(title: string): string {
  return title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "results";
}

export default function ShareSortButton({ title, rows, excelBlob, className }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<string[] | null>(null);
  // صفوف بانتظار اختيار الحقول قبل إنشاء الصورة (null = مفيش اختيار مفتوح).
  const [pickRows, setPickRows] = useState<Record<string, unknown>[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // زر الرجوع (الهاتف) يقفل الصور المعروضة الأول، ثم اختيار الحقول، ثم القائمة —
  // بدل ما يطلّع من التطبيق أو ينقلك لصفحة تانية.
  useEffect(() => { if (images) return pushBackHandler(() => setImages(null)); }, [images]);
  useEffect(() => { if (pickRows) return pushBackHandler(() => setPickRows(null)); }, [pickRows]);
  useEffect(() => { if (menuOpen) return pushBackHandler(() => setMenuOpen(false)); }, [menuOpen]);

  // الحقول المتاحة في صورة المشاركة (كل الأعمدة ماعدا «رقم اللوحة» — دايماً بيظهر).
  const availableFields = useMemo(() => {
    if (!pickRows) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of pickRows) {
      for (const k of Object.keys(row)) {
        if (k === "رقم اللوحة" || seen.has(k)) continue;
        seen.add(k); out.push(k);
      }
    }
    return out;
  }, [pickRows]);

  function toggleField(k: string) {
    setExcluded((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      try { localStorage.setItem(IMG_EXCLUDED_KEY, JSON.stringify([...n])); } catch { /* ignore */ }
      return n;
    });
  }

  function getRows(): Record<string, unknown>[] | null {
    const r = rows();
    if (!r.length) { alert("مفيش نتايج للمشاركة."); return null; }
    return r;
  }
  async function buildBlob(): Promise<{ blob: Blob; ext: string } | null> {
    if (excelBlob) return await excelBlob();
    const r = getRows(); if (!r) return null;
    return buildSpreadsheetBlob(r, title);
  }

  async function doOpen() {
    setMenuOpen(false); setBusy(true);
    try {
      const res = await buildBlob(); if (!res) return;
      await openExcelBlob(res.blob, `${safeName(title)}.${res.ext}`);
    } catch { alert("تعذّر فتح الملف."); } finally { setBusy(false); }
  }

  async function doWhatsapp() {
    setMenuOpen(false); setBusy(true);
    try {
      const res = await buildBlob(); if (!res) return;
      await shareExcelBlob(res.blob, `${safeName(title)}.${res.ext}`, title);
    } catch { alert("تعذّرت المشاركة على واتساب."); } finally { setBusy(false); }
  }

  // «إرسال كصورة» → يفتح اختيار الحقول الأول (المندوب يحدد اللي يظهر في الصورة).
  function doImage() {
    const r = getRows(); if (!r) return;
    setMenuOpen(false);
    setExcluded(loadExcludedFields()); // آخر اختيار محفوظ
    setPickRows(r);
  }

  // ينشئ الصورة بالحقول المختارة فقط (بيشيل الحقول المستبعَدة من كل صف).
  function generateImage() {
    if (!pickRows) return;
    const rowsFiltered = pickRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (k === "رقم اللوحة" || !excluded.has(k)) out[k] = v;
      }
      return out;
    });
    setPickRows(null); setBusy(true);
    setTimeout(() => {
      try {
        const imgs = renderPlateImages({ title, rows: rowsFiltered.map((x) => objToPlateRow(x)) });
        if (!imgs.length) { alert("مفيش نتايج."); return; }
        setImages(imgs);
      } catch { alert("تعذّر إنشاء الصورة."); } finally { setBusy(false); }
    }, 0);
  }

  function fileName(i: number, total: number): string {
    return total > 1 ? `${safeName(title)}-${i + 1}.png` : `${safeName(title)}.png`;
  }
  async function shareImg(src: string, i: number, total: number) {
    const caption = total > 1 ? `${title} — صورة ${i + 1}/${total}` : title;
    await shareImageWithText(src, caption, fileName(i, total), title);
  }

  return (
    <>
      <button onClick={() => setMenuOpen(true)} disabled={busy}
        className={className ?? "flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90 disabled:opacity-60"}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />} مشاركة الفرز
      </button>

      {/* قائمة الخيارات — bottom sheet */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setMenuOpen(false)}>
          <div className="w-full max-w-md rounded-t-2xl border-t border-border bg-surface p-4 sm:rounded-2xl" style={{ direction: "rtl" }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink">مشاركة الفرز</h3>
              <button onClick={() => setMenuOpen(false)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={doOpen}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5">
                <ExternalLink size={20} className="shrink-0 text-primary" />
                <div><p className="text-sm font-bold text-ink">فتح</p><p className="text-xs text-muted">افتح النتائج كملف إكسيل</p></div>
              </button>
              <button onClick={doWhatsapp}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5">
                <MessageCircle size={20} className="shrink-0 text-brand" />
                <div><p className="text-sm font-bold text-ink">واتساب</p><p className="text-xs text-muted">ابعت النتائج كشيت إكسيل</p></div>
              </button>
              <button onClick={doImage}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-right transition hover:border-primary/40 hover:bg-primary/5">
                <ImageDown size={20} className="shrink-0 text-primary" />
                <div><p className="text-sm font-bold text-ink">إرسال كصورة</p><p className="text-xs text-muted">حوّل النتائج لصورة وابعتها على واتساب</p></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* اختيار الحقول اللي تظهر في الصورة — قبل الإنشاء */}
      {pickRows && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setPickRows(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-surface sm:rounded-2xl" style={{ direction: "rtl" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-ink">اختَر اللي يظهر في الصورة</h3>
                <p className="text-[11px] text-muted mt-0.5">علّم على الحقول اللي عايزها تظهر. «رقم اللوحة» بيظهر دايماً.</p>
              </div>
              <button onClick={() => setPickRows(null)} className="shrink-0 text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto px-4 py-3">
              {availableFields.length === 0 ? (
                <p className="text-xs text-muted">مفيش حقول إضافية — الصورة هتعرض رقم اللوحة بس.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableFields.map((k) => {
                    const on = !excluded.has(k);
                    return (
                      <button key={k} onClick={() => toggleField(k)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${on ? "bg-primary text-night font-bold" : "border border-border text-muted"}`}>
                        {on ? <CheckSquare size={13} /> : <Square size={13} />} {k}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              <button onClick={generateImage}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-night transition hover:bg-primary/90">
                <ImageDown size={16} /> إنشاء الصورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* معاينة الصور — تنزيل / مشاركة لكل صورة */}
      {images && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" onClick={() => setImages(null)}>
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border-t border-border bg-surface sm:rounded-2xl" style={{ direction: "rtl" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-bold text-ink">{images.length > 1 ? `${images.length} صور` : "صورة النتائج"}</h3>
              <button onClick={() => setImages(null)} className="text-muted hover:text-ink"><X size={18} /></button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-3">
              {images.map((src, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`نتايج ${i + 1}`} className="w-full rounded-lg" />
                  <div className="flex gap-2">
                    <button onClick={() => shareImg(src, i, images.length)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-xs font-bold text-night transition active:scale-95">
                      <MessageCircle size={13} /> مشاركة واتساب
                    </button>
                    <button onClick={() => downloadDataUrl(src, fileName(i, images.length))}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted transition active:scale-95">
                      <Download size={13} /> تنزيل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

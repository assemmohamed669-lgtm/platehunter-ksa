"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Settings, HelpCircle, LogOut, Info,
  Type as TypeIcon, Palette, RotateCcw, ChevronDown, KeyRound,
  RefreshCw, Download, MessageCircle, BarChart3, CloudDownload,
} from "lucide-react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { type Appearance, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, applyAppearance } from "@/lib/appSettings";
import { getAllFieldCheckEntries, getUploadedFile, getAllRecordings } from "@/lib/idb";
import { detectPlateColumn, normalizePlate, bankPlateToArabic } from "@/lib/plateParser";
import { forceSyncAll, restoreRecordings } from "@/lib/sync";
import { pushFieldChecks, restoreFieldChecks } from "@/lib/syncFieldCheck";
import { subStatus } from "@/lib/subscription";
import { supabase } from "@/lib/supabaseClient";

const APP_VERSION = "0.3.0";
const DEFAULT_BG = "#F3F5F7";
// رقم واتساب الأدمن بصيغة دولية بدون + أو 00
const ADMIN_WHATSAPP = "971542482545";

function clamp01(n: number) { return Math.min(1, Math.max(0, n)); }

/**
 * Global slide-in menu. Controlled via `open`. Opens by tapping the ☰ button
 * (rendered in the header, home page only) OR by dragging a finger from the
 * right edge of the screen leftward — the drawer tracks the finger both ways.
 */
export default function AppMenu({
  open,
  onOpenChange,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLogout: () => void;
}) {
  // frac: 0 = fully open, 1 = fully closed. Drives the drawer transform.
  const [frac, setFrac] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [appr, setAppr] = useState<Appearance>(DEFAULT_APPEARANCE);
  const [helpOpen, setHelpOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [stats, setStats] = useState({ field: 0, wanted: 0, rec: 0 });
  const [subEnd, setSubEnd] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);
  const fracRef = useRef(1);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const widthRef = useRef(320);
  const axisRef = useRef<"?" | "x" | "y">("?");
  const dragBlockedRef = useRef(false); // true when the drag started on a control (slider/button/link)

  useEffect(() => { setAppr(loadAppearance()); }, []);

  // Sync drawer position to the controlled `open` when not mid-drag.
  useEffect(() => {
    if (dragging) return;
    const target = open ? 0 : 1;
    fracRef.current = target;
    setFrac(target);
  }, [open, dragging]);

  function setFracBoth(f: number) { fracRef.current = f; setFrac(f); }

  function drawerWidth() {
    return drawerRef.current?.offsetWidth || Math.min(320, (typeof window !== "undefined" ? window.innerWidth : 360) * 0.82);
  }

  // ── Edge-swipe to OPEN (only while closed) ──────────────────────────────────
  function onEdgeStart(e: React.TouchEvent) {
    if (open) return;
    setDragging(true);
    widthRef.current = drawerWidth();
    startXRef.current = e.touches[0].clientX;
  }
  function onEdgeMove(e: React.TouchEvent) {
    if (!dragging) return;
    const movedLeft = startXRef.current - e.touches[0].clientX; // leftward = positive
    setFracBoth(clamp01(1 - movedLeft / widthRef.current));
  }
  function onDragEnd() {
    if (!dragging) return;
    setDragging(false);
    const shouldOpen = fracRef.current < 0.5;
    onOpenChange(shouldOpen);
    setFracBoth(shouldOpen ? 0 : 1);
  }

  // ── Drag the open drawer to CLOSE (horizontal drags only, so vertical
  //    scrolling inside the drawer still works) ──────────────────────────────
  function onDrawerStart(e: React.TouchEvent) {
    if (!open) return;
    widthRef.current = drawerWidth();
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    axisRef.current = "?";
    // A drag that begins on an interactive control (the font slider, a colour
    // input, a button, a link) must NOT slide the whole drawer — let the
    // control handle its own gesture.
    dragBlockedRef.current = !!(e.target as HTMLElement).closest("input, button, a, select, textarea, label");
  }
  function onDrawerMove(e: React.TouchEvent) {
    if (!open && !dragging) return;
    if (dragBlockedRef.current) return;
    const dx = e.touches[0].clientX - startXRef.current; // rightward = positive = closing
    const dy = e.touches[0].clientY - startYRef.current;
    if (axisRef.current === "?") {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axisRef.current === "x") setDragging(true);
    }
    if (axisRef.current !== "x") return; // vertical → let it scroll
    setFracBoth(clamp01(dx / widthRef.current));
  }

  // ── Appearance controls ─────────────────────────────────────────────────────
  function update(patch: Partial<Appearance>) {
    const next = { ...appr, ...patch };
    setAppr(next);
    saveAppearance(next);
    applyAppearance(next);
  }
  function resetAppearance() {
    setAppr(DEFAULT_APPEARANCE);
    saveAppearance(DEFAULT_APPEARANCE);
    applyAppearance(DEFAULT_APPEARANCE);
  }

  // Quick counts, refreshed whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const fieldEntries = await getAllFieldCheckEntries().catch(() => []);
      let wanted = 0;
      try {
        const check = await getUploadedFile("local", "check");
        if (check) {
          const col = detectPlateColumn(check.headers);
          const set = new Set(check.rows.map((r) => normalizePlate(bankPlateToArabic(String(r[col ?? ""] ?? "")))).filter(Boolean));
          wanted = fieldEntries.filter((e) => set.has(normalizePlate(bankPlateToArabic(e.plate)))).length;
        }
      } catch { /* no check file */ }
      let rec = 0;
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          rec = (await getAllRecordings(data.user.id)).length;
          const { data: prof } = await supabase.from("profiles")
            .select("role, subscription_end").eq("id", data.user.id).single();
          if (prof?.role === "agent") setSubEnd(prof.subscription_end ?? null);
        }
      } catch { /* offline */ }
      setStats({ field: fieldEntries.length, wanted, rec });
    })().catch(() => {});
  }, [open]);

  // Clear caches + fetch the latest bundle from the server.
  async function refreshApp() {
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* caches unavailable */ }
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs) await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* no SW */ }
    // Cache-busting reload so the WebView pulls the freshest bundle.
    const u = new URL(window.location.href);
    u.searchParams.set("_r", String(Date.now()));
    window.location.replace(u.toString());
  }

  // مزامنة كاملة في الاتجاهين: يرفع اللي على الجهاز للسيرفر، ويسحب اللي على
  // السيرفر للجهاز (استرجاع). بيشتغل من أي مكان — مفيد بعد تغيير التليفون.
  async function fullSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) { alert("لازم تكون مسجّل دخول."); return; }
      const pushR = await forceSyncAll(uid);
      const pushF = await pushFieldChecks(uid);
      const pullR = await restoreRecordings(uid);
      const pullF = await restoreFieldChecks(uid);
      const err = pushR.error || pushF.error || pullR.error || pullF.error;
      alert(
        `تمّت المزامنة:\n` +
        `⬆️ رفع: ${pushR.synced} تسجيل + ${pushF.synced} تشييك\n` +
        `⬇️ استرجاع: ${pullR.restored} تسجيل + ${pullF.restored} تشييك` +
        (err ? `\n\n⚠️ ${err}` : "")
      );
      window.location.reload();
    } catch (e: any) {
      alert(`تعذّرت المزامنة: ${e?.message ?? e}`);
    } finally {
      setSyncing(false);
    }
  }

  const translate = `translateX(${frac * 100}%)`;
  const visible = frac < 1;

  return (
    <>
      {/* Right-edge catcher — thin strip that starts an open-drag from anywhere */}
      {!open && (
        <div
          className="fixed right-0 top-0 z-40 h-full"
          style={{ width: 20 }}
          onTouchStart={onEdgeStart}
          onTouchMove={onEdgeMove}
          onTouchEnd={onDragEnd}
        />
      )}

      {/* Backdrop */}
      {visible && (
        <div
          className="fixed inset-0 z-40 bg-black"
          style={{ opacity: (1 - frac) * 0.6 }}
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed right-0 top-0 z-50 flex h-full w-[82vw] max-w-xs flex-col border-l border-border bg-surface shadow-2xl"
        style={{ transform: translate, transition: dragging ? "none" : "transform 0.25s ease", visibility: visible ? "visible" : "hidden" }}
        onTouchStart={onDrawerStart}
        onTouchMove={onDrawerMove}
        onTouchEnd={onDragEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-bold text-ink">القائمة</span>
          <button onClick={() => onOpenChange(false)} className="rounded-lg p-1 text-muted hover:text-ink" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {/* ── الإعدادات: المظهر ── */}
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-muted"><Settings size={14} /> الإعدادات</h3>

            {/* حجم الخط */}
            <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink"><TypeIcon size={13} /> حجم الخط</span>
                <span className="text-[11px] text-muted">{Math.round(appr.fontScale * 100)}%</span>
              </div>
              <input
                type="range" min={100} max={130} step={5}
                value={Math.round(appr.fontScale * 100)}
                onChange={(e) => update({ fontScale: Number(e.target.value) / 100 })}
                className="w-full accent-primary"
              />
              <p className="text-[10px] text-muted">حرّك لتكبير أو تصغير كل النصوص في التطبيق.</p>
            </div>

            {/* لون الخلفية (لون الخط يتظبط تلقائياً عشان يفضل واضح) */}
            <label className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs font-bold text-ink">
              <span className="flex items-center gap-1.5"><Palette size={13} /> لون الخلفية</span>
              <input type="color" value={appr.bgColor ?? DEFAULT_BG} onChange={(e) => update({ bgColor: e.target.value })}
                className="h-6 w-8 rounded border border-border bg-transparent" />
            </label>
            <p className="text-[10px] text-muted">لون الخط بيتظبط تلقائياً حسب الخلفية (أبيض على الغامق، غامق على الفاتح). ألوان الحالة (مطلوبة/غير مطلوبة) ثابتة.</p>

            <button onClick={resetAppearance}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-2 text-xs font-bold text-muted hover:text-ink transition">
              <RotateCcw size={13} /> استعادة الافتراضي
            </button>

            {/* الوضع الليلي */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
              <span className="text-xs font-bold text-ink">الوضع الليلي / التوفير</span>
              <ThemeToggle />
            </div>
          </section>

          {/* ── إحصائيات سريعة ── */}
          <section className="border-t border-border pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted"><BarChart3 size={14} /> إحصائيات</div>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface-2 p-2 text-center">
              <div><p className="text-lg font-black text-brand">{stats.field}</p><p className="text-[10px] text-muted">لوحات السجلات</p></div>
              <div><p className="text-lg font-black text-danger">{stats.wanted}</p><p className="text-[10px] text-muted">مطلوبة اتلاقت</p></div>
              <div><p className="text-lg font-black text-primary">{stats.rec}</p><p className="text-[10px] text-muted">تسجيلات صوتية</p></div>
            </div>
            {subEnd && (() => {
              const s = subStatus(subEnd);
              return (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs">
                  <span className="text-muted">اشتراكك حتى {subEnd}</span>
                  <span className="font-bold" style={{ color: s.color }}>{s.label}</span>
                </div>
              );
            })()}
          </section>

          {/* ── أدوات ── */}
          <section className="flex flex-col gap-2 border-t border-border pt-3">
            <Link href="/groq" onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-surface-2 transition">
              <KeyRound size={16} className="text-alert" /> مفتاح Groq (التفريغ السحابي)
            </Link>
            <button onClick={fullSync} disabled={syncing}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-surface-2 transition disabled:opacity-50">
              <CloudDownload size={16} className="text-primary" /> {syncing ? "جارٍ المزامنة..." : "مزامنة واسترجاع بياناتي"}
            </button>
            <Link href="/backup" onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-surface-2 transition">
              <Download size={16} className="text-brand" /> نسخة احتياطية
            </Link>
            <button onClick={refreshApp}
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-surface-2 transition">
              <RefreshCw size={16} className="text-primary" /> تحديث التطبيق (آخر نسخة)
            </button>
            {ADMIN_WHATSAPP && (
              <a href={`https://wa.me/${ADMIN_WHATSAPP}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-surface-2 transition">
                <MessageCircle size={16} className="text-brand" /> تواصل مع الأدمن (واتساب)
              </a>
            )}
          </section>

          {/* ── شرح ومساعدة ── */}
          <section className="border-t border-border pt-3">
            <button onClick={() => setHelpOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-surface-2 transition">
              <span className="flex items-center gap-2"><HelpCircle size={16} className="text-alert" /> شرح ومساعدة</span>
              <ChevronDown size={14} className={`text-muted transition-transform ${helpOpen ? "rotate-180" : ""}`} />
            </button>
            {helpOpen && (
              <div className="px-3 pb-2 pt-1 text-[11px] leading-relaxed text-muted" dir="rtl">
                • <b>التسجيل الصوتي:</b> قول اللوحة حرف حرف وبعدها وقفة صغيرة، والنوع (ونيت/فان...) بعد الرقم.<br />
                • <b>التشييك بالكاميرا:</b> وجّه اللوحة داخل الإطار والتقط.<br />
                • <b>التشييك بالصوت:</b> قول لوحة ← استنى النتيجة ← قول اللي بعدها.<br />
                • <b>مفتاح Groq:</b> من القائمة ← مفتاح Groq، يزوّد دقة التفريغ.
              </div>
            )}
          </section>

          {/* ── الحساب ── */}
          <section className="border-t border-border pt-3">
            {confirmLogout ? (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 flex flex-col gap-2">
                <p className="text-xs font-bold text-ink">متأكد إنك عايز تسجّل خروج؟</p>
                <div className="flex gap-2">
                  <button onClick={() => { setConfirmLogout(false); onOpenChange(false); onLogout(); }}
                    className="flex-1 rounded-lg bg-danger py-2 text-xs font-bold text-white">تأكيد الخروج</button>
                  <button onClick={() => setConfirmLogout(false)}
                    className="flex-1 rounded-lg border border-border py-2 text-xs text-muted">إلغاء</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmLogout(true)}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-danger hover:bg-danger/10 transition">
                <LogOut size={16} /> تسجيل الخروج
              </button>
            )}
          </section>
        </div>

        {/* ── عن التطبيق ── */}
        <div className="flex items-center gap-1.5 border-t border-border px-4 py-3 text-[11px] text-muted">
          <Info size={12} /> قناص اللوحات — الإصدار {APP_VERSION}
        </div>
      </div>
    </>
  );
}

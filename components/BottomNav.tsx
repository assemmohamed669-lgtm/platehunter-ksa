"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListFilter, Mic, MapPin, ScanLine, Crosshair, FileUp, Type, Barcode, FileText, ClipboardCheck, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { visibleTabs, isTabActive } from "@/lib/navTabs";
import { voiceProNames } from "@/lib/voiceProName";
import { serviceActive } from "@/lib/subscription";
import { getCheckTab, setCheckTab, onCheckTabChange, type CheckTab } from "@/lib/checkTab";
import { canOpenTrialPage } from "@/lib/trialModelGate";

// تبويبات المشترك «صوت فقط» في الشريط التحتي (زي قناص) — كل واحدة بتبدّل خيار
// التشييك من مخزن checkTab (مش رابط)، ونفس ترتيب المالك.
const VOICE_TABS: { tab: CheckTab; label: string; icon: typeof Mic }[] = [
  { tab: "ptt", label: "صوتي", icon: Mic },
  { tab: "manual", label: "يدوي", icon: Type },
  { tab: "chassis", label: "شاص", icon: Barcode },
  { tab: "cert", label: "شهايد", icon: FileText },
  { tab: "sheet", label: "السجلات", icon: ClipboardCheck },
  { tab: "sort", label: "فرز", icon: ListFilter },
];

const TABS = [
  { href: "/sorting", label: "الفرز", icon: ListFilter },
  { href: "/instant-check", label: "التشييك", icon: ScanLine },
  /**
   * ✨ «الجديد» — صفحة الموديل الجديد (ماليزيا · ckpt-7500).
   *
   * 🔴 **صفحة زيادة، مش بديلة.** المالك (٢٣ سبتمبر ٢٠٢٦): «احنا مش هنلغي
   * صفحة التشييك اللي فيها باقي الخدمات، هنخليها عادي — احنا بس هنضيف صفحة
   * زيادة تحت هنسميها الجديد». فالتشييك بتفضل زي ما هي بالحرف، ودي جنبها.
   *
   * 🔴 **مربوط بخدمة الصوت** (`needsVoice`) — المالك (٢٣ سبتمبر ٢٠٢٦):
   * «اللي مشترك كل خدمات البرنامج الصفحة تضاف معاه تحت… الصفحة تتقفل فقط
   * على اللي مش مشترك معانا في خدمة الصوت». بيطابق `canOpenTrialPage`
   * بالظبط، والاتنين على `voiceTabVisible` (نفس دالة «صوتي») — فزرّ
   * «فتح الصوت» الواحد بيقفل ويفتح الاتنين.
   */
  { href: "/registration-v2", label: "الجديد", icon: Sparkles, needsVoice: true },
  // التسجيل للسوبر أدمن فقط (superOnly) — مخفي عن المناديب.
  { href: "/registration", label: "التسجيل", icon: Mic, superOnly: true },
  { href: "/maps", label: "الخرائط", icon: MapPin },
  { href: "/wanted", label: "المطلوب", icon: Crosshair },
  { href: "/data-upload", label: "رفع داتا", icon: FileUp },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isSuper, setIsSuper] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  /**
   * يقدر يفتح «الجديد»؟ — **نفس الدالة اللي بتقفل الصفحة** (`canOpenTrialPage`
   * = `voiceTabVisible` بتاعة «صوتي» من غير كاش): مفتاح الصوت مفتوح وأيامه
   * سارية (مشترك أو تجربة)، أو السوبر أدمن.
   *
   * 🔴 **بتبدأ مخفية وماتظهرش إلا بعد ما السيرفر يأكّد.** المالك (٢٣ سبتمبر
   * ٢٠٢٦): «الصفحة مش هتظهر غير لمشتركين الصوت فقط… أهم حاجة مفتاح الصوت
   * يكون فعّال عندهم». كانت بتبدأ من آخر قيمة محفوظة على الجهاز، فاللي
   * الصوت اتقفل عنده كان بيلمح التابة لحظة — أو تفضل ظاهرة لو فتح من غير
   * نت. «الجديد» محتاجة الشبكة أصلاً (سيرفر ماليزيا)، فمافيش فايدة تظهر أوفلاين.
   */
  const [hasVoice, setHasVoice] = useState<boolean>(false);
  // التبويب النشط في صفحة التشييك (للمشترك صوت-فقط) — يتزامن مع مخزن checkTab.
  const [activeTab, setActiveTab] = useState<CheckTab>(getCheckTab());
  useEffect(() => onCheckTabChange(setActiveTab), []);
  // «باقي صفحات البرنامج» — مفتوح افتراضياً. false = المشترك «صوت VoiceX فقط»
  // فمانعرضش غير تبويب التشييك (اللي فيه الصوت).
  const [restPages, setRestPages] = useState(true);
  // نخفي الشريط لما الكيبورد يطلع (وإلا بيتزقّ فوق الكيبورد) — نكشف الكيبورد من
  // تركيز خانة كتابة (input نصي/textarea/محرّر)، ده بيشتغل سواء الأندرويد بيصغّر
  // الشاشة أو بيزحلقها. focusout بمهلة صغيرة عشان الانتقال بين خانتين مايرمشش.
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      const n = el as HTMLElement | null;
      if (!n || !n.tagName) return false;
      if (n.tagName === "TEXTAREA") return true;
      if (n.tagName === "INPUT") {
        const t = (n as HTMLInputElement).type;
        return !["checkbox", "radio", "button", "submit", "reset", "file", "color", "range", "image", "hidden"].includes(t);
      }
      return n.isContentEditable;
    };
    let blurTimer: ReturnType<typeof setTimeout>;
    const onFocusIn = (e: FocusEvent) => { clearTimeout(blurTimer); setKbOpen(isEditable(e.target)); };
    const onFocusOut = () => { blurTimer = setTimeout(() => setKbOpen(false), 120); };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(blurTimer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // صلاحية المستخدم — بتحدد ظهور تبويب التسجيل (سوبر) و«رفع داتا» (أدمن) +
  // هل باقي الصفحات مقفولة (المشترك «صوت VoiceX فقط»).
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: prof } = await supabase.from("profiles")
          .select("is_super, role, rest_pages_enabled, rest_until, voicex_enabled, voicex_until").eq("id", data.user.id).single();
        setIsSuper(!!prof?.is_super);
        setIsAdmin(prof?.role === "admin");
        // ✨ «الجديد» بتظهر مع «صوتي» وبتختفي معاها — زرّ «فتح الصوت» الواحد.
        setHasVoice(canOpenTrialPage(prof as Parameters<typeof canOpenTrialPage>[0]));
        // باقي البرنامج متاح لو (مفتوح يدويًا) و(أيامه سارية) — أو سوبر أدمن.
        const rp = prof as { is_super?: boolean; rest_pages_enabled?: boolean; rest_until?: string | null } | null;
        setRestPages(rp?.is_super === true || (rp?.rest_pages_enabled !== false && serviceActive(rp?.rest_until)));
      } catch { /* غير متاح — يفضل مخفي */ }
    })();
  }, []);

  // باقي الصفحات مقفولة (+ VoiceX مفتوح) = «صوت فقط» → تبويب التشييك بس.
  const tabs = restPages
    ? visibleTabs(TABS, { isSuper, isAdmin, hasVoice })
    : TABS.filter((t) => t.href === "/instant-check");
  /** إحنا على صفحة «الجديد» دلوقتي؟ (عشان تبويبات التشييك ماتبانش نشطة غلط) */
  const onNew = !!pathname?.startsWith("/registration-v2");

  return (
    // الشريط أسود ثابت في الوضعين (فاتح/غامق) بطلب المندوب — والكلام أبيض.
    // بينزلق لتحت ويختفي لما الكيبورد يطلع عشان مايظهرش فوقه.
    <nav
      aria-hidden={kbOpen}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-black/95 backdrop-blur transition-transform duration-200 ${
        kbOpen ? "pointer-events-none translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto flex max-w-md justify-between px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {!restPages ? (
          // المشترك صوت-فقط: خيارات التشييك (صوتي/يدوي/شاص/شهايد/السجلات/فرز)
          // في الشريط التحتي زي قناص — بتبدّل الخيار من مخزن checkTab.
          VOICE_TABS.flatMap(({ tab, label, icon: Icon }) => {
            // على «الجديد» تبويبات التشييك مابتبانش نشطة — المندوب مش فيها.
            const active = !onNew && activeTab === tab;
            const btn = (
              <button
                key={tab}
                onClick={() => {
                  setCheckTab(tab);
                  if (pathname !== "/instant-check") router.push("/instant-check");
                }}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[11px] transition ${
                  active ? "text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 2}
                  className={active ? "drop-shadow-[0_0_7px_rgba(255,255,255,0.75)]" : ""}
                />
                <span className={`w-full truncate text-center ${active ? "font-bold" : ""}`}>{label}</span>
              </button>
            );
            /**
             * ✨ **«الجديد» جنب «صوتي» على طول** — المالك (٢٣ سبتمبر ٢٠٢٦):
             * «لو مشترك الصوت فقط بيظهر عنده صوتي تحت، يظهر جنبها الصفحة
             * الجديدة». ومربوطة بنفس شرط «صوتي»، فلو الصوت اتقفل الاتنين
             * بيختفوا مع بعض.
             */
            if (tab !== "ptt" || !hasVoice) return [btn];
            return [btn, (
              <button
                key="new"
                onClick={() => { if (!onNew) router.push("/registration-v2"); }}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[11px] transition ${
                  onNew ? "text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <Sparkles
                  size={22}
                  strokeWidth={onNew ? 2.5 : 2}
                  className={onNew ? "drop-shadow-[0_0_7px_rgba(255,255,255,0.75)]" : ""}
                />
                {/* 🏷️ «Voice PRO» — السوبر أدمن الأول (`lib/voiceProName.ts`) */}
                <span className={`w-full truncate text-center ${onNew ? "font-bold" : ""}`}>{voiceProNames(isSuper).tab}</span>
              </button>
            )];
          })
        ) : (
          tabs.map(({ href, label, icon: Icon }) => {
            // 🔴 مش `startsWith` — «الجديد» (/registration-v2) كانت بتنوّر «التسجيل» معاها.
            const active = isTabActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-[11px] transition ${
                  active ? "text-white" : "text-white/60 hover:text-white"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 2}
                  className={active ? "drop-shadow-[0_0_7px_rgba(255,255,255,0.75)]" : ""}
                />
                <span className={`w-full truncate text-center ${active ? "font-bold" : ""}`}>
                  {href === "/registration-v2" ? voiceProNames(isSuper).tab : label}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </nav>
  );
}

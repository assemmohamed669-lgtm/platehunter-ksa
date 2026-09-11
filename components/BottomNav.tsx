"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListFilter, Mic, MapPin, ScanLine, Crosshair, FileUp, Type, Barcode, FileText, ClipboardCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { visibleTabs } from "@/lib/navTabs";
import { serviceActive } from "@/lib/subscription";
import { getCheckTab, setCheckTab, onCheckTabChange, type CheckTab } from "@/lib/checkTab";

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
          .select("is_super, role, rest_pages_enabled, rest_until").eq("id", data.user.id).single();
        setIsSuper(!!prof?.is_super);
        setIsAdmin(prof?.role === "admin");
        // باقي البرنامج متاح لو (مفتوح يدويًا) و(أيامه سارية) — أو سوبر أدمن.
        const rp = prof as { is_super?: boolean; rest_pages_enabled?: boolean; rest_until?: string | null } | null;
        setRestPages(rp?.is_super === true || (rp?.rest_pages_enabled !== false && serviceActive(rp?.rest_until)));
      } catch { /* غير متاح — يفضل مخفي */ }
    })();
  }, []);

  // باقي الصفحات مقفولة (+ VoiceX مفتوح) = «صوت فقط» → تبويب التشييك بس.
  const tabs = restPages
    ? visibleTabs(TABS, { isSuper, isAdmin })
    : TABS.filter((t) => t.href === "/instant-check");

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
          VOICE_TABS.map(({ tab, label, icon: Icon }) => {
            const active = activeTab === tab;
            return (
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
          })
        ) : (
          tabs.map(({ href, label, icon: Icon }) => {
            const active = pathname?.startsWith(href);
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
                <span className={`w-full truncate text-center ${active ? "font-bold" : ""}`}>{label}</span>
              </Link>
            );
          })
        )}
      </div>
    </nav>
  );
}

import {
  ListFilter, ScanLine, Mic, Crosshair, MapPin, Timer, Sparkles,
  Share2, BarChart3, ShieldCheck, Lightbulb, HelpCircle, MessageCircle,
  type LucideIcon,
} from "lucide-react";

// رقم واتساب الإدارة (نفس اللي في القائمة) — للمساعدة.
const ADMIN_WHATSAPP = "971542482545";

// شرح مبسّط لكل خدمة — من منظور المندوب فقط (بدون أي تفاصيل تقنية أو داخلية).
interface Service {
  icon: LucideIcon;
  color: string;
  title: string;
  desc: string;
  steps?: string[];
}

const SERVICES: Service[] = [
  {
    icon: ListFilter, color: "text-brand", title: "الفرز",
    desc: "بيقارن قائمة المطلوبين (من الجهة أو البنك) ببيانات التفريغ الميداني، ويطلّعلك السيارات المطلوبة اللي ظهرت فعلاً وأماكنها.",
    steps: [
      "ارفع «ملف الداتا» (بيانات التفريغ) و«ملف الإحالة» (قائمة المطلوبين).",
      "تقدر تضيف أكتر من ملف إحالة ويتفرزوا مع بعض في نتيجة واحدة.",
      "«فرز كلي» = كل المطلوبين، و«فرز جديد» = بس اللي لسه ما اتشيّكوش.",
    ],
  },
  {
    icon: ScanLine, color: "text-primary", title: "التشييك",
    desc: "أسرع طريقة تعرف بيها إذا كانت اللوحة مطلوبة ولا لأ — على طول.",
    steps: [
      "اكتب اللوحة بإيدك، أو صوّرها بالكاميرا، أو انطقها بصوتك.",
      "لو طلعت مطلوبة هيوصلك تنبيه واضح بصوت.",
    ],
  },
  {
    icon: Mic, color: "text-brand", title: "التسجيل",
    desc: "بتفرّغ لوحات كتير في الميدان؟ انطق اللوحة وهي بتتسجّل تلقائياً مع موقعها — أسرع بكتير من الكتابة.",
  },
  {
    icon: Crosshair, color: "text-danger", title: "المطلوب",
    desc: "بياخد قائمة المطلوبين ويوريك مين منهم ظهر في بياناتك وسجلاتك، بكل تفاصيله: الماركة، النوع، الجهة، الحي، والموقع. كل لوحة مكررة بلون عشان تفرّقها بسهولة.",
  },
  {
    icon: MapPin, color: "text-primary", title: "الخرائط",
    desc: "بتعرض كل اللوحات اللي شيّكتها على الخريطة، والسيارات المطلوبة اللي لقيتها، وتقدر ترتّبهم حسب الأقرب ليك عشان توفّر وقت وبنزين.",
  },
  {
    icon: Timer, color: "text-brand", title: "منظّم الإيقاع",
    desc: "لما تسجّل بصوتك، بيساعدك تنطق اللوحات بإيقاع منتظم (إشارة بين اللوحة والتانية) عشان النتيجة تطلع أدق.",
  },
  {
    icon: Sparkles, color: "text-primary", title: "تحليل ذكي",
    desc: "بعد ما تخلّص تسجيل صوتي، بيرتّبلك اللوحات وأنواعها في جدول جاهز تلقائياً — يوفّر عليك التنظيم اليدوي.",
  },
  {
    icon: Share2, color: "text-brand", title: "المشاركة والتصدير",
    desc: "أي نتيجة تقدر تبعتها على واتساب على طول، أو تفتحها في إكسيل وتحفظها.",
  },
  {
    icon: BarChart3, color: "text-primary", title: "الإحصائيات",
    desc: "من القائمة (زر ☰)، بتلاقي أرقام شغلك: لوحات السجلات، المطلوبة اللي اتلاقت، والتسجيلات — واضغط على أي رقم يوديك للتفاصيل.",
  },
  {
    icon: ShieldCheck, color: "text-brand", title: "بياناتك في أمان",
    desc: "كل شغلك بيتحفظ على جهازك وبيتزامن تلقائياً، فمش بيضيع لو قفلت التطبيق أو غيّرت الجهاز.",
  },
];

const TIPS = [
  "انطق اللوحة حرف حرف وبعدها وقفة صغيرة.",
  "قول نوع السيارة بعد الرقم (ونيت / فان / دباب...).",
  "في الكاميرا: خلّي اللوحة واضحة وجوّه الإطار.",
  "في التشييك بالصوت: استنى النتيجة قبل ما تقول اللوحة اللي بعدها.",
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="flex items-center gap-2">
        <HelpCircle size={22} className="text-alert" />
        <div>
          <h1 className="text-lg font-bold text-ink">شرح ومساعدة</h1>
          <p className="text-xs text-muted">كل خدمة في البرنامج وهي بتعمل إيه</p>
        </div>
      </div>

      <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
        «قناص اللوحات» بيساعدك تعرف أي سيارة مطلوبة وفين بالظبط، وتسجّل شغلك الميداني بسرعة وسهولة.
        تحت شرح بسيط لكل خدمة:
      </p>

      {/* تنبيه مهم عن دقة الـ GPS — بولد وأحمر */}
      <p className="rounded-2xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm font-bold leading-relaxed text-danger" dir="rtl">
        ⚠️ لازم تتأكد إن خانة الـ GPS في صفحة التسجيل شغّالة كويس وبدقّة عالية — الموقع الدقيق مهم جداً في التشييك الصوتي واليدوي وفي التسجيل.
      </p>

      {SERVICES.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.title} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                <Icon size={18} className={s.color} />
              </span>
              <h2 className="text-sm font-bold text-ink">{s.title}</h2>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">{s.desc}</p>
            {s.steps && (
              <ul className="flex flex-col gap-1 pr-1">
                {s.steps.map((st, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-muted">
                    <span className="text-brand">•</span>
                    <span>{st}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* نصائح للدقة */}
      <div className="flex flex-col gap-2 rounded-2xl border border-alert/40 bg-alert/5 p-4">
        <div className="flex items-center gap-2">
          <Lightbulb size={18} className="text-alert" />
          <h2 className="text-sm font-bold text-ink">نصائح تطلّع أدق نتيجة</h2>
        </div>
        <ul className="flex flex-col gap-1 pr-1">
          {TIPS.map((t, i) => (
            <li key={i} className="flex gap-1.5 text-[12px] leading-relaxed text-muted">
              <span className="text-alert">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* مساعدة من الإدارة */}
      <a href={`https://wa.me/${ADMIN_WHATSAPP}`} target="_blank" rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-night transition active:scale-[0.99]">
        <MessageCircle size={16} /> محتاج مساعدة؟ كلّم الإدارة
      </a>
    </div>
  );
}

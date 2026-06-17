import { ScanLine, Camera, Type, Mic } from "lucide-react";

export default function InstantCheckPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">التشييك الفوري</h1>
        <p className="text-sm text-muted">تحقق خاطف من محفظة البنك بثلاث طرق</p>
      </div>

      <div className="surface-card rounded-2xl border border-border bg-surface p-5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-dark text-primary">
            <ScanLine size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink">قيد التطوير</h2>
            <p className="text-xs text-muted">الجزء القادم</p>
          </div>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <div className="flex items-start gap-2">
            <Camera size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>تصوير اللوحة بالكاميرا وقراءتها بالذكاء الاصطناعي (ANPR) ومطابقتها فورًا.</span>
          </div>
          <div className="flex items-start gap-2">
            <Type size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>إدخال يدوي سريع لرقم اللوحة مع بحث فوري في المحفظة.</span>
          </div>
          <div className="flex items-start gap-2">
            <Mic size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>اضغط واتكلم (Push to Talk) لقول عدة لوحات متتالية ومطابقتها دفعة واحدة.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

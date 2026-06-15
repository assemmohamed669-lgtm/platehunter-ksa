import { ListFilter } from "lucide-react";
import { PhaseCard, FeatureRow } from "@/components/PhaseCard";

export default function SortingPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">الفرز</h1>
        <p className="text-sm text-muted">
          مطابقة بيانات الميدان مع قوائم البنوك.
        </p>
      </div>

      <PhaseCard icon={ListFilter} title="محرك المطابقة" phase="المرحلة الرابعة">
        <FeatureRow>
          استيراد قوائم البنوك (Excel) وتحويل الحروف الإنجليزية إلى
          العربية تلقائيًا عبر جدول التحويل المعتمد.
        </FeatureRow>
        <FeatureRow>
          إزالة الفراغات والرموز من قوائم البنوك لمطابقتها مع الحقل
          المدمج (Joined).
        </FeatureRow>
        <FeatureRow>
          عند المطابقة، يتم تمييز الصف بلون
          <span className="mx-1 inline-block h-3 w-6 rounded bg-glow align-middle shadow-glow" />
          أخضر فاتح (Bright Green).
        </FeatureRow>
      </PhaseCard>
    </div>
  );
}

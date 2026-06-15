import { Database } from "lucide-react";
import { PhaseCard, FeatureRow } from "@/components/PhaseCard";

export default function CheckingPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">التشيك</h1>
        <p className="text-sm text-muted">
          إدارة قاعدة البيانات الرئيسية للوحات المسجَّلة.
        </p>
      </div>

      <PhaseCard icon={Database} title="قاعدة البيانات الرئيسية" phase="المرحلة الرابعة">
        <FeatureRow>
          عرض وإدارة أكثر من 50,000 سجل لوحة بكفاءة (تمرير افتراضي + بحث
          فوري).
        </FeatureRow>
        <FeatureRow>
          تمييز الصفوف المكررة تلقائيًا بلون
          <span className="mx-1 inline-block h-3 w-6 rounded bg-alert align-middle" />
          برتقالي أو
          <span className="mx-1 inline-block h-3 w-6 rounded bg-danger align-middle" />
          أحمر عند تكرار رقم اللوحة.
        </FeatureRow>
        <FeatureRow>
          تصدير البيانات إلى ملف Excel بالأعمدة المطلوبة (رقم اللوحة، نوع
          السيارة، الشارع، الحي، التاريخ، رابط الموقع).
        </FeatureRow>
      </PhaseCard>
    </div>
  );
}

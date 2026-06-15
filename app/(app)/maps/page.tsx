import { MapPin } from "lucide-react";
import { PhaseCard, FeatureRow } from "@/components/PhaseCard";

export default function MapsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">الخرائط</h1>
        <p className="text-sm text-muted">
          عرض مسارات العمل ونقاط التسجيل وخرائط الكثافة.
        </p>
      </div>

      <PhaseCard icon={MapPin} title="خرائط الميدان" phase="المرحلة الثانية والرابعة">
        <FeatureRow>
          عرض جميع نقاط التسجيل (التلقائية واليدوية) على خريطة تفاعلية.
        </FeatureRow>
        <FeatureRow>
          تجميع النقاط (Clustering) عبر Google Maps أو Mapbox عند التكبير
          والتصغير.
        </FeatureRow>
        <FeatureRow>
          خرائط حرارية (Heatmaps) لإظهار أكثر المناطق تغطية ميدانية.
        </FeatureRow>
      </PhaseCard>
    </div>
  );
}

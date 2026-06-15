import { Mic, MapPin, Sparkles } from "lucide-react";
import { PhaseCard, FeatureRow } from "@/components/PhaseCard";
import PlateBadge from "@/components/PlateBadge";

export default function RegistrationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-bold text-ink">التسجيل</h1>
        <p className="text-sm text-muted">
          التسجيل الصوتي وتحديد الموقع للوحات المركبات.
        </p>
      </div>

      <PhaseCard icon={Mic} title="المسجل الصوتي" phase="المرحلة الثانية">
        <FeatureRow>
          تسجيل صوتي عالي الجودة عبر Web Audio API، يُحفظ مباشرة في
          IndexedDB.
        </FeatureRow>
        <FeatureRow>
          العمل بدون إنترنت بالكامل — مزامنة تلقائية مع Supabase عند توفر
          الشبكة.
        </FeatureRow>
        <FeatureRow>
          أدوات تشغيل بسرعات متعددة (0.5x، 1x، 1.5x، 2x) للمراجعة السريعة.
        </FeatureRow>
      </PhaseCard>

      <PhaseCard icon={MapPin} title="تحديد الموقع" phase="المرحلة الثانية">
        <FeatureRow>
          تتبع تلقائي لموقع GPS كل 5 ثوانٍ في الخلفية.
        </FeatureRow>
        <FeatureRow>
          زر دبوس يدوي (بنمط السبحة) لتحديد موقع سيارة معينة بدقة.
        </FeatureRow>
        <FeatureRow>
          كل تسجيل يُوسم تلقائيًا بالوقت الدقيق والإحداثيات واسم الشارع
          والحي عبر Geocoding.
        </FeatureRow>
      </PhaseCard>

      <PhaseCard
        icon={Sparkles}
        title="التفريغ الذكي للوحات"
        phase="المرحلة الثالثة"
      >
        <FeatureRow>
          تفريغ صوتي عبر Whisper مع التعرف على صيغة اللوحة السعودية (3
          حروف + 4 أرقام).
        </FeatureRow>
        <FeatureRow>
          تحويل النتيجة إلى صيغة مدمجة بدون فراغات، مثال:
        </FeatureRow>
        <div className="flex items-center justify-center py-2">
          <PlateBadge value="أبح1234" size="sm" />
        </div>
        <FeatureRow>
          ذكر نوع المركبة فقط عند نطقه (ونيت، فان، دباب، مصدومة).
        </FeatureRow>
      </PhaseCard>
    </div>
  );
}

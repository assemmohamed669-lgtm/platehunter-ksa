import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — قناص اللوحات",
  description: "سياسة الخصوصية لتطبيق قناص اللوحات (PlateHunter KSA)",
};

const UPDATED = "20 يوليو 2026";
const CONTACT_EMAIL = "asem.aly@arabnation.com";
const CONTACT_WHATSAPP = "+966 56 024 5919";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-2xl px-5 py-10 flex flex-col gap-7">
      <header className="flex flex-col gap-1 border-b border-border pb-5">
        <h1 className="text-2xl font-black text-ink">سياسة الخصوصية</h1>
        <p className="text-sm text-muted">تطبيق «قناص اللوحات» — PlateHunter KSA</p>
        <p className="text-xs text-muted">آخر تحديث: {UPDATED}</p>
      </header>

      <Section title="من نحن">
        <p>
          «قناص اللوحات» تطبيق ميداني مُوجّه لفرق ومقدّمي خدمات استرداد المركبات
          في المملكة العربية السعودية. يساعد المستخدم (المندوب) على فرز قوائم
          اللوحات ومقارنتها وتشييكها ميدانياً. هذه السياسة توضّح البيانات التي
          نجمعها وكيف نستخدمها ونحميها.
        </p>
      </Section>

      <Section title="البيانات التي نجمعها">
        <ul className="list-disc pr-5 flex flex-col gap-1.5">
          <li><b className="text-ink">بيانات الحساب:</b> البريد الإلكتروني وبيانات تسجيل الدخول، لإنشاء حساب المندوب والتحقق منه.</li>
          <li><b className="text-ink">الموقع الجغرافي (GPS):</b> يُلتقط عند تشييك أو تسجيل لوحة، لربط كل لوحة بموقعها على الخريطة. لا نتتبّع موقعك في الخلفية.</li>
          <li><b className="text-ink">الميكروفون (الصوت):</b> يُستخدم عند التشييك الصوتي لتفريغ رقم اللوحة الذي تنطقه. لا نسجّل صوتاً دون تفعيلك للميزة.</li>
          <li><b className="text-ink">الكاميرا والصور:</b> تُستخدم عند تصوير اللوحة لقراءتها آلياً. لا نصل للكاميرا إلا عند استخدامك لهذه الميزة.</li>
          <li><b className="text-ink">بيانات العمل:</b> ملفات وقوائم اللوحات التي ترفعها، ونتائج الفرز والتشييك التي تنشئها داخل التطبيق.</li>
        </ul>
      </Section>

      <Section title="كيف نستخدم البيانات">
        <ul className="list-disc pr-5 flex flex-col gap-1.5">
          <li>تشغيل خدمات الفرز والتشييك (اليدوي والصوتي وبالكاميرا) وربط اللوحات بمواقعها.</li>
          <li>تحسين دقة قراءة اللوحات والتعرّف الصوتي.</li>
          <li>إدارة الاشتراك والتحقق من صلاحية الوصول.</li>
        </ul>
        <p>لا نبيع بياناتك الشخصية ولا نستخدمها للإعلانات.</p>
      </Section>

      <Section title="المشاركة مع أطراف ثالثة">
        <p>نشارك الحد الأدنى من البيانات مع مزوّدي خدمة موثوقين لتشغيل التطبيق فقط:</p>
        <ul className="list-disc pr-5 flex flex-col gap-1.5">
          <li><b className="text-ink">Supabase:</b> المصادقة وتخزين بيانات الحساب والسجلات.</li>
          <li><b className="text-ink">Vercel:</b> استضافة التطبيق والواجهة الخلفية.</li>
          <li><b className="text-ink">خدمات التفريغ الصوتي وقراءة الصور</b> (مثل Deepgram / Speechmatics / Groq / Anthropic): تُرسَل مقاطع الصوت أو صور اللوحة لمعالجتها وإرجاع النص فقط.</li>
        </ul>
        <p>لا تُستخدم هذه البيانات من قبل هذه الجهات لأغراض غير معالجة الطلب.</p>
      </Section>

      <Section title="الأذونات على جهازك">
        <p>
          يطلب التطبيق أذونات: <b className="text-ink">الموقع</b> و<b className="text-ink">الميكروفون</b> و<b className="text-ink">الكاميرا</b> —
          كلٌّ للغرض الموضّح أعلاه فقط. يمكنك رفض أو سحب أي إذن في أي وقت من
          إعدادات الهاتف، مع العلم أن الميزة المرتبطة به قد تتوقف عن العمل.
        </p>
      </Section>

      <Section title="التخزين والاحتفاظ">
        <p>
          تُخزَّن بعض البيانات محلياً على جهازك (لعمل التطبيق دون إنترنت) وبعضها
          على خوادم Supabase. نحتفظ بالبيانات طوال فترة استخدامك للخدمة، وتُحذف
          عند طلبك حذف الحساب.
        </p>
      </Section>

      <Section title="الأمان">
        <p>
          الاتصالات مشفّرة (HTTPS)، والوصول للبيانات مقيّد بالحساب. ورغم اتخاذنا
          إجراءات حماية معقولة، لا يمكن ضمان أمان مطلق لأي نظام.
        </p>
      </Section>

      <Section title="حقوقك وحذف الحساب">
        <p>
          يحق لك طلب الاطّلاع على بياناتك أو تصحيحها أو حذف حسابك وبياناته. لطلب
          الحذف، تواصل معنا عبر البيانات أدناه وسنعالج الطلب خلال مدة معقولة.
        </p>
      </Section>

      <Section title="الأطفال">
        <p>الخدمة موجّهة للاستخدام المهني (B2B) من قبل بالغين، وليست مخصّصة للأطفال دون 18 عاماً.</p>
      </Section>

      <Section title="التغييرات على هذه السياسة">
        <p>قد نحدّث هذه السياسة من وقت لآخر، وسننشر أي تعديل على هذه الصفحة مع تحديث تاريخ «آخر تحديث».</p>
      </Section>

      <Section title="التواصل">
        <p>لأي استفسار أو طلب متعلق بالخصوصية:</p>
        <ul className="list-disc pr-5 flex flex-col gap-1.5">
          <li>واتساب: <span dir="ltr">{CONTACT_WHATSAPP}</span></li>
          <li>البريد الإلكتروني: <span dir="ltr">{CONTACT_EMAIL}</span></li>
        </ul>
      </Section>
    </main>
  );
}

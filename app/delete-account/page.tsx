import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "طلب حذف الحساب — قناص اللوحات",
  description: "كيفية طلب حذف حسابك وبياناتك في تطبيق قناص اللوحات (PlateHunter KSA)",
};

const UPDATED = "22 يوليو 2026";
const CONTACT_EMAIL = "asem.aly@arabnation.com";
const CONTACT_WHATSAPP = "+966 56 377 4086";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <div className="flex flex-col gap-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function DeleteAccountPage() {
  return (
    <main dir="rtl" className="mx-auto max-w-2xl px-5 py-10 flex flex-col gap-7">
      <header className="flex flex-col gap-1 border-b border-border pb-5">
        <h1 className="text-2xl font-black text-ink">طلب حذف الحساب والبيانات</h1>
        <p className="text-sm text-muted">تطبيق «قناص اللوحات» — PlateHunter KSA</p>
        <p className="text-xs text-muted">آخر تحديث: {UPDATED}</p>
      </header>

      <Section title="كيف تطلب حذف حسابك">
        <p>
          يمكنك طلب حذف حسابك وكل البيانات المرتبطة به في أي وقت. أرسل لنا طلباً عبر
          إحدى الطرق التالية، من البريد أو الرقم المسجّل باسمك، واذكر إيميل حسابك:
        </p>
        <ul className="list-disc pr-5 flex flex-col gap-1.5">
          <li>واتساب: <span dir="ltr">{CONTACT_WHATSAPP}</span></li>
          <li>البريد الإلكتروني: <span dir="ltr">{CONTACT_EMAIL}</span></li>
        </ul>
        <p>اكتب في الرسالة: «أرغب في حذف حسابي وبياناتي في تطبيق قناص اللوحات» + إيميل الحساب.</p>
      </Section>

      <Section title="ما الذي سيتم حذفه">
        <ul className="list-disc pr-5 flex flex-col gap-1.5">
          <li>حساب المستخدم وبيانات تسجيل الدخول (البريد الإلكتروني).</li>
          <li>سجلات التشييك الميداني المرتبطة بالحساب.</li>
          <li>الملفات والقوائم التي رفعها المستخدم والإعدادات المحفوظة.</li>
          <li>بيانات الموقع المخزّنة المرتبطة بالحساب.</li>
        </ul>
      </Section>

      <Section title="المدة">
        <p>
          تتم معالجة طلب الحذف خلال مدة معقولة (عادةً حتى 30 يوماً). قد نحتفظ بحدٍّ أدنى
          من البيانات فقط عند وجود التزام قانوني يقتضي ذلك، ثم تُحذف بعد انتهائه.
        </p>
      </Section>

      <Section title="التواصل">
        <p>لأي استفسار متعلق بحذف الحساب أو الخصوصية، تواصل معنا عبر البيانات أعلاه.</p>
        <p className="text-sm">سياسة الخصوصية: <a href="/privacy" className="text-primary underline">/privacy</a></p>
      </Section>
    </main>
  );
}

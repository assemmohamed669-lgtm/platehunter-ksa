/**
 * يصنّف خطأ إنشاء المندوب (من Supabase Auth أو جدول profiles) إلى رسالة عربية
 * دقيقة. الهدف إصلاح خطأ كان يلوم «الإيميل مستخدم بالفعل» على أي تكرار — حتى لو
 * كان التكرار الحقيقي في رقم التليفون — فيربك الأدمن عند إضافة مندوب بإيميل جديد.
 *
 * @param message نص رسالة الخطأ الخام من Supabase (قد يكون فارغاً)
 * @param code كود الخطأ إن وُجد (مثل "email_exists")
 */
export function classifyAgentCreateError(message: string | null | undefined, code?: string | null): string {
  const raw = (message ?? "").trim();

  // إيميل مستخدم فعلاً — الكود الصريح أو نص Supabase المعتاد.
  if (code === "email_exists" || /already\s+(been\s+)?registered|already\s+exists/i.test(raw)) {
    return "الإيميل ده مستخدم بالفعل.";
  }

  // تكرار على قيد فريد في جدول profiles — لا نلوم الإيميل تلقائياً.
  if (/duplicate|unique/i.test(raw)) {
    if (/phone|تليفون|هاتف/i.test(raw)) return "رقم التليفون ده مستخدم بالفعل.";
    if (/email|username|إيميل|بريد/i.test(raw)) return "الإيميل ده مستخدم بالفعل.";
    return "في بيانات مكررة بالفعل (إيميل أو رقم تليفون).";
  }

  // أي خطأ آخر — نُظهر السبب الحقيقي بدل إخفائه خلف رسالة مضلّلة.
  return raw || "فشل إنشاء الحساب.";
}

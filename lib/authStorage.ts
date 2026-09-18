/**
 * تخزين جلسة الدخول (Supabase auth) في **التخزين الأصلي للتليفون** بدل تخزين
 * الويب — عشان iOS/WebKit مايمسحش الجلسة فالمندوب مايتسجّلش خروج لوحده.
 *
 * أمان الانتقال: بنستخدم Capacitor Preferences **بس لو المكوّن الأصلي موجود
 * فعلاً** (النسخة الجديدة). على الويب وعلى النسخ القديمة المنزّلة دلوقتي
 * (اللي مافيهاش المكوّن) `preferencesAvailable` = false، و supabaseClient
 * بيسيب Supabase يستخدم localStorage الافتراضي بالظبط زي ما هو — يعني **صفر
 * تغيير للمستخدمين الحاليين** لحد ما ينزّلوا النسخة الجديدة.
 *
 * أول تشغيل على النسخة الجديدة: لو Preferences فاضي بننقل الجلسة الموجودة من
 * localStorage (هجرة لمرة واحدة) عشان محدش يتسجّل خروج عند التحديث.
 */
import { Capacitor } from "@capacitor/core";

export const preferencesAvailable =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Preferences");

// استيراد كسول للمكوّن — بس على النسخة اللي فيها المكوّن الأصلي.
async function prefs() {
  const { Preferences } = await import("@capacitor/preferences");
  return Preferences;
}

function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function lsRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* تجاهل */
  }
}

/**
 * محوّل تخزين متوافق مع Supabase (بيقبل async). بيُستخدم فقط لما
 * `preferencesAvailable` = true.
 */
export const preferencesStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const P = await prefs();
      const { value } = await P.get({ key });
      if (value != null) return value;
      // هجرة لمرة واحدة: الجلسة القديمة في localStorage → التخزين الأصلي.
      const legacy = lsGet(key);
      if (legacy != null) {
        await P.set({ key, value: legacy });
        return legacy;
      }
      return null;
    } catch {
      // لو المكوّن فشل لأي سبب — نرجع لـlocalStorage عشان الدخول مايتكسرش.
      return lsGet(key);
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const P = await prefs();
      await P.set({ key, value });
    } catch {
      try {
        if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      } catch {
        /* تجاهل */
      }
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const P = await prefs();
      await P.remove({ key });
    } catch {
      /* تجاهل */
    }
    // نمسح النسخة القديمة كمان (لو كانت اتهاجرت).
    lsRemove(key);
  },
};

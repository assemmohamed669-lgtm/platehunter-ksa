/**
 * تخزين جلسة الدخول (Supabase auth) في **التخزين الأصلي للتليفون** (Preferences)
 * عشان iOS/WebKit مايمسحش الجلسة فالمندوب مايتسجّلش خروج لوحده.
 *
 * التصميم مضاد للتعليق:
 *  - كل نداء للمكوّن الأصلي عليه **مهلة أمان** — لو ماردّش بسرعة (أو المكوّن
 *    مش متظبّط في البناء) بنرجع لـlocalStorage فوراً، فالتطبيق **مايعلّقش أبداً**
 *    على شاشة «جاري التحميل».
 *  - بنكتب في **الاتنين** (localStorage فوري + Preferences في الخلفية): كده
 *    الجلسة دايماً موجودة قصير المدى، ولو iOS مسح localStorage تفضل في التخزين
 *    الأصلي (getItem بيفضّله).
 *
 * على الويب والنسخ القديمة (مافيش المكوّن) `preferencesAvailable` = false،
 * و supabaseClient بيسيب Supabase يستخدم localStorage الافتراضي زي ما هو.
 */
import { Capacitor } from "@capacitor/core";

export const preferencesAvailable =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Preferences");

const TIMEOUT_MS = 1500;

// بيرجّع fallback لو الوعد ماخلصش في الوقت المحدد أو رمى — مايعلّقش المستدعي.
function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: T) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const t = setTimeout(() => done(fallback), TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(t);
        done(v);
      },
      () => {
        clearTimeout(t);
        done(fallback);
      },
    );
  });
}

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
function lsSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    /* تجاهل */
  }
}
function lsRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    /* تجاهل */
  }
}

// نداءات المكوّن الأصلي — كلها مغلّفة بمهلة، فمفيش نداء يقدر يعلّق التطبيق.
async function prefGet(key: string): Promise<string | null> {
  return withTimeout(
    (async () => {
      const P = await prefs();
      const { value } = await P.get({ key });
      return value ?? null;
    })(),
    null,
  );
}
function prefSet(key: string, value: string): void {
  void withTimeout(
    (async () => {
      try {
        const P = await prefs();
        await P.set({ key, value });
      } catch {
        /* تجاهل */
      }
    })(),
    undefined,
  );
}
function prefRemove(key: string): void {
  void withTimeout(
    (async () => {
      try {
        const P = await prefs();
        await P.remove({ key });
      } catch {
        /* تجاهل */
      }
    })(),
    undefined,
  );
}

/**
 * محوّل تخزين متوافق مع Supabase — يُستخدم فقط لما preferencesAvailable = true.
 *
 * **localStorage-first** في القراءة: الفتح العادي بيلاقي الجلسة في localStorage
 * فيرجّعها **فوراً** (فتح سريع، مافيش انتظار للمكوّن الأصلي). التخزين الأصلي
 * بيُقرأ **بس لو localStorage فاضي** — يعني iOS مسحه، وهي الحالة النادرة اللي
 * عايزين نغطّيها. الكتابة بتروح للاتنين، فالتخزين الأصلي دايماً فيه نسخة
 * للاسترجاع بعد المسح.
 */
export const preferencesStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = lsGet(key);
    if (local != null) {
      prefSet(key, local); // خلفية: اضمن نسخة أصلية للاسترجاع بعد مسح iOS
      return local;
    }
    // localStorage فاضي (غالباً iOS مسحه) → استرجع من التخزين الأصلي (بمهلة).
    const fromPref = await prefGet(key);
    if (fromPref != null) lsSet(key, fromPref);
    return fromPref;
  },
  async setItem(key: string, value: string): Promise<void> {
    lsSet(key, value); // فوري — الجلسة دايماً موجودة قصير المدى.
    prefSet(key, value); // في الخلفية — يعيش عبر مسح iOS.
  },
  async removeItem(key: string): Promise<void> {
    lsRemove(key);
    prefRemove(key);
  },
};

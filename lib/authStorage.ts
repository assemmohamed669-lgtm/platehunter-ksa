/**
 * تخزين جلسة الدخول (Supabase auth) في **ملف على ذاكرة التليفون الدائمة** عبر
 * مكوّن @capacitor/filesystem — عشان iOS/WebKit مايمسحش الجلسة فالمندوب مايتسجّلش
 * خروج لوحده.
 *
 * ليه Filesystem مش Preferences: مكوّن Filesystem **مربوط وشغّال بالفعل** في كل
 * البناءات (بنستخدمه لفتح الإكسل)، بينما Preferences مكانش بيترابط في إعداد iOS
 * (SPM). فده بيشتغل **بلا بناء جديد** — بيوصل عبر Vercel للنسخة الموجودة.
 *
 * التصميم مضاد للتعليق:
 *  - كل نداء للمكوّن عليه **مهلة أمان** — لو ماردّش يرجع لـlocalStorage فوراً،
 *    فالتطبيق مايعلّقش على «جاري التحميل».
 *  - **localStorage-first** في القراءة: الفتح العادي بيرجّع من localStorage فوراً
 *    (سريع)؛ الملف بيُقرأ بس لو localStorage فاضي (iOS مسحه). الكتابة في الاتنين.
 *
 * على الويب والنسخ اللي مافيهاش المكوّن: `nativeStorageAvailable` = false،
 * و supabaseClient بيسيب Supabase يستخدم localStorage الافتراضي زي ما هو.
 */
import { Capacitor } from "@capacitor/core";

export const nativeStorageAvailable =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Filesystem");

const TIMEOUT_MS = 2500;

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
      (v) => { clearTimeout(t); done(v); },
      () => { clearTimeout(t); done(fallback); },
    );
  });
}

async function fsMod() {
  return import("@capacitor/filesystem");
}

// اسم ملف آمن لكل مفتاح جلسة.
function fileNameFor(key: string): string {
  return "authstore_" + key.replace(/[^a-zA-Z0-9._-]/g, "_") + ".txt";
}

function lsGet(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(key, value); } catch { /* */ }
}
function lsRemove(key: string): void {
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(key); } catch { /* */ }
}

async function fileGet(key: string): Promise<string | null> {
  return withTimeout(
    (async (): Promise<string | null> => {
      try {
        const { Filesystem, Directory, Encoding } = await fsMod();
        const res = await Filesystem.readFile({ path: fileNameFor(key), directory: Directory.Data, encoding: Encoding.UTF8 });
        return typeof res.data === "string" ? res.data : null;
      } catch {
        return null; // الملف مش موجود أو خطأ — نرجع فاضي
      }
    })(),
    null,
  );
}
function fileSet(key: string, value: string): void {
  void withTimeout(
    (async () => {
      try {
        const { Filesystem, Directory, Encoding } = await fsMod();
        await Filesystem.writeFile({ path: fileNameFor(key), directory: Directory.Data, encoding: Encoding.UTF8, data: value });
      } catch { /* */ }
    })(),
    undefined,
  );
}
function fileRemove(key: string): void {
  void withTimeout(
    (async () => {
      try {
        const { Filesystem, Directory } = await fsMod();
        await Filesystem.deleteFile({ path: fileNameFor(key), directory: Directory.Data });
      } catch { /* */ }
    })(),
    undefined,
  );
}

/**
 * اختبار ذاتي: بيكتب/يقرا/يمسح ملف — عشان نتأكد إن المكوّن شغّال في البناء.
 * "ok" شغّال · "hang" مش بيردّ · "error"/"n/a" مش متاح.
 */
export async function nativeStorageSelfTest(): Promise<"ok" | "hang" | "error" | "n/a"> {
  if (!nativeStorageAvailable) return "n/a";
  const key = "__pk_selftest__";
  const val = String(Date.now());
  return withTimeout(
    (async (): Promise<"ok" | "error"> => {
      try {
        const { Filesystem, Directory, Encoding } = await fsMod();
        await Filesystem.writeFile({ path: fileNameFor(key), directory: Directory.Data, encoding: Encoding.UTF8, data: val });
        const res = await Filesystem.readFile({ path: fileNameFor(key), directory: Directory.Data, encoding: Encoding.UTF8 });
        await Filesystem.deleteFile({ path: fileNameFor(key), directory: Directory.Data });
        return res.data === val ? "ok" : "error";
      } catch {
        return "error";
      }
    })(),
    "hang",
  );
}

/**
 * محوّل تخزين متوافق مع Supabase — يُستخدم فقط لما nativeStorageAvailable = true.
 * localStorage-first في القراءة (فتح سريع)، والملف نسخة دائمة تعيش عبر مسح iOS.
 */
export const nativeSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = lsGet(key);
    if (local != null) {
      fileSet(key, local); // خلفية: اضمن نسخة في الملف للاسترجاع بعد مسح iOS
      return local;
    }
    const fromFile = await fileGet(key);
    if (fromFile != null) lsSet(key, fromFile);
    return fromFile;
  },
  async setItem(key: string, value: string): Promise<void> {
    lsSet(key, value);
    fileSet(key, value);
  },
  async removeItem(key: string): Promise<void> {
    lsRemove(key);
    fileRemove(key);
  },
};
